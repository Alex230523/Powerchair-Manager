import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { redactForModel, redactText, withheldField } from "../src/lib/redact";
import { subprocessors } from "../src/domains/legal/texts";

/**
 * Security (07/11/2026), data leaking to an AI. Whatever a model reads
 * leaves the platform for its provider. It gets the facts a question needs,
 * never the means to reach or identify a person further; a ticket about
 * personal data keeps its words; the people concerned are told where it goes.
 */
const read = (f: string) => readFileSync(f, "utf8");

describe("data leaking to an AI", () => {
  it("masks what reaches or identifies a person, in free text, and keeps what the tools need", () => {
    const text =
      "Appelez-moi au 0470 12 34 56 ou au +32 470 12 34 56 (bureau 02/512.34.56), ou dan.leroy@example.be. IBAN BE68 5390 0754 7034, numéro national 85.07.30-033.61 (85073003361), carte 4111 1111 1111 1111.";
    const out = redactText(text);
    for (const leak of ["0470", "512.34", "dan.leroy", "example.be", "BE68", "5390", "85.07.30", "85073003361", "4111"]) expect(out, leak).not.toContain(leak);
    for (const label of ["[téléphone]", "[e-mail]", "[IBAN]", "[numéro national]", "[carte]"]) expect(out).toContain(label);
    // The tools' identifiers, dates, amounts and invoice numbers stay as they are.
    const kept = "Ticket 0f8fad5b-d9cb-469f-a165-70867728950e, facture PFM-2026-000123 du 2026-11-07 (07/11/2026), 240,00 EUR, 12 joueurs, saison 2026-27.";
    expect(redactText(kept)).toBe(kept);
  });

  it("withholds the fields that reach a person, whatever their value, at any depth", () => {
    for (const k of ["email", "requester_email", "phone", "mobile", "iban", "bic", "birth_date", "national_sealed", "address", "public_token", "key_hash", "birthDate", "nationalNumber"]) expect(withheldField(k), k).toBe(true);
    for (const k of ["name", "requester", "organization", "amount_cents", "created_at", "emails_sent", "company_number", "role"]) expect(withheldField(k), k).toBe(false);
    const out = redactForModel({ ticket: { id: "0f8fad5b-d9cb-469f-a165-70867728950e", requester: "Dan Leroy", email: "dan@example.be", subject: "Mon tel 0470123456" }, officers: [{ name: "Eva", role: "club_president", email: "eva@example.be" }], amount_cents: 24000, when: new Date(0) });
    expect(out).toEqual({ ticket: { id: "0f8fad5b-d9cb-469f-a165-70867728950e", requester: "Dan Leroy", subject: "Mon tel [téléphone]" }, officers: [{ name: "Eva", role: "club_president" }], amount_cents: 24000, when: new Date(0) });
  });

  it("masks every tool's result before a model reads it: the console's assistant, the operators' and the clubs' MCP", () => {
    const service = read("src/domains/mcp/service.ts");
    expect(service).toMatch(/\/\/ Security \(07\/11\/2026\), data leaking to an AI[^\n]*\n\s*return redactForModel\(out\);\n\}/);
    expect(service).toContain('messages: v.ticket.category === "data" ? v.messages.map((m) => ({ ...m, text: withheldText })) : v.messages');
    // The assistant and the MCP server go through runTool only.
    expect(read("src/domains/assistant/service.ts").match(/runTool\(db, inner\(p\)/g)).toHaveLength(2);
    expect(service).toMatch(/const out = await runTool\(db, p, tool\.name, a\);/);
    const org = read("src/domains/mcp/organization.ts");
    expect(org).toContain("return redactForModel(await orgToolRaw(db, org, name, a));");
    expect(org.match(/orgToolRaw\(/g)).toHaveLength(2);
    // Nothing of the conversation is kept by the server, nor in the browser's storage.
    const assistant = read("src/domains/assistant/service.ts");
    expect(assistant).not.toMatch(/INSERT INTO[^"`]*(message|conversation)/i);
    expect(read("src/components/console.tsx")).not.toMatch(/(local|session)Storage/);
  });

  it("tells the people concerned where it goes", () => {
    const names = subprocessors.map((s) => s.name.fr);
    expect(names.some((n) => n.includes("Anthropic"))).toBe(true);
    expect(names.some((n) => n.includes("GitHub"))).toBe(true);
    for (const s of subprocessors.filter((s) => /Anthropic|GitHub/.test(s.name.fr))) expect(typeof s.region === "string" ? s.region : s.region.fr).toMatch(/États-Unis/);
    const copy = read("src/components/console-copy.ts");
    expect(copy.match(/leaves: "[^"]*(Anthropic)[^"]*"/g)).toHaveLength(3);
    expect(read("src/components/console.tsx")).toContain('<p className="muted small">{a.leaves}</p>');
    expect(read("src/components/public-copy.ts").match(/mcpHint: "[^"]*(fournisseur|leverancier|provider)[^"]*"/g)).toHaveLength(3);
  });
});
