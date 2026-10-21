/**
 * Build command of the Vercel project (vercel.json), previews only.
 *
 * A preview (one deployment per branch and pull request) uses a database
 * linked to the "Preview" environment alone, sits behind Vercel's Deployment
 * Protection, and creates its demo accounts with the project's own secret
 * password (PFM_DEMO_PASSWORD), never the public one written in the
 * repository. Steps: migrations, demo club (once, under a lock so two
 * previews built at the same time never create it twice), then the build.
 *
 * Any other environment stops here; vercel.json also skips production builds
 * until a real production database and its settings exist
 * (docs/APERCUS-VERCEL.md).
 */
import { spawnSync } from "node:child_process";
import pg from "pg";

const env = process.env.VERCEL_ENV;
if (env !== "preview") {
  console.error(`vercel-build: environment "${env ?? "none"}" is not set up, only previews are.`);
  process.exit(1);
}
for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "PFM_DEMO_PASSWORD"])
  if (!process.env[name]) {
    console.error(`vercel-build: ${name} is missing in the Preview variables of the Vercel project.`);
    process.exit(1);
  }
const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
const childEnv = {
  ...process.env,
  // Migrations and the seed prefer a direct connection when the database offers one.
  DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || (host ? "https://" + host : ""),
};
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: childEnv });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("node", ["scripts/migrate.mjs"]);

const lock = new pg.Client({ connectionString: childEnv.DATABASE_URL, connectionTimeoutMillis: 10000 });
await lock.connect();
try {
  await lock.query("BEGIN");
  await lock.query("SELECT pg_advisory_xact_lock(700002)");
  run("npx", ["tsx", "scripts/demo-seed.ts"]);
  await lock.query("COMMIT");
} finally {
  await lock.end();
}

run("npx", ["next", "build"]);
