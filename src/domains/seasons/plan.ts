import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { feesOf } from "../affiliations/service";
import { currentPeriod, dueAmount } from "../affiliations/schema";
import { activePlan, issueMany, tellFamilies } from "../dues/issue";
import { sendNewsletterNow } from "../communication/service";
import { nextYear, performRollover, suggestedName } from "./rollover";
import { newSeasonMail, planTaskTitles } from "./plan-copy";
import { isLocale, type Locale } from "../../lib/locale";

/**
 * 16: « Préparer la saison suivante ». One place that chains, once a year,
 * what the club already knows how to do, in order, without duplicating it:
 * the review of the ending season, the new season and its teams (the
 * existing rollover), the players kept, the dues plans copied and issued at
 * a chosen date (the A3 issue), the affiliations of the new period and the
 * yearly reminders (tasks), the data check (point 8), the « Nouvelle
 * saison » email. Each step is to do, done or skipped, and can be resumed;
 * « Lancer » creates what is immediate and schedules the rest. Launching
 * twice creates nothing twice; a scheduled action can be cancelled until
 * the daily jobs run it. For the club's presidency only.
 */
import { planSteps, type PlanStep, type StepState } from "./plan-steps";
export { planSteps, type PlanStep, type StepState };

const date = z.iso.date();
export const planChoices = z.object({
  season: z.object({ name: z.string().trim().min(2).max(80), startsOn: date, endsOn: date, teams: z.array(z.uuid()).max(50) }).optional(),
  players: z.object({ teams: z.array(z.object({ teamId: z.uuid(), profiles: z.array(z.uuid()).max(200) })).max(50) }).optional(),
  dues: z.object({ copyPlans: z.boolean(), amounts: z.record(z.string(), z.number().int().min(0).max(100000000)), issueOn: date.nullable() }).optional(),
  affiliations: z.object({ fees: z.array(z.uuid()).max(50) }).optional(),
  reminders: z.object({ items: z.array(z.string().regex(/^(grant|partner|insurance):[0-9a-f-]{36}$/)).max(100) }).optional(),
  check: z.object({ launchOn: date.nullable() }).optional(),
  communication: z.object({ subject: z.string().trim().min(2).max(160), text: z.string().trim().min(2).max(5000), sendOn: date.nullable() }).optional(),
});
export type PlanChoices = z.infer<typeof planChoices>;
export const seasonPlanCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), expectedVersion: z.number().int().min(0), step: z.enum(planSteps), state: z.enum(["todo", "done", "skipped"]).optional(), choices: planChoices.optional() }),
  z.object({ action: z.literal("launch"), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal("cancel"), actionId: z.uuid() }),
]);
export type SeasonPlanCommand = z.infer<typeof seasonPlanCommand>;

type Ctx = { c: PoolClient; org: string; userId: string; orgName: string; locale: Locale };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    if (a.role !== "club_president") throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!user.twoFactorEnabled)) throw new AccessError("MFA_REQUIRED");
    const lang = (await c.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale;
    const out = await fn({ c, org: a.organization_id, userId: p.userId, orgName: a.organization_name, locale: isLocale(lang) ? lang : "fr" });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const plusDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Days from one date to another (whole days). Pure. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);
/** The card on the president's home shows from 45 days before the end of the season, until « Lancer ». Pure. */
export const planCardShown = (daysLeft: number, launched: boolean) => !launched && daysLeft <= 45 && daysLeft >= -60;

/** The season that ends next: the one of today, else the latest not archived. */
async function endingSeason(c: PoolClient, org: string) {
  return ((
    await c.query(
      `SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE organization_id=$1 AND NOT archived
        ORDER BY (CURRENT_DATE BETWEEN starts_on AND ends_on) DESC,ends_on DESC LIMIT 1`,
      [org],
    )
  ).rows[0] ?? null) as { id: string; name: string; starts_on: string; ends_on: string } | null;
}
async function planRow(c: PoolClient, org: string, seasonId: string) {
  return ((await c.query("SELECT * FROM season_plan WHERE organization_id=$1 AND from_season_id=$2", [org, seasonId])).rows[0] ?? null) as {
    id: string;
    steps: Partial<Record<PlanStep, StepState>>;
    choices: PlanChoices;
    new_season_id: string | null;
    launched_at: Date | null;
    version: number;
  } | null;
}

