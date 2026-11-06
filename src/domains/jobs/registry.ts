import type { Pool } from "pg";
import { processOne, recoverExpired } from "../notifications/worker";
import { createTransport } from "../notifications/transport";
import { createPushSender, processPush, recoverPush } from "../notifications/push";
import { digestTick } from "../digest/service";
import { billingTick } from "../billing/service";
import { borrowTick } from "../console/service";
import { alertTick, monthlyReportTick, snapshotMetrics } from "../console/metrics";
import { privacyTick } from "../support/service";
import { sweepDocuments } from "../documents/service";
import { taxPurge } from "../tax/service";
import { retiredIncidentPurge } from "./retired";
import { openEventTick } from "../open-events/service";
import { webhookTick } from "../integrations/webhooks";
import { eventMailTick } from "../communication/service";
import { fundingTaskTick } from "../funding/service";
import { affiliationTick } from "../affiliations/service";
import { equipmentLoanTick } from "../equipment/loans";
import { taskSourcesTick } from "../tasks/sources";
import { runAutomations } from "../automations/engine";
import { majorityTick } from "../people/service";
import { seasonCheckTick } from "../season-check/service";
import { authorizationTick } from "../authorizations/service";
import { seasonPlanTick } from "../seasons/plan";
import { bookingsTick } from "../venues/bookings";
import { associationTick } from "../association/service";
import { onboardingTick } from "../onboarding/service";
import { offboardingTick } from "../offboarding/service";
import { circularsTick } from "../circulars/service";
import { refereeingTick } from "../referees/service";
import { feedbackTick } from "../feedback/service";
import { allocationsTick } from "../finance/allocations";
import { forecastTick } from "../finance/forecast";
import { attestationTick } from "../dues/attestation-send";
import { seasonSlotInviteTick } from "../calendar/season-schedule";
import { closureTick, exportTick, retentionTick } from "../legal/service";
import { ruleKeys } from "../automations/catalog";
import { mailBudget } from "./mail-budget";
import { lineupRevealTick } from "../competitions/lineup-reveal";
import { watchdog } from "./watchdog";

/**
 * B2: the background tasks, each an idempotent runOnce() the cron route
 * (or the CLI) calls. `every` is the expected interval in minutes: the
 * health page and the watchdog call a task late after two missed cycles.
 * The long-running workers of scripts/ stay for the local machine.
 */
export type Env = Record<string, string | undefined>;
export type Job = { every: number; run: (db: Pool, env: Env) => Promise<Record<string, number>> };

