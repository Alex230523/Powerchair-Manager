import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { ownProfiles } from "../calendar/access";
import { seal, unseal } from "../notifications/crypto";
import { publish } from "../notifications/queue";
import { logSensitiveAccess } from "../club/governance";
import { brusselsToday } from "../people/service";
import { ageOn } from "../people/schema";
import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { incidentContexts, incidentKinds, incidentsCopy, insuranceStatuses } from "../../components/incidents-copy";

/**
 * B5: incidents and their insurance declaration. The facts (when, where,
 * what happened, who, witnesses) are seen by the managers, the reporter,
 * the coach of the players involved and the people involved themselves
 * (or their parents); the health part (injuries, first aid, follow-up,
 * photos) is sealed and read only with people.sensitive or
 * documents.sensitive, each opening logged. A minor involved: the parents
 * are told at once. The insurance: a deadline from the club's settings, a
 * prefilled PDF, the statuses, amounts and papers, a reminder.
 */
type Locale = "fr" | "nl" | "en";
type Actor = Awaited<ReturnType<typeof active>> & { twoFactorEnabled: boolean };
type Scope = { c: PoolClient; p: Principal; a: Actor; org: string; orgName: string; manage: boolean; health: boolean; coachTeams: string[] };
export type Health = { injuries: string; firstAid: string; care: string; hospital: boolean };

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const healthSchema = z.object({ injuries: text(2000).default(""), firstAid: text(2000).default(""), care: text(2000).default(""), hospital: z.boolean().default(false) });
const photo = z.object({ name: text(160).min(1), type: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(1400000) });
export const incidentCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("declare"),
    occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    context: z.enum(incidentContexts),
    eventId: id.nullable().default(null),
    kind: z.enum(incidentKinds),
    place: text(200).default(""),
    circumstances: text(4000).min(5),
    witnesses: text(1000).default(""),
    profileIds: z.array(id).min(1).max(10),
    chairId: id.nullable().default(null),
    health: healthSchema.nullable().default(null),
    photos: z.array(photo).max(3).default([]),
  }),
  z.object({ action: z.literal("facts"), id, expectedVersion: z.number().int().positive(), place: text(200), circumstances: text(4000).min(5), witnesses: text(1000) }),
  z.object({ action: z.literal("health"), id, health: healthSchema }),
  z.object({
    action: z.literal("insurance"),
    id,
    expectedVersion: z.number().int().positive(),
    status: z.enum(insuranceStatuses),
    claimReference: text(80),
    sentOn: z.iso.date().nullable(),
    claimedCents: z.number().int().min(0).max(100000000).nullable(),
    reimbursedCents: z.number().int().min(0).max(100000000).nullable(),
  }),
  z.object({ action: z.literal("file"), id, kind: z.enum(["photo", "piece"]), name: text(160).min(1), type: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]), data: z.string().max(2900000) }),
  z.object({ action: z.literal("removeFile"), id }),
  z.object({ action: z.literal("settings"), insurerName: text(120), insurerPolicy: text(80), insurerEmail: z.union([z.literal(""), z.email().max(200)]), days: z.number().int().min(1).max(90) }),
]);
export type IncidentCommand = z.infer<typeof incidentCommand>;

/* ---------- Pure rules ---------- */
/** The last day to declare: the day of the incident plus the club's delay. */
export function deadlineOf(occurredOn: string, days: number) {
  const d = new Date(occurredOn + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Where a claim stands against its deadline. */
export function insuranceState(status: string, deadline: string, today: string): "ok" | "soon" | "overdue" | "done" {
  if (status !== "to_declare") return "done";
  if (deadline < today) return "overdue";
  return deadlineOf(today, 2) >= deadline ? "soon" : "ok";
}
/** Anonymous counts: by kind, context and month; never by person. */
export function incidentStats(rows: { kind: string; context: string; occurred_on: string; minor: boolean }[]) {
  const count = (key: (r: (typeof rows)[number]) => string) => rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});
  return { total: rows.length, minors: rows.filter((r) => r.minor).length, byKind: count((r) => r.kind), byContext: count((r) => r.context), byMonth: count((r) => r.occurred_on.slice(0, 7)) };
}
export function validImage(type: string, b: Buffer) {
  if (type === "image/png") return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/webp") return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  return b.subarray(0, 5).toString() === "%PDF-";
}
const aad = (incidentId: string) => "incident:" + incidentId;

