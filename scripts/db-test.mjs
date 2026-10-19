import assert from "node:assert/strict";
import { Client } from "pg";
import { readdir } from "node:fs/promises";
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  const result = await client.query(
    "SELECT value FROM platform_metadata WHERE key='foundation'",
  );
  assert.equal(result.rows[0]?.value, "lot-00");
  const migrations = await client.query(
    "SELECT count(*)::int AS count FROM schema_migrations",
  );
  assert.equal(
    migrations.rows[0].count,
    (await readdir(new URL("../db/migrations/", import.meta.url))).filter((f) =>
      f.endsWith(".sql"),
    ).length,
  );
  console.log("Database foundation verified");
} finally {
  await client.end();
}
