import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  AccessError,
  account,
  active,
  audit,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { brusselsToday } from "../people/service";
import {
  audience,
  canWrite,
  manager,
  type Actor,
  type Event,
} from "../calendar/access";
import { emailHash } from "./hash";
import {
  eventMailState,
  fillPlaceholders,
  hasContent,
  pickContacts,
  renderNewsletter,
  type Block,
  type CommunicationCommand,
  type Contact,
  type GuardianContact,
  type NewsEvent,
  type PersonContact,
} from "./schema";

type Scope = {
  c: PoolClient;
  a: Actor;
  org: string;
  orgName: string;
  userId: string;
  /** Newsletters, groups, sender, alumni (notifications.manage). */
  manage: boolean;
  /** May prepare event mails (calendar managers and coaches). */
  planner: boolean;
};
const MAX_RECIPIENTS = 2000;
const tag = (l: string) => (l === "en" ? "en-GB" : `${l}-BE`);

async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: Scope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const first = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [first.organization_id],
    );
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const a0 = await active(c, p);
    if (
      a0.organization_id !== first.organization_id ||
      (expected && expected !== a0.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a0.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const a: Actor = { ...a0, twoFactorEnabled: !!user.twoFactorEnabled };
    const s: Scope = {
      c,
      a,
      org: a0.organization_id,
      orgName: a0.organization_name,
      userId: p.userId,
      manage: mfa && permissions(a0.role, a0.grants).includes("notifications.manage"),
      planner: manager(a) || (mfa && a0.role === "coach"),
    };
    if (!s.manage && !s.planner)
      throw new AccessError(mfa ? "FORBIDDEN" : "MFA_REQUIRED");
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new AccessError("DUPLICATE", 409);
    if (code === "23514") throw new AccessError("INVALID_INPUT", 400);
    throw e;
  } finally {
    c.release();
  }
}
const needManage = (s: Scope) => {
  if (!s.manage) throw new AccessError("FORBIDDEN");
};

