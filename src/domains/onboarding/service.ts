import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { isAdmin, permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { guideReadBy } from "../guide/service";
import { dueOf, onboardingCommand, progress, stepSchema, suggested, type OnboardingCommand, type Step } from "./schema";
import { z } from "zod";

/**
 * Parcours d'accueil. A club (for its coaches, staff, players, families) or
 * a federation (for its referees and staff) writes templates; a newcomer who
 * accepts an invitation in the role gets his journey, with deadlines from
 * his arrival. Each step ticks by itself when its brick is done (a document
 * uploaded, a field filled in, the tour seen, a task done) or is marked by
 * the newcomer (read, signed, training asked). A journey gives no right.
 */
type Ctx = { c: PoolClient; org: string; kind: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const manage = mfa && (isAdmin(a.role) || permissions(a.role, a.grants).includes("mandates.manage"));
    const out = await fn({ c, org: a.organization_id, kind: a.kind, userId: p.userId, manage });
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
const tourAudience: Record<string, string> = { coach: "coach", player: "player", guardian: "parent", referee: "referee" };

/** 3: a journey given to one person: its steps, their tasks and documents, then what is already done. */
export async function startRun(c: PoolClient, org: string, templateId: string, userId: string, createdBy: string) {
  const t = (await c.query("SELECT * FROM onboarding_template WHERE id=$1 AND organization_id=$2 AND NOT archived", [templateId, org])).rows[0];
  if (!t) throw new AccessError("NOT_FOUND", 404);
  const club = (await c.query("SELECT kind FROM organization WHERE id=$1", [org])).rows[0]?.kind === "club";
  const who = (
    await c.query(
      `SELECT u.id,COALESCE(pe.locale,'fr') AS locale,(SELECT cp.id FROM club_person cp WHERE cp.person_id=pe.id AND cp.organization_id=$2 AND cp.status='active' LIMIT 1) AS profile_id
         FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1`,
      [userId, org],
    )
  ).rows[0] as { id: string; locale: string; profile_id: string | null } | undefined;
  if (!who) throw new AccessError("NOT_FOUND", 404);
  // The newcomer belongs to this organization: a journey never reaches anyone else.
  if (!(await c.query("SELECT 1 FROM organization_membership WHERE organization_id=$1 AND user_id=$2", [org, userId])).rowCount) throw new AccessError("NOT_FOUND", 404);
  const locale: Locale = isLocale(who.locale) ? who.locale : "fr";
  const steps = z.array(stepSchema).parse(t.steps) as Step[];
  const run = (
    await c.query("INSERT INTO onboarding_run(organization_id,template_id,user_id,profile_id,name,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id", [
      org,
      t.id,
      userId,
      club ? who.profile_id : null,
      t.name,
      createdBy,
    ])
  ).rows[0]?.id as string | undefined;
  if (!run) return null;
  const start = today();
  const season = club ? ((await c.query("SELECT id FROM season WHERE organization_id=$1 AND CURRENT_DATE BETWEEN starts_on AND ends_on ORDER BY archived,starts_on DESC LIMIT 1", [org])).rows[0]?.id as string | undefined) : undefined;
  for (const [i, st] of steps.entries()) {
    const title = st.title[locale] || st.title.fr;
    const due = dueOf(start, st.daysAfter);
    let task: string | null = null,
      doc: string | null = null;
    // 3: a task or a meeting goes to the to-do of the newcomer (and of the person on the club's side for a meeting).
    if (st.kind === "task" || st.kind === "meeting") {
      task = (
        await c.query(
          `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_id,responsible_user_id,origin,created_by,source_key,source_kind)
           VALUES($1,'other',$2,$3,$4,$5,$6,'template',$7,$8,'onboarding') ON CONFLICT DO NOTHING RETURNING id`,
          [org, club ? "other" : "fed_other", title.slice(0, 200), due, club ? who.profile_id : null, club ? null : userId, createdBy, `onboarding:${run}:${st.key}`],
        )
      ).rows[0]?.id as string | undefined ?? null;
      if (task && st.kind === "meeting" && st.ownerId) {
        if (club && (await c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [st.ownerId, org])).rowCount)
          await c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [task, org, st.ownerId]);
        if (!club && (await c.query("SELECT 1 FROM organization_membership WHERE organization_id=$1 AND user_id=$2", [org, st.ownerId])).rowCount)
          await c.query("INSERT INTO task_assignee(task_id,organization_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [task, org, st.ownerId]);
        await c.query("UPDATE task SET completion='each' WHERE id=$1", [task]);
      }
    }
    // A document to upload is asked on the newcomer's file (it ticks when he has uploaded it).
    if (st.kind === "upload" && club && who.profile_id && season && st.link)
      doc = (
        await c.query("INSERT INTO club_document(organization_id,profile_id,season_id,name,category,status) VALUES($1,$2,$3,$4,'contract','requested') RETURNING id", [
          org,
          who.profile_id,
          season,
          st.link.slice(0, 160),
        ])
      ).rows[0].id as string;
    await c.query("INSERT INTO onboarding_step(run_id,key,position,kind,title,body,link,required,due_on,task_id,document_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [
      run,
      st.key,
      i,
      st.kind,
      title,
      st.body[locale] || st.body.fr,
      st.link,
      st.required,
      due,
      task,
      doc,
    ]);
  }
  await autoCheck(c, run);
  await audit(c, org, createdBy, "onboarding.started", run, { template: t.id, user: userId });
  return run;
}