/** What each step shows: figures, the teams and players, the plans, fees, reminders. */
async function material(c: PoolClient, org: string, from: { id: string; name: string; starts_on: string; ends_on: string }) {
  const one = async (sql: string, params: unknown[]) => Number((await c.query(sql, params)).rows[0]?.n ?? 0);
  const review = {
    players: await one("SELECT count(DISTINCT m.profile_id)::int AS n FROM team_membership m JOIN team t ON t.id=m.team_id WHERE t.season_id=$1 AND m.role='player' AND NOT m.cancelled", [from.id]),
    teams: await one("SELECT count(*)::int AS n FROM team WHERE season_id=$1 AND NOT archived", [from.id]),
    events: await one("SELECT count(*)::int AS n FROM calendar_event WHERE organization_id=$1 AND status='scheduled' AND starts_at::date BETWEEN $2::date AND LEAST($3::date,CURRENT_DATE)", [org, from.starts_on, from.ends_on]),
    duesOpenCents: await one(
      "SELECT COALESCE(sum(d.net_cents-(SELECT COALESCE(sum(t.amount_cents),0) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in')),0)::bigint AS n FROM dues_receivable d WHERE d.organization_id=$1 AND d.season_id=$2 AND d.status='open'",
      [org, from.id],
    ),
    duesOpenCount: await one(
      "SELECT count(*)::int AS n FROM dues_receivable d WHERE d.organization_id=$1 AND d.season_id=$2 AND d.status='open' AND d.net_cents>(SELECT COALESCE(sum(t.amount_cents),0) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in')",
      [org, from.id],
    ),
    expiredDocuments: await one("SELECT count(*)::int AS n FROM club_document WHERE organization_id=$1 AND (status='expired' OR (status='valid' AND expires_on<CURRENT_DATE))", [org]),
    chairsToService: await one("SELECT count(*)::int AS n FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND next_service_on<=$2::date", [org, plusDays(from.ends_on, 90)]),
  };
  const teams = (
    await c.query(
      `SELECT t.id,t.name,COALESCE(json_agg(json_build_object('id',cp.id,'name',cp.full_name,'role',m.role,'leaving',cp.status<>'active' OR m.ends_on<$2::date) ORDER BY m.role,cp.full_name) FILTER (WHERE cp.id IS NOT NULL),'[]') AS members
         FROM team t LEFT JOIN team_membership m ON m.team_id=t.id AND NOT m.cancelled AND m.closed_at IS NULL LEFT JOIN club_person cp ON cp.id=m.profile_id
        WHERE t.organization_id=$1 AND t.season_id=$3 AND NOT t.archived GROUP BY t.id ORDER BY t.name`,
      [org, from.ends_on, from.id],
    )
  ).rows as { id: string; name: string; members: { id: string; name: string; role: string; leaving: boolean }[] }[];
  const former = await one("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND status IN ('inactive','archived') AND 'player'=ANY(directory_roles)", [org]);
  const plans = (
    await c.query("SELECT id,category,amount_cents,max_installments,first_due::text AS first_due FROM dues_plan WHERE organization_id=$1 AND season_id=$2 AND NOT archived ORDER BY category", [org, from.id])
  ).rows as { id: string; category: string; amount_cents: number; max_installments: number; first_due: string }[];
  const suggestion = { name: suggestedName(from.name), startsOn: nextYear(from.starts_on), endsOn: nextYear(from.ends_on) };
  const players = await one("SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles)", [org]);
  const fees = (await feesOf(c, org)).map((f) => {
    const p = currentPeriod(f, plusDays(suggestion.startsOn, 60));
    return { id: f.id, name: f.name, period: p.period, dueOn: p.dueOn, amountCents: dueAmount(f.basis, f.amount_cents, players) };
  });
  const reminders = [
    ...(
      await c.query(
        "SELECT id,funder,program,deadline_on::text AS deadline_on FROM grant_application WHERE organization_id=$1 AND status IN ('granted','paid','closed') AND (season_id=$2 OR season_id IS NULL) ORDER BY funder LIMIT 40",
        [org, from.id],
      )
    ).rows.map((g) => ({ key: `grant:${g.id}`, kind: "grant" as const, name: [g.funder, g.program].filter(Boolean).join(" · "), dueOn: g.deadline_on ? nextYear(g.deadline_on) : plusDays(suggestion.startsOn, 30) })),
    ...(
      await c.query(
        "SELECT id,name,ends_on::text AS ends_on FROM partner WHERE organization_id=$1 AND status='active' AND ends_on IS NOT NULL AND ends_on<=$2::date ORDER BY ends_on LIMIT 40",
        [org, suggestion.endsOn],
      )
    ).rows.map((x) => ({ key: `partner:${x.id}`, kind: "partner" as const, name: x.name as string, dueOn: plusDays(x.ends_on, -30) })),
    ...(
      await c.query("SELECT id,title,due_on::text AS due_on FROM club_obligation WHERE organization_id=$1 AND template_key='insurance' ORDER BY year DESC LIMIT 1", [org])
    ).rows.map((o) => ({ key: `insurance:${o.id}`, kind: "insurance" as const, name: o.title as string, dueOn: o.due_on ? nextYear(o.due_on) : suggestion.startsOn })),
  ];
  return { review, teams, former, plans, suggestion, fees, reminders };
}

