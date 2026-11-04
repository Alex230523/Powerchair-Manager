import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { fedCan, permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { inviteForEvent } from "../attendance/service";
import type { Actor, Event } from "../calendar/access";
import { clubAudiences, federationAudiences, leading, pollCommand, publicAnswer, tally, validAnswers, type PollCommand } from "./schema";
import type { z } from "zod";

/**
 * H3: mini polls. A poll goes to an existing group; each recipient answers
 * in the application or by a personal link that works once without signing
 * in. The results are live; at the closing a date poll becomes the event
 * (those who said yes invited), a choice becomes a task. Anonymous answers
 * never reach the creator with a name.
 */
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
type Ctx = { c: PoolClient; org: string; kind: "club" | "federation"; userId: string; manage: boolean; actor: Actor; p: Principal };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("FORBIDDEN");
    if (write) await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const rights = permissions(a.role, a.grants) as readonly string[];
    // Who may ask: the presidency, the coaches, those who write to the members or plan; the federation's communication.
    const manage =
      mfa &&
      (a.kind === "federation"
        ? fedCan(a.role, a.grants, "federation.communication")
        : a.role === "club_president" || a.role === "coach" || rights.includes("notifications.manage") || rights.includes("calendar.manage"));
    const out = await fn({ c, org: a.organization_id, kind: a.kind as "club" | "federation", userId: p.userId, manage, actor: { ...a, twoFactorEnabled: !!(await account(c, p)).twoFactorEnabled } as Actor, p });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

type Recipient = { user_id: string; organization_id: string; profile_id: string | null };
/** The group's people: each one answers for himself, a parent once or once per child (a minor never in his parent's stead). */
async function recipientsOf(c: PoolClient, org: string, audience: string, teamId: string | null, perChild: boolean): Promise<Recipient[]> {
  const rows = (sql: string, params: unknown[]) => c.query(sql, params).then((r) => r.rows as Recipient[]);
  switch (audience) {
    case "team":
      return rows(
        `SELECT DISTINCT pe.user_id,$1::uuid AS organization_id,cp.id AS profile_id FROM team_membership tm JOIN club_person cp ON cp.id=tm.profile_id JOIN person pe ON pe.id=cp.person_id
          JOIN "user" u ON u.id=pe.user_id AND u.active WHERE tm.organization_id=$1 AND tm.team_id=$2 AND tm.role='player' AND NOT tm.cancelled AND tm.closed_at IS NULL AND cp.status='active'`,
        [org, teamId],
      );
    case "team_parents":
      return rows(
        `SELECT DISTINCT pe.user_id,$1::uuid AS organization_id,${perChild ? "g.subject_profile_id" : "NULL::uuid"} AS profile_id
           FROM team_membership tm JOIN guardian_relationship g ON g.subject_profile_id=tm.profile_id AND g.organization_id=tm.organization_id AND g.can_view AND g.revoked_at IS NULL AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)
           JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id AND u.active
          WHERE tm.organization_id=$1 AND tm.team_id=$2 AND tm.role='player' AND NOT tm.cancelled AND tm.closed_at IS NULL`,
        [org, teamId],
      );
    case "coaches":
      return rows(
        `SELECT DISTINCT pe.user_id,$1::uuid AS organization_id,NULL::uuid AS profile_id FROM team_membership tm JOIN club_person cp ON cp.id=tm.profile_id JOIN person pe ON pe.id=cp.person_id
          JOIN "user" u ON u.id=pe.user_id AND u.active WHERE tm.organization_id=$1 AND tm.role='coach' AND NOT tm.cancelled AND tm.closed_at IS NULL`,
        [org],
      );
    case "staff":
    case "members":
      return rows(
        `SELECT DISTINCT r.user_id,$1::uuid AS organization_id,NULL::uuid AS profile_id FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active
          WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) ${audience === "staff" ? "AND r.role NOT IN ('player','guardian')" : ""}`,
        [org],
      );
    case "presidents":
      return rows(
        `SELECT DISTINCT r.user_id,r.organization_id,NULL::uuid AS profile_id FROM role_assignment r JOIN organization o ON o.id=r.organization_id AND o.federation_id=$1 AND o.kind='club'
          JOIN "user" u ON u.id=r.user_id AND u.active WHERE r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())`,
        [org],
      );
  }
  return [];
}

async function tell(c: PoolClient, r: { user_id: string; organization_id: string }, key: string, title: Record<Locale, string>, message: Record<Locale, string>, path: (l: Locale) => string) {
  const u = (await c.query('SELECT u.id,u.email,u.name,COALESCE(pe.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1 AND u.active', [r.user_id])).rows[0];
  if (!u) return;
  const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
  const org = (await c.query("SELECT name FROM organization WHERE id=$1", [r.organization_id])).rows[0]?.name as string;
  await publish(c, {
    organizationId: r.organization_id,
    userId: u.id,
    email: u.email,
    kind: "automation",
    category: "administrative",
    resourceType: "automation",
    resourceId: key.split(":").slice(0, 2).join(":"),
    eventKey: `${key}:${u.id}`,
    locale,
    variables: { name: u.name, title: title[locale], message: message[locale], organization: org, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}${path(locale)}` },
  });
}
const words = {
  title: { fr: "Sondage : {q}", nl: "Peiling: {q}", en: "Poll: {q}" },
  message: { fr: "Répondez en deux clics avant le {date}.", nl: "Antwoord in twee klikken vóór {date}.", en: "Answer in two clicks before {date}." },
  reminder: { fr: "Dernier jour pour répondre au sondage.", nl: "Laatste dag om op de peiling te antwoorden.", en: "Last day to answer the poll." },
};
const fillAll = (o: Record<Locale, string>, v: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, s.replace(/\{(\w+)\}/g, (_, x: string) => v[x] ?? "")])) as Record<Locale, string>;
const day = (d: Date | string) => new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));

type PollRow = { id: string; organization_id: string; kind: "dates" | "single" | "multiple"; question: string; detail: string; anonymous: boolean; audience: string; team_id: string | null; per_child: boolean; closes_at: Date; status: string; created_by: string; outcome_event_id: string | null; outcome_task_id: string | null };
async function optionsOf(c: PoolClient, poll: string) {
  return (await c.query("SELECT id,position,label,starts_at FROM poll_option WHERE poll_id=$1 ORDER BY position", [poll])).rows as { id: string; position: number; label: string; starts_at: string | null }[];
}
async function results(c: PoolClient, poll: PollRow) {
  const options = await optionsOf(c, poll.id);
  const answers = (await c.query("SELECT a.option_id,a.value,r.user_id,r.profile_id FROM poll_answer a JOIN poll_recipient r ON r.id=a.recipient_id WHERE r.poll_id=$1", [poll.id])).rows as {
    option_id: string;
    value: string;
    user_id: string;
    profile_id: string | null;
  }[];
  const counts = (await c.query("SELECT count(*)::int AS total,count(answered_at)::int AS answered FROM poll_recipient WHERE poll_id=$1", [poll.id])).rows[0] as { total: number; answered: number };
  const t = tally(options, answers);
  // Names only when the poll is not anonymous.
  const names = poll.anonymous
    ? null
    : ((
        await c.query(
          `SELECT r.id,u.name,cp.full_name AS child,r.answered_at IS NOT NULL AS answered,
                  COALESCE((SELECT json_agg(json_build_object('option',a.option_id,'value',a.value)) FROM poll_answer a WHERE a.recipient_id=r.id),'[]') AS answers
             FROM poll_recipient r JOIN "user" u ON u.id=r.user_id LEFT JOIN club_person cp ON cp.id=r.profile_id WHERE r.poll_id=$1 ORDER BY u.name`,
          [poll.id],
        )
      ).rows as { id: string; name: string; child: string | null; answered: boolean; answers: { option: string; value: string }[] }[]);
  return { options, tally: t, leading: leading(t), ...counts, people: names };
}

export async function pollsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    // To answer: the open polls of this person, in any club (a parent's per child).
    const mine = (
      await x.c.query(
        `SELECT r.id AS recipient_id,po.id,po.kind,po.question,po.detail,po.anonymous,po.closes_at,cp.full_name AS child,r.answered_at,
                COALESCE((SELECT json_agg(json_build_object('option',a.option_id,'value',a.value)) FROM poll_answer a WHERE a.recipient_id=r.id),'[]') AS answers
           FROM poll_recipient r JOIN poll po ON po.id=r.poll_id LEFT JOIN club_person cp ON cp.id=r.profile_id
          WHERE r.user_id=$1 AND po.status='open' ORDER BY po.closes_at`,
        [x.userId],
      )
    ).rows as { recipient_id: string; id: string; kind: "dates" | "single" | "multiple"; question: string; detail: string; anonymous: boolean; closes_at: string; child: string | null; answered_at: string | null; answers: { option: string; value: string }[] }[];
    const toAnswer = [];
    for (const m of mine) toAnswer.push({ ...m, options: await optionsOf(x.c, m.id) });
    const asked = x.manage
      ? ((await x.c.query("SELECT * FROM poll WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50", [x.org])).rows as PollRow[])
      : [];
    const created = [];
    for (const poll of asked) created.push({ ...poll, results: await results(x.c, poll) });
    const teams = x.kind === "club" && x.manage ? ((await x.c.query("SELECT t.id,t.name FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived ORDER BY t.name", [x.org])).rows as { id: string; name: string }[]) : [];
    return { organization_id: x.org, kind: x.kind, can: { create: x.manage }, audiences: x.kind === "club" ? clubAudiences : federationAudiences, teams, toAnswer, created };
  });
}

async function saveAnswers(c: PoolClient, recipient: string, poll: PollRow, answers: { optionId: string; value: string }[]) {
  if (poll.status !== "open" || new Date(poll.closes_at) <= new Date()) throw new AccessError("POLL_CLOSED", 409);
  const options = (await optionsOf(c, poll.id)).map((o) => o.id);
  if (!validAnswers(poll.kind, options, answers)) throw new AccessError("INVALID_ANSWER", 400);
  await c.query("DELETE FROM poll_answer WHERE recipient_id=$1", [recipient]);
  for (const a of answers) await c.query("INSERT INTO poll_answer(recipient_id,option_id,value) VALUES($1,$2,$3)", [recipient, a.optionId, a.value]);
  await c.query("UPDATE poll_recipient SET answered_at=now() WHERE id=$1", [recipient]);
}

export async function pollsExecute(db: Pool, p: Principal, raw: z.input<typeof pollCommand>, expected: string) {
  const cmd: PollCommand = pollCommand.parse(raw);
  // Answering is open to every recipient, from whatever profile he is in.
  if (cmd.action === "answer") {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await account(c, p);
      const r = (await c.query("SELECT po.* FROM poll_recipient r JOIN poll po ON po.id=r.poll_id WHERE r.id=$1 AND r.user_id=$2 FOR UPDATE OF r", [cmd.recipientId, p.userId])).rows[0];
      if (!r) throw new AccessError("NOT_FOUND", 404);
      await saveAnswers(c, cmd.recipientId, r as PollRow, cmd.answers);
      await c.query("COMMIT");
      return { id: cmd.recipientId };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (!x.manage) throw new AccessError("FORBIDDEN");
      if (cmd.action === "create") {
        const allowed: readonly string[] = x.kind === "club" ? clubAudiences : federationAudiences;
        if (!allowed.includes(cmd.audience)) throw new AccessError("INVALID_INPUT", 400);
        if ((cmd.audience === "team" || cmd.audience === "team_parents") !== !!cmd.teamId) throw new AccessError("INVALID_INPUT", 400);
        if (cmd.teamId && !(await x.c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2", [cmd.teamId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
        if (new Date(cmd.closesAt) <= new Date()) throw new AccessError("INVALID_DATE", 400);
        if (cmd.kind === "dates" && cmd.options.some((o) => !o.startsAt)) throw new AccessError("INVALID_INPUT", 400);
        const id = (
          await x.c.query(
            `INSERT INTO poll(organization_id,kind,question,detail,anonymous,audience,team_id,per_child,closes_at,source_event_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,
               (SELECT e.id FROM calendar_event e WHERE e.id=$10 AND e.organization_id=$1),$11) RETURNING id`,
            [x.org, cmd.kind, cmd.question, cmd.detail, cmd.anonymous, cmd.audience, cmd.teamId, cmd.audience === "team_parents" && cmd.perChild, cmd.closesAt, cmd.sourceEventId, x.userId],
          )
        ).rows[0].id as string;
        for (const [i, o] of cmd.options.entries()) await x.c.query("INSERT INTO poll_option(poll_id,position,label,starts_at) VALUES($1,$2,$3,$4)", [id, i, o.label, cmd.kind === "dates" ? o.startsAt : null]);
        const people = await recipientsOf(x.c, x.org, cmd.audience, cmd.teamId, cmd.perChild);
        for (const r of people) {
          const token = randomBytes(24).toString("base64url");
          const rid = (
            await x.c.query("INSERT INTO poll_recipient(poll_id,user_id,organization_id,profile_id,token_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id", [id, r.user_id, r.organization_id, r.profile_id, hash(token)])
          ).rows[0]?.id;
          if (rid)
            await tell(x.c, r, `poll:${id}:${rid}`, fillAll(words.title, { q: cmd.question.slice(0, 80) }), fillAll(words.message, { date: day(cmd.closesAt) }), () => `/sondage/${token}`);
        }
        await audit(x.c, x.org, x.userId, "poll.created", id, { audience: cmd.audience, recipients: people.length });
        return { id, recipients: people.length };
      }
      const poll = (await x.c.query("SELECT * FROM poll WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.id, x.org])).rows[0] as PollRow | undefined;
      if (!poll) throw new AccessError("NOT_FOUND", 404);
      if (cmd.action === "close") {
        await x.c.query("UPDATE poll SET status='closed',closed_at=now() WHERE id=$1 AND status='open'", [poll.id]);
        return { id: poll.id };
      }
      // outcome
      if (poll.status !== "closed") throw new AccessError("POLL_OPEN", 409);
      if (poll.outcome_event_id || poll.outcome_task_id) throw new AccessError("DUPLICATE", 409);
      const option = (await x.c.query("SELECT * FROM poll_option WHERE id=$1 AND poll_id=$2", [cmd.optionId, poll.id])).rows[0] as { id: string; label: string; starts_at: Date | null } | undefined;
      if (!option) throw new AccessError("NOT_FOUND", 404);
      if (poll.kind === "dates") {
        const start = new Date(option.starts_at!);
        const series = (await x.c.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [x.org, x.userId])).rows[0].id;
        const e = (
          await x.c.query(
            `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility)
             VALUES($1,$2,1,$3,'meeting','Europe/Brussels',$4::timestamptz,$4::timestamptz+interval '2 hours',
                    to_char($4::timestamptz AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char(($4::timestamptz+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),
                    $5,$6,$7) RETURNING *`,
            [x.org, series, poll.question.slice(0, 120), start, poll.team_id, x.userId, poll.team_id ? "team" : "organization"],
          )
        ).rows[0] as Event;
        // Those who said yes are invited (a parent's answer invites his child).
        const yes = (
          await x.c.query(
            `SELECT DISTINCT COALESCE(r.profile_id,(SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE pe.user_id=r.user_id AND cp.organization_id=$2 AND cp.status='active' LIMIT 1)) AS profile
               FROM poll_answer a JOIN poll_recipient r ON r.id=a.recipient_id WHERE r.poll_id=$1 AND a.option_id=$3 AND a.value='yes' AND r.organization_id=$2`,
            [poll.id, x.org, option.id],
          )
        ).rows
          .map((r) => r.profile as string | null)
          .filter((v): v is string => !!v);
        const deadline = new Date(Math.max(Date.now() + 3600000, start.getTime() - 86400000));
        if (yes.length && deadline < start) await inviteForEvent(x.c, x.p, x.actor, e, yes, deadline);
        await x.c.query("UPDATE poll SET outcome_event_id=$2 WHERE id=$1", [poll.id, e.id]);
        await audit(x.c, x.org, x.userId, "poll.event", poll.id, { event: e.id, invited: yes.length });
        return { id: poll.id, eventId: e.id, invited: yes.length };
      }
      const task = (
        await x.c.query(
          "INSERT INTO task(organization_id,kind,category,title,detail,origin,created_by,responsible_user_id,source_key,source_kind) VALUES($1,'other',$2,$3,$4,'manual',$5,$5,$6,'poll') RETURNING id",
          [x.org, x.kind === "federation" ? "fed_other" : "other", `${poll.question} : ${option.label}`.slice(0, 200), poll.detail, x.userId, `poll:${poll.id}`],
        )
      ).rows[0].id as string;
      await x.c.query("UPDATE poll SET outcome_task_id=$2 WHERE id=$1", [poll.id, task]);
      return { id: poll.id, taskId: task };
    },
    expected,
  );
}

/** The personal link: the question and its options, nothing private; it answers once. */
export async function pollByToken(db: Pool, token: string) {
  const r = (
    await db.query(
      "SELECT r.id AS recipient_id,r.link_used_at,split_part(cp.full_name,' ',1) AS child,po.id,po.kind,po.question,po.detail,po.closes_at,po.status FROM poll_recipient r JOIN poll po ON po.id=r.poll_id LEFT JOIN club_person cp ON cp.id=r.profile_id WHERE r.token_hash=$1",
      [hash(token)],
    )
  ).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  const c = await db.connect();
  try {
    return {
      kind: r.kind as "dates" | "single" | "multiple",
      question: r.question as string,
      detail: r.detail as string,
      closesAt: r.closes_at as string,
      /** A parent's link per child names the child (first name only). */
      child: (r.child as string | null) || null,
      used: !!r.link_used_at,
      open: r.status === "open" && new Date(r.closes_at) > new Date(),
      options: (await optionsOf(c, r.id)).map((o) => ({ id: o.id, label: o.label, startsAt: o.starts_at })),
    };
  } finally {
    c.release();
  }
}
export async function answerByToken(db: Pool, token: string, raw: z.input<typeof publicAnswer>) {
  const cmd = publicAnswer.parse(raw);
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = (await c.query("SELECT r.id AS recipient_id,r.link_used_at,po.* FROM poll_recipient r JOIN poll po ON po.id=r.poll_id WHERE r.token_hash=$1 FOR UPDATE OF r", [hash(token)])).rows[0];
    if (!r) throw new AccessError("NOT_FOUND", 404);
    if (r.link_used_at) throw new AccessError("LINK_USED", 409);
    await saveAnswers(c, r.recipient_id, r as PollRow, cmd.answers);
    await c.query("UPDATE poll_recipient SET link_used_at=now() WHERE id=$1", [r.recipient_id]);
    await c.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** One relaunch 24 hours before the closing, to who has not answered; past the date, the poll closes. */
export async function pollsTick(db: Pool) {
  const c = await db.connect();
  let reminded = 0;
  try {
    await c.query("BEGIN");
    const late = (
      await c.query(
        `UPDATE poll_recipient r SET reminded_at=now() FROM poll po WHERE po.id=r.poll_id AND po.status='open' AND r.answered_at IS NULL AND r.reminded_at IS NULL
           AND po.closes_at BETWEEN now() AND now()+interval '24 hours' RETURNING r.id,r.user_id,r.organization_id,po.id AS poll,po.question`,
      )
    ).rows as { id: string; user_id: string; organization_id: string; poll: string; question: string }[];
    for (const r of late) {
      await tell(c, r, `poll:${r.poll}:${r.id}:reminder`, fillAll(words.title, { q: r.question.slice(0, 80) }), words.reminder, () => "/sondages");
      reminded++;
    }
    await c.query("UPDATE poll SET status='closed',closed_at=now() WHERE status='open' AND closes_at<=now()");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return reminded;
}
