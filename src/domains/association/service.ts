import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { pdfDocument } from "../../lib/pdf";
import { storageAdapter } from "../../lib/storage-adapter";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { ownProfiles } from "../calendar/access";
import { seal } from "../notifications/crypto";
import { publish } from "../notifications/queue";
import { approveAtAssembly, lastClosedYear } from "../accounts/service";
import { associationWords, fillWords } from "./association-copy";
import { adopted, assemblySteps, endingMandates, proxyAllowed, quorum, rulesOf, type AssociationCommand, type ItemKind, type Majority, type Rules } from "./schema";

/**
 * 17: the ASBL's life. The register of members (a status decided, never the
 * sport registration) and the meetings (general assembly, board): dates,
 * agenda, invitation, answers and proxies, presence and quorum, votes,
 * minutes, signatures and what follows. The presidency, those who manage
 * the mandates and the secretary prepare; an effective member reads the
 * register, answers and gives a proxy.
 */
type Ctx = { c: PoolClient; org: string; userId: string; manage: boolean; own: Set<string>; effective: Set<string> };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const own = await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled });
    const mine = (
      await c.query("SELECT profile_id,status,board_role FROM association_member WHERE organization_id=$1 AND profile_id=ANY($2::uuid[])", [a.organization_id, [...own]])
    ).rows as { profile_id: string; status: string; board_role: string | null }[];
    const secretary = mine.some((m) => m.board_role === "secretary" || m.board_role === "president");
    const manage = mfa && (a.role === "club_president" || permissions(a.role, a.grants).includes("mandates.manage") || secretary);
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage, own, effective: new Set(mine.filter((m) => m.status === "effective").map((m) => m.profile_id)) });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    if ((e as { code?: string }).code === "55000") throw new AccessError("REGISTER_FROZEN", 409);
    throw e;
  } finally {
    c.release();
  }
}

const rules = async (c: PoolClient, org: string) => rulesOf((await c.query("SELECT assembly_rules FROM organization WHERE id=$1", [org])).rows[0]?.assembly_rules);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const localDay = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(d));
const longDate = (l: Locale, d: Date | string) =>
  new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));

