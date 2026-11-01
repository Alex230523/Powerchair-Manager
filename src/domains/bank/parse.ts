import { toIsoDate, type Grid } from "../../lib/spreadsheet";

/**
 * B1: bank statements read into plain lines, in the browser (the file does
 * not leave the device before the preview) and in tests. CSV and XLSX of
 * the Belgian banks (Belfius, BNP Paribas Fortis, ING, KBC, or any other
 * with a column map the club chooses once), CODA and camt.053. Pure.
 */
export type StatementLine = {
  bookedOn: string;
  /** Positive: money in; negative: money out. */
  amountCents: number;
  counterparty: string;
  counterpartyIban: string;
  communication: string;
  bankRef: string;
};
export const banks = ["belfius", "bnp", "ing", "kbc", "other"] as const;
export type Bank = (typeof banks)[number];
export type ColumnMap = { date: number; amount: number; credit: number; debit: number; counterparty: number; counterpartyIban: number; communication: number[]; bankRef: number };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
/** The headers each Belgian bank writes, in French and Dutch (folded). */
const synonyms: Record<Exclude<keyof ColumnMap, "communication">, string[]> & { communication: string[] } = {
  date: ["boekingsdatum", "datecomptable", "datedecomptabilisation", "datedexecution", "dateexecution", "uitvoeringsdatum", "datum", "date", "bookingdate"],
  amount: ["bedrag", "montant", "amount"],
  credit: ["credit"],
  debit: ["debet", "debit"],
  counterparty: ["naamtegenpartij", "naamtegenpartijbevat", "nomdelacontrepartie", "nomcontrepartiecontient", "nomcontrepartie", "naamvandetegenpartij", "counterpartyname"],
  counterpartyIban: ["rekeningnummertegenpartij", "rekeningtegenpartij", "comptecontrepartie", "comptepartieadverse", "contrepartie", "counterpartyaccount", "ibantegenpartij"],
  communication: ["gestructureerdemededeling", "vrijemededeling", "mededelingen", "mededeling", "communications", "communication", "message", "libelles", "detailsdumouvement", "omschrijving", "details", "description"],
  bankRef: ["transactienummer", "numerodetransaction", "numerodemouvement", "numerodesequence", "volgnummer", "reference"],
};
/** The bank, from a header only it writes. */
export function detectBank(headers: string[]): Bank {
  const h = new Set(headers.map(fold));
  if (h.has("rubrieknaam") || h.has("gestructureerdemededeling")) return "kbc";
  if (h.has("naamtegenpartijbevat") || h.has("nomcontrepartiecontient")) return "belfius";
  if (h.has("comptepartieadverse") || h.has("numerodemouvement") || h.has("rekeningtegenpartij") && h.has("omschrijving") && h.has("valutadatum")) return "ing";
  if (h.has("numerodesequence") || h.has("nomdelacontrepartie")) return "bnp";
  return "other";
}
/** Each field's column, from the headers (−1 when absent). */
export function guessColumns(headers: string[]): ColumnMap {
  const h = headers.map(fold);
  const find = (names: string[]) => {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    date: find(synonyms.date),
    amount: find(synonyms.amount),
    credit: find(synonyms.credit),
    debit: find(synonyms.debit),
    counterparty: find(synonyms.counterparty),
    counterpartyIban: find(synonyms.counterpartyIban),
    communication: synonyms.communication.map((n) => h.indexOf(n)).filter((i, k, all) => i >= 0 && all.indexOf(i) === k),
    bankRef: find(synonyms.bankRef),
  };
}
export const usable = (m: ColumnMap) => m.date >= 0 && (m.amount >= 0 || m.credit >= 0 || m.debit >= 0);

/** « 1.234,56 », « -62,50 € », « 62.5 », « 1,234.56 » to cents; null when unreadable. */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? "").replace(/[\s €]|EUR/gi, "");
  if (!s) return null;
  const negative = /^-|-$|^\(.*\)$/.test(s);
  s = s.replace(/[-+()]/g, "");
  const comma = s.lastIndexOf(","),
    dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (comma >= 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}
