#!/usr/bin/env node
// B8: validates an exported Belcotax-on-Web file against the official XSD of its
// year, placed by hand in docs/belcotax/<year>/ (see docs/belcotax/README.md).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [year, file] = process.argv.slice(2);
if (!/^\d{4}$/.test(year ?? "") || !file) {
  console.error("Usage: node scripts/belcotax-validate.mjs <year> <file.xml>");
  process.exit(2);
}
const dir = join("docs", "belcotax", year);
const xsd = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".xsd")) : undefined;
if (!xsd) {
  console.error(`No XSD in ${dir}: download the official schema of ${year} from Belcotax-on-Web first.`);
  process.exit(2);
}
try {
  execFileSync("xmllint", ["--noout", "--schema", join(dir, xsd), file], { stdio: "inherit" });
  console.log(`${file} is valid against ${join(dir, xsd)}.`);
} catch {
  process.exit(1);
}
