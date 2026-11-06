import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { cleanFields } from "../src/lib/log";
import { previewSettings } from "../src/lib/preview";

/**
 * Security (06/11/2026), leaked keys and secrets: no secret written in the
 * repository, none sent to a browser, none written to a log, and the CI's
 * token reads only. Read on every run, so a new file cannot break it unseen.
 */
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && existsSync(f) && !/package-lock\.json$|\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|zip|xlsx|docx)$/i.test(f));
const formats: [string, RegExp][] = [
  ["AWS key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Stripe live key", /\b[sr]k_live_[A-Za-z0-9]{20,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI key", /\bsk-(proj-)?[A-Za-z0-9_-]{40,}/],
  ["Mollie live key", /\blive_[A-Za-z0-9]{25,}/],
  ["Google key", /\bAIza[0-9A-Za-z_-]{35}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JSON web token", /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["database URL with a password, online", /postgres(ql)?:\/\/[^:@/\s]+:[^@/\s]{6,}@[^/\s]+\.(com|net|io|tech|cloud|app)\b/],
  ["SendGrid key", /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/],
  ["Platform key", /\b(pfm|pfmop|pfmorg)_[a-z0-9]{8}_[A-Za-z0-9_-]{40,}/],
];
const SECRET_ENV = /SECRET|PASSWORD|PRIVATE|API_KEY|TOKEN|DATABASE_URL/;
const serverOnly = /from "@\/(lib\/(auth|db)|domains\/(assistant\/service|billing\/(mollie|service)|feedback\/github|notifications\/crypto|jobs\/secret|mcp\/(service|organization)|tax\/service))"/;

describe("leaked keys and secrets", () => {
  it("writes no secret in the repository", () => {
    expect(tracked.length).toBeGreaterThan(500);
    const found: string[] = [];
    for (const f of tracked) {
      const s = readFileSync(f, "utf8");
      for (const [name, re] of formats) if (re.test(s)) found.push(`${f}: ${name}`);
    }
    expect(found).toEqual([]);
  });
  it("keeps every .env file but the example out of git", () => {
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\.env\*$/m);
    expect(tracked.filter((f) => /(^|\/)\.env/.test(f))).toEqual([".env.example"]);
    // The example names the variables, never a value for a secret one.
    for (const line of readFileSync(".env.example", "utf8").split("\n"))
      if (/^[A-Z0-9_]+=/.test(line) && SECRET_ENV.test(line.split("=")[0]) && !/^DATABASE_URL=postgresql:\/\/pfm:pfm_local_only@localhost/.test(line)) expect(line.split("=")[1].trim(), line).toBe("");
  });
  it("sends no secret to a browser", () => {
    // Next inlines NEXT_PUBLIC_* and next.config's env: neither ever names a secret.
    for (const f of tracked.filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))) expect(readFileSync(f, "utf8"), f).not.toMatch(new RegExp(`NEXT_PUBLIC_\\w*(${SECRET_ENV.source})`));
    expect(Object.keys(previewSettings({ VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app", BETTER_AUTH_SECRET: "s".repeat(40), DATABASE_URL: "postgres://u:p@h/d" }))).toEqual(["BETTER_AUTH_URL"]);
    // A component of the browser never reads a secret nor imports what reads one.
    const client = tracked.filter((f) => /^src\/.*\.tsx?$/.test(f) && /^["']use client["']/m.test(readFileSync(f, "utf8")));
    expect(client.length).toBeGreaterThan(50);
    for (const f of client) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(new RegExp(`process\\.env\\.\\w*(${SECRET_ENV.source})`));
      for (const line of s.split("\n").filter((l) => /^import (?!type )/.test(l))) expect(line, f).not.toMatch(serverOnly);
    }
  });
  it("writes no secret to a log", () => {
    expect(
      cleanFields({
        job: "mail",
        ms: 12,
        apiKey: "abc",
        secret: "x",
        authorization: "Bearer y",
        sessionId: "s",
        note: "key pfmorg_abcd1234_" + "x".repeat(43),
        hook: "whsec_abc",
        url: "postgresql://pfm:verysecret@db.example.com/pfm",
        anthropic: "sk-ant-api03-" + "a".repeat(30),
      }),
    ).toEqual({ job: "mail", ms: 12 });
    // An unexpected error is logged by its name, never by its message (which may hold a value).
    for (const f of tracked.filter((f) => /^src\/.*\.tsx?$/.test(f))) expect(readFileSync(f, "utf8"), f).not.toMatch(/console\.(error|warn|log)\([^)]*\.(message|stack)\b/);
  });
  it("gives the CI's token read access only, and never secrets to a fork", () => {
    for (const f of tracked.filter((f) => f.startsWith(".github/workflows/"))) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toMatch(/^permissions:\n\s+contents: read$/m);
      expect(s, f).not.toMatch(/pull_request_target/);
      // A value that comes from the pull request goes through an environment variable, never into a script.
      for (const run of s.match(/run: \|[\s\S]*?(?=\n\s*-\s|\n\S|$)/g) ?? []) expect(run, f).not.toMatch(/\$\{\{\s*github\.event\./);
    }
  });
});
