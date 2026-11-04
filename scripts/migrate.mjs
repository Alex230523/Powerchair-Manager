import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
/**
 * Earlier texts of two migrations, applied by a preview before a fix that
 * only names the schema in a column check (same effect on a real database,
 * which has one schema). A database that applied the earlier text is
 * accepted and its checksum brought up to date; any other change is still
 * refused.
 */
const formerChecksums = {
  "0086_trip_transport.sql": ["613f61ec06afbb28a74b16a1336722e1c07af44ff769e1d113021af34f95ee99"],
  "0087_venue_bookings.sql": ["cf65904f2937e232d075bcd09ef9adfbd835c2b15ef9fbdef24cd18a8ae25a99"],
};
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(700001)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (
    await readdir(new URL("../db/migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL("../db/migrations/" + name, import.meta.url),
      "utf8",
    );
    const hash = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [name],
    );
    if (existing.rowCount) {
      const applied = existing.rows[0].checksum;
      if (applied !== hash) {
        if (!(formerChecksums[name] ?? []).includes(applied))
          throw new Error("Migration modified: " + name);
        await client.query(
          "UPDATE schema_migrations SET checksum=$2 WHERE name=$1",
          [name, hash],
        );
        console.log("Checksum brought up to date", name);
      }
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)",
      [name, hash],
    );
    console.log("Applied", name);
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  await client.end();
}
