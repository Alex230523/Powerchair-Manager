import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { eventKinds, securityEvent } from "../src/domains/security/events";
import { alertRules } from "../src/domains/security/alerts";
import { jobs } from "../src/domains/jobs/registry";

/**
 * Security (07/11/2026), missing logging and alerting: what is journaled,
 * from where it is written, how it is kept, and when the owners are told.
 */
const read = (f: string) => readFileSync(f, "utf8");

describe("missing logging and alerting", () => {
  it("knows each kind of event and how serious it is; every critical one alerts at once", () => {
    expect(eventKinds["cron.unauthorized"]).toBe("critical");
    expect(eventKinds["operator.added"]).toBe("critical");
    expect(eventKinds["auth.lockout"]).toBe("warning");
    for (const k of Object.keys(eventKinds)) expect(k).toMatch(/^[a-z]+\.[a-z_]+$/);
    const critical = alertRules.find((r) => r.key === "critical")!;
    expect(critical.threshold).toBe(1);
    expect([...critical.kinds].sort()).toEqual((Object.keys(eventKinds) as (keyof typeof eventKinds)[]).filter((k) => eventKinds[k] === "critical").sort());
    for (const r of alertRules) {
      expect(r.minutes, r.key).toBeLessThanOrEqual(15);
      for (const k of r.kinds) expect(eventKinds[k], `${r.key} ${k}`).toBeTruthy();
    }
    // Checked every five minutes by the scheduler.
    expect(jobs.security.every).toBe(5);
    expect(read("docs/production/scheduler.yml")).toContain("for task in mail attendance security reminders documents watchdog; do");
  });

  it("copies each event to the host's logs as one JSON line, without a person's data, and never breaks the request", async () => {
    const lines: string[] = [];
    const warn = console.warn,
      error = console.error;
    console.warn = (l: string) => lines.push(l);
    console.error = (l: string) => lines.push(l);
    try {
      await securityEvent({ query: async () => ({ rows: [] }) } as never, "auth.lockout", { source: "f".repeat(32), details: { failures: 10, email: "dan@example.be", note: "dan@example.be" } });
      await securityEvent({ query: async () => Promise.reject(new Error("down")) } as never, "key.invalid", { source: "x" });
    } finally {
      console.warn = warn;
      console.error = error;
    }
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({ level: "warn", event: "security.auth.lockout", severity: "warning", failures: 10 });
    expect(lines.join("\n")).not.toContain("dan@example.be");
    expect(lines.some((l) => JSON.parse(l).event === "security.journal_failed")).toBe(true);
  });

  it("writes the events where they happen", () => {
    expect(read("src/domains/access/lockout.ts")).toContain('if (n === MAX_FAILURES) await securityEvent(db, "auth.lockout"');
    expect(read("src/app/api/auth/[...all]/route.ts")).toContain('await securityEvent(getDb(), "auth.operator_signin"');
    expect(read("src/lib/rate-limit.ts")).toContain('if (row.count === Math.floor(max * scale(env)) + 1) await securityEvent(db, "rate.limited"');
    expect(read("src/lib/http.ts")).toContain('after(() => securityEvent(getDb(), "request.bad_origin"');
    expect(read("src/lib/http.ts")).toContain('if (bucket === "user-export") await securityEvent(getDb(), "data.export"');
    for (const f of ["src/app/api/mcp/route.ts", "src/app/api/mcp/org/route.ts", "src/lib/api-v1.ts"]) expect(read(f), f).toContain('"key.invalid"');
    expect(read("src/app/api/cron/[job]/route.ts")).toContain('await securityEvent(getDb(), "cron.unauthorized"');
    const console = read("src/domains/console/service.ts");
    for (const k of ["operator.added", "operator.revoked", "support.borrow"]) expect(console, k).toContain(`securityEvent(c, "${k}"`);
    expect(read("src/domains/mcp/service.ts")).toContain('securityEvent(c, "operator.key_created"');
    for (const f of ["src/app/api/people/export/route.ts", "src/app/api/accounts/export/route.ts"]) expect(read(f), f).toContain('securityEvent(getDb(), "data.export"');
  });

  it("keeps the journals as written, twelve months at least, the addresses as fingerprints", () => {
    const m = read("db/migrations/0142_security_event.sql");
    expect(m).toContain("FOREACH t IN ARRAY ARRAY['audit_log', 'platform_action', 'security_event'] LOOP");
    expect(m).toContain("BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION journal_append_only()");
    expect(m).toContain("IF OLD.created_at > now() - interval '12 months' THEN");
    // 0142 is never rewritten (the databases that applied it check its checksum): the exception comes in 0143.
    expect(read("db/migrations/0143_journal_purge.sql")).toContain("IF OLD.created_at > now() - interval '12 months' AND coalesce(current_setting('pfm.journal_purge', true), '') <> 'club' THEN");
    // The one exception: the closure of a club, in its own transaction.
    const legal = read("src/domains/legal/service.ts");
    expect(legal.match(/SET LOCAL pfm\.journal_purge = 'club'/g)).toHaveLength(1);
    expect(legal.indexOf("SET LOCAL pfm.journal_purge")).toBeGreaterThan(legal.indexOf("export async function closeClub("));
    expect(read("src/lib/sql.ts") + read("src/lib/http.ts")).not.toContain("journal_purge");
    expect(m).not.toMatch(/security_event \([^;]*REFERENCES/);
    // No code rewrites a journal; the club's retention never goes under twelve months.
    for (const f of ["src/domains/legal/service.ts", "src/domains/console/service.ts", "src/domains/security/alerts.ts"]) expect(read(f), f).not.toMatch(/UPDATE (audit_log|platform_action|security_event)\b/);
    expect(read("src/domains/legal/schema.ts")).toMatch(/audit: \{ min: 12,/);
  });

  it("shows the journal in the console, in the three languages", () => {
    const ui = read("src/components/console.tsx");
    expect(ui).toContain('<Card title={s.security} id="console-security">');
    expect(ui).toContain("{e.source ? e.source.slice(0, 8) : \"\"}");
    const copy = read("src/components/console-copy.ts");
    expect(copy.match(/securityKinds: \{ "auth\.lockout"/g)).toHaveLength(3);
    for (const k of Object.keys(eventKinds)) expect(copy.match(new RegExp(`"${k.replace(".", "\\.")}": "`, "g")), k).toHaveLength(3);
  });
});
