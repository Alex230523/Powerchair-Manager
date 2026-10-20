import { z } from "zod";
import { ageOn } from "../people/schema";

/**
 * Club communication (wave 9, taken from PRÊT): saved recipient groups,
 * newsletters written by blocks, mails prepared before an event, sender
 * identity and unsubscribes. Pure rules here; database work in service.ts.
 */
export const audiences = [
  "players",
  "guardians",
  "coaches",
  "volunteers",
  "staff",
  "alumni",
] as const;
export type Audience = (typeof audiences)[number];

const text = (n: number) => z.string().trim().max(n);
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\/[^\s<>"]+$/);
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: text(160).min(1) }),
  z.object({ type: z.literal("text"), text: text(5000).min(1) }),
  z.object({
    type: z.literal("button"),
    label: text(60).min(1),
    url: httpUrl,
  }),
  z.object({
    type: z.literal("events"),
    eventIds: z.array(z.uuid()).min(1).max(10),
  }),
  z.object({ type: z.literal("divider") }),
]);
export type Block = z.infer<typeof blockSchema>;
export const blockTypes = [
  "heading",
  "text",
  "button",
  "events",
  "divider",
] as const;

const groupFields = {
  name: text(80).min(2),
  audiences: z.array(z.enum(audiences)).max(audiences.length),
  teamIds: z.array(z.uuid()).max(50),
  profileIds: z.array(z.uuid()).max(500),
};
export const communicationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sender"),
    senderName: text(80).regex(/^[^\r\n<>"]*$/),
    replyTo: z.union([z.email().max(254), z.literal("")]),
  }),
  z.object({
    action: z.literal("group"),
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    archived: z.boolean().default(false),
    ...groupFields,
  }),
  z.object({
    action: z.literal("newsletter"),
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    subject: text(160).min(2),
    blocks: z.array(blockSchema).max(40),
    groupIds: z.array(z.uuid()).max(20),
    includeAlumni: z.boolean(),
  }),
  z.object({
    action: z.literal("sendNewsletter"),
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal("deleteNewsletter"), id: z.uuid() }),
  z.object({
    action: z.literal("eventMail"),
    id: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
    eventId: z.uuid(),
    groupId: z.uuid().nullable(),
    subject: text(160).min(2),
    body: text(5000).min(1),
    sendAt: z.iso.datetime({ offset: true }),
  }),
  z.object({ action: z.literal("reviewEventMail"), id: z.uuid() }),
  z.object({ action: z.literal("sendEventMail"), id: z.uuid() }),
  z.object({ action: z.literal("cancelEventMail"), id: z.uuid() }),
  z.object({ action: z.literal("unsubscribe"), profileId: z.uuid() }),
  z.object({ action: z.literal("resubscribe"), profileId: z.uuid() }),
]);
export type CommunicationCommand = z.infer<typeof communicationCommand>;

/** Where a prepared event mail stands, compared with the event today. */
export type EventMailState =
  | "scheduled"
  | "review"
  | "sent"
  | "cancelled"
  | "event_cancelled";
export function eventMailState(
  mail: { status: string; event_version: number },
  event: { status: string; version: number },
): EventMailState {
  if (mail.status === "sent") return "sent";
  if (mail.status === "cancelled") return "cancelled";
  if (event.status === "cancelled") return "event_cancelled";
  return event.version !== mail.event_version ? "review" : "scheduled";
}

/** Placeholders a club can use in an event mail. */
export const eventPlaceholders = ["{name}", "{event}", "{date}", "{place}"];
export function fillPlaceholders(
  value: string,
  vars: { name: string; event: string; date: string; place: string },
) {
  return value
    .replaceAll("{name}", vars.name)
    .replaceAll("{event}", vars.event)
    .replaceAll("{date}", vars.date)
    .replaceAll("{place}", vars.place);
}

export type Contact = {
  email: string;
  userId: string | null;
  name: string;
  locale: "fr" | "nl" | "en";
};
export type PersonContact = {
  profile_id: string;
  full_name: string;
  birth_date: string | null;
  file_email: string | null;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  locale: string;
};
export type GuardianContact = PersonContact & { subject_profile_id: string };
const lang = (l: string) => (l === "nl" || l === "en" ? l : "fr");
function contactOf(p: PersonContact): Contact | null {
  if (p.user_id && p.user_email)
    return {
      email: p.user_email,
      userId: p.user_id,
      name: p.user_name || p.full_name,
      locale: lang(p.locale),
    };
  if (p.file_email && /^[^@\s]+@[^@\s]+$/.test(p.file_email))
    return {
      email: p.file_email,
      userId: null,
      name: p.full_name,
      locale: lang(p.locale),
    };
  return null;
}
/**
 * Who receives a mail about a person. A minor is written to through their
 * representatives (their own address only when nobody represents them); an
 * adult receives it, and so do the people helping them (delegated aid).
 * One address receives one mail, whatever the number of people it covers.
 */
