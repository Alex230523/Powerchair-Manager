import type { Pool } from "pg";
import { z } from "zod";
import { AccessError, audit, type Principal } from "../access/service";
import { publish } from "../notifications/queue";
import { brusselsToday } from "../people/service";
import { scope, readableProfiles, log, type Scope } from "./service";
import { interventionKinds, serviceState } from "./schema";
export { interventionKinds };

/**
 * B3: the chairs' workshop. The log of interventions (service, breakdown,
 * repair, battery, adjustment, speed check) with its supplier, cost, days
 * out of use and invoice (a line of the finances, linked once); warranty
 * and funding; batteries and chargers as components; speed checks against
 * the club's limit; chairs for each event (invited players compared with
 * usable chairs, a club chair booked for one player); breakdowns reported
 * from a phone; the alerts; the cost of each chair.
 */
const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const day = z.iso.date();
export const workshopCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("intervention"),
    chairId: id,
    occurredOn: day,
    kind: z.enum(interventionKinds),
    diagnosis: text(1000).default(""),
    parts: text(500).default(""),
    supplierContactId: id.nullable().default(null),
    costCents: z.number().int().min(0).max(100000000).nullable().default(null),
    daysOut: z.number().int().min(0).max(3650).default(0),
    transactionId: id.nullable().default(null),
    speedKmh: z.number().min(0).max(30).nullable().default(null),
    checker: text(120).default(""),
    /** After a repair: the chair is usable again. */
    backInService: z.boolean().default(false),
  }),
  z.object({ action: z.literal("cancelIntervention"), id, reason: text(300).min(5) }),
  z.object({
    action: z.literal("chairExtras"),
    chairId: id,
    warrantyUntil: day.nullable(),
    purchaseValueCents: z.number().int().min(0).max(100000000).nullable(),
    grantId: id.nullable(),
    partnerId: id.nullable(),
    potId: id.nullable(),
  }),
  z.object({ action: z.literal("component"), id: id.optional(), kind: z.enum(["battery", "charger"]), label: text(120).min(2), serial: text(80).default(""), inServiceOn: day.nullable(), chairId: id.nullable(), notes: text(500).default("") }),
  /** A battery or charger replaced: the old one retired, the new one in place on the same chair. */
  z.object({ action: z.literal("replaceComponent"), id, on: day, label: text(120).min(2), serial: text(80).default("") }),
  z.object({ action: z.literal("speedRules"), limitKmh: z.number().min(1).max(20), checkDays: z.number().int().min(7).max(730) }),
  z.object({ action: z.literal("book"), chairId: id, eventId: id, profileId: id }),
  z.object({ action: z.literal("release"), id }),
  z.object({
    action: z.literal("report"),
    chairId: id,
    description: text(1000).min(3),
    photo: z.object({ type: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(1400000) }).nullable().default(null),
  }),
  z.object({ action: z.literal("closeReport"), id }),
]);
export type WorkshopCommand = z.infer<typeof workshopCommand>;

/** The last speed check of a chair against the club's rules. Pure. */
export function speedState(last: { speed: number; on: string } | null, rules: { limit: number; days: number }, today: string): "ok" | "missing" | "old" | "over" {
  if (!last) return "missing";
  if (last.speed > rules.limit) return "over";
  const age = Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(last.on + "T12:00:00Z")) / 86400000);
  return age > rules.days ? "old" : "ok";
}
/** A chair a player can sit in today. Pure. */
export const usable = (status: string) => status === "available" || status === "in_use";
/** The total cost of owning a chair and its days out of use (cancelled lines left out). Pure. */
export function ownership(purchase: number | null, lines: { cost_cents: number | null; days_out: number; kind: string; cancelled_at: unknown }[]) {
  const live = lines.filter((l) => !l.cancelled_at);
  const byKind: Record<string, number> = {};
  for (const l of live) byKind[l.kind] = (byKind[l.kind] ?? 0) + (l.cost_cents ?? 0);
  const upkeep = live.reduce((n, l) => n + (l.cost_cents ?? 0), 0);
  return { purchase: purchase ?? 0, upkeep, total: (purchase ?? 0) + upkeep, daysOut: live.reduce((n, l) => n + l.days_out, 0), byKind };
}