/** 2: a line of the register and the member's current status, together. */
async function register(
  c: PoolClient,
  org: string,
  userId: string,
  v: { profileId: string; event: string; status: string; decisionBody: string | null; decisionOn: string | null; meetingId?: string | null; reason?: string; correctsId?: string | null; boardRole?: string | null; boardUntil?: string | null },
) {
  const id = (
    await c.query(
      `INSERT INTO member_register(organization_id,profile_id,event,status_after,board_role,decision_body,decision_on,meeting_id,reason,corrects_id,recorded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [org, v.profileId, v.event, v.status, v.boardRole ?? null, v.decisionBody, v.decisionOn, v.meetingId ?? null, v.reason ?? "", v.correctsId ?? null, userId],
    )
  ).rows[0].id as string;
  const on = v.decisionOn ?? today();
  await c.query(
    `INSERT INTO association_member(organization_id,profile_id,status,admitted_on,left_on,board_role,board_from,board_until)
     VALUES($1,$2,$3,CASE WHEN $4='admission' THEN $5::date END,CASE WHEN $4 IN ('resignation','exclusion') THEN $5::date END,
            CASE WHEN $4='board_start' THEN $6 END,CASE WHEN $4='board_start' THEN $5::date END,CASE WHEN $4='board_start' THEN $7::date END)
     ON CONFLICT (organization_id,profile_id) DO UPDATE SET status=EXCLUDED.status,
       admitted_on=CASE WHEN $4='admission' THEN $5::date ELSE association_member.admitted_on END,
       left_on=CASE WHEN $4 IN ('resignation','exclusion') THEN $5::date WHEN $4='admission' THEN NULL ELSE association_member.left_on END,
       board_role=CASE WHEN $4='board_start' THEN $6 WHEN $4 IN ('board_end','resignation','exclusion') THEN NULL ELSE association_member.board_role END,
       board_from=CASE WHEN $4='board_start' THEN $5::date WHEN $4 IN ('board_end','resignation','exclusion') THEN NULL ELSE association_member.board_from END,
       board_until=CASE WHEN $4='board_start' THEN $7::date WHEN $4 IN ('board_end','resignation','exclusion') THEN NULL ELSE association_member.board_until END,
       updated_at=now()`,
    [org, v.profileId, v.status, v.event, on, v.boardRole ?? null, v.boardUntil ?? null],
  );
  return id;
}

/** The task the ASBL's life puts in the to-do (once, by its key), for the presidency. */
async function task(c: PoolClient, org: string, userId: string, key: string, title: string, due: string, category: "admin" = "admin") {
  const president = (
    await c.query(
      `SELECT cp.id FROM role_assignment r JOIN person pe ON pe.user_id=r.user_id JOIN club_person cp ON cp.person_id=pe.id AND cp.organization_id=r.organization_id AND cp.status='active'
        WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) ORDER BY r.valid_from LIMIT 1`,
      [org],
    )
  ).rows[0]?.id as string | undefined;
  await c.query(
    `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_id,origin,created_by,source_key,source_kind)
     VALUES($1,'obligation',$2,$3,$4,$5,'template',$6,$7,'association') ON CONFLICT DO NOTHING`,
    [org, category, title.slice(0, 200), due < today() ? today() : due, president ?? null, userId, key],
  );
}
const closeTask = (c: PoolClient, org: string, key: string) =>
  c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key=$2 AND status<>'done'", [org, key]);

async function meetingRow(x: Ctx, id: string, lock = false) {
  const m = (
    await x.c.query(`SELECT *,fiscal_year_start::text AS fiscal_year_start FROM association_meeting WHERE id=$1 AND organization_id=$2 ${lock ? "FOR UPDATE" : ""}`, [id, x.org])
  ).rows[0];
  if (!m) throw new AccessError("NOT_FOUND", 404);
  return m as { id: string; kind: "assembly" | "board"; title: string; starts_at: Date; place: string; status: string; fiscal_year_start: string | null; invite_sent_at: Date | null; second_of: string | null; minutes: string; signed_president_at: Date | null; signed_secretary_at: Date | null; created_by: string };
}

/** Who is called: the effective members for an assembly, the directors for the board. */
async function invitees(c: PoolClient, org: string, kind: "assembly" | "board") {
  return (
    await c.query(
      `SELECT m.profile_id FROM association_member m JOIN club_person cp ON cp.id=m.profile_id AND cp.organization_id=m.organization_id
        WHERE m.organization_id=$1 AND ${kind === "assembly" ? "m.status='effective'" : "m.board_role IS NOT NULL"}`,
      [org],
    )
  ).rows.map((r) => r.profile_id as string);
}

/** 9: present, represented (a proxy held by someone present for someone absent) and the quorum. */
async function count(c: PoolClient, org: string, meetingId: string, kind: "assembly" | "board", second: boolean, r: Rules) {
  const members = (await invitees(c, org, kind)).length;
  const present = Number((await c.query("SELECT count(*)::int AS n FROM meeting_attendee WHERE meeting_id=$1 AND present", [meetingId])).rows[0].n);
  const represented = Number(
    (
      await c.query(
        "SELECT count(*)::int AS n FROM meeting_proxy p JOIN meeting_attendee h ON h.meeting_id=p.meeting_id AND h.profile_id=p.holder_id AND h.present LEFT JOIN meeting_attendee g ON g.meeting_id=p.meeting_id AND g.profile_id=p.giver_id WHERE p.meeting_id=$1 AND NOT COALESCE(g.present,false)",
        [meetingId],
      )
    ).rows[0].n,
  );
  const percent = kind === "assembly" && !(second && r.secondWithoutQuorum) ? r.quorumPercent : 0;
  return quorum(members, present, represented, percent);
}

export async function associationView(db: Pool, p: Principal, locale: Locale) {
  return scope(db, p, false, async (x) => {
    const r = await rules(x.c, x.org);
    const reader = x.manage || x.effective.size > 0;
    const members = reader
      ? ((
          await x.c.query(
            `SELECT m.profile_id,cp.full_name,m.status,m.admitted_on::text AS admitted_on,m.left_on::text AS left_on,m.board_role,m.board_from::text AS board_from,m.board_until::text AS board_until
               FROM association_member m JOIN club_person cp ON cp.id=m.profile_id AND cp.organization_id=m.organization_id
              WHERE m.organization_id=$1 AND (m.status<>'none' OR m.board_role IS NOT NULL) ORDER BY cp.full_name`,
            [x.org],
          )
        ).rows as { profile_id: string; full_name: string; status: string; admitted_on: string | null; left_on: string | null; board_role: string | null; board_from: string | null; board_until: string | null }[])
      : [];
    const lines = reader
      ? (
          await x.c.query(
            `SELECT l.id,l.profile_id,cp.full_name,l.event,l.status_after,l.board_role,l.decision_body,l.decision_on::text AS decision_on,l.meeting_id,l.reason,l.corrects_id,u.name AS recorded_by,l.recorded_at
               FROM member_register l JOIN club_person cp ON cp.id=l.profile_id JOIN "user" u ON u.id=l.recorded_by WHERE l.organization_id=$1 ORDER BY l.recorded_at DESC LIMIT 1000`,
            [x.org],
          )
        ).rows
      : [];
    // 3: suggestions, never added without a decision: adults with a team for more than a season, parents who carry tasks.
    const suggestions = x.manage
      ? (
          await x.c.query(
            `SELECT cp.id,cp.full_name,'adult' AS why FROM club_person cp
              WHERE cp.organization_id=$1 AND cp.status='active' AND cp.birth_date<=CURRENT_DATE-interval '18 years'
                AND EXISTS(SELECT 1 FROM team_membership tm WHERE tm.profile_id=cp.id AND tm.organization_id=cp.organization_id AND tm.starts_on<=CURRENT_DATE-interval '1 year')
                AND NOT EXISTS(SELECT 1 FROM association_member m WHERE m.organization_id=cp.organization_id AND m.profile_id=cp.id AND m.status='effective')
             UNION
             SELECT cp.id,cp.full_name,'parent' FROM club_person cp
              WHERE cp.organization_id=$1 AND cp.status='active' AND 'guardian'=ANY(cp.directory_roles)
                AND (SELECT count(*) FROM task_assignee a JOIN task t ON t.id=a.task_id WHERE a.profile_id=cp.id AND t.status='done')>=3
                AND NOT EXISTS(SELECT 1 FROM association_member m WHERE m.organization_id=cp.organization_id AND m.profile_id=cp.id AND m.status='effective')
             ORDER BY 2 LIMIT 30`,
            [x.org],
          )
        ).rows
      : [];
    const meetingsRaw = (
      await x.c.query(
        `SELECT id,kind,title,starts_at,place,status,fiscal_year_start::text AS fiscal_year_start,second_of,invite_sent_at,reminder_sent_at,quorum_reached,minutes,signed_president_name,signed_president_at,signed_secretary_name,signed_secretary_at,document_id,version
           FROM association_meeting WHERE organization_id=$1 ORDER BY starts_at DESC LIMIT 50`,
        [x.org],
      )
    ).rows;
    const meetings = [];
    for (const m of meetingsRaw) {
      const attendees = (
        await x.c.query(
          `SELECT a.profile_id,cp.full_name,a.answer,a.present,p.holder_id,
                  (SELECT count(*)::int FROM meeting_proxy q WHERE q.meeting_id=a.meeting_id AND q.holder_id=a.profile_id) AS holds
             FROM meeting_attendee a JOIN club_person cp ON cp.id=a.profile_id LEFT JOIN meeting_proxy p ON p.meeting_id=a.meeting_id AND p.giver_id=a.profile_id
            WHERE a.meeting_id=$1 ORDER BY cp.full_name`,
          [m.id],
        )
      ).rows as { profile_id: string; full_name: string; answer: string; present: boolean; holder_id: string | null; holds: number }[];
      const mine = attendees.filter((a) => x.own.has(a.profile_id));
      if (!x.manage && !mine.length) continue;
      meetings.push({
        ...m,
        items: (
          await x.c.query(
            "SELECT i.id,i.position,i.kind,i.title,i.detail,i.majority,i.profile_id,i.board_role,i.votes_for,i.votes_against,i.votes_abstain,i.result FROM meeting_item i WHERE i.meeting_id=$1 ORDER BY i.position",
            [m.id],
          )
        ).rows,
        attendees: x.manage ? attendees : attendees.map((a) => ({ ...a, answer: x.own.has(a.profile_id) ? a.answer : "none", present: false })),
        mine: mine.map((a) => a.profile_id),
        quorum: x.manage ? await count(x.c, x.org, m.id, m.kind, !!m.second_of, r) : null,
        steps: m.kind === "assembly" ? assemblySteps(localDay(m.starts_at), r.noticeDays) : null,
      });
    }
    const year = await lastClosedYear(x.c, x.org);
    return {
      organization_id: x.org,
      locale,
      can: { manage: x.manage, read: reader },
      rules: r,
      members,
      register: lines,
      suggestions,
      people: x.manage ? (await x.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name", [x.org])).rows : [],
      meetings,
      year: { ...year, planned: meetingsRaw.some((m) => m.kind === "assembly" && m.fiscal_year_start === year.from && m.status !== "cancelled") },
      endingMandates: x.manage ? endingMandates(members, today()) : [],
    };
  });
}

/** 7: the agenda an assembly starts with: accounts, budget, discharge, mandates ending, admissions and exits pending, any other business. */
async function prefill(c: PoolClient, org: string, meetingId: string, day: string, fiscal: string | null, r: Rules, locale: Locale) {
  const w = associationWords[locale];
  const year = fiscal ? fiscal.slice(0, 4) : String(Number(day.slice(0, 4)) - 1);
  const next = String(Number(year) + 1);
  const members = (
    await c.query(
      "SELECT m.profile_id,cp.full_name,m.board_role,m.board_until::text AS board_until FROM association_member m JOIN club_person cp ON cp.id=m.profile_id WHERE m.organization_id=$1",
      [org],
    )
  ).rows as { profile_id: string; full_name: string; board_role: string | null; board_until: string | null }[];
  const items: { kind: ItemKind; title: string; profile?: string; role?: string | null }[] = [
    { kind: "accounts", title: fillWords(w.items.accounts, { year }) },
    { kind: "budget", title: fillWords(w.items.budget, { next }) },
    { kind: "discharge", title: w.items.discharge },
    ...endingMandates(members, day).map((m) => ({ kind: "mandate" as const, title: fillWords(w.items.mandate, { name: m.full_name }), profile: m.profile_id, role: m.board_role })),
    { kind: "free", title: w.items.free },
  ];
  for (const [i, it] of items.entries())
    await c.query("INSERT INTO meeting_item(meeting_id,position,kind,title,majority,profile_id,board_role) VALUES($1,$2,$3,$4,$5,$6,$7)", [
      meetingId,
      i,
      it.kind,
      it.title.slice(0, 300),
      r.majorities[it.kind],
      it.profile ?? null,
      it.role ?? null,
    ]);
}

/** 8: the invitation, once, to each invited person with an account (in-app and email), the agenda in it. */
async function sendInvite(c: PoolClient, org: string, meetingId: string, reminder: boolean) {
  const m = (await c.query("SELECT * FROM association_meeting WHERE id=$1 AND organization_id=$2", [meetingId, org])).rows[0];
  if (!m) return 0;
  const base = process.env.BETTER_AUTH_URL ?? "";
  const club = (await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0]?.name as string;
  const agenda = (await c.query("SELECT title FROM meeting_item WHERE meeting_id=$1 ORDER BY position", [meetingId])).rows.map((r) => r.title as string);
  const people = (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM meeting_attendee a JOIN club_person cp ON cp.id=a.profile_id JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id
        WHERE a.meeting_id=$1 AND u.active ${reminder ? "AND a.answer='none' AND NOT EXISTS(SELECT 1 FROM meeting_proxy p WHERE p.meeting_id=a.meeting_id AND p.giver_id=a.profile_id)" : ""}`,
      [meetingId],
    )
  ).rows as { id: string; email: string; name: string; locale: string }[];
  for (const u of people) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    const w = associationWords[locale];
    const v = { title: m.title, date: longDate(locale, m.starts_at), agenda: agenda.join(" ; ") };
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "administrative",
      resourceType: "automation",
      resourceId: `meeting:${meetingId}`,
      eventKey: `meeting:${meetingId}:${u.id}:${reminder ? "reminder" : "invite"}`,
      locale,
      variables: { name: u.name, title: fillWords(reminder ? w.reminderTitle : w.inviteTitle, v), message: fillWords(reminder ? w.reminderText : w.inviteText, v), organization: club, url: `${base}/${locale}/club/association?meeting=${meetingId}` },
    });
  }
  await c.query(`UPDATE association_meeting SET ${reminder ? "reminder_sent_at" : "invite_sent_at"}=now() WHERE id=$1`, [meetingId]);
  if (!reminder) {
    await closeTask(c, org, `meeting:${meetingId}:invite`);
    await closeTask(c, org, `meeting:${meetingId}:agenda`);
  }
  return people.length;
}

