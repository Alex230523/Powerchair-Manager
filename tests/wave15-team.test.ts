import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { duesTotals } from "../src/domains/dues/schema";
import { receivableTeamsSql } from "../src/domains/dues/teams";

/** Wave 15 (1.C): the team filter lives in the shared dues totals; no page keeps the whole-club note. */
const line = (net: number, paid: number, team_ids: string[], due = "2026-09-30") => ({
  status: "open",
  net_cents: net,
  paid_cents: paid,
  team_ids,
  installments: [{ ordinal: 1, due_on: due, amount_cents: net }],
});

describe("dues totals by team", () => {
  const rows = [line(25000, 0, ["a"]), line(25000, 25000, ["b"]), line(8000, 0, ["b"]), line(10000, 0, [])];
  it("counts every line when no team is chosen", () => {
    expect(duesTotals(rows, "2026-10-21")).toMatchObject({ due: 68000, collected: 25000, playersLate: 3 });
  });
  it("counts only the lines of the chosen team, never a line without a team", () => {
    expect(duesTotals(rows, "2026-10-21", "a")).toEqual({ due: 25000, collected: 0, late: 25000, playersLate: 1, rate: 0 });
    expect(duesTotals(rows, "2026-10-21", "b")).toEqual({ due: 33000, collected: 25000, late: 8000, playersLate: 1, rate: 76 });
    expect(duesTotals(rows, "2026-10-21", "c")).toEqual({ due: 0, collected: 0, late: 0, playersLate: 0, rate: null });
  });
  it("takes the rate's team first, then the player's current teams", () => {
    const sql = receivableTeamsSql("d", "p");
    expect(sql.indexOf("p.team_id IS NOT NULL")).toBeLessThan(sql.indexOf("team_membership"));
    expect(sql).toContain("m.closed_at IS NULL");
    expect(sql).toContain("NOT m.cancelled");
  });
});

describe("whole-club note", () => {
  it("is gone from the dues, trips and fundraising pages", () => {
    for (const f of ["dues", "trips", "fundraising", "use-scope"]) expect(readFileSync(`src/components/${f}.tsx`, "utf8")).not.toContain("WholeClubNote");
    expect(readFileSync("src/components/shell-copy.ts", "utf8")).not.toContain("Vue club entière");
  });
});
