import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { peopleExecute } from "../people/service";
import { brusselsToday } from "../people/service";
import { afterTrial, indicators, prospectCommand, type ProspectCommand } from "./schema";

/**
 * H1: the recruitment of new players. Prospects (no health datum), their
 * dated stages, the trial session with a club chair booked, the invitation,
 * the conversion into a player with his parent, the reminders, the deletion
 * after the set delay. Seen by the presidency and the « Recrutement » or
 * « Secrétaire » roles (recruitment.manage); every query on the club.
 */
type Scope = { c: PoolClient; org: string; userId: string; register: boolean; p: Principal };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    if (write) await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const r = permissions(a.role, a.grants) as readonly string[];
    if (!mfaSatisfied(!!(await account(c, p)).twoFactorEnabled) || !r.includes("recruitment.manage")) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, register: r.includes("people.manage"), p });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const rows = async <T>(c: PoolClient, sql: string, params: unknown[]) => (await c.query(sql, params)).rows as T[];

export type Prospect = {
  id: string;
  first_name: string;
  last_name: string;
  minor: boolean;
  approx_age: number | null;
  email: string;
  phone: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  source: string;
  origin_organization_id: string | null;
  origin_name: string | null;
  origin_contact_id: string | null;
  own_chair: boolean | null;
  needs_transport: boolean | null;
  notes: string;
  consent: boolean;
  stage: string;
  trial_event_id: string | null;
  trial_at: string | null;
  trial_chair: string | null;
  profile_id: string | null;
  last_contact_at: string;
  created_at: string;
  history: { stage: string; at: string }[];
};

/** Club chairs free for an event (usable, nobody's, not booked, not lent that day). */
async function freeChairs(c: PoolClient, org: string, eventId: string | null, day: string) {
  return rows<{ id: string; name: string }>(
    c,
    `SELECT ch.id,ch.name FROM equipment_chair ch
      WHERE ch.organization_id=$1 AND ch.ownership='club' AND ch.status='available'
        AND NOT EXISTS (SELECT 1 FROM equipment_chair_assignment ea WHERE ea.chair_id=ch.id AND ea.ends_on IS NULL)
        AND ($2::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM chair_booking b WHERE b.chair_id=ch.id AND b.event_id=$2 AND b.status='booked'))
        AND NOT EXISTS (SELECT 1 FROM equipment_loan l WHERE l.chair_id=ch.id AND l.status IN ('accepted','ongoing') AND $3::date BETWEEN l.starts_on AND l.ends_on)
      ORDER BY ch.name`,
    [org, eventId, day],
  );
}