/* ---------- Scope ---------- */
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const initial = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [initial.organization_id]);
    const a = { ...(await active(c, p)), twoFactorEnabled: !!(await account(c, p)).twoFactorEnabled } as Actor;
    if (a.organization_id !== initial.organization_id || (expected && expected !== a.organization_id)) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const perms = permissions(a.role, a.grants),
      mfa = mfaSatisfied(a.twoFactorEnabled);
    const coachTeams =
      a.role === "coach"
        ? a.team_id
          ? [a.team_id]
          : (
              await c.query(
                "SELECT m.team_id FROM team_membership m JOIN club_person c ON c.id=m.profile_id JOIN person p ON p.id=c.person_id WHERE m.organization_id=$1 AND p.user_id=$2 AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)",
                [a.organization_id, p.userId],
              )
            ).rows.map((r) => r.team_id as string)
        : [];
    const out = await fn({
      c,
      p,
      a,
      org: a.organization_id,
      orgName: a.organization_name,
      manage: mfa && (a.role === "club_president" || perms.includes("people.manage")),
      health: mfa && (perms.includes("people.sensitive") || perms.includes("documents.sensitive")),
      coachTeams,
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    const code = (e as { code?: string }).code;
    if (code === "23514") throw new AccessError("INVALID_INPUT", 400);
    throw e;
  } finally {
    c.release();
  }
}
/** Profiles this actor may report for: the whole club for a manager, the players of his teams for a coach. */
async function declarable(s: Scope) {
  if (s.manage) return null;
  if (!s.coachTeams.length) return new Set<string>();
  return new Set(
    (
      await s.c.query(
        "SELECT DISTINCT profile_id FROM team_membership WHERE organization_id=$1 AND team_id=ANY($2::uuid[]) AND NOT cancelled AND closed_at IS NULL AND starts_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
        [s.org, s.coachTeams],
      )
    ).rows.map((r) => r.profile_id as string),
  );
}
/** The incidents this actor may open (facts): all for a manager; else declared by him, or involving his players, himself or his children. */
async function visibleIds(s: Scope) {
  if (s.manage) return null;
  const mine = [...((await declarable(s)) ?? []), ...(await ownProfiles(s.c, s.a))];
  return (
    await s.c.query(
      "SELECT i.id FROM incident i WHERE i.organization_id=$1 AND (i.created_by=$2 OR EXISTS (SELECT 1 FROM incident_person ip WHERE ip.incident_id=i.id AND ip.profile_id=ANY($3::uuid[])))",
      [s.org, s.p.userId, mine],
    )
  ).rows.map((r) => r.id as string);
}
async function incidentOf(s: Scope, incidentId: string, lock = false) {
  const visible = await visibleIds(s);
  if (visible && !visible.includes(incidentId)) throw new AccessError("NOT_FOUND", 404);
  const i = (await s.c.query(`SELECT * FROM incident WHERE id=$1 AND organization_id=$2${lock ? " FOR UPDATE" : ""}`, [incidentId, s.org])).rows[0];
  if (!i) throw new AccessError("NOT_FOUND", 404);
  return i;
}