type Group = {
  id: string;
  name: string;
  audiences: string[];
  team_ids: string[];
  profile_ids: string[];
  archived: boolean;
  version: number;
};
/** Profiles covered by a group today (resolved at each sending). */
export async function groupProfiles(
  c: PoolClient,
  org: string,
  g: Pick<Group, "audiences" | "team_ids" | "profile_ids">,
) {
  return (
    await c.query(
      `WITH cur AS (
         SELECT m.profile_id,m.role FROM team_membership m JOIN team t ON t.id=m.team_id
          WHERE m.organization_id=$1 AND NOT m.cancelled AND m.closed_at IS NULL AND NOT t.archived
            AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)
            AND (cardinality($2::uuid[])=0 OR m.team_id=ANY($2::uuid[])))
       SELECT c.id FROM club_person c WHERE c.organization_id=$1 AND (
         ('players'=ANY($3::text[]) AND c.status='active' AND (EXISTS(SELECT 1 FROM cur WHERE cur.profile_id=c.id AND cur.role='player')
            OR (cardinality($2::uuid[])=0 AND 'player'=ANY(c.directory_roles) AND NOT 'player'=ANY(c.former_roles))))
         OR ('coaches'=ANY($3::text[]) AND c.status='active' AND (EXISTS(SELECT 1 FROM cur WHERE cur.profile_id=c.id AND cur.role IN ('coach','assistant'))
            OR (cardinality($2::uuid[])=0 AND 'coach'=ANY(c.directory_roles) AND NOT 'coach'=ANY(c.former_roles))))
         OR ('volunteers'=ANY($3::text[]) AND c.status='active' AND EXISTS(SELECT 1 FROM cur WHERE cur.profile_id=c.id AND cur.role='volunteer'))
         OR ('guardians'=ANY($3::text[]) AND c.status='active' AND EXISTS(
              SELECT 1 FROM guardian_relationship g JOIN club_person s ON s.id=g.subject_profile_id
               WHERE g.guardian_profile_id=c.id AND g.organization_id=$1 AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE
                 AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND s.status='active'
                 AND (cardinality($2::uuid[])=0 OR EXISTS(SELECT 1 FROM cur WHERE cur.profile_id=s.id))))
         OR ('staff'=ANY($3::text[]) AND c.status='active' AND EXISTS(
              SELECT 1 FROM person p JOIN role_assignment r ON r.user_id=p.user_id
               WHERE p.id=c.person_id AND r.organization_id=$1 AND r.revoked_at IS NULL AND r.valid_from<=now()
                 AND (r.valid_until IS NULL OR r.valid_until>now()) AND (r.role='club_president' OR cardinality(r.grants)>0)))
         OR ('alumni'=ANY($3::text[]) AND c.status IN ('inactive','archived'))
         OR (c.id=ANY($4::uuid[]) AND c.status<>'transferred'))
       ORDER BY c.id`,
      [org, g.team_ids, g.audiences, g.profile_ids],
    )
  ).rows.map((r) => r.id as string);
}
/** Addresses to write to about these people (see pickContacts). */
export async function contactsFor(
  c: PoolClient,
  org: string,
  profileIds: string[],
): Promise<Contact[]> {
  if (!profileIds.length) return [];
  const people = (
    await c.query(
      `SELECT c.id AS profile_id,c.full_name,c.birth_date::text AS birth_date,c.email AS file_email,u.id AS user_id,u.email AS user_email,u.name AS user_name,COALESCE(pe.locale,'fr') AS locale
         FROM club_person c JOIN person pe ON pe.id=c.person_id LEFT JOIN "user" u ON u.id=pe.user_id AND u.active
        WHERE c.organization_id=$1 AND c.id=ANY($2::uuid[])`,
      [org, profileIds],
    )
  ).rows as PersonContact[];
  const guardians = (
    await c.query(
      `SELECT g.subject_profile_id,gp.id AS profile_id,gp.full_name,gp.birth_date::text AS birth_date,gp.email AS file_email,u.id AS user_id,u.email AS user_email,u.name AS user_name,COALESCE(pe.locale,'fr') AS locale
         FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id
         LEFT JOIN "user" u ON u.id=pe.user_id AND u.active
        WHERE g.organization_id=$1 AND g.subject_profile_id=ANY($2::uuid[]) AND g.revoked_at IS NULL
          AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND gp.status='active'`,
      [org, profileIds],
    )
  ).rows as GuardianContact[];
  return pickContacts(people, guardians, brusselsToday());
}
async function unsubscribed(c: PoolClient, org: string) {
  return new Set(
    (
      await c.query(
        "SELECT email_hash FROM mail_unsubscribe WHERE organization_id=$1",
        [org],
      )
    ).rows.map((r) => r.email_hash as string),
  );
}
const eventColumns = `e.*,COALESCE(v.name,NULLIF(e.free_location,''),p.name) AS place_name,COALESCE(v.address,p.address) AS place_address,t.name AS team_name`;
const eventJoins = `FROM calendar_event e LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id LEFT JOIN team t ON t.id=e.team_id`;
type EventRow = Event & {
  place_name: string | null;
  place_address: string | null;
  team_name: string | null;
};
const placeOf = (e: EventRow) =>
  [e.place_name, e.place_address].filter(Boolean).join(", ");
