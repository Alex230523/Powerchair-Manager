import { z } from "zod";
import { ruleKeys } from "./catalog";

/** B7: what a club changes in its automations. */
const message = z.object({ subject: z.string().trim().min(2).max(200), body: z.string().trim().min(2).max(4000) });
export const automationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rule"),
    rule: z.enum(ruleKeys),
    enabled: z.boolean(),
    paused: z.boolean(),
    delayDays: z.number().int().min(0).max(365).nullable().optional(),
    recipients: z.enum(["person", "president", "responsible"]).optional(),
    actions: z.array(z.enum(["notify", "email", "task"])).max(3).optional(),
    /** Per language; an absent language keeps the default text. */
    messages: z.object({ fr: message.optional(), nl: message.optional(), en: message.optional() }).optional(),
  }),
  /** The global stop: nothing leaves any more, at once, until it is lifted. */
  z.object({ action: z.literal("stop"), stopped: z.boolean() }),
]);
export type AutomationCommand = z.infer<typeof automationCommand>;
