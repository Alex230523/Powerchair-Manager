import { describe, it, expect } from "vitest";
import { contactCommand, findDuplicates, foldName, phoneDigits } from "../src/domains/crm/schema";
import { parseContacts, parseCsv, parseVcard } from "../src/domains/crm/import";
import { crmCopy } from "../src/components/crm-copy";
import { datasets } from "../src/domains/exports/schema";

/** A4: the CRM's pure rules: duplicates, CSV and vCard, commands, texts. */
const c = (id: string, full_name: string, email = "", phone = "") => ({ id, full_name, email, phone });

describe("A4 CRM", () => {
  it("finds duplicates by email, phone or a name one letter apart", () => {
    expect(foldName("Dupont, Jean-Étienne")).toBe(foldName("jean etienne DUPONT"));
    expect(phoneDigits("+32 470 12 34 56")).toBe(phoneDigits("0470/12.34.56"));
    const pairs = findDuplicates([
      c("1", "Jean Dupont", "jean@x.be"),
      c("2", "J. Dupont", "JEAN@x.be"),
      c("3", "Marie Claes", "", "0470 12 34 56"),
      c("4", "Marie C.", "", "+32470123456"),
      c("5", "Sophie Lambert"),
      c("6", "Sophie Lamberd"),
      c("7", "Paul Henry"),
      { ...c("8", "Paul Henry"), archived: true },
    ]);
    expect(pairs.map((p) => [p.a.id, p.b.id, p.reason])).toEqual([
      ["1", "2", "email"],
      ["3", "4", "phone"],
      ["5", "6", "name"],
    ]);
  });
  it("reads a CSV with its own separator, quotes and split names", () => {
    const csv = '﻿Prénom;Nom de famille;Société;E-mail;Téléphone\nJean;Dupont;"Garage ""Le Bon""";jean@garage.be;0470 00 00 00\n;;;;\nMarie;Claes;;pas-un-email;\n';
    const { rows, ignored } = parseCsv(csv);
    expect(rows).toEqual([
      { fullName: "Jean Dupont", organizationName: 'Garage "Le Bon"', role: "", email: "jean@garage.be", phone: "0470 00 00 00", notes: "" },
      { fullName: "Marie Claes", organizationName: "", role: "", email: "", phone: "", notes: "" },
    ]);
    expect(ignored).toBe(1);
    expect(parseCsv("name,email\n\"Doe, John\",john@doe.test").rows[0]).toMatchObject({ fullName: "Doe, John", email: "john@doe.test" });
  });
  it("reads vCards, folded lines and the N field included", () => {
    const vcf = ["BEGIN:VCARD", "VERSION:3.0", "N:Claes;Marie;;;", "ORG:Commune de;Service des sports", "TEL;TYPE=CELL:+32 470 11 22 33", "EMAIL;TYPE=INTERNET:marie@commune.be", "NOTE:Ligne un\\nligne", " deux", "END:VCARD", "BEGIN:VCARD", "FN:Paul Henry", "TITLE:Échevin", "END:VCARD"].join("\r\n");
    const { rows } = parseVcard(vcf);
    expect(rows).toEqual([
      { fullName: "Marie Claes", organizationName: "Commune de", role: "", email: "marie@commune.be", phone: "+32 470 11 22 33", notes: "Ligne un\nlignedeux" },
      { fullName: "Paul Henry", organizationName: "", role: "Échevin", email: "", phone: "", notes: "" },
    ]);
    expect(parseContacts("contacts.vcf", vcf).rows).toHaveLength(2);
    expect(parseContacts("contacts.csv", "name\nAnne").rows).toHaveLength(1);
  });
  it("reads the commands, an import of 500 rows at most", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    expect(contactCommand.parse({ action: "interaction", contactId: id, kind: "call", summary: " Rappel " })).toMatchObject({ summary: "Rappel" });
    expect(() => contactCommand.parse({ action: "interaction", contactId: id, kind: "sent", summary: "x" })).toThrow();
    expect(() => contactCommand.parse({ action: "import", rows: Array.from({ length: 501 }, () => ({ fullName: "Anne" })) })).toThrow();
    expect(contactCommand.parse({ action: "import", rows: [{ fullName: "Anne" }] })).toMatchObject({ rows: [{ fullName: "Anne", email: "" }], tags: [] });
    expect(datasets).toContain("contacts");
  });
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(crmCopy.nl)).toEqual(keys(crmCopy.fr));
    expect(keys(crmCopy.en)).toEqual(keys(crmCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) expect(JSON.stringify(crmCopy[l])).not.toMatch(/[–—]/);
  });
});
