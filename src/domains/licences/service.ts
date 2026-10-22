import type { Pool } from "pg";
import { audit, AccessError, type Principal } from "../access/service";
import { publish } from "../notifications/queue";
import { ensureStorage } from "../storage/service";
import { brusselsToday } from "../people/service";
import { scope, type Scope } from "../tasks/service";
import { proofMaxBytes, proofType, reminderDue, safeName, type LicenceCommand } from "./schema";

/**
 * Wave 17 (O1): the driving licence of one person, seen only by that person,
 * the president and those who organise the trips (calendar.manage,
 * teams.manage). Anyone else gets « not found ».
 */
async function profileIn(s: Scope, profileId: string) {
  const row = (
    await s.c.query(
      "SELECT pe.user_id FROM club_person cp LEFT JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND cp.organization_id=$2",
      [profileId, s.org],
    )
  ).rows[0] as { user_id: string | null } | undefined;
  // One's own file only: a parent does not see their child's licence.
  const self = !!row && row.user_id === s.userId;
  if (!row || (!self && !s.manage)) throw new AccessError("NOT_FOUND", 404);
  return self;
}

export type LicenceView = {
  organization_id: string;
  licence: {
    categories: string[];
    valid_until: string | null;
    declared_by_self: boolean;
    verified_on: string | null;
    verified_by_name: string | null;
    copy_filename: string | null;
  } | null;
  can: { edit: boolean; verify: boolean };
  today: string;
};

export async function licenceView(db: Pool, p: Principal, profileId: string): Promise<LicenceView> {
  return scope(db, p, false, async (s) => {
    await profileIn(s, profileId);
    const licence =
      ((
        await s.c.query(
          `SELECT d.categories,d.valid_until::text AS valid_until,d.declared_by_self,d.verified_on::text AS verified_on,u.name AS verified_by_name,d.copy_filename
             FROM driver_licence d LEFT JOIN "user" u ON u.id=d.verified_by WHERE d.profile_id=$1 AND d.organization_id=$2`,
          [profileId, s.org],
        )
      ).rows[0] as LicenceView["licence"]) ?? null;
    return { organization_id: s.org, licence, can: { edit: true, verify: s.manage }, today: brusselsToday() };
  });
}

