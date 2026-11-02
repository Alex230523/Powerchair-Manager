/**
 * Audits 23 and 26: `node scripts/audit.mjs ui` (npm run audit:ui) or
 * `access` (npm run audit:access). A throwaway database, the migrations,
 * the demo (public password, local only), then Playwright with
 * playwright.audit.config.ts. The report lands in audit-report/.
 * AUDIT_RECORD=1 notes what is found without failing (first run, review).
 */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const kind = process.argv[2];
if (kind !== "ui" && kind !== "access") {
  console.error("Usage: node scripts/audit.mjs ui|access");
  process.exit(2);
}
const base = new URL(process.env.DATABASE_URL);
const name = "pfm_audit_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: base.toString() });
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args[0]} failed: ${code}`))));
  });
}
let failed = false;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  base.pathname = "/" + name;
  const env = {
    ...process.env,
    DATABASE_URL: base.toString(),
    PFM_E2E_DATABASE_URL: base.toString(),
    BETTER_AUTH_URL: "http://127.0.0.1:3100",
    PFM_LOCAL_MAIL: "true",
    MAIL_TRANSPORT: "local",
    PFM_MAIL_DIR: ".local/mail-e2e",
    // The demo of the audits uses the public password, never a project's own.
    PFM_DEMO_PASSWORD: "",
  };
  await run("node", ["scripts/migrate.mjs"], env);
  await run("node", ["--import", "tsx", "scripts/demo-seed.ts"], env);
  try {
    await run("node", ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.audit.config.ts", kind === "ui" ? "ui.spec" : "access.spec", ...process.argv.slice(3)], env);
  } catch (e) {
    failed = true;
    console.error(e.message);
  }
  await run("node", ["--import", "tsx", "scripts/audit-report.ts", kind], env);
} finally {
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
process.exit(failed ? 1 : 0);