async function rulesOf(s: Scope) {
  const r = (await s.c.query("SELECT chair_speed_limit_kmh::float AS limit,speed_check_days AS days FROM organization WHERE id=$1", [s.a.organization_id])).rows[0];
  return { limit: Number(r.limit), days: Number(r.days) };
}
async function chairOf(s: Scope, chairId: string, lock = false) {
  const ch = (await s.c.query(`SELECT * FROM equipment_chair WHERE id=$1 AND organization_id=$2${lock ? " FOR UPDATE" : ""}`, [chairId, s.a.organization_id])).rows[0];
  if (!ch) throw new AccessError("NOT_FOUND", 404);
  return ch as { id: string; name: string; status: string; ownership: string; version: number; purchase_value_cents: number | null; grant_id: string | null; partner_id: string | null; pot_id: string | null; warranty_until: string | null };
}
/** Teams whose events this actor follows: all for the material managers, his own for a coach. */
async function followedTeams(s: Scope) {
  const org = s.a.organization_id;
  if (s.manage) return null;
  if (s.a.role !== "coach") return [];
  if (s.a.team_id) return [s.a.team_id];
  return (
    await s.c.query(
      "SELECT m.team_id FROM team_membership m JOIN club_person c ON c.id=m.profile_id JOIN person p ON p.id=c.person_id WHERE m.organization_id=$1 AND p.user_id=$2 AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)",
      [org, s.p.userId],
    )
  ).rows.map((r) => r.team_id as string);
}

/**
 * The chairs of the next 14 days' events: each invited player who did not
 * say « absent » with their usable chair (assigned, or booked for the
 * event), the ones without, and the club chairs free to book.
 */
async function availability(s: Scope, teams: string[] | null) {
  const org = s.a.organization_id;
  if (teams && !teams.length) return [];
  const events = (
    await s.c.query(
      `SELECT e.id,e.title,e.kind,e.starts_at,e.team_id FROM calendar_event e
        WHERE e.organization_id=$1 AND e.status='scheduled' AND e.starts_at BETWEEN now() AND now()+interval '14 days' AND e.team_id IS NOT NULL AND ($2::uuid[] IS NULL OR e.team_id=ANY($2::uuid[]))
        ORDER BY e.starts_at LIMIT 30`,
      [org, teams],
    )
  ).rows as { id: string; title: string; kind: string; starts_at: string; team_id: string }[];
  const out = [];
  for (const e of events) {
    const players = (
      await s.c.query(
        `SELECT i.profile_id,cp.full_name,i.response,
                (SELECT json_build_object('id',ch.id,'name',ch.name,'status',ch.status) FROM equipment_chair_assignment ea JOIN equipment_chair ch ON ch.id=ea.chair_id
                  WHERE ea.profile_id=i.profile_id AND ea.ends_on IS NULL AND ch.organization_id=$2 ORDER BY ea.is_primary DESC,ea.starts_on DESC LIMIT 1) AS own,
                (SELECT json_build_object('id',b.id,'chair_id',ch.id,'name',ch.name,'status',ch.status) FROM chair_booking b JOIN equipment_chair ch ON ch.id=b.chair_id
                  WHERE b.event_id=$1 AND b.profile_id=i.profile_id AND b.status='booked' AND b.organization_id=$2) AS booking
           FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN club_person cp ON cp.id=i.profile_id
          WHERE r.event_id=$1 AND cp.organization_id=$2 AND i.withdrawn_at IS NULL AND i.response<>'absent'
          ORDER BY cp.full_name`,
        [e.id, org],
      )
    ).rows as { profile_id: string; full_name: string; response: string; own: { id: string; name: string; status: string } | null; booking: { id: string; chair_id: string; name: string; status: string } | null }[];
    const missing = players.filter((p) => !(p.own && usable(p.own.status)) && !(p.booking && usable(p.booking.status)));
    // Club chairs free for that event: usable, nobody's, not booked, not lent that day.
    const free = (
      await s.c.query(
        `SELECT ch.id,ch.name FROM equipment_chair ch
          WHERE ch.organization_id=$1 AND ch.ownership='club' AND ch.status='available'
            AND NOT EXISTS (SELECT 1 FROM equipment_chair_assignment ea WHERE ea.chair_id=ch.id AND ea.ends_on IS NULL)
            AND NOT EXISTS (SELECT 1 FROM chair_booking b WHERE b.chair_id=ch.id AND b.event_id=$2 AND b.status='booked')
            AND NOT EXISTS (SELECT 1 FROM equipment_loan l WHERE l.chair_id=ch.id AND l.status IN ('accepted','ongoing') AND ($3::timestamptz AT TIME ZONE 'Europe/Brussels')::date BETWEEN l.starts_on AND l.ends_on)
          ORDER BY ch.name`,
        [org, e.id, e.starts_at],
      )
    ).rows as { id: string; name: string }[];
    out.push({ ...e, players, missing: missing.map((p) => p.profile_id), free });
  }
  return out;
}

