import { z } from "zod";

/** Console, step 1 (05/11/2026): pure parts, shared with the screens. */
export const operatorRoles = ["owner", "support", "finance", "readonly"] as const;
export type OperatorRole = (typeof operatorRoles)[number];
export const consoleCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), organizationId: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("addOperator"), email: z.email().max(200), role: z.enum(operatorRoles) }),
  z.object({ action: z.literal("revokeOperator"), userId: z.string().min(1).max(100) }),
  /** Step 3: the organisation becomes read only for its members, with the reason they read. */
  z.object({ action: z.literal("suspend"), organizationId: z.uuid(), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("reinstate"), organizationId: z.uuid() }),
  /** Step 3b: open the organisation as its president for a while, with a reason the presidency reads. */
  z.object({ action: z.literal("borrow"), organizationId: z.uuid(), reason: z.string().trim().min(5).max(500), minutes: z.number().int().min(5).max(120).default(30) }),
  z.object({ action: z.literal("borrowEnd"), id: z.uuid() }),
  /** Series D: the presidency is told of the probable duplicates of identity in its club (never merged by the platform). */
  z.object({ action: z.literal("duplicatesNotify"), organizationId: z.uuid() }),
]);
/** Series D: the console asks a session younger than this (hours); PFM_OPERATOR_SESSION_HOURS. */
export const operatorSessionHours = (env: Record<string, string | undefined> = process.env) => {
  const h = Number(env.PFM_OPERATOR_SESSION_HOURS ?? "12");
  return Number.isFinite(h) && h >= 1 && h <= 168 ? h : 12;
};
/** Series D: a key to review: never used after 30 days, unused for 60 days, or older than 180 days. */
export const keyReview = (k: { created_at: string | Date; last_used_at: string | Date | null }, now = new Date()): "unused" | "idle" | "old" | null => {
  const age = (now.getTime() - new Date(k.created_at).getTime()) / 86400000;
  if (age > 180) return "old";
  if (!k.last_used_at) return age > 30 ? "unused" : null;
  return (now.getTime() - new Date(k.last_used_at).getTime()) / 86400000 > 60 ? "idle" : null;
};
/** Series D: the checklist of an organisation's first steps on the platform. */
export const onboardingSteps = { club: ["president", "dpa", "identity", "season", "team", "players", "match", "subscription", "paid"], federation: ["president", "identity", "clubs", "policy", "season", "competition", "subscription", "paid"] } as const;
export type OnboardingStep = (typeof onboardingSteps)[keyof typeof onboardingSteps][number];
export type ConsoleCommand = z.infer<typeof consoleCommand>;
