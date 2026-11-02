import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chapterContent, guideCommand, inLocale, parseBody, readerAudiences } from "../src/domains/guide/schema";
import { complianceItems, drafts } from "../src/domains/guide/drafts";
import { guideCopy } from "../src/components/guide-copy";
import { suggested } from "../src/domains/onboarding/schema";

/** Guide du powerchair football (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));

describe("game guide", () => {
  it("reads the markup as blocks, never as HTML", () => {
    const blocks = parseBody("Intro\nsuite\n\n## Titre\n- un\n- deux\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> note\n> encore\n\n[[figure:pitch]]\n[[figure:inconnu]]\n<script>alert(1)</script>");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Intro suite" },
      { type: "heading", text: "Titre" },
      { type: "list", items: ["un", "deux"] },
      { type: "table", rows: [["A", "B"], ["1", "2"]] },
      { type: "note", text: "note encore" },
      { type: "figure", figure: "pitch" },
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
  it("proposes the two pages in three languages, with the same headings, figures and table", () => {
    expect(drafts.map((d) => d.slug)).toEqual(["game", "chair"]);
    for (const d of drafts) {
      const c = chapterContent.parse(d.content);
      const shape = (l: "fr" | "nl" | "en") => parseBody(inLocale(c, l).body).map((b) => (b.type === "table" ? `table:${b.rows.length}` : b.type === "figure" ? b.figure : b.type));
      expect(shape("nl")).toEqual(shape("fr"));
      expect(shape("en")).toEqual(shape("fr"));
      expect(d.sources).toMatch(/FIPFA/);
    }
    const chair = parseBody(drafts[1].content.fr.body).find((b) => b.type === "table");
    expect(chair && chair.type === "table" && chair.rows.length).toBe(13);
  });
  it("falls back to French where a language is missing", () => {
    const c = chapterContent.parse({ fr: { title: "Titre", body: "Texte" }, nl: {}, en: { title: "Title" } });
    expect(inLocale(c, "nl")).toMatchObject({ title: "Titre", body: "Texte", fallback: true });
    expect(inLocale(c, "en")).toMatchObject({ title: "Title", body: "Texte", fallback: true });
  });
  it("filters by the reader's role", () => {
    expect(readerAudiences("guardian", "club")).toEqual(["guardian"]);
    expect(readerAudiences("coach", "club")).toEqual(["coach", "staff"]);
    expect(readerAudiences("referee", "federation")).toEqual(["referee"]);
  });
  it("refuses an empty audience and an unknown address", () => {
    const content = { fr: { title: "Titre" } };
    expect(guideCommand.safeParse({ action: "save", slug: "Bad Slug", audiences: ["coach"], content }).success).toBe(false);
    expect(guideCommand.safeParse({ action: "save", slug: "ok", audiences: [], content }).success).toBe(false);
    expect(guideCommand.safeParse({ action: "save", slug: "ok", audiences: ["coach"], content }).success).toBe(true);
  });
  it("puts both pages in the proposed welcome journeys", () => {
    for (const k of ["coach", "referee", "family"] as const) expect(suggested[k].steps.filter((s) => s.kind === "read" && s.link.startsWith("guide:")).map((s) => s.link)).toEqual(["guide:game", "guide:chair"]);
  });
  it("has every text in three languages and a description for every figure", () => {
    for (const l of ["nl", "en"] as const) expect(keys(guideCopy[l])).toEqual(keys(guideCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      for (const f of Object.values(guideCopy[l].figures)) expect(f.desc.length).toBeGreaterThan(40);
      expect(Object.keys(guideCopy[l].compliance.items)).toEqual([...complianceItems]);
    }
  });
  it("keeps the banned words out", () => {
    for (const f of ["src/components/guide.tsx", "src/components/guide-copy.ts", "src/components/guide-figures.tsx", "src/components/chair-compliance.tsx", "src/domains/guide/drafts.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    }
  });
});