export function pickContacts(
  people: PersonContact[],
  guardians: GuardianContact[],
  today: string,
) {
  const out = new Map<string, Contact>();
  const add = (c: Contact | null) => {
    if (!c) return;
    const key = c.email.trim().toLowerCase();
    const known = out.get(key);
    if (!known || (!known.userId && c.userId)) out.set(key, c);
  };
  for (const p of people) {
    const reps = guardians
      .filter((g) => g.subject_profile_id === p.profile_id)
      .map(contactOf)
      .filter((c): c is Contact => !!c);
    const minor = !!p.birth_date && ageOn(p.birth_date, today) < 18;
    if (!minor || !reps.length) add(contactOf(p));
    reps.forEach(add);
  }
  return [...out.values()];
}

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export type NewsEvent = { id: string; title: string; when: string; place: string };
const footer = {
  fr: "Vous recevez ce message car vous êtes en lien avec le club. Ne plus recevoir les nouvelles du club :",
  nl: "U ontvangt dit bericht omdat u verbonden bent met de club. Geen clubnieuws meer ontvangen:",
  en: "You receive this message because you are connected with the club. Stop receiving club news:",
};
/**
 * Text and HTML of a newsletter. Every value is escaped; links are only
 * http(s) addresses validated by the block schema.
 */
export function renderNewsletter(
  blocks: Block[],
  events: NewsEvent[],
  options: {
    organization: string;
    locale: "fr" | "nl" | "en";
    unsubscribeUrl: string;
  },
) {
  const text: string[] = [],
    html: string[] = [];
  for (const b of blocks) {
    if (b.type === "heading") {
      text.push(b.text.toUpperCase());
      html.push(
        `<h2 style="font-size:20px;margin:24px 0 8px;color:#1a1a1a">${escapeHtml(b.text)}</h2>`,
      );
    } else if (b.type === "text") {
      text.push(b.text);
      html.push(
        `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(b.text).replaceAll("\n", "<br>")}</p>`,
      );
    } else if (b.type === "button") {
      text.push(`${b.label} : ${b.url}`);
      html.push(
        `<p style="margin:16px 0"><a href="${escapeHtml(b.url)}" style="background:#fa6f1d;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(b.label)}</a></p>`,
      );
    } else if (b.type === "events") {
      const chosen = b.eventIds
        .map((id) => events.find((e) => e.id === id))
        .filter((e): e is NewsEvent => !!e);
      if (!chosen.length) continue;
      text.push(
        chosen
          .map((e) => `- ${e.title}, ${e.when}${e.place ? ", " + e.place : ""}`)
          .join("\n"),
      );
      html.push(
        `<ul style="margin:0 0 12px;padding-left:20px">${chosen
          .map(
            (e) =>
              `<li style="margin:4px 0"><strong>${escapeHtml(e.title)}</strong>, ${escapeHtml(e.when)}${e.place ? ", " + escapeHtml(e.place) : ""}</li>`,
          )
          .join("")}</ul>`,
      );
    } else {
      text.push("----");
      html.push(
        '<hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0">',
      );
    }
  }
  const message = text.join("\n\n");
  const page =
    '<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">' +
    '<div style="max-width:600px;margin:0 auto;background:#ffffff;padding:24px 28px;border-top:4px solid #fa6f1d">' +
    `<p style="margin:0 0 16px;font-weight:700;color:#fa6f1d">${escapeHtml(options.organization)}</p>` +
    html.join("") +
    `<p style="margin:28px 0 0;font-size:12px;color:#666666">${escapeHtml(footer[options.locale])} <a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#666666">${escapeHtml(options.unsubscribeUrl)}</a></p>` +
    "</div></body></html>";
  return { message, html: page };
}
/** A sending must say something: at least one non empty block. */
export function hasContent(blocks: Block[]) {
  return blocks.some((b) => b.type !== "divider");
}
