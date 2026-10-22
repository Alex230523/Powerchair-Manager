import type { Pool } from "pg";
import { processOne, recoverExpired } from "../notifications/worker";
import { createTransport } from "../notifications/transport";
import { digestTick } from "../digest/service";
import { sweepDocuments } from "../documents/service";
import { attendanceTick } from "../attendance/service";
import { eventMailTick } from "../communication/service";
import { duesReminderTick } from "../reminders/service";
import { fundingTaskTick } from "../funding/service";
import { affiliationTick } from "../affiliations/service";
import { licenceReminderTick } from "../licences/service";
import { equipmentLoanTick } from "../equipment/loans";
import { taskSourcesTick } from "../tasks/sources";
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
  /** Attendance actions and the event mails prepared for a given time. */
  attendance: {
    every: 5,
    async run(db) {
      return { attendance: await attendanceTick(db), eventMails: await eventMailTick(db) };
    },
  },
  /** The daily reminders: dues, tasks (A1), sponsors and grants, affiliations, licences, chair loans. */
  reminders: {
    every: 60,
    async run(db) {
      // The automatic tasks first, so their reminders leave the same run.
      const tasks = await taskSourcesTick(db);
      return {
        tasks,
        dues: await duesReminderTick(db),
        funding: await fundingTaskTick(db),
        affiliations: await affiliationTick(db),
        licences: await licenceReminderTick(db),
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