/* ---------- Reading ---------- */
export async function incidentsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const today = brusselsToday();
    const visible = await visibleIds(s);
    const settings = (await s.c.query("SELECT insurer_name,insurer_policy,insurer_email,incident_declaration_days AS days FROM organization WHERE id=$1", [s.org])).rows[0];
    const rows = (
      await s.c.query(
        `SELECT i.*,to_char(i.occurred_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS local_at,i.insurance_deadline::text AS deadline_text,i.sent_on::text AS sent_text,e.title AS event,ch.name AS chair,u.name AS reporter,
                (SELECT json_agg(json_build_object('id',c.id,'full_name',c.full_name,'birth_date',c.birth_date::text) ORDER BY c.full_name) FROM incident_person ip JOIN club_person c ON c.id=ip.profile_id WHERE ip.incident_id=i.id) AS people,
                (SELECT json_agg(json_build_object('id',f.id,'kind',f.kind,'name',f.name,'type',f.content_type) ORDER BY f.created_at) FROM incident_file f WHERE f.incident_id=i.id) AS files
           FROM incident i LEFT JOIN calendar_event e ON e.id=i.event_id AND e.organization_id=i.organization_id LEFT JOIN equipment_chair ch ON ch.id=i.chair_id AND ch.organization_id=i.organization_id JOIN "user" u ON u.id=i.created_by
          WHERE i.organization_id=$1 AND ($2::uuid[] IS NULL OR i.id=ANY($2::uuid[])) ORDER BY i.occurred_at DESC LIMIT 200`,
        [s.org, visible],
      )
    ).rows;
    const incidents = [];
    for (const r of rows) {
      const files = (r.files ?? []) as { id: string; kind: string; name: string; type: string }[];
      const health: Health | null = s.health && r.health_ciphertext ? unseal<Health>(r.health_ciphertext, aad(r.id)) : null;
      if (s.health && (r.health_ciphertext || files.some((f) => f.kind === "photo"))) await logSensitiveAccess(s.c, s.org, s.p.userId, null, "incident_health", r.id);
      incidents.push({
        id: r.id as string,
        version: r.version as number,
        occurred_at: r.local_at as string,
        context: r.context as string,
        event: r.event as string | null,
        kind: r.kind as string,
        place: r.place as string,
        circumstances: r.circumstances as string,
        witnesses: r.witnesses as string,
        chair: r.chair as string | null,
        intervention: !!r.intervention_id,
        reporter: r.reporter as string,
        mine: r.created_by === s.p.userId,
        people: ((r.people ?? []) as { id: string; full_name: string; birth_date: string | null }[]).map((x) => ({ id: x.id, full_name: x.full_name, minor: !!x.birth_date && ageOn(x.birth_date, today) < 18 })),
        health: s.health ? { value: health, photos: files.filter((f) => f.kind === "photo") } : null,
        insurance: s.manage
          ? {
              status: r.insurance_status as string,
              deadline: r.deadline_text as string,
              state: insuranceState(r.insurance_status, r.deadline_text, today),
              claim_reference: r.claim_reference as string,
              sent_on: r.sent_text as string | null,
              claimed_cents: r.claimed_cents as number | null,
              reimbursed_cents: r.reimbursed_cents as number | null,
              pieces: files.filter((f) => f.kind === "piece"),
            }
          : null,
      });
    }
    const can = { declare: s.manage || s.coachTeams.length > 0, manage: s.manage, health: s.health };
    const people = can.declare
      ? ((
          await s.c.query(
            "SELECT c.id,c.full_name,c.birth_date::text AS birth_date FROM club_person c WHERE c.organization_id=$1 AND c.status='active' AND ($2::uuid[] IS NULL OR c.id=ANY($2::uuid[])) ORDER BY c.full_name LIMIT 1000",
            [s.org, s.manage ? null : [...((await declarable(s)) ?? [])]],
          )
        ).rows.map((x) => ({ id: x.id as string, full_name: x.full_name as string, minor: !!x.birth_date && ageOn(x.birth_date, today) < 18 })))
      : [];
    const choices = can.declare
      ? {
          people,
          events: (
            await s.c.query(
              "SELECT e.id,e.title,e.kind,e.starts_at FROM calendar_event e WHERE e.organization_id=$1 AND e.starts_at BETWEEN now()-interval '14 days' AND now()+interval '1 day' AND ($2::uuid[] IS NULL OR e.team_id=ANY($2::uuid[])) ORDER BY e.starts_at DESC LIMIT 50",
              [s.org, s.manage ? null : s.coachTeams],
            )
          ).rows as { id: string; title: string; kind: string; starts_at: string }[],
          chairs: (await s.c.query("SELECT id,name FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' ORDER BY name", [s.org])).rows as { id: string; name: string }[],
        }
      : null;
    // The first-aid kit: items expired or expiring within 30 days.
    const firstAid = s.manage
      ? ((await s.c.query("SELECT id,name,expires_on::text FROM equipment_item WHERE organization_id=$1 AND category='first_aid' AND NOT archived AND expires_on IS NOT NULL AND expires_on<=CURRENT_DATE+30 ORDER BY expires_on", [s.org])).rows as { id: string; name: string; expires_on: string }[])
      : [];
    const stats = s.manage
      ? incidentStats(
          (
            await s.c.query(
              `SELECT i.kind,i.context,(i.occurred_at AT TIME ZONE 'Europe/Brussels')::date::text AS occurred_on,
                      EXISTS (SELECT 1 FROM incident_person ip JOIN club_person c ON c.id=ip.profile_id WHERE ip.incident_id=i.id AND c.birth_date>(i.occurred_at AT TIME ZONE 'Europe/Brussels')::date-interval '18 years') AS minor
                 FROM incident i WHERE i.organization_id=$1 AND i.occurred_at>now()-interval '12 months'`,
              [s.org],
            )
          ).rows,
        )
      : null;
    return { organization_id: s.org, today, can, settings: s.manage ? settings : null, incidents, choices, firstAid, stats };
  });
}

