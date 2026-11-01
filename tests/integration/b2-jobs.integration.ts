import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir as list } from "node:fs/promises";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publish } from "../../src/domains/notifications/queue";
import { runJob } from "../../src/domains/jobs/runner";
import { jobStates, overdueMails } from "../../src/domains/jobs/health";
import { watchdog } from "../../src/domains/jobs/watchdog";

/**
 * B2: the background tasks run once from a cron route. One run at a time
 * (advisory lock), each run written to job_run; the mail queue keeps to
 * the day's budget and the rest waits; the health of each task; the
 * watchdog writes to the operator once a day.
 */
const schema = "b2jobs_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public`, max: 6 });
let club: string, user: string, mailDir: string, alertDir: string;
const env = () => ({ ...process.env, MAIL_TRANSPORT: "local", PFM_MAIL_DIR: mailDir });

async function queue(n: number) {
  for (let i = 0; i < n; i++)
    await publish(db, {
      organizationId: club,
      userId: user,
      email: "membre@example.test",
      kind: "funding_task",
      category: "administrative",
      eventKey: `b2:${randomUUID()}`,
      resourceType: "funding",
      resourceId: randomUUID(),
      locale: "fr",
      variables: { name: "Membre", organization: "Club", url: `${process.env.BETTER_AUTH_URL}/fr/tasks`, title: "Tâche " + i, due: "" },
    });
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club','club') RETURNING id")).rows[0].id;
  user = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Membre\',\'membre@example.test\',true)', [user]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [user]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [club, user]);
  mailDir = await mkdtemp(join(tmpdir(), "pfm-b2-mail-"));
  alertDir = await mkdtemp(join(tmpdir(), "pfm-b2-alert-"));
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps to the day's mail budget and lets the rest wait for tomorrow", async () => {
  await queue(3);
  // Two mails already sent today by the provider: with a limit of 2, nothing leaves.
  const sent = (await db.query("SELECT id FROM mail_job ORDER BY created_at LIMIT 2")).rows.map((r) => r.id);
  await queue(2);
  await db.query("UPDATE mail_job SET state='sent',completed_at=now() WHERE id=ANY($1::uuid[])", [sent]);
  const held = await runJob(db, "mail", { ...env(), MAIL_DAILY_LIMIT: "2" });
  expect(held).toMatchObject({ status: "done", summary: { processed: 0, deferred: 3 } });
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE state='pending'")).rows[0].n).toBe(3);
  // A higher limit: two more are handled, one waits.
  const next = await runJob(db, "mail", { ...env(), MAIL_DAILY_LIMIT: "4" });
  expect(next).toMatchObject({ status: "done", summary: { processed: 2 } });
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE state='pending'")).rows[0].n).toBe(1);
});

it("runs a task once at a time and writes every run", async () => {
  const [a, b] = await Promise.all([runJob(db, "documents", env()), runJob(db, "documents", env())]);
  expect([a.status, b.status].sort()).toEqual(["done", "locked"]);
  const runs = (await db.query("SELECT job,ok,summary FROM job_run WHERE job='documents'")).rows;
  expect(runs).toEqual([{ job: "documents", ok: true, summary: { expired: 0, taxPurged: 0, incidentsPurged: 0 } }]);
  // A task that fails is written with its error code, without stopping the others.
  const failed = await runJob(db, "mail", { ...env(), MAIL_TRANSPORT: "smtp", SMTP_HOST: "" });
  expect(failed).toMatchObject({ status: "failed", code: "SMTP_HOST_REQUIRED" });
  expect((await db.query("SELECT ok,error_code FROM job_run WHERE job='mail' ORDER BY started_at DESC LIMIT 1")).rows[0]).toEqual({ ok: false, error_code: "SMTP_HOST_REQUIRED" });
});

it("tells which task is late, and the operator once a day", async () => {
  // Locally nothing is expected; in production a task that never ran is late.
  expect((await jobStates(db, { PFM_JOBS_EXPECTED: "false" })).find((j) => j.job === "reminders")!.late).toBe(false);
  expect((await jobStates(db, { PFM_JOBS_EXPECTED: "true" })).find((j) => j.job === "reminders")!.late).toBe(true);
  // The documents ran a moment ago: on time.
  expect((await jobStates(db, { PFM_JOBS_EXPECTED: "true" })).find((j) => j.job === "documents")!.late).toBe(false);
  // The mail still waiting more than 30 minutes counts as overdue.
  await db.query("UPDATE mail_job SET available_at=now()-interval '1 hour' WHERE state='pending'");
  expect(await overdueMails(db)).toBe(1);
  const alertEnv = { MAIL_TRANSPORT: "local", PFM_MAIL_DIR: alertDir, PFM_JOBS_EXPECTED: "true", OPS_ALERT_EMAIL: "ops@example.test" };
  expect(await watchdog(db, alertEnv)).toMatchObject({ overdue: 1, alerted: 1 });
  expect(await watchdog(db, alertEnv)).toMatchObject({ alerted: 0 });
  const files = (await list(alertDir)).filter((f) => f.endsWith(".json"));
  expect(files).toHaveLength(1);
  const mail = JSON.parse(await readFile(join(alertDir, files[0]), "utf8"));
  expect(mail.email).toBe("ops@example.test");
  expect(mail.text).toContain("reminders");
  expect(mail.text).not.toContain("membre@example.test");
});
