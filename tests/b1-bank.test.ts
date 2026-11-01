import { describe, it, expect } from "vitest";
import { checkDigits, epcPayload, findReference, formatReference, referenceFor, validReference } from "../src/domains/bank/reference";
import { detectBank, detectFormat, guessColumns, linesFromGrid, parseAmount, parseCamt, parseCoda, usable, type StatementLine } from "../src/domains/bank/parse";
import { spread, suggest, type Candidate } from "../src/domains/bank/match";
import { sampleCamt, sampleCoda, sampleCsv, sampleRows } from "../src/domains/bank/samples";
import { bankCommand } from "../src/domains/bank/schema";
import { bankCopy } from "../src/components/bank-copy";
import { parseCsv, parseXlsx } from "../src/lib/spreadsheet";
import { xlsx } from "../src/lib/xlsx";
import { qrMatrix } from "../src/lib/qr";
import { builtin } from "../src/domains/notifications/templates";

/** B1: structured communications, the EPC QR, statement formats and the suggestions. */
const ogm = (n: number) => formatReference(referenceFor(n));
const lines: StatementLine[] = [
  { bookedOn: "2026-10-02", amountCents: 6250, counterparty: "PEETERS MARIE", counterpartyIban: "BE71096123456769", communication: ogm(1000001), bankRef: "B1-0001" },
  { bookedOn: "2026-10-03", amountCents: 12500, counterparty: "Jan Janssens", counterpartyIban: "BE68539007547034", communication: "Lidgeld Lotte en Wout", bankRef: "B1-0002" },
  { bookedOn: "2026-10-05", amountCents: -8450, counterparty: "Sport Shop", counterpartyIban: "", communication: "Ballons de match", bankRef: "B1-0003" },
];

describe("B1 structured communication", () => {
  it("computes the modulo 97 check, 97 for a multiple of 97", () => {
    expect(checkDigits("0000000097")).toBe("97");
    expect(checkDigits("1234567890")).toBe(String(1234567890 % 97).padStart(2, "0"));
    expect(referenceFor(1000001)).toBe("0001000001" + checkDigits("0001000001"));
    expect(validReference(referenceFor(42))).toBe(true);
    expect(validReference("000000000097")).toBe(false);
    expect(formatReference("123456789002")).toBe("+++123/4567/89002+++");
  });
  it("finds the reference however the bank wrote it, never a wrong one", () => {
    const r = referenceFor(1000123);
    const f = formatReference(r);
    expect(findReference(f)).toBe(r);
    expect(findReference(`Cotisation ${f.replace(/\+/g, "*")} Ana`)).toBe(r);
    expect(findReference(`${r.slice(0, 3)}/${r.slice(3, 7)}/${r.slice(7)}`)).toBe(r);
    expect(findReference(r)).toBe(r);
    const wrong = r.slice(0, 11) + String((Number(r[11]) + 1) % 10);
    expect(findReference(wrong)).toBeNull();
    expect(findReference("Cotisation Ana 2026")).toBeNull();
  });
  it("writes an EPC QR payload that a QR code can carry", () => {
    const text = epcPayload({ name: "Club démo Powerchair", iban: "BE68 5390 0754 7034", bic: "GKCCBEBB", cents: 6250, reference: referenceFor(7) });
    expect(text.split("\n")).toEqual(["BCD", "002", "1", "SCT", "GKCCBEBB", "Club démo Powerchair", "BE68539007547034", "EUR62.50", "", referenceFor(7), ""]);
    expect(qrMatrix(text)).not.toBeNull();
    expect(() => epcPayload({ name: "", iban: "BE68539007547034", cents: 100, reference: referenceFor(7) })).toThrow();
    expect(() => epcPayload({ name: "Club", iban: "BE68539007547034", cents: 0, reference: referenceFor(7) })).toThrow();
  });
});

