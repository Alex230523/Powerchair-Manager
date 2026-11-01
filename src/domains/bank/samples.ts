import type { Bank, StatementLine } from "./parse";

/**
 * B1: statements written the way each bank writes them, for the demo and
 * the tests: the CSV of Belfius, BNP Paribas Fortis, ING and KBC, CODA
 * (Febelfin, 128 characters a record) and camt.053 (ISO 20022). Pure.
 */
const eu = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const amount = (cents: number) => (cents < 0 ? "-" : "") + `${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, "0")}`;
const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const row = (cells: string[]) => cells.map(cell).join(";");
/** The structured communication's twelve digits, when the line carries one written as +++…+++. */
const structured = (s: string) => s.match(/^\+\+\+(\d{3})\/(\d{4})\/(\d{5})\+\+\+$/)?.slice(1).join("") ?? null;

/** The rows of a bank's CSV (and of its Excel export): headers first. */
export function sampleRows(bank: Exclude<Bank, "other">, account: string, lines: StatementLine[]): string[][] {
  if (bank === "belfius")
    return [
      ["Compte", "Date de comptabilisation", "Numéro d'extrait", "Numéro de transaction", "Compte contrepartie", "Nom contrepartie contient", "Rue et numéro", "Code postal et localité", "Transaction", "Date valeur", "Montant", "Devise", "BIC", "Code pays", "Communications"],
      ...lines.map((l) => [account, eu(l.bookedOn), "1", l.bankRef, l.counterpartyIban, l.counterparty, "", "", l.amountCents > 0 ? "Virement en euros" : "Paiement", eu(l.bookedOn), amount(l.amountCents), "EUR", "", "BE", l.communication]),
    ];
  if (bank === "bnp")
    return [
      ["Numéro de séquence", "Date d'exécution", "Date valeur", "Montant", "Devise du compte", "Numéro de compte", "Type de transaction", "Contrepartie", "Nom de la contrepartie", "Communication", "Détails", "Statut", "Motif du refus"],
      ...lines.map((l) => [l.bankRef, eu(l.bookedOn), eu(l.bookedOn), amount(l.amountCents), "EUR", account, l.amountCents > 0 ? "Virement en euros" : "Paiement par carte", l.counterpartyIban, l.counterparty, l.communication, "", "Accepté", ""]),
    ];
  if (bank === "ing")
    return [
      ["Numéro de compte", "Nom du compte", "Compte partie adverse", "Numéro de mouvement", "Date comptable", "Date valeur", "Montant", "Devise", "Libellés", "Détails du mouvement", "Message"],
      ...lines.map((l) => [account, "Club", l.counterpartyIban, l.bankRef, eu(l.bookedOn), eu(l.bookedOn), amount(l.amountCents), "EUR", "", "", l.communication]),
    ];
  return [
    ["Rekeningnummer", "Rubrieknaam", "Naam", "Munt", "Afschriftnummer", "Datum", "Omschrijving", "Valuta", "Bedrag", "Saldo", "credit", "debet", "rekeningnummer tegenpartij", "BIC tegenpartij", "Naam tegenpartij", "Adres tegenpartij", "gestructureerde mededeling", "Vrije mededeling", "Transactienummer"],
    ...lines.map((l) => {
      const ogm = structured(l.communication);
      return [account, "Zichtrekening", "Club", "EUR", "1", eu(l.bookedOn), "", eu(l.bookedOn), amount(l.amountCents), "", l.amountCents > 0 ? amount(l.amountCents) : "", l.amountCents < 0 ? amount(-l.amountCents) : "", l.counterpartyIban, "", l.counterparty, "", ogm ?? "", ogm ? "" : l.communication, l.bankRef];
    }),
  ];
}
export const sampleCsv = (bank: Exclude<Bank, "other">, account: string, lines: StatementLine[]) => sampleRows(bank, account, lines).map(row).join("\r\n") + "\r\n";

