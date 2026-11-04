import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { builtins, checkText, fill, firstName, mailTemplateCommand, optional, usages, variables } from "../src/domains/mail-templates/schema";
import { commandSchema, folderVisibilities, offeredCategories } from "../src/domains/documents/schema";
import { driveCopy } from "../src/components/drive-copy";
import { mailTemplatesCopy } from "../src/components/mail-templates-copy";

/** 10: documents in folders and the email templates. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
const id = "6f1c2a52-6a7e-4c55-9d8f-1f2e3d4c5b6a";

describe("10: the template variables", () => {
  it("accepts only the known variables and fills them, an unknown value staying empty", () => {
    expect(variables).toEqual(["prénom", "équipe", "événement", "date", "lieu", "montant", "échéance", "lien", "club"]);
    expect(checkText("Bonjour {prénom}, rendez-vous le {date} à {lieu}.")).toBe(true);
    expect(checkText("Bonjour {nom}")).toBe(false);
    expect(checkText("Accolade { seule")).toBe(false);
    expect(fill("Bonjour {prénom}, {montant} pour le {échéance}.", { prénom: "Léa", montant: "120,00 €" })).toBe("Bonjour Léa, 120,00 € pour le .");
    expect(firstName("Léa Peeters")).toBe("Léa");
  });
  it("offers a ready template for every use but « Libre », valid in the three languages", () => {
    expect(Object.keys(builtins).sort()).toEqual(usages.filter((u) => u !== "free").sort());
    for (const b of Object.values(builtins))
      for (const l of ["fr", "nl", "en"] as const) {
        expect(checkText(b.texts[l].subject) && checkText(b.texts[l].body)).toBe(true);
        expect(b.texts[l].body).toContain("{club}");
      }
    const all = JSON.stringify(builtins);
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    expect(builtins.new_season.texts.fr.body).toContain("{lien}");
    expect(optional).toEqual(["new_season", "welcome", "sponsor_thanks", "free"]);
  });
  it("checks the commands: texts, targets of the reminders and automations", () => {
    const texts = { fr: { subject: "Objet", body: "Bonjour {prénom}" }, nl: { subject: "Onderwerp", body: "Hallo {prénom}" }, en: { subject: "Subject", body: "Hello {prénom}" } };
    expect(mailTemplateCommand.safeParse({ action: "save", name: "Rappel", usage: "free", texts }).success).toBe(true);
    expect(mailTemplateCommand.safeParse({ action: "save", name: "Rappel", usage: "free", texts: { ...texts, nl: { subject: "x", body: "{naam}" } } }).success).toBe(false);
    expect(mailTemplateCommand.safeParse({ action: "bind", target: "dues_reminder", templateId: id }).success).toBe(true);
    expect(mailTemplateCommand.safeParse({ action: "bind", target: "automation:taskLate", templateId: null }).success).toBe(true);
    expect(mailTemplateCommand.safeParse({ action: "bind", target: "anything", templateId: id }).success).toBe(false);
  });
});

describe("10: the folders", () => {
  it("has free folders with three visibilities, and the identity card no longer offered", () => {
    expect(folderVisibilities).toEqual(["presidency", "staff", "members"]);
    expect(offeredCategories).not.toContain("identity");
    expect(commandSchema.safeParse({ action: "folderSave", name: "Statuts", visibility: "members" }).success).toBe(true);
    expect(commandSchema.safeParse({ action: "folderSave", name: "Statuts", visibility: "everyone" }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "move", id, folderId: null }).success).toBe(true);
  });
  it("checks every document against the same rights, folder or not", () => {
    const access = readFileSync("src/domains/documents/access.ts", "utf8");
    expect(access).toContain("export function folderAllows");
    expect(access).toContain("!d.profile_id && !d.sensitive");
    expect(readFileSync("src/domains/documents/service.ts", "utf8")).toMatch(/documentDrive[\s\S]*await docAccess\(s\.c, s\.a, d\)/);
    expect(readFileSync("src/components/documents.tsx", "utf8")).toContain("<DocumentsDrive");
  });
});

describe("10: texts", () => {
  it("has the same texts in three languages, without long dashes nor the banned words", () => {
    for (const copy of [driveCopy, mailTemplatesCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
      const all = JSON.stringify(copy) + Object.values(copy).map((c) => Object.values(c).map(String).join(" ")).join(" ");
      expect(all).not.toMatch(/[–—]/);
      expect(all).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    }
    expect(mailTemplatesCopy.fr.usages.match_invitation).toBe("Invitation à un match");
  });
});
