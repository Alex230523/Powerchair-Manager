import { z } from "zod";

/**
 * Console, series C (06/11/2026): the support desk. The person's side
 * (open, reply, close one's own ticket) and the operators' side (reply,
 * assign, priority, close, reopen, canned replies, a reminder to a
 * presidency about a GDPR request).
 */
export const ticketCategories = ["question", "billing", "bug", "data", "other"] as const;
export const ticketStates = ["open", "answered", "closed"] as const;
export const ticketPriorities = ["low", "normal", "high"] as const;
export type TicketCategory = (typeof ticketCategories)[number];
export type TicketState = (typeof ticketStates)[number];
export type TicketPriority = (typeof ticketPriorities)[number];
const text = z.string().trim().min(1).max(4000);

export const supportCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), category: z.enum(ticketCategories), subject: z.string().trim().min(3).max(160), text }),
  z.object({ action: z.literal("reply"), id: z.uuid(), text }),
  z.object({ action: z.literal("close"), id: z.uuid() }),
]);
export type SupportCommand = z.infer<typeof supportCommand>;

export const supportOperatorCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), id: z.uuid(), text, close: z.boolean().default(false) }),
  z.object({ action: z.literal("assign"), id: z.uuid(), toMe: z.boolean().default(true) }),
  z.object({ action: z.literal("priority"), id: z.uuid(), priority: z.enum(ticketPriorities) }),
  z.object({ action: z.literal("close"), id: z.uuid() }),
  z.object({ action: z.literal("reopen"), id: z.uuid() }),
  z.object({ action: z.literal("template"), id: z.uuid().nullable().default(null), name: z.string().trim().min(2).max(80), fr: text, nl: z.string().trim().max(4000).default(""), en: z.string().trim().max(4000).default("") }),
  z.object({ action: z.literal("archiveTemplate"), id: z.uuid() }),
  z.object({ action: z.literal("privacyRemind"), requestId: z.uuid() }),
]);
export type SupportOperatorCommand = z.infer<typeof supportOperatorCommand>;

/** A ticket's text is read in the language of the operator; the template in the person's. */
export const templateText = (t: { text_fr: string; text_nl: string; text_en: string }, locale: string) => (locale === "nl" && t.text_nl ? t.text_nl : locale === "en" && t.text_en ? t.text_en : t.text_fr);
/** The certificate's number: RGPD-YYYY-NNNN. */
export const certificateNumber = (year: number, seq: number) => `RGPD-${year}-${String(seq).padStart(4, "0")}`;
/** Hours between two instants, one decimal. */
export const hoursBetween = (from: string | Date, to: string | Date) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 360000) / 10;
