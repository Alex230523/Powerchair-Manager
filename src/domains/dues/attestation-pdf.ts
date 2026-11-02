import { pdfDocument, type PdfImage, type PdfLine } from "../../lib/pdf";
import type { Locale } from "../../lib/locale";

/**
 * 9, part 2: the mutual insurance attestation as a PDF. The club's logo on
 * top, the member, the season and its period, the amount paid and the date
 * of the full payment, the signature and the signatory's name and role; in
 * the footer the legal name, address, company number (BCE) and the logo.
 * A unique number. Pure: the images come decoded.
 */
export type AttestationData = {
  number: string;
  club: { name: string; address: string; companyNumber: string; federation: string | null; signatory: string; signatoryRole: string };
  person: { name: string; birthDate: string | null };
  season: { name: string; from: string; to: string };
  paidCents: number;
  paidOn: string | null;
  issuedOn: string;
  shares: { name: string; percent: number; cents: number }[];
};
const words = {
  fr: {
    title: "Attestation d'affiliation à un club sportif",
    number: "Attestation n° {n}",
    body: "Le club {club}{address}{company}{federation} certifie que {name}{born} est membre du club pour la saison {season} (du {from} au {to}) et a payé une cotisation de {amount}{paid}.",
    born: ", né(e) le {d},",
    company: ", numéro d'entreprise (BCE) {n}",
    federation: ", affilié à la {f},",
    paid: ", entièrement payée le {d}",
    share: "{name} : {percent} %, soit {amount}",
    done: "Fait le {d}.",
    for: "Pour le club",
    stamp: "À joindre au formulaire de remboursement de votre mutuelle.",
    bce: "BCE {n}",
  },
  nl: {
    title: "Attest van aansluiting bij een sportclub",
    number: "Attest nr. {n}",
    body: "De club {club}{address}{company}{federation} verklaart dat {name}{born} lid is van de club voor het seizoen {season} (van {from} tot {to}) en een bijdrage van {amount} betaald heeft{paid}.",
    born: ", geboren op {d},",
    company: ", ondernemingsnummer (KBO) {n}",
    federation: ", aangesloten bij de {f},",
    paid: ", volledig betaald op {d}",
    share: "{name}: {percent} %, of {amount}",
    done: "Opgemaakt op {d}.",
    for: "Voor de club",
    stamp: "Voeg dit bij het terugbetalingsformulier van uw ziekenfonds.",
    bce: "KBO {n}",
  },
  en: {
    title: "Certificate of membership of a sports club",
    number: "Certificate no. {n}",
    body: "The club {club}{address}{company}{federation} certifies that {name}{born} is a member of the club for the season {season} (from {from} to {to}) and paid a membership fee of {amount}{paid}.",
    born: ", born on {d},",
    company: ", company number (BCE) {n}",
    federation: ", affiliated to the {f},",
    paid: ", paid in full on {d}",
    share: "{name}: {percent} %, that is {amount}",
    done: "Issued on {d}.",
    for: "For the club",
    stamp: "Attach it to your mutual insurance's refund form.",
    bce: "BCE {n}",
  },
} satisfies Record<Locale, Record<string, string>>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function attestationLines(locale: Locale, d: AttestationData, has: { logo: boolean; signature: boolean }) {
  const w = words[locale];
  const day = (x: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(x + "T12:00:00Z"));
  // A narrow no-break space in amounts would print as « ? » in the PDF fonts: plain spaces.
  const money = (c: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(c / 100).replace(/[  ]/g, " ");
  const lines: PdfLine[] = [];
  if (has.logo) lines.push({ text: "", image: "logo", height: 56 });
  lines.push({ text: d.club.name, bold: true, size: 12, gap: has.logo ? 8 : 0 });
  lines.push({ text: w.title, bold: true, size: 16, gap: 18 });
  lines.push({ text: fill(w.number, { n: d.number }), size: 10, gap: 4 });
  lines.push({
    text: fill(w.body, {
      club: d.club.name,
      address: d.club.address ? `, ${d.club.address}` : "",
      company: d.club.companyNumber ? fill(w.company, { n: d.club.companyNumber }) : "",
      federation: d.club.federation ? fill(w.federation, { f: d.club.federation }) : "",
      name: d.person.name,
      born: d.person.birthDate ? fill(w.born, { d: day(d.person.birthDate) }) : "",
      season: d.season.name,
      from: day(d.season.from),
      to: day(d.season.to),
      amount: money(d.paidCents),
      paid: d.paidOn ? fill(w.paid, { d: day(d.paidOn) }) : "",
    }),
    gap: 18,
  });
  for (const s of d.shares) lines.push({ text: fill(w.share, { name: s.name, percent: s.percent, amount: money(s.cents) }), indent: 14, gap: 4 });
  lines.push({ text: fill(w.done, { d: day(d.issuedOn) }), gap: 18 });
  lines.push({ text: w.for, gap: 18 });
  if (has.signature) lines.push({ text: "", image: "signature", height: 48, gap: 4 });
  if (d.club.signatory) lines.push({ text: d.club.signatory, bold: true, gap: has.signature ? 4 : 30 });
  if (d.club.signatoryRole) lines.push({ text: d.club.signatoryRole });
  lines.push({ text: w.stamp, size: 9, gap: 24 });
  const footer: PdfLine[] = [
    ...(has.logo ? [{ text: "", image: "logo", height: 20 }] : []),
    { text: d.club.name, bold: true, size: 8 },
    ...(d.club.address ? [{ text: d.club.address, size: 8 }] : []),
    ...(d.club.companyNumber ? [{ text: fill(w.bce, { n: d.club.companyNumber }), size: 8 }] : []),
  ];
  return { lines, footer, title: `${w.title} ${d.number}` };
}

export function attestationPdf(locale: Locale, d: AttestationData, images: { logo: PdfImage | null; signature: PdfImage | null }) {
  const { lines, footer, title } = attestationLines(locale, d, { logo: !!images.logo, signature: !!images.signature });
  return pdfDocument(lines, title, {
    images: { ...(images.logo ? { logo: images.logo } : {}), ...(images.signature ? { signature: images.signature } : {}) },
    footer,
  });
}