/** What needs attention: service due, warranty ending, chairs not given back, expired supplies, speed checks, breakdowns. */
async function alerts(s: Scope, today: string) {
  const org = s.a.organization_id;
  const rules = await rulesOf(s);
  const chairs = (
    await s.c.query(
      `SELECT ch.id,ch.name,ch.status,ch.next_service_on::text AS next,ch.warranty_until::text AS warranty,
              (SELECT json_build_object('speed',i.speed_kmh::float,'on',i.occurred_on::text) FROM chair_intervention i WHERE i.chair_id=ch.id AND i.kind='speed_check' AND i.cancelled_at IS NULL ORDER BY i.occurred_on DESC,i.created_at DESC LIMIT 1) AS speed
         FROM equipment_chair ch WHERE ch.organization_id=$1 AND ch.status<>'retired' ORDER BY ch.name`,
      [org],
    )
  ).rows as { id: string; name: string; status: string; next: string | null; warranty: string | null; speed: { speed: number; on: string } | null }[];
  const soon = new Date(today + "T12:00:00Z");
  soon.setUTCDate(soon.getUTCDate() + 30);
  const in30 = soon.toISOString().slice(0, 10);
  const out: { kind: "service" | "warranty" | "speed" | "loan" | "supply" | "report"; id: string; chair: string | null; about: string; detail: string }[] = [];
  for (const ch of chairs) {
    if (serviceState(ch.next, today, ch.status) === "due") out.push({ kind: "service", id: ch.id, chair: ch.id, about: ch.name, detail: ch.next ?? "" });
    if (ch.warranty && ch.warranty <= in30) out.push({ kind: "warranty", id: ch.id, chair: ch.id, about: ch.name, detail: ch.warranty });
    const sp = speedState(ch.speed, rules, today);
    if (sp !== "ok") out.push({ kind: "speed", id: ch.id, chair: ch.id, about: ch.name, detail: sp });
  }
  for (const l of (
    await s.c.query(
      "SELECT l.id,ch.id AS chair,ch.name,o.name AS borrower,l.ends_on::text FROM equipment_loan l JOIN equipment_chair ch ON ch.id=l.chair_id JOIN organization o ON o.id=l.borrower_id WHERE l.lender_id=$1 AND l.status='ongoing' AND l.ends_on<$2::date",
      [org, today],
    )
  ).rows)
    out.push({ kind: "loan", id: l.id, chair: l.chair, about: l.name, detail: `${l.borrower} · ${l.ends_on}` });
  for (const i of (await s.c.query("SELECT id,name,expires_on::text FROM equipment_item WHERE organization_id=$1 AND NOT archived AND expires_on<$2::date", [org, today])).rows)
    out.push({ kind: "supply", id: i.id, chair: null, about: i.name, detail: i.expires_on });
  for (const r of (await s.c.query("SELECT r.id,ch.id AS chair,ch.name,r.description FROM chair_report r JOIN equipment_chair ch ON ch.id=r.chair_id WHERE r.organization_id=$1 AND r.status='open' ORDER BY r.created_at", [org])).rows)
    out.push({ kind: "report", id: r.id, chair: r.chair, about: r.name, detail: r.description });
  return out;
}

