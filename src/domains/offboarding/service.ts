import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { pdfDocument } from "../../lib/pdf";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { keysOnDeparture } from "../keys/service";
import { fillWords, offboardingWords } from "./offboarding-copy";
import { blockingKinds, departureProgress, dueBefore, offboardingCommand, type DepartureKind, type OffboardingCommand } from "./schema";
import type { z } from "zod";

/**
 * « Fin de coach ». The button on the coach's file opens the departure: its
 * steps come from what the application knows of him (teams, open tasks,
 * coming sessions and trips, keys, private exercise sheets, rights), each
 * ticks by itself when its condition is met or is skipped with a reason.
 * At the end date his coach rights end, his teams and feeds close and he
 * joins the former coaches, even with steps open (the president is told).
 * Another role he holds (a parent, say) stays as it is.
 */
type Ctx = { c: PoolClient; org: string; userId: string; manage: boolean; own: Set<string> };
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
    const rights = permissions(a.role, a.grants);
    const manage = mfa && (a.role === "club_president" || rights.includes("mandates.manage") || rights.includes("people.manage"));
    // His own file only (not his children's): the departure part that is his.
    const own = new Set(
      (await c.query("SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND pe.user_id=$2", [a.organization_id, p.userId])).rows.map((r) => r.id as string),
    );
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage, own });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());

type Run = { id: string; organization_id: string; profile_id: string; user_id: string | null; ends_on: string; reason: string; note: string; status: string; started_by: string; full_name: string };
async function runRow(c: PoolClient, org: string, id: string, lock = false) {
  const r = (
    await c.query(
      `SELECT r.*,r.ends_on::text AS ends_on,cp.full_name FROM offboarding_run r JOIN club_person cp ON cp.id=r.profile_id WHERE r.id=$1 AND r.organization_id=$2 ${lock ? "FOR UPDATE OF r" : ""}`,
      [id, org],
    )
  ).rows[0] as Run | undefined;
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
}

/** What concerns the coach today, for each kind of step. */
async function facts(c: PoolClient, org: string, profileId: string, userId: string | null) {
  const teams = (
    await c.query(
      `SELECT DISTINCT t.id,t.name FROM team_membership m JOIN team t ON t.id=m.team_id
        WHERE m.organization_id=$1 AND m.profile_id=$2 AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) ORDER BY t.name`,
      [org, profileId],
    )
  ).rows as { id: string; name: string }[];
  const tasks = Number(
    (
      await c.query(
        `SELECT count(DISTINCT t.id)::int AS n FROM task t LEFT JOIN task_assignee a ON a.task_id=t.id
          WHERE t.organization_id=$1 AND t.status<>'done' AND (t.responsible_id=$2 OR a.profile_id=$2) AND COALESCE(t.source_key,'') NOT LIKE 'offboarding:%'`,
        [org, profileId],
      )
    ).rows[0].n,
  );
  const events = userId
    ? Number((await c.query("SELECT count(*)::int AS n FROM calendar_event WHERE organization_id=$1 AND responsible_user_id=$2 AND status='scheduled' AND starts_at>now()", [org, userId])).rows[0].n)
    : 0;
  const drives = Number(
    (
      await c.query(
        "SELECT count(*)::int AS n FROM trip_vehicle_driver d JOIN trip_vehicle v ON v.id=d.trip_vehicle_id JOIN trip t ON t.id=v.trip_id WHERE t.organization_id=$1 AND d.profile_id=$2 AND t.status<>'cancelled' AND t.ends_on>=CURRENT_DATE",
        [org, profileId],
      )
    ).rows[0].n,
  );
  const keys = Number((await c.query("SELECT count(*)::int AS n FROM staff_key WHERE organization_id=$1 AND profile_id=$2 AND returned_on IS NULL", [org, profileId])).rows[0].n);
  const exercises = userId ? Number((await c.query("SELECT count(*)::int AS n FROM exercise WHERE organization_id=$1 AND author_id=$2 AND NOT shared AND NOT archived", [org, userId])).rows[0].n) : 0;
  const mandates = userId
    ? ((await c.query("SELECT id,valid_until FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='coach' AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now())", [org, userId])).rows as { id: string; valid_until: Date | null }[])
    : [];
  return { teams, tasks, duties: events + drives, keys, exercises, mandates };
}