/** 10: the minutes from the meeting as it went: who, the quorum, each point and its vote. */
async function minutesOf(c: PoolClient, org: string, meetingId: string, locale: Locale) {
  const w = associationWords[locale].minutes;
  const m = (await c.query("SELECT * FROM association_meeting WHERE id=$1 AND organization_id=$2", [meetingId, org])).rows[0];
  const r = await rules(c, org);
  const q = await count(c, org, meetingId, m.kind, !!m.second_of, r);
  const present = (await c.query("SELECT cp.full_name FROM meeting_attendee a JOIN club_person cp ON cp.id=a.profile_id WHERE a.meeting_id=$1 AND a.present ORDER BY cp.full_name", [meetingId])).rows.map((x) => x.full_name);
  const items = (await c.query("SELECT * FROM meeting_item WHERE meeting_id=$1 ORDER BY position", [meetingId])).rows;
  const lines = [
    fillWords(w.title, { title: m.title }),
    "",
    fillWords(w.opened, { date: longDate(locale, m.starts_at), place: m.place || "…" }),
    fillWords(w.attendance, { members: q.members, present: `${q.present}${present.length ? ` (${present.join(", ")})` : ""}`, represented: q.represented }),
    q.needed ? fillWords(q.reached ? w.quorumReached : w.quorumMissed, { needed: q.needed }) : w.noQuorum,
    "",
  ];
  for (const [i, it] of items.entries()) {
    lines.push(fillWords(w.item, { n: i + 1, title: it.title }));
    if (it.detail) lines.push(it.detail);
    if (it.result) lines.push(`${fillWords(w.votes, { for: it.votes_for ?? 0, against: it.votes_against ?? 0, abstain: it.votes_abstain ?? 0 })} ${it.result === "adopted" ? w.adopted : w.rejected}`);
    else lines.push(w.notVoted);
    lines.push("");
  }
  lines.push(w.closed);
  return { text: lines.join("\n"), quorum: q };
}

