import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bpcfPolicy, certificateNumber, fineDefault, policyOf, policySchema, trainingIndemnity } from "../src/domains/federation/policy";
import { consoleCommand, operatorRoles } from "../src/domains/console/schema";
import { envOperators } from "../src/domains/console/service";
import { federationPolicyCopy } from "../src/components/federation-policy-copy";
import { consoleCopy } from "../src/components/console-copy";
import { transfersCopy } from "../src/components/transfers-copy";
import { apiRoutes, pages } from "./access-matrix";

/** 05/11/2026: the federation's rulebook as data, the international dossier, the operator's console. */
const keys = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v !== null && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])) : [];

describe("the rulebook of a federation", () => {
  it("applies the BPCF 2025 scale without a policy, and completes a partial one", () => {
    expect(policyOf(undefined)).toEqual(bpcfPolicy);
    expect(policyOf({ trainingRates: { international: { academy: 60000 } }, fineDefaults: { late: -5 } })).toMatchObject({
      trainingRates: { national: bpcfPolicy.trainingRates.national, international: { academy: 60000, elite: 75000, elite_certified: 100000 } },
      fineDefaults: { late: 2500 },
    });
    expect(policySchema.safeParse(bpcfPolicy).success).toBe(true);
    expect(policySchema.safeParse({ ...bpcfPolicy, internationalFileFeeCents: -1 }).success).toBe(false);
  });
  it("computes the compensation from the policy given, capped, with the file fee abroad", () => {
    expect(trainingIndemnity("academy", 3)).toBe(15000);
    expect(trainingIndemnity("academy", 2, "international")).toBe(125000);
    const nl = policyOf({ trainingRates: { international: { academy: 60000 } }, internationalFileFeeCents: 30000, indemnityCaps: { international: 100000 } });
    expect(trainingIndemnity("academy", 2, "international", nl)).toBe(100000);
    expect(trainingIndemnity("academy", 1, "international", nl)).toBe(90000);
    expect(trainingIndemnity("", 3, "national", nl)).toBeNull();
    expect(fineDefault(nl, "late")).toBe(2500);
    expect(fineDefault(nl, "other")).toBeNull();
  });
  it("numbers the certificates by year and sequence", () => {
    expect(certificateNumber(2026, 7)).toBe("CIT-2026-0007");
  });
  it("says the same things in the three languages", () => {
    for (const copy of [federationPolicyCopy, consoleCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
    }
    expect(keys(transfersCopy.nl.bpcf2)).toEqual(keys(transfersCopy.fr.bpcf2));
    expect(keys(transfersCopy.en.bpcf2)).toEqual(keys(transfersCopy.fr.bpcf2));
    for (const f of ["src/components/federation-policy-copy.ts", "src/components/console-copy.ts", "src/components/transfers-copy.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/[—–]/);
  });
});

describe("the operator's console", () => {
  it("reads the owners from the configuration, trimmed and lower-cased", () => {
    expect(envOperators({})).toEqual([]);
    expect(envOperators({ PFM_OPERATOR_EMAILS: " Alex@Example.test ,, sam@example.test " })).toEqual(["alex@example.test", "sam@example.test"]);
  });
  it("accepts only the commands it knows, with a real role", () => {
    expect(operatorRoles).toEqual(["owner", "support", "finance", "readonly"]);
    expect(consoleCommand.safeParse({ action: "addOperator", email: "a@b.test", role: "support" }).success).toBe(true);
    expect(consoleCommand.safeParse({ action: "addOperator", email: "a@b.test", role: "god" }).success).toBe(false);
    expect(consoleCommand.safeParse({ action: "note", organizationId: "x", text: "y" }).success).toBe(false);
  });
  it("is in the access matrix, refused to every club or federation role", () => {
    const c = apiRoutes["console"];
    expect(c.methods).toEqual(["GET", "POST"]);
    expect(Object.values(c.expect!.GET!).filter((s) => s === 200)).toEqual([]);
    expect(pages["/console"]).toBeDefined();
    expect(pages["/federation/policy"]).toBeDefined();
  });
  it("has its own bar in the shell and never the club menu", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain('console-bar');
    expect(shell).toMatch(/\/console\(\\\/\|\$\)\//);
  });
});

describe("the platform's billing (console, step 4) and the suspension (step 3)", () => {
  it("numbers invoices per year, computes the monthly equivalent and the reminder steps", async () => {
    const { invoiceNumber, monthlyCents, reminderDue, billingCommand } = await import("../src/domains/billing/schema");
    expect(invoiceNumber(2026, 12)).toBe("F-2026-0012");
    expect(monthlyCents(24000, "year")).toBe(2000);
    expect(monthlyCents(300, "month", 3)).toBe(900);
    expect(reminderDue("2026-11-01", "2026-11-02", 0)).toBe(0);
    expect(reminderDue("2026-11-01", "2026-11-04", 0)).toBe(1);
    expect(reminderDue("2026-11-01", "2026-11-04", 1)).toBe(0);
    expect(reminderDue("2026-11-01", "2026-11-12", 1)).toBe(2);
    expect(reminderDue("2026-11-01", "2026-11-25", 2)).toBe(3);
    expect(reminderDue("2026-11-01", "2026-12-25", 3)).toBe(0);
    expect(billingCommand.safeParse({ action: "plan", code: "Club An", name: "x", amountCents: 1, period: "year", basis: "organization" }).success).toBe(false);
    expect(billingCommand.safeParse({ action: "plan", code: "club-an", name: "Club", amountCents: 1, period: "year", basis: "organization" }).success).toBe(true);
  });
  it("blocks the writes of a suspended organisation at the door, the account and the console apart", () => {
    const http = readFileSync("src/lib/http.ts", "utf8");
    expect(http).toContain('ORG_SUSPENDED');
    expect(http).toMatch(/workspace\|account\|auth\|console\|feedback/);
    expect(readFileSync("src/components/app-shell.tsx", "utf8")).toContain("suspended-banner");
    expect(apiRoutes["console/billing"].expect!.GET!.president).toBe(403);
    expect(apiRoutes["club/billing"].expect!.GET!.coach).toBe(403);
  });
});

describe("the MCP server of the console (step 6)", () => {
  it("declares its tools with a scope, a JSON schema and no personal data; the keys carry known scopes", async () => {
    const { tools, mcpScopes, mcpKeyCommand, rpcRequest } = await import("../src/domains/mcp/schema");
    expect(tools.map((t) => t.name)).toEqual(["platform_overview", "list_organizations", "organization", "supervision", "billing_overview", "invoices", "send_reminder", "mark_invoice_paid", "add_note"]);
    for (const t of tools) {
      expect(mcpScopes).toContain(t.scope);
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(t.readOnly).toBe(t.scope.endsWith(":read"));
    }
    expect(mcpKeyCommand.safeParse({ action: "createKey", name: "x", scopes: ["console:read"] }).success).toBe(false);
    expect(mcpKeyCommand.safeParse({ action: "createKey", name: "Claude", scopes: ["console:read", "root"] }).success).toBe(false);
    expect(rpcRequest.safeParse({ jsonrpc: "2.0", id: 1, method: "tools/list" }).success).toBe(true);
    expect(rpcRequest.safeParse({ jsonrpc: "1.0", id: 1, method: "tools/list" }).success).toBe(false);
    expect(apiRoutes["mcp"].expect!.POST!.president).toBe(401);
    expect(apiRoutes["mcp"].expect!.GET!.anonymous).toBe(405);
    expect(readFileSync("src/app/api/mcp/route.ts", "utf8")).not.toContain("principal(");
  });
});

describe("the support access (console, step 3b)", () => {
  it("asks a reason and a bounded duration, and never counts as the organisation's own president", () => {
    expect(consoleCommand.safeParse({ action: "borrow", organizationId: "00000000-0000-4000-8000-000000000000", reason: "Vérification", minutes: 30 }).success).toBe(true);
    expect(consoleCommand.safeParse({ action: "borrow", organizationId: "00000000-0000-4000-8000-000000000000", reason: "x", minutes: 30 }).success).toBe(false);
    expect(consoleCommand.safeParse({ action: "borrow", organizationId: "00000000-0000-4000-8000-000000000000", reason: "Vérification", minutes: 600 }).success).toBe(false);
    // The « at least one president » rule looks at mandates without an end: a borrow has one.
    expect(readFileSync("src/domains/access/service.ts", "utf8")).toMatch(/role IN \('club_president','federation_president'\) AND r\.valid_until IS NULL/);
    expect(readFileSync("src/domains/console/service.ts", "utf8")).toContain("make_interval(mins => $4)");
  });
});

describe("the console's figures, alerts and reports (series A)", () => {
  it("builds a readable report from a summary, in euros, without dashes", async () => {
    const { reportLines, alertRules, metricKeys } = await import("../src/domains/console/metrics");
    const lines = reportLines({
      month: "2026-10-01",
      end: { clubs: 12, federations: 1, players: 90, mrr: 240000, open: 50000, late: 10000, lateCount: 1, subscriptions: 11, accounts: 300, active30: 120, storageBytes: 5 * 1048576 },
      start: { clubs: 10, mrr: 200000 },
      billing: { invoiced: 300000, collected: 250000, invoices: 11, reminders: 3 },
      interventions: 7,
      borrows: 1,
      dataRequests: { received: 2, done: 1 },
      feedback: 4,
      jobsFailed: 0,
      countries: [{ country: "BE", clubs: 10 }, { country: "NL", clubs: 2 }],
    });
    const text = lines.map((l) => l.text).join("\n");
    expect(text).toContain("Clubs : 12 (+2 sur le mois)");
    expect(text).toContain("2400,00 €");
    expect(text).toContain("NL : 2 club(s)");
    expect(text).toContain("Stockage : 5.0 Mo");
    expect(text).not.toMatch(/[—–]/);
    expect(alertRules).toContain("invoicesFinalReminder");
    expect(metricKeys).toContain("mrr");
    expect(apiRoutes["console/alerts"].expect!.GET!.president).toBe(403);
    expect(apiRoutes["console/reports"].expect!.POST!.federation).toBe(400);
  });
});

describe("the platform's electronic invoices and the Mollie webhook (series B)", () => {
  it("builds a Peppol BIS 3.0 invoice, VAT included in the amount, escaped, and a VAT-free one", async () => {
    const { ublXml, beVat, vatRate, seller } = await import("../src/domains/billing/ubl");
    const inv = { number: "F-2026-0007", issued_on: "2026-11-06", due_on: "2026-12-06", label: "Club, annuel · 1 nov. 2026 au 31 oct. 2027", quantity: 1, unit_cents: 24200, amount_cents: 24200, period_from: "2026-11-01", period_to: "2027-10-31", paid_on: null, customer: { name: "Club <A> & co", company_number: "0123.456.789", address: "Rue du Stade 1", country: "BE" } };
    const env = { PFM_SELLER_NAME: "PFM SRL", PFM_SELLER_VAT: "BE0999999999", PFM_SELLER_IBAN: "BE68 5390 0754 7034", PFM_SELLER_EMAIL: "factures@pfm.test", PFM_VAT_RATE: "21" };
    const xml = ublXml(inv, env);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0");
    expect(xml).toContain("<cbc:RegistrationName>Club &lt;A&gt; &amp; co</cbc:RegistrationName>");
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">200.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">242.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain("<cbc:Percent>21</cbc:Percent>");
    expect(xml).toContain("<cbc:PaymentID>F-2026-0007</cbc:PaymentID>");
    expect(xml).toContain("<cbc:ID>BE68 5390 0754 7034</cbc:ID>");
    expect(xml).toContain("<cbc:Note>Due on 2026-12-06</cbc:Note>");
    expect(xml).not.toMatch(/[—–]/);
    const free = ublXml(inv, { ...env, PFM_VAT_RATE: "0" });
    expect(free).toContain("<cbc:ID>O</cbc:ID>");
    expect(free).toContain('<cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>');
    expect(free).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">242.00</cbc:TaxExclusiveAmount>');
    expect(beVat("0123.456.789")).toBe("BE0123456789");
    expect(beVat("")).toBe("");
    expect(vatRate({ PFM_VAT_RATE: "abc" })).toBe(21);
    expect(vatRate({ PFM_VAT_RATE: "6" })).toBe(6);
    expect(seller({}).country).toBe("BE");
  });
  it("answers Mollie without a session: 503 unconfigured, 405 on GET; the presidency downloads its own UBL only", () => {
    expect(apiRoutes["billing/mollie"].skip).toContain("503");
    const route = readFileSync("src/app/api/billing/mollie/route.ts", "utf8");
    expect(route).not.toContain("principal(");
    expect(route).toContain("status: 503");
    expect(route).toContain("status: 405");
    expect(readFileSync("src/domains/billing/ubl.ts", "utf8")).toContain("i.organization_id=$2");
    expect(consoleCopy.fr.billing.paidVia.mollie).toBe("en ligne");
  });
});
