import { z } from "zod";

/**
 * Wave 11: the club's contact book, grant applications (subsides) and
 * partners (sponsors, donors, patrons, foundations). Grants and partners are
 * money matters (dues.read to see, dues.manage to change); the contact book
 * is open to the staff and edited by those who manage people or mails.
 */
const text = (n: number) => z.string().trim().max(n);
const day = z.iso.date().nullable().optional();
const cents = z.number().int().min(0).max(100000000);

export const contactTags = [
  "sponsor",
  "donor",
  "public",
  "federation",
  "venue",
  "press",
  "supplier",
  "medical",
  "volunteer",
  "other",
] as const;
export type ContactTag = (typeof contactTags)[number];
export const contactCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contact"),
    id: z.uuid().optional(),
    fullName: text(120).min(2),
    organizationName: text(160),
    role: text(120),
    email: z.union([z.literal(""), z.email().max(200)]),
    phone: text(40),
    tags: z.array(z.enum(contactTags)).max(10),
    notes: text(4000),
    archived: z.boolean().optional(),
  }),
]);
export type ContactCommand = z.infer<typeof contactCommand>;

export const grantStatuses = ["idea", "submitted", "granted", "refused", "paid", "closed"] as const;
export type GrantStatus = (typeof grantStatuses)[number];
export const partnerKinds = ["sponsor", "donor", "patron", "foundation"] as const;
export const partnerStatuses = ["prospect", "active", "ended"] as const;

export const fundingCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    id: z.uuid().optional(),
    seasonId: z.uuid().nullable().optional(),
    funder: text(160).min(2),
    program: text(160),
    purpose: text(2000),
    requestedCents: cents,
    grantedCents: cents.nullable().optional(),
    status: z.enum(grantStatuses),
    deadlineOn: day,
    submittedOn: day,
    decisionOn: day,
    paidOn: day,
    reportDueOn: day,
    contactId: z.uuid().nullable().optional(),
    notes: text(4000),
  }),
  z.object({ action: z.literal("deleteGrant"), id: z.uuid() }),
  z.object({
    action: z.literal("partner"),
    id: z.uuid().optional(),
    name: text(160).min(2),
    kind: z.enum(partnerKinds),
    status: z.enum(partnerStatuses),
    amountCents: cents,
    inKind: text(400),
    counterpart: text(400),
    startsOn: day,
    endsOn: day,
    nextActionOn: day,
    nextAction: text(200),
    contactId: z.uuid().nullable().optional(),
    notes: text(4000),
  }),
  z.object({ action: z.literal("deletePartner"), id: z.uuid() }),
]);
export type FundingCommand = z.infer<typeof fundingCommand>;

/** What a grant row needs next, for the list and the home agenda. */
export function grantNext(g: {
  status: GrantStatus;
  deadline_on: string | null;
  report_due_on: string | null;
}): { kind: "deadline" | "report"; date: string } | null {
  if (g.status === "idea" && g.deadline_on) return { kind: "deadline", date: g.deadline_on };
  if ((g.status === "granted" || g.status === "paid") && g.report_due_on)
    return { kind: "report", date: g.report_due_on };
  return null;
}
/** The next date of a partner: a planned step, or the end of the agreement. */
export function partnerNext(p: {
  status: string;
  ends_on: string | null;
  next_action_on: string | null;
}): { kind: "action" | "renewal"; date: string } | null {
  if (p.status === "ended") return null;
  if (p.next_action_on) return { kind: "action", date: p.next_action_on };
  if (p.status === "active" && p.ends_on) return { kind: "renewal", date: p.ends_on };
  return null;
}
