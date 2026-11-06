import { z } from "zod";

/**
 * Console, step 6 (06/11/2026): the MCP server of the console. Pure parts:
 * the scopes a key may carry, the tools with their input schemas, the
 * JSON-RPC envelope. The assistant client asks the person before every
 * tool call; the server journals every write.
 */
export const mcpScopes = ["console:read", "billing:read", "billing:write", "support:write"] as const;
export type McpScope = (typeof mcpScopes)[number];
export const mcpKeyCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createKey"), name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(mcpScopes)).min(1) }),
  z.object({ action: z.literal("revokeKey"), id: z.uuid() }),
]);
export type McpKeyCommand = z.infer<typeof mcpKeyCommand>;

const str = (description: string, maxLength = 80) => ({ type: "string", description, maxLength });
export type ToolDef = { name: string; description: string; scope: McpScope; readOnly: boolean; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false } };
export const tools: ToolDef[] = [
  { name: "platform_overview", description: "Counts and states of the whole platform: organisations by kind and country, people, activity, health, support, billing, compliance, the to-do list by rules and the latest interventions. No personal data.", scope: "console:read", readOnly: true, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "list_organizations",
    description: "The organisations (clubs and federations) with their country, federation, members, players, presidents, last activity and suspension; filter by name, kind or country.",
    scope: "console:read",
    readOnly: true,
    inputSchema: { type: "object", properties: { q: str("Part of the name"), kind: { type: "string", enum: ["club", "federation"] }, country: str("ISO country code (BE, NL, FR, GB...)", 2) }, additionalProperties: false },
  },
  { name: "organization", description: "One organisation in figures: members, players, teams, storage, agreements, officers (names and roles), subscription, internal notes and interventions.", scope: "console:read", readOnly: true, inputSchema: { type: "object", properties: { id: str("Organisation id (uuid)", 36) }, required: ["id"], additionalProperties: false } },
  { name: "supervision", description: "Technical health: scheduled tasks and their lateness, e-mails over 7 days, storage by organisation, latest migrations, open reports, GDPR requests in progress.", scope: "console:read", readOnly: true, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "billing_overview", description: "The platform's billing: recurring revenue, invoiced and collected this month, open and late amounts, plans and subscriptions.", scope: "billing:read", readOnly: true, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  {
    name: "invoices",
    description: "The platform's invoices with their state, due date, lateness and reminders; filter by state (draft, sent, paid, cancelled) or organisation id. Late invoices are those sent and past due.",
    scope: "billing:read",
    readOnly: true,
    inputSchema: { type: "object", properties: { state: { type: "string", enum: ["draft", "sent", "paid", "cancelled"] }, organization: str("Organisation id (uuid)", 36), late: { type: "boolean", description: "Only the late ones" } }, additionalProperties: false },
  },
  { name: "send_reminder", description: "Send the next reminder (1 courteous, 2 firm, 3 notice before read only) for a sent, unpaid invoice to the organisation's presidency. Three at most.", scope: "billing:write", readOnly: false, inputSchema: { type: "object", properties: { invoiceId: str("Invoice id (uuid)", 36) }, required: ["invoiceId"], additionalProperties: false } },
  { name: "mark_invoice_paid", description: "Record the payment of a sent invoice at the given date (YYYY-MM-DD).", scope: "billing:write", readOnly: false, inputSchema: { type: "object", properties: { invoiceId: str("Invoice id (uuid)", 36), paidOn: str("Date of payment, YYYY-MM-DD", 10) }, required: ["invoiceId", "paidOn"], additionalProperties: false } },
  { name: "add_note", description: "Add an internal note on an organisation (never shown to it).", scope: "support:write", readOnly: false, inputSchema: { type: "object", properties: { organizationId: str("Organisation id (uuid)", 36), text: str("The note", 2000) }, required: ["organizationId", "text"], additionalProperties: false } },
];

export const rpcRequest = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]).optional(), method: z.string().min(1).max(80), params: z.record(z.string(), z.unknown()).optional() });
export type RpcRequest = z.infer<typeof rpcRequest>;
export const PROTOCOL_VERSION = "2025-06-18";
export const serverInfo = { name: "powerchair-football-manager-console", version: "1.0.0" };
