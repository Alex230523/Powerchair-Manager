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
]);
export type ConsoleCommand = z.infer<typeof consoleCommand>;
