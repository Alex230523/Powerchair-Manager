import { describe, expect, it } from "vitest";
import { blockingOf } from "../src/domains/player-profile/overview";
import { overviewCopy } from "../src/components/person-overview-copy";

/** 40: what blocks a person, from the blocks the reader may see. */
describe("person overview", () => {
  it("names what blocks, and only from what the reader sees", () => {
    const b = {
      teams: [{ id: "t", name: "Aigles", role: "player" }],
      licence: null,
      dues: { due: 25000, paid: 0, late: 25000, oldest: "2026-09-15" },
      documents: { missing: 1, review: 0, expired: 2 },
      chairs: [{ id: "c", name: "Strike", status: "out_of_service" }],
      authorizations: [{ kind: "travel", status: "requested" }],
      permit: { valid_until: "2026-01-01", categories: ["B"] },
    };
    expect(blockingOf(b, "2026-11-02")).toEqual([
      { key: "licence" },
      { key: "duesLate", months: 2, cents: 25000 },
      { key: "documentsMissing", n: 1 },
      { key: "documentsExpired", n: 2 },
      { key: "chairBroken", chair: "Strike" },
      { key: "authorization", n: 1 },
      { key: "permitExpired" },
    ]);
    // A coach's reading has no money: no late fee can block.
    const coach = { ...b, dues: undefined };
    expect(blockingOf(coach, "2026-11-02").map((x) => x.key)).not.toContain("duesLate");
    // A coach (no player team) needs no licence here.
    expect(blockingOf({ teams: [{ id: "t", name: "Aigles", role: "coach" }], licence: null }, "2026-11-02")).toEqual([]);
  });
  it("has the words in the three languages", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(overviewCopy.nl)).toEqual(keys(overviewCopy.fr));
    expect(keys(overviewCopy.en)).toEqual(keys(overviewCopy.fr));
    expect(keys(overviewCopy.en.lines)).toEqual(keys(overviewCopy.fr.lines));
  });
});
