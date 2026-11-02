import { z } from "zod";

/** H1: the recruitment of new players. Pure parts. */
export const prospectSources = ["rehab", "school", "association", "fair", "social", "word_of_mouth", "other"] as const;
export const prospectStages = ["first_contact", "trial_planned", "trial_done", "follow_up", "registered", "not_now"] as const;
export type ProspectStage = (typeof prospectStages)[number];
const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const prospectFields = {
  firstName: text(80).min(1),
  lastName: text(80).default(""),
  minor: z.boolean().default(false),
  approxAge: z.number().int().min(3).max(99).nullable().default(null),
  email: z.union([z.literal(""), z.email().max(254)]).default(""),
  phone: text(40).default(""),
  parentName: text(120).default(""),
  parentEmail: z.union([z.literal(""), z.email().max(254)]).default(""),
  parentPhone: text(40).default(""),
  source: z.enum(prospectSources),
  originOrganizationId: id.nullable().default(null),
  originContactId: id.nullable().default(null),
  ownChair: z.boolean().nullable().default(null),
  needsTransport: z.boolean().nullable().default(null),
  /** Practical needs only, never health. */
  notes: text(1000).default(""),
  consent: z.boolean().default(false),
};
export const prospectCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...prospectFields }).refine((v) => !v.minor || v.parentName.length >= 2, { message: "PARENT_REQUIRED", path: ["parentName"] }),
  z.object({ action: z.literal("update"), id, ...prospectFields }).refine((v) => !v.minor || v.parentName.length >= 2, { message: "PARENT_REQUIRED", path: ["parentName"] }),
  z.object({ action: z.literal("stage"), id, stage: z.enum(prospectStages) }),
  z.object({ action: z.literal("contacted"), id }),
  /** The trial: an existing session, or a new one; a club chair booked for it; the invitation sent. */
  z.object({
    action: z.literal("trial"),
    id,
    eventId: id.nullable().default(null),
    startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
    teamId: id.nullable().default(null),
    chairId: id.nullable().default(null),
    bring: text(500).default(""),
    locale: z.enum(["fr", "nl", "en"]).default("fr"),
  }),
  /** « Inscrire »: the prospect becomes a player (with his parent), nothing typed again. */
  z.object({ action: z.literal("register"), id }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("retention"), months: z.number().int().min(6).max(60) }),
  /** A recruitment partner: « Présenter le club » every year, in the to-do. */
  z.object({ action: z.literal("presentReminder"), organizationId: id, dueOn: z.iso.date() }),
]);
export type ProspectCommand = z.infer<typeof prospectCommand>;

/** The indicators by source: prospects, share who came to a trial, share registered, still there after a season. */
export function indicators(rows: { source: string; reached_trial: boolean; registered: boolean }[], kept: { source: string; still: boolean }[]) {
  const by = new Map<string, { source: string; prospects: number; trial: number; registered: number; kept: number; keptOf: number }>();
  for (const r of rows) {
    const v = by.get(r.source) ?? { source: r.source, prospects: 0, trial: 0, registered: 0, kept: 0, keptOf: 0 };
    v.prospects++;
    if (r.reached_trial) v.trial++;
    if (r.registered) v.registered++;
    by.set(r.source, v);
  }
  for (const k of kept) {
    const v = by.get(k.source) ?? { source: k.source, prospects: 0, trial: 0, registered: 0, kept: 0, keptOf: 0 };
    v.keptOf++;
    if (k.still) v.kept++;
    by.set(k.source, v);
  }
  const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : null);
  return [...by.values()].map((v) => ({ ...v, trialRate: pct(v.trial, v.prospects), registerRate: pct(v.registered, v.prospects), keptRate: pct(v.kept, v.keptOf) })).sort((a, b) => b.prospects - a.prospects);
}
/** The stages that count as having reached a trial. */
export const afterTrial: ProspectStage[] = ["trial_done", "follow_up", "registered"];