const when = (d: Date | string, locale: string) =>
  new Intl.DateTimeFormat(tag(locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(new Date(d));

async function newsEvents(c: PoolClient, org: string, ids: string[], locale: string) {
  if (!ids.length) return [] as NewsEvent[];
  // Only events open to the whole club can appear in a newsletter.
  return (
    (
      await c.query(
        `SELECT ${eventColumns} ${eventJoins} WHERE e.organization_id=$1 AND e.id=ANY($2::uuid[]) AND e.status='scheduled' AND e.visibility='organization'`,
        [org, ids],
      )
    ).rows as EventRow[]
  ).map((e) => ({
    id: e.id,
    title: e.title,
    when: when(e.starts_at, locale),
    place: placeOf(e),
  }));
}

export async function communicationView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const { c, org } = s;
    const sender = (
      await c.query(
        "SELECT name,mail_sender_name,COALESCE(mail_reply_to,'') AS mail_reply_to,COALESCE(contact_email,'') AS contact_email FROM organization WHERE id=$1",
        [org],
      )
    ).rows[0] as {
      name: string;
      mail_sender_name: string;
      mail_reply_to: string;
      contact_email: string;
    };
    const groups = s.manage || s.planner
      ? ((
          await c.query(
            "SELECT id,name,audiences,team_ids,profile_ids,archived,version FROM recipient_group WHERE organization_id=$1 ORDER BY archived,name",
            [org],
          )
        ).rows as Group[])
      : [];
    const groupSizes: Record<string, number> = {};
    if (s.manage)
      for (const g of groups.filter((x) => !x.archived))
        groupSizes[g.id] = (await groupProfiles(c, org, g)).length;
    // Event mails: those of events this actor may plan.
    const mailRows = (
      await c.query(
        `SELECT m.id,m.event_id,m.group_id,m.subject,m.body,m.send_at,m.event_version,m.event_start,m.event_place,m.status,m.version,m.sent_at,m.recipients,u.name AS author
           FROM event_mail m JOIN "user" u ON u.id=m.created_by
          WHERE m.organization_id=$1 AND (m.status='scheduled' OR m.updated_at>now()-interval '60 days')
          ORDER BY m.status='scheduled' DESC,m.send_at`,
        [org],
      )
    ).rows;
    const eventMails = [];
    for (const r of mailRows) {
      const event = (
        await c.query(`SELECT ${eventColumns} ${eventJoins} WHERE e.id=$1`, [r.event_id])
      ).rows[0] as EventRow;
      if (!(await canWrite(c, s.a, event))) continue;
      eventMails.push({
        id: r.id as string,
        event_id: r.event_id as string,
        group_id: r.group_id as string | null,
        subject: r.subject as string,
        body: r.body as string,
        send_at: r.send_at as string,
        status: r.status as string,
        version: r.version as number,
        sent_at: r.sent_at as string | null,
        recipients: r.recipients as number,
        author: r.author as string,
        state: eventMailState(
          { status: r.status, event_version: r.event_version },
          { status: event.status, version: event.version },
        ),
        event: {
          title: event.title,
          local_start: event.local_start,
          place: placeOf(event),
          team: event.team_name,
        },
        prepared: { local_start: r.event_start as string, place: r.event_place as string },
      });
    }
    const upcoming = (
      await c.query(
        `SELECT ${eventColumns} ${eventJoins} WHERE e.organization_id=$1 AND e.status='scheduled' AND e.starts_at>now() AND e.starts_at<now()+interval '120 days' ORDER BY e.starts_at LIMIT 200`,
        [org],
      )
    ).rows as EventRow[];
    const plannable = [];
    for (const e of upcoming)
      if (await canWrite(c, s.a, e))
        plannable.push({
          id: e.id,
          title: e.title,
          local_start: e.local_start,
          starts_at: e.starts_at,
          team: e.team_name,
          place: placeOf(e),
          audience: (await audience(c, e)).length,
        });
    const stops = new Map<string, string>(
      s.manage
        ? (
            await c.query(
              "SELECT email_hash,source FROM mail_unsubscribe WHERE organization_id=$1",
              [org],
            )
          ).rows.map((r) => [r.email_hash as string, r.source as string])
        : [],
    );
    return {
      organization_id: org,
      can: { manage: s.manage, plan: s.planner },
      sender: s.manage ? sender : null,
      groups: groups.map((g) => ({ ...g, size: groupSizes[g.id] ?? null })),
      teams: (
        await c.query(
          "SELECT t.id,t.name,s.name AS season FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived ORDER BY s.starts_on DESC,t.name",
          [org],
        )
      ).rows as { id: string; name: string; season: string }[],
      people: s.manage
        ? ((
            await c.query(
              "SELECT id,full_name,status FROM club_person WHERE organization_id=$1 AND status<>'transferred' ORDER BY full_name",
              [org],
            )
          ).rows as { id: string; full_name: string; status: string }[])
        : [],
      newsletters: s.manage
        ? (
            await c.query(
              'SELECT n.id,n.subject,n.blocks,n.group_ids,n.include_alumni,n.status,n.version,n.updated_at,n.sent_at,n.recipients,u.name AS author FROM newsletter n JOIN "user" u ON u.id=n.created_by WHERE n.organization_id=$1 ORDER BY n.status,COALESCE(n.sent_at,n.updated_at) DESC LIMIT 100',
              [org],
            )
          ).rows.map((n) => ({
            ...n,
            blocks: n.blocks as Block[],
          })) as {
            id: string;
            subject: string;
            blocks: Block[];
            group_ids: string[];
            include_alumni: boolean;
            status: "draft" | "sent";
            version: number;
            updated_at: string;
            sent_at: string | null;
            recipients: number;
            author: string;
          }[]
        : [],
      clubEvents: s.manage
        ? upcoming
            .filter((e) => e.visibility === "organization")
            .map((e) => ({ id: e.id, title: e.title, local_start: e.local_start, place: placeOf(e) }))
        : [],
      plannable,
      eventMails,
      alumni: s.manage
        ? (
            await c.query(
              `SELECT c.id,c.full_name,c.status,c.updated_at::date::text AS left_on,
                      COALESCE(u.email,NULLIF(c.email,'')) AS address,'player'=ANY(c.former_roles) AS former_player
                 FROM club_person c JOIN person pe ON pe.id=c.person_id LEFT JOIN "user" u ON u.id=pe.user_id AND u.active
                WHERE c.organization_id=$1 AND c.status IN ('inactive','archived') ORDER BY c.full_name`,
              [org],
            )
          ).rows.map((r) => ({
            id: r.id as string,
            full_name: r.full_name as string,
            status: r.status as string,
            left_on: r.left_on as string,
            former_player: r.former_player as boolean,
            reachable: !!r.address,
            unsubscribed: !!r.address && stops.has(emailHash(r.address)),
            /** "link": asked by the person; only they can undo it. */
            stop_source: r.address ? (stops.get(emailHash(r.address)) ?? null) : null,
          }))
        : [],
      unsubscribedCount: stops.size,
    };
  });
}

