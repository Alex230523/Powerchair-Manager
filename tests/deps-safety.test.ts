import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { judge, lockPackages } from "../scripts/check-deps.mjs";

/**
 * Security (07/11/2026), compromised dependencies: every version is fixed and
 * comes from the npm registry with its fingerprint; no new package may run a
 * script at install unseen; the CI checks each version against the known
 * flaws and the malicious versions, and the registry's signatures; a reviewed
 * flaw expires; a malicious version is never reviewed away.
 */
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const reviewed = JSON.parse(readFileSync("security/reviewed-advisories.json", "utf8")).advisories as { id: string; package: string; versions: string[]; reason: string; reviewed: string; expires: string }[];

/** The packages allowed to run a script at install, each one read (07/11/2026). */
const installScripts = [
  // Unpacks the PostgreSQL of the end-to-end tests (development only).
  "@embedded-postgres/darwin-arm64",
  "@embedded-postgres/darwin-x64",
  "@embedded-postgres/linux-arm",
  "@embedded-postgres/linux-arm64",
  "@embedded-postgres/linux-ia32",
  "@embedded-postgres/linux-ppc64",
  "@embedded-postgres/linux-x64",
  "@embedded-postgres/windows-x64",
  // Checks its native binary (build tools).
  "esbuild",
  "fsevents",
  "unrs-resolver",
];

