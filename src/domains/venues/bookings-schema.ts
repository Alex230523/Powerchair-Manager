import { z } from "zod";
import type { Locale } from "../../lib/locale";
import { bookingWords } from "./bookings-copy";

/**
 * 18: hall bookings worked out from the calendar. Pure parts shared by the
 * service, the Places page and the tests: the sessions said as slots, the
 * planned cost at the rate in force on each day, the invoice periods, the
 * email ready for the hall, the gap between an invoice and what was planned.
 */
export const bookingStatuses = ["to_request", "requested", "confirmed", "refused", "cancelled"] as const;
export type BookingStatus = (typeof bookingStatuses)[number];
export const billings = ["per_session", "monthly", "quarterly", "yearly"] as const;
export type Billing = (typeof billings)[number];

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
export const bookingCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id, status: z.enum(bookingStatuses), reference: text(120).optional() }),
  z.object({ action: z.literal("update"), id, billing: z.enum(billings), rateLabel: text(120).nullable(), reference: text(120), notes: text(2000) }),
  /** An invoice received (its file may follow). */
  z.object({ action: z.literal("invoice"), bookingId: id, period: text(20), amountCents: z.number().int().min(0).max(100000000), issuedOn: z.iso.date() }),
  z.object({ action: z.literal("removeInvoice"), id }),
  /** « Enregistrer la dépense »: the ledger line, once, linked to the invoice. */
  z.object({ action: z.literal("expense"), invoiceId: id, occurredOn: z.iso.date(), label: text(200).min(2) }),
  z.object({ action: z.literal("refresh") }),
]);
export type BookingCommand = z.infer<typeof bookingCommand>;

export type Session = { local_start: string; local_end: string };
const day = (s: string) => s.slice(0, 10);
const hour = (s: string) => s.slice(11, 16);
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const weekday = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { weekday: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const date = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/**
 * The sessions as the hall reads them: a weekly slot when a weekday and an
 * hour repeat (three times or more), the other dates one by one.
 */
export function slotLines(locale: Locale, sessions: Session[]) {
  const w = bookingWords[locale];
  const groups = new Map<string, Session[]>();
  for (const s of [...sessions].sort((a, b) => a.local_start.localeCompare(b.local_start))) {
    const key = `${new Date(day(s.local_start) + "T12:00:00Z").getUTCDay()}|${hour(s.local_start)}|${hour(s.local_end)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const lines: { sort: string; text: string }[] = [];
  for (const list of groups.values()) {
    const first = list[0],
      last = list[list.length - 1];
    const v = { from: hour(first.local_start), to: hour(first.local_end) };
    if (list.length >= 3)
      lines.push({
        sort: first.local_start,
        text: fill(w.weekly, { day: weekday(locale, day(first.local_start)), ...v, first: date(locale, day(first.local_start)), last: date(locale, day(last.local_start)), n: list.length }),
      });
    else for (const s of list) lines.push({ sort: s.local_start, text: fill(w.once, { day: `${weekday(locale, day(s.local_start))} ${date(locale, day(s.local_start))}`, from: hour(s.local_start), to: hour(s.local_end) }) });
  }
  return lines.sort((a, b) => a.sort.localeCompare(b.sort)).map((x) => x.text);
}

export type Rate = { label: string; amount_cents: number; valid_from: string };
/** The rate of a label in force on a day: the latest that had started. */
export function rateAt(rates: Rate[], label: string | null, on: string) {
  if (!label) return null;
  const valid = rates.filter((r) => r.label.toLowerCase() === label.toLowerCase() && r.valid_from <= on).sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  return valid[0] ?? null;
}
/** Sessions × the rate in force on each one's day: a new rate changes the sessions from its date. */
export function plannedCost(sessions: Session[], rates: Rate[], label: string | null) {
  return sessions.reduce((n, s) => n + (rateAt(rates, label, day(s.local_start))?.amount_cents ?? 0), 0);
}

const lastOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
/**
 * The invoices to expect: one per session, per month, per quarter or one
 * for the year, each due at the end of its period, with its amount.
 */
export function billingPeriods(sessions: Session[], billing: Billing, rates: Rate[], label: string | null) {
  const out = new Map<string, { period: string; due: string; cents: number; sessions: number }>();
  const sorted = [...sessions].sort((a, b) => a.local_start.localeCompare(b.local_start));
  for (const s of sorted) {
    const d = day(s.local_start),
      y = Number(d.slice(0, 4)),
      m = Number(d.slice(5, 7));
    const q = Math.ceil(m / 3);
    const [period, due] =
      billing === "per_session" ? [d, d] : billing === "monthly" ? [d.slice(0, 7), lastOfMonth(y, m)] : billing === "quarterly" ? [`${y}-Q${q}`, lastOfMonth(y, q * 3)] : ["year", day(sorted[sorted.length - 1].local_start)];
    const p = out.get(period) ?? { period, due, cents: 0, sessions: 0 };
    p.cents += rateAt(rates, label, d)?.amount_cents ?? 0;
    p.sessions += 1;
    out.set(period, p);
  }
  return [...out.values()];
}

/** « mercredi 12 novembre 2026 à 18:00 », from a local « 2026-11-12T18:00 ». */
export function sessionLabel(locale: Locale, local: string) {
  return fill(bookingWords[locale].at, { day: `${weekday(locale, day(local))} ${date(locale, day(local))}`, time: hour(local) });
}

/** The email ready for the hall's contact: who, which slots, which season. */
export function bookingEmail(locale: Locale, v: { club: string; place: string; contact: string | null; season: string | null; slots: string[]; sender: string }) {
  const w = bookingWords[locale];
  return {
    subject: fill(w.subject, { place: v.place, season: v.season ?? "" }).trim(),
    body: [fill(w.hello, { name: v.contact ?? "" }).replace(" ,", ","), "", fill(w.ask, { club: v.club, place: v.place, season: v.season ?? "" }), "", ...v.slots.map((s) => `- ${s}`), "", w.thanks, "", v.sender, v.club].join("\n"),
  };
}
/** The email that tells the hall a session changed. */
export function changeEmail(locale: Locale, v: { club: string; place: string; contact: string | null; before: string; after: string | null; sender: string }) {
  const w = bookingWords[locale];
  return {
    subject: fill(w.changeSubject, { place: v.place }),
    body: [fill(w.hello, { name: v.contact ?? "" }).replace(" ,", ","), "", v.after ? fill(w.moved, { before: v.before, after: v.after }) : fill(w.cancelled, { before: v.before }), "", w.thanks, "", v.sender, v.club].join("\n"),
  };
}

/** How far an invoice is from what was planned for its period. */
export function invoiceGap(amount: number, planned: number) {
  const gap = amount - planned;
  return { gap, tone: gap === 0 ? "success" : Math.abs(gap) <= Math.max(500, planned * 0.05) ? "warning" : "danger" } as const;
}
