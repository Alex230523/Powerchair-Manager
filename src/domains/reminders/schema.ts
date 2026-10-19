import { z } from "zod";

export const reminderKinds = ["dues", "documents"] as const;
export type ReminderKind = (typeof reminderKinds)[number];

export const commandSchema = z.object({
  action: z.literal("send"),
  kind: z.enum(reminderKinds),
  profileIds: z.array(z.uuid()).min(1).max(300),
});
export type Command = z.infer<typeof commandSchema>;

export type Installment = { due_on: string; amount_cents: number };
/**
 * Dues situation of one receivable on a given day. Payments are recorded by the
 * bank module (lot 09); until then "overdue" means "due date passed", and the
 * treasurer decides who is really behind before sending a reminder.
 */
export function duesStatus(
  installments: Installment[],
  today: string,
  horizonDays = 14,
) {
  const horizon = addDays(today, horizonDays);
  const overdue = installments.filter((i) => i.due_on < today);
  const upcoming = installments.filter(
    (i) => i.due_on >= today && i.due_on <= horizon,
  );
  const next = installments.find((i) => i.due_on >= today) ?? null;
  return {
    overdueCents: overdue.reduce((n, i) => n + i.amount_cents, 0),
    overdueCount: overdue.length,
    upcomingCents: upcoming.reduce((n, i) => n + i.amount_cents, 0),
    next,
    /** Shown in the reminder list: something is due now or soon. */
    concerned: overdue.length > 0 || upcoming.length > 0,
  };
}
export function addDays(day: string, days: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Documents that still need an action from the family. */
export const pendingDocumentStatuses = [
  "missing",
  "requested",
  "refused",
  "expired",
] as const;