/** The defaults of a fresh plan: everything proposed, nothing decided. */
function defaults(m: Awaited<ReturnType<typeof material>>, orgName: string, locale: Locale = "fr"): Required<PlanChoices> {
  const mail = newSeasonMail[locale];
  const fill = (t: string) => t.replace("{season}", m.suggestion.name).replace("{club}", orgName).replace("{date}", m.suggestion.startsOn);
  return {
    season: { ...m.suggestion, teams: m.teams.map((t) => t.id) },
    players: { teams: m.teams.map((t) => ({ teamId: t.id, profiles: t.members.filter((x) => !x.leaving).map((x) => x.id) })) },
    dues: { copyPlans: m.plans.length > 0, amounts: Object.fromEntries(m.plans.map((p) => [p.id, p.amount_cents])), issueOn: m.plans.length ? m.suggestion.startsOn : null },
    affiliations: { fees: m.fees.map((f) => f.id) },
    reminders: { items: m.reminders.map((r) => r.key) },
    check: { launchOn: m.suggestion.startsOn },
    communication: {
      subject: fill(mail.subject).slice(0, 160),
      text: fill(mail.text),
      sendOn: m.suggestion.startsOn,
    },
  };
}

/** What « Lancer » will create or schedule, with the dates (the summary step). Pure. */
export function planSummary(steps: Partial<Record<PlanStep, StepState>>, ch: Required<PlanChoices>, m: { fees: { id: string; name: string; dueOn: string }[]; reminders: { key: string; name: string; dueOn: string }[]; plans: { id: string; category: string }[] }) {
  const on = (s: PlanStep) => steps[s] !== "skipped";
  const items: { step: PlanStep; what: string; on: string | null; count?: number }[] = [];
  if (on("season")) items.push({ step: "season", what: "season", on: ch.season.startsOn, count: ch.season.teams.length });
  if (on("season") && on("players")) items.push({ step: "players", what: "players", on: ch.season.startsOn, count: ch.players.teams.filter((t) => ch.season.teams.includes(t.teamId)).reduce((n, t) => n + t.profiles.length, 0) });
  if (on("season") && on("dues") && ch.dues.copyPlans) {
    items.push({ step: "dues", what: "plans", on: null, count: m.plans.length });
    if (ch.dues.issueOn) items.push({ step: "dues", what: "issue", on: ch.dues.issueOn });
  }
  if (on("affiliations")) for (const f of m.fees.filter((f) => ch.affiliations.fees.includes(f.id))) items.push({ step: "affiliations", what: f.name, on: f.dueOn });
  if (on("reminders")) for (const r of m.reminders.filter((r) => ch.reminders.items.includes(r.key))) items.push({ step: "reminders", what: r.name, on: r.dueOn });
  if (on("season") && on("check") && ch.check.launchOn) items.push({ step: "check", what: "check", on: ch.check.launchOn });
  if (on("communication") && ch.communication.sendOn) items.push({ step: "communication", what: ch.communication.subject, on: ch.communication.sendOn });
  return items;
}

