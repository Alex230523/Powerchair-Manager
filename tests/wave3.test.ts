import { describe, expect, it } from "vitest";
import {
  clubCommand,
  fromOurSide,
  playerTotals,
  refereeCommand,
  teamRecord,
} from "../src/domains/competitions/schema";
import { matchesCopy } from "../src/components/matches-copy";
import { refereesCopy, weekendDays } from "../src/components/referees-copy";
import { matchCopy } from "../src/components/player-profile-copy";

const keys = (o: object) => Object.keys(o).sort();

describe("results and statistics", () => {
  it("counts wins, draws, losses and points of played matches only", () => {
    expect(
      teamRecord([
        { status: "played", our_score: 3, their_score: 1 },
        { status: "played", our_score: 2, their_score: 2 },
        { status: "played", our_score: 0, their_score: 1 },
        { status: "scheduled", our_score: null, their_score: null },
      ]),
    ).toEqual({
      played: 3,
      won: 1,
      drawn: 1,
      lost: 1,
      goalsFor: 5,
      goalsAgainst: 4,
      points: 4,
    });
  });
  it("adds up a player's statistics", () => {
    expect(
      playerTotals([
        {
          starter: true,
          minutes: 40,
          goals: 2,
          assists: 0,
          yellow_cards: 1,
          red_card: false,
        },
        {
          starter: false,
          minutes: 10,
          goals: 0,
          assists: 1,
          yellow_cards: 0,
          red_card: true,
        },
      ]),
    ).toEqual({
      matches: 2,
      starts: 1,
      minutes: 50,
      goals: 2,
      assists: 1,
      yellow: 1,
      red: 1,
    });
  });
  it("reads a home/away report from the club's side", () => {
    expect(fromOurSide(true, 3, 1)).toEqual({ our: 3, their: 1 });
    expect(fromOurSide(false, 3, 1)).toEqual({ our: 1, their: 3 });
  });
});

describe("commands", () => {
  const id = crypto.randomUUID();
  it("accepts a match in Brussels local time and refuses a direct 'played' status", () => {
    const base = {
      action: "create",
      teamId: id,
      opponent: "Liège Lions",
      home: true,
      kind: "league",
      competition: "Championnat BPCF D1",
      startsAt: "2026-11-07T14:00",
      venue: "",
      calendarEventId: null,
      notes: "",
    };
    expect(clubCommand.safeParse(base).success).toBe(true);
    expect(
      clubCommand.safeParse({ ...base, startsAt: "2026-11-07 14:00" }).success,
    ).toBe(false);
    expect(
      clubCommand.safeParse({
        ...base,
        action: "update",
        id,
        version: 1,
        status: "played",
      }).success,
    ).toBe(false);
  });
  it("limits cards and availability batches", () => {
    expect(
      clubCommand.safeParse({
        action: "result",
        id,
        version: 1,
        ourScore: 1,
        theirScore: 0,
        stats: [
          {
            profileId: id,
            minutes: 40,
            goals: 1,
            assists: 0,
            yellowCards: 3,
            redCard: false,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      refereeCommand.safeParse({ action: "availability", days: [] }).success,
    ).toBe(false);
  });
});

describe("referee calendar and copy", () => {
  it("lists weekend days", () => {
    expect(weekendDays("2026-10-19", 1)).toEqual(["2026-10-24", "2026-10-25"]);
  });
  it("keeps the three languages aligned", () => {
    for (const copy of [matchesCopy, refereesCopy, matchCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
    }
  });
});
