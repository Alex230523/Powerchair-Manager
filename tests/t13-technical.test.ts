import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { decodeCursor, encodeCursor, pageOf } from "../src/lib/cursor";

/** Technical fixes (13): a base per preview, task under its name, pages. */
describe("one database per preview", () => {
  const build = readFileSync("scripts/vercel-build.mjs", "utf8"),
    seed = readFileSync("scripts/demo-seed.ts", "utf8"),
    flow = readFileSync(".github/workflows/preview-db.yml", "utf8"),
    doc = readFileSync("docs/APERCUS-VERCEL.md", "utf8");
  it("refuses a preview database holding anything but the demo", () => {
    expect(build).toContain("SELECT name FROM organization WHERE NOT is_demo ORDER BY name LIMIT 5");
    // The check runs after the seed (which marks the demo) and before the build.
    expect(build.indexOf("NOT is_demo")).toBeGreaterThan(build.indexOf("scripts/demo-seed.ts"));
    expect(build.indexOf("NOT is_demo")).toBeLessThan(build.indexOf('run("npx", ["next", "build"]'));
    expect(seed.match(/await markDemo\(\);/g)).toHaveLength(2);
    expect(readFileSync("db/migrations/0078_demo_flag.sql", "utf8")).toContain("ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false");
  });
  it("deletes the preview's branch when its pull request closes, only with the Neon secrets", () => {
    expect(flow).toContain("types: [closed]");
    expect(flow).toContain("BRANCH: preview/${{ github.event.pull_request.head.ref }}");
    // The branch name never goes into the script itself (injection).
    expect(flow.slice(flow.indexOf("run: |"))).not.toContain("${{");
    expect(flow).toContain('if [ -z "$NEON_API_KEY" ] || [ -z "$NEON_PROJECT_ID" ]');
    expect(doc).toContain("10 branches par projet");
    expect(doc).toContain("Solution de repli");
  });
});

describe("task under its own name", () => {
  it("renames the table in a dedicated migration and nowhere else uses the old name as a table", () => {
    const sql = readFileSync("db/migrations/0077_task_rename.sql", "utf8");
    expect(sql).toContain("ALTER TABLE funding_task RENAME TO task;");
    expect(sql).toContain("CREATE VIEW funding_task AS SELECT * FROM task;");
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
    for (const f of [...files("src"), ...files("scripts")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\b(FROM|JOIN|INTO|UPDATE)\s+(funding_task|org_task)\b/);
    }
  });
});

describe("pages read after a cursor", () => {
  it("encodes the last row's sort values and refuses an altered cursor", () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ id: `id${i}`, at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    const page = pageOf(rows, 100, (r) => [r.at, r.id]);
    expect(page.items).toHaveLength(100);
    expect(decodeCursor(page.next, 2)).toEqual([rows[99].at, "id99"]);
    expect(pageOf(rows.slice(0, 100), 100, (r) => [r.at, r.id]).next).toBeNull();
    expect(decodeCursor(undefined, 2)).toBeNull();
    expect(() => decodeCursor("not-json", 2)).toThrow();
    expect(() => decodeCursor(encodeCursor(["a"]), 2)).toThrow();
    expect(() => decodeCursor(Buffer.from('[{"x":1},"y"]').toString("base64url"), 2)).toThrow();
  });
  it("loads the calendar's period whole and its full list a page at a time", () => {
    const calendar = readFileSync("src/domains/calendar/service.ts", "utf8");
    expect(calendar).not.toContain("LIMIT 1000");
    expect(calendar).not.toContain("OFFSET");
    expect(calendar).toContain('(listed ? ` LIMIT ${PAGE_SIZE + 1}` : "")');
  });
  it("offers « Show more », announced, and exports every page", () => {
    const api = readFileSync("src/components/use-api.tsx", "utf8");
    expect(api).toContain('role="status" aria-live="polite"');
    expect(api).toContain("async function all(from = url)");
    expect(readFileSync("src/components/finance.tsx", "utf8")).toContain("allRows={() => ops.all()}");
    expect(readFileSync("src/components/export-button.tsx", "utf8")).toContain("(allRows ? await allRows() : rows)");
  });
});
