/**
 * Spreadsheet reading for the player import, entirely in the browser:
 * the file never leaves the device until the club confirms the preview.
 * Supports .xlsx (first worksheet) and .csv (comma or semicolon).
 */
import type { ImportRow } from "../domains/people/schema";

export type Grid = string[][];

/** CSV with quotes, separator detected from the first line (Excel BE uses ";"). */
export function parseCsv(text: string): Grid {
  const clean = text.replace(/^﻿/, "");
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ";"
      : (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
        ? "\t"
        : ",";
  const rows: Grid = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
function xmlText(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X"
            ? parseInt(e.slice(2), 16)
            : parseInt(e.slice(1), 10),
        )
      : (entities[e] ?? m),
  );
}
function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** Reads the entries of a zip archive (stored or deflated). */
async function unzip(buffer: ArrayBuffer) {
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("NOT_A_SPREADSHEET");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files = new Map<string, () => Promise<string>>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("NOT_A_SPREADSHEET");
    const method = view.getUint16(offset + 10, true),
      size = view.getUint32(offset + 20, true),
      nameLength = view.getUint16(offset + 28, true),
      extraLength = view.getUint16(offset + 30, true),
      commentLength = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    offset += 46 + nameLength + extraLength + commentLength;
    files.set(name, async () => {
      const start =
        local +
        30 +
        view.getUint16(local + 26, true) +
        view.getUint16(local + 28, true);
      const data = bytes.slice(start, start + size);
      if (method === 0) return decoder.decode(data);
      if (method !== 8) throw new Error("NOT_A_SPREADSHEET");
      const stream = new Blob([data])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    });
  }
  return files;
}

/** First worksheet of an .xlsx file as rows of text. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<Grid> {
  const files = await unzip(buffer);
  const read = async (name: string) => (await files.get(name)?.()) ?? "";
  const shared = [
    ...(await read("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((t) => xmlText(t[1]))
      .join(""),
  );
  // The first sheet listed in the workbook, resolved through its relationship.
  let sheet = "xl/worksheets/sheet1.xml";
  const firstId = (await read("xl/workbook.xml")).match(
    /<sheet\b[^>]*\br:id="([^"]+)"/,
  )?.[1];
  if (firstId) {
    const target = (await read("xl/_rels/workbook.xml.rels")).match(
      new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`),
    )?.[1];
    if (target)
      sheet = target.startsWith("/")
        ? target.slice(1)
        : "xl/" + target.replace(/^\.\//, "");
  }
  const xml = await read(sheet);
  if (!xml) throw new Error("NOT_A_SPREADSHEET");
  const rows: Grid = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1],
        body = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr")
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => xmlText(t[1]))
          .join("");
      else if (raw !== undefined) value = xmlText(raw);
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const normalise = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
/** Accepted column titles (French, Dutch, English), already normalised. */
const aliases: Record<string, string[]> = {
  fullName: [
    "nomcomplet",
    "nometprenom",
    "nomprenom",
    "prenomnom",
    "fullname",
    "name",
    "naam",
    "volledigenaam",
    "joueur",
    "player",
    "speler",
  ],
  firstName: ["prenom", "firstname", "voornaam"],
  lastName: [
    "nom",
    "nomdefamille",
    "lastname",
    "surname",
    "achternaam",
    "familienaam",
  ],
  birthDate: [
    "datedenaissance",
    "naissance",
    "datenaissance",
    "birthdate",
    "dateofbirth",
    "birthday",
    "geboortedatum",
    "ddn",
  ],
  email: [
    "email",
    "mail",
    "courriel",
    "adresseemail",
    "emailadres",
    "adressemail",
  ],
  phone: [
    "telephone",
    "tel",
    "phone",
    "gsm",
    "mobile",
    "portable",
    "telefoon",
    "telefoonnummer",
  ],
  joinedOn: [
    "datedarrivee",
    "arrivee",
    "arriveeauclub",
    "joinedon",
    "joined",
    "lidsinds",
    "aansluitingsdatum",
  ],
  position: ["poste", "position", "positie"],
  jerseyNumber: [
    "numero",
    "numerodemaillot",
    "maillot",
    "dossard",
    "number",
    "jerseynumber",
    "shirtnumber",
    "rugnummer",
    "nummer",
  ],
};
export const templateHeaders = [
  "Nom complet",
  "Date de naissance",
  "Email",
  "Téléphone",
  "Date d'arrivée",
  "Poste",
  "Numéro",
];

/** Excel serial day (1900 system) or a written date to YYYY-MM-DD. */
export function toIsoDate(value: string): string | null | undefined {
  const v = value.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  const eu = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (eu) {
    [d, m, y] = [Number(eu[1]), Number(eu[2]), Number(eu[3])];
    if (y < 100) y += y > 30 ? 1900 : 2000;
  } else if (/^\d+(\.\d+)?$/.test(v) && Number(v) > 59 && Number(v) < 80000) {
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000,
    );
    return date.toISOString().slice(0, 10);
  } else return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return undefined;
  return date.toISOString().slice(0, 10);
}

export type ImportIssue = { line: number; field: string };
/**
 * Turns a grid (first row = titles) into import rows. Lines with problems are
 * reported and left out; nothing is guessed silently.
 */
export function rowsFromGrid(grid: Grid, today: string) {
  const [head = [], ...body] = grid;
  const columns = head.map(normalise);
  const find = (key: string) =>
    columns.findIndex((c) => aliases[key].includes(c));
  const col = Object.fromEntries(
    Object.keys(aliases).map((k) => [k, find(k)]),
  ) as Record<keyof typeof aliases, number>;
  const rows: ImportRow[] = [],
    issues: ImportIssue[] = [];
  const recognised = Object.entries(col)
    .filter(([, i]) => i >= 0)
    .map(([k]) => k);
  body.forEach((cells, n) => {
    const line = n + 2;
    const get = (key: string) =>
      col[key] >= 0 ? (cells[col[key]] ?? "").trim() : "";
    const fullName = (
      get("fullName") ||
      [get("firstName"), get("lastName")].filter(Boolean).join(" ")
    ).replace(/\s+/g, " ");
    if (fullName.length < 2 || fullName.length > 120)
      return issues.push({ line, field: "fullName" });
    const birthDate = toIsoDate(get("birthDate"));
    if (birthDate === undefined || (birthDate && birthDate > today))
      return issues.push({ line, field: "birthDate" });
    const joined = toIsoDate(get("joinedOn"));
    if (joined === undefined || (joined && joined > today))
      return issues.push({ line, field: "joinedOn" });
    const email = get("email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return issues.push({ line, field: "email" });
    const number = get("jerseyNumber");
    const jerseyNumber = number === "" ? null : Number(number);
    if (
      jerseyNumber !== null &&
      !(
        Number.isInteger(jerseyNumber) &&
        jerseyNumber >= 0 &&
        jerseyNumber <= 99
      )
    )
      return issues.push({ line, field: "jerseyNumber" });
    rows.push({
      fullName,
      birthDate,
      email,
      phone: get("phone").slice(0, 40),
      joinedOn: joined,
      position: get("position").slice(0, 80),
      jerseyNumber,
    });
  });
  return { rows, issues, recognised };
}
