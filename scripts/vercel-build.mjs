/**
 * Build command of the Vercel project (vercel.json), previews only.
 *
 * A preview (one deployment per branch and pull request) uses a database
 * linked to the "Preview" environment alone, sits behind Vercel's Deployment
 * Protection, and creates its demo accounts with the project's own secret
 * password (PFM_DEMO_PASSWORD), never the public one written in the
 * repository. Steps: migrations, demo club (once, under a lock so two
 * previews built at the same time never create it twice), a check that the
 * database holds the demo only, then the build. Each preview has its own
 * database branch when the Neon integration is set up that way
 * (docs/APERCUS-VERCEL.md).
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
// Security (06/11/2026), cloud: a database outside this machine is only ever
// reached encrypted (the same rule as src/lib/env.ts, which the site applies
// at run time). Stopping here gives a clear message instead of a broken site.
for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
  const value = process.env[name];
  if (!value) continue;
  const url = new URL(value),
    mode = url.searchParams.get("sslmode")?.toLowerCase(),
    local = ["", "localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.hostname.includes(".");
  if (!local && !["require", "verify-ca", "verify-full"].includes(mode ?? "")) {
    console.error(`vercel-build: ${name} must end with sslmode=require (or verify-full): the database is reached over the internet.`);
    process.exit(1);
  }
}
const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
const childEnv = {
  ...process.env,
  // Migrations and the seed prefer a direct connection when the database offers one.
  DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || (host ? "https://" + host : ""),
};
function run(command, args, env = childEnv) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
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

// 13.1: a preview only ever holds the demo. A database with any other
// organisation (a real club typed in « to test », or a database meant for
// production linked by mistake) stops the deployment here.
const check = new pg.Client({ connectionString: childEnv.DATABASE_URL, connectionTimeoutMillis: 10000 });
await check.connect();
try {
  const others = (await check.query("SELECT name FROM organization WHERE NOT is_demo ORDER BY name LIMIT 5")).rows.map((r) => r.name);
  if (others.length) {
    console.error(
      `vercel-build: this preview database holds organisations that are not part of the demo (${others.join(", ")}). ` +
        "A preview never runs on real data: give it its own database (docs/APERCUS-VERCEL.md) or remove these organisations.",
    );
    process.exit(1);
  }
} finally {
  await check.end();
}

// The build gets the project's own variables: next.config.ts inlines the
// branch address itself when BETTER_AUTH_URL is not set (src/lib/preview.ts).
run("npx", ["next", "build"], process.env);