/** 3: invitation accepted in a role: the journeys written for that role start. */
export async function assignOnAccept(c: PoolClient, org: string, userId: string, role: string, actorId: string) {
  const templates = (await c.query("SELECT id FROM onboarding_template WHERE organization_id=$1 AND audience=$2 AND trigger='invitation' AND NOT archived", [org, role])).rows;
  const runs: string[] = [];
  for (const t of templates) {
    const r = await startRun(c, org, t.id, userId, actorId);
    if (r) runs.push(r);
  }
  return runs;
}

/** Each step ticks by itself when its brick is done; the journey ends when the required steps are. */
export async function autoCheck(c: PoolClient, runId: string) {
  const run = (
    await c.query("SELECT r.*,t.audience FROM onboarding_run r JOIN onboarding_template t ON t.id=r.template_id WHERE r.id=$1 AND r.status='active'", [runId])
  ).rows[0] as { id: string; organization_id: string; user_id: string; profile_id: string | null; audience: string } | undefined;
  if (!run) return;
  const steps = (await c.query("SELECT key,kind,link,task_id,document_id FROM onboarding_step WHERE run_id=$1 AND done_at IS NULL", [runId])).rows as { key: string; kind: string; link: string; task_id: string | null; document_id: string | null }[];
  for (const s of steps) {
    let done = false;
    if (s.kind === "task" || s.kind === "meeting") done = !!s.task_id && !!(await c.query("SELECT 1 FROM task WHERE id=$1 AND status='done'", [s.task_id])).rowCount;
    else if (s.kind === "upload") done = !!s.document_id && !!(await c.query("SELECT 1 FROM club_document WHERE id=$1 AND status IN ('uploaded','review','valid')", [s.document_id])).rowCount;
    // Guide: an « À lire » step pointing to a chapter ticks once the chapter is read.
    else if (s.kind === "read" && s.link.startsWith("guide:")) done = await guideReadBy(c, run.organization_id, run.user_id, s.link.slice(6));
    // G7: a quiz passed ticks its step.
    else if (s.kind === "read" && s.link.startsWith("quiz:")) done = await guideReadBy(c, run.organization_id, run.user_id, s.link.slice(5), "quiz");
    else if (s.kind === "tour") done = !!(await c.query("SELECT 1 FROM user_tutorial WHERE user_id=$1 AND audience=$2 AND tutorial_seen_at IS NOT NULL", [run.user_id, tourAudience[run.audience] ?? run.audience])).rowCount;
    else if (s.kind === "profile") {
      const q: Record<string, [string, unknown[]]> = {
        phone: ["SELECT 1 FROM club_person WHERE id=$1 AND length(trim(phone))>0", [run.profile_id]],
        birth_date: ["SELECT 1 FROM club_person WHERE id=$1 AND birth_date IS NOT NULL", [run.profile_id]],
        licence: ["SELECT 1 FROM driver_licence WHERE profile_id=$1 AND cardinality(categories)>0", [run.profile_id]],
        photo: ["SELECT 1 FROM user_avatar WHERE user_id=$1", [run.user_id]],
        availability: ["SELECT 1 FROM referee_availability WHERE federation_id=$1 AND user_id=$2", [run.organization_id, run.user_id]],
      };
      const check = q[s.link];
      if (check && (s.link === "photo" || s.link === "availability" || run.profile_id)) done = !!(await c.query(check[0], check[1])).rowCount;
    }
    if (done) await c.query("UPDATE onboarding_step SET done_at=now(),done_how='auto' WHERE run_id=$1 AND key=$2 AND done_at IS NULL", [runId, s.key]);
  }
  await finish(c, runId);
}
async function finish(c: PoolClient, runId: string) {
  const left = (await c.query("SELECT count(*)::int AS n FROM onboarding_step WHERE run_id=$1 AND required AND done_at IS NULL", [runId])).rows[0].n as number;
  if (!left) await c.query("UPDATE onboarding_run SET status='done' WHERE id=$1 AND status='active'", [runId]);
}