export async function seasonPlanView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    const from = await endingSeason(x.c, x.org);
    if (!from) return { organizationId: x.org, from: null, plan: null, daysLeft: null, show: false };
    const plan = await planRow(x.c, x.org, from.id);
    const m = await material(x.c, x.org, from);
    const base = defaults(m, x.orgName, x.locale);
    const choices = { ...base, ...(plan?.choices ?? {}) } as Required<PlanChoices>;
    const steps = Object.fromEntries(planSteps.map((s) => [s, plan?.steps[s] ?? "todo"])) as Record<PlanStep, StepState>;
    const actions = plan
      ? ((
          await x.c.query("SELECT id,kind,run_on::text AS run_on,status,result,error,done_at FROM season_plan_action WHERE plan_id=$1 ORDER BY run_on,kind", [plan.id])
        ).rows as { id: string; kind: string; run_on: string; status: string; result: Record<string, unknown>; error: string; done_at: Date | null }[])
      : [];
    const daysLeft = daysBetween(today(), from.ends_on);
    return {
      organizationId: x.org,
      from,
      daysLeft,
      show: planCardShown(daysLeft, !!plan?.launched_at),
      plan: { version: plan?.version ?? 0, launchedAt: plan?.launched_at ?? null, newSeasonId: plan?.new_season_id ?? null, steps, choices, actions },
      material: m,
      summary: planSummary(steps, choices, m),
    };
  });
}

