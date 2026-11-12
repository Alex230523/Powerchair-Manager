import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * 12/11/2026: a migration once committed is never rewritten. A preview had
 * applied 0142; its text changed afterwards, and scripts/migrate.mjs refused
 * every deployment from then on (« Migration modified »). A change goes in a
 * new migration; `npx tsx scripts/migrations-lock.ts` records the new ones.
 */
const lock = JSON.parse(readFileSync("db/migrations.lock.json", "utf8")) as Record<string, string>;
const sha = (name: string) => createHash("sha256").update(readFileSync("db/migrations/" + name, "utf8")).digest("hex");

describe("migrations", () => {
  it("never rewrites a migration already recorded", () => {
    for (const [name, hash] of Object.entries(lock)) expect(sha(name), `${name} changed: write a new migration instead`).toBe(hash);
  });
  it("records every migration (npx tsx scripts/migrations-lock.ts)", () => {
    const files = readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort();
    expect(files.filter((n) => !lock[n])).toEqual([]);
    expect(Object.keys(lock).filter((n) => !files.includes(n))).toEqual([]);
  });
});
