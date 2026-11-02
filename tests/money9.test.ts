import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { alertDue, allocationCommand, allocationCsv, allocationState, treasury } from "../src/domains/finance/allocations-schema";
import { attestationLines } from "../src/domains/dues/attestation-pdf";
import { pdfImage } from "../src/lib/pdf-image";
import { pdfDocument } from "../src/lib/pdf";
import { reservedCopy } from "../src/components/reserved-funds-copy";
import { attestationCopy } from "../src/components/attestation-copy";
import { goalsCopy } from "../src/components/fundraising-goals-copy";
import { annualCopy } from "../src/components/annual-reminder-copy";
import { financeNavCopy } from "../src/components/finance-nav-copy";

/** 9: reserved funds, the attestation PDF, the menu without a third row of tabs, the texts. */
describe("reserved funds", () => {
  it("keeps what was received and not yet spent, and what is granted but not received apart", () => {
    expect(allocationState(300000, 200000, 80000)).toEqual({ received: 200000, spent: 80000, remaining: 120000, toReceive: 100000 });
    expect(allocationState(100000, 100000, 150000)).toEqual({ received: 100000, spent: 150000, remaining: 0, toReceive: 0 });
    expect(treasury(70000, 120000)).toEqual({ total: 70000, reserved: 120000, available: -50000 });
  });
  it("alerts at 60 then 30 days before the use-by date, only if money is left", () => {
    expect(alertDue("2026-12-31", "2026-11-02", 100)).toBe(60);
    expect(alertDue("2026-11-30", "2026-11-02", 100)).toBe(30);
    expect(alertDue("2027-06-30", "2026-11-02", 100)).toBeNull();
    expect(alertDue("2026-11-30", "2026-11-02", 0)).toBeNull();
    expect(alertDue("2026-10-30", "2026-11-02", 100)).toBeNull();
    expect(alertDue(null, "2026-11-02", 100)).toBeNull();
  });
  it("exports the justification lines, safe for a spreadsheet", () => {
    const csv = allocationCsv([{ label: "=2 fauteuils", source: "Province", purpose: "equipment", useBy: "2026-12-31", operations: [{ date: "2026-10-01", label: "Fauteuil", direction: "out", cents: 80000 }], state: allocationState(300000, 200000, 80000) }], ["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(csv).toContain(`"'=2 fauteuils"`);
    expect(csv).toContain(`"800,00"`);
    expect(csv).toContain(`"1200,00"`);
  });
  it("refuses an allocation without label or amount", () => {
    expect(allocationCommand.safeParse({ action: "create", sourceKind: "grant", purpose: "equipment", label: "x", amountCents: 0 }).success).toBe(false);
  });
});

describe("attestation PDF", () => {
  it("decodes a transparent PNG into an image with its mask, and writes it", () => {
    const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
    const chunk = (t: string, d: Buffer) => Buffer.concat([Buffer.from([0, 0, 0, d.length]), Buffer.from(t), d, Buffer.alloc(4)]);
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from([0, 1, 2, 3, 128]))), chunk("IEND", Buffer.alloc(0))]);
    const img = pdfImage(new Uint8Array(bytes), "image/png")!;
    expect(img).toMatchObject({ width: 1, height: 1, colors: 3, filter: "FlateDecode" });
    expect(img.alpha).toBeTruthy();
    expect(pdfImage(new Uint8Array([1, 2, 3]), "image/webp")).toBeNull();
    const pdf = Buffer.from(pdfDocument([{ text: "", image: "logo", height: 20 }, { text: "Bonjour" }], "Test", { images: { logo: img }, footer: [{ text: "Pied" }] })).toString("latin1");
    expect(pdf).toContain("/XObject << /Im1");
    expect(pdf).toContain("/SMask");
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
  });
  it("puts the logo, the number, the signatory and the company number in the footer", () => {
    const d = { number: "2026-0007", club: { name: "Club A", address: "Rue 1", companyNumber: "0123.456.789", federation: null, signatory: "Alex Martin", signatoryRole: "Présidente" }, person: { name: "Léa", birthDate: null }, season: { name: "2026-27", from: "2026-07-01", to: "2027-06-30" }, paidCents: 20000, paidOn: "2026-10-01", issuedOn: "2026-11-02", shares: [] };
    const out = attestationLines("nl", d, { logo: true, signature: true });
    expect(out.lines[0]).toMatchObject({ image: "logo" });
    expect(out.lines.some((l) => l.image === "signature")).toBe(true);
    expect(out.lines.map((l) => l.text).join(" ")).toContain("Attest nr. 2026-0007");
    expect(out.footer.map((l) => l.text)).toContain("KBO 0123.456.789");
    expect(attestationLines("fr", d, { logo: false, signature: false }).lines.some((l) => l.image)).toBe(false);
  });
});

describe("finances pages", () => {
  it("never shows a row of finance tabs on dues, grants, sponsors and fundraising (two levels of tabs at most)", () => {
    for (const f of ["grants", "funding-pages", "fundraising", "dues"]) expect(readFileSync(`src/components/${f}.tsx`, "utf8")).not.toContain("<FinanceNav");
    expect(financeNavCopy.fr.sections.reserved).toBe("Fonds réservés");
  });
  it("has the same words in the three languages, never a dash nor the banned words", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    for (const c of [reservedCopy, attestationCopy, goalsCopy, annualCopy] as Record<string, object>[]) {
      expect(keys(c.nl)).toEqual(keys(c.fr));
      expect(keys(c.en)).toEqual(keys(c.fr));
      expect(JSON.stringify(c)).not.toMatch(/[–—]|convoqu|opgeroep|summon|call-up/i);
    }
  });
});
