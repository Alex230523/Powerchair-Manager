#!/usr/bin/env node
/**
 * Security (07/11/2026), compromised dependencies: every package of the lock
 * file, at its exact version, checked against OSV (the GitHub advisories,
 * plus the OpenSSF list of malicious packages). Run by the CI after `npm ci`.
 *
 * - A malicious version (MAL-...) fails, always: it cannot be reviewed away.
 * - A flaw in a package the site ships fails unless security/reviewed-advisories.json
 *   explains why it is harmless, and that review has not expired.
 * - A flaw in a development tool fails if it is high or critical (same review),
 *   and is shown as a warning otherwise.
 * - OSV unreachable after three tries: the check fails (better a red CI than a blind one).
 */
import { readFileSync } from "node:fs";

export function lockPackages(lock) {
  const seen = new Map();
  for (const [path, p] of Object.entries(lock.packages ?? {})) {
    if (!path || p.link) continue;
    const name = path.split("node_modules/").at(-1),
      key = `${name}@${p.version}`;
    const prev = seen.get(key);
    // A version shipped anywhere counts as shipped.
    seen.set(key, { name, version: p.version, dev: prev ? prev.dev && Boolean(p.dev) : Boolean(p.dev) });
  }
  return [...seen.values()].sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version));
}

/** findings: [{ id, name, version, dev, severity, summary }] → { failures, warnings } */
export function judge(findings, reviewed, today) {
  const failures = [],
    warnings = [];
  for (const f of findings) {
    const review = reviewed.find((r) => r.id === f.id && r.package === f.name && r.versions.includes(f.version));
    const valid = review && review.expires >= today && !f.id.startsWith("MAL-");
    const line = `${f.name}@${f.version} (${f.dev ? "development" : "shipped"}): ${f.id} ${f.severity ?? "?"} ${f.summary ?? ""}`.trim();
    if (f.id.startsWith("MAL-")) failures.push("MALICIOUS " + line);
    else if (valid) continue;
    else if (review) failures.push(`review expired on ${review.expires}: ${line}`);
    else if (!f.dev || /^(HIGH|CRITICAL)$/i.test(f.severity ?? "")) failures.push(line);
    else warnings.push(line);
  }
  // A review left for a version no longer installed is noise: say so.
  for (const r of reviewed) if (!findings.some((f) => f.id === r.id && f.name === r.package)) warnings.push(`reviewed ${r.id} (${r.package}) no longer found: remove it from security/reviewed-advisories.json`);
  return { failures, warnings };
}

async function post(url, body) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      if (r.ok) return r.json();
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
    }
  }
}
async function get(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return r.json();
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
    }
  }
}

async function main() {
  const packages = lockPackages(JSON.parse(readFileSync("package-lock.json", "utf8")));
  const reviewed = JSON.parse(readFileSync("security/reviewed-advisories.json", "utf8")).advisories;
  const findings = [];
  for (let i = 0; i < packages.length; i += 500) {
    const batch = packages.slice(i, i + 500);
    let queries = batch.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })),
      owners = batch;
    while (queries.length) {
      const { results } = await post("https://api.osv.dev/v1/querybatch", { queries });
      const next = [],
        nextOwners = [];
      results.forEach((r, j) => {
        for (const v of r.vulns ?? []) findings.push({ id: v.id, name: owners[j].name, version: owners[j].version, dev: owners[j].dev });
        if (r.next_page_token) {
          next.push({ ...queries[j], page_token: r.next_page_token });
          nextOwners.push(owners[j]);
        }
      });
      queries = next;
      owners = nextOwners;
    }
  }
  for (const f of findings) {
    const v = await get(`https://api.osv.dev/v1/vulns/${encodeURIComponent(f.id)}`);
    f.severity = v.database_specific?.severity;
    f.summary = (v.summary ?? "").slice(0, 120);
    // OSV may name the GitHub advisory under an alias: a review of either counts.
    const alias = (v.aliases ?? []).find((a) => reviewed.some((r) => r.id === a && r.package === f.name));
    if (alias && !f.id.startsWith("MAL-")) f.id = alias;
  }
  const { failures, warnings } = judge(findings, reviewed, new Date().toISOString().slice(0, 10));
  console.log(`check-deps: ${packages.length} packages, ${findings.length} known flaw(s).`);
  for (const w of warnings) console.log(`::warning title=Dependency::${w}`);
  for (const f of failures) console.log(`::error title=Dependency::${f}`);
  if (failures.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.log(`::error title=Dependency check::OSV could not be read (${e.name}): the dependencies are unchecked.`);
  process.exit(1);
});
