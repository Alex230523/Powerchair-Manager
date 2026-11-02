import { describe, expect, it } from "vitest";
import {
  allowedLevels,
  builtInProfiles,
  levelOf,
  levelsOf,
  moduleOfPath,
  normalizeModules,
  rightsModules,
  withLevel,
} from "../src/domains/access/rights";
import { delegable } from "../src/domains/access/policy";
import { normalize } from "../src/domains/search/schema";

const mod = (key: string) => rightsModules.find((m) => m.key === key)!;

describe("rights by module", () => {
  it("reads a level from the stored grants", () => {
    expect(levelOf([], mod("money"))).toBe("none");
    expect(levelOf(["dues.read"], mod("money"))).toBe("read");
    expect(levelOf(["dues.read", "dues.manage"], mod("money"))).toBe("edit");
    // Older mandates hold only dues.manage: still "change".
    expect(levelOf(["dues.manage"], mod("money"))).toBe("edit");
    expect(levelOf(["teams.manage"], mod("teams"))).toBe("edit");
  });

  it("offers a read level only where one exists", () => {
    expect(levelsOf(mod("people"))).toEqual(["none", "read", "edit"]);
    expect(levelsOf(mod("attendance"))).toEqual(["none", "edit"]);
    expect(levelsOf(mod("admin"))).toEqual([]);
  });

  it("sets a level without touching other modules, and drops extras at none", () => {
    const start = ["people.read", "people.sensitive", "calendar.read"];
    expect(withLevel(start, mod("people"), "edit").sort()).toEqual(
      ["calendar.read", "people.manage", "people.read", "people.sensitive"].sort(),
    );
    expect(withLevel(start, mod("people"), "none")).toEqual(["calendar.read"]);
    expect(withLevel(["dues.manage"], mod("money"), "read")).toEqual(["dues.read"]);
  });

  it("never offers more than the delegator holds", () => {
    expect(allowedLevels(["dues.read"], mod("money"))).toEqual(["none", "read"]);
    expect(allowedLevels([], mod("money"))).toEqual(["none"]);
  });

  it("places every delegable permission in exactly one module", () => {
    const listed = rightsModules.flatMap((m) => [
      ...new Set([...(m.read ?? []), ...(m.edit ?? []), ...(m.extras ?? [])]),
    ]);
    expect(new Set(listed).size).toBe(listed.length);
    // B8: tax.identity is given from the tax receipts page, shown only to an approved club.
    // 32: the federation's competences are given by its delegated roles, not in a club's module grid.
    expect([...listed].sort()).toEqual(delegable.filter((d) => d !== "tax.identity" && !d.startsWith("federation.")).sort());
  });

  it("builds ready-made profiles from real permissions only", () => {
    for (const grants of Object.values(builtInProfiles))
      for (const g of grants) expect(delegable).toContain(g);
    expect(levelOf(builtInProfiles.auditor, mod("money"))).toBe("read");
    expect(levelOf(builtInProfiles.treasurer, mod("money"))).toBe("edit");
  });
});

describe("optional modules", () => {
  it("knows which module owns a route", () => {
    expect(moduleOfPath("/funding")).toBe("finance");
    expect(moduleOfPath("/funding/report")).toBe("finance");
    expect(moduleOfPath("/api/dues")).toBe("dues");
    expect(moduleOfPath("/players")).toBeNull();
    expect(moduleOfPath("/fundingx")).toBeNull();
  });
  it("keeps known modules in a stable order", () => {
    expect(normalizeModules(["statistics", "nope", "finance"])).toEqual([
      "finance",
      "statistics",
    ]);
  });
});

describe("search", () => {
  it("ignores case and accents", () => {
    expect(normalize("Léa ÇÉLINE")).toBe("lea celine");
  });
});