/** The care instructions of the people a reporter is about to declare for (logged). */
export async function careFor(db: Pool, p: Principal, profileIds: string[]) {
  return scope(db, p, false, async (s) => {
    const allowed = await declarable(s);
    const ids = profileIds.filter((x) => !allowed || allowed.has(x));
    if (!s.manage && !s.coachTeams.length) throw new AccessError("FORBIDDEN");
    if (!ids.length) return [];
    const rows = (await s.c.query("SELECT ci.id,ci.profile_id,c.full_name,ci.moment,ci.time,ci.ciphertext FROM care_instruction ci JOIN club_person c ON c.id=ci.profile_id WHERE ci.organization_id=$1 AND ci.active AND ci.profile_id=ANY($2::uuid[]) ORDER BY c.full_name", [s.org, ids])).rows;
    for (const pid of new Set(rows.map((r) => r.profile_id as string))) await logSensitiveAccess(s.c, s.org, s.p.userId, pid, "incident_care", null);
    return rows.map(({ ciphertext, ...r }) => ({ ...r, ...unseal<{ title: string; details: string }>(ciphertext, "care:" + r.id) })) as { id: string; profile_id: string; full_name: string; moment: string; time: string; title: string; details: string }[];
  });
}

/** One file: a photo with the health rights, a paper for the managers. */
export async function incidentFile(db: Pool, p: Principal, fileId: string) {
  return scope(db, p, false, async (s) => {
    const f = (await s.c.query("SELECT f.*,f.incident_id FROM incident_file f WHERE f.id=$1 AND f.organization_id=$2", [fileId, s.org])).rows[0];
    if (!f) throw new AccessError("NOT_FOUND", 404);
    await incidentOf(s, f.incident_id);
    if (f.kind === "photo" ? !s.health : !s.manage) throw new AccessError("NOT_FOUND", 404);
    if (f.kind === "photo") await logSensitiveAccess(s.c, s.org, s.p.userId, null, "incident_health", f.incident_id);
    return { name: f.name as string, type: f.content_type as string, bytes: f.bytes as Buffer };
  });
}

