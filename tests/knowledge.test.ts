import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { chapterContent, findTerms, guideCommand, inLocale, knowledgeCommand, parseBody, quizPassed, quizSchema } from "../src/domains/guide/schema";
import { draftQuizzes, draftTerms, moreDrafts } from "../src/domains/guide/drafts-more";
import { helpFor, helpSheets, staleCaptures } from "../src/domains/guide/help";
import { knowledgeCopy } from "../src/components/knowledge-copy";

/** Knowledge centre (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
const terms = [
  { id: "a", term: "2 contre 1" },
  { id: "b", term: "zone de but" },
  { id: "c", term: "PF2" },
  { id: "d", term: "but" },
];

describe("knowledge centre", () => {
  it("marks the first occurrence of each term only, whole words, longest first", () => {
    const seen = new Set<string>();
    const parts = findTerms("Le 2 contre 1 dans la Zone de but ; PF2, PF2 encore, debut.", terms, seen);
    expect(parts.filter((p) => "id" in p)).toEqual([
      { text: "2 contre 1", id: "a" },
      { text: "Zone de but", id: "b" },
      { text: "PF2", id: "c" },
    ]);
    expect(findTerms("PF2 et but", terms, seen).filter((p) => "id" in p)).toEqual([{ text: "but", id: "d" }]);
  });
  it("places a gallery image in a chapter by its id", () => {
    expect(parseBody("[[image:4F2C1C9E-5B8F-4A5E-9B8A-2A1D3C4E5F60]]")).toEqual([{ type: "image", id: "4f2c1c9e-5b8f-4a5e-9b8a-2a1d3c4e5f60" }]);
  });
  it("proposes G1, G2, G3, G9 and G11 in three languages, saying what is still to confirm", () => {
    expect(moreDrafts.map((d) => d.slug)).toEqual(["who-does-what", "competitions", "classification", "safety", "parents-faq"]);
    for (const d of moreDrafts) {
      const c = chapterContent.parse(d.content);
      const shape = (l: "fr" | "nl" | "en") => parseBody(inLocale(c, l).body).map((b) => (b.type === "figure" ? b.figure : b.type));
      expect(shape("nl")).toEqual(shape("fr"));
      expect(shape("en")).toEqual(shape("fr"));
      expect(d.sources.length).toBeGreaterThan(10);
    }
    for (const slug of ["who-does-what", "competitions", "classification", "safety"]) expect(moreDrafts.find((d) => d.slug === slug)!.content.fr.body).toMatch(/[àÀ] confirmer par la fédération|à valider/);
    expect(moreDrafts[0].content.fr.body).toContain("[[figure:pyramid]]");
    expect(moreDrafts[0].content.fr.body).toMatch(/à compléter/);
  });
  it("has five valid questions per rules chapter; four right answers pass", () => {
    for (const q of Object.values(draftQuizzes)) expect(quizSchema.parse(q)).toHaveLength(5);
    const quiz = draftQuizzes.game;
    const right = quiz.map((q) => q.answer);
    expect(quizPassed(quiz, right)).toBe(true);
    expect(quizPassed(quiz, [...right.slice(0, 4), (right[4] + 1) % 3])).toBe(true);
    expect(quizPassed(quiz, [...right.slice(0, 3), (right[3] + 1) % 3, (right[4] + 1) % 3])).toBe(false);
  });
  it("proposes a lexicon in three languages", () => {
    expect(draftTerms.map((t) => t.term.fr)).toEqual(expect.arrayContaining(["Guard", "2 contre 1", "PF1", "Kick-in", "Ramming", "Rolling road"]));
    for (const t of draftTerms) for (const l of ["fr", "nl", "en"] as const) expect(t.term[l] && t.definition[l]).toBeTruthy();
  });
  it("refuses a photo without a text alternative and a reserved address", () => {
    const image = { action: "addImage", category: "guard", peopleVisible: false, imageRights: false, mediaType: "image/png", data: "AA==" };
    expect(knowledgeCommand.safeParse({ ...image, alt: { fr: "" } }).success).toBe(false);
    expect(knowledgeCommand.safeParse({ ...image, alt: { fr: "Protection" } }).success).toBe(true);
    expect(guideCommand.safeParse({ action: "save", slug: "lexicon", audiences: ["coach"], content: { fr: { title: "Titre" } } }).success).toBe(false);
  });
  it("gives every how-to sheet a real page, three languages and its « Aide » link", () => {
    for (const s of helpSheets) {
      expect(existsSync(`src/app/[locale]${s.route}/page.tsx`), s.route).toBe(true);
      for (const x of [s.title, ...s.steps]) expect(x.fr && x.nl && x.en).toBeTruthy();
    }
    expect(helpFor("/fr/attendance", "coach")?.id).toBe("take-attendance");
    expect(helpFor("/nl/dues", "president")?.id).toBe("issue-dues");
    expect(helpFor("/nl/dues", "parent")?.id).toBe("pay-qr");
    expect(helpFor("/fr/statistics", "coach")).toBeNull();
  });
  it("flags a capture whose screen changed, or a new one", () => {
    expect(
      staleCaptures([
        { id: "a", status: "same" },
        { id: "b", status: "changed" },
        { id: "c", status: "missing" },
      ]),
    ).toEqual([
      { id: "b", reason: "changed" },
      { id: "c", reason: "missing" },
    ]);
  });
  it("has every text in three languages and keeps the banned words out", () => {
    for (const l of ["nl", "en"] as const) expect(keys(knowledgeCopy[l])).toEqual(keys(knowledgeCopy.fr));
    for (const f of ["src/components/knowledge.tsx", "src/components/knowledge-copy.ts", "src/domains/guide/drafts-more.ts", "src/domains/guide/help.ts"])
      expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
