import { digestCopy } from "../../components/digest-copy";
import { homeCopy } from "../../components/home-copy";
import { escapeHtml } from "../notifications/templates";
import type { TodoKey } from "../dashboard/summary";
import { digestSections, type DigestSection } from "./schema";

/**
 * The weekly digest's content and its email (wave 15, C7). Pure: the
 * service gathers the figures under the person's rights, this module decides
 * what is empty and writes the text and HTML versions.
 * No player's name, no health data: counts, event titles, dates of the club's
 * files and the names of the people in charge of a task.
 */
export type DigestData = {
  club: string;
  name: string;
  todos: { key: TodoKey; count: number }[];
  events: { title: string; startsAt: string; team: string | null; place: string | null }[];
  /** null: not this person's business (no right); 0: nothing this week. */
  registrations: number | null;
  documents: number | null;
  dues: { players: number; cents: number } | null;
  readiness: { title: string; startsAt: string; team: string | null; players: number; coaches: number }[];
  deadlines: { kind: "grant" | "partner" | "accounts"; date: string; title: string }[];
  tasks: { date: string; title: string; responsible: string | null; late: boolean }[];
  treasury: number | null;
};
type Locale = "fr" | "nl" | "en";

/** Todos already told by a section of their own, when that section is in. */
const coveredBy: Partial<Record<DigestSection, TodoKey[]>> = {
  registrations: ["registrationsReview"],
  documents: ["documentsExpiring"],
  dues: ["duesLate"],
  tasks: ["sponsorTasks", "grantTasks"],
};

