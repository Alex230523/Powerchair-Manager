import { z } from "zod";
export const responses = ["none", "present", "absent", "uncertain"] as const;
export const absenceReasons = [
  "illness",
  "injury",
  "chair",
  "transport",
  "school_work",
  "family",
  "other",
] as const;
/** Wave 17 (J2): « excused » is an absence announced beforehand, counted apart. */
export const actuals = [
  "unchecked",
  "present",
  "absent",
  "excused",
  "late",
  "early",
] as const;
/** Marks that count as attended. */
export const attendedMarks = ["present", "late", "early"] as const;
const id = z.uuid(),
  version = z.number().int().positive();
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("invite"),
    eventId: id,
    expectedVersion: version.nullable(),
    profiles: z
      .array(id)
      .min(1)
      .max(300)
      .refine((v) => new Set(v).size === v.length),
    deadline: z.iso.datetime({ offset: true }),
    minimum: z.number().int().min(0).max(300),
  }),
  z.object({
    action: z.literal("respond"),
    id,
    expectedVersion: version,
    response: z.enum(responses),
    comment: z.string().trim().max(1000),
    absenceReason: z.enum(absenceReasons).optional(),
  }),
  /** 27: one answer for several children invited to the same event (« Présents tous les deux »). */
  z.object({
    action: z.literal("respondMany"),
    items: z
      .array(z.object({ id, expectedVersion: version }))
      .min(1)
      .max(10)
      .refine((v) => new Set(v.map((i) => i.id)).size === v.length),
    response: z.enum(responses),
    comment: z.string().trim().max(1000),
    absenceReason: z.enum(absenceReasons).optional(),
  }),
  z.object({
    action: z.literal("mark"),
    id,
    expectedVersion: version,
    actual: z.enum(actuals),
    reason: z.string().trim().max(1000),
  }),
  /** Wave 17 (J2): « Tout présent », everyone not yet marked of an open register. */
  z.object({ action: z.literal("markAll"), id, expectedVersion: version }),
  z.object({ action: z.literal("close"), id, expectedVersion: version }),
  z.object({ action: z.literal("remind"), id, expectedVersion: version }),
]);
export type Command = z.infer<typeof commandSchema>;