export async function associationExecute(db: Pool, p: Principal, cmd: AssociationCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (x) => {
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      const clubPerson = async (id: string) => {
        if (!(await x.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [id, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      };
      const itemOf = async (id: string) => {
        const it = (await x.c.query("SELECT i.*,m.id AS meeting FROM meeting_item i JOIN association_meeting m ON m.id=i.meeting_id WHERE i.id=$1 AND m.organization_id=$2 FOR UPDATE OF i", [id, x.org])).rows[0];
        if (!it) throw new AccessError("NOT_FOUND", 404);
        return it as { id: string; meeting: string; position: number; majority: Majority };
      };
      switch (cmd.action) {
        case "rules": {
          need();
          await x.c.query("UPDATE organization SET assembly_rules=$2 WHERE id=$1", [x.org, JSON.stringify(cmd.rules)]);
          await audit(x.c, x.org, x.userId, "association.rules", x.org);
          return { id: x.org };
        }
        case "status": {
          need();
          await clubPerson(cmd.profileId);
          const id = await register(x.c, x.org, x.userId, { ...cmd, decisionBody: cmd.decisionBody, decisionOn: cmd.decisionOn });
          await audit(x.c, x.org, x.userId, "association.register", id, { event: cmd.event });
          return { id };
        }
        case "correct": {
          need();
          const line = (await x.c.query("SELECT * FROM member_register WHERE id=$1 AND organization_id=$2", [cmd.lineId, x.org])).rows[0];
          if (!line) throw new AccessError("NOT_FOUND", 404);
          const id = await register(x.c, x.org, x.userId, { profileId: line.profile_id, event: "correction", status: cmd.status, decisionBody: line.decision_body, decisionOn: line.decision_on, reason: cmd.reason, correctsId: line.id });
          return { id };
        }
        case "plan": {
          need();
          const r = await rules(x.c, x.org);
          const id = (
            await x.c.query("INSERT INTO association_meeting(organization_id,kind,title,starts_at,place,fiscal_year_start,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              x.org,
              cmd.kind,
              cmd.title,
              cmd.startsAt,
              cmd.place,
              cmd.kind === "assembly" ? cmd.fiscalYearStart : null,
              x.userId,
            ])
          ).rows[0].id as string;
          const day = localDay(cmd.startsAt);
          if (cmd.kind === "assembly") await prefill(x.c, x.org, id, day, cmd.fiscalYearStart, r, cmd.locale);
          for (const pid of await invitees(x.c, x.org, cmd.kind)) await x.c.query("INSERT INTO meeting_attendee(meeting_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, pid]);
          // 6: the steps before the assembly become tasks; the date's task closes.
          if (cmd.kind === "assembly") {
            const w = associationWords[cmd.locale].tasks;
            const s = assemblySteps(day, r.noticeDays);
            await task(x.c, x.org, x.userId, `meeting:${id}:prepare`, fillWords(w.prepare, { title: cmd.title }), s.prepare);
            await task(x.c, x.org, x.userId, `meeting:${id}:agenda`, fillWords(w.agenda, { title: cmd.title }), s.agenda);
            await task(x.c, x.org, x.userId, `meeting:${id}:invite`, fillWords(w.invite, { title: cmd.title }), s.invite);
            if (cmd.fiscalYearStart) await closeTask(x.c, x.org, `assembly:${cmd.fiscalYearStart}:date`);
          }
          await audit(x.c, x.org, x.userId, "association.meeting", id, { kind: cmd.kind });
          return { id };
        }
        case "cancel": {
          need();
          await meetingRow(x, cmd.meetingId, true);
          await x.c.query("UPDATE association_meeting SET status='cancelled',version=version+1 WHERE id=$1", [cmd.meetingId]);
          await x.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true WHERE organization_id=$1 AND source_key LIKE 'meeting:'||$2::text||':%' AND status<>'done'", [x.org, cmd.meetingId]);
          return { id: cmd.meetingId };
        }
        case "item": {
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.status !== "planned") throw new AccessError("MEETING_CLOSED", 409);
          if (cmd.profileId) await clubPerson(cmd.profileId);
          const r = await rules(x.c, x.org);
          const values = [cmd.kind, cmd.title, cmd.detail, cmd.majority ?? r.majorities[cmd.kind], cmd.profileId, cmd.boardRole];
          if (cmd.id) {
            const done = await x.c.query("UPDATE meeting_item SET kind=$3,title=$4,detail=$5,majority=$6,profile_id=$7,board_role=$8 WHERE id=$1 AND meeting_id=$2", [cmd.id, m.id, ...values]);
            if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: cmd.id };
          }
          const next = (await x.c.query("SELECT COALESCE(max(position),-1)+1 AS n FROM meeting_item WHERE meeting_id=$1", [m.id])).rows[0].n;
          return {
            id: (await x.c.query("INSERT INTO meeting_item(meeting_id,position,kind,title,detail,majority,profile_id,board_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [m.id, next, ...values])).rows[0].id as string,
          };
        }
        case "removeItem": {
          need();
          const it = await itemOf(cmd.id);
          await x.c.query("DELETE FROM meeting_item WHERE id=$1", [it.id]);
          return { id: it.meeting };
        }
        case "moveItem": {
          need();
          const it = await itemOf(cmd.id);
          const other = (
            await x.c.query(`SELECT id,position FROM meeting_item WHERE meeting_id=$1 AND position ${cmd.direction === "up" ? "<" : ">"} $2 ORDER BY position ${cmd.direction === "up" ? "DESC" : "ASC"} LIMIT 1`, [it.meeting, it.position])
          ).rows[0];
          if (other) {
            await x.c.query("UPDATE meeting_item SET position=$2 WHERE id=$1", [it.id, other.position]);
            await x.c.query("UPDATE meeting_item SET position=$2 WHERE id=$1", [other.id, it.position]);
          }
          return { id: it.meeting };
        }
        case "sendInvite": {
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.invite_sent_at) throw new AccessError("ALREADY_SENT", 409);
          return { id: m.id, sent: await sendInvite(x.c, x.org, m.id, false) };
        }
        case "answer": {
          if (!x.manage && !x.own.has(cmd.profileId)) throw new AccessError("FORBIDDEN");
          await meetingRow(x, cmd.meetingId);
          const done = await x.c.query("UPDATE meeting_attendee SET answer=$3 WHERE meeting_id=$1 AND profile_id=$2", [cmd.meetingId, cmd.profileId, cmd.answer]);
          if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.meetingId };
        }
        case "proxy": {
          if (!x.manage && !x.own.has(cmd.giverId)) throw new AccessError("FORBIDDEN");
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.status !== "planned") throw new AccessError("MEETING_CLOSED", 409);
          await x.c.query("DELETE FROM meeting_proxy WHERE meeting_id=$1 AND giver_id=$2", [m.id, cmd.giverId]);
          if (cmd.holderId) {
            const both = (await x.c.query("SELECT count(*)::int AS n FROM meeting_attendee WHERE meeting_id=$1 AND profile_id=ANY($2::uuid[])", [m.id, [cmd.giverId, cmd.holderId]])).rows[0].n;
            if (both !== 2 || cmd.giverId === cmd.holderId) throw new AccessError("NOT_FOUND", 404);
            const r = await rules(x.c, x.org);
            const held = Number((await x.c.query("SELECT count(*)::int AS n FROM meeting_proxy WHERE meeting_id=$1 AND holder_id=$2", [m.id, cmd.holderId])).rows[0].n);
            if (!proxyAllowed(held, r.maxProxies)) throw new AccessError("PROXY_LIMIT", 409);
            // A member who holds proxies cannot give his own away.
            if ((await x.c.query("SELECT 1 FROM meeting_proxy WHERE meeting_id=$1 AND (holder_id=$2 OR giver_id=$3)", [m.id, cmd.giverId, cmd.holderId])).rowCount) throw new AccessError("PROXY_CHAIN", 409);
            await x.c.query("INSERT INTO meeting_proxy(meeting_id,giver_id,holder_id) VALUES($1,$2,$3)", [m.id, cmd.giverId, cmd.holderId]);
            await x.c.query("UPDATE meeting_attendee SET answer='absent' WHERE meeting_id=$1 AND profile_id=$2", [m.id, cmd.giverId]);
          }
          return { id: m.id };
        }
        case "presence": {
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.status !== "planned") throw new AccessError("MEETING_CLOSED", 409);
          const done = await x.c.query("UPDATE meeting_attendee SET present=$3 WHERE meeting_id=$1 AND profile_id=$2", [m.id, cmd.profileId, cmd.present]);
          if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
          const r = await rules(x.c, x.org);
          return { id: m.id, quorum: await count(x.c, x.org, m.id, m.kind, !!m.second_of, r) };
        }
        case "vote": {
          need();
          const it = await itemOf(cmd.itemId);
          const m = await meetingRow(x, it.meeting, true);
          if (m.status !== "planned") throw new AccessError("MEETING_CLOSED", 409);
          const r = await rules(x.c, x.org);
          if (!(await count(x.c, x.org, m.id, m.kind, !!m.second_of, r)).reached) throw new AccessError("NO_QUORUM", 409);
          const result = adopted(it.majority, { for: cmd.for, against: cmd.against, abstain: cmd.abstain }) ? "adopted" : "rejected";
          await x.c.query("UPDATE meeting_item SET votes_for=$2,votes_against=$3,votes_abstain=$4,result=$5 WHERE id=$1", [it.id, cmd.for, cmd.against, cmd.abstain, result]);
          return { id: it.id, result };
        }
        case "second": {
          // 9: the quorum missed, a second assembly with the same agenda; it decides whatever the number (when the statutes say so).
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          const r = await rules(x.c, x.org);
          if (m.kind !== "assembly" || (await count(x.c, x.org, m.id, m.kind, !!m.second_of, r)).reached) throw new AccessError("QUORUM_REACHED", 409);
          const title = fillWords(associationWords[cmd.locale].secondTitle, { title: m.title }).slice(0, 160);
          const id = (
            await x.c.query("INSERT INTO association_meeting(organization_id,kind,title,starts_at,place,fiscal_year_start,second_of,created_by) VALUES($1,'assembly',$2,$3,$4,$5,$6,$7) RETURNING id", [
              x.org,
              title,
              cmd.startsAt,
              m.place,
              m.fiscal_year_start,
              m.id,
              x.userId,
            ])
          ).rows[0].id as string;
          await x.c.query("INSERT INTO meeting_item(meeting_id,position,kind,title,detail,majority,profile_id,board_role) SELECT $2,position,kind,title,detail,majority,profile_id,board_role FROM meeting_item WHERE meeting_id=$1", [m.id, id]);
          await x.c.query("INSERT INTO meeting_attendee(meeting_id,profile_id) SELECT $2,profile_id FROM meeting_attendee WHERE meeting_id=$1", [m.id, id]);
          await x.c.query("UPDATE association_meeting SET status='held',quorum_reached=false,version=version+1 WHERE id=$1", [m.id]);
          const s = assemblySteps(localDay(cmd.startsAt), r.noticeDays);
          await task(x.c, x.org, x.userId, `meeting:${id}:invite`, fillWords(associationWords[cmd.locale].tasks.invite, { title }), s.invite);
          return { id };
        }
        case "close": {
          // 10 and 11: the minutes are written; the decisions take effect.
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.status !== "planned") throw new AccessError("MEETING_CLOSED", 409);
          const { text, quorum: q } = await minutesOf(x.c, x.org, m.id, cmd.locale);
          await x.c.query("UPDATE association_meeting SET status='closed',quorum_reached=$2,minutes=$3,version=version+1 WHERE id=$1", [m.id, q.reached, text]);
          const day = localDay(m.starts_at);
          const items = (await x.c.query("SELECT * FROM meeting_item WHERE meeting_id=$1 AND result='adopted' ORDER BY position", [m.id])).rows;
          const body = m.kind === "assembly" ? "assembly" : "board";
          let directors = false;
          for (const it of items) {
            if (it.kind === "accounts" && m.fiscal_year_start) await approveAtAssembly(x.c, x.org, m.fiscal_year_start, day, x.userId);
            if (it.kind === "admission" && it.profile_id) await register(x.c, x.org, x.userId, { profileId: it.profile_id, event: "admission", status: "effective", decisionBody: body, decisionOn: day, meetingId: m.id });
            if (it.kind === "exit" && it.profile_id) await register(x.c, x.org, x.userId, { profileId: it.profile_id, event: "resignation", status: "adherent", decisionBody: body, decisionOn: day, meetingId: m.id });
            if (it.kind === "mandate" && it.profile_id) {
              const status = ((await x.c.query("SELECT status FROM association_member WHERE organization_id=$1 AND profile_id=$2", [x.org, it.profile_id])).rows[0]?.status as string) ?? "effective";
              const until = new Date(Date.parse(day + "T12:00:00Z") + 4 * 365 * 86400000).toISOString().slice(0, 10);
              await register(x.c, x.org, x.userId, { profileId: it.profile_id, event: "board_start", status, decisionBody: body, decisionOn: day, meetingId: m.id, boardRole: it.board_role ?? "director", boardUntil: until });
              directors = true;
            }
          }
          // A change of directors: the Moniteur belge and the UBO register, with their delays.
          if (directors) {
            const r = await rules(x.c, x.org);
            const w = associationWords[cmd.locale].tasks;
            const plus = (n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
            await task(x.c, x.org, x.userId, `meeting:${m.id}:moniteur`, fillWords(w.moniteur, { title: m.title }), plus(r.publicationDays));
            await task(x.c, x.org, x.userId, `meeting:${m.id}:ubo`, fillWords(w.ubo, { title: m.title }), plus(r.uboDays));
          }
          await audit(x.c, x.org, x.userId, "association.closed", m.id, { quorum: q.reached });
          return { id: m.id, quorum: q };
        }
        case "minutes": {
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.status !== "closed" || m.signed_president_at || m.signed_secretary_at) throw new AccessError("MEETING_SIGNED", 409);
          await x.c.query("UPDATE association_meeting SET minutes=$2,version=version+1 WHERE id=$1", [m.id, cmd.text]);
          return { id: m.id };
        }
        case "sign": {
          need();
          const m = await meetingRow(x, cmd.meetingId, true);
          if (m.status !== "closed") throw new AccessError("MEETING_OPEN", 409);
          await x.c.query(`UPDATE association_meeting SET signed_${cmd.role}_name=$2,signed_${cmd.role}_at=now(),version=version+1 WHERE id=$1`, [m.id, cmd.name]);
          const after = (await x.c.query("SELECT * FROM association_meeting WHERE id=$1", [m.id])).rows[0];
          // Both signed: the minutes go to Documents (Vie de l'ASBL, the year), as a PDF.
          if (after.signed_president_at && after.signed_secretary_at && !after.document_id) await fileMinutes(x, after);
          await audit(x.c, x.org, x.userId, "association.signed", m.id, { role: cmd.role });
          return { id: m.id };
        }
      }
    },
    expected,
  );
}

