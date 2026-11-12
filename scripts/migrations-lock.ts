import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * 12/11/2026: a migration once committed is never rewritten. The databases
 * that applied it (the previews, later production) keep its checksum, and
 * scripts/migrate.mjs refuses a changed text: the deployment stops. This
 * adds the checksums of new migrations to db/migrations.lock.json; it never
 * changes one already there (tests/migrations-frozen.test.ts checks them).
 */
const file = "db/migrations.lock.json";
const lock: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
let added = 0;
for (const name of readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort()) {
  if (lock[name]) continue;
  lock[name] = createHash("sha256").update(readFileSync("db/migrations/" + name, "utf8")).digest("hex");
  added++;
}
writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");
console.log(`${added} migration(s) added to ${file}`);
