import type { Pool, PoolClient } from "pg";
import { escapeLike } from "../../lib/sql";
import { z } from "zod";
import { fedCan } from "../access/policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { brusselsToday } from "../people/service";

/**
 * International, step 3 (06/11/2026): the registry of classifications. A
 * PF1/PF2 decision is written for the person (not the club sheet), with
 * the federation that classified, its date and its end; it follows the
 * person from club to club and from country to country. A classification
 * day writes it at publication; a federation's licence officers write one
 * by hand (a classification done abroad, an older one). The club sheets
 * of the person in the federation's clubs follow the latest record.
 */
export const registryCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    /** The person, by their identity code (PFM-XXXXXXXXXX) or by a club sheet of one of the federation's clubs. */
    identityCode: z.string().trim().regex(/^PFM-[0-9A-F]{10}$/i).optional(),
    profileId: z.uuid().optional(),
    classification: z.enum(["PF1", "PF2"]),
    decidedOn: z.iso.date(),
    validUntil: z.iso.date().nullable().default(null),
    classifier: z.string().trim().max(160).default(""),
    international: z.boolean().default(false),
    note: z.string().trim().max(1000).default(""),
  }),
  z.object({ action: z.literal("remove"), id: z.uuid() }),
]);
export type RegistryCommand = z.infer<typeof registryCommand>;

export type Record_ = { id: string; person_id: string; classification: "PF1" | "PF2"; decided_on: string; valid_until: string | null; federation: string; federation_id: string; classifier: string; international: boolean; source: "session" | "manual" | "dossier"; note: string; created_at: string };
const recordSql = `SELECT r.id,r.person_id,r.classification,r.decided_on::text AS decided_on,r.valid_until::text AS valid_until,o.name AS federation,r.federation_id,r.classifier,r.international,r.source,r.note,r.created_at
  FROM classification_record r JOIN organization o ON o.id=r.federation_id`;

/** The record that applies to a person today: the latest decided, still valid. */
export async function currentRecord(c: PoolClient, personId: string, today = brusselsToday()): Promise<Record_ | null> {
  const r = (await c.query(`${recordSql} WHERE r.person_id=$1 AND r.decided_on<=$2 AND (r.valid_until IS NULL OR r.valid_until>=$2) ORDER BY r.decided_on DESC,r.created_at DESC LIMIT 1`, [personId, today])).rows[0];
  return (r as Record_) ?? null;
}
/** Every record of a person, latest first. */
export async function recordsOf(c: PoolClient, personId: string): Promise<Record_[]> {
  return (await c.query(`${recordSql} WHERE r.person_id=$1 ORDER BY r.decided_on DESC,r.created_at DESC`, [personId])).rows as Record_[];
}

/** Write a record and make the person's club sheets in this federation follow it. */
export async function writeRecord(
  c: PoolClient,
  by: string,
  r: { personId: string; classification: "PF1" | "PF2"; decidedOn: string; validUntil: string | null; federationId: string; classifier: string; international: boolean; source: "session" | "manual" | "dossier"; sessionId?: string | null; note: string },
) {
  const id = (
    await c.query(
      "INSERT INTO classification_record(person_id,classification,decided_on,valid_until,federation_id,classifier,international,source,session_id,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
      [r.personId, r.classification, r.decidedOn, r.validUntil, r.federationId, r.classifier, r.international, r.source, r.sessionId ?? null, r.note, by],
    )
  ).rows[0].id as string;
  await followRecord(c, by, r.personId, r.federationId);
  return id;
}
/** The club sheets of the person in the federation's clubs take the current record (or nothing to change without one). */
export async function followRecord(c: PoolClient, by: string, personId: string, federationId: string) {
  const current = await currentRecord(c, personId);
  if (!current) return 0;
  const sheets = (await c.query("SELECT cp.id,cp.organization_id FROM club_person cp JOIN organization o ON o.id=cp.organization_id WHERE cp.person_id=$1 AND o.federation_id=$2 AND cp.status='active'", [personId, federationId])).rows as { id: string; organization_id: string }[];
  for (const s of sheets)
    await c.query(
      `INSERT INTO player_sport_profile(profile_id,organization_id,classification,classification_status,classification_valid_until,classification_checked_by,classification_checked_at,updated_by)
       VALUES($1,$2,$3,'validated',$4,$5,now(),$5)
       ON CONFLICT (profile_id) DO UPDATE SET classification=EXCLUDED.classification,classification_status='validated',classification_valid_until=EXCLUDED.classification_valid_until,
         classification_checked_by=EXCLUDED.classification_checked_by,classification_checked_at=now(),updated_by=EXCLUDED.updated_by,updated_at=now(),version=player_sport_profile.version+1`,
      [s.id, s.organization_id, current.classification, current.valid_until, by],
    );
  return sheets.length;
}