async function fileMinutes(x: Ctx, m: { id: string; title: string; starts_at: Date; minutes: string; signed_president_name: string; signed_president_at: Date; signed_secretary_name: string; signed_secretary_at: Date }) {
  const season = (
    await x.c.query("SELECT id FROM season WHERE organization_id=$1 AND $2::date BETWEEN starts_on AND ends_on ORDER BY archived,starts_on DESC LIMIT 1", [x.org, localDay(m.starts_at)])
  ).rows[0]?.id as string | undefined;
  if (!season) return;
  const w = associationWords.fr;
  const name = fillWords(w.documentName, { year: localDay(m.starts_at).slice(0, 4), title: m.title }).slice(0, 160);
  const text = `${m.minutes}\n\n${w.minutes.signatures}\n${m.signed_president_name} (${localDay(m.signed_president_at)})\n${m.signed_secretary_name} (${localDay(m.signed_secretary_at)})`;
  const bytes = Buffer.from(pdfDocument(text.split("\n").map((t, i) => ({ text: t, bold: i === 0, size: i === 0 ? 14 : 10 })), name));
  const docId = (await x.c.query("INSERT INTO club_document(organization_id,season_id,name,category,status) VALUES($1,$2,$3,'accounting','valid') RETURNING id", [x.org, season, name])).rows[0].id as string;
  const versionId = randomUUID();
  await x.c.query("INSERT INTO document_version(id,document_id,sequence,filename,media_type,content_ciphertext,sha256,uploaded_by) VALUES($1,$2,1,$3,'application/pdf',$4,$5,$6)", [
    versionId,
    docId,
    (name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 110) || "pv") + ".pdf",
    await storageAdapter().put("document:" + versionId, seal({ data: bytes.toString("base64") }, "document:" + versionId)),
    createHash("sha256").update(bytes).digest("hex"),
    x.userId,
  ]);
  await x.c.query("UPDATE club_document SET current_version_id=$2 WHERE id=$1", [docId, versionId]);
  await x.c.query("UPDATE association_meeting SET document_id=$2 WHERE id=$1", [m.id, docId]);
}

