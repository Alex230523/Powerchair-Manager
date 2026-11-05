import { z } from "zod";

/** Console, step 1 (05/11/2026): pure parts, shared with the screens. */
export const operatorRoles = ["owner", "support", "finance", "readonly"] as const;
export type OperatorRole = (typeof operatorRoles)[number];
export const consoleCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("note"), organizationId: z.uuid(), text: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("addOperator"), email: z.email().max(200), role: z.enum(operatorRoles) }),
  z.object({ action: z.literal("revokeOperator"), userId: z.string().min(1).max(100) }),
]);
export type ConsoleCommand = z.infer<typeof consoleCommand>;
