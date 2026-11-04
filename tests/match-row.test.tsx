import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchRow, type RowMatch } from "../src/components/match-row";
import { formOf, outcomeOf, teamRecord } from "../src/domains/competitions/schema";
import { matchRowCopy } from "../src/components/match-row-copy";

/** 5: one match line in every context, a pill readable without colour, the tournament link, the friendly said, an unconfirmed score out of the figures. */
const base: RowMatch = { id: "m1", local: "2026-10-10T14:00", team: "Aigles", teamColor: "blue", opponent: "Ours", home: true, ours: 3, theirs: 1, status: "played", context: { kind: "league", name: "D1" } };
const html = (m: Partial<RowMatch>) => renderToStaticMarkup(<MatchRow locale="fr" m={{ ...base, ...m }} />);

describe("match line", () => {
  it("is the same component in the five places", () => {
    for (const f of ["matches", "match-line", "teams", "player-profile", "match-cards"]) expect(readFileSync(`src/components/${f}.tsx`, "utf8"), f).toMatch(/<MatchRow|<TeamMatches/);
  });
  it("says the result with a letter and words, never the colour alone", () => {
    const out = html({});
    expect(out).toContain('data-outcome="win"');
    expect(out).toContain('<span aria-hidden="true">V</span>');
    expect(out).toContain('<span class="sr-only">Victoire 3 à 1</span>');
    expect(html({ ours: 1, theirs: 1 })).toContain("Match nul 1 à 1");
    expect(html({ ours: 0, theirs: 2 })).toContain("Défaite 0 à 2");
    // Not played: « - », no pill.
    const later = html({ status: "scheduled", ours: null, theirs: null, venue: "Salle B" });
    expect(later).not.toContain("result-pill");
    expect(later).toContain(">-<");
    expect(later).toContain("Salle B");
  });
  it("links a tournament match to its tournament, and marks a friendly", () => {
    const t = html({ context: { kind: "tournament", name: "Coupe C5", day: "Journée 2", href: "/fr/tournaments/t1" } });
    expect(t).toContain('href="/fr/tournaments/t1"');
    expect(t).toContain("Coupe C5 · Journée 2");
    expect(html({ context: { kind: "friendly" } })).toContain("Match amical");
  });
  it("keeps an unconfirmed score « à confirmer » and out of the figures", () => {
    expect(html({ unconfirmed: true })).toContain("à confirmer");
    const ms = [
      { status: "played", our_score: 3, their_score: 1, score_status: "proposed", starts_at: "2026-10-10" },
      { status: "played", our_score: 0, their_score: 0, score_status: "confirmed", starts_at: "2026-10-03" },
    ];
    expect(teamRecord(ms)).toMatchObject({ played: 1, drawn: 1, won: 0 });
    expect(formOf(ms)).toEqual(["draw"]);
    expect(outcomeOf(2, 1)).toBe("win");
  });
  it("has the same words in the three languages, no long dash", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(matchRowCopy.nl)).toEqual(keys(matchRowCopy.fr));
    expect(keys(matchRowCopy.en)).toEqual(keys(matchRowCopy.fr));
    expect(JSON.stringify(matchRowCopy)).not.toMatch(/[–—]|convoqu|opgeroep|summon|call-up/i);
  });
});