async function stepsOf(c: PoolClient, runIds: string[]) {
  return (
    await c.query(
      "SELECT run_id,key,position,kind,title,body,link,required,due_on::text AS due_on,task_id,document_id,done_at,done_how,signed_name FROM onboarding_step WHERE run_id=ANY($1::uuid[]) ORDER BY run_id,position",
      [runIds],
    )
  ).rows as { run_id: string; key: string; position: number; kind: string; title: string; body: string; link: string; required: boolean; due_on: string; task_id: string | null; document_id: string | null; done_at: string | null; done_how: string | null; signed_name: string | null }[];
}

export async function onboardingView(db: Pool, p: Principal) {
  return scope(db, p, true, async (x) => {
    // The newcomer: his journeys here (checked on the way).
    const mineIds = (await x.c.query("SELECT id FROM onboarding_run WHERE organization_id=$1 AND user_id=$2 AND status='active'", [x.org, x.userId])).rows.map((r) => r.id as string);
    for (const id of mineIds) await autoCheck(x.c, id);
    const now = today();
    const mineRuns = (await x.c.query("SELECT id,name,started_on::text AS started_on,status FROM onboarding_run WHERE id=ANY($1::uuid[])", [mineIds])).rows as { id: string; name: string; started_on: string; status: string }[];
    const mineSteps = await stepsOf(x.c, mineIds);
    const mine = mineRuns.map((r) => {
      const steps = mineSteps.filter((s) => s.run_id === r.id);
      return { ...r, steps, progress: progress(steps, now) };
    });
    if (!x.manage) return { organization_id: x.org, kind: x.kind, today: now, can: { manage: false }, mine, templates: [], runs: [], people: [], owners: [] as { id: string; name: string }[] };
    const templates = (
      await x.c.query("SELECT id,name,audience,trigger,steps,archived,version FROM onboarding_template WHERE organization_id=$1 ORDER BY archived,name", [x.org])
    ).rows as { id: string; name: string; audience: string; trigger: string; steps: Step[]; archived: boolean; version: number }[];
    const runRows = (
      await x.c.query(
        `SELECT r.id,r.name,r.user_id,u.name AS user_name,r.started_on::text AS started_on,r.status,r.template_id
           FROM onboarding_run r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND (r.status='active' OR r.created_at>now()-interval '120 days') ORDER BY r.status,r.started_on DESC LIMIT 300`,
        [x.org],
      )
    ).rows as { id: string; name: string; user_id: string; user_name: string; started_on: string; status: string; template_id: string }[];
    const all = await stepsOf(x.c, runRows.map((r) => r.id));
    const runs = runRows.map((r) => {
      const steps = all.filter((s) => s.run_id === r.id);
      return { ...r, steps, progress: progress(steps, now) };
    });
    const people = (
      await x.c.query(`SELECT DISTINCT u.id,u.name FROM organization_membership m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.active AND u.active ORDER BY u.name LIMIT 1000`, [x.org])
    ).rows as { id: string; name: string }[];
    // The people on the club's side for a meeting: profiles (club) or accounts (federation).
    const owners =
      x.kind === "club"
        ? ((
            await x.c.query(
              "SELECT cp.id,cp.full_name AS name FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND cp.status='active' AND pe.user_id IS NOT NULL ORDER BY cp.full_name LIMIT 500",
              [x.org],
            )
          ).rows as { id: string; name: string }[])
        : people;
    return { organization_id: x.org, kind: x.kind, today: now, can: { manage: true }, mine, templates, runs, people, owners };
  });
}