export const jobs = {
  /** The mail queue (and the weekly digests), within the day's sending budget, then the phone notifications (B4). */
  mail: {
    every: 5,
    async run(db, env) {
      const transport = createTransport(env, env.MAIL_ALLOW_EXTERNAL === "true");
      const recovered = (await recoverExpired(db)) ?? 0;
      const digests = await digestTick(db);
      const budget = await mailBudget(db, env);
      let sent = 0;
      for (let i = 0; i < budget.allowed; i++) {
        const r = await processOne(db, transport);
        if (!r) break;
        sent++;
      }
      // B4: the phone notifications, grouped per person and club (no budget: the push services are free).
      const sender = createPushSender(env);
      let pushed = 0;
      if (sender) {
        await recoverPush(db);
        for (let i = 0; i < 500; i++) {
          if (!(await processPush(db, sender))) break;
          pushed++;
        }
      }
      return { recovered, digests, processed: sent, deferred: budget.allowed === 0 ? budget.pending : 0, sentToday: budget.sentToday + sent, pushed };
    },
  },
  /** Documents that expire, (B8) donors' data ten years after their last gift, (B5) incidents (module removed) past their retention. */
  documents: {
    every: 60,
    async run(db) {
      return { expired: await sweepDocuments(db), taxPurged: await taxPurge(db), incidentsPurged: await retiredIncidentPurge(db) };
    },
  },
  /** Attendance (the « convocation sans réponse » automation, B7) and the event mails prepared for a given time. */
  attendance: {
    every: 5,
    async run(db) {
      const auto = await runAutomations(db, undefined, ["callNoAnswer"]);
      // B9: open events (offers that expire, reminders seven days and one day before, the opinion survey).
      // B6: the webhooks waiting to leave (signed, retried).
      // Point 13: the line-ups revealed (by hand or at their time) are told to the players and parents.
      return { attendance: auto.sent, attendanceErrors: auto.errors, eventMails: await eventMailTick(db), openEvents: await openEventTick(db), webhooks: await webhookTick(db), lineups: await lineupRevealTick(db) };
    },
  },
  /** Console, series A (06/11/2026): the platform's figures snapshot, the operators' daily alert, the monthly report. */
  platform: {
    every: 60,
    async run(db, env) {
      // Series C: the presidencies reminded of a GDPR request a week before its deadline and once overdue.
      return { metrics: await snapshotMetrics(db), alerts: await alertTick(db, env), reports: await monthlyReportTick(db), privacy: await privacyTick(db) };
    },
  },
  /** The daily reminders: tasks (A1), the automations' catalogue (B7), affiliations, chair loans. */
  reminders: {
    every: 60,
    async run(db) {
      // The automatic tasks first, so their reminders leave the same run.
      const tasks = await taskSourcesTick(db);
      const auto = await runAutomations(db, undefined, ruleKeys.filter((r) => r !== "callNoAnswer"));
      return {
        tasks,
        taskReminders: await fundingTaskTick(db, { tasks: true }),
        automations: auto.sent,
        automationErrors: auto.errors,
        affiliations: await affiliationTick(db),
        loans: await equipmentLoanTick(db),
        // 8: a player who turns 18 is invited to manage his own account.
        majority: await majorityTick(db),
        // 8: a season that starts opens its check.
        seasonChecks: await seasonCheckTick(db),
        // 28: the parental authorizations still unsigned after three days are recalled.
        authorizationReminders: await authorizationTick(db),
        // 16: what the season assistant scheduled (dues issue, data check, « Nouvelle saison » email).
        seasonPlan: await seasonPlanTick(db),
        // H9: the planned sessions get their invitations 14 days before.
        seasonInvites: await seasonSlotInviteTick(db),
        // 18: the halls' bookings follow the calendar (ask, follow up, pay, tell the hall).
        bookings: await bookingsTick(db),
        // 17: the assembly's date to set, its invitation at J-notice and the reminder at J-5.
        association: await associationTick(db),
        // Parcours d'accueil: steps checked by themselves, a gentle reminder for the late ones.
        onboarding: await onboardingTick(db),
        // Fin de coach: departures checked; at the end date the rights end, the president told of what is left.
        offboarding: await offboardingTick(db),
        // 33: the circulars whose date came leave.
        circulars: await circularsTick(db),
        // 39: proposals left unanswered, the eve's reminder, reports validated after 48 hours.
        refereeing: await refereeingTick(db),
        // 19: the remarks not yet sent leave; the issues' states are read.
        feedback: await feedbackTick(db).then((r) => r.sent + r.checked),
        // 9: reserved funds whose use-by date comes (60 and 30 days); attestations sent once the season is paid.
        allocations: await allocationsTick(db),
        attestations: await attestationTick(db),
        // H4: the certain forecast under the threshold within three months.
        forecast: await forecastTick(db),
        // 21: the full exports asked for, the closures whose 30 days are over, the retention purge.
        clubExports: await exportTick(db),
        clubClosures: await closureTick(db),
        retention: await retentionTick(db),
        // Console, step 4: the platform's invoices late get their reminders by steps.
        billing: await billingTick(db),
        // Console, step 3b: the support accesses past their end are closed.
        borrows: await borrowTick(db),
      };
    },
  },
  /** Tells the operator when a task has not run for two cycles. */
  watchdog: {
    every: 60,
    async run(db, env) {
      return watchdog(db, env);
    },
  },
} satisfies Record<string, Job>;
export type JobName = keyof typeof jobs;
export const jobNames = Object.keys(jobs) as JobName[];
export const isJob = (name: string): name is JobName => Object.hasOwn(jobs, name);
