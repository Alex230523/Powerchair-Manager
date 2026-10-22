import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wave 16 (C6): one invites, nobody is « convoqué ». No visible text (copy
 * files, pages, e-mails) may say « convoqu », « opgeroep », « summon » or
 * « call-up » again; the tables keep their names (attendance_invitation).
 */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
}
describe("vocabulary", () => {
  it("says invite, never convoke, in the three languages", () => {
    const sources = [...files("src/components"), ...files("src/app"), "src/domains/notifications/templates.ts", "src/lib/english.ts"];
    const found = sources.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => [line, i] as const)
        .filter(([line]) => /convoqu|opgeroep|summon|call-up/i.test(line))
        .map(([, i]) => `${f}:${i + 1}`),
    );
    expect(found).toEqual([]);
  });
});