describe("compromised dependencies", () => {
  it("fixes every version: no range, no tag, no address of its own", () => {
    const loose: string[] = [];
    for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])
      for (const [name, version] of Object.entries((pkg[group] ?? {}) as Record<string, string>)) if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) loose.push(`${group}.${name}: ${version}`);
    expect(loose).toEqual([]);
    expect(readFileSync(".npmrc", "utf8")).toMatch(/^save-exact=true$/m);
  });

  it("takes every package from the npm registry, with its sha512 fingerprint, in a lock in step with package.json", () => {
    expect(lock.lockfileVersion).toBe(3);
    const root = lock.packages[""];
    expect(root.dependencies).toEqual(pkg.dependencies);
    expect(root.devDependencies).toEqual(pkg.devDependencies);
    const wrong: string[] = [];
    for (const [path, p] of Object.entries(lock.packages as Record<string, { resolved?: string; integrity?: string; link?: boolean }>)) {
      if (!path || p.link) continue;
      if (!p.resolved?.startsWith("https://registry.npmjs.org/")) wrong.push(`${path}: ${p.resolved}`);
      if (!p.integrity?.startsWith("sha512-")) wrong.push(`${path}: ${p.integrity}`);
    }
    expect(wrong).toEqual([]);
    expect(Object.keys(lock.packages).length).toBeGreaterThan(400);
  });

  it("lets no new package run a script at install unseen", () => {
    const running = Object.entries(lock.packages as Record<string, { hasInstallScript?: boolean }>)
      .filter(([, p]) => p.hasInstallScript)
      .map(([path]) => path.split("node_modules/").at(-1))
      .sort();
    expect(running).toEqual([...installScripts].sort());
  });

  it("installs from the lock alone, everywhere, and checks every version in the CI", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).not.toMatch(/npm (install|i)\b/);
    expect(ci.match(/- run: npm ci$/gm)?.length).toBeGreaterThanOrEqual(3);
    // The check runs right after the first install, before any of the project's code.
    const install = ci.indexOf("- run: npm ci");
    expect(ci.indexOf("run: node scripts/check-deps.mjs")).toBeGreaterThan(install);
    expect(ci.indexOf("run: node scripts/check-deps.mjs")).toBeLessThan(ci.indexOf("Write .env.local"));
    expect(ci).toContain("run: npm audit signatures");
    expect(JSON.parse(readFileSync("vercel.json", "utf8")).installCommand).toBe("npm ci");
    // npx runs only what the lock installed: never a package fetched on the spot.
    const tools = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).map((n) => n.replace(/^@playwright\/test$/, "playwright")));
    for (const m of ci.matchAll(/npx (\S+)(?: (\S+))?/g)) {
      expect(m[1], m[0]).toBe("--no-install");
      expect(tools.has(m[2]), m[0]).toBe(true);
    }
  });

  it("judges each flaw: malicious always fails, a shipped flaw needs a review, a review expires", () => {
    const today = "2026-11-07";
    const f = (id: string, name: string, version: string, dev: boolean, severity = "MODERATE") => ({ id, name, version, dev, severity, summary: "x" });
    const reviews = [{ id: "GHSA-aaaa", package: "left-pad", versions: ["1.0.0"], reason: "r", reviewed: today, expires: "2027-01-01" }];
    // Malicious: even listed, even in a development tool.
    expect(judge([f("MAL-2026-1", "left-pad", "1.0.0", true)], [{ ...reviews[0], id: "MAL-2026-1" }], today).failures).toHaveLength(1);
    // Shipped: fails unless reviewed for that very version, and not expired.
    expect(judge([f("GHSA-aaaa", "left-pad", "1.0.0", false)], reviews, today).failures).toEqual([]);
    expect(judge([f("GHSA-aaaa", "left-pad", "1.0.1", false)], reviews, today).failures).toHaveLength(1);
    expect(judge([f("GHSA-aaaa", "left-pad", "1.0.0", false)], reviews, "2027-01-02").failures[0]).toMatch(/^review expired/);
    expect(judge([f("GHSA-bbbb", "left-pad", "1.0.0", false, "LOW")], [], today).failures).toHaveLength(1);
    // Development: high and critical fail, the rest warns.
    expect(judge([f("GHSA-cccc", "eslint-x", "1.0.0", true, "HIGH")], [], today).failures).toHaveLength(1);
    const dev = judge([f("GHSA-dddd", "eslint-x", "1.0.0", true, "MODERATE")], [], today);
    expect(dev.failures).toEqual([]);
    expect(dev.warnings).toHaveLength(1);
    // A review whose flaw is gone is pointed out.
    expect(judge([], reviews, today).warnings[0]).toMatch(/no longer found/);
  });

  it("knows a version shipped anywhere as shipped", () => {
    const packages = lockPackages({
      packages: {
        "": {},
        "node_modules/a": { version: "1.0.0", dev: true },
        "node_modules/b/node_modules/a": { version: "1.0.0" },
        "node_modules/c": { version: "2.0.0", dev: true },
        "node_modules/self": { link: true },
      },
    });
    expect(packages).toEqual([
      { name: "a", version: "1.0.0", dev: false },
      { name: "c", version: "2.0.0", dev: true },
    ]);
    // The lock of the site, read the same way.
    const ours = lockPackages(lock);
    expect(ours.find((p) => p.name === "next")?.dev).toBe(false);
    expect(ours.find((p) => p.name === "eslint")?.dev).toBe(true);
  });

  it("explains, dates and limits every reviewed flaw, and never a malicious one", () => {
    expect(reviewed.length).toBeGreaterThan(0);
    const installed = new Set(lockPackages(lock).map((p) => `${p.name}@${p.version}`));
    for (const r of reviewed) {
      expect(r.id, r.id).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(r.reason.length, r.id).toBeGreaterThan(60);
      expect(r.reviewed, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // At most six months: then read again.
      expect((Date.parse(r.expires) - Date.parse(r.reviewed)) / 86400000, r.id).toBeLessThanOrEqual(184);
      for (const v of r.versions) expect(installed.has(`${r.package}@${v}`), `${r.package}@${v}`).toBe(true);
    }
    // image-size: the only call in pptxgenjs is commented out; if a new version loads it, the review is wrong.
    const dist = readFileSync("node_modules/pptxgenjs/dist/pptxgen.cjs.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(dist).not.toMatch(/require\(['"](image-size|sizeof)['"]\)/);
  });
});