async function eventFor(s: Scope, id: string) {
  const e = (
    await s.c.query(
      `SELECT ${eventColumns} ${eventJoins} WHERE e.id=$1 AND e.organization_id=$2`,
      [id, s.org],
    )
  ).rows[0] as EventRow | undefined;
  if (!e) throw new AccessError("NOT_FOUND", 404);
  if (!(await canWrite(s.c, s.a, e))) throw new AccessError("FORBIDDEN");
  return e;
}
async function mailFor(s: Scope, id: string) {
  const m = (
    await s.c.query(
      "SELECT * FROM event_mail WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [id, s.org],
    )
  ).rows[0];
  if (!m) throw new AccessError("NOT_FOUND", 404);
  const e = await eventFor(s, m.event_id);
  return { m, e };
}
async function groupFor(s: Scope, id: string) {
  const g = (
    await s.c.query(
      "SELECT * FROM recipient_group WHERE id=$1 AND organization_id=$2 AND NOT archived",
      [id, s.org],
    )
  ).rows[0] as Group | undefined;
  if (!g) throw new AccessError("NOT_FOUND", 404);
  return g;
}

/** Sends a prepared event mail now (button or worker). */
export async function deliverEventMail(
  c: PoolClient,
  mailId: string,
  actorId: string,
) {
  const m = (
    await c.query("SELECT * FROM event_mail WHERE id=$1 FOR UPDATE", [mailId])
  ).rows[0];
  if (!m || m.status !== "scheduled") return 0;
  const e = (
    await c.query(`SELECT ${eventColumns} ${eventJoins} WHERE e.id=$1`, [m.event_id])
  ).rows[0] as EventRow;
  const state = eventMailState(m, e);
  if (state !== "scheduled") throw new AccessError(state === "review" ? "EVENT_CHANGED" : "EVENT_CANCELLED", 409);
  const org = (
    await c.query("SELECT name FROM organization WHERE id=$1", [m.organization_id])
  ).rows[0].name as string;
  const profiles = m.group_id
    ? await groupProfiles(
        c,
        m.organization_id,
        (await c.query("SELECT * FROM recipient_group WHERE id=$1", [m.group_id])).rows[0],
      )
    : (await audience(c, e)).map((x) => x.id);
  const contacts = (await contactsFor(c, m.organization_id, profiles)).slice(0, MAX_RECIPIENTS);
  const base = process.env.BETTER_AUTH_URL ?? "";
  for (const to of contacts) {
    const vars = {
      name: to.name,
      event: e.title,
      date: when(e.starts_at, to.locale),
      place: placeOf(e),
    };
    await publish(c, {
      organizationId: m.organization_id,
      userId: to.userId,
      email: to.email,
      kind: "event_mail",
      category: "sport",
      resourceType: "event_mail",
      resourceId: m.id,
      eventKey: "event_mail:" + m.id,
      locale: to.locale,
      variables: {
        name: to.name,
        organization: org,
        url: `${base}/${to.locale}/calendar`,
        title: fillPlaceholders(m.subject, vars).replace(/[\r\n]/g, " "),
        message: fillPlaceholders(m.body, vars),
      },
    });
  }
  await c.query(
    "UPDATE event_mail SET status='sent',sent_at=now(),recipients=$2,updated_at=now(),version=version+1 WHERE id=$1",
    [m.id, contacts.length],
  );
  await audit(c, m.organization_id, actorId, "communication.eventMail.sent", m.id);
  return contacts.length;
}

