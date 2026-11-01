import { describe, it, expect } from "vitest";
import { typedXlsx, serialDate, xlsx } from "../src/lib/xlsx";
import { exportFileName, exportInput } from "../src/domains/exports/schema";
import { columnTypes } from "../src/domains/people/export";
import { exportCopy } from "../src/components/export-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
/** The parts are stored without compression: the sheet's XML is readable in the bytes. */
const sheetOf = (bytes: Uint8Array) => {
  const text = new TextDecoder().decode(bytes);
  const start = text.indexOf("<worksheet");
  return text.slice(start, text.indexOf("</worksheet>", start) + 12);
};
const stylesOf = (bytes: Uint8Array) => {
  const text = new TextDecoder().decode(bytes);
  return text.slice(text.indexOf("<styleSheet"), text.indexOf("</styleSheet>") + 13);
};

/** Wave 17 (G2): exports everywhere. */
describe("wave 17, G2: Excel exports", () => {
  it("writes amounts as numbers with two decimals, dates as dates, a bold frozen header", () => {
    const bytes = typedXlsx(
      [
        { header: "Joueur", type: "text" },
        { header: "Montant", type: "money" },
        { header: "Échéance", type: "date" },
        { header: "Versements", type: "number" },
      ],
      [
        ["Ana", 250.5, "2026-10-01", 4],
        ["=HYPERLINK(1)", null, "", 0],
      ],
      "Cotisations",
    );
    const sheet = sheetOf(bytes);
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Joueur</t></is></c>');
    expect(sheet).toContain('<c r="B2" s="2"><v>250.5</v></c>');
    expect(sheet).toContain(`<c r="C2" s="3"><v>${serialDate("2026-10-01")}</v></c>`);
    expect(sheet).toContain('<c r="D2" s="4"><v>4</v></c>');
    // Text is never a formula; empty cells stay empty.
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(1)</t></is></c>');
    expect(sheet).toContain('<c r="B3"/>');
    expect(stylesOf(bytes)).toContain('<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>');
    expect(stylesOf(bytes)).toContain('<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>');
    expect(serialDate("1900-03-01")).toBe(61);
    expect(serialDate("2026-10-22")).toBe(46317);
  });
  it("keeps the earlier all-text writer for the older exports", () => {
    expect(sheetOf(xlsx([["Nom"], ["Ana"]]))).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Ana</t></is></c>');
  });
  it("names the file after the club, the subject and the season", () => {
    expect(exportFileName("TigerStorm", "Cotisations", "2026-27", "xlsx")).toBe("tigerstorm-cotisations-2026-27.xlsx");
    expect(exportFileName("Club Élan", "Présences", "", "csv")).toBe("club-elan-presences.csv");
  });
  it("accepts only known lists, typed columns and bounded rows", () => {
    const base = { dataset: "dues", format: "xlsx", subject: "Cotisations", columns: [{ header: "Nom", type: "text" }], rows: [["Ana"]] };
    expect(exportInput.safeParse(base).success).toBe(true);
    expect(exportInput.safeParse({ ...base, dataset: "health" }).success).toBe(false);
    expect(exportInput.safeParse({ ...base, columns: [{ header: "Nom", type: "formula" }] }).success).toBe(false);
    expect(exportInput.safeParse({ ...base, format: "pdf" }).success).toBe(false);
  });
  it("types the people export's dates and numbers", () => {
    expect(columnTypes).toMatchObject({ birth_date: "date", joined_on: "date", age: "number", jersey: "number", name: "text" });
  });
  it("has every text in the three languages, without long dashes", () => {
    expect(shape(exportCopy.nl)).toEqual(shape(exportCopy.fr));
    expect(shape(exportCopy.en)).toEqual(shape(exportCopy.fr));
    expect(JSON.stringify(exportCopy)).not.toMatch(/[–—]/);
  });
});
