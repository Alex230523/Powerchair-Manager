import { validCompanyNumber, validNationalNumber } from "./identity";

/**
 * B8: the Belcotax-on-Web file of the 281.71 receipts of one year (one club,
 * one declaration). The layout follows the Belcotax-on-Web brochure of the
 * SPF Finances (envelope Verzendingen › Verzending › Aangiften › Aangifte ›
 * Opgaven, zones v00xx, a10xx, f20xx, r80xx and r90xx, amounts in euro
 * cents). It is versioned by income year: before the first filing of a year,
 * the file is checked against the official XSD of that year with
 * `node scripts/belcotax-validate.mjs` (docs/belcotax/README.md). Pure.
 */
export type Sender = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  /** The club's BCE number, 10 digits. */
  companyNumber: string;
  email: string;
  phone: string;
  contact: string;
  language: "fr" | "nl" | "en";
};
export type Fiche = {
  sequence: number;
  kind: "person" | "company";
  /** 11 digits for a person, 10 for a company; empty when unknown (flagged by the report). */
  identifier: string;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  amountCents: number;
  /** 0 original, 1 correction, 3 cancellation (the same sequence number as the receipt it replaces). */
  treatment: 0 | 1 | 3;
};
/** The layouts known by income year; a new year starts as a copy of the last one and is checked against its XSD. */
export const layouts = {
  2024: { opgave: "Opgave32571", fiche: "Fiche28171", type: "28171", amount: "f71_2060_bedragliberaliteit" },
  2025: { opgave: "Opgave32571", fiche: "Fiche28171", type: "28171", amount: "f71_2060_bedragliberaliteit" },
  2026: { opgave: "Opgave32571", fiche: "Fiche28171", type: "28171", amount: "f71_2060_bedragliberaliteit" },
} as const;
export type LayoutYear = keyof typeof layouts;
export const layoutOf = (year: number) => layouts[(year in layouts ? year : Math.max(...Object.keys(layouts).map(Number))) as LayoutYear];

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // No control characters in XML 1.0 (tab, line feed and carriage return excepted).
    .split("")
    .filter((c) => c.charCodeAt(0) >= 32 || c === "\t" || c === "\n" || c === "\r")
    .join("");
const tag = (name: string, value: string | number) => `<${name}>${esc(String(value))}</${name}>`;
const language = (l: Sender["language"]) => (l === "nl" ? "1" : "2");
/** Belgium is « 00000 » in the Belcotax country codes; another country keeps its ISO code here and is flagged by the check. */
const country = (c: string) => (c === "BE" ? "00000" : c);
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