/** Worker: sends the event mails whose time has come and whose event did not move. */
export async function eventMailTick(db: Pool) {
  const due = (
    await db.query(
      `SELECT m.id,m.created_by FROM event_mail m JOIN calendar_event e ON e.id=m.event_id JOIN organization o ON o.id=m.organization_id
        WHERE m.status='scheduled' AND m.send_at<=now() AND e.status='scheduled' AND e.version=m.event_version
          AND NOT ('communication'=ANY(o.disabled_modules)) ORDER BY m.send_at LIMIT 20`,
    )
  ).rows as { id: string; created_by: string }[];
  let sent = 0;
  for (const row of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
      const org = (
        await c.query("SELECT organization_id FROM event_mail WHERE id=$1", [row.id])
      ).rows[0].organization_id;
      await c.query("SELECT id FROM organization WHERE id=$1 FOR SHARE", [org]);
      // An event already over gets nothing: the mail is closed instead.
      const late = (
        await c.query(
          "SELECT 1 FROM event_mail m JOIN calendar_event e ON e.id=m.event_id WHERE m.id=$1 AND e.ends_at<now()",
          [row.id],
        )
      ).rowCount;
      if (late)
        await c.query(
          "UPDATE event_mail SET status='cancelled',updated_at=now(),version=version+1 WHERE id=$1 AND status='scheduled'",
          [row.id],
        );
      else sent += (await deliverEventMail(c, row.id, row.created_by)) ? 1 : 0;
      await c.query("COMMIT");
    } catch {
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
  }
  return sent;
}