export async function workshopView(db: Pool, p: Principal, chairId?: string) {
  return scope(db, p, false, async (s) => {
    const org = s.a.organization_id;
    const today = brusselsToday();
    const teams = await followedTeams(s);
    const rules = await rulesOf(s);
    let chair = null;
    if (chairId) {
      const ch = await chairOf(s, chairId);
      const visible = s.manage || (await s.c.query("SELECT 1 FROM equipment_chair_assignment WHERE chair_id=$1 AND ends_on IS NULL AND profile_id=ANY($2::uuid[])", [ch.id, [...(await readableProfiles(s.c, s.a))]])).rowCount;
      if (!visible) throw new AccessError("NOT_FOUND", 404);
      const interventions = s.manage
        ? ((
            await s.c.query(
              `SELECT i.id,i.occurred_on::text,i.kind,i.diagnosis,i.parts,i.supplier_contact_id,COALESCE(sup.full_name,'') AS supplier,i.cost_cents,i.days_out,i.transaction_id,t.label AS invoice,i.speed_kmh::float AS speed_kmh,i.checker,i.cancelled_at,i.cancel_reason
                 FROM chair_intervention i LEFT JOIN contact sup ON sup.id=i.supplier_contact_id AND sup.organization_id=i.organization_id LEFT JOIN finance_transaction t ON t.id=i.transaction_id AND t.organization_id=i.organization_id
                WHERE i.chair_id=$1 AND i.organization_id=$2 ORDER BY i.occurred_on DESC,i.created_at DESC`,
              [ch.id, org],
            )
          ).rows as { id: string; occurred_on: string; kind: string; diagnosis: string; parts: string; supplier_contact_id: string | null; supplier: string; cost_cents: number | null; days_out: number; transaction_id: string | null; invoice: string | null; speed_kmh: number | null; checker: string; cancelled_at: string | null; cancel_reason: string | null }[])
        : [];
      const components = (
        await s.c.query("SELECT id,kind,label,serial,in_service_on::text,retired_on::text,replaced_by,notes FROM chair_component WHERE chair_id=$1 AND organization_id=$2 ORDER BY retired_on IS NOT NULL,kind,in_service_on DESC NULLS LAST", [
          ch.id,
          org,
        ])
      ).rows;
      const lastSpeed = interventions.find((i) => i.kind === "speed_check" && !i.cancelled_at);
      const funding = (
        await s.c.query(
          `SELECT (SELECT funder FROM grant_application WHERE id=$1 AND organization_id=$4) AS grant,(SELECT name FROM partner WHERE id=$2 AND organization_id=$4) AS partner,(SELECT name FROM fundraising_pot WHERE id=$3 AND organization_id=$4) AS pot`,
          [ch.grant_id, ch.partner_id, ch.pot_id, org],
        )
      ).rows[0];
      chair = {
        id: ch.id,
        name: ch.name,
        status: ch.status,
        warranty_until: ch.warranty_until,
        purchase_value_cents: ch.purchase_value_cents,
        grant_id: ch.grant_id,
        partner_id: ch.partner_id,
        pot_id: ch.pot_id,
        funding: funding as { grant: string | null; partner: string | null; pot: string | null },
        interventions,
        components,
        speed: lastSpeed ? { kmh: lastSpeed.speed_kmh!, on: lastSpeed.occurred_on, checker: lastSpeed.checker, state: speedState({ speed: lastSpeed.speed_kmh!, on: lastSpeed.occurred_on }, rules, today) } : { kmh: null, on: null, checker: "", state: "missing" as const },
        cost: s.manage ? ownership(ch.purchase_value_cents, interventions) : null,
        reports: (await s.c.query("SELECT id,description,status,created_at,photo IS NOT NULL AS has_photo FROM chair_report WHERE chair_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 20", [ch.id, org])).rows,
      };
    }
    const choices = s.manage
      ? {
          contacts: (await s.c.query("SELECT id,full_name AS name FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY full_name LIMIT 500", [org])).rows as { id: string; name: string }[],
          expenses: (
            await s.c.query(
              "SELECT t.id,t.occurred_on::text,t.label,t.amount_cents FROM finance_transaction t WHERE t.organization_id=$1 AND t.direction='out' AND t.cancelled_at IS NULL AND NOT EXISTS (SELECT 1 FROM chair_intervention i WHERE i.transaction_id=t.id) ORDER BY t.occurred_on DESC LIMIT 100",
              [org],
            )
          ).rows as { id: string; occurred_on: string; label: string; amount_cents: number }[],
          grants: (await s.c.query("SELECT id,funder AS name FROM grant_application WHERE organization_id=$1 AND status IN ('granted','paid','closed') ORDER BY funder", [org])).rows as { id: string; name: string }[],
          partners: (await s.c.query("SELECT id,name FROM partner WHERE organization_id=$1 ORDER BY name", [org])).rows as { id: string; name: string }[],
          pots: (await s.c.query("SELECT id,name FROM fundraising_pot WHERE organization_id=$1 ORDER BY name", [org])).rows as { id: string; name: string }[],
        }
      : null;
    return {
      organization_id: org,
      today,
      can: { manage: s.manage, follow: s.manage || (teams?.length ?? 0) > 0 },
      rules,
      alerts: s.manage ? await alerts(s, today) : [],
      availability: s.manage || (teams?.length ?? 0) > 0 ? await availability(s, teams) : [],
      chair,
      choices,
    };
  });
}

