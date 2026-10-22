import { z } from "zod";
import { ageOn } from "./schema";

/** Columns a club can pick for an export (selective export, wave 9). */
export const exportColumns = [
  "name",
  "birth_date",
  "age",
  "email",
  "phone",
  "joined_on",
  "status",
  "teams",
  "roles",
  "jersey",
  "position",
] as const;
export type ExportColumn = (typeof exportColumns)[number];
/** Wave 17 (G2): dates as dates, age and number as numbers in the Excel file. */
export const columnTypes: Record<ExportColumn, "text" | "number" | "date"> = {
  name: "text",
  birth_date: "date",
  age: "number",
  email: "text",
  phone: "text",
  joined_on: "date",
  status: "text",
  teams: "text",
  roles: "text",
  jersey: "number",
  position: "text",
};
export const defaultColumns: ExportColumn[] = [
  "name",
  "birth_date",
  "email",
  "phone",
  "joined_on",
  "status",
  "teams",
];
export const exportOptions = z.object({
  format: z.enum(["csv", "xlsx", "html"]).default("csv"),
  columns: z
    .string()
    .max(300)
    .optional()
    .transform((v, ctx) => {
      if (!v) return defaultColumns;
      const list = [...new Set(v.split(",").filter(Boolean))];
      if (!list.length || list.some((c) => !exportColumns.includes(c as ExportColumn))) {
        ctx.addIssue({ code: "custom", message: "INVALID_COLUMNS" });
        return z.NEVER;
      }
      return list as ExportColumn[];
    }),
  locale: z.enum(["fr", "nl", "en"]).optional(),
});
export const columnLabels: Record<"fr" | "nl" | "en", Record<ExportColumn, string>> = {
  fr: {
    name: "Nom",
    birth_date: "Naissance",
    age: "Âge",
    email: "Email",
    phone: "Téléphone",
    joined_on: "Entrée au club",
    status: "Statut",
    teams: "Équipes",
    roles: "Fonctions",
    jersey: "Numéro",
    position: "Poste",
  },
  nl: {
    name: "Naam",
    birth_date: "Geboorte",
    age: "Leeftijd",
    email: "E-mail",
    phone: "Telefoon",
    joined_on: "Lid sinds",
    status: "Status",
    teams: "Teams",
    roles: "Functies",
    jersey: "Nummer",
    position: "Positie",
  },
  en: {
    name: "Name",
    birth_date: "Birth date",
    age: "Age",
    email: "Email",
    phone: "Phone",
    joined_on: "Joined",
    status: "Status",
    teams: "Teams",
    roles: "Roles",
    jersey: "Number",
    position: "Position",
  },
};
/** Header of the historical CSV (both languages), kept when no language is asked. */
const bilingual: Record<ExportColumn, string> = {
  name: "Nom / Naam",
  birth_date: "Naissance / Geboorte",
  age: "Âge / Leeftijd",
  email: "Email",
  phone: "Téléphone / Telefoon",
  joined_on: "Entrée / Toetreding",
  status: "Statut / Status",
  teams: "Équipes / Teams",
  roles: "Fonctions / Functies",
  jersey: "Numéro / Nummer",
  position: "Poste / Positie",
};
const statusLabels: Record<"fr" | "nl" | "en", Record<string, string>> = {
  fr: { active: "actif", inactive: "inactif", archived: "archivé", transferred: "transféré" },
  nl: { active: "actief", inactive: "inactief", archived: "gearchiveerd", transferred: "overgedragen" },
  en: { active: "active", inactive: "inactive", archived: "archived", transferred: "transferred" },
};
const roleLabels: Record<"fr" | "nl" | "en", Record<string, string>> = {
  fr: { player: "joueur", coach: "coach" },
  nl: { player: "speler", coach: "coach" },
  en: { player: "player", coach: "coach" },
};
export type ExportPerson = {
  full_name: string;
  birth_date: string | null;
  email: string | null;
  phone: string;
  joined_on: string;
  status: string;
  teams: string[];
  directory_roles: string[];
  former_roles: string[];
  jersey_number: number | null;
  playing_position: string;
};
export function exportGrid(
  people: ExportPerson[],
  columns: ExportColumn[],
  today: string,
  locale?: "fr" | "nl" | "en",
) {
  const l = locale ?? "fr";
  const cell = (p: ExportPerson, c: ExportColumn): string => {
    switch (c) {
      case "name":
        return p.full_name;
      case "birth_date":
        return p.birth_date ?? "";
      case "age":
        return p.birth_date ? String(ageOn(p.birth_date, today)) : "";
      case "email":
        return p.email ?? "";
      case "phone":
        return p.phone;
      case "joined_on":
        return p.joined_on;
      case "status":
        return locale ? (statusLabels[l][p.status] ?? p.status) : p.status;
      case "teams":
        return p.teams.join(", ");
      case "roles":
        return p.directory_roles
          .filter((r) => !p.former_roles.includes(r))
          .map((r) => roleLabels[l][r] ?? r)
          .join(", ");
      case "jersey":
        return p.jersey_number === null ? "" : String(p.jersey_number);
      case "position":
        return p.playing_position;
    }
  };
  return [
    columns.map((c) => (locale ? columnLabels[locale][c] : bilingual[c])),
    ...people.map((p) => columns.map((c) => cell(p, c))),
  ];
}
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const printCopy = {
  fr: { title: "Liste des personnes", print: "Imprimer ou enregistrer en PDF", count: "{n} personnes", on: "Export du {d}" },
  nl: { title: "Ledenlijst", print: "Afdrukken of opslaan als pdf", count: "{n} personen", on: "Export van {d}" },
  en: { title: "People list", print: "Print or save as PDF", count: "{n} people", on: "Exported on {d}" },
};
/** A printable page (the browser saves it as PDF). Every value is escaped. */
export function printablePage(
  grid: string[][],
  organization: string,
  today: string,
  locale: "fr" | "nl" | "en",
) {
  const t = printCopy[locale];
  const [head, ...rows] = grid;
  return (
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escape(organization)} · ${escape(t.title)}</title>` +
    "<style>body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:24px}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#555}" +
    "table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d6d6d6;padding:4px 6px;text-align:left;vertical-align:top}" +
    "th{background:#fff1e8;border-bottom:2px solid #fa6f1d}tr:nth-child(even) td{background:#fafafa}button{margin:0 0 16px;padding:8px 14px;border:0;border-radius:6px;background:#fa6f1d;color:#fff;font-weight:600;cursor:pointer}" +
    "@media print{button{display:none}body{margin:0}}</style></head><body>" +
    `<h1>${escape(organization)} · ${escape(t.title)}</h1><p>${escape(t.on.replace("{d}", today))} · ${escape(t.count.replace("{n}", String(rows.length)))}</p>` +
    `<button type="button" onclick="window.print()">${escape(t.print)}</button>` +
    `<table><thead><tr>${head.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${r.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("") +
    "</tbody></table></body></html>"
  );
}