export async function communicationExecute(
  db: Pool,
  p: Principal,
  input: CommunicationCommand,
  expected: string,
) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const { c, org } = s;
      const done = async (action: string, id: string) => {
        await audit(c, org, s.userId, "communication." + action, id);
        return { id };
      };
      if (input.action === "sender") {
        needManage(s);
        await c.query(
          "UPDATE organization SET mail_sender_name=$2,mail_reply_to=$3 WHERE id=$1",
          [org, input.senderName, input.replyTo || null],
        );
        return done("sender", org);
      }
      if (input.action === "group") {
        needManage(s);
        const teams = (
          await c.query(
            "SELECT count(*)::int AS n FROM team WHERE organization_id=$1 AND id=ANY($2::uuid[])",
            [org, input.teamIds],
          )
        ).rows[0].n;
        const people = (
          await c.query(
            "SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND id=ANY($2::uuid[])",
            [org, input.profileIds],
          )
        ).rows[0].n;
        if (
          teams !== new Set(input.teamIds).size ||
          people !== new Set(input.profileIds).size
        )
          throw new AccessError("NOT_FOUND", 404);
        if (!input.audiences.length && !input.profileIds.length)
          throw new AccessError("INVALID_INPUT", 400);
        const values = [
          [...new Set(input.audiences)],
          [...new Set(input.teamIds)],
          [...new Set(input.profileIds)],
        ];
        if (input.id) {
          const r = await c.query(
            "UPDATE recipient_group SET name=$3,audiences=$4,team_ids=$5,profile_ids=$6,archived=$7,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND version=$8 RETURNING id",
            [input.id, org, input.name, ...values, input.archived, input.expectedVersion ?? 0],
          );
          if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
          return done("group", input.id);
        }
        const id = (
          await c.query(
            "INSERT INTO recipient_group(organization_id,name,audiences,team_ids,profile_ids,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [org, input.name, ...values, s.userId],
          )
        ).rows[0].id as string;
        return done("group", id);
      }
      if (input.action === "newsletter") {
        needManage(s);
        for (const g of input.groupIds) await groupFor(s, g);
        if (input.id) {
          const r = await c.query(
            "UPDATE newsletter SET subject=$3,blocks=$4,group_ids=$5,include_alumni=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND status='draft' AND version=$7 RETURNING id",
            [
              input.id,
              org,
              input.subject,
              JSON.stringify(input.blocks),
              [...new Set(input.groupIds)],
              input.includeAlumni,
              input.expectedVersion ?? 0,
            ],
          );
          if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
          return done("newsletter", input.id);
        }
        const id = (
          await c.query(
            "INSERT INTO newsletter(organization_id,subject,blocks,group_ids,include_alumni,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              org,
              input.subject,
              JSON.stringify(input.blocks),
              [...new Set(input.groupIds)],
              input.includeAlumni,
              s.userId,
            ],
          )
        ).rows[0].id as string;
        return done("newsletter", id);
      }
      if (input.action === "deleteNewsletter") {
        needManage(s);
        const r = await c.query(
          "DELETE FROM newsletter WHERE id=$1 AND organization_id=$2 AND status='draft' RETURNING id",
          [input.id, org],
        );
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return done("newsletter.deleted", input.id);
      }
      if (input.action === "sendNewsletter") {
        needManage(s);
        const n = (
          await c.query(
            "SELECT * FROM newsletter WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [input.id, org],
          )
        ).rows[0];
        if (!n) throw new AccessError("NOT_FOUND", 404);
        if (n.status !== "draft") throw new AccessError("ALREADY_SENT", 409);
        if (n.version !== input.expectedVersion)
          throw new AccessError("STALE_VERSION", 409);
        const blocks = n.blocks as Block[];
        if (!hasContent(blocks)) throw new AccessError("EMPTY_NEWSLETTER", 400);
        const profiles = new Set<string>();
        for (const gid of n.group_ids as string[]) {
          const g = (
            await c.query(
              "SELECT * FROM recipient_group WHERE id=$1 AND organization_id=$2 AND NOT archived",
              [gid, org],
            )
          ).rows[0];
          if (g) for (const id of await groupProfiles(c, org, g)) profiles.add(id);
        }
        if (n.include_alumni)
          for (const id of await groupProfiles(c, org, {
            audiences: ["alumni"],
            team_ids: [],
            profile_ids: [],
          }))
            profiles.add(id);
        const stop = await unsubscribed(c, org);
        const contacts = (await contactsFor(c, org, [...profiles])).filter(
          (x) => !stop.has(emailHash(x.email)),
        );
        if (!contacts.length) throw new AccessError("NO_RECIPIENT", 409);
        if (contacts.length > MAX_RECIPIENTS)
          throw new AccessError("TOO_MANY_RECIPIENTS", 409);
        const ids = blocks.flatMap((b) => (b.type === "events" ? b.eventIds : []));
        const base = process.env.BETTER_AUTH_URL ?? "";
        const cache: Record<string, NewsEvent[]> = {};
        for (const to of contacts) {
          cache[to.locale] ??= await newsEvents(c, org, ids, to.locale);
          const delivery = (
            await c.query(
              "INSERT INTO newsletter_delivery(newsletter_id,organization_id,email_hash,user_id) VALUES($1,$2,$3,$4) RETURNING id",
              [n.id, org, emailHash(to.email), to.userId],
            )
          ).rows[0].id as string;
          const url = `${base}/${to.locale}/desinscription/${delivery}`;
          const rendered = renderNewsletter(blocks, cache[to.locale], {
            organization: s.orgName,
            locale: to.locale,
            unsubscribeUrl: url,
          });
          await publish(c, {
            organizationId: org,
            userId: to.userId,
            email: to.email,
            kind: "club_newsletter",
            category: "sport",
            resourceType: "newsletter",
            resourceId: delivery,
            eventKey: "newsletter:" + n.id,
            locale: to.locale,
            variables: {
              name: to.name,
              organization: s.orgName,
              url,
              title: n.subject,
              message: rendered.message,
            },
            html: rendered.html,
            inApp: false,
          });
        }
        await c.query(
          "UPDATE newsletter SET status='sent',sent_at=now(),sent_by=$2,recipients=$3,version=version+1,updated_at=now() WHERE id=$1",
          [n.id, s.userId, contacts.length],
        );
        await done("newsletter.sent", n.id);
        return { id: n.id as string, recipients: contacts.length };
      }
      if (input.action === "eventMail") {
        const e = await eventFor(s, input.eventId);
        if (e.status !== "scheduled") throw new AccessError("EVENT_CANCELLED", 409);
        if (input.groupId) await groupFor(s, input.groupId);
        const sendAt = new Date(input.sendAt);
        if (sendAt >= new Date(e.starts_at))
          throw new AccessError("SEND_AFTER_EVENT", 400);
        const snapshot = [e.version, e.local_start, placeOf(e)];
        if (input.id) {
          const { m } = await mailFor(s, input.id);
          if (m.status !== "scheduled") throw new AccessError("ALREADY_SENT", 409);
          if (m.version !== input.expectedVersion)
            throw new AccessError("STALE_VERSION", 409);
          if (m.event_id !== input.eventId) throw new AccessError("INVALID_INPUT", 400);
          // Saving after reading the changed event counts as a new reading.
          await c.query(
            "UPDATE event_mail SET group_id=$2,subject=$3,body=$4,send_at=$5,event_version=$6,event_start=$7,event_place=$8,version=version+1,updated_at=now() WHERE id=$1",
            [m.id, input.groupId, input.subject, input.body, sendAt, ...snapshot],
          );
          return done("eventMail", m.id);
        }
        const id = (
          await c.query(
            "INSERT INTO event_mail(organization_id,event_id,group_id,subject,body,send_at,event_version,event_start,event_place,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
            [org, e.id, input.groupId, input.subject, input.body, sendAt, ...snapshot, s.userId],
          )
        ).rows[0].id as string;
        return done("eventMail", id);
      }
      if (input.action === "reviewEventMail") {
        const { m, e } = await mailFor(s, input.id);
        if (m.status !== "scheduled") throw new AccessError("ALREADY_SENT", 409);
        if (e.status !== "scheduled") throw new AccessError("EVENT_CANCELLED", 409);
        await c.query(
          "UPDATE event_mail SET event_version=$2,event_start=$3,event_place=$4,version=version+1,updated_at=now() WHERE id=$1",
          [m.id, e.version, e.local_start, placeOf(e)],
        );
        return done("eventMail.reviewed", m.id);
      }
      if (input.action === "sendEventMail") {
        const { m } = await mailFor(s, input.id);
        if (m.status !== "scheduled") throw new AccessError("ALREADY_SENT", 409);
        const n = await deliverEventMail(c, m.id, s.userId);
        return { id: m.id as string, recipients: n };
      }
      if (input.action === "cancelEventMail") {
        const { m } = await mailFor(s, input.id);
        if (m.status !== "scheduled") throw new AccessError("ALREADY_SENT", 409);
        await c.query(
          "UPDATE event_mail SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1",
          [m.id],
        );
        return done("eventMail.cancelled", m.id);
      }
      // Staff marks a former member who asked not to be written to anymore.
      needManage(s);
      const addresses = (
        await c.query(
          `SELECT DISTINCT a FROM (SELECT u.email AS a FROM club_person c JOIN person pe ON pe.id=c.person_id JOIN "user" u ON u.id=pe.user_id WHERE c.id=$1 AND c.organization_id=$2
             UNION SELECT NULLIF(email,'') FROM club_person WHERE id=$1 AND organization_id=$2) x WHERE a IS NOT NULL`,
          [input.profileId, org],
        )
      ).rows.map((r) => emailHash(r.a));
      if (!addresses.length) throw new AccessError("NO_RECIPIENT", 409);
      if (input.action === "unsubscribe") {
        for (const h of addresses)
          await c.query(
            "INSERT INTO mail_unsubscribe(organization_id,email_hash,source) VALUES($1,$2,'staff') ON CONFLICT DO NOTHING",
            [org, h],
          );
        return done("unsubscribe", input.profileId);
      }
      // Only a stop set by the club can be lifted by the club; a stop asked
      // through the link stays until the person subscribes again.
      await c.query(
        "DELETE FROM mail_unsubscribe WHERE organization_id=$1 AND email_hash=ANY($2::text[]) AND source='staff'",
        [org, addresses],
      );
      return done("resubscribe", input.profileId);
    },
    expected,
  );
}