export async function workshopExecute(db: Pool, p: Principal, cmd: WorkshopCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const org = s.a.organization_id;
      const today = brusselsToday();
      // A breakdown may be reported by whoever uses the chair; the rest is the material managers'.
      if (cmd.action === "report") {
        const ch = await chairOf(s, cmd.chairId, true);
        const mine = (await s.c.query("SELECT 1 FROM equipment_chair_assignment WHERE chair_id=$1 AND ends_on IS NULL AND profile_id=ANY($2::uuid[])", [ch.id, [...(await readableProfiles(s.c, s.a))]])).rowCount;
        if (!s.manage && !mine) throw new AccessError("NOT_FOUND", 404);
        const photo = cmd.photo ? Buffer.from(cmd.photo.data, "base64") : null;
        if (photo && (photo.length > 1048576 || !validPhoto(cmd.photo!.type, photo))) throw new AccessError("INVALID_IMAGE", 400);
        // Out of service at once: the next sessions see it, its bookings are released.
        if (usable(ch.status)) {
          await s.c.query("UPDATE equipment_chair SET status='out_of_service',version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [ch.id, org]);
          await log(s, ch.id, "breakdown", { status: ch.status }, { status: "out_of_service", description: cmd.description });
        }
        await releaseFuture(s, ch.id, "breakdown");
        const task = (
          await s.c.query(
            "INSERT INTO funding_task(organization_id,kind,category,title,detail,due_on,chair_id,origin,created_by) VALUES($1,'equipment','equipment',$2,$3,$4::date,$5,'manual',$6) RETURNING id",
            [org, `Panne : ${ch.name}`.slice(0, 200), cmd.description, today, ch.id, s.p.userId],
          )
        ).rows[0].id as string;
        const report = (
          await s.c.query("INSERT INTO chair_report(organization_id,chair_id,reporter_id,description,photo,photo_type,task_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
            org,
            ch.id,
            s.p.userId,
            cmd.description,
            photo,
            cmd.photo?.type ?? null,
            task,
          ])
        ).rows[0].id as string;
        // The material managers are told at once (application and e-mail).
        for (const u of (
          await s.c.query(
            `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id AND m.active
               JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
              WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active AND (r.role='club_president' OR 'equipment.manage'=ANY(r.grants))`,
            [org],
          )
        ).rows)
          await publish(s.c, {
            organizationId: org,
            userId: u.id,
            email: u.email,
            kind: "automation",
            category: "administrative",
            resourceType: "automation",
            resourceId: report,
            eventKey: `chair_report:${report}:${u.id}`,
            locale: u.locale,
            variables: { name: u.name, organization: s.orgName, url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/equipment/${ch.id}`, title: words[u.locale as "fr"].title.replace("{chair}", ch.name), message: `${words[u.locale as "fr"].message.replace("{chair}", ch.name)}\n${cmd.description}` },
          });
        await audit(s.c, org, s.p.userId, "equipment.report", ch.id, { report });
        return { id: report };
      }
      if (cmd.action === "book" || cmd.action === "release") {
        const teams = await followedTeams(s);
        if (!s.manage && !teams?.length) throw new AccessError("FORBIDDEN");
        if (cmd.action === "release") {
          const b = (
            await s.c.query(
              "UPDATE chair_booking b SET status='released',released_reason='released' FROM calendar_event e WHERE b.id=$1 AND b.organization_id=$2 AND b.status='booked' AND e.id=b.event_id AND ($3::uuid[] IS NULL OR e.team_id=ANY($3::uuid[])) RETURNING b.id",
              [cmd.id, org, teams],
            )
          ).rows[0];
          if (!b) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        const e = (await s.c.query("SELECT id,team_id,starts_at FROM calendar_event WHERE id=$1 AND organization_id=$2 AND status='scheduled' AND starts_at>now()", [cmd.eventId, org])).rows[0];
        if (!e || (teams && !teams.includes(e.team_id))) throw new AccessError("NOT_FOUND", 404);
        if (!(await s.c.query("SELECT 1 FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$1 AND i.profile_id=$2 AND i.withdrawn_at IS NULL", [e.id, cmd.profileId])).rowCount)
          throw new AccessError("NOT_INVITED", 400);
        const ch = await chairOf(s, cmd.chairId, true);
        if (ch.ownership !== "club" || ch.status !== "available") throw new AccessError("CHAIR_UNAVAILABLE", 409);
        // Two players asking for the same chair: the second is told, never silently moved.
        const taken = (await s.c.query("SELECT 1 FROM chair_booking WHERE chair_id=$1 AND event_id=$2 AND status='booked'", [ch.id, e.id])).rowCount;
        if (taken) throw new AccessError("CHAIR_TAKEN", 409);
        const b = (
          await s.c.query("INSERT INTO chair_booking(organization_id,chair_id,event_id,profile_id,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [org, ch.id, e.id, cmd.profileId, s.p.userId])
        ).rows[0].id as string;
        await audit(s.c, org, s.p.userId, "equipment.booked", ch.id, { event: e.id, profile: cmd.profileId });
        return { id: b };
      }
      if (!s.manage) throw new AccessError("FORBIDDEN");
      switch (cmd.action) {
        case "intervention": {
          const ch = await chairOf(s, cmd.chairId, true);
          if (cmd.occurredOn > today) throw new AccessError("INVALID_DATE", 400);
          if (cmd.kind === "speed_check" && cmd.speedKmh === null) throw new AccessError("INVALID_INPUT", 400);
          if (cmd.supplierContactId && !(await s.c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [cmd.supplierContactId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          let cost = cmd.costCents;
          if (cmd.transactionId) {
            // The invoice: an expense of the ledger, linked once (its amount, unless told otherwise).
            const t = (await s.c.query("SELECT amount_cents FROM finance_transaction WHERE id=$1 AND organization_id=$2 AND direction='out' AND cancelled_at IS NULL", [cmd.transactionId, org])).rows[0];
            if (!t) throw new AccessError("NOT_FOUND", 404);
            cost ??= t.amount_cents;
          }
          const iid = (
            await s.c.query(
              "INSERT INTO chair_intervention(organization_id,chair_id,occurred_on,kind,diagnosis,parts,supplier_contact_id,cost_cents,days_out,transaction_id,speed_kmh,checker,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
              [org, ch.id, cmd.occurredOn, cmd.kind, cmd.diagnosis, cmd.parts, cmd.supplierContactId, cost, cmd.daysOut, cmd.transactionId, cmd.kind === "speed_check" ? cmd.speedKmh : null, cmd.checker, s.p.userId],
            )
          ).rows[0].id as string;
          // A service moves the dates; a breakdown takes the chair out; a repair may give it back.
          if (cmd.kind === "service") await s.c.query("UPDATE equipment_chair SET last_service_on=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [ch.id, org, cmd.occurredOn]);
          if (cmd.kind === "speed_check") await s.c.query("UPDATE equipment_chair SET max_speed_kmh=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [ch.id, org, cmd.speedKmh]);
          if (cmd.kind === "breakdown" && usable(ch.status)) {
            await s.c.query("UPDATE equipment_chair SET status='maintenance',version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [ch.id, org]);
            await releaseFuture(s, ch.id, "breakdown");
          }
          if (cmd.backInService && (ch.status === "maintenance" || ch.status === "out_of_service")) {
            const assigned = (await s.c.query("SELECT 1 FROM equipment_chair_assignment WHERE chair_id=$1 AND ends_on IS NULL", [ch.id])).rowCount;
            await s.c.query("UPDATE equipment_chair SET status=$3,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [ch.id, org, assigned ? "in_use" : "available"]);
            await s.c.query("UPDATE chair_report SET status='closed',closed_at=now(),closed_by=$3 WHERE chair_id=$1 AND organization_id=$2 AND status='open'", [ch.id, org, s.p.userId]);
          }
          await log(s, ch.id, "intervention", null, { kind: cmd.kind, on: cmd.occurredOn, cost, daysOut: cmd.daysOut, speed: cmd.speedKmh });
          return { id: iid };
        }
        case "cancelIntervention": {
          const r = (
            await s.c.query("UPDATE chair_intervention SET cancelled_at=now(),cancel_reason=$3,transaction_id=NULL WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL RETURNING chair_id", [cmd.id, org, cmd.reason])
          ).rows[0];
          if (!r) throw new AccessError("NOT_FOUND", 404);
          await log(s, r.chair_id, "intervention.cancelled", null, { id: cmd.id, reason: cmd.reason });
          return { id: cmd.id };
        }
        case "chairExtras": {
          const ch = await chairOf(s, cmd.chairId, true);
          for (const [table, value] of [
            ["grant_application", cmd.grantId],
            ["partner", cmd.partnerId],
            ["fundraising_pot", cmd.potId],
          ] as const)
            if (value && !(await s.c.query(`SELECT 1 FROM ${table} WHERE id=$1 AND organization_id=$2`, [value, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          await s.c.query("UPDATE equipment_chair SET warranty_until=$3,purchase_value_cents=$4,grant_id=$5,partner_id=$6,pot_id=$7,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [
            ch.id,
            org,
            cmd.warrantyUntil,
            cmd.purchaseValueCents,
            cmd.grantId,
            cmd.partnerId,
            cmd.potId,
          ]);
          await log(s, ch.id, "extras", { warranty: ch.warranty_until, purchase: ch.purchase_value_cents }, { warranty: cmd.warrantyUntil, purchase: cmd.purchaseValueCents, grant: cmd.grantId, partner: cmd.partnerId, pot: cmd.potId });
          return { id: ch.id };
        }
        case "component": {
          if (cmd.chairId) await chairOf(s, cmd.chairId);
          if (cmd.id) {
            const r = await s.c.query("UPDATE chair_component SET kind=$3,label=$4,serial=$5,in_service_on=$6,chair_id=$7,notes=$8 WHERE id=$1 AND organization_id=$2 AND retired_on IS NULL", [
              cmd.id,
              org,
              cmd.kind,
              cmd.label,
              cmd.serial,
              cmd.inServiceOn,
              cmd.chairId,
              cmd.notes,
            ]);
            if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: cmd.id };
          }
          const cid = (
            await s.c.query("INSERT INTO chair_component(organization_id,kind,label,serial,in_service_on,chair_id,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [
              org,
              cmd.kind,
              cmd.label,
              cmd.serial,
              cmd.inServiceOn,
              cmd.chairId,
              cmd.notes,
              s.p.userId,
            ])
          ).rows[0].id as string;
          if (cmd.chairId) await log(s, cmd.chairId, "component", null, { kind: cmd.kind, label: cmd.label });
          return { id: cid };
        }
        case "replaceComponent": {
          const old = (await s.c.query("SELECT * FROM chair_component WHERE id=$1 AND organization_id=$2 AND retired_on IS NULL FOR UPDATE", [cmd.id, org])).rows[0];
          if (!old) throw new AccessError("NOT_FOUND", 404);
          const nid = (
            await s.c.query("INSERT INTO chair_component(organization_id,kind,label,serial,in_service_on,chair_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              org,
              old.kind,
              cmd.label,
              cmd.serial,
              cmd.on,
              old.chair_id,
              s.p.userId,
            ])
          ).rows[0].id as string;
          await s.c.query("UPDATE chair_component SET retired_on=$3,replaced_by=$4 WHERE id=$1 AND organization_id=$2", [old.id, org, cmd.on, nid]);
          // A battery replaced on a chair is an intervention of its log too.
          if (old.chair_id && old.kind === "battery")
            await s.c.query("INSERT INTO chair_intervention(organization_id,chair_id,occurred_on,kind,parts,created_by) VALUES($1,$2,$3,'battery',$4,$5)", [org, old.chair_id, cmd.on, `${old.label} → ${cmd.label}`.slice(0, 500), s.p.userId]);
          if (old.chair_id) await log(s, old.chair_id, "component.replaced", { label: old.label }, { label: cmd.label });
          return { id: nid };
        }
        case "speedRules": {
          await s.c.query("UPDATE organization SET chair_speed_limit_kmh=$2,speed_check_days=$3 WHERE id=$1", [org, cmd.limitKmh, cmd.checkDays]);
          await audit(s.c, org, s.p.userId, "equipment.speedRules", org, { limit: cmd.limitKmh, days: cmd.checkDays });
          return { id: org };
        }
        case "closeReport": {
          const r = (await s.c.query("UPDATE chair_report SET status='closed',closed_at=now(),closed_by=$3 WHERE id=$1 AND organization_id=$2 AND status='open' RETURNING id", [cmd.id, org, s.p.userId])).rows[0];
          if (!r) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}

/** The chair's bookings for future events are released when it breaks down. */
async function releaseFuture(s: Scope, chairId: string, reason: string) {
  await s.c.query(
    "UPDATE chair_booking b SET status='released',released_reason=$3 FROM calendar_event e WHERE b.chair_id=$1 AND b.organization_id=$2 AND b.status='booked' AND e.id=b.event_id AND e.starts_at>now()",
    [chairId, s.a.organization_id, reason],
  );
}
function validPhoto(type: string, b: Buffer) {
  if (type === "image/png") return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
}
const words = {
  fr: { title: "Panne signalée : {chair}", message: "Une panne a été signalée sur le fauteuil {chair}. Il est mis hors service en attendant votre contrôle." },
  nl: { title: "Defect gemeld: {chair}", message: "Er werd een defect gemeld aan rolstoel {chair}. Hij is buiten dienst tot uw controle." },
  en: { title: "Breakdown reported: {chair}", message: "A breakdown was reported on the chair {chair}. It is out of service until you check it." },
};

/** The report of one chair (cost of ownership, days out, log), for a grant file. */
export async function chairReport(db: Pool, p: Principal, chairId: string) {
  return scope(db, p, false, async (s) => {
    if (!s.manage) throw new AccessError("FORBIDDEN");
    const org = s.a.organization_id;
    const ch = (
      await s.c.query(
        "SELECT ch.name,ch.brand,ch.model,ch.serial_number,ch.acquired_on::text,ch.purchase_value_cents,ch.warranty_until::text,ga.funder AS grant,pa.name AS partner,po.name AS pot FROM equipment_chair ch LEFT JOIN grant_application ga ON ga.id=ch.grant_id AND ga.organization_id=ch.organization_id LEFT JOIN partner pa ON pa.id=ch.partner_id AND pa.organization_id=ch.organization_id LEFT JOIN fundraising_pot po ON po.id=ch.pot_id AND po.organization_id=ch.organization_id WHERE ch.id=$1 AND ch.organization_id=$2",
        [chairId, org],
      )
    ).rows[0];
    if (!ch) throw new AccessError("NOT_FOUND", 404);
    const lines = (
      await s.c.query(
        "SELECT i.occurred_on::text,i.kind,i.diagnosis,i.parts,COALESCE(sup.full_name,'') AS supplier,i.cost_cents,i.days_out,t.label AS invoice,i.cancelled_at FROM chair_intervention i LEFT JOIN contact sup ON sup.id=i.supplier_contact_id AND sup.organization_id=i.organization_id LEFT JOIN finance_transaction t ON t.id=i.transaction_id AND t.organization_id=i.organization_id WHERE i.chair_id=$1 AND i.organization_id=$2 ORDER BY i.occurred_on",
        [chairId, org],
      )
    ).rows as { occurred_on: string; kind: string; diagnosis: string; parts: string; supplier: string; cost_cents: number | null; days_out: number; invoice: string | null; cancelled_at: string | null }[];
    const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.p.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
    return { club: s.orgName, locale, chair: ch, lines: lines.filter((l) => !l.cancelled_at), cost: ownership(ch.purchase_value_cents, lines) };
  });
}
