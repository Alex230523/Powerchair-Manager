import { z } from "zod";
export const responses = ["none", "present", "absent", "uncertain"] as const;
export const actuals = [
  "unchecked",
  "present",
  "absent",
  "late",
  "early",
] as const;
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
  }),
  z.object({
    action: z.literal("mark"),
    id,
    expectedVersion: version,
    actual: z.enum(actuals),
    reason: z.string().trim().max(1000),
  }),
  z.object({ action: z.literal("close"), id, expectedVersion: version }),
  z.object({ action: z.literal("remind"), id, expectedVersion: version }),
]);
export type Command = z.infer<typeof commandSchema>;