export async function seasonPlanExecute(db: Pool, p: Principal, cmd: SeasonPlanCommand) {
  return scope(db, p, true, async (x) => {
    if (cmd.action === "cancel") {
      const r = await x.c.query(
        "UPDATE season_plan_action SET status='cancelled',cancelled_by=$3 WHERE id=$1 AND organization_id=$2 AND status='scheduled' RETURNING kind,payload",
        [cmd.actionId, x.org, x.userId],
      );
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      // A cancelled email leaves its draft in Communication, never sent.
      await audit(x.c, x.org, x.userId, "seasonPlan.cancelled", cmd.actionId, { kind: r.rows[0].kind });
      return { id: cmd.actionId };
    }
    const from = await endingSeason(x.c, x.org);
    if (!from) throw new AccessError("NO_SEASON", 409);
    let plan = await planRow(x.c, x.org, from.id);
    if ((plan?.version ?? 0) !== cmd.expectedVersion) throw new AccessError("STALE_VERSION", 409);
    if (cmd.action === "save") {
      if (!plan)
        plan = (
          await x.c.query("INSERT INTO season_plan(organization_id,from_season_id,created_by) VALUES($1,$2,$3) RETURNING *", [x.org, from.id, x.userId])
        ).rows[0];
      const steps = { ...plan!.steps, ...(cmd.state ? { [cmd.step]: cmd.state } : {}) };
      const choices = { ...plan!.choices, ...(cmd.choices ?? {}) };
      if (choices.season && choices.season.endsOn < choices.season.startsOn) throw new AccessError("INVALID_DATE", 400);
      if (choices.season && choices.season.startsOn <= from.starts_on) throw new AccessError("INVALID_DATE", 400);
      const r = await x.c.query("UPDATE season_plan SET steps=$2,choices=$3,updated_at=now(),version=version+1 WHERE id=$1 RETURNING version", [plan!.id, JSON.stringify(steps), JSON.stringify(choices)]);
      return { version: r.rows[0].version as number };
    }
    // launch
    if (!plan) throw new AccessError("NOT_FOUND", 404);
    const m = await material(x.c, x.org, from);
    const ch = { ...defaults(m, x.orgName, x.locale), ...plan.choices } as Required<PlanChoices>;
    const on = (s: PlanStep) => plan!.steps[s] !== "skipped";
    const made = { season: false, plans: 0, tasks: 0, actions: 0 };
    let seasonId = plan.new_season_id;
    // 2 and 3: the new season, its teams and its players (the existing rollover), once.
    if (on("season") && !seasonId) {
      const teams = ch.season.teams.map((teamId) => ({
        teamId,
        profiles: on("players") ? (ch.players.teams.find((t) => t.teamId === teamId)?.profiles ?? []) : [],
      }));
      const copyPlans = on("dues") && ch.dues.copyPlans;
      const r = await performRollover(x.c, x.org, x.userId, { fromSeasonId: from.id, name: ch.season.name, startsOn: ch.season.startsOn, endsOn: ch.season.endsOn, teams, copyPlans, archiveOld: false }, true);
      seasonId = r.id;
      made.season = true;
      made.plans = r.plans;
      // 4: the copied plans take the amounts chosen in the assistant.
      if (copyPlans)
        for (const old of m.plans) {
          const amount = ch.dues.amounts[old.id];
          if (amount !== undefined && amount !== old.amount_cents)
            await x.c.query("UPDATE dues_plan SET amount_cents=$3,version=version+1 WHERE organization_id=$1 AND season_id=$2 AND category=$4", [x.org, seasonId, amount, old.category]);
        }
      await x.c.query("UPDATE season_plan SET new_season_id=$2 WHERE id=$1", [plan.id, seasonId]);
    }
    const task = async (key: string, title: string, dueOn: string, category: string) =>
      (
        await x.c.query(
          "INSERT INTO task(organization_id,kind,category,title,due_on,origin,created_by,source_key,source_kind) VALUES($1,'other',$2,$3,$4,'manual',$5,$6,'season_plan') ON CONFLICT DO NOTHING RETURNING id",
          [x.org, category, title.slice(0, 200), dueOn, x.userId, `season-plan:${plan!.id}:${key}`],
        )
      ).rowCount ?? 0;
    // 5: the affiliations of the new period, a task each.
    if (on("affiliations"))
      for (const f of m.fees.filter((f) => ch.affiliations.fees.includes(f.id))) made.tasks += await task(`fee:${f.id}:${f.period}`, planTaskTitles[x.locale].affiliation.replace("{name}", f.name).replace("{period}", f.period), f.dueOn, "affiliation");
    // 6: the yearly reminders (grants, sponsors, insurance), a task each.
    if (on("reminders"))
      for (const r of m.reminders.filter((r) => ch.reminders.items.includes(r.key)))
        made.tasks += await task(
          r.key,
          planTaskTitles[x.locale][r.kind].replace("{name}", r.name),
          r.dueOn,
          r.kind === "grant" ? "grants" : r.kind === "partner" ? "sponsors" : "admin",
        );
    const schedule = async (kind: string, runOn: string, payload: Record<string, unknown>) =>
      (
        await x.c.query("INSERT INTO season_plan_action(plan_id,organization_id,kind,run_on,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT (plan_id,kind) DO NOTHING RETURNING id", [
          plan!.id,
          x.org,
          kind,
          runOn,
          JSON.stringify(payload),
        ])
      ).rowCount ?? 0;
    // 4: the issue of the copied plans at the chosen date.
    if (seasonId && on("dues") && ch.dues.copyPlans && ch.dues.issueOn) made.actions += await schedule("dues_issue", ch.dues.issueOn, { seasonId });
    // 7: the data check of the new season.
    if (seasonId && on("check") && ch.check.launchOn) made.actions += await schedule("season_check", ch.check.launchOn, { seasonId });
    // 8: the « Nouvelle saison » email, a draft in Communication sent at its date.
    if (on("communication") && ch.communication.sendOn && !(await x.c.query("SELECT 1 FROM season_plan_action WHERE plan_id=$1 AND kind='newsletter'", [plan.id])).rowCount) {
      const group = (
        await x.c.query("INSERT INTO recipient_group(organization_id,name,audiences,created_by) VALUES($1,$2,ARRAY['players','guardians','coaches'],$3) RETURNING id", [
          x.org,
          ch.communication.subject.slice(0, 80),
          x.userId,
        ])
      ).rows[0].id;
      const newsletter = (
        await x.c.query("INSERT INTO newsletter(organization_id,subject,blocks,group_ids,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [
          x.org,
          ch.communication.subject,
          JSON.stringify([{ type: "text", text: ch.communication.text }]),
          [group],
          x.userId,
        ])
      ).rows[0].id;
      made.actions += await schedule("newsletter", ch.communication.sendOn, { newsletterId: newsletter });
    }
    await x.c.query("UPDATE season_plan SET launched_at=COALESCE(launched_at,now()),launched_by=COALESCE(launched_by,$2),steps=steps||'{\"summary\":\"done\"}',version=version+1 WHERE id=$1", [plan.id, x.userId]);
    await audit(x.c, x.org, x.userId, "seasonPlan.launched", plan.id, made);
    return made;
  });
}

