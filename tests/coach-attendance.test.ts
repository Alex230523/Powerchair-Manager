import { describe, it, expect } from "vitest";
import { myUpcoming, playerSummaries, splitStaff } from "../src/domains/attendance/rollcall";
import { answerCounts } from "../src/domains/calendar/planner";
import { callCopy } from "../src/components/attendance-call-copy";
import { focusCopy } from "../src/components/home-focus-copy";
import { staffSql } from "../src/domains/attendance/staff";

/** 13/11/2026: the coaches give their attendance, shown and counted apart from the players. */
const inv = (profile: string, name: string, extra: { staff?: boolean; self?: boolean; canRespond?: boolean; actual?: string } = {}) => ({ id: "i-" + profile, profile_id: profile, full_name: name, actual: "present", response: "none", withdrawn_at: null, version: 1, ...extra });
const ev = (id: string, startsAt: string, invitations: ReturnType<typeof inv>[], extra: Record<string, unknown> = {}) => ({
  id,
  title: "Entraînement " + id,
  kind: "training",
  status: "scheduled",
  starts_at: startsAt,
  team_id: "t1",
  manage: true,
  register: { closed_at: null as string | null, deadline: "2099-01-01T00:00:00Z" },
  invitations,
  ...extra,
});
const now = Date.parse("2026-11-13T10:00:00Z");

describe("coaches' attendance", () => {
  it("splits the roll call: the players first, then the coaches", () => {
    const people = [inv("a", "Ana"), inv("c", "Coach Léo", { staff: true }), inv("b", "Bilal")];
    const g = splitStaff(people);
    expect(g.players.map((i) => i.full_name)).toEqual(["Ana", "Bilal"]);
    expect(g.staff.map((i) => i.full_name)).toEqual(["Coach Léo"]);
  });

  it("never mixes the coaches with the players' rates", () => {
    const closed = ev("1", "2026-11-10T18:00:00Z", [inv("a", "Ana"), inv("c", "Coach Léo", { staff: true, actual: "absent" })], { register: { closed_at: "2026-11-10T21:00:00Z" } });
    expect(playerSummaries([closed]).map((s) => s.name)).toEqual(["Ana"]);
    expect(playerSummaries([closed], true)).toMatchObject([{ name: "Coach Léo", rate: 0, absent: 1 }]);
  });

  it("lists « Mes prochaines séances »: one's own lines still open, soonest first", () => {
    const events = [
      ev("later", "2026-11-20T18:00:00Z", [inv("c", "Coach Léo", { staff: true, self: true, canRespond: true })]),
      ev("soon", "2026-11-14T18:00:00Z", [inv("a", "Ana"), inv("c", "Coach Léo", { staff: true, self: true, canRespond: true })]),
      // Past, closed, answers over, a child's line or cancelled: not listed.
      ev("past", "2026-11-12T18:00:00Z", [inv("c", "Coach Léo", { self: true, canRespond: true })]),
      ev("closed", "2026-11-15T18:00:00Z", [inv("c", "Coach Léo", { self: true, canRespond: true })], { register: { closed_at: "2026-11-13T09:00:00Z" } }),
      ev("deadline", "2026-11-15T18:00:00Z", [inv("c", "Coach Léo", { self: true, canRespond: true })], { register: { closed_at: null, deadline: "2026-11-13T09:00:00Z" } }),
      ev("child", "2026-11-16T18:00:00Z", [inv("k", "Tom", { self: false, canRespond: true })]),
      ev("cancelled", "2026-11-17T18:00:00Z", [inv("c", "Coach Léo", { self: true, canRespond: true })], { status: "cancelled" }),
    ];
    expect(myUpcoming(events, now).map((m) => m.event.id)).toEqual(["soon", "later"]);
  });

  it("counts on the calendar the players' answers only", () => {
    expect(answerCounts([{ role: "player", response: "present" }, { role: "coach", response: "present" }, { role: "player", response: "none" }])).toEqual({ total: 2, yes: 1, no: 0, none: 1 });
  });

  it("says who is staff from the team of the session, assistants and volunteers included", () => {
    const sql = staffSql("i.profile_id", "i.organization_id", "$2::uuid", "$3::timestamptz", "p");
    expect(sql).toContain("'coach','assistant','volunteer'");
    expect(sql).toContain("AT TIME ZONE 'Europe/Brussels'");
  });

  it("has the same words in the three languages", () => {
    const keys = ["players", "staff", "staffStats", "mine", "mineIntro", "mineOf"] as const;
    for (const l of ["fr", "nl", "en"] as const) {
      for (const k of keys) expect(callCopy[l][k].length).toBeGreaterThan(0);
      expect(Object.keys(callCopy[l].mineAnswer)).toEqual(["present", "absent", "uncertain"]);
      expect(focusCopy[l].staffAnswers).toContain("{present}");
      expect(focusCopy[l].mineOf).toContain("{title}");
      for (const s of [...keys.map((k) => callCopy[l][k]), focusCopy[l].mine, focusCopy[l].staffAnswers]) expect(s).not.toMatch(/[–—]/);
    }
  });
});
