import { describe, it, expect } from "vitest";
import { actuals, commandSchema } from "../src/domains/attendance/schema";
import { callSessions, playerSummaries, segmentOf, segments, sortSummaries } from "../src/domains/attendance/rollcall";
import { callCopy } from "../src/components/attendance-call-copy";
import { gridCopy } from "../src/components/attendance-grid-copy";
import { attendanceCopy } from "../src/components/attendance-copy";
import { undoKinds } from "../src/domains/undo/service";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const id = "00000000-0000-4000-8000-000000000001";
const inv = (profile: string, name: string, actual: string, response = "none") => ({ id: profile + ":" + actual, profile_id: profile, full_name: name, actual, response, withdrawn_at: null });
const ev = (id: string, kind: string, startsAt: string, invitations: ReturnType<typeof inv>[], closed = true, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  status: "scheduled",
  starts_at: startsAt,
  team_id: "t1",
  manage: true,
  register: { closed_at: closed ? startsAt : null },
  invitations,
  ...extra,
});

/** Wave 17 (J2): the roll call, one session at a time, and the figures per player. */
describe("wave 17, J2: attendance", () => {
  it("adds « Excusé », « Tout présent » and an undo for each mark", () => {
    expect(actuals).toContain("excused");
    expect(commandSchema.safeParse({ action: "markAll", id, expectedVersion: 3 }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "mark", id, expectedVersion: 3, actual: "excused", reason: "" }).success).toBe(true);
    expect(undoKinds).toContain("attendanceMark");
  });
  it("shows four choices; late and early are a present person with a note", () => {
    expect(segments).toEqual(["present", "absent", "excused", "unchecked"]);
    expect(["present", "late", "early", "absent", "excused", "unchecked"].map(segmentOf)).toEqual(["present", "present", "present", "absent", "excused", "unchecked"]);
  });
  it("offers the started sessions of the team, most recent first", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    const list = callSessions(
      [
        ev("a", "training", "2026-10-10T17:00:00Z", []),
        ev("b", "training", "2026-10-20T17:00:00Z", []),
        ev("future", "training", "2026-10-25T17:00:00Z", []),
        ev("other", "training", "2026-10-21T17:00:00Z", [], true, { team_id: "t2" }),
        ev("cancelled", "training", "2026-10-19T17:00:00Z", [], true, { status: "cancelled" }),
        ev("none", "training", "2026-10-18T17:00:00Z", [], true, { register: null }),
      ],
      "t1",
      now,
    );
    expect(list.map((e) => e.id)).toEqual(["b", "a"]);
  });
  it("counts trainings and matches over closed registers, « Excusé » apart", () => {
    const events = [
      ev("1", "training", "2026-10-01T17:00:00Z", [inv("p", "Ana", "present"), inv("q", "Bilal", "excused")]),
      ev("2", "training", "2026-10-08T17:00:00Z", [inv("p", "Ana", "late"), inv("q", "Bilal", "absent")]),
      ev("3", "friendly", "2026-10-12T17:00:00Z", [inv("p", "Ana", "absent"), inv("q", "Bilal", "present")]),
      ev("4", "training", "2026-10-15T17:00:00Z", [inv("p", "Ana", "present")], false),
    ];
    const [ana, bilal] = sortSummaries(playerSummaries(events), "name");
    expect(ana).toMatchObject({ name: "Ana", training: { attended: 2, closed: 2 }, match: { attended: 0, closed: 1 }, absent: 1, excused: 0, rate: 67 });
    expect(bilal).toMatchObject({ name: "Bilal", training: { attended: 0, closed: 2 }, match: { attended: 1, closed: 1 }, absent: 1, excused: 1, rate: 33 });
    expect(sortSummaries([bilal, ana], "rate").map((s) => s.name)).toEqual(["Ana", "Bilal"]);
  });
  it("has every text in the three languages, without long dashes", () => {
    expect(shape(callCopy.nl)).toEqual(shape(callCopy.fr));
    expect(shape(callCopy.en)).toEqual(shape(callCopy.fr));
    expect(JSON.stringify(callCopy)).not.toMatch(/[–—]/);
    for (const l of ["fr", "nl", "en"] as const) {
      expect(Object.keys(gridCopy[l].actuals)).toContain("excused");
      expect(Object.keys(gridCopy[l].short)).toContain("excused");
      expect(Object.keys(attendanceCopy[l].actuals)).toContain("excused");
      expect(Object.keys(attendanceCopy[l].actions)).toEqual(expect.arrayContaining(["mark_all", "undo"]));
    }
  });
});