export async function recruitmentView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const prospects = await rows<Prospect>(
      s.c,
      `SELECT pr.*,o.name AS origin_name,e.starts_at AS trial_at,
              (SELECT ch.name FROM chair_booking b JOIN equipment_chair ch ON ch.id=b.chair_id WHERE b.prospect_id=pr.id AND b.status='booked' ORDER BY b.created_at DESC LIMIT 1) AS trial_chair,
              COALESCE((SELECT json_agg(json_build_object('stage',h.stage,'at',h.at) ORDER BY h.at) FROM prospect_stage h WHERE h.prospect_id=pr.id),'[]') AS history
         FROM prospect pr LEFT JOIN contact_organization o ON o.id=pr.origin_organization_id LEFT JOIN calendar_event e ON e.id=pr.trial_event_id
        WHERE pr.organization_id=$1 ORDER BY pr.updated_at DESC`,
      [s.org],
    );
    // Recruitment partners and their counters (kept anonymously after a deletion).
    const partners = await rows<{ id: string; name: string; kind: string; prospects: number; registered: number }>(
      s.c,
      `SELECT o.id,o.name,o.kind,count(t.*)::int AS prospects,count(t.*) FILTER (WHERE t.registered)::int AS registered
         FROM contact_organization o LEFT JOIN recruitment_tally t ON t.origin_organization_id=o.id AND t.organization_id=o.organization_id
        WHERE o.organization_id=$1 AND (o.kind IN ('rehab','school','association') OR t.prospect_id IS NOT NULL OR t.registered) GROUP BY o.id ORDER BY count(t.*) DESC,o.name`,
      [s.org],
    );
    const organizations = await rows<{ id: string; name: string; kind: string }>(s.c, "SELECT id,name,kind FROM contact_organization WHERE organization_id=$1 ORDER BY name LIMIT 300", [s.org]);
    const sessions = await rows<{ id: string; title: string; starts_at: string; team: string | null }>(
      s.c,
      `SELECT e.id,e.title,e.starts_at,t.name AS team FROM calendar_event e LEFT JOIN team t ON t.id=e.team_id
        WHERE e.organization_id=$1 AND e.kind='training' AND e.status='scheduled' AND e.starts_at BETWEEN now() AND now()+interval '60 days' ORDER BY e.starts_at LIMIT 60`,
      [s.org],
    );
    const teams = await rows<{ id: string; name: string }>(s.c, "SELECT t.id,t.name FROM team t JOIN season se ON se.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT se.archived ORDER BY t.name", [s.org]);
    const retention = (await s.c.query("SELECT prospect_retention_months AS m FROM organization WHERE id=$1", [s.org])).rows[0].m as number;
    return { organization_id: s.org, can: { register: s.register }, prospects, partners, organizations, sessions, teams, retention, indicators: await indicatorsOf(s.c, s.org) };
  });
}
/** By source: prospects, trial and registration rates, players still there a season later. */
export async function indicatorsOf(c: PoolClient, org: string, from?: string, to?: string) {
  const tally = await rows<{ source: string; reached_trial: boolean; registered: boolean }>(
    c,
    "SELECT source,reached_trial,registered FROM recruitment_tally WHERE organization_id=$1 AND ($2::date IS NULL OR created_on>=$2::date) AND ($3::date IS NULL OR created_on<=$3::date)",
    [org, from ?? null, to ?? null],
  );
  const kept = await rows<{ source: string; still: boolean }>(
    c,
    `SELECT cp.recruitment_source AS source,
            (cp.status='active' AND EXISTS (SELECT 1 FROM team_membership m WHERE m.profile_id=cp.id AND m.role='player' AND NOT m.cancelled AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE))) AS still
       FROM club_person cp WHERE cp.organization_id=$1 AND cp.recruitment_source IS NOT NULL AND cp.joined_on<=CURRENT_DATE-365`,
    [org],
  );
  return indicators(tally, kept);
}

