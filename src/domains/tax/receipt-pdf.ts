import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { formatCompanyNumber } from "./identity";

/**
 * B8: the 281.71 receipt as a PDF, from the snapshot written when it was
 * issued (the club and the donor as they were). The national number is
 * never printed in full here: only its last two digits. Pure.
 */
export type ReceiptSnapshot = {
  club: { name: string; address: string; companyNumber: string; approvalNumber: string; approvalFrom: string; approvalTo: string; signatory: string };
  donor: { kind: "person" | "company"; name: string; street: string; postalCode: string; city: string; country: string; identifier: string };
};
export type ReceiptPrint = { year: number; sequence: number; amountCents: number; issuedOn: string; status: "issued" | "corrected" | "cancelled"; correction: boolean; snapshot: ReceiptSnapshot };

const words = {
  fr: {
    title: "Attestation de libéralités · Formulaire 281.71",
    year: "Année des libéralités : {year}",
    number: "Numéro d'attestation : {year}/{n}",
    correction: "Attestation rectificative : elle remplace l'attestation portant le même numéro.",
    cancelled: "Attestation annulée.",
    institution: "Institution bénéficiaire agréée",
    company: "Numéro d'entreprise (BCE) : {n}",
    approval: "Agrément SPF Finances n° {n}, du {from} au {to}",
    donor: "Donateur",
    identifier: { person: "Numéro de registre national : se terminant par {n}", company: "Numéro d'entreprise (BCE) : {n}" },
    amount: "Montant total des libéralités reçues en {year} : {amount}",
    statement:
      "L'institution soussignée certifie avoir reçu, à titre de don, sans aucune contrepartie directe ou indirecte pour le donateur, la somme indiquée ci-dessus, versée en argent pendant l'année mentionnée. Cette attestation est transmise à l'administration fiscale via Belcotax-on-Web.",
    done: "Fait le {date}",
    signatory: "Pour l'institution : {name}",
  },
  nl: {
    title: "Kwitantie voor giften · Formulier 281.71",
    year: "Jaar van de giften: {year}",
    number: "Nummer van de kwitantie: {year}/{n}",
    correction: "Verbeterde kwitantie: ze vervangt de kwitantie met hetzelfde nummer.",
    cancelled: "Geannuleerde kwitantie.",
    institution: "Erkende begunstigde instelling",
    company: "Ondernemingsnummer (KBO): {n}",
    approval: "Erkenning FOD Financiën nr. {n}, van {from} tot {to}",
    donor: "Schenker",
    identifier: { person: "Rijksregisternummer: eindigend op {n}", company: "Ondernemingsnummer (KBO): {n}" },
    amount: "Totaal bedrag van de giften ontvangen in {year}: {amount}",
    statement:
      "De ondergetekende instelling verklaart het hierboven vermelde bedrag ontvangen te hebben als gift, zonder enige rechtstreekse of onrechtstreekse tegenprestatie voor de schenker, in geld gestort tijdens het vermelde jaar. Deze kwitantie wordt via Belcotax-on-Web aan de belastingadministratie bezorgd.",
    done: "Opgemaakt op {date}",
    signatory: "Voor de instelling: {name}",
  },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function receiptPdf(r: ReceiptPrint, locale: "fr" | "nl" | "en") {
  // The receipt is an official paper: French or Dutch (English readers get the French one).
  const w = words[locale === "nl" ? "nl" : "fr"];
  const tag = locale === "nl" ? "nl-BE" : "fr-BE";
  const money = new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(r.amountCents / 100);
  const day = (d: string) => (d ? new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z")) : "");
  const { club, donor } = r.snapshot;
  const lines: PdfLine[] = [
    { text: w.title, size: 16, bold: true },
    { text: fill(w.year, { year: r.year }), gap: 6 },
    { text: fill(w.number, { year: r.year, n: r.sequence }) },
    ...(r.correction ? [{ text: w.correction, bold: true }] : []),
    ...(r.status === "cancelled" ? [{ text: w.cancelled, bold: true }] : []),
    { text: w.institution, bold: true, gap: 14 },
    { text: club.name },
    { text: club.address },
    { text: fill(w.company, { n: club.companyNumber ? formatCompanyNumber(club.companyNumber) : "" }) },
    { text: fill(w.approval, { n: club.approvalNumber, from: day(club.approvalFrom), to: day(club.approvalTo) }) },
    { text: w.donor, bold: true, gap: 14 },
    { text: donor.name },
    { text: donor.street },
    { text: `${donor.postalCode} ${donor.city}${donor.country !== "BE" ? ` (${donor.country})` : ""}`.trim() },
    ...(donor.identifier ? [{ text: fill(w.identifier[donor.kind], { n: donor.kind === "company" ? formatCompanyNumber(donor.identifier) : donor.identifier }) }] : []),
    { text: fill(w.amount, { year: r.year, amount: money }), bold: true, size: 12, gap: 14 },
    { text: w.statement, size: 10, gap: 10 },
    { text: fill(w.done, { date: day(r.issuedOn) }), gap: 18 },
    { text: fill(w.signatory, { name: club.signatory || club.name }) },
  ];
  return pdfDocument(lines, `${w.title} ${r.year}/${r.sequence}`);
}
