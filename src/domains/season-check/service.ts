import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AccessError, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { isLocale, type Locale } from "../../lib/locale";
import { seasonCheckCopy } from "./check-copy";
import { brusselsDay } from "../../lib/today";

/**
 * 8 (part 2): the start-of-season check. A check per club and season,
 * launched by the president (Réglages › Saisons et équipes) or by itself
 * when a season starts. Each autonomous adult player and each legal
 * representative of a minor sees, at sign-in, « Vos informations sont-elles
 * toujours exactes ? » for each person in their care: contacts, emergency
 * contact, care notes (only for whom may read and change them: the person,
 * or the minor's representative), consent, documents expiring this season.
 * « Me le rappeler plus tard » once; after the delay the screen comes back
 * at each sign-in, without ever blocking the answers to invitations.
 */
export const seasonCheckCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), profileId: z.uuid() }),
  z.object({ action: z.literal("postpone") }),
  z.object({ action: z.literal("launch"), graceDays: z.number().int().min(1).max(90).optional() }),
  z.object({ action: z.literal("remind"), profileIds: z.array(z.uuid()).min(1).max(500) }),
]);
export type SeasonCheckCommand = z.infer<typeof seasonCheckCommand>;

type Ctx = { c: PoolClient; org: string; userId: string; role: string; rights: string[] };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Ctx) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query(write ? "BEGIN" : "BEGIN READ ONLY");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, role: a.role, rights: permissions(a.role, a.grants) });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
/** The club's check of the current season, if any. */
async function currentCheck(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT k.id,k.launched_at,k.grace_days,s.name AS season,s.ends_on::text AS ends_on FROM season_check k JOIN season s ON s.id=k.season_id
        WHERE k.organization_id=$1 AND CURRENT_DATE BETWEEN s.starts_on AND s.ends_on ORDER BY k.launched_at DESC LIMIT 1`,
      [org],
    )
  ).rows[0] as { id: string; launched_at: Date; grace_days: number; season: string; ends_on: string } | undefined;
}
/**
 * The people a signed-in person answers for: his own file if he is an adult
 * player, and the minors whose legal representative he is (verified link).
 */
async function inCare(c: PoolClient, org: string, userId: string) {
  return (
    await c.query(
      `SELECT DISTINCT cp.id,cp.full_name FROM club_person cp JOIN person pe ON pe.id=cp.person_id
        WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles) AND pe.user_id=$2 AND cp.birth_date<=CURRENT_DATE-interval '18 years'
       UNION
       SELECT DISTINCT s.id,s.full_name FROM guardian_relationship g JOIN club_person me ON me.id=g.guardian_profile_id JOIN person pe ON pe.id=me.person_id JOIN club_person s ON s.id=g.subject_profile_id
        WHERE g.organization_id=$1 AND pe.user_id=$2 AND g.kind='legal_verified' AND g.revoked_at IS NULL AND g.can_edit
          AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND s.status='active' AND s.birth_date>CURRENT_DATE-interval '18 years'
       ORDER BY 2`,
      [org, userId],
    )
  ).rows as { id: string; full_name: string }[];
}

/** What the signed-in person still has to check, with the data prefilled. */
export async function myChecks(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const check = await currentCheck(s.c, s.org);
    if (!check) return { organizationId: s.org, season: null, people: [], postponable: false, show: false };
    const people = [];
    let postponed: Date | null = null;
    for (const person of await inCare(s.c, s.org, s.userId)) {
      const answer = (await s.c.query("SELECT verified_at,postponed_at FROM season_check_answer WHERE check_id=$1 AND profile_id=$2", [check.id, person.id])).rows[0];
      if (answer?.verified_at) continue;
      if (answer?.postponed_at) postponed = answer.postponed_at;
      const file = (
        await s.c.query(
          `SELECT cp.email,cp.phone,cp.public_name_consent,sp.emergency_contact,sp.support_needs,sp.safety_notes
             FROM club_person cp LEFT JOIN player_support_profile sp ON sp.profile_id=cp.id AND sp.organization_id=cp.organization_id WHERE cp.id=$1 AND cp.organization_id=$2`,
          [person.id, s.org],
        )
      ).rows[0];
      const expiring = (
        await s.c.query(
          "SELECT id,name,expires_on::text AS expires_on FROM club_document WHERE organization_id=$1 AND profile_id=$2 AND status IN ('valid','uploaded','review') AND expires_on IS NOT NULL AND expires_on<=$3::date ORDER BY expires_on LIMIT 10",
          [s.org, person.id, check.ends_on],
        )
      ).rows as { id: string; name: string; expires_on: string }[];
      people.push({
        profileId: person.id,
        name: person.full_name,
        contacts: { email: (file?.email as string | null) ?? "", phone: (file?.phone as string) ?? "" },
        emergency: (file?.emergency_contact as string | null) ?? "",
        // The person himself, or the minor's legal representative: those may read and change the care notes.
        care: { needs: (file?.support_needs as string | null) ?? "", safety: (file?.safety_notes as string | null) ?? "" },
        consent: !!file?.public_name_consent,
        expiring,
      });
    }
    const deadline = new Date(new Date(check.launched_at).getTime() + check.grace_days * 86400000);
    const postponable = !postponed && people.length > 0;
    // Postponed once: hidden until the delay is over, then back at each sign-in.
    const show = people.length > 0 && (!postponed || Date.now() >= deadline.getTime());
    return { organizationId: s.org, season: check.season, people, postponable, show, deadline: deadline.toISOString() };
  });
}

export async function seasonCheckExecute(db: Pool, p: Principal, cmd: SeasonCheckCommand) {
  return scope(db, p, true, async (s) => {
    if (cmd.action === "launch" || cmd.action === "remind") {
      if (!(s.role === "club_president" || s.rights.includes("mandates.manage"))) throw new AccessError("FORBIDDEN");
      if (cmd.action === "launch") {
        const season = (await s.c.query("SELECT id FROM season WHERE organization_id=$1 AND CURRENT_DATE BETWEEN starts_on AND ends_on AND NOT archived ORDER BY starts_on DESC LIMIT 1", [s.org])).rows[0];
        if (!season) throw new AccessError("SEASON_REQUIRED", 400);
        const id = (
          await s.c.query(
            "INSERT INTO season_check(organization_id,season_id,launched_by,grace_days) VALUES($1,$2,$3,$4) ON CONFLICT (organization_id,season_id) DO UPDATE SET grace_days=EXCLUDED.grace_days RETURNING id",
            [s.org, season.id, s.userId, cmd.graceDays ?? 14],
          )
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "seasonCheck.launched", id);
        return { id };
      }
      const check = await currentCheck(s.c, s.org);
      if (!check) throw new AccessError("NOT_FOUND", 404);
      let sent = 0;
      for (const profileId of cmd.profileIds) sent += await remind(s.c, s.org, check.id, profileId, check.season);
      return { sent };
    }
    const check = await currentCheck(s.c, s.org);
    if (!check) throw new AccessError("NOT_FOUND", 404);
    const mine = await inCare(s.c, s.org, s.userId);
    if (cmd.action === "postpone") {
      // Once a season: the people still to check, together.
      const already = (await s.c.query("SELECT 1 FROM season_check_answer WHERE check_id=$1 AND profile_id=ANY($2::uuid[]) AND postponed_at IS NOT NULL", [check.id, mine.map((x) => x.id)])).rowCount;
      if (already) throw new AccessError("ALREADY_POSTPONED", 409);
      for (const x of mine)
        await s.c.query(
          "INSERT INTO season_check_answer(check_id,organization_id,profile_id,postponed_at,postponed_by) VALUES($1,$2,$3,now(),$4) ON CONFLICT (check_id,profile_id) DO UPDATE SET postponed_at=COALESCE(season_check_answer.postponed_at,now()),postponed_by=COALESCE(season_check_answer.postponed_by,EXCLUDED.postponed_by)",
          [check.id, s.org, x.id, s.userId],
        );
      return { ok: true };
    }
    if (!mine.some((x) => x.id === cmd.profileId)) throw new AccessError("FORBIDDEN");
    await s.c.query(
      "INSERT INTO season_check_answer(check_id,organization_id,profile_id,verified_at,verified_by) VALUES($1,$2,$3,now(),$4) ON CONFLICT (check_id,profile_id) DO UPDATE SET verified_at=now(),verified_by=EXCLUDED.verified_by",
      [check.id, s.org, cmd.profileId, s.userId],
    );
    // The date of the check on the file, and in the journal.
    await audit(s.c, s.org, s.userId, "seasonCheck.verified", cmd.profileId, { season: check.season });
    return { ok: true };
  });
}

/** The club's follow-up: « Vérifié / Pas encore » per player of the season. */
export async function seasonCheckView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    if (!(s.role === "club_president" || s.rights.includes("mandates.manage") || s.rights.includes("people.manage"))) throw new AccessError("FORBIDDEN");
    const check = await currentCheck(s.c, s.org);
    const players = (
      await s.c.query(
        `SELECT cp.id,cp.full_name,a.verified_at,a.postponed_at,a.reminded_at,u.name AS verified_by
           FROM club_person cp LEFT JOIN season_check_answer a ON a.profile_id=cp.id AND a.check_id=$2 LEFT JOIN "user" u ON u.id=a.verified_by
          WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles) ORDER BY cp.full_name`,
        [s.org, check?.id ?? null],
      )
    ).rows as { id: string; full_name: string; verified_at: Date | null; postponed_at: Date | null; reminded_at: Date | null; verified_by: string | null }[];
    return {
      organizationId: s.org,
      check: check ? { season: check.season, launchedAt: new Date(check.launched_at).toISOString(), graceDays: check.grace_days } : null,
      players: players.map((x) => ({ id: x.id, name: x.full_name, verifiedAt: x.verified_at ? new Date(x.verified_at).toISOString() : null, verifiedBy: x.verified_by, postponed: !!x.postponed_at, remindedAt: x.reminded_at ? new Date(x.reminded_at).toISOString() : null })),
    };
  });
}

/** One reminder by email to whom answers for the player (himself, or his representatives), at most once a day. */
async function remind(c: PoolClient, org: string, checkId: string, profileId: string, season: string) {
  const answer = (await c.query("SELECT verified_at,reminded_at FROM season_check_answer WHERE check_id=$1 AND profile_id=$2", [checkId, profileId])).rows[0];
  if (answer?.verified_at || (answer?.reminded_at && Date.now() - new Date(answer.reminded_at).getTime() < 86400000)) return 0;
  const to = (
    await c.query(
      `SELECT u.id,u.name,u.email,COALESCE(pe.locale,'fr') AS locale,o.name AS club FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=cp.organization_id
        WHERE cp.id=$1 AND cp.organization_id=$2 AND cp.birth_date<=CURRENT_DATE-interval '18 years'
       UNION
       SELECT u.id,u.name,u.email,COALESCE(pe.locale,'fr'),o.name FROM guardian_relationship g JOIN club_person me ON me.id=g.guardian_profile_id JOIN person pe ON pe.id=me.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=g.organization_id
        WHERE g.subject_profile_id=$1 AND g.organization_id=$2 AND g.kind='legal_verified' AND g.revoked_at IS NULL`,
      [profileId, org],
    )
  ).rows as { id: string; name: string; email: string; locale: string; club: string }[];
  const base = process.env.BETTER_AUTH_URL ?? "";
  for (const u of to) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    const t = seasonCheckCopy[locale];
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "administrative",
      resourceType: "automation",
      resourceId: `season-check:${checkId}`,
      eventKey: `season-check:${checkId}:${profileId}:${u.id}:${brusselsDay()}`,
      locale,
      variables: { name: u.name, title: t.mailTitle.replace("{season}", season), message: t.mailText.replace("{season}", season), organization: u.club, url: `${base}/${locale}` },
    });
  }
  await c.query(
    "INSERT INTO season_check_answer(check_id,organization_id,profile_id,reminded_at) VALUES($1,$2,$3,now()) ON CONFLICT (check_id,profile_id) DO UPDATE SET reminded_at=now()",
    [checkId, org, profileId],
  );
  return to.length ? 1 : 0;
}

/** When a season starts, its check opens by itself (for clubs that have players). */
export async function seasonCheckTick(db: Pool) {
  const r = await db.query(
    `INSERT INTO season_check(organization_id,season_id)
     SELECT s.organization_id,s.id FROM season s
      WHERE NOT s.archived AND s.starts_on<=CURRENT_DATE AND s.starts_on>CURRENT_DATE-30 AND s.ends_on>=CURRENT_DATE
        AND EXISTS (SELECT 1 FROM club_person cp WHERE cp.organization_id=s.organization_id AND cp.status='active' AND 'player'=ANY(cp.directory_roles))
     ON CONFLICT (organization_id,season_id) DO NOTHING`,
  );
  return r.rowCount ?? 0;
}