/** 2: the departure's steps, only those that concern him, with their tasks in the to-do. */
async function generate(c: PoolClient, run: Run, starter: string, locale: Locale) {
  const f = await facts(c, run.organization_id, run.profile_id, run.user_id);
  const skip = new Set(((await c.query("SELECT offboarding_skip FROM organization WHERE id=$1", [run.organization_id])).rows[0]?.offboarding_skip ?? []) as string[]);
  const w = offboardingWords[locale];
  const steps: { key: string; kind: DepartureKind; ref?: string; label: string }[] = [
    ...f.teams.map((t) => ({ key: `replace:${t.id}`, kind: "replace" as const, ref: t.id, label: fillWords(w.steps.replace, { team: t.name }) })),
    ...(f.tasks ? [{ key: "tasks", kind: "tasks" as const, label: w.steps.tasks }] : []),
    ...(f.duties ? [{ key: "duties", kind: "duties" as const, label: w.steps.duties }] : []),
    ...(f.keys ? [{ key: "keys", kind: "keys" as const, label: w.steps.keys }] : []),
    ...(f.exercises && !skip.has("exercises") ? [{ key: "exercises", kind: "exercises" as const, label: w.steps.exercises }] : []),
    ...(f.mandates.length ? [{ key: "rights", kind: "rights" as const, label: w.steps.rights }] : []),
    ...(f.teams.length && !skip.has("notify") ? [{ key: "notify", kind: "notify" as const, label: w.steps.notify }] : []),
    ...(!skip.has("thanks") ? [{ key: "thanks", kind: "thanks" as const, label: w.steps.thanks }] : []),
    ...(run.user_id && !skip.has("survey") ? [{ key: "survey", kind: "survey" as const, label: w.steps.survey }] : []),
    { key: "close", kind: "close" as const, label: w.steps.close },
  ];
  // The person who starts the departure carries its tasks.
  const starterProfile = (
    await c.query("SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE pe.user_id=$1 AND cp.organization_id=$2 AND cp.status='active' LIMIT 1", [starter, run.organization_id])
  ).rows[0]?.id as string | undefined;
  const now = today();
  for (const [i, s] of steps.entries()) {
    const due = dueBefore(run.ends_on, s.kind, now);
    const task =
      s.kind === "survey" || s.kind === "exercises"
        ? null
        : ((
            await c.query(
              `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_id,responsible_user_id,origin,created_by,source_key,source_kind,source_params)
               VALUES($1,'other','admin',$2,$3,$4,$5,'template',$6,$7,'offboarding',$8) ON CONFLICT DO NOTHING RETURNING id`,
              [run.organization_id, fillWords(w.task, { name: run.full_name, step: s.label }).slice(0, 200), due, starterProfile ?? null, starterProfile ? null : starter, starter, `offboarding:${run.id}:${s.key}`, JSON.stringify({ profile: run.profile_id })],
            )
          ).rows[0]?.id as string | undefined) ?? null;
    await c.query("INSERT INTO offboarding_step(run_id,key,position,kind,ref,label,blocking,due_on,task_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
      run.id,
      s.key,
      i,
      s.kind,
      s.ref ?? null,
      s.label,
      blockingKinds.includes(s.kind),
      due,
      task,
    ]);
  }
}

