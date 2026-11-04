import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { account, AccessError, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { audience, canRead, ownProfiles, type Actor, type Event } from "../calendar/access";
import { mayRespond } from "../attendance/access";
import type { AuthorizationKind } from "../authorizations/authorization-copy";

/**
 * 27 and 29: « Ma famille ». A parent's children gathered across every club
 * where the account answers for them (a guardian or player mandate), each
 * club's data read with that club's own rights and kept in its own group:
 * the next events with each child's answer (and who gave it), the
 * authorizations to sign, the dues with the parent's share.
 * Reading only; every answer goes through the club's usual commands, in its
 * context.
 */
type Mandate = Actor & { club: string };
const horizonDays = 60;

/** The account's current player or guardian mandates in clubs, one per club. */
async function familyMandates(c: PoolClient, userId: string) {
  const rows = (
    await c.query(
      `SELECT r.*,u."twoFactorEnabled",o.name AS club FROM role_assignment r JOIN organization o ON o.id=r.organization_id AND o.kind='club'
         JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id
        WHERE r.user_id=$1 AND r.role IN ('guardian','player') AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
        ORDER BY o.name,CASE r.role WHEN 'guardian' THEN 0 ELSE 1 END`,
      [userId],
    )
  ).rows as Mandate[];
  const one = new Map<string, Mandate>();
  for (const r of rows) if (!one.has(r.organization_id)) one.set(r.organization_id, r);
  return [...one.values()];
}

/** The children a mandate answers for in its club (not the account's own file). */
async function childrenOf(c: PoolClient, a: Mandate) {
  const own = [...(await ownProfiles(c, a))];
  if (!own.length) return [];
  return (
    await c.query(
      `SELECT cp.id,cp.full_name,split_part(cp.full_name,' ',1) AS first FROM club_person cp JOIN person pe ON pe.id=cp.person_id
        WHERE cp.id=ANY($1::uuid[]) AND cp.organization_id=$2 AND pe.user_id IS DISTINCT FROM $3 ORDER BY cp.full_name`,
      [own, a.organization_id, a.user_id],
    )
  ).rows as { id: string; full_name: string; first: string }[];
}

async function tx<T>(db: Pool, p: Principal, fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await account(c, p);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** The children only, for the switcher at the top of « Mon espace ». */
export async function familyChildren(db: Pool, p: Principal) {
  return tx(db, p, async (c) => {
    const out: { id: string; name: string; first: string; organizationId: string; club: string }[] = [];
    for (const a of await familyMandates(c, p.userId))
      for (const k of await childrenOf(c, a)) out.push({ id: k.id, name: k.full_name, first: k.first, organizationId: a.organization_id, club: a.club });
    return { children: out };
  });
}

export async function familyView(db: Pool, p: Principal) {
  return tx(db, p, async (c) => {
    const selected = (
      await c.query("SELECT organization_id FROM active_context WHERE session_id=$1 AND user_id=$2", [p.sessionId, p.userId])
    ).rows[0]?.organization_id as string | undefined;
    const clubs = [];
    for (const a of await familyMandates(c, p.userId)) {
      const kids = await childrenOf(c, a);
      if (!kids.length) continue;
      const ids = kids.map((k) => k.id);
      // The next events concerning a child: a participant, or invited to answer.
      const rows = (
        await c.query(
          `SELECT e.*,t.name AS team_name,pl.name AS place_name FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id LEFT JOIN calendar_place pl ON pl.id=e.place_id
            WHERE e.organization_id=$1 AND e.ends_at>now() AND e.starts_at<now()+interval '${horizonDays} days' AND e.status='scheduled' ORDER BY e.starts_at,e.id LIMIT 200`,
          [a.organization_id],
        )
      ).rows as (Event & { team_name: string | null; place_name: string | null })[];
      const events = [];
      for (const e of rows) {
        if (!(await canRead(c, a, e))) continue;
        const people = new Set((await audience(c, e)).map((x) => x.id as string));
        const invitations = (
          await c.query(
            `SELECT i.id,i.profile_id,i.version,i.response,i.comment,i.responded_at,u.name AS responded_by,r.deadline,r.closed_at IS NOT NULL AS closed
               FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id LEFT JOIN "user" u ON u.id=i.responded_by
              WHERE r.event_id=$1 AND i.profile_id=ANY($2::uuid[]) AND i.withdrawn_at IS NULL`,
            [e.id, ids],
          )
        ).rows as { id: string; profile_id: string; version: number; response: string; comment: string; responded_at: Date | null; responded_by: string | null; deadline: Date; closed: boolean }[];
        const concerned = kids.filter((k) => people.has(k.id) || invitations.some((i) => i.profile_id === k.id));
        if (!concerned.length) continue;
        const children = [];
        for (const k of concerned) {
          const i = invitations.find((x) => x.profile_id === k.id);
          const open = !!i && !i.closed && new Date(i.deadline) > new Date() && new Date(e.starts_at) > new Date();
          children.push({
            id: k.id,
            invitation: i
              ? {
                  id: i.id,
                  version: i.version,
                  response: i.response,
                  comment: i.comment,
                  respondedAt: i.responded_at,
                  respondedBy: i.responded_by,
                  canRespond: open && (await mayRespond(c, a, k.id, true)),
                }
              : null,
          });
        }
        events.push({
          id: e.id,
          title: e.title,
          kind: e.kind,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          team: e.team_name,
          place: e.place_name,
          children,
        });
      }
      // Authorizations of the children: what is to sign, signed or refused this season and for the coming trips.
      const authorizations = (
        await c.query(
          `SELECT r.id,r.kind,r.profile_id,r.status,r.requested_at,r.answered_at,r.document_id,d.version AS document_version,d.current_version_id,t.title AS trip,t.starts_on::text AS trip_starts_on,u.name AS answered_by
             FROM authorization_request r LEFT JOIN club_document d ON d.id=r.document_id LEFT JOIN trip t ON t.id=r.trip_id LEFT JOIN "user" u ON u.id=r.answered_by
            WHERE r.organization_id=$1 AND r.profile_id=ANY($2::uuid[]) AND r.status<>'cancelled' AND (r.trip_id IS NULL OR t.ends_on>=CURRENT_DATE-30)
            ORDER BY (r.status='requested') DESC,r.requested_at DESC LIMIT 100`,
          [a.organization_id, ids],
        )
      ).rows as {
        id: string;
        kind: AuthorizationKind;
        profile_id: string;
        status: "requested" | "signed" | "refused";
        requested_at: Date;
        answered_at: Date | null;
        document_id: string | null;
        document_version: number | null;
        current_version_id: string | null;
        trip: string | null;
        trip_starts_on: string | null;
        answered_by: string | null;
      }[];
      // The parent's share of the dues (29): the split chosen by the club, or the whole when there is none.
      const mine = (
        await c.query("SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND pe.user_id=$2", [a.organization_id, p.userId])
      ).rows.map((r) => r.id as string);
      const dues = (
        await c.query(
          `SELECT d.id,d.profile_id,d.category,se.name AS season,d.net_cents,
                  (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in') AS paid_cents,
                  (SELECT COALESCE(sum(t.amount_cents),0)::int FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in' AND t.payer_profile_id=ANY($3::uuid[])) AS paid_by_me_cents,
                  (SELECT percent FROM billing_split b WHERE b.subject_profile_id=d.profile_id AND b.guardian_profile_id=ANY($3::uuid[]) LIMIT 1) AS my_percent,
                  EXISTS(SELECT 1 FROM billing_split b WHERE b.subject_profile_id=d.profile_id) AS split
             FROM dues_receivable d JOIN season se ON se.id=d.season_id
            WHERE d.organization_id=$1 AND d.profile_id=ANY($2::uuid[]) AND d.status='open' ORDER BY se.starts_on DESC`,
          [a.organization_id, ids, mine],
        )
      ).rows as { id: string; profile_id: string; category: string; season: string; net_cents: number; paid_cents: number; paid_by_me_cents: number; my_percent: number | null; split: boolean }[];
      const off = ((await c.query("SELECT disabled_modules FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.disabled_modules ?? []) as string[];
      const me = (
        await c.query(
          "SELECT cp.email,cp.phone,cp.postal_address FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND pe.user_id=$2 ORDER BY cp.created_at LIMIT 1",
          [a.organization_id, p.userId],
        )
      ).rows[0] as { email: string | null; phone: string; postal_address: string } | undefined;
      clubs.push({
        organizationId: a.organization_id,
        me: me ? { email: me.email ?? "", phone: me.phone ?? "", address: me.postal_address } : null,
        name: a.club,
        mandateId: a.id,
        current: a.organization_id === selected,
        children: kids.map((k) => ({ id: k.id, name: k.full_name, first: k.first })),
        events,
        authorizations,
        dues: off.includes("dues")
          ? []
          : dues
              .filter((d) => !d.split || d.my_percent !== null)
              .map((d) => ({
                ...d,
                percent: d.split ? (d.my_percent as number) : 100,
                shareCents: d.split ? Math.round((d.net_cents * (d.my_percent as number)) / 100) : d.net_cents,
              })),
      });
    }
    const feed = (
      await c.query(
        "SELECT f.id,f.name,f.created_at,f.expires_at FROM calendar_feed f WHERE f.user_id=$1 AND f.family AND f.revoked_at IS NULL AND f.expires_at>now() ORDER BY f.created_at DESC LIMIT 1",
        [p.userId],
      )
    ).rows[0] ?? null;
    return { clubs, feed: feed as { id: string; name: string; created_at: Date; expires_at: Date } | null };
  });
}

/** 29: one's own contacts in a club (each representative his own e-mail, phone and address). */
export const familyCommand = z.object({
  action: z.literal("contacts"),
  organizationId: z.uuid(),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300),
});
export type FamilyCommand = z.infer<typeof familyCommand>;
export async function familyExecute(db: Pool, p: Principal, cmd: FamilyCommand) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await account(c, p);
    if (!(await familyMandates(c, p.userId)).some((m) => m.organization_id === cmd.organizationId)) throw new AccessError("FORBIDDEN");
    const changed = await c.query(
      "UPDATE club_person cp SET email=$3,phone=$4,postal_address=$5,updated_at=now(),version=version+1 FROM person pe WHERE pe.id=cp.person_id AND pe.user_id=$1 AND cp.organization_id=$2 RETURNING cp.id",
      [p.userId, cmd.organizationId, cmd.email || null, cmd.phone, cmd.address],
    );
    if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
    await audit(c, cmd.organizationId, p.userId, "people.contacts.self", changed.rows[0].id);
    await c.query("COMMIT");
    return { id: changed.rows[0].id as string };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/**
 * 29: who receives the dues and the mutual insurance attestations of a
 * child: one representative, the other, or shared by percentage (a total of
 * 100). An empty list puts back the default (each representative).
 */
export const billingSplitCommand = z.object({
  subjectId: z.uuid(),
  shares: z
    .array(z.object({ guardianId: z.uuid(), percent: z.number().int().min(1).max(100) }))
    .max(4)
    .refine((v) => new Set(v.map((s) => s.guardianId)).size === v.length),
});
export type BillingSplitCommand = z.infer<typeof billingSplitCommand>;

async function moneyScope<T>(db: Pool, p: Principal, write: boolean, fn: (c: PoolClient, org: string) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query(write ? "BEGIN" : "BEGIN READ ONLY");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const rights = permissions(a.role, a.grants);
    if (!mfaSatisfied(!!user.twoFactorEnabled) || !(rights.includes("dues.manage") || rights.includes("people.manage"))) throw new AccessError("FORBIDDEN");
    if (write) await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const out = await fn(c, a.organization_id);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
/** The child's current representatives, with their share. */
async function splitRows(c: PoolClient, org: string, subjectId: string) {
  return (
    await c.query(
      `SELECT DISTINCT ON (gp.id) gp.id,gp.full_name,b.percent FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id
         LEFT JOIN billing_split b ON b.subject_profile_id=g.subject_profile_id AND b.guardian_profile_id=gp.id
        WHERE g.organization_id=$1 AND g.subject_profile_id=$2 AND g.revoked_at IS NULL AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND gp.status='active'
        ORDER BY gp.id`,
      [org, subjectId],
    )
  ).rows as { id: string; full_name: string; percent: number | null }[];
}
export async function billingSplitView(db: Pool, p: Principal, subjectId: string) {
  z.uuid().parse(subjectId);
  return moneyScope(db, p, false, async (c, org) => {
    if (!(await c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [subjectId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    const rows = await splitRows(c, org, subjectId);
    return { guardians: rows.sort((x, y) => x.full_name.localeCompare(y.full_name)), split: rows.some((r) => r.percent !== null) };
  });
}
export async function billingSplitExecute(db: Pool, p: Principal, cmd: BillingSplitCommand) {
  return moneyScope(db, p, true, async (c, org) => {
    if (!(await c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.subjectId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    const guardians = new Set((await splitRows(c, org, cmd.subjectId)).map((g) => g.id));
    if (cmd.shares.some((s) => !guardians.has(s.guardianId))) throw new AccessError("NOT_FOUND", 404);
    if (cmd.shares.length && cmd.shares.reduce((n, s) => n + s.percent, 0) !== 100) throw new AccessError("SPLIT_TOTAL", 400);
    await c.query("DELETE FROM billing_split WHERE subject_profile_id=$1 AND organization_id=$2", [cmd.subjectId, org]);
    for (const s of cmd.shares)
      await c.query("INSERT INTO billing_split(organization_id,subject_profile_id,guardian_profile_id,percent,updated_by) VALUES($1,$2,$3,$4,$5)", [
        org,
        cmd.subjectId,
        s.guardianId,
        s.percent,
        p.userId,
      ]);
    await audit(c, org, p.userId, "dues.split", cmd.subjectId);
    return { subjectId: cmd.subjectId };
  });
}