export async function onboardingExecute(db: Pool, p: Principal, raw: z.input<typeof onboardingCommand>, expected: string) {
  const cmd: OnboardingCommand = onboardingCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (x) => {
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      const runOf = async (id: string) => {
        const r = (await x.c.query("SELECT * FROM onboarding_run WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, x.org])).rows[0];
        if (!r) throw new AccessError("NOT_FOUND", 404);
        return r as { id: string; user_id: string; status: string };
      };
      switch (cmd.action) {
        case "saveTemplate": {
          need();
          // Audiences fit the organization: a club's people, a federation's referees and staff.
          const fits = x.kind === "club" ? ["coach", "player", "guardian"] : ["referee", "federation_worker"];
          if (!fits.includes(cmd.audience)) throw new AccessError("INVALID_INPUT", 400);
          if (new Set(cmd.steps.map((s) => s.key)).size !== cmd.steps.length) throw new AccessError("INVALID_INPUT", 400);
          if (cmd.id) {
            const done = await x.c.query("UPDATE onboarding_template SET name=$3,audience=$4,trigger=$5,steps=$6,updated_at=now(),version=version+1 WHERE id=$1 AND organization_id=$2", [
              cmd.id,
              x.org,
              cmd.name,
              cmd.audience,
              cmd.trigger,
              JSON.stringify(cmd.steps),
            ]);
            if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: cmd.id };
          }
          return {
            id: (
              await x.c.query("INSERT INTO onboarding_template(organization_id,name,audience,trigger,steps,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
                x.org,
                cmd.name,
                cmd.audience,
                cmd.trigger,
                JSON.stringify(cmd.steps),
                x.userId,
              ])
            ).rows[0].id as string,
          };
        }
        case "archiveTemplate": {
          need();
          const done = await x.c.query("UPDATE onboarding_template SET archived=$3,updated_at=now() WHERE id=$1 AND organization_id=$2", [cmd.id, x.org, cmd.archived]);
          if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "adopt": {
          need();
          const s = suggested[cmd.key];
          if ((x.kind === "club") !== (cmd.key !== "referee")) throw new AccessError("INVALID_INPUT", 400);
          const id = (
            await x.c.query("INSERT INTO onboarding_template(organization_id,name,audience,trigger,steps,created_by) VALUES($1,$2,$3,'invitation',$4,$5) RETURNING id", [
              x.org,
              s.name[cmd.locale],
              s.audience,
              JSON.stringify(s.steps),
              x.userId,
            ])
          ).rows[0].id as string;
          return { id };
        }
        case "start": {
          need();
          const run = await startRun(x.c, x.org, cmd.templateId, cmd.userId, x.userId);
          if (!run) throw new AccessError("DUPLICATE", 409);
          return { id: run };
        }
        case "cancel": {
          need();
          const r = await runOf(cmd.runId);
          await x.c.query("UPDATE onboarding_run SET status='cancelled' WHERE id=$1", [r.id]);
          await x.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true WHERE organization_id=$1 AND source_key LIKE 'onboarding:'||$2::text||':%' AND status<>'done'", [x.org, r.id]);
          return { id: r.id };
        }
        case "done": {
          // The newcomer, for his own steps that he marks himself.
          const r = await runOf(cmd.runId);
          if (r.user_id !== x.userId) throw new AccessError("FORBIDDEN");
          const st = (await x.c.query("SELECT kind FROM onboarding_step WHERE run_id=$1 AND key=$2", [r.id, cmd.key])).rows[0];
          if (!st) throw new AccessError("NOT_FOUND", 404);
          if (!["message", "read", "sign", "training"].includes(st.kind)) throw new AccessError("AUTOMATIC_STEP", 409);
          if (st.kind === "sign" && (cmd.signedName ?? "").length < 2) throw new AccessError("INVALID_INPUT", 400);
          await x.c.query("UPDATE onboarding_step SET done_at=now(),done_how='self',signed_name=$3 WHERE run_id=$1 AND key=$2 AND done_at IS NULL", [r.id, cmd.key, st.kind === "sign" ? cmd.signedName : null]);
          await finish(x.c, r.id);
          return { id: r.id };
        }
        case "mark": {
          need();
          const r = await runOf(cmd.runId);
          const done = await x.c.query(`UPDATE onboarding_step SET done_at=${cmd.done ? "COALESCE(done_at,now())" : "NULL"},done_how=${cmd.done ? "COALESCE(done_how,'club')" : "NULL"} WHERE run_id=$1 AND key=$2`, [r.id, cmd.key]);
          if (!done.rowCount) throw new AccessError("NOT_FOUND", 404);
          if (cmd.done) await finish(x.c, r.id);
          else await x.c.query("UPDATE onboarding_run SET status='active' WHERE id=$1 AND status='done'", [r.id]);
          return { id: r.id };
        }
        case "remind": {
          need();
          return { sent: await remind(x.c, x.org, true) };
        }
      }
    },
    expected,
  );
}

