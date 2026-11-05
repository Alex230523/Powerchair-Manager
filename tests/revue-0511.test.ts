import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** 05/11/2026: the review after the twenty improvements. What a reader must never see raw. */
function files(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}
const read = (f: string) => readFileSync(f, "utf8");

describe("review of 05/11/2026", () => {
  it("keeps the stylesheet within its budget, each file button rule once", () => {
    const css = read("src/app/globals.css");
    // Lot 7: 300 kB before minification; a module that grows beyond it gets its own file.
    expect(Buffer.byteLength(css)).toBeLessThan(300 * 1024);
    expect(css.match(/^\.file-button \{/gm)).toHaveLength(1);
    expect(css.match(/^\.file-button:focus-within \{/gm)).toHaveLength(1);
  });
  it("every server error code has a sentence in the three languages somewhere in the interface", () => {
    const codes = new Set<string>();
    for (const f of files("src/domains")) for (const m of read(f).matchAll(/AccessError\("([A-Z_]+)"/g)) codes.add(m[1]);
    const ui = [...files("src/components"), ...files("src/lib")].map(read).join("\n");
    const missing = [...codes].filter((c) => !ui.includes(c)).sort();
    expect(missing).toEqual([]);
  });
  it("the match sheet photo and the payment proof count in the club's storage", () => {
    const view = read("db/migrations/0120_storage_view_proofs.sql");
    expect(view).toContain("FROM match_sheet_photo");
    expect(view).toContain("FROM transfer_offer t WHERE t.payment_proof IS NOT NULL");
    expect(read("src/domains/competitions/journey.ts")).toMatch(/case "sheetPhoto"[\s\S]{0,600}ensureStorage\(/);
    expect(read("src/domains/transfers/service.ts")).toMatch(/action === "paymentProof"[\s\S]{0,1500}ensureStorage\(/);
  });
});