/** Public: what an unsubscribe link concerns (no address shown). */
export async function unsubscribeInfo(db: Pool, id: string) {
  const row = (
    await db.query(
      `SELECT o.name AS club,EXISTS(SELECT 1 FROM mail_unsubscribe u WHERE u.organization_id=d.organization_id AND u.email_hash=d.email_hash) AS done
         FROM newsletter_delivery d JOIN organization o ON o.id=d.organization_id WHERE d.id=$1`,
      [id],
    )
  ).rows[0];
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return { club: row.club as string, unsubscribed: row.done as boolean };
}
/** Public: the link holder stops (or resumes) the club news for this address. */
export async function unsubscribeExecute(db: Pool, id: string, stop: boolean) {
  const d = (
    await db.query(
      "SELECT organization_id,email_hash FROM newsletter_delivery WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!d) throw new AccessError("NOT_FOUND", 404);
  if (stop)
    await db.query(
      "INSERT INTO mail_unsubscribe(organization_id,email_hash,source) VALUES($1,$2,'link') ON CONFLICT(organization_id,email_hash) DO UPDATE SET source='link',created_at=now()",
      [d.organization_id, d.email_hash],
    );
  else
    await db.query(
      "DELETE FROM mail_unsubscribe WHERE organization_id=$1 AND email_hash=$2",
      [d.organization_id, d.email_hash],
    );
  return { unsubscribed: stop };
}
