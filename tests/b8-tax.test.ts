import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatNationalNumber, maskedNationalNumber, validCompanyNumber, validNationalNumber, normalizeCompanyNumber } from "../src/domains/tax/identity";
import { approvalAlert, belcotaxDeadline, controlReport, counts, purgeAfter, yearTotals } from "../src/domains/tax/rules";
import { buildBelcotax, checkBelcotax, type Fiche, type Sender } from "../src/domains/tax/belcotax";
import { receiptPdf } from "../src/domains/tax/receipt-pdf";
import { pdfDocument, wrap } from "../src/lib/pdf";
import { taxCommand } from "../src/domains/tax/schema";
import { taxCopy } from "../src/components/tax-copy";
import { builtin } from "../src/domains/notifications/templates";
import { catalog, defaultMessages } from "../src/domains/automations/catalog";

/** B8: identifiers, which gifts count, the control report, the receipt PDF and the Belcotax file. */
// A national number with its check: born 1985-07-30, sequence 033; one born in 2005.
const nn = (base: string, y2000 = false) => base + String(97 - (Number((y2000 ? "2" : "") + base) % 97)).padStart(2, "0");
const ana = nn("850730033"),
  zoe = nn("050412123", true);
const bce = (base8: string) => base8 + String(97 - (Number(base8) % 97)).padStart(2, "0");
const club = bce("04123456");

describe("B8 identifiers", () => {
  it("checks the national number, born before and from 2000", () => {
    expect(validNationalNumber(ana)).toBe(true);
    expect(validNationalNumber(formatNationalNumber(ana))).toBe(true);
    expect(validNationalNumber(zoe)).toBe(true);
    expect(validNationalNumber(ana.slice(0, 10) + String((Number(ana[10]) + 1) % 10))).toBe(false);
    expect(validNationalNumber("123")).toBe(false);
    expect(validNationalNumber("00000000000")).toBe(false);
    expect(formatNationalNumber(ana)).toMatch(/^85\.07\.30-033\.\d{2}$/);
    expect(maskedNationalNumber(ana)).toBe("••.••.••-•••." + ana.slice(9));
  });
  it("checks the company number of the BCE", () => {
    expect(validCompanyNumber(club)).toBe(true);
    expect(validCompanyNumber(club.slice(0, 4) + "." + club.slice(4, 7) + "." + club.slice(7))).toBe(true);
    expect(validCompanyNumber("2" + club.slice(1))).toBe(false);
    expect(validCompanyNumber(club.slice(0, 9) + String((Number(club[9]) + 1) % 10))).toBe(false);
    expect(normalizeCompanyNumber(club.slice(1))).toBe(club);
  });
});

