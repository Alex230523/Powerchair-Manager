import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBoard, presidentSquares } from "../src/domains/dashboard/summary";
import { obligationTemplates, obligationState, clubStatusSummary, nextYearDate } from "../src/domains/club/obligation-templates";
import { boardCopy } from "../src/components/home-board-copy";
import { obligationsCopy } from "../src/components/club-obligations-copy";
import { homeCopy } from "../src/components/home-copy";

/** Wave 16 (A): the president's home. */
const all = { documentsExpired: 0, documentsMissing: 0, documentsExpiring: 2, registersToClose: 0, registrationsReview: 3, duesLate: 0, sponsorTasks: 1, grantTasks: 0, equipmentService: 2, myApplications: 0 };
describe("« À faire » in fixed squares", () => {
  it("keeps the president's six squares in their order, green at zero", () => {
    const board = buildBoard(all, { president: true, status: { done: 4, total: 7, late: 0, next: [] } });
    expect(board.squares.map((s) => s.key)).toEqual(presidentSquares);
    expect(board.squares.map((s) => s.count)).toEqual([0, 0, 3, 0, 1, 3]);
    // Expiring documents are said, not counted as a problem.
    expect(board.squares[0]).toMatchObject({ key: "documents", count: 0, expiring: 2 });
    // The other non-zero figures go on the « Aussi » line.
    expect(board.also.map((s) => [s.key, s.count])).toEqual([["equipmentService", 2]]);
  });
  it("merges expired and missing documents, sponsors and grants", () => {
    const board = buildBoard({ ...all, documentsExpired: 2, documentsMissing: 3, grantTasks: 4 }, { president: true });
    expect(board.squares.find((s) => s.key === "documents")?.count).toBe(5);
    expect(board.squares.find((s) => s.key === "moneyTasks")?.count).toBe(5);
    expect(board.also.some((s) => ["documentsExpired", "documentsMissing", "sponsorTasks", "grantTasks", "documentsExpiring"].includes(s.key))).toBe(false);
  });
  it("replaces a square whose module is off by the next available one", () => {
    const { duesLate: _off, ...noDues } = all;
    void _off;
    const board = buildBoard(noDues, { president: true, status: null });
    expect(board.squares.map((s) => s.key)).toEqual(["documents", "registersToClose", "registrationsReview", "moneyTasks", "equipmentService"]);
  });
  it("gives coaches, players and parents their own squares, green when up to date", () => {
    const board = buildBoard({ myAttendance: 0, myDocuments: 1, myApplications: 0 }, { president: false });
    expect(board.squares.map((s) => [s.key, s.count])).toEqual([
      ["myAttendance", 0],
      ["myDocuments", 1],
      ["myApplications", 0],
    ]);
  });
});
describe("club status", () => {
  it("proposes obligations from the legal form, two of them ticked by the annual accounts", () => {
    expect(obligationTemplates.asbl.map((t) => t.key)).toEqual(["federation", "sportea", "insurance", "assembly", "accountsApproved", "accountsFiled", "ubo", "board", "members"]);
    expect(obligationTemplates.asbl.filter((t) => t.auto !== "none").map((t) => t.auto)).toEqual(["accounts_approved", "accounts_filed"]);
    // No registry nor UBO register for an unincorporated association.
    expect(obligationTemplates.de_facto.map((t) => t.key)).not.toContain("ubo");
    expect(obligationTemplates.de_facto.map((t) => t.key)).not.toContain("accountsFiled");
  });
  it("says done, late or to do, and the next two lines", () => {
    expect(obligationState({ done_on: "2026-03-01", due_on: "2026-02-01" }, "2026-10-21")).toBe("done");
    expect(obligationState({ done_on: null, due_on: "2026-02-01" }, "2026-10-21")).toBe("late");
    expect(obligationState({ done_on: null, due_on: null }, "2026-10-21")).toBe("todo");
    const s = clubStatusSummary(
      [
        { title: "A", done_on: "2026-01-01", due_on: null },
        { title: "B", done_on: null, due_on: "2026-12-01" },
        { title: "C", done_on: null, due_on: "2026-11-01" },
        { title: "D", done_on: null, due_on: null },
      ],
      "2026-10-21",
    );
    expect(s).toEqual({ done: 1, total: 4, late: 0, next: [{ title: "C", due: "2026-11-01" }, { title: "B", due: "2026-12-01" }] });
    expect(nextYearDate("2028-02-29")).toBe("2029-02-28");
    expect(nextYearDate("2026-06-30")).toBe("2027-06-30");
  });
});
describe("copy and layout", () => {
  it("has the same texts in three languages, without long dashes", () => {
    const keys = (o: object) => Object.keys(o).sort();
    for (const copy of [boardCopy, obligationsCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
      expect(JSON.stringify(copy)).not.toMatch(/[–—]/);
    }
    for (const l of ["fr", "nl", "en"] as const)
      for (const k of ["seasonPlayers", "seasonTeams", "seasonCoaches", "chairs", "trainingsDone", "matchesPlayed"] as const) expect(homeCopy[l].metrics[k].label).toBeTruthy();
    expect(boardCopy.fr.name("Documents", 0)).toBe("Documents : à jour");
    expect(boardCopy.fr.presence(5, "suffisant", 1, "tendu")).toBe("Joueurs : 5, suffisant. Coachs : 1, tendu.");
  });
  it("keeps two columns down to 860 px and counts matches, never match days", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("@media (max-width: 860px) {\n  .dash-grid {");
    // One function for the home and the statistics tiles (wave 16, S1).
    expect(readFileSync("src/domains/dashboard/service.ts", "utf8")).toContain("await seasonKeyFigures(c, org, seasonRow, teamId ? [teamId] : null)");
    const service = readFileSync("src/domains/statistics/key-figures.ts", "utf8");
    expect(service).toContain("FROM match x WHERE x.organization_id=$1 AND x.status='played'");
    expect(service).toContain("count(DISTINCT m.profile_id)::int FROM team_membership m JOIN team t ON t.id=m.team_id WHERE t.organization_id=$1 AND t.season_id=$4 AND NOT t.archived AND m.role='player'");
    expect(readFileSync("src/components/statistics.tsx", "utf8")).toContain('useStat<Summary>("summary"');
  });
});