/** 3: each step ticks by itself when its condition is met; its task closes with it. */
export async function autoCheck(c: PoolClient, runId: string) {
  const run = (await c.query("SELECT r.*,r.ends_on::text AS ends_on FROM offboarding_run r WHERE r.id=$1 AND r.status='active'", [runId])).rows[0] as Run | undefined;
  if (!run) return;
  const f = await facts(c, run.organization_id, run.profile_id, run.user_id);
  const steps = (await c.query("SELECT key,kind,ref FROM offboarding_step WHERE run_id=$1 AND done_at IS NULL", [runId])).rows as { key: string; kind: DepartureKind; ref: string | null }[];
  for (const s of steps) {
    let done = false;
    if (s.kind === "replace")
      done = !!(
        await c.query(
          "SELECT 1 FROM team_membership WHERE organization_id=$1 AND team_id=$2 AND role='coach' AND profile_id<>$3 AND NOT cancelled AND closed_at IS NULL AND (ends_on IS NULL OR ends_on>CURRENT_DATE)",
          [run.organization_id, s.ref, run.profile_id],
        )
      ).rowCount;
    else if (s.kind === "tasks") done = f.tasks === 0;
    else if (s.kind === "duties") done = f.duties === 0;
    else if (s.kind === "keys") done = f.keys === 0;
    else if (s.kind === "exercises") done = f.exercises === 0;
    else if (s.kind === "rights") done = f.mandates.every((m) => m.valid_until && new Date(m.valid_until) <= new Date(run.ends_on + "T23:59:59Z"));
    if (done) await stepDone(c, run, s.key, "auto");
  }
}
async function stepDone(c: PoolClient, run: Pick<Run, "id" | "organization_id">, key: string, how: "auto" | "done" | "skipped", reason = "") {
  const t = (
    await c.query("UPDATE offboarding_step SET done_at=now(),done_how=$3,skip_reason=$4 WHERE run_id=$1 AND key=$2 AND done_at IS NULL RETURNING task_id", [run.id, key, how, reason])
  ).rows[0] as { task_id: string | null } | undefined;
  if (t?.task_id) await c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE id=$1 AND status<>'done'", [t.task_id]);
}

/**
 * 5: the end date. The coach rights end, his teams close, his calendar
 * feeds are revoked, he joins the former coaches with the reason, a task
 * follows for keys still held. Done even with steps open; the president is
 * told what remains.
 */