describe("B8 gifts and report", () => {
  const gifts = [
    { donor_id: "a", received_on: "2025-03-01", amount_cents: 2500, nature: "gift", cancelled_at: null },
    { donor_id: "a", received_on: "2025-11-01", amount_cents: 2000, nature: "gift", cancelled_at: null },
    { donor_id: "b", received_on: "2025-05-01", amount_cents: 3000, nature: "gift", cancelled_at: null },
    { donor_id: "b", received_on: "2025-05-02", amount_cents: 50000, nature: "sponsor", cancelled_at: null },
    { donor_id: "c", received_on: "2025-06-01", amount_cents: 9000, nature: "purchase", cancelled_at: null },
    { donor_id: "c", received_on: "2025-06-02", amount_cents: 9000, nature: "gift", cancelled_at: "2025-06-03" },
    { donor_id: "a", received_on: "2024-12-31", amount_cents: 99999, nature: "gift", cancelled_at: null },
  ];
  it("counts only gifts without anything in return, of the year, not cancelled", () => {
    expect(counts("gift")).toBe(true);
    for (const n of ["in_kind", "purchase", "sponsor", "dues"]) expect(counts(n)).toBe(false);
    expect(Object.fromEntries(yearTotals(gifts, 2025))).toEqual({ a: 4500, b: 3000 });
  });
  it("adds two gifts under the threshold into one over it, and flags the rest", () => {
    const donors = [
      { id: "a", kind: "person" as const, name: "Marie Peeters", postal_code: "1300", has_national: true, national_hash: "h1", company_number: "" },
      { id: "b", kind: "person" as const, name: "Jan Janssens", postal_code: "9000", has_national: false, national_hash: null, company_number: "" },
      { id: "d", kind: "person" as const, name: "Marie  PEETERS", postal_code: "1300", has_national: false, national_hash: null, company_number: "" },
    ];
    const totals = new Map([["a", 4500], ["b", 3000], ["d", 4000]]);
    const r = controlReport(donors, totals, 4000);
    expect(r.eligible).toEqual(["a", "d"]);
    expect(r.below).toEqual(["b"]);
    expect(r.missing).toEqual(["d"]);
    expect(r.duplicates).toEqual([["a", "d"]]);
  });
  it("knows the filing deadline, the approval's end and the purge date", () => {
    expect(belcotaxDeadline(2025)).toBe("2026-02-28");
    expect(belcotaxDeadline(2027)).toBe("2028-02-29");
    expect(approvalAlert("2026-12-31", "2026-11-01")).toBe("ending");
    expect(approvalAlert("2026-10-31", "2026-11-01")).toBe("ended");
    expect(approvalAlert("2028-12-31", "2026-11-01")).toBeNull();
    expect(purgeAfter("2025-06-01")).toBe("2035-06-01");
    expect(purgeAfter("2024-02-29")).toBe("2034-03-01");
  });
});