describe("B1 statements", () => {
  it("reads the amounts of every Belgian habit", () => {
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("-62,50 €")).toBe(-6250);
    expect(parseAmount("62.5")).toBe(6250);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("1.000")).toBe(100000);
    expect(parseAmount("abc")).toBeNull();
  });
  for (const bank of ["belfius", "bnp", "ing", "kbc"] as const)
    it(`reads the CSV and the Excel file of ${bank}`, async () => {
      const grid = parseCsv(sampleCsv(bank, "BE68539007547034", lines));
      expect(detectBank(grid[0])).toBe(bank);
      const map = guessColumns(grid[0]);
      expect(usable(map)).toBe(true);
      const out = linesFromGrid(grid, map);
      expect(out.ignored).toBe(0);
      expect(out.lines.map((l) => [l.bookedOn, l.amountCents, l.bankRef, l.counterpartyIban])).toEqual(lines.map((l) => [l.bookedOn, l.amountCents, l.bankRef, l.counterpartyIban]));
      expect(out.lines.map((l) => findReference(l.communication))).toEqual([referenceFor(1000001), null, null]);
      if (bank !== "ing") expect(out.lines.map((l) => l.counterparty)).toEqual(lines.map((l) => l.counterparty));
      const book = xlsx(sampleRows(bank, "BE68539007547034", lines));
      const fromExcel = linesFromGrid(await parseXlsx(book.buffer.slice(book.byteOffset, book.byteOffset + book.byteLength) as ArrayBuffer), map);
      expect(fromExcel.lines.map((l) => [l.bookedOn, l.amountCents])).toEqual(lines.map((l) => [l.bookedOn, l.amountCents]));
    });
  it("reads CODA and camt.053 with their structured communication", () => {
    for (const out of [parseCoda(sampleCoda("BE68539007547034", lines)), parseCamt(sampleCamt("BE68539007547034", lines))]) {
      expect(out.ignored).toBe(0);
      expect(out.lines.map((l) => [l.bookedOn, l.amountCents, l.counterparty, l.counterpartyIban, l.bankRef])).toEqual(lines.map((l) => [l.bookedOn, l.amountCents, l.counterparty, l.counterpartyIban, l.bankRef]));
      expect(findReference(out.lines[0].communication)).toBe(referenceFor(1000001));
      expect(out.lines[1].communication).toBe("Lidgeld Lotte en Wout");
    }
    expect(detectFormat("releve.cod", sampleCoda("BE68539007547034", lines))).toBe("coda");
    expect(detectFormat("releve.xml", sampleCamt("BE68539007547034", lines))).toBe("camt");
    expect(detectFormat("export.csv", "Datum;Bedrag")).toBe("csv");
    expect(detectFormat("export.xlsx", "PK")).toBe("xlsx");
  });
  it("leaves aside a line without date or amount", () => {
    const grid = parseCsv("Date;Montant;Communication\n02/10/2026;62,50;ok\n;10,00;sans date\n03/10/2026;;sans montant\n");
    expect(linesFromGrid(grid, guessColumns(grid[0]))).toMatchObject({ ignored: 2, lines: [{ bookedOn: "2026-10-02", amountCents: 6250 }] });
  });
});

describe("B1 suggestions", () => {
  const candidates: Candidate[] = [
    { id: "ana", person: "Ana Peeters", family: ["Marie Peeters"], remaining: 18750, installments: [6250, 6250, 6250], reference: referenceFor(1), references: [referenceFor(2)] },
    { id: "bilal", person: "Bilal Haddad", family: ["Karim Haddad"], remaining: 6250, installments: [6250], reference: referenceFor(3), references: [] },
    { id: "paid", person: "Chloé Peeters", family: [], remaining: 0, installments: [], reference: referenceFor(4), references: [] },
  ];
  it("ranks the reference first, then the amount and the family's name", () => {
    expect(suggest({ amountCents: 6250, counterparty: "X", communication: "", reference: referenceFor(2) }, candidates)[0]).toMatchObject({ id: "ana", reasons: ["reference", "amount"] });
    const byName = suggest({ amountCents: 10000, counterparty: "M. PEETERS", communication: "", reference: null }, candidates);
    expect(byName.map((s) => s.id)).toEqual(["ana"]);
    expect(byName[0].reasons).toEqual(["name"]);
    const both = suggest({ amountCents: 6250, counterparty: "Karim Haddad", communication: "", reference: null }, candidates);
    expect(both[0]).toMatchObject({ id: "bilal", reasons: ["amount", "name"] });
    expect(suggest({ amountCents: -500, counterparty: "Ana Peeters", communication: "", reference: null }, candidates)).toEqual([]);
  });
  it("splits a payment in order and keeps the rest as a credit", () => {
    expect(spread(30000, [{ id: "a", remaining: 18750 }, { id: "b", remaining: 6250 }])).toEqual({ parts: [{ id: "a", amount: 18750 }, { id: "b", amount: 6250 }], credit: 5000 });
    expect(spread(5000, [{ id: "a", remaining: 18750 }])).toEqual({ parts: [{ id: "a", amount: 5000 }], credit: 0 });
  });
});

describe("B1 commands and texts", () => {
  it("refuses a cancellation without a real reason and a statement too long", () => {
    expect(() => bankCommand.parse({ action: "cancelAllocation", id: crypto.randomUUID(), reason: "x" })).toThrow();
    const one = { bookedOn: "2026-10-02", amountCents: 100 };
    expect(() => bankCommand.parse({ action: "import", format: "csv", lines: Array(5001).fill(one) })).toThrow();
    expect(() => bankCommand.parse({ action: "import", format: "csv", lines: [{ ...one, amountCents: 0 }] })).toThrow();
  });
  it("has every text in three languages, without dashes in the French", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(bankCopy.nl)).toEqual(keys(bankCopy.fr));
    expect(keys(bankCopy.en)).toEqual(keys(bankCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) {
      expect(JSON.stringify(bankCopy[l])).not.toMatch(/[–—]/);
      expect(builtin.dues_issued[l].body).toContain("{iban}");
      expect(builtin.dues_issued[l].body).toContain("{reference}");
    }
    expect(bankCopy.fr.qrWarning).toMatch(/ne confirme pas le paiement/);
  });
});