export async function licenceExecute(db: Pool, p: Principal, command: LicenceCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const self = await profileIn(s, command.profileId);
      if (command.action === "save") {
        // Whoever changes it, the club checks it again; the reminder starts over.
        await s.c.query(
          `INSERT INTO driver_licence(profile_id,organization_id,categories,valid_until,declared_by_self,updated_by) VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT(profile_id) DO UPDATE SET categories=EXCLUDED.categories,valid_until=EXCLUDED.valid_until,declared_by_self=EXCLUDED.declared_by_self,
             verified_by=NULL,verified_on=NULL,reminded_on=CASE WHEN driver_licence.valid_until IS DISTINCT FROM EXCLUDED.valid_until THEN NULL ELSE driver_licence.reminded_on END,
             updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [command.profileId, s.org, [...new Set(command.categories)], command.validUntil, self, s.userId],
        );
        await audit(s.c, s.org, s.userId, "licence.saved", command.profileId, { categories: command.categories });
        return { ok: true as const };
      }
      const exists = (await s.c.query("SELECT 1 FROM driver_licence WHERE profile_id=$1 AND organization_id=$2 FOR UPDATE", [command.profileId, s.org])).rowCount;
      if (!exists) throw new AccessError("NOT_FOUND", 404);
      if (command.action === "verify") {
        if (!s.manage) throw new AccessError("FORBIDDEN");
        await s.c.query(
          "UPDATE driver_licence SET verified_by=CASE WHEN $3 THEN $4 ELSE NULL END,verified_on=CASE WHEN $3 THEN CURRENT_DATE ELSE NULL END WHERE profile_id=$1 AND organization_id=$2",
          [command.profileId, s.org, command.verified, s.userId],
        );
        await audit(s.c, s.org, s.userId, command.verified ? "licence.verified" : "licence.unverified", command.profileId);
        return { ok: true as const };
      }
      if (command.action === "removeCopy") {
        await s.c.query(
          "UPDATE driver_licence SET copy_filename=NULL,copy_media_type=NULL,copy_content=NULL,verified_by=NULL,verified_on=NULL,updated_at=now() WHERE profile_id=$1 AND organization_id=$2",
          [command.profileId, s.org],
        );
        await audit(s.c, s.org, s.userId, "licence.copy.removed", command.profileId);
        return { ok: true as const };
      }
      await s.c.query("DELETE FROM driver_licence WHERE profile_id=$1 AND organization_id=$2", [command.profileId, s.org]);
      await audit(s.c, s.org, s.userId, "licence.removed", command.profileId);
      return { ok: true as const };
    },
    expected,
  );
}

/** Attaches a copy (PDF or photo) to a licence already declared. */
export async function licenceCopyUpload(db: Pool, p: Principal, profileId: string, file: { name: string; bytes: Uint8Array }, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      await profileIn(s, profileId);
      const type = proofType(file.bytes);
      if (!type || file.bytes.length > proofMaxBytes) throw new AccessError("INVALID_FILE", 400);
      const old = (await s.c.query("SELECT octet_length(copy_content) AS n FROM driver_licence WHERE profile_id=$1 AND organization_id=$2 FOR UPDATE", [profileId, s.org])).rows[0] as
        | { n: number | null }
        | undefined;
      if (!old) throw new AccessError("NOT_FOUND", 404);
      await ensureStorage(s.c, s.org, file.bytes.length, Number(old.n ?? 0));
      await s.c.query(
        "UPDATE driver_licence SET copy_filename=$3,copy_media_type=$4,copy_content=$5,verified_by=NULL,verified_on=NULL,updated_by=$6,updated_at=now() WHERE profile_id=$1 AND organization_id=$2",
        [profileId, s.org, safeName(file.name, "permis"), type, Buffer.from(file.bytes), s.userId],
      );
      await audit(s.c, s.org, s.userId, "licence.copy", profileId);
      return { ok: true as const };
    },
    expected,
  );
}

export async function licenceCopy(db: Pool, p: Principal, profileId: string) {
  return scope(db, p, false, async (s) => {
    await profileIn(s, profileId);
    const f = (await s.c.query("SELECT copy_filename AS filename,copy_media_type AS media_type,copy_content AS content FROM driver_licence WHERE profile_id=$1 AND organization_id=$2 AND copy_content IS NOT NULL", [profileId, s.org]))
      .rows[0] as { filename: string; media_type: string; content: Buffer } | undefined;
    if (!f) throw new AccessError("NOT_FOUND", 404);
    return f;
  });
}

const reminderTitle = {
  fr: "Votre permis de conduire expire bientôt : pensez à le renouveler puis à mettre la date à jour dans votre profil.",
  nl: "Uw rijbewijs vervalt binnenkort: vernieuw het en werk de datum bij in uw profiel.",
  en: "Your driving licence expires soon: renew it, then update the date in your profile.",
};
/** Daily: each person whose licence expires within 30 days hears it once. */
export async function licenceReminderTick(db: Pool) {
  const today = brusselsToday();
  const base = process.env.BETTER_AUTH_URL ?? "";
  const rows = (
    await db.query(
      `SELECT d.profile_id,d.organization_id,d.valid_until::text AS valid_until,d.reminded_on::text AS reminded_on,o.name AS club,u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale
         FROM driver_licence d JOIN organization o ON o.id=d.organization_id JOIN club_person cp ON cp.id=d.profile_id AND cp.organization_id=d.organization_id AND cp.status='active'
         JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id
        WHERE d.reminded_on IS NULL AND d.valid_until BETWEEN $1::date AND $1::date+30`,
      [today],
    )
  ).rows.filter((r) => reminderDue(r.valid_until, today, r.reminded_on));
  let sent = 0;
  for (const r of rows) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const locale = (["fr", "nl", "en"].includes(r.locale) ? r.locale : "fr") as "fr" | "nl" | "en";
      await publish(c, {
        organizationId: r.organization_id,
        userId: r.user_id,
        email: r.email,
        kind: "funding_task",
        category: "administrative",
        resourceType: "license",
        resourceId: r.profile_id,
        eventKey: `licence_expiry:${r.profile_id}:${r.valid_until}`,
        locale,
        variables: { name: r.name, organization: r.club, url: `${base}/${locale}/coaches/${r.profile_id}`, title: reminderTitle[locale], due: r.valid_until },
      });
      await c.query("UPDATE driver_licence SET reminded_on=$2 WHERE profile_id=$1", [r.profile_id, today]);
      await c.query("COMMIT");
      sent++;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}