/** CODA: header, old balance, a 2.1 / 2.2 / 2.3 group per movement, new balance, trailer. */
export function sampleCoda(account: string, lines: StatementLine[]) {
  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n, " ");
  const num = (n: number, width: number) => String(n).padStart(width, "0");
  const ddmmyy = (iso: string) => iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(2, 4);
  const today = lines[0]?.bookedOn ?? "2026-01-01";
  const out = [pad("0000002" + ddmmyy(today) + "725" + "05" + " " + pad("", 10) + pad("CLUB", 26) + pad("GKCCBEBB", 11) + "00000000000" + " " + "00000" + pad("", 16) + pad("", 16) + pad("", 7) + "2", 128)];
  out.push(pad("12001" + "3" + pad(account, 37) + "0" + num(0, 15) + ddmmyy(today) + pad("CLUB", 26) + pad("Compte courant", 35) + "001", 128));
  lines.forEach((l, i) => {
    const seq = num(i + 1, 4);
    const ogm = structured(l.communication);
    const comm = ogm ? "1" + "101" + ogm + pad("", 38) : "0" + pad(l.communication.slice(0, 53), 53);
    out.push(pad("21" + seq + "0000" + pad(l.bankRef, 21) + (l.amountCents < 0 ? "1" : "0") + num(Math.abs(l.amountCents) * 10, 15) + ddmmyy(l.bookedOn) + "00150000" + comm + ddmmyy(l.bookedOn) + "001" + "0" + "1" + " " + "0", 128));
    const rest = ogm ? "" : l.communication.slice(53);
    out.push(pad("22" + seq + "0000" + pad(rest.slice(0, 53), 53) + pad("", 35) + pad("", 11) + pad("", 4) + "1" + " " + "0", 128));
    out.push(pad("23" + seq + "0000" + pad(l.counterpartyIban, 37) + pad(l.counterparty, 35) + pad("", 43) + "0" + " " + "0", 128));
  });
  out.push(pad("8001" + pad(account, 37) + "0" + num(0, 15) + ddmmyy(today), 128));
  out.push(pad("9" + pad("", 15) + num(out.length - 1, 6) + num(0, 15) + num(0, 15) + pad("", 75) + "2", 128));
  return out.join("\r\n") + "\r\n";
}

/** camt.053.001.02: one <Ntry> per movement, the counterparty on the other side. */
export function sampleCamt(iban: string, lines: StatementLine[]) {
  const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const entries = lines.map((l) => {
    const credit = l.amountCents > 0;
    const side = credit ? "Dbtr" : "Cdtr";
    const ogm = structured(l.communication);
    const remittance = ogm
      ? `<Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry><Issr>BBA</Issr></Tp><Ref>${ogm}</Ref></CdtrRefInf></Strd>`
      : `<Ustrd>${x(l.communication)}</Ustrd>`;
    return `<Ntry><NtryRef>${x(l.bankRef)}</NtryRef><Amt Ccy="EUR">${(Math.abs(l.amountCents) / 100).toFixed(2)}</Amt><CdtDbtInd>${credit ? "CRDT" : "DBIT"}</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>${l.bookedOn}</Dt></BookgDt><ValDt><Dt>${l.bookedOn}</Dt></ValDt><AcctSvcrRef>${x(l.bankRef)}</AcctSvcrRef><NtryDtls><TxDtls><RltdPties><${side}><Nm>${x(l.counterparty)}</Nm></${side}>${l.counterpartyIban ? `<${side}Acct><Id><IBAN>${l.counterpartyIban}</IBAN></Id></${side}Acct>` : ""}</RltdPties><RmtInf>${remittance}</RmtInf></TxDtls></NtryDtls></Ntry>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>DEMO</MsgId><CreDtTm>${lines[0]?.bookedOn ?? "2026-01-01"}T08:00:00</CreDtTm></GrpHdr><Stmt><Id>1</Id><Acct><Id><IBAN>${iban}</IBAN></Id></Acct>${entries.join("")}</Stmt></BkToCstmrStmt></Document>\n`;
}
