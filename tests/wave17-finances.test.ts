import { describe, it, expect } from "vitest";
import { commandSchema, csvClosingBalance, statementType } from "../src/domains/finance/schema";
import { financeNavCopy, financeSections } from "../src/components/finance-nav-copy";
import { financeSectionsCopy } from "../src/components/finance-sections-copy";
import { shellCopy } from "../src/components/shell-copy";
import { originHref } from "../src/domains/storage/service";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}

/** Wave 17 (N1): finances restructured. */
describe("wave 17, N1: finances", () => {
  it("names the menu « Finances » in the three languages", () => {
    expect([shellCopy.fr.groupMoney, shellCopy.nl.groupMoney, shellCopy.en.groupMoney]).toEqual(["Finances", "Financiën", "Finances"]);
    expect([shellCopy.fr.groupFinance, shellCopy.nl.groupFinance, shellCopy.en.groupFinance]).toEqual(["Finances", "Financiën", "Finances"]);
    expect(JSON.stringify(shellCopy)).not.toContain("Argent");
  });
  it("orders the tabs as the review asks", () => {
    // « tax » (B8) last, shown only to a club approved for tax receipts.
    expect(financeSections).toEqual(["overview", "operations", "budget", "reserved", "affiliations", "statements", "accounts", "tax"]);
    expect(shape(financeNavCopy.nl)).toEqual(shape(financeNavCopy.fr));
    expect(shape(financeSectionsCopy.en)).toEqual(shape(financeSectionsCopy.fr));
    for (const t of [financeNavCopy, financeSectionsCopy]) expect(JSON.stringify(t)).not.toMatch(/[–—]/);
  });
  it("asks a reason to delete an operation", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(commandSchema.safeParse({ action: "delete", id, reason: "" }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "delete", id, reason: "Doublon" }).success).toBe(true);
  });
  it("reads the closing balance of a CSV statement", () => {
    expect(csvClosingBalance("Date;Montant;Solde\n01/10;10,00;1.200,00\n15/10;-5,50;1.194,50\n")).toBe(119450);
    expect(csvClosingBalance("date,amount,balance\n2026-10-01,10.00,1200.00\n2026-10-02,1.5,1201.50\n")).toBe(120150);
    expect(csvClosingBalance("Datum;Bedrag;Saldo\n1/10;3;-42,10\n")).toBe(-4210);
    expect(csvClosingBalance("Date;Montant\n1/10;3\n")).toBeNull();
    expect(statementType(new TextEncoder().encode("%PDF-1.7"), "x.pdf")).toBe("application/pdf");
    expect(statementType(new TextEncoder().encode("a;b"), "x.csv")).toBe("text/csv");
    expect(statementType(new Uint8Array([137, 80, 78, 71]), "x.png")).toBeNull();
  });
  it("sends the biggest files to their new tab", () => {
    expect(originHref("receipt", "x")).toBe("/funding/operations");
    expect(originHref("statement", "x")).toBe("/funding/statements");
  });
});
