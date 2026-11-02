import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { reportHtml, type Exception, type Issue } from "../tests/audit/report";
import { matrixMarkdown } from "./access-matrix-doc";

/** After an audit run: one HTML report for every role (ui), the rights matrix document (access). */
const kind = process.argv[2];
mkdirSync("audit-report", { recursive: true });
if (kind === "ui") {
  const exceptions = JSON.parse(readFileSync("tests/audit/exceptions.json", "utf8")) as Exception[];
  const issues = readdirSync("audit-report")
    .filter((f) => /^ui-.+\.json$/.test(f))
    .flatMap((f) => JSON.parse(readFileSync(`audit-report/${f}`, "utf8")) as Issue[]);
  writeFileSync("audit-report/ui.html", reportHtml("Audit visuel", issues, exceptions));
  // What a first run proposes as exceptions, one per rule, page and element, to justify or to fix.
  const seen = new Set<string>();
  const proposed = issues
    .map((i) => ({ rule: i.rule, path: i.path.replace(/^\/(nl|en)(?=\/|$)/, "/fr"), target: i.target, reason: `À justifier ou corriger : ${i.detail}` }))
    .filter((e) => !seen.has(JSON.stringify([e.rule, e.path, e.target])) && !!seen.add(JSON.stringify([e.rule, e.path, e.target])));
  writeFileSync("audit-report/exceptions-proposed.json", JSON.stringify(proposed, null, 1));
  console.log(`Audit visuel : ${issues.length} constats, rapport audit-report/ui.html`);
}
if (kind === "access") {
  writeFileSync("docs/MATRICE-DROITS.md", matrixMarkdown());
  if (existsSync("audit-report/access-problems.txt")) console.log(readFileSync("audit-report/access-problems.txt", "utf8") || "Matrice des droits : aucun écart.");
}
