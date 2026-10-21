import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
const base = new URL(process.env.DATABASE_URL);
const name = "pfm_e2e_" + randomUUID().replaceAll("-", "");
const admin = new Pool({ connectionString: base.toString() });
function run(args, env) {
  return new Promise((resolve, reject) => {
    const process = spawn("node", args, { env, stdio: "inherit" });
    process.on("error", reject);
    process.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Test process failed: " + code)),
    );
  });
}
let worker;
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
  };
  await run(["scripts/migrate.mjs"], env);
  worker = spawn("node", ["--import", "tsx", "scripts/mail-worker.ts"], {
    env,
    stdio: "inherit",
  });
  await run(
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    env,
  );
} finally {
  if (worker && worker.exitCode === null && worker.signalCode === null) {
    await new Promise((resolve) => {
      worker.once("exit", resolve);
      worker.kill("SIGTERM");
    });
  }
  // This script only drops the random database it just created.
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