/** 4: the register as a dated PDF, for the presidency and the effective members. */
export async function registerPdf(db: Pool, p: Principal, locale: Locale) {
  const v = await associationView(db, p, locale);
  if (!v.can.read) throw new AccessError("FORBIDDEN");
  const w = associationWords[locale];
  const club = await scope(db, p, false, async (x) => (await x.c.query("SELECT name FROM organization WHERE id=$1", [x.org])).rows[0]?.name as string);
  const day = (d: string | null) => (d ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "…");
  const effective = v.members.filter((m) => m.status === "effective");
  const title = fillWords(w.register.title, { club });
  const lines = [
    { text: title, bold: true, size: 14 },
    { text: fillWords(w.register.printed, { date: day(today()) }), size: 9, gap: 10 },
    { text: fillWords(w.register.members, { n: effective.length }), bold: true, size: 11 },
    ...effective.map((m) => ({ text: `${m.full_name} · ${day(m.admitted_on)}${m.board_role ? ` · ${m.board_role}` : ""}`, size: 10 })),
    { text: w.register.history, bold: true, size: 11, gap: 10 },
    ...v.register.map((l) => ({
      text:
        fillWords(w.register.line, {
          date: day(localDay(l.recorded_at)),
          name: l.full_name,
          event: w.events[l.event as keyof typeof w.events] ?? l.event,
          status: w.statuses[l.status_after as keyof typeof w.statuses] ?? l.status_after,
          decision: l.decision_body ? ` · ${w.register.bodies[l.decision_body as "assembly" | "board"]} ${day(l.decision_on)}` : "",
        }) + (l.event === "correction" ? fillWords(w.register.correction, { reason: l.reason }) : ""),
      size: 9,
    })),
  ];
  return { bytes: pdfDocument(lines, title), filename: `registre-${today()}.pdf` };
}

