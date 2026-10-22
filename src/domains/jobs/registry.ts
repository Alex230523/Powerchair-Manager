import type { Pool } from "pg";
import { processOne, recoverExpired } from "../notifications/worker";
import { createTransport } from "../notifications/transport";
import { digestTick } from "../digest/service";
import { sweepDocuments } from "../documents/service";
import { eventMailTick } from "../communication/service";
import { fundingTaskTick } from "../funding/service";
import { affiliationTick } from "../affiliations/service";
import { equipmentLoanTick } from "../equipment/loans";
import { taskSourcesTick } from "../tasks/sources";
import { runAutomations } from "../automations/engine";
import { ruleKeys } from "../automations/catalog";
import { mailBudget } from "./mail-budget";
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
  /** The mail queue (and the weekly digests), within the day's sending budget. */
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
      return { recovered, digests, processed: sent, deferred: budget.allowed === 0 ? budget.pending : 0, sentToday: budget.sentToday + sent };
    },
  },
  /** Documents that expire. */
  documents: {
    every: 60,
    async run(db) {
      return { expired: await sweepDocuments(db) };
    },
  },
  /** Attendance (the « convocation sans réponse » automation, B7) and the event mails prepared for a given time. */
  attendance: {
    every: 5,
    async run(db) {
      const auto = await runAutomations(db, undefined, ["callNoAnswer"]);
      return { attendance: auto.sent, attendanceErrors: auto.errors, eventMails: await eventMailTick(db) };
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