type Scope = { c: PoolClient; fed: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    const manage = fedCan(a.role, a.grants, "federation.licences");
    if (!manage && !fedCan(a.role, a.grants)) throw new AccessError("FORBIDDEN");
    if (write && !manage) throw new AccessError("FORBIDDEN");
    await account(c, p);
    const out = await fn({ c, fed: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export type RegistryView = {
  organization_id: string;
  canManage: boolean;
  today: string;
  /** The players of the federation's clubs with their identity code and current record. */
  players: { profile_id: string; person_id: string; identity_code: string; full_name: string; club: string; club_id: string; classification: string; current: Record_ | null; expiring: boolean }[];
  /** The records written by or for this federation's players, latest first. */
  records: (Record_ & { full_name: string; identity_code: string })[];
};
export async function registryView(db: Pool, p: Principal, q = ""): Promise<RegistryView> {
  return scope(db, p, false, async (s) => {
    const today = brusselsToday();
    const search = q.trim().slice(0, 80);
    const players = (
      await s.c.query(
        `SELECT cp.id AS profile_id,cp.person_id,pe.identity_code,cp.full_name,o.name AS club,o.id AS club_id,COALESCE(sp.classification,'not_classified') AS classification
           FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN organization o ON o.id=cp.organization_id LEFT JOIN player_sport_profile sp ON sp.profile_id=cp.id
          WHERE o.federation_id=$1 AND o.kind='club' AND cp.status='active' AND 'player'=ANY(cp.directory_roles)
            AND ($2='' OR cp.full_name ILIKE '%'||$2||'%' OR pe.identity_code ILIKE '%'||$2||'%' OR o.name ILIKE '%'||$2||'%')
          ORDER BY lower(o.name),lower(cp.full_name) LIMIT 500`,
        [s.fed, escapeLike(search)],
      )
    ).rows as { profile_id: string; person_id: string; identity_code: string; full_name: string; club: string; club_id: string; classification: string }[];
    const ids = [...new Set(players.map((x) => x.person_id))];
    const currents = ids.length
      ? ((
          await s.c.query(
            `SELECT DISTINCT ON (r.person_id) r.id,r.person_id,r.classification,r.decided_on::text AS decided_on,r.valid_until::text AS valid_until,o.name AS federation,r.federation_id,r.classifier,r.international,r.source,r.note,r.created_at
               FROM classification_record r JOIN organization o ON o.id=r.federation_id
              WHERE r.person_id=ANY($1::uuid[]) AND r.decided_on<=$2 AND (r.valid_until IS NULL OR r.valid_until>=$2) ORDER BY r.person_id,r.decided_on DESC,r.created_at DESC`,
            [ids, today],
          )
        ).rows as Record_[])
      : [];
    const byPerson = new Map(currents.map((r) => [r.person_id, r]));
    const soon = new Date(today + "T12:00:00Z");
    soon.setUTCDate(soon.getUTCDate() + 90);
    const limit = soon.toISOString().slice(0, 10);
    const records = (
      await s.c.query(
        `SELECT r.id,r.person_id,r.classification,r.decided_on::text AS decided_on,r.valid_until::text AS valid_until,o.name AS federation,r.federation_id,r.classifier,r.international,r.source,r.note,r.created_at,
                pe.identity_code,COALESCE(n.full_name,'') AS full_name
           FROM classification_record r JOIN organization o ON o.id=r.federation_id JOIN person pe ON pe.id=r.person_id
           LEFT JOIN LATERAL (SELECT cp.full_name FROM club_person cp WHERE cp.person_id=r.person_id ORDER BY (cp.status='active') DESC,cp.updated_at DESC LIMIT 1) n ON true
          WHERE r.federation_id=$1 OR r.person_id=ANY($2::uuid[]) ORDER BY r.decided_on DESC,r.created_at DESC LIMIT 300`,
        [s.fed, ids],
      )
    ).rows as (Record_ & { full_name: string; identity_code: string })[];
    return {
      organization_id: s.fed,
      canManage: s.manage,
      today,
      players: players.map((x) => {
        const current = byPerson.get(x.person_id) ?? null;
        return { ...x, current, expiring: !!current?.valid_until && current.valid_until <= limit };
      }),
      records,
    };
  });
}

export async function registryExecute(db: Pool, p: Principal, command: RegistryCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "remove") {
        // Only a record written by hand by this federation; a day's decision stays.
        const r = (await s.c.query("DELETE FROM classification_record WHERE id=$1 AND federation_id=$2 AND source='manual' RETURNING person_id", [command.id, s.fed])).rows[0] as { person_id: string } | undefined;
        if (!r) throw new AccessError("NOT_FOUND", 404);
        await followRecord(s.c, s.userId, r.person_id, s.fed);
        await audit(s.c, s.fed, s.userId, "classification.record.remove", command.id);
        return { ok: true as const };
      }
      let personId: string | null = null;
      if (command.profileId) personId = ((await s.c.query("SELECT cp.person_id FROM club_person cp JOIN organization o ON o.id=cp.organization_id WHERE cp.id=$1 AND o.federation_id=$2", [command.profileId, s.fed])).rows[0]?.person_id as string | undefined) ?? null;
      else if (command.identityCode) personId = ((await s.c.query("SELECT id FROM person WHERE identity_code=upper($1)", [command.identityCode])).rows[0]?.id as string | undefined) ?? null;
      if (!personId) throw new AccessError("NOT_FOUND", 404);
      const id = await writeRecord(s.c, s.userId, {
        personId,
        classification: command.classification,
        decidedOn: command.decidedOn,
        validUntil: command.validUntil,
        federationId: s.fed,
        classifier: command.classifier,
        international: command.international,
        source: "manual",
        note: command.note,
      });
      await audit(s.c, s.fed, s.userId, "classification.record", id, { person: personId, classification: command.classification });
      return { ok: true as const, id };
    },
    expected,
  );
}