/**
 * Once a day: the date of the assembly to set (the last closed year, six
 * months after its closing), the invitations at J-notice, the reminders at
 * J-5 to those who did not answer. Each once.
 */
export async function associationTick(db: Pool) {
  const clubs = (await db.query("SELECT id FROM organization WHERE kind='club' AND EXISTS(SELECT 1 FROM association_member m WHERE m.organization_id=organization.id AND m.status='effective')")).rows.map((r) => r.id as string);
  let sent = 0;
  for (const org of clubs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
      const r = await rules(c, org);
      const year = await lastClosedYear(c, org);
      const planned = (await c.query("SELECT 1 FROM association_meeting WHERE organization_id=$1 AND kind='assembly' AND fiscal_year_start=$2 AND status<>'cancelled'", [org, year.from])).rowCount;
      const by = (await c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL ORDER BY valid_from LIMIT 1", [org])).rows[0]?.user_id as string | undefined;
      const locale = "fr" as Locale;
      if (!planned && by && year.status !== "approved" && year.status !== "filed") {
        const due = new Date(Date.parse(year.deadline + "T12:00:00Z") - (r.noticeDays + 30) * 86400000).toISOString().slice(0, 10);
        await task(c, org, by, `assembly:${year.from}:date`, fillWords(associationWords[locale].tasks.date, { date: year.deadline }), due);
      }
      const due = (
        await c.query(
          `SELECT id,starts_at,invite_sent_at,reminder_sent_at FROM association_meeting WHERE organization_id=$1 AND status='planned' AND starts_at>now()
             AND ((invite_sent_at IS NULL AND starts_at<=now()+make_interval(days => $2)) OR (invite_sent_at IS NOT NULL AND reminder_sent_at IS NULL AND starts_at<=now()+interval '5 days'))`,
          [org, r.noticeDays],
        )
      ).rows as { id: string; invite_sent_at: Date | null }[];
      for (const m of due) sent += await sendInvite(c, org, m.id, !!m.invite_sent_at);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}
