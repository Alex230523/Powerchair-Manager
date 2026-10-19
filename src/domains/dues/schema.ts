import { z } from "zod";
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    seasonId: z.uuid(),
    category: z.string().trim().min(2).max(80),
    amountCents: z.number().int().min(0).max(100000000),
    maxInstallments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
  }),
  z.object({ action: z.literal("archivePlan"), id: z.uuid() }),
  z.object({
    action: z.literal("issue"),
    planId: z.uuid(),
    profileId: z.uuid(),
    discountCents: z.number().int().min(0).max(100000000).default(0),
    reason: z.string().trim().max(500).default(""),
    installments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
    applicationId: z.uuid().optional(),
  }),
  z.object({
    action: z.literal("schedule"),
    id: z.uuid(),
    version: z.number().int().positive(),
    installments: z.number().int().min(1).max(12),
    firstDue: z.iso.date(),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.uuid(),
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function schedule(cents: number, count: number, first: string) {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    cents > 100000000 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12 ||
    !z.iso.date().safeParse(first).success
  )
    throw new Error("INVALID_INPUT");
  const [year, month, day] = first.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const end = new Date(Date.UTC(year, month + i, 0));
    const date = new Date(
      Date.UTC(year, month - 1 + i, Math.min(day, end.getUTCDate())),
    );
    return {
      ordinal: i + 1,
      due_on: date.toISOString().slice(0, 10),
      amount_cents: Math.floor(cents / count) + (i < cents % count ? 1 : 0),
    };
  });
}