export function buildBelcotax(year: number, sender: Sender, fiches: Fiche[], createdOn: string) {
  const l = layoutOf(year);
  const total = fiches.reduce((n, f) => n + f.amountCents, 0),
    sequences = fiches.reduce((n, f) => n + f.sequence, 0);
  const lines = fiches.map((f) =>
    [
      `<${l.fiche}>`,
      tag("f2002_inkomstenjaar", year),
      tag("f2005_registratienummer", sender.companyNumber),
      tag("f2008_typefiche", l.type),
      tag("f2009_volgnummer", f.sequence),
      tag("f2011_nationaalnr", f.identifier),
      tag("f2013_naam", f.name),
      tag("f2015_adres", f.street),
      tag("f2016_postcodebelgisch", f.country === "BE" ? f.postalCode : ""),
      tag("f2017_gemeente", f.city),
      tag("f2018_landwoonplaats", country(f.country)),
      tag("f2028_typetraitement", f.treatment),
      tag("f2029_enkelopgave325", 0),
      tag(l.amount, f.amountCents),
      tag("f2059_totaalcontrole", f.amountCents),
      `</${l.fiche}>`,
    ].join(""),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Verzendingen><Verzending>`,
    tag("v0002_inkomstenjaar", year),
    tag("v0010_bestandtype", "BELCOTAX"),
    tag("v0011_aanmaakdatum", ddmmyyyy(createdOn)),
    tag("v0014_naam", sender.name),
    tag("v0015_adres", sender.street),
    tag("v0016_postcode", sender.postalCode),
    tag("v0017_gemeente", sender.city),
    tag("v0018_telefoonnummer", sender.phone),
    tag("v0021_contactpersoon", sender.contact),
    tag("v0022_taalcode", language(sender.language)),
    tag("v0023_emailadres", sender.email),
    tag("v0024_nationaalnr", sender.companyNumber),
    tag("v0025_typeenvoi", 0),
    `<Aangiften><Aangifte>`,
    tag("a1002_inkomstenjaar", year),
    tag("a1005_registratienummer", sender.companyNumber),
    tag("a1011_naamnl1", sender.name),
    tag("a1013_adresnl", sender.street),
    tag("a1014_postcodebelgisch", sender.postalCode),
    tag("a1015_gemeente", sender.city),
    tag("a1016_landwoonplaats", "00000"),
    tag("a1020_taalcode", language(sender.language)),
    `<Opgaven><${l.opgave}>`,
    ...lines,
    `</${l.opgave}></Opgaven>`,
    tag("r8002_inkomstenjaar", year),
    tag("r8005_registratienummer", sender.companyNumber),
    tag("r8010_aantalrecords", fiches.length + 2),
    tag("r8011_controletotaal", sequences),
    tag("r8012_controletotaal", total),
    `</Aangifte></Aangiften>`,
    tag("r9002_inkomstenjaar", year),
    tag("r9010_aantallogbericht", 3),
    tag("r9011_totaalaantalrecords", fiches.length + 4),
    tag("r9012_controletotaal", sequences),
    tag("r9013_controletotaal", total),
    `</Verzending></Verzendingen>`,
    "",
  ].join("\n");
}

export type Issue = { code: "SENDER" | "IDENTIFIER" | "AMOUNT" | "SEQUENCE" | "ADDRESS" | "COUNTRY" | "TOTALS"; sequence?: number };
/**
 * What the platform checks before handing the file over: the sender's BCE
 * number, every fiche's identifier (national or company number with its
 * check digits), amount, address and unique sequence, and the control
 * totals as written in the file.
 */
export function checkBelcotax(year: number, sender: Sender, fiches: Fiche[], xml: string): Issue[] {
  const issues: Issue[] = [];
  if (!validCompanyNumber(sender.companyNumber) || !sender.name.trim() || !sender.postalCode.trim() || !sender.city.trim()) issues.push({ code: "SENDER" });
  const seen = new Set<number>();
  for (const f of fiches) {
    const ok = f.kind === "person" ? validNationalNumber(f.identifier) : validCompanyNumber(f.identifier);
    if (!ok) issues.push({ code: "IDENTIFIER", sequence: f.sequence });
    if (!(f.amountCents > 0)) issues.push({ code: "AMOUNT", sequence: f.sequence });
    if (!f.name.trim() || !f.street.trim() || !f.city.trim() || (f.country === "BE" && !/^\d{4}$/.test(f.postalCode.trim()))) issues.push({ code: "ADDRESS", sequence: f.sequence });
    if (f.country !== "BE") issues.push({ code: "COUNTRY", sequence: f.sequence });
    if (seen.has(f.sequence) || f.sequence < 1) issues.push({ code: "SEQUENCE", sequence: f.sequence });
    seen.add(f.sequence);
  }
  const read = (name: string) => Number(xml.match(new RegExp(`<${name}>(\\d+)</${name}>`))?.[1] ?? NaN);
  const total = fiches.reduce((n, f) => n + f.amountCents, 0);
  if (read("r8012_controletotaal") !== total || read("r9013_controletotaal") !== total || read("r8010_aantalrecords") !== fiches.length + 2 || read("v0002_inkomstenjaar") !== year) issues.push({ code: "TOTALS" });
  return issues;
}