async function setStage(s: Scope, id: string, stage: string) {
  const r = await s.c.query("UPDATE prospect SET stage=$3,last_contact_at=now(),updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [id, s.org, stage]);
  if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
  await s.c.query("INSERT INTO prospect_stage(prospect_id,stage,by_user) VALUES($1,$2,$3)", [id, stage, s.userId]);
  await s.c.query("UPDATE recruitment_tally SET reached_trial=reached_trial OR $2,registered=registered OR $3 WHERE prospect_id=$1", [id, (afterTrial as string[]).includes(stage), stage === "registered"]);
}
async function origins(s: Scope, cmd: { originOrganizationId: string | null; originContactId: string | null }) {
  if (cmd.originOrganizationId && !(await s.c.query("SELECT 1 FROM contact_organization WHERE id=$1 AND organization_id=$2", [cmd.originOrganizationId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
  if (cmd.originContactId && !(await s.c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [cmd.originContactId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
}

const invitation = {
  title: { fr: "Séance d'essai de powerchair football", nl: "Proeftraining powerchair football", en: "Powerchair football trial session" },
  message: {
    fr: "{name} est attendu(e) le {when}, {place}. À apporter : {bring}. Les questions des parents ont leurs réponses dans le guide joint.",
    nl: "{name} wordt verwacht op {when}, {place}. Mee te brengen: {bring}. De vragen van ouders worden beantwoord in de bijgevoegde gids.",
    en: "{name} is expected on {when}, {place}. To bring: {bring}. Parents' questions are answered in the guide attached.",
  },
  chair: { fr: "un fauteuil du club est réservé", nl: "een rolstoel van de club is gereserveerd", en: "a club chair is booked" },
  sport: { fr: "une tenue de sport", nl: "sportkleding", en: "sportswear" },
};

export async function recruitmentExecute(db: Pool, p: Principal, raw: z.input<typeof prospectCommand>, expected: string) {
  const cmd: ProspectCommand = prospectCommand.parse(raw);
  if (cmd.action === "register") return register(db, p, cmd.id, expected);
  return scope(
    db,
    p,
    true,
    async (s) => {
      switch (cmd.action) {
        case "create": {
          await origins(s, cmd);
          const id = (
            await s.c.query(
              `INSERT INTO prospect(organization_id,first_name,last_name,minor,approx_age,email,phone,parent_name,parent_email,parent_phone,source,origin_organization_id,origin_contact_id,own_chair,needs_transport,notes,consent,created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
              [s.org, cmd.firstName, cmd.lastName, cmd.minor, cmd.approxAge, cmd.email, cmd.phone, cmd.parentName, cmd.parentEmail, cmd.parentPhone, cmd.source, cmd.originOrganizationId, cmd.originContactId, cmd.ownChair, cmd.needsTransport, cmd.notes, cmd.consent, s.userId],
            )
          ).rows[0].id as string;
          await s.c.query("INSERT INTO prospect_stage(prospect_id,stage,by_user) VALUES($1,'first_contact',$2)", [id, s.userId]);
          await s.c.query("INSERT INTO recruitment_tally(organization_id,source,origin_organization_id,created_on,prospect_id) VALUES($1,$2,$3,CURRENT_DATE,$4)", [s.org, cmd.source, cmd.originOrganizationId, id]);
          await audit(s.c, s.org, s.userId, "prospect.created", id);
          return { id };
        }
        case "update": {
          await origins(s, cmd);
          const r = await s.c.query(
            `UPDATE prospect SET first_name=$3,last_name=$4,minor=$5,approx_age=$6,email=$7,phone=$8,parent_name=$9,parent_email=$10,parent_phone=$11,source=$12,origin_organization_id=$13,origin_contact_id=$14,own_chair=$15,needs_transport=$16,notes=$17,consent=$18,updated_at=now()
              WHERE id=$1 AND organization_id=$2`,
            [cmd.id, s.org, cmd.firstName, cmd.lastName, cmd.minor, cmd.approxAge, cmd.email, cmd.phone, cmd.parentName, cmd.parentEmail, cmd.parentPhone, cmd.source, cmd.originOrganizationId, cmd.originContactId, cmd.ownChair, cmd.needsTransport, cmd.notes, cmd.consent],
          );
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await s.c.query("UPDATE recruitment_tally SET source=$2,origin_organization_id=$3 WHERE prospect_id=$1", [cmd.id, cmd.source, cmd.originOrganizationId]);
          return { id: cmd.id };
        }
        case "stage":
          if (cmd.stage === "registered") throw new AccessError("USE_REGISTER", 400);
          await setStage(s, cmd.id, cmd.stage);
          return { id: cmd.id };
        case "contacted": {
          const r = await s.c.query("UPDATE prospect SET last_contact_at=now(),updated_at=now() WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "trial":
          return trial(s, cmd);
        case "delete": {
          const r = await s.c.query("DELETE FROM prospect WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, "prospect.deleted", cmd.id);
          return { id: cmd.id };
        }
        case "retention":
          await s.c.query("UPDATE organization SET prospect_retention_months=$2 WHERE id=$1", [s.org, cmd.months]);
          return { ok: true };
        case "presentReminder": {
          const o = (await s.c.query("SELECT name FROM contact_organization WHERE id=$1 AND organization_id=$2", [cmd.organizationId, s.org])).rows[0];
          if (!o) throw new AccessError("NOT_FOUND", 404);
          const open = (await s.c.query("SELECT id FROM task WHERE organization_id=$1 AND source_kind='presentClub' AND status<>'done' AND source_params->>'organization'=$2", [s.org, cmd.organizationId])).rows[0];
          if (open) {
            await s.c.query("UPDATE task SET due_on=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [open.id, s.org, cmd.dueOn]);
            return { id: open.id as string };
          }
          const id = (
            await s.c.query(
              "INSERT INTO task(organization_id,kind,category,title,due_on,responsible_user_id,origin,recurrence,created_by,source_kind,source_params) VALUES($1,'other','sport',$2,$3,$4,'manual','yearly',$4,'presentClub',$5::jsonb) RETURNING id",
              [s.org, `Présenter le club : ${o.name}`.slice(0, 200), cmd.dueOn, s.userId, JSON.stringify({ about: o.name, organization: cmd.organizationId })],
            )
          ).rows[0].id as string;
          return { id };
        }
      }
    },
    expected,
  );
}

async function trial(s: Scope, cmd: Extract<ProspectCommand, { action: "trial" }>) {
  const pr = (await s.c.query("SELECT * FROM prospect WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.id, s.org])).rows[0];
  if (!pr) throw new AccessError("NOT_FOUND", 404);
  let event = cmd.eventId
    ? (await s.c.query("SELECT e.id,e.starts_at,COALESCE(pl.name,e.free_location,'') AS place FROM calendar_event e LEFT JOIN calendar_place pl ON pl.id=e.place_id WHERE e.id=$1 AND e.organization_id=$2 AND e.status='scheduled' AND e.starts_at>now()", [cmd.eventId, s.org])).rows[0]
    : null;
  if (cmd.eventId && !event) throw new AccessError("NOT_FOUND", 404);
  if (!event) {
    if (!cmd.startsAt || new Date(cmd.startsAt) <= new Date()) throw new AccessError("INVALID_DATE", 400);
    if (cmd.teamId && !(await s.c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2", [cmd.teamId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    const series = (await s.c.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [s.org, s.userId])).rows[0].id;
    event = (
      await s.c.query(
        `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility)
         VALUES($1,$2,1,$3,'training','Europe/Brussels',$4::timestamptz,$4::timestamptz+interval '90 minutes',
                to_char($4::timestamptz AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char(($4::timestamptz+interval '90 minutes') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),
                $5,$6,$7) RETURNING id,starts_at,'' AS place`,
        [s.org, series, `Séance d'essai : ${pr.first_name}`.slice(0, 120), cmd.startsAt, cmd.teamId, s.userId, cmd.teamId ? "team" : "organization"],
      )
    ).rows[0];
  }
  // A club chair, free that day, booked in the equipment module for the prospect.
  if (cmd.chairId) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(event.starts_at));
    if (!(await freeChairs(s.c, s.org, event.id, day)).some((c) => c.id === cmd.chairId)) throw new AccessError("CHAIR_TAKEN", 409);
    await s.c.query("UPDATE chair_booking SET status='released',released_reason='trial moved' WHERE prospect_id=$1 AND status='booked'", [pr.id]);
    await s.c.query("INSERT INTO chair_booking(organization_id,chair_id,event_id,prospect_id,created_by) VALUES($1,$2,$3,$4,$5)", [s.org, cmd.chairId, event.id, pr.id, s.userId]);
  }
  await s.c.query("UPDATE prospect SET trial_event_id=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [pr.id, s.org, event.id]);
  await setStage(s, pr.id, "trial_planned");
  // The invitation, to the prospect or to his parent.
  const to = pr.minor ? pr.parent_email : pr.email || pr.parent_email;
  let sent = false;
  if (to) {
    const l = cmd.locale;
    const org = (await s.c.query("SELECT name FROM organization WHERE id=$1", [s.org])).rows[0].name as string;
    const when = new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(event.starts_at));
    const bring = [cmd.bring || invitation.sport[l], ...(cmd.chairId ? [invitation.chair[l]] : [])].join(", ");
    await publish(s.c, {
      organizationId: s.org,
      userId: null,
      email: to,
      kind: "automation",
      category: "sport",
      resourceType: "automation",
      resourceId: `prospect:${pr.id}`,
      eventKey: `prospect:${pr.id}:trial:${event.id}`,
      locale: l,
      variables: {
        name: pr.minor ? pr.parent_name : pr.first_name,
        title: invitation.title[l],
        message: invitation.message[l].replace("{name}", pr.first_name).replace("{when}", when).replace("{place}", event.place || org).replace("{bring}", bring),
        organization: org,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${l}/guide/parents-faq`,
      },
    });
    sent = true;
  }
  await audit(s.c, s.org, s.userId, "prospect.trial", pr.id, { event: event.id, chair: cmd.chairId, sent });
  return { id: pr.id, eventId: event.id as string, sent };
}

/** « Inscrire »: the player (and his parent, point 8) made from the prospect, nothing typed again. */
async function register(db: Pool, p: Principal, id: string, expected: string) {
  const pr = await scope(db, p, false, async (s) => {
    if (!s.register) throw new AccessError("FORBIDDEN");
    const r = (await s.c.query("SELECT * FROM prospect WHERE id=$1 AND organization_id=$2", [id, s.org])).rows[0];
    if (!r) throw new AccessError("NOT_FOUND", 404);
    if (r.profile_id) throw new AccessError("DUPLICATE", 409);
    return r;
  }, expected);
  const name = `${pr.first_name} ${pr.last_name}`.trim();
  const out = await peopleExecute(
    db,
    p,
    {
      action: "createPerson",
      fullName: name.length >= 2 ? name : `${name} ·`,
      birthDate: null,
      email: pr.minor ? "" : pr.email,
      phone: pr.minor ? "" : pr.phone,
      joinedOn: brusselsToday(),
      directoryRoles: ["player"],
      hasRepresentative: !!pr.parent_name,
      representatives: pr.parent_name ? [{ fullName: pr.parent_name, relation: "guardian", email: pr.parent_email, phone: pr.parent_phone, rights: "legal" }] : [],
      inviteRepresentatives: false,
    } as never,
    expected,
  );
  return scope(
    db,
    p,
    true,
    async (s) => {
      await s.c.query("UPDATE club_person SET recruitment_source=$3,recruitment_organization_id=$4 WHERE id=$1 AND organization_id=$2", [out.id, s.org, pr.source, pr.origin_organization_id]);
      await s.c.query("UPDATE prospect SET profile_id=$3 WHERE id=$1 AND organization_id=$2", [id, s.org, out.id]);
      await setStage(s, id, "registered");
      return { id, profileId: out.id as string };
    },
    expected,
  );
}

/** Three days after the trial, « Rappeler »; after 30 days without news, a reminder (once per silence); past the delay, the deletion. */
export async function recruitmentTick(db: Pool) {
  const c = await db.connect();
  let n = 0;
  try {
    await c.query("BEGIN");
    const call = await c.query(
      `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_user_id,origin,created_by,source_key,source_kind,source_params)
       SELECT pr.organization_id,'other','sport','Rappeler '||pr.first_name,CURRENT_DATE,pr.created_by,'manual',pr.created_by,'prospect:'||pr.id||':call','prospectCall',json_build_object('about',pr.first_name)::jsonb
         FROM prospect pr WHERE pr.stage='trial_done' AND (SELECT max(h.at) FROM prospect_stage h WHERE h.prospect_id=pr.id AND h.stage='trial_done')<=now()-interval '3 days'
       ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,
    );
    const silent = await c.query(
      `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_user_id,origin,created_by,source_key,source_kind,source_params)
       SELECT pr.organization_id,'other','sport','Relancer '||pr.first_name,CURRENT_DATE,pr.created_by,'manual',pr.created_by,'prospect:'||pr.id||':silent:'||to_char(pr.last_contact_at,'YYYY-MM-DD'),'prospectSilent',json_build_object('about',pr.first_name)::jsonb
         FROM prospect pr WHERE pr.stage NOT IN ('registered','not_now') AND pr.last_contact_at<=now()-interval '30 days'
       ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,
    );
    // GDPR: the prospects never registered, without contact for the club's delay, go (their anonymous tally stays).
    const purge = await c.query(
      `DELETE FROM prospect pr USING organization o WHERE o.id=pr.organization_id AND pr.profile_id IS NULL
          AND pr.last_contact_at < now() - make_interval(months => o.prospect_retention_months)`,
    );
    n = (call.rowCount ?? 0) + (silent.rowCount ?? 0) + (purge.rowCount ?? 0);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return n;
}

/** The chairs free for a trial (an existing session, or a day). */
export async function trialChairs(db: Pool, p: Principal, eventId: string | null, day: string | null) {
  return scope(db, p, false, async (s) => {
    let date = day;
    if (eventId) {
      const e = (await s.c.query("SELECT starts_at FROM calendar_event WHERE id=$1 AND organization_id=$2", [eventId, s.org])).rows[0];
      if (!e) throw new AccessError("NOT_FOUND", 404);
      date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(e.starts_at));
    }
    if (!date) throw new AccessError("INVALID_INPUT", 400);
    return freeChairs(s.c, s.org, eventId, date);
  });
}