async function closeRun(c: PoolClient, run: Run) {
  const org = run.organization_id;
  if (run.user_id) {
    const mandates = (
      await c.query(
        "UPDATE role_assignment SET valid_until=LEAST(COALESCE(valid_until,now()),now()) WHERE organization_id=$1 AND user_id=$2 AND role='coach' AND revoked_at IS NULL RETURNING id",
        [org, run.user_id],
      )
    ).rows.map((r) => r.id as string);
    if (mandates.length) await c.query("UPDATE calendar_feed SET revoked_at=now() WHERE mandate_id=ANY($1::uuid[]) AND revoked_at IS NULL", [mandates]);
  }
  await c.query(
    "UPDATE team_membership SET ends_on=GREATEST(starts_on,CURRENT_DATE),cancelled=starts_on>CURRENT_DATE,closed_at=now() WHERE profile_id=$1 AND organization_id=$2 AND role IN ('coach','assistant') AND closed_at IS NULL AND NOT cancelled AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)",
    [run.profile_id, org],
  );
  await c.query(
    `UPDATE club_person SET directory_roles=CASE WHEN 'coach'=ANY(directory_roles) THEN directory_roles ELSE array_append(directory_roles,'coach') END,
            former_roles=CASE WHEN 'coach'=ANY(former_roles) THEN former_roles ELSE array_append(former_roles,'coach') END,
            departure_status=COALESCE(departure_status,$3),departure_note=CASE WHEN departure_note='' THEN $4 ELSE departure_note END,version=version+1,updated_at=now()
      WHERE id=$1 AND organization_id=$2`,
    [run.profile_id, org, run.reason, run.note],
  );
  await keysOnDeparture(c, org, run.profile_id, run.started_by);
  await autoCheck(c, run.id);
  const open = (await c.query("SELECT label FROM offboarding_step WHERE run_id=$1 AND done_at IS NULL AND key<>'close' AND blocking", [run.id])).rows.map((r) => r.label as string);
  if (open.length) {
    const starter = (await c.query('SELECT u.id,u.email,u.name,COALESCE(pe.locale,\'fr\') AS locale,o.name AS club FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id JOIN organization o ON o.id=$2 WHERE u.id=$1', [run.started_by, org])).rows[0];
    if (starter) {
      const locale: Locale = isLocale(starter.locale) ? starter.locale : "fr";
      const w = offboardingWords[locale];
      await publish(c, {
        organizationId: org,
        userId: starter.id,
        email: starter.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: `offboarding:${run.id}`,
        eventKey: `offboarding:${run.id}:alert`,
        locale,
        variables: { name: starter.name, title: fillWords(w.alertTitle, { name: run.full_name }), message: fillWords(w.alertText, { steps: open.join(" ; ") }), organization: starter.club, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/coaches/${run.profile_id}` },
      });
    }
  }
  await stepDone(c, run, "close", "done");
  await c.query("UPDATE offboarding_run SET status='done',closed_at=now() WHERE id=$1", [run.id]);
  await audit(c, org, run.started_by, "offboarding.closed", run.id, { open: open.length });
}

async function steps(c: PoolClient, runId: string) {
  return (
    await c.query(
      "SELECT key,position,kind,ref,label,blocking,due_on::text AS due_on,task_id,done_at,done_how,skip_reason FROM offboarding_step WHERE run_id=$1 ORDER BY position",
      [runId],
    )
  ).rows as { key: string; position: number; kind: DepartureKind; ref: string | null; label: string; blocking: boolean; due_on: string; task_id: string | null; done_at: string | null; done_how: string | null; skip_reason: string }[];
}

/** The departure of one coach, for who manages the members and for the coach himself. */
export async function offboardingView(db: Pool, p: Principal, profileId: string) {
  return scope(db, p, true, async (x) => {
    const self = x.own.has(profileId);
    if (!x.manage && !self) throw new AccessError("NOT_FOUND", 404);
    if (!(await x.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [profileId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    const id = (await x.c.query("SELECT id FROM offboarding_run WHERE organization_id=$1 AND profile_id=$2 ORDER BY (status='active') DESC,created_at DESC LIMIT 1", [x.org, profileId])).rows[0]?.id as string | undefined;
    if (id) await autoCheck(x.c, id);
    const run = id ? await runRow(x.c, x.org, id) : null;
    const list = run ? await steps(x.c, run.id) : [];
    return {
      organization_id: x.org,
      today: today(),
      can: { manage: x.manage, self },
      run: run && (run.status === "active" || x.manage) ? { id: run.id, ends_on: run.ends_on, reason: run.reason, note: x.manage ? run.note : "", status: run.status, steps: list, progress: departureProgress(list) } : null,
      // Who may take over his tasks and duties (people with an account for sessions).
      people: x.manage
        ? ((
            await x.c.query(
              "SELECT cp.id,cp.full_name,pe.user_id IS NOT NULL AS account FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND cp.status='active' AND cp.id<>$2 ORDER BY cp.full_name LIMIT 500",
              [x.org, profileId],
            )
          ).rows as { id: string; full_name: string; account: boolean }[])
        : [],
      skip: x.manage ? (((await x.c.query("SELECT offboarding_skip FROM organization WHERE id=$1", [x.org])).rows[0]?.offboarding_skip ?? []) as string[]) : [],
    };
  });
}

/** 7: which optional steps the club leaves out of its departures (Réglages › Membres). */
export async function offboardingSettings(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    if (!x.manage) throw new AccessError("FORBIDDEN");
    return { organization_id: x.org, skip: ((await x.c.query("SELECT offboarding_skip FROM organization WHERE id=$1", [x.org])).rows[0]?.offboarding_skip ?? []) as string[] };
  });
}

export async function offboardingExecute(db: Pool, p: Principal, raw: z.input<typeof offboardingCommand>, expected: string) {
  const cmd: OffboardingCommand = offboardingCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (x) => {
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      if (cmd.action === "settings") {
        need();
        await x.c.query("UPDATE organization SET offboarding_skip=$2 WHERE id=$1", [x.org, cmd.skip]);
        return { id: x.org };
      }
      if (cmd.action === "start") {
        need();
        const person = (
          await x.c.query("SELECT cp.id,cp.full_name,pe.user_id,COALESCE(pe.locale,'fr') AS locale FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND cp.organization_id=$2", [cmd.profileId, x.org])
        ).rows[0] as { id: string; full_name: string; user_id: string | null; locale: string } | undefined;
        if (!person) throw new AccessError("NOT_FOUND", 404);
        if (cmd.endsOn < today()) throw new AccessError("INVALID_DATE", 400);
        const id = (
          await x.c.query("INSERT INTO offboarding_run(organization_id,profile_id,user_id,ends_on,reason,note,started_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
            x.org,
            person.id,
            person.user_id,
            cmd.endsOn,
            cmd.reason,
            cmd.note,
            x.userId,
          ])
        ).rows[0].id as string;
        const run = await runRow(x.c, x.org, id);
        await generate(x.c, run, x.userId, cmd.locale);
        await autoCheck(x.c, id);
        // « Prévenir le coach »: his part (questions, his sheets) waits on his file.
        if (cmd.notifyCoach && person.user_id) {
          const u = (await x.c.query('SELECT u.id,u.email,u.name,o.name AS club FROM "user" u JOIN organization o ON o.id=$2 WHERE u.id=$1 AND u.active', [person.user_id, x.org])).rows[0];
          if (u) {
            const locale: Locale = isLocale(person.locale) ? person.locale : "fr";
            const w = offboardingWords[locale];
            await publish(x.c, {
              organizationId: x.org,
              userId: u.id,
              email: u.email,
              kind: "automation",
              category: "administrative",
              resourceType: "automation",
              resourceId: `offboarding:${id}`,
              eventKey: `offboarding:${id}:coach`,
              locale,
              variables: { name: u.name, title: fillWords(w.toCoachTitle, { date: cmd.endsOn }), message: w.toCoachText, organization: u.club, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/coaches/${person.id}` },
            });
          }
        }
        await audit(x.c, x.org, x.userId, "offboarding.started", id, { profile: person.id });
        return { id };
      }
      const run = await runRow(x.c, x.org, cmd.runId, true);
      if (run.status !== "active") throw new AccessError("DEPARTURE_CLOSED", 409);
      const self = x.own.has(run.profile_id);
      switch (cmd.action) {
        case "cancel": {
          // 8: before the end date the coach stays; the open departure tasks close, nothing else changes.
          need();
          await x.c.query("UPDATE offboarding_run SET status='cancelled',closed_at=now() WHERE id=$1", [run.id]);
          await x.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key LIKE 'offboarding:'||$2::text||':%' AND status<>'done'", [x.org, run.id]);
          await audit(x.c, x.org, x.userId, "offboarding.cancelled", run.id);
          return { id: run.id };
        }
        case "skip": {
          need();
          if (cmd.key === "close") throw new AccessError("INVALID_INPUT", 400);
          if (!(await x.c.query("SELECT 1 FROM offboarding_step WHERE run_id=$1 AND key=$2", [run.id, cmd.key])).rowCount) throw new AccessError("NOT_FOUND", 404);
          await stepDone(x.c, run, cmd.key, "skipped", cmd.reason);
          return { id: run.id };
        }
        case "reassignTasks": {
          need();
          if (!(await x.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active' AND id<>$3", [cmd.toProfileId, x.org, run.profile_id])).rowCount) throw new AccessError("NOT_FOUND", 404);
          const ids = (
            await x.c.query(
              `SELECT DISTINCT t.id FROM task t LEFT JOIN task_assignee a ON a.task_id=t.id
                WHERE t.organization_id=$1 AND t.status<>'done' AND (t.responsible_id=$2 OR a.profile_id=$2) AND COALESCE(t.source_key,'') NOT LIKE 'offboarding:%'`,
              [x.org, run.profile_id],
            )
          ).rows.map((r) => r.id as string);
          for (const id of ids) {
            await x.c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [id, x.org, cmd.toProfileId]);
            await x.c.query("DELETE FROM task_assignee WHERE task_id=$1 AND organization_id=$2 AND profile_id=$3", [id, x.org, run.profile_id]);
            await x.c.query("UPDATE task SET responsible_id=CASE WHEN responsible_id=$3 THEN $4 ELSE responsible_id END,updated_at=now() WHERE id=$1 AND organization_id=$2", [id, x.org, run.profile_id, cmd.toProfileId]);
          }
          await autoCheck(x.c, run.id);
          await audit(x.c, x.org, x.userId, "offboarding.tasks", run.id, { count: ids.length, to: cmd.toProfileId });
          return { id: run.id, moved: ids.length };
        }
        case "reassignDuties": {
          need();
          const to = (await x.c.query("SELECT pe.user_id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND cp.organization_id=$2 AND cp.status='active' AND cp.id<>$3", [cmd.toProfileId, x.org, run.profile_id])).rows[0] as { user_id: string | null } | undefined;
          if (!to) throw new AccessError("NOT_FOUND", 404);
          if (!to.user_id) throw new AccessError("NO_ACCOUNT", 409);
          if (run.user_id)
            await x.c.query("UPDATE calendar_event SET responsible_user_id=$3,version=version+1,updated_at=now() WHERE organization_id=$1 AND responsible_user_id=$2 AND status='scheduled' AND starts_at>now()", [x.org, run.user_id, to.user_id]);
          // His seats at the wheel go to the other person (or are freed when already driving).
          const drives = (
            await x.c.query(
              "SELECT d.trip_vehicle_id,d.legs FROM trip_vehicle_driver d JOIN trip_vehicle v ON v.id=d.trip_vehicle_id JOIN trip t ON t.id=v.trip_id WHERE t.organization_id=$1 AND d.profile_id=$2 AND t.status<>'cancelled' AND t.ends_on>=CURRENT_DATE",
              [x.org, run.profile_id],
            )
          ).rows as { trip_vehicle_id: string; legs: string }[];
          for (const d of drives) {
            await x.c.query("DELETE FROM trip_vehicle_driver WHERE trip_vehicle_id=$1 AND profile_id=$2", [d.trip_vehicle_id, run.profile_id]);
            await x.c.query("INSERT INTO trip_vehicle_driver(trip_vehicle_id,profile_id,legs) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [d.trip_vehicle_id, cmd.toProfileId, d.legs]);
            await x.c.query("UPDATE trip_vehicle SET driver_profile_id=$3 WHERE id=$1 AND driver_profile_id=$2", [d.trip_vehicle_id, run.profile_id, cmd.toProfileId]);
          }
          await autoCheck(x.c, run.id);
          return { id: run.id };
        }
        case "rightsEnd": {
          need();
          if (run.user_id)
            await x.c.query(
              "UPDATE role_assignment SET valid_until=LEAST(COALESCE(valid_until,'infinity'::timestamptz),($3::date+1)::timestamptz) WHERE organization_id=$1 AND user_id=$2 AND role='coach' AND revoked_at IS NULL",
              [x.org, run.user_id, run.ends_on],
            );
          await autoCheck(x.c, run.id);
          return { id: run.id };
        }
        case "notify": {
          // The « Départ d'un coach » email to the players and parents of his teams, once.
          need();
          const people = (
            await x.c.query(
              `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM team_membership m JOIN offboarding_step s ON s.run_id=$3 AND s.kind='replace' AND s.ref=m.team_id
                 JOIN club_person cp ON cp.id=m.profile_id
                 LEFT JOIN guardian_relationship g ON g.subject_profile_id=cp.id AND g.organization_id=m.organization_id AND g.revoked_at IS NULL
                 JOIN club_person who ON who.id=COALESCE(g.guardian_profile_id,cp.id) OR who.id=cp.id
                 JOIN person pe ON pe.id=who.person_id JOIN "user" u ON u.id=pe.user_id
                WHERE m.organization_id=$1 AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND u.active AND who.id<>$2`,
              [x.org, run.profile_id, run.id],
            )
          ).rows as { id: string; email: string; name: string; locale: string }[];
          const club = (await x.c.query("SELECT name FROM organization WHERE id=$1", [x.org])).rows[0]?.name as string;
          for (const u of people) {
            const locale: Locale = isLocale(u.locale) ? u.locale : cmd.locale;
            const w = offboardingWords[locale];
            await publish(x.c, {
              organizationId: x.org,
              userId: u.id,
              email: u.email,
              kind: "automation",
              category: "sport",
              resourceType: "automation",
              resourceId: `offboarding:${run.id}`,
              eventKey: `offboarding:${run.id}:team:${u.id}`,
              locale,
              variables: { name: u.name, title: fillWords(w.teamTitle, { name: run.full_name }), message: fillWords(w.teamText, { name: run.full_name, date: run.ends_on }), organization: club, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}` },
            });
          }
          await stepDone(x.c, run, "notify", "done");
          return { id: run.id, sent: people.length };
        }
        case "thanks": {
          need();
          if (run.user_id) {
            const u = (await x.c.query('SELECT u.id,u.email,u.name,COALESCE(pe.locale,\'fr\') AS locale,o.name AS club FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id JOIN organization o ON o.id=$2 WHERE u.id=$1 AND u.active', [run.user_id, x.org])).rows[0];
            if (u) {
              const locale: Locale = isLocale(u.locale) ? u.locale : cmd.locale;
              const w = offboardingWords[locale];
              await publish(x.c, {
                organizationId: x.org,
                userId: u.id,
                email: u.email,
                kind: "automation",
                category: "administrative",
                resourceType: "automation",
                resourceId: `offboarding:${run.id}`,
                eventKey: `offboarding:${run.id}:thanks`,
                locale,
                variables: { name: u.name, title: fillWords(w.thanksTitle, { name: u.name }), message: w.thanksText, organization: u.club, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/coaches/${run.profile_id}` },
              });
            }
          }
          await stepDone(x.c, run, "thanks", "done");
          return { id: run.id };
        }
        case "survey": {
          if (!self) throw new AccessError("FORBIDDEN");
          await x.c.query("UPDATE offboarding_run SET survey=$2 WHERE id=$1", [run.id, JSON.stringify(cmd.answers)]);
          await stepDone(x.c, run, "survey", "done");
          return { id: run.id };
        }
        case "exercises": {
          // Never without his consent: only the coach himself chooses.
          if (!self || !run.user_id) throw new AccessError("FORBIDDEN");
          if (cmd.choice === "copy") await x.c.query("UPDATE exercise SET shared=true,version=version+1,updated_at=now() WHERE organization_id=$1 AND author_id=$2 AND NOT shared AND NOT archived", [x.org, run.user_id]);
          await stepDone(x.c, run, "exercises", cmd.choice === "copy" ? "auto" : "done");
          return { id: run.id };
        }
      }
      return { id: run.id };
    },
    expected,
  );
}