describe("B8 receipt PDF", () => {
  it("writes a real PDF, with accents, the amount and never the full national number", () => {
    const bytes = receiptPdf(
      {
        year: 2025,
        sequence: 7,
        amountCents: 4500,
        issuedOn: "2026-01-15",
        status: "issued",
        correction: true,
        snapshot: {
          club: { name: "Club démo Powerchair", address: "Rue du Stade 1, 1300 Wavre", companyNumber: club, approvalNumber: "AG-2024-15", approvalFrom: "2024-01-01", approvalTo: "2029-12-31", signatory: "Alex Martin" },
          donor: { kind: "person", name: "Marie Peeters", street: "Rue Haute 3", postalCode: "1300", city: "Wavre", country: "BE", identifier: ana.slice(9) },
        },
      },
      "fr",
    );
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Attestation de lib\\351ralit\\351s");
    expect(text).toContain("45,00");
    expect(text).toContain("rectificative");
    expect(text).not.toContain(ana);
    // The cross-reference points at each object.
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    for (const [i, line] of text.slice(xref).split("\n").slice(3, 8).entries()) {
      const at = Number(line.slice(0, 10));
      expect(text.slice(at).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1}`).toBe(true);
    }
  });
  it("wraps long lines and starts a new page when one is full", () => {
    expect(wrap("a ".repeat(200), 11).length).toBeGreaterThan(2);
    const many = Buffer.from(pdfDocument(Array.from({ length: 120 }, (_, i) => ({ text: "Ligne " + i })), "Test")).toString("latin1");
    expect(many).toMatch(/\/Count 3 /);
  });
});

describe("B8 Belcotax file", () => {
  const sender: Sender = { name: "Club démo", street: "Rue du Stade 1", postalCode: "1300", city: "Wavre", companyNumber: club, email: "club@example.test", phone: "", contact: "Alex", language: "fr" };
  const fiches: Fiche[] = [
    { sequence: 1, kind: "person", identifier: ana, name: "Marie Peeters", street: "Rue Haute 3", postalCode: "1300", city: "Wavre", country: "BE", amountCents: 4500, treatment: 0 },
    { sequence: 2, kind: "company", identifier: bce("08765432"), name: "Boulangerie SA", street: "Grand-Place 1", postalCode: "1000", city: "Bruxelles", country: "BE", amountCents: 25000, treatment: 1 },
  ];
  it("writes the envelope, one fiche per receipt and the control totals", () => {
    const xml = buildBelcotax(2025, sender, fiches, "2026-01-20");
    expect(xml).toContain("<v0002_inkomstenjaar>2025</v0002_inkomstenjaar>");
    expect(xml).toContain("<v0011_aanmaakdatum>20-01-2026</v0011_aanmaakdatum>");
    expect(xml.match(/<Fiche28171>/g)).toHaveLength(2);
    expect(xml).toContain(`<f2011_nationaalnr>${ana}</f2011_nationaalnr>`);
    expect(xml).toContain("<f71_2060_bedragliberaliteit>4500</f71_2060_bedragliberaliteit>");
    expect(xml).toContain("<f2028_typetraitement>1</f2028_typetraitement>");
    expect(xml).toContain("<r8012_controletotaal>29500</r8012_controletotaal>");
    expect(xml).toContain("<r9013_controletotaal>29500</r9013_controletotaal>");
    expect(checkBelcotax(2025, sender, fiches, xml)).toEqual([]);
    // Well-formed: every element closed in order, one root.
    const stack: string[] = [];
    for (const [, close, name] of xml.replace(/<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([A-Za-z0-9_]+)>/g)) {
      if (close) expect(stack.pop()).toBe(name);
      else stack.push(name);
    }
    expect(stack).toEqual([]);
    expect(xml.match(/<Verzendingen>/g)).toHaveLength(1);
  });
  it("flags a missing national number, a bad address, a duplicate number and a club without BCE", () => {
    const bad: Fiche[] = [{ ...fiches[0], identifier: "" }, { ...fiches[1], sequence: 1, postalCode: "" }];
    const xml = buildBelcotax(2025, { ...sender, companyNumber: "" }, bad, "2026-01-20");
    expect(checkBelcotax(2025, { ...sender, companyNumber: "" }, bad, xml).map((i) => i.code + (i.sequence ?? ""))).toEqual(["SENDER", "IDENTIFIER1", "ADDRESS1", "SEQUENCE1"]);
  });
  it("validates against the official XSD of the year when it is in docs/belcotax", () => {
    const dir = "docs/belcotax/2025";
    const xsd = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".xsd")) : undefined;
    if (!xsd) return; // The official schema is downloaded by hand from the SPF Finances (docs/belcotax/README.md).
    try {
      execFileSync("xmllint", ["--version"], { stdio: "pipe" });
    } catch {
      return; // xmllint (libxml2) is needed to check against the XSD.
    }
    const tmp = mkdtempSync(join(tmpdir(), "belcotax-"));
    writeFileSync(join(tmp, "f.xml"), buildBelcotax(2025, sender, fiches, "2026-01-20"));
    expect(() => execFileSync("xmllint", ["--noout", "--schema", join(dir, xsd), join(tmp, "f.xml")], { stdio: "pipe" })).not.toThrow();
  });
});

describe("B8 commands and texts", () => {
  it("refuses a cancellation without a reason and an unknown nature", () => {
    expect(() => taxCommand.parse({ action: "cancelReceipt", id: crypto.randomUUID(), reason: "x" })).toThrow();
    expect(() => taxCommand.parse({ action: "gift", donorId: crypto.randomUUID(), receivedOn: "2025-01-01", amountCents: 100, nature: "souper" })).toThrow();
    expect(taxCommand.parse({ action: "approval", approved: false })).toMatchObject({ number: "", thresholdCents: 4000 });
  });
  it("has every text in three languages, and the filing reminder", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(taxCopy.nl)).toEqual(keys(taxCopy.fr));
    expect(keys(taxCopy.en)).toEqual(keys(taxCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      expect(JSON.stringify(taxCopy[l])).not.toMatch(/[–—]/);
      expect(builtin.tax_identity[l].body).toContain("{url}");
      expect(builtin.tax_receipt[l].body).toContain("{url}");
      expect(defaultMessages.taxDeadline[l].body).toContain("{date}");
    }
    expect(catalog.taxDeadline.modules).toEqual(["finance"]);
    expect(builtin.tax_identity.fr.body).toMatch(/jamais dans la communication d'un virement/);
  });
});
