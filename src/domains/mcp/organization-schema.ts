import { z } from "zod";

/** Console, series E: the pure parts of a club's MCP connector (no import of the services, so the integrations module can read them). */
export const orgScopes = ["club:read", "calendar:read", "dues:read"] as const;
export type OrgScope = (typeof orgScopes)[number];
export const RATE_PER_MINUTE = 60;
export const orgKeyCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createMcpKey"), name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(orgScopes)).min(1) }),
  z.object({ action: z.literal("revokeMcpKey"), id: z.uuid() }),
]);
export type OrgKeyCommand = z.infer<typeof orgKeyCommand>;
