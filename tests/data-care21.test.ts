import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { DPA_VERSION, dpaPlain, legalDocs, legalTexts, reviewNotice } from "../src/domains/legal/texts";
import { careCommand, keptTables, retentionBounds, retentionCategories } from "../src/domains/legal/schema";
import { dataCareCopy } from "../src/components/data-care-copy";

/** 21: the texts (drafts to review), the agreement's version, the retention bounds, what a closure keeps. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();

describe("21: the public texts", () => {
  it("has every text in three languages, of the same shape, marked as a draft to review", () => {
    for (const doc of legalDocs) {
      const fr = legalTexts[doc].fr;
      for (const l of ["nl", "en"] as const) {
        expect(legalTexts[doc][l].sections.length).toBe(fr.sections.length);
        expect(!!legalTexts[doc][l].summary).toBe(!!fr.summary);
      }
    }
    for (const l of ["fr", "nl", "en"] as const) expect(reviewNotice[l]).toMatch(/juriste|jurist|lawyer/);
    const all = JSON.stringify(legalTexts);
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/Tigerstorm/i);
    expect(DPA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dpaPlain("fr")).toContain(DPA_VERSION);
    // The agreement covers what article 28 asks.
    expect(legalTexts.dpa.fr.sections.map((s) => s.heading)).toEqual(expect.arrayContaining(["Objet et durée", "Sous-traitants ultérieurs", "Violation de données", "Fin du contrat"]));
  });
  it("keeps docs/legal written from the same texts", () => {
    const files = readdirSync("docs/legal").filter((f) => f.endsWith(".md") && f !== "README.md");
    expect(files.length).toBe(legalDocs.length * 3);
    for (const doc of legalDocs) expect(readFileSync(`docs/legal/${doc}.fr.md`, "utf8")).toContain(`# ${legalTexts[doc].fr.title}`);
    for (const f of ["registre", "aipd", "violation"]) for (const l of ["fr", "nl", "en"]) expect(readFileSync(`docs/legal/internal/${f}.${l}.md`, "utf8")).toMatch(/juriste|jurist|lawyer/);
  });
});

describe("21: the tools", () => {
  it("keeps retention within bounds, and what a closure keeps is the accounting", () => {
    for (const k of retentionCategories) expect(retentionBounds[k].min <= retentionBounds[k].default && retentionBounds[k].default <= retentionBounds[k].max).toBe(true);
    expect(keptTables).toEqual(expect.arrayContaining(["finance_transaction", "annual_accounts", "tax_receipt", "club_termination"]));
    expect(keptTables).not.toContain("club_person");
    expect(keptTables).not.toContain("club_document");
    expect(careCommand.safeParse({ action: "close", confirmName: "Club A" }).success).toBe(true);
    expect(careCommand.safeParse({ action: "retention", category: "health_documents", months: 24 }).success).toBe(true);
    expect(careCommand.safeParse({ action: "retention", category: "everything", months: 24 }).success).toBe(false);
  });
  it("asks the agreement before inviting members, and plans the purge, the exports and the closures", () => {
    expect(readFileSync("src/domains/access/invite.ts", "utf8")).toContain('if (i.role !== "club_president") await requireDpa(c, org);');
    const jobs = readFileSync("src/domains/jobs/registry.ts", "utf8");
    for (const k of ["clubExports: await exportTick(db)", "clubClosures: await closureTick(db)", "retention: await retentionTick(db)"]) expect(jobs).toContain(k);
  });
  it("has the same texts in three languages, without long dashes", () => {
    expect(keys(dataCareCopy.nl)).toEqual(keys(dataCareCopy.fr));
    expect(keys(dataCareCopy.en)).toEqual(keys(dataCareCopy.fr));
    const all = JSON.stringify(dataCareCopy) + Object.values(dataCareCopy).map((c) => Object.values(c).map(String).join(" ")).join(" ");
    expect(all).not.toMatch(/[–—]/);
  });
});