const words = {
  fr: { title: "Votre parcours d'accueil : {n} étape(s) en retard", message: "Il reste des étapes à faire dans « {name} ». Elles sont sur votre page d'accueil." },
  nl: { title: "Uw onthaaltraject: {n} stap(pen) te laat", message: "Er staan nog stappen open in « {name} ». U vindt ze op uw startpagina." },
  en: { title: "Your welcome journey: {n} step(s) late", message: "Steps are still to do in « {name} ». They are on your home page." },
};
/** 4: a gentle reminder by email for the required steps late, once a week at most per journey. */
async function remind(c: PoolClient, org: string | null, now = false) {
  const runs = (
    await c.query(
      `SELECT r.id,r.organization_id,r.name,r.user_id,u.email,u.name AS user_name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization,
              count(*) FILTER (WHERE s.required AND s.done_at IS NULL AND s.due_on<CURRENT_DATE)::int AS late
         FROM onboarding_run r JOIN onboarding_step s ON s.run_id=r.id JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id JOIN organization o ON o.id=r.organization_id
        WHERE r.status='active' AND ($1::uuid IS NULL OR r.organization_id=$1) AND u.active
        GROUP BY r.id,u.email,u.name,pe.locale,o.name
       HAVING count(*) FILTER (WHERE s.required AND s.done_at IS NULL AND s.due_on<CURRENT_DATE AND (s.reminded_on IS NULL OR s.reminded_on<=CURRENT_DATE-7 OR $2))>0`,
      [org, now],
    )
  ).rows as { id: string; organization_id: string; name: string; user_id: string; email: string; user_name: string; locale: string; organization: string; late: number }[];
  for (const r of runs) {
    const locale: Locale = isLocale(r.locale) ? r.locale : "fr";
    const w = words[locale];
    await publish(c, {
      organizationId: r.organization_id,
      userId: r.user_id,
      email: r.email,
      kind: "automation",
      category: "administrative",
      resourceType: "automation",
      resourceId: `onboarding:${r.id}`,
      eventKey: `onboarding:${r.id}:${today()}`,
      locale,
      variables: { name: r.user_name, title: w.title.replace("{n}", String(r.late)), message: w.message.replace("{name}", r.name), organization: r.organization, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}` },
    });
    await c.query("UPDATE onboarding_step SET reminded_on=CURRENT_DATE WHERE run_id=$1 AND required AND done_at IS NULL AND due_on<CURRENT_DATE", [r.id]);
  }
  return runs.length;
}

/** Once a day: every journey checked, the late ones reminded. */
export async function onboardingTick(db: Pool) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    for (const r of (await c.query("SELECT id FROM onboarding_run WHERE status='active'")).rows) await autoCheck(c, r.id);
    const sent = await remind(c, null);
    await c.query("COMMIT");
    return sent;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
