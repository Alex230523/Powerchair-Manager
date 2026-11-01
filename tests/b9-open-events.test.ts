import { describe, it, expect } from "vitest";
import { answersComplete, freePlaces, keepAnswers, publicCommand, windowState } from "../src/domains/open-events/service";
import { parseQuestions } from "../src/domains/open-events/questions";
import { openEventsCopy } from "../src/components/open-events-copy";

/** B9: the registration window, places and waiting list, questions, the public form and the texts. */
describe("B9 open events", () => {
  it("opens and closes registration on its dates", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(windowState("2026-11-02T00:00:00Z", "2026-11-10T00:00:00Z", now)).toBe("before");
    expect(windowState("2026-10-20T00:00:00Z", "2026-11-10T00:00:00Z", now)).toBe("open");
    expect(windowState("2026-10-20T00:00:00Z", "2026-10-31T00:00:00Z", now)).toBe("closed");
  });
  it("offers only the places that are free, to as many as wait", () => {
    expect(freePlaces(10, 10, 3)).toBe(0);
    expect(freePlaces(10, 8, 3)).toBe(2);
    expect(freePlaces(10, 12, 3)).toBe(0);
    expect(freePlaces(null, 50, 3)).toBe(3);
  });
  it("reads the questions typed one per line, and checks the answers", () => {
    const qs = parseQuestions("Avez-vous déjà joué ? *\nVotre club actuel\n\nx");
    expect(qs).toEqual([
      { id: "q1", label: "Avez-vous déjà joué ?", kind: "yesno", required: true },
      { id: "q2", label: "Votre club actuel", kind: "text", required: false },
    ]);
    expect(answersComplete(qs, {})).toBe(false);
    expect(answersComplete(qs, { q1: false })).toBe(true);
    expect(answersComplete(qs, { q1: "oui" })).toBe(false);
    expect(keepAnswers(qs, { q1: true, q2: "Lions", q9: "intrus" })).toEqual({ q1: true, q2: "Lions" });
  });
  it("requires the data consent, keeps the image right apart and refuses robots", () => {
    const base = { action: "register", fullName: "Ana Peeters", email: "ana@example.test" };
    expect(publicCommand.safeParse(base).success).toBe(false);
    const ok = publicCommand.parse({ ...base, consentData: true });
    expect(ok.action === "register" && ok.consentImage).toBe(false);
    expect(publicCommand.safeParse({ ...base, consentData: true, website: "http://spam" }).success).toBe(false);
  });
  it("has every text in French, Dutch and English, with the invitation vocabulary", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(openEventsCopy.nl)).toEqual(keys(openEventsCopy.fr));
    expect(keys(openEventsCopy.en)).toEqual(keys(openEventsCopy.fr));
    expect(JSON.stringify(openEventsCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