/* ---------- Writing ---------- */
export async function incidentsExecute(db: Pool, p: Principal, cmd: IncidentCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const org = s.org;
      if (cmd.action === "declare") {
        const allowed = await declarable(s);
        if (!s.manage && !s.coachTeams.length) throw new AccessError("FORBIDDEN");
        if (allowed && cmd.profileIds.some((x) => !allowed.has(x))) throw new AccessError("NOT_DECLARABLE", 403);
        const people = (await s.c.query("SELECT id,full_name,birth_date::text AS birth_date FROM club_person WHERE organization_id=$1 AND id=ANY($2::uuid[])", [org, cmd.profileIds])).rows as { id: string; full_name: string; birth_date: string | null }[];
        if (people.length !== new Set(cmd.profileIds).size) throw new AccessError("NOT_FOUND", 404);
        const at = (await s.c.query("SELECT ($1::timestamp AT TIME ZONE 'Europe/Brussels') AS at", [cmd.occurredAt])).rows[0].at as Date;
        if (at.getTime() > Date.now() + 5 * 60000) throw new AccessError("INVALID_DATE", 400);
        if (cmd.eventId && !(await s.c.query("SELECT 1 FROM calendar_event WHERE id=$1 AND organization_id=$2", [cmd.eventId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
        const chair = cmd.chairId ? (await s.c.query("SELECT id,name,status FROM equipment_chair WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.chairId, org])).rows[0] : null;
        if (cmd.chairId && !chair) throw new AccessError("NOT_FOUND", 404);
        const photos = cmd.photos.map((x) => ({ ...x, bytes: Buffer.from(x.data, "base64") }));
        if (photos.some((x) => x.bytes.length > 1048576 || !validImage(x.type, x.bytes))) throw new AccessError("INVALID_IMAGE", 400);
        const days = (await s.c.query("SELECT incident_declaration_days FROM organization WHERE id=$1", [org])).rows[0].incident_declaration_days as number;
        const day = cmd.occurredAt.slice(0, 10);
        const incidentId = (
          await s.c.query(
            "INSERT INTO incident(organization_id,occurred_at,context,event_id,kind,place,circumstances,witnesses,chair_id,insurance_deadline,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
            [org, at, cmd.context, cmd.eventId, cmd.kind, cmd.place, cmd.circumstances, cmd.witnesses, cmd.chairId, deadlineOf(day, days), s.p.userId],
          )
        ).rows[0].id as string;
        for (const x of people) await s.c.query("INSERT INTO incident_person(incident_id,organization_id,profile_id) VALUES($1,$2,$3)", [incidentId, org, x.id]);
        // Health: written by the reporter, read only with the sensitive rights.
        if (cmd.health && (cmd.health.injuries || cmd.health.firstAid || cmd.health.care || cmd.health.hospital))
          await s.c.query("UPDATE incident SET health_ciphertext=$2 WHERE id=$1", [incidentId, seal(cmd.health, aad(incidentId))]);
        for (const x of photos)
          await s.c.query("INSERT INTO incident_file(incident_id,organization_id,kind,name,content_type,bytes,created_by) VALUES($1,$2,'photo',$3,$4,$5,$6)", [incidentId, org, x.name, x.type, x.bytes, s.p.userId]);
        // Damage to a chair: an intervention in its log, the chair taken out of use and its bookings released (B3).
        if (chair && (cmd.kind === "chair_damage" || cmd.kind === "collision" || cmd.kind === "fall")) {
          const intervention = (
            await s.c.query("INSERT INTO chair_intervention(organization_id,chair_id,occurred_on,kind,diagnosis,created_by) VALUES($1,$2,$3,'breakdown',$4,$5) RETURNING id", [
              org,
              chair.id,
              day,
              cmd.circumstances.slice(0, 1000),
              s.p.userId,
            ])
          ).rows[0].id as string;
          await s.c.query("UPDATE incident SET intervention_id=$2 WHERE id=$1", [incidentId, intervention]);
          if (chair.status === "available" || chair.status === "in_use") {
            await s.c.query("UPDATE equipment_chair SET status='maintenance',version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [chair.id, org]);
            await s.c.query(
              "UPDATE chair_booking b SET status='released',released_reason='breakdown' FROM calendar_event e WHERE b.chair_id=$1 AND b.organization_id=$2 AND b.status='booked' AND e.id=b.event_id AND e.starts_at>now()",
              [chair.id, org],
            );
          }
        }
        // A minor involved: the parents are told at once.
        const minors = people.filter((x) => x.birth_date && ageOn(x.birth_date, day) < 18).map((x) => x.id);
        let told = 0;
        if (minors.length) {
          const parents = (
            await s.c.query(
              `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,c.full_name AS child
                 FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id AND gp.organization_id=g.organization_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id
                 JOIN club_person c ON c.id=g.subject_profile_id AND c.organization_id=g.organization_id
                WHERE g.organization_id=$1 AND g.subject_profile_id=ANY($2::uuid[]) AND g.can_view AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)
                  AND gp.status='active' AND u.active AND u.id<>$3`,
              [org, minors, s.p.userId],
            )
          ).rows as { id: string; email: string; name: string; locale: Locale; child: string }[];
          for (const u of parents) {
            const t = incidentsCopy[u.locale].mail;
            const date = new Intl.DateTimeFormat(u.locale === "en" ? "en-GB" : `${u.locale}-BE`, { dateStyle: "long", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
            await publish(s.c, {
              organizationId: org,
              userId: u.id,
              email: u.email,
              kind: "automation",
              category: "administrative",
              resourceType: "automation",
              resourceId: incidentId,
              eventKey: `incident:${incidentId}:${u.id}:${u.child}`,
              locale: u.locale,
              variables: { name: u.name, organization: s.orgName, url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/incidents`, title: t.minorTitle.replace("{child}", u.child), message: t.minorMessage.replace("{child}", u.child).replace("{date}", date) },
            });
            told++;
          }
        }
        await audit(s.c, org, s.p.userId, "incident.declared", incidentId, { kind: cmd.kind, people: people.length, minors: minors.length, parentsTold: told });
        return { id: incidentId, parentsTold: told };
      }
      if (cmd.action === "facts") {
        const i = await incidentOf(s, cmd.id, true);
        if (!s.manage && i.created_by !== s.p.userId) throw new AccessError("FORBIDDEN");
        if (i.version !== cmd.expectedVersion) throw new AccessError("VERSION_CONFLICT", 409);
        await s.c.query("UPDATE incident SET place=$3,circumstances=$4,witnesses=$5,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [i.id, org, cmd.place, cmd.circumstances, cmd.witnesses]);
        await audit(s.c, org, s.p.userId, "incident.facts", i.id);
        return { id: i.id };
      }
      if (cmd.action === "health") {
        const i = await incidentOf(s, cmd.id, true);
        if (!s.health) throw new AccessError("FORBIDDEN");
        await s.c.query("UPDATE incident SET health_ciphertext=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [i.id, org, seal(cmd.health, aad(i.id))]);
        await logSensitiveAccess(s.c, org, s.p.userId, null, "incident_health", i.id);
        return { id: i.id };
      }
      if (cmd.action === "file") {
        const i = await incidentOf(s, cmd.id, true);
        if (cmd.kind === "piece" ? !s.manage : !s.manage && i.created_by !== s.p.userId) throw new AccessError("FORBIDDEN");
        const bytes = Buffer.from(cmd.data, "base64");
        if (bytes.length > 2097152 || (cmd.kind === "photo" && cmd.type === "application/pdf") || !validImage(cmd.type, bytes)) throw new AccessError("INVALID_FILE", 400);
        if (cmd.kind === "photo" && (await s.c.query("SELECT count(*)::int AS n FROM incident_file WHERE incident_id=$1 AND kind='photo'", [i.id])).rows[0].n >= 3) throw new AccessError("TOO_MANY_PHOTOS", 400);
        const f = (await s.c.query("INSERT INTO incident_file(incident_id,organization_id,kind,name,content_type,bytes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [i.id, org, cmd.kind, cmd.name, cmd.type, bytes, s.p.userId])).rows[0].id as string;
        return { id: f };
      }
      if (!s.manage) throw new AccessError("FORBIDDEN");
      switch (cmd.action) {
        case "insurance": {
          const i = await incidentOf(s, cmd.id, true);
          if (i.version !== cmd.expectedVersion) throw new AccessError("VERSION_CONFLICT", 409);
          const sentOn = cmd.sentOn ?? (cmd.status !== "to_declare" && cmd.status !== "not_needed" && !i.sent_on ? brusselsToday() : null);
          await s.c.query(
            "UPDATE incident SET insurance_status=$3,claim_reference=$4,sent_on=COALESCE($5::date,sent_on),claimed_cents=$6,reimbursed_cents=$7,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
            [i.id, org, cmd.status, cmd.claimReference, sentOn, cmd.claimedCents, cmd.reimbursedCents],
          );
          await audit(s.c, org, s.p.userId, "incident.insurance", i.id, { status: cmd.status });
          return { id: i.id };
        }
        case "removeFile": {
          const r = (await s.c.query("DELETE FROM incident_file WHERE id=$1 AND organization_id=$2 RETURNING incident_id", [cmd.id, org])).rows[0];
          if (!r) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, org, s.p.userId, "incident.file.removed", r.incident_id);
          return { id: cmd.id };
        }
        case "settings": {
          await s.c.query("UPDATE organization SET insurer_name=$2,insurer_policy=$3,insurer_email=$4,incident_declaration_days=$5 WHERE id=$1", [org, cmd.insurerName, cmd.insurerPolicy, cmd.insurerEmail, cmd.days]);
          await audit(s.c, org, s.p.userId, "incident.settings", org, { days: cmd.days });
          return { id: org };
        }
      }
    },
    expected,
  );
}

/** The prefilled declaration for the insurer, in the reader's language; the health part only for the authorised. */
export async function incidentPdf(db: Pool, p: Principal, incidentId: string) {
  return scope(db, p, false, async (s) => {
    if (!s.manage) throw new AccessError("FORBIDDEN");
    const i = await incidentOf(s, incidentId);
    const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.p.userId])).rows[0]?.locale ?? "fr") as Locale;
    const t = incidentsCopy[locale],
      d = t.pdfDoc;
    const o = (await s.c.query("SELECT name,insurer_name,insurer_policy FROM organization WHERE id=$1", [s.org])).rows[0];
    const people = (await s.c.query("SELECT c.full_name,c.birth_date::text AS birth_date FROM incident_person ip JOIN club_person c ON c.id=ip.profile_id WHERE ip.incident_id=$1 ORDER BY c.full_name", [i.id])).rows as { full_name: string; birth_date: string | null }[];
    const event = i.event_id ? (await s.c.query("SELECT title FROM calendar_event WHERE id=$1 AND organization_id=$2", [i.event_id, s.org])).rows[0]?.title : null;
    const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
    const fmt = (x: Date) => new Intl.DateTimeFormat(tag, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }).format(x);
    const day = (x: string) => new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(new Date(x + "T12:00:00Z"));
    const health = s.health && i.health_ciphertext ? unseal<Health>(i.health_ciphertext, aad(i.id)) : null;
    if (health) await logSensitiveAccess(s.c, s.org, s.p.userId, null, "incident_health", i.id);
    const lines: PdfLine[] = [
      { text: d.title, size: 16, bold: true },
      { text: `${d.club} : ${o.name}`, gap: 6 },
      ...(o.insurer_name ? [{ text: `${d.insurer} : ${o.insurer_name}${o.insurer_policy ? ` · ${d.policy} ${o.insurer_policy}` : ""}` }] : []),
      ...people.map((x) => ({ text: `${d.person} : ${x.full_name}${x.birth_date ? `, ${d.born} ${day(x.birth_date)}` : ""}`, bold: true, gap: 6 })),
      { text: `${d.when} : ${fmt(new Date(i.occurred_at))}`, gap: 6 },
      ...(i.place ? [{ text: `${d.where} : ${i.place}` }] : []),
      { text: `${d.event} : ${t.contexts[i.context as "training"]}${event ? ` · ${event}` : ""}` },
      { text: `${d.kind} : ${t.kinds[i.kind as "fall"]}` },
      { text: d.facts, bold: true, gap: 8 },
      { text: i.circumstances },
      ...(i.witnesses ? [{ text: d.witnesses, bold: true, gap: 8 }, { text: i.witnesses }] : []),
      { text: d.health, bold: true, gap: 8 },
      ...(health
        ? [
            ...(health.injuries ? [{ text: `${t.injuries} : ${health.injuries}` }] : []),
            ...(health.firstAid ? [{ text: `${t.firstAid} : ${health.firstAid}` }] : []),
            ...(health.care ? [{ text: `${t.care} : ${health.care}` }] : []),
            ...(health.hospital ? [{ text: t.hospital }] : []),
          ]
        : [{ text: d.healthMissing }]),
      { text: d.signed.replace("{date}", day(brusselsToday())), size: 9, gap: 16 },
    ];
    await audit(s.c, s.org, s.p.userId, "incident.pdf", i.id);
    return pdfDocument(lines, d.title);
  });
}

/* ---------- Background ---------- */
async function managers(db: Pool, org: string, grant: string) {
  return (
    await db.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id AND m.active
         JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active AND (r.role='club_president' OR $2=ANY(r.grants))`,
      [org, grant],
    )
  ).rows as { id: string; email: string; name: string; locale: Locale }[];
}
/** Daily: a claim two days from its deadline, and first-aid items about to expire, reach the managers once. */
export async function incidentTick(db: Pool) {
  let sent = 0;
  const due = (
    await db.query(
      "SELECT i.id,i.organization_id,o.name AS org,(i.occurred_at AT TIME ZONE 'Europe/Brussels')::date::text AS day,i.insurance_deadline::text AS deadline FROM incident i JOIN organization o ON o.id=i.organization_id WHERE i.insurance_status='to_declare' AND i.reminded_on IS NULL AND i.insurance_deadline<=CURRENT_DATE+2",
    )
  ).rows;
  for (const i of due) {
    for (const u of await managers(db, i.organization_id, "people.manage")) {
      const t = incidentsCopy[u.locale].mail,
        tag = u.locale === "en" ? "en-GB" : `${u.locale}-BE`;
      const day = (x: string) => new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(new Date(x + "T12:00:00Z"));
      await publish(db, {
        organizationId: i.organization_id,
        userId: u.id,
        email: u.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: i.id,
        eventKey: `incident_deadline:${i.id}`,
        locale: u.locale,
        variables: { name: u.name, organization: i.org, url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/incidents`, title: t.deadlineTitle, message: t.deadlineMessage.replace("{date}", day(i.day)).replace("{deadline}", day(i.deadline)) },
      });
      sent++;
    }
    await db.query("UPDATE incident SET reminded_on=CURRENT_DATE WHERE id=$1 AND organization_id=$2", [i.id, i.organization_id]);
  }
  const supplies = (
    await db.query(
      "SELECT it.id,it.organization_id,it.name,it.expires_on::text,o.name AS org FROM equipment_item it JOIN organization o ON o.id=it.organization_id WHERE it.category='first_aid' AND NOT it.archived AND it.expires_on IS NOT NULL AND it.expires_on<=CURRENT_DATE+14",
    )
  ).rows;
  for (const it of supplies)
    for (const u of await managers(db, it.organization_id, "equipment.manage")) {
      const t = incidentsCopy[u.locale].mail;
      const date = new Intl.DateTimeFormat(u.locale === "en" ? "en-GB" : `${u.locale}-BE`, { dateStyle: "long", timeZone: "UTC" }).format(new Date(it.expires_on + "T12:00:00Z"));
      // Once per item and expiry date (the dispatch is deduplicated on its key).
      await publish(db, {
        organizationId: it.organization_id,
        userId: u.id,
        email: u.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: it.id,
        eventKey: `first_aid:${it.id}:${it.expires_on}`,
        locale: u.locale,
        variables: { name: u.name, organization: it.org, url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/incidents`, title: t.firstAidTitle, message: t.firstAidMessage.replace("{item}", it.name).replace("{date}", date) },
      });
    }
  return sent;
}
/** Retention: the health part and the photos after 5 years, the whole incident after 10. */
export async function incidentPurge(db: Pool) {
  const health = await db.query("UPDATE incident SET health_ciphertext=NULL WHERE health_ciphertext IS NOT NULL AND occurred_at<now()-interval '5 years'");
  const photos = await db.query("DELETE FROM incident_file f USING incident i WHERE f.incident_id=i.id AND f.organization_id=i.organization_id AND f.kind='photo' AND i.occurred_at<now()-interval '5 years'");
  const gone = await db.query("DELETE FROM incident WHERE occurred_at<now()-interval '10 years'");
  return (health.rowCount ?? 0) + (photos.rowCount ?? 0) + (gone.rowCount ?? 0);
}