const clean = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const ibanOf = (s: string | undefined) => {
  const v = (s ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(v) ? v : "";
};

/** A CSV or XLSX grid (first row = headers) with its column map. */
export function linesFromGrid(grid: Grid, map: ColumnMap): { lines: StatementLine[]; ignored: number } {
  const lines: StatementLine[] = [];
  let ignored = 0;
  for (const row of grid.slice(1)) {
    if (!row.some((c) => c.trim())) continue;
    const date = map.date >= 0 ? toIsoDate(row[map.date] ?? "") : null;
    let cents = map.amount >= 0 ? parseAmount(row[map.amount] ?? "") : null;
    if (cents === null && (map.credit >= 0 || map.debit >= 0)) {
      const c = map.credit >= 0 ? parseAmount(row[map.credit] ?? "") : null,
        d = map.debit >= 0 ? parseAmount(row[map.debit] ?? "") : null;
      cents = c ? Math.abs(c) : d ? -Math.abs(d) : null;
    }
    if (!date || cents === null || cents === 0) {
      ignored++;
      continue;
    }
    lines.push({
      bookedOn: date,
      amountCents: cents,
      counterparty: clean(map.counterparty >= 0 ? row[map.counterparty] : "", 160),
      counterpartyIban: ibanOf(map.counterpartyIban >= 0 ? row[map.counterpartyIban] : ""),
      communication: clean(map.communication.map((i) => row[i] ?? "").filter(Boolean).join(" "), 400),
      bankRef: clean(map.bankRef >= 0 ? row[map.bankRef] : "", 80),
    });
  }
  return { lines, ignored };
}

/* ---------------------------------------------------------------- CODA */
const codaDate = (d: string) => (/^\d{6}$/.test(d) ? `20${d.slice(4, 6)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : "");
/**
 * CODA (Febelfin): record 2.1 carries the amount, the dates and the
 * communication (structured when flagged « 1 » with type 101), 2.2 and 2.3
 * continue it, 2.3 names the counterparty and its account.
 */
export function parseCoda(text: string): { lines: StatementLine[]; ignored: number } {
  const lines: StatementLine[] = [];
  let ignored = 0;
  let current: (StatementLine & { seq: string }) | null = null;
  const push = () => {
    if (current) {
      const { seq: _s, ...l } = current;
      void _s;
      if (l.bookedOn && l.amountCents) lines.push({ ...l, communication: clean(l.communication, 400) });
      else ignored++;
    }
    current = null;
  };
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const r = raw.padEnd(128, " ");
    if (r.startsWith("21")) {
      const seq = r.slice(2, 6);
      // A detail line (detail number ≠ 0000) belongs to the movement before it.
      if (r.slice(6, 10) !== "0000" && current) continue;
      push();
      const sign = r[31] === "1" ? -1 : 1;
      const cents = Math.round(Number(r.slice(32, 47)) / 10);
      const structured = r[61] === "1" && r.slice(62, 65) === "101";
      current = {
        seq,
        bookedOn: codaDate(r.slice(115, 121)) || codaDate(r.slice(47, 53)),
        amountCents: sign * cents,
        counterparty: "",
        counterpartyIban: "",
        communication: structured ? r.slice(65, 77) : r.slice(62, 115).trim(),
        bankRef: r.slice(10, 31).trim(),
      };
    } else if (r.startsWith("22") && current) {
      current.communication += " " + r.slice(10, 63).trim();
    } else if (r.startsWith("23") && current) {
      current.counterpartyIban = ibanOf(r.slice(10, 47).trim().split(" ")[0]);
      current.counterparty = clean(r.slice(47, 82), 160);
      current.communication += " " + r.slice(82, 125).trim();
    } else if (r.startsWith("8") || r.startsWith("9")) push();
  }
  push();
  return { lines, ignored };
}

/* ------------------------------------------------------------- camt.053 */
const xml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tag = (block: string, re: RegExp) => xml(block.match(re)?.[1]?.trim() ?? "");
/** ISO 20022 camt.053: one line per <Ntry>, the counterparty on the other side of the movement. */
export function parseCamt(text: string): { lines: StatementLine[]; ignored: number } {
  const lines: StatementLine[] = [];
  let ignored = 0;
  for (const m of text.matchAll(/<(?:\w+:)?Ntry>([\s\S]*?)<\/(?:\w+:)?Ntry>/g)) {
    const e = m[1].replace(/<(\/?)\w+:/g, "<$1");
    const amount = Number(tag(e, /<Amt[^>]*>([\d.]+)<\/Amt>/));
    const credit = tag(e, /<CdtDbtInd>(\w+)<\/CdtDbtInd>/) !== "DBIT";
    const date = tag(e, /<BookgDt>\s*<Dt>([\d-]{10})/) || tag(e, /<BookgDt>\s*<DtTm>([\d-]{10})/) || tag(e, /<ValDt>\s*<Dt>([\d-]{10})/);
    const side = credit ? "Dbtr" : "Cdtr";
    const name = tag(e, new RegExp(`<${side}>\\s*(?:<Pty>\\s*)?<Nm>([\\s\\S]*?)</Nm>`));
    const iban = tag(e, new RegExp(`<${side}Acct>\\s*<Id>\\s*<IBAN>([\\s\\S]*?)</IBAN>`));
    const structured = tag(e, /<CdtrRefInf>[\s\S]*?<Ref>([\s\S]*?)<\/Ref>/);
    const free = [...e.matchAll(/<Ustrd>([\s\S]*?)<\/Ustrd>/g)].map((x) => xml(x[1].trim())).join(" ");
    const cents = Math.round(amount * 100);
    if (!date || !cents) {
      ignored++;
      continue;
    }
    lines.push({
      bookedOn: date,
      amountCents: credit ? cents : -cents,
      counterparty: clean(name, 160),
      counterpartyIban: ibanOf(iban),
      communication: clean([structured, free].filter(Boolean).join(" "), 400),
      bankRef: clean(tag(e, /<AcctSvcrRef>([\s\S]*?)<\/AcctSvcrRef>/) || tag(e, /<NtryRef>([\s\S]*?)<\/NtryRef>/), 80),
    });
  }
  return { lines, ignored };
}

export type Format = "csv" | "xlsx" | "coda" | "camt";
/** The format, from the file's name and first bytes. */
export function detectFormat(name: string, head: string): Format {
  if (/\.xlsx$/i.test(name)) return "xlsx";
  if (/<Document[\s\S]*camt\.05[23]/.test(head) || /\.xml$/i.test(name)) return "camt";
  if (/^0{5}\d{6}/.test(head.replace(/^﻿/, "")) || /\.(cod|coda)$/i.test(name)) return "coda";
  return "csv";
}
