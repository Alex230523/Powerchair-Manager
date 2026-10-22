import { z } from "zod";
import { contactTags } from "../funding/schema";

/**
 * A4: a light CRM on the contact book. Organisations, the exchange log,
 * a next action in the to-do, duplicates merged, import, GDPR.
 */
const text = (n: number) => z.string().trim().max(n);
const id = z.uuid();
export const organizationKinds = ["company", "public", "foundation", "federation", "supplier", "venue", "media", "other"] as const;
export type OrganizationKind = (typeof organizationKinds)[number];
export const legalBases = ["legitimate_interest", "consent", "contract", "legal_obligation"] as const;
export type LegalBasis = (typeof legalBases)[number];
/** What a person writes in one click; « sent » is a mail the application sent. */
export const interactionKinds = ["call", "email", "meeting", "note"] as const;
export type InteractionKind = (typeof interactionKinds)[number] | "sent";

const contactFields = {
  fullName: text(120).min(2),
  organizationName: text(160),
  role: text(120),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: text(40),
  tags: z.array(z.enum(contactTags)).max(10),
  notes: text(4000),
};
export const importRow = z.object({
  fullName: text(120).min(2),
  organizationName: text(160).default(""),
  role: text(120).default(""),
  email: z.union([z.literal(""), z.email().max(200)]).default(""),
  phone: text(40).default(""),
  notes: text(4000).default(""),
});
export type ImportRow = z.infer<typeof importRow>;

export const contactCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contact"),
    id: id.optional(),
    ...contactFields,
    archived: z.boolean().optional(),
    /** A4: the organisation chosen in the list; absent keeps it (or finds it from the name typed). */
    contactOrganizationId: id.nullable().optional(),
    legalBasis: z.enum(legalBases).optional(),
    contactOk: z.boolean().optional(),
    consentOn: z.iso.date().nullable().optional(),
  }),
  z.object({
    action: z.literal("organization"),
    id: id.optional(),
    name: text(160).min(2),
    kind: z.enum(organizationKinds),
    website: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(300)]),
    address: text(300),
    notes: text(2000),
  }),
  z.object({ action: z.literal("deleteOrganization"), id }),
  /** One click: a call, an email, a meeting or a note, with one line of text. */
  z.object({ action: z.literal("interaction"), contactId: id, kind: z.enum(interactionKinds), summary: text(300).min(1), happenedOn: z.iso.date().optional() }),
  z.object({ action: z.literal("deleteInteraction"), id }),
  /** The next action: a task of the central to-do, with its person in charge and date. */
  z.object({ action: z.literal("nextAction"), contactId: id, title: text(200).min(2), dueOn: z.iso.date().nullable(), responsibleId: id.nullable() }),
  /** Two duplicates become one; the history of both is kept. */
  z.object({ action: z.literal("merge"), keepId: id, mergeId: id }),
  z.object({ action: z.literal("import"), rows: z.array(importRow).min(1).max(500), tags: z.array(z.enum(contactTags)).max(10).default([]) }),
  /** GDPR: erase a contact on request (the files keep their own text). */
  z.object({ action: z.literal("erase"), id }),
]);
export type ContactCommand = z.infer<typeof contactCommand>;

/** Lower case, no accents, words sorted: « Dupont, Jean » and « jean DUPONT » are the same. */
export function foldName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}
export const phoneDigits = (phone: string) => phone.replace(/\D/g, "").replace(/^(00|0)?32/, "0").slice(-9);
function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}
export type DuplicateReason = "email" | "phone" | "name";
/**
 * Pairs of contacts that are probably the same person: the same email, the
 * same phone number, or a name that differs by at most one letter (accents,
 * case and word order ignored). Each pair once, the reason the strongest.
 */
export function findDuplicates<T extends { id: string; full_name: string; email: string; phone: string; archived?: boolean }>(contacts: T[]) {
  const live = contacts.filter((c) => !c.archived);
  const pairs = new Map<string, { a: T; b: T; reason: DuplicateReason }>();
  const add = (a: T, b: T, reason: DuplicateReason) => {
    const key = [a.id, b.id].sort().join(":");
    if (!pairs.has(key)) pairs.set(key, a.id < b.id ? { a, b, reason } : { a: b, b: a, reason });
  };
  const by = (f: (c: T) => string, reason: DuplicateReason) => {
    const groups = new Map<string, T[]>();
    for (const c of live) {
      const k = f(c);
      if (k) groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    for (const g of groups.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) add(g[i], g[j], reason);
  };
  by((c) => c.email.trim().toLowerCase(), "email");
  by((c) => (phoneDigits(c.phone).length >= 8 ? phoneDigits(c.phone) : ""), "phone");
  // Close names, compared within the same first letter only.
  const folded = live.map((c) => ({ c, n: foldName(c.full_name) })).filter((x) => x.n.length >= 5);
  const buckets = new Map<string, typeof folded>();
  for (const x of folded) buckets.set(x.n[0], [...(buckets.get(x.n[0]) ?? []), x]);
  for (const g of buckets.values())
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (distance(g[i].n, g[j].n) <= 1) add(g[i].c, g[j].c, "name");
  return [...pairs.values()];
}