/** Each day: the scheduled actions whose date has come, each once, in its own transaction. */
export async function seasonPlanTick(db: Pool) {
  const due = (
    await db.query(
      "SELECT a.id,a.kind,a.organization_id,a.payload,s.launched_by,o.name FROM season_plan_action a JOIN season_plan s ON s.id=a.plan_id JOIN organization o ON o.id=a.organization_id WHERE a.status='scheduled' AND a.run_on<=$1::date ORDER BY a.run_on LIMIT 50",
      [today()],
    )
  ).rows as { id: string; kind: string; organization_id: string; payload: Record<string, string>; launched_by: string; name: string }[];
  let n = 0;
  for (const a of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const still = await c.query("SELECT 1 FROM season_plan_action WHERE id=$1 AND status='scheduled' FOR UPDATE", [a.id]);
      if (!still.rowCount) {
        await c.query("ROLLBACK");
        continue;
      }
      await c.query("SAVEPOINT act");
      try {
        let result: Record<string, unknown> = {};
        if (a.kind === "dues_issue") {
          const plans = (await c.query("SELECT id FROM dues_plan WHERE organization_id=$1 AND season_id=$2 AND NOT archived", [a.organization_id, a.payload.seasonId])).rows;
          const ids: string[] = [];
          for (const row of plans) {
            const plan = await activePlan(c, a.organization_id, row.id);
            const r = await issueMany({ c, org: a.organization_id, userId: a.launched_by }, plan, { target: { kind: "season" }, installments: plan.max_installments, firstDue: plan.first_due, exemptions: [], excluded: [] });
            ids.push(...r.ids);
          }
          if (ids.length) await tellFamilies(c, a.organization_id, ids);
          result = { issued: ids.length };
        } else if (a.kind === "season_check") {
          const r = await c.query("INSERT INTO season_check(organization_id,season_id,launched_by) VALUES($1,$2,$3) ON CONFLICT (organization_id,season_id) DO NOTHING RETURNING id", [
            a.organization_id,
            a.payload.seasonId,
            a.launched_by,
          ]);
          result = { launched: r.rowCount ?? 0 };
        } else {
          const n = (await c.query("SELECT * FROM newsletter WHERE id=$1 AND organization_id=$2 AND status='draft'", [a.payload.newsletterId, a.organization_id])).rows[0];
          result = { recipients: n ? await sendNewsletterNow(c, a.organization_id, a.name, a.launched_by, n) : 0 };
        }
        await c.query("UPDATE season_plan_action SET status='done',done_at=now(),result=$2 WHERE id=$1", [a.id, JSON.stringify(result)]);
        await audit(c, a.organization_id, a.launched_by, `seasonPlan.${a.kind}`, a.id, result);
        n++;
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT act");
        const code = e instanceof AccessError ? e.code : "UNAVAILABLE";
        await c.query("UPDATE season_plan_action SET status='failed',done_at=now(),error=$2 WHERE id=$1", [a.id, String(code).slice(0, 200)]);
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }
  return n;
}