/** Once a day: the departures checked; those whose end date came are closed. */
export async function offboardingTick(db: Pool) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const runs = (await c.query("SELECT r.*,r.ends_on::text AS ends_on,cp.full_name FROM offboarding_run r JOIN club_person cp ON cp.id=r.profile_id WHERE r.status='active'")).rows as Run[];
    let closed = 0;
    for (const r of runs) {
      await autoCheck(c, r.id);
      if (r.ends_on <= today()) {
        await closeRun(c, r);
        closed++;
      }
    }
    await c.query("COMMIT");
    return closed;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** 2: the volunteering certificate (PDF): the dates and the supervised hours of the last twelve months. */
export async function volunteerCertificate(db: Pool, p: Principal, profileId: string, locale: Locale) {
  return scope(db, p, false, async (x) => {
    if (!x.manage && !x.own.has(profileId)) throw new AccessError("NOT_FOUND", 404);
    const who = (await x.c.query("SELECT cp.full_name,o.name AS club FROM club_person cp JOIN organization o ON o.id=cp.organization_id WHERE cp.id=$1 AND cp.organization_id=$2", [profileId, x.org])).rows[0];
    if (!who) throw new AccessError("NOT_FOUND", 404);
    const span = (await x.c.query("SELECT min(starts_on)::text AS from,COALESCE(max(COALESCE(ends_on,CURRENT_DATE)),CURRENT_DATE)::text AS to FROM team_membership WHERE organization_id=$1 AND profile_id=$2 AND role='coach' AND NOT cancelled", [x.org, profileId])).rows[0];
    const hours = (
      await x.c.query(
        `SELECT count(DISTINCT e.id)::int AS sessions,COALESCE(round(sum(extract(epoch FROM e.ends_at-e.starts_at))/3600),0)::int AS hours
           FROM calendar_event e JOIN team_membership m ON m.team_id=e.team_id AND m.profile_id=$2 AND m.role='coach' AND NOT m.cancelled
          WHERE e.organization_id=$1 AND e.status='scheduled' AND e.starts_at<now() AND e.starts_at>now()-interval '12 months'
            AND (e.starts_at AT TIME ZONE 'Europe/Brussels')::date BETWEEN m.starts_on AND COALESCE(m.ends_on,CURRENT_DATE)`,
        [x.org, profileId],
      )
    ).rows[0] as { sessions: number; hours: number };
    const w = offboardingWords[locale].attestation;
    const day = (d: string | null) => (d ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "…");
    const lines = [
      { text: who.club as string, bold: true, size: 12 },
      { text: w.title, bold: true, size: 16, gap: 18 },
      { text: fillWords(w.body, { club: who.club, name: who.full_name, from: day(span?.from ?? null), to: day(span?.to ?? null) }), size: 11, gap: 12 },
      { text: fillWords(w.hours, { hours: hours.hours, sessions: hours.sessions }), size: 11, gap: 12 },
      { text: fillWords(w.signed, { date: day(today()) }), size: 10, gap: 24 },
    ];
    return { bytes: pdfDocument(lines, w.title), filename: `attestation-${profileId.slice(0, 8)}.pdf` };
  });
}