/** The non-empty sections, in order, with their lines. The treasury alone is not news. */
export function digestContent(d: DigestData, sections: readonly DigestSection[]) {
  const on = new Set(sections);
  const hidden = new Set(digestSections.filter((s) => on.has(s)).flatMap((s) => coveredBy[s] ?? []));
  const parts = {
    todos: on.has("todos") ? d.todos.filter((t) => t.count > 0 && !hidden.has(t.key)) : [],
    events: on.has("events") ? d.events : [],
    registrations: on.has("registrations") && d.registrations ? d.registrations : 0,
    documents: on.has("documents") && d.documents ? d.documents : 0,
    dues: on.has("dues") && d.dues && d.dues.players > 0 ? d.dues : null,
    readiness: on.has("readiness") ? d.readiness : [],
    deadlines: on.has("deadlines") ? d.deadlines : [],
    tasks: on.has("tasks") ? d.tasks : [],
    treasury: on.has("treasury") ? d.treasury : null,
  };
  const items =
    parts.todos.length +
    parts.events.length +
    (parts.registrations ? 1 : 0) +
    (parts.documents ? 1 : 0) +
    (parts.dues ? 1 : 0) +
    parts.readiness.length +
    parts.deadlines.length +
    parts.tasks.length;
  return { parts, items };
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const plural = (pair: [string, string], n: number, extra: Record<string, string> = {}) => fill(n === 1 ? pair[0] : pair[1], { n, ...extra });

/**
 * Colours of the email, written as hex because mail clients ignore CSS
 * variables: the light theme of the design tokens (globals.css).
 */
const mail = {
  background: "#f9fbfe",
  surface: "#ffffff",
  border: "#e5ebf2",
  heading: "#1a3655",
  text: "#283444",
  muted: "#5a697b",
  primary: "#213c60",
  onPrimary: "#ffffff",
};
const serif = "'Source Serif 4',Georgia,'Times New Roman',serif";
const sans = "'DM Sans',Arial,Helvetica,sans-serif";

export type DigestLinks = { dashboard: string; settings: string; stop: string; logo: string | null };

/** Subject, plain text and HTML of the digest; null when there is nothing to say. */
export function renderDigest(d: DigestData, sections: readonly DigestSection[], locale: Locale, links: DigestLinks, preview = false) {
  const { parts, items } = digestContent(d, sections);
  if (!items) return null;
  const t = digestCopy[locale],
    m = t.mail,
    home = homeCopy[locale];
  const money = (c: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(c / 100);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
  const day = (date: string) => new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
  const blocks: { section: DigestSection; lines: string[] }[] = [];
  const colon = locale === "fr" ? " : " : ": ";
  const add = (section: DigestSection, lines: string[]) => {
    if (lines.length) blocks.push({ section, lines });
  };
  add(
    "todos",
    parts.todos.map((x) => `${home.todos[x.key].title}${colon}${x.count}`),
  );
  add(
    "events",
    parts.events.map((e) => [when(e.startsAt), e.title, e.team, e.place].filter(Boolean).join(" · ")),
  );
  if (parts.registrations) add("registrations", [plural(m.registrations, parts.registrations)]);
  if (parts.documents) add("documents", [plural(m.documents, parts.documents)]);
  if (parts.dues) add("dues", [plural(m.dues, parts.dues.players, { amount: money(parts.dues.cents) })]);
  add(
    "readiness",
    parts.readiness.map((r) => [when(r.startsAt), r.title, r.team, fill(m.readiness, { players: r.players, coaches: r.coaches })].filter(Boolean).join(" · ")),
  );
  add(
    "deadlines",
    parts.deadlines.map((x) => [day(x.date), m.deadlineKinds[x.kind], x.title].filter(Boolean).join(" · ")),
  );
  add(
    "tasks",
    parts.tasks.map((x) => [day(x.date) + (x.late ? ` (${m.late})` : ""), x.title, x.responsible ?? m.noResponsible].join(" · ")),
  );
  if (parts.treasury !== null) blocks.push({ section: "treasury", lines: [fill(m.treasury, { amount: money(parts.treasury) })] });

  const subject = fill(m.subject, { club: d.club }).replace(/[\r\n]/g, " ");
  const footer = fill(m.footer, { club: d.club });
  const text = [
    fill(m.hello, { name: d.name }),
    fill(m.lead, { club: d.club }),
    ...(preview ? [m.preview] : []),
    "",
    ...blocks.flatMap((b) => [m.headings[b.section].toUpperCase(), ...b.lines.map((l) => `- ${l}`), ""]),
    `${m.button}${colon}${links.dashboard}`,
    "",
    footer,
    `${m.settings}${colon}${links.settings}`,
    `${m.stop}${colon}${links.stop}`,
  ].join("\n");

  const e = escapeHtml;
  const href = (u: string) => e(u);
  const block = (b: { section: DigestSection; lines: string[] }) =>
    `<tr><td style="padding:0 0 16px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${mail.surface};border:1px solid ${mail.border};border-radius:12px"><tr><td style="padding:16px 20px">` +
    `<h2 style="margin:0 0 8px 0;font-family:${sans};font-size:16px;line-height:1.4;color:${mail.heading}">${e(m.headings[b.section])}</h2>` +
    `<ul style="margin:0;padding:0 0 0 18px;font-family:${sans};font-size:15px;line-height:1.6;color:${mail.text}">${b.lines.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` +
    `</td></tr></table></td></tr>`;
  const html =
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${mail.background}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${mail.background}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">` +
    `<tr><td style="padding:0 0 16px 0;font-family:${sans};font-size:14px;color:${mail.muted}">` +
    (links.logo ? `<img src="${href(links.logo)}" alt="${e(d.club)}" height="48" style="display:block;height:48px;width:auto;margin:0 0 8px 0">` : `<strong style="color:${mail.heading}">${e(d.club)}</strong>`) +
    `</td></tr>` +
    `<tr><td style="padding:0 0 8px 0"><h1 style="margin:0;font-family:${serif};font-size:30px;line-height:1.2;color:${mail.heading}">${e(m.heading)}</h1></td></tr>` +
    `<tr><td style="padding:0 0 20px 0;font-family:${sans};font-size:15px;line-height:1.6;color:${mail.text}">${e(fill(m.hello, { name: d.name }))}<br>${e(fill(m.lead, { club: d.club }))}` +
    (preview ? `<br><span style="color:${mail.muted}">${e(m.preview)}</span>` : "") +
    `</td></tr>` +
    blocks.map(block).join("") +
    `<tr><td style="padding:8px 0 24px 0"><a href="${href(links.dashboard)}" style="display:inline-block;background:${mail.primary};color:${mail.onPrimary};font-family:${sans};font-size:16px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px">${e(m.button)}</a></td></tr>` +
    `<tr><td style="font-family:${sans};font-size:13px;line-height:1.6;color:${mail.muted}">${e(footer)}<br>` +
    `<a href="${href(links.settings)}" style="color:${mail.primary}">${e(m.settings)}</a> · <a href="${href(links.stop)}" style="color:${mail.primary}">${e(m.stop)}</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject, text, html, items };
}
