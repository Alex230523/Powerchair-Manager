import type { ImportRow } from "./schema";

/**
 * A4: contacts read from a CSV file (a spreadsheet, a mail program) or a
 * vCard file (a phone). Pure, run in the browser before anything is sent;
 * the server checks each row again.
 */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
const headers: Record<keyof ImportRow | "first" | "last", string[]> = {
  fullName: ["name", "nom", "naam", "fullname", "nomcomplet", "volledigenaam", "displayname"],
  first: ["firstname", "prenom", "voornaam", "givenname"],
  last: ["lastname", "nomdefamille", "achternaam", "familyname", "surname"],
  organizationName: ["organisation", "organization", "entreprise", "company", "societe", "bedrijf", "organisatie"],
  role: ["role", "fonction", "function", "functie", "jobtitle", "title", "titre"],
  email: ["email", "mail", "courriel", "emailaddress", "adresseemail", "emailadres"],
  phone: ["phone", "telephone", "tel", "telefoon", "mobile", "gsm", "portable", "mobilephone"],
  notes: ["notes", "note", "remarques", "opmerkingen", "commentaire"],
};
/** One CSV line into cells: quotes, doubled quotes and the separator inside quotes. */
function cells(line: string, sep: string) {
  const out: string[] = [];
  let cur = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}
/** Lines of a CSV text, a quoted cell may hold a line break. */
function lines(text: string) {
  const out: string[] = [];
  let cur = "",
    quotes = 0;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    cur = cur ? cur + "\n" + raw : raw;
    quotes += (raw.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      if (cur.trim()) out.push(cur);
      cur = "";
      quotes = 0;
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}
const clean = (r: Partial<ImportRow>): ImportRow | null => {
  const fullName = (r.fullName ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const email = (r.email ?? "").trim().toLowerCase();
  if (fullName.length < 2) return null;
  return {
    fullName,
    organizationName: (r.organizationName ?? "").trim().slice(0, 160),
    role: (r.role ?? "").trim().slice(0, 120),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200 ? email : "",
    phone: (r.phone ?? "").trim().slice(0, 40),
    notes: (r.notes ?? "").trim().slice(0, 4000),
  };
};

export function parseCsv(text: string): { rows: ImportRow[]; ignored: number } {
  const all = lines(text);
  if (all.length < 2) return { rows: [], ignored: 0 };
  const first = all[0];
  const sep = [";", ",", "\t"].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const head = cells(first, sep).map(fold);
  const col = (k: keyof typeof headers) => head.findIndex((h) => headers[k].includes(h));
  const at = Object.fromEntries((Object.keys(headers) as (keyof typeof headers)[]).map((k) => [k, col(k)])) as Record<keyof typeof headers, number>;
  const rows: ImportRow[] = [];
  let ignored = 0;
  for (const line of all.slice(1)) {
    const c = cells(line, sep);
    const get = (k: keyof typeof headers) => (at[k] >= 0 ? (c[at[k]] ?? "") : "");
    const row = clean({
      fullName: get("fullName") || [get("first"), get("last")].filter(Boolean).join(" "),
      organizationName: get("organizationName"),
      role: get("role"),
      email: get("email"),
      phone: get("phone"),
      notes: get("notes"),
    });
    if (row) rows.push(row);
    else ignored++;
  }
  return { rows, ignored };
}

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
export function parseVcard(text: string): { rows: ImportRow[]; ignored: number } {
  // Folded lines (a space or a tab at the start) belong to the line before.
  const unfolded = text.replace(/^﻿/, "").replace(/\r?\n[ \t]/g, "");
  const rows: ImportRow[] = [];
  let ignored = 0;
  for (const card of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const props = card
      .split(/\r?\n/)
      .map((l) => {
        const i = l.indexOf(":");
        return i < 0 ? null : { key: l.slice(0, i).split(";")[0].replace(/^item\d+\./i, "").toUpperCase(), value: unescape(l.slice(i + 1).trim()) };
      })
      .filter((x): x is { key: string; value: string } => !!x);
    const get = (k: string) => props.find((p) => p.key === k)?.value ?? "";
    const n = get("N").split(";");
    const row = clean({
      fullName: get("FN") || [n[1], n[0]].filter(Boolean).join(" "),
      organizationName: get("ORG").split(";")[0],
      role: get("TITLE"),
      email: get("EMAIL"),
      phone: get("TEL"),
      notes: get("NOTE"),
    });
    if (row) rows.push(row);
    else ignored++;
  }
  return { rows, ignored };
}
/** By the file's name or its first line. */
export function parseContacts(name: string, text: string) {
  return /\.vcf$/i.test(name) || /^﻿?BEGIN:VCARD/i.test(text.trimStart()) ? parseVcard(text) : parseCsv(text);
}
