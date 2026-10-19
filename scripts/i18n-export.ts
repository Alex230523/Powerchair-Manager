/**
 * Exports every French text with its Dutch (and English) counterpart to a CSV
 * that a Dutch speaker can review in a spreadsheet:
 *   npm run i18n:export            -> docs/traductions/nl-relecture.csv
 *
 * It walks the copy modules: wherever an object holds both `fr` and `nl`, the
 * two branches are compared key by key. Columns: file, key, fr, nl, en,
 * status ("missing" when the Dutch text is absent or identical to French
 * while it looks like a sentence, "ok" otherwise) and an empty review column.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const sources = [
  ...fs
    .readdirSync(path.join(root, "src/components"))
    .filter((f) => /-copy\.ts$/.test(f))
    .map((f) => "src/components/" + f),
  ...fs
    .readdirSync(path.join(root, "src/lib"))
    .filter((f) => /\.ts$/.test(f) && !/auth|db|env|http|mail/.test(f))
    .map((f) => "src/lib/" + f),
  "src/domains/notifications/templates.ts",
  "src/domains/registrations/templates.ts",
].filter((f) => fs.existsSync(path.join(root, f)));

/** Components that keep their texts next to the markup (read statically). */
const inline = fs
  .readdirSync(path.join(root, "src/components"))
  .filter((f) => /\.tsx$/.test(f))
  .map((f) => "src/components/" + f)
  .filter((f) => /\bnl: \{|const nl\b/.test(fs.readFileSync(path.join(root, f), "utf8")));

/**
 * Evaluates the top-level object constants of a .tsx file without running the
 * component: each `const x = { ... }` is transpiled and run in a sandbox, in
 * order, so `{ fr, nl, en }` can refer to earlier ones. Others are ignored.
 */
function literals(file: string) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const scope = vm.createContext({});
  const values: Record<string, unknown> = {};
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      let init = d.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)))
        init = init.expression;
      if (!init || !ts.isObjectLiteralExpression(init) || !ts.isIdentifier(d.name)) continue;
      const js = ts.transpileModule(`(${init.getText(sf)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText;
      try {
        const v = vm.runInContext(js, scope, { timeout: 200 });
        scope[d.name.text] = v;
        values[d.name.text] = v;
      } catch {
        // Refers to something computed at runtime: not a text table.
      }
    }
  }
  return values;
}

type Row = { file: string; key: string; fr: string; nl: string; en: string };
const rows: Row[] = [];
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function pair(file: string, key: string, fr: unknown, nl: unknown, en: unknown) {
  if (typeof fr === "string") {
    rows.push({
      file,
      key,
      fr,
      nl: typeof nl === "string" ? nl : "",
      en: typeof en === "string" ? en : "",
    });
    return;
  }
  if (Array.isArray(fr)) {
    fr.forEach((v, i) =>
      pair(
        file,
        `${key}[${i}]`,
        v,
        Array.isArray(nl) ? nl[i] : undefined,
        Array.isArray(en) ? en[i] : undefined,
      ),
    );
    return;
  }
  if (isObject(fr))
    for (const k of Object.keys(fr))
      pair(
        file,
        key ? `${key}.${k}` : k,
        fr[k],
        isObject(nl) ? nl[k] : undefined,
        isObject(en) ? en[k] : undefined,
      );
}
function walk(file: string, key: string, node: unknown, seen: Set<unknown>) {
  if (!isObject(node) || seen.has(node)) return;
  seen.add(node);
  if ("fr" in node && "nl" in node) {
    pair(file, key, node.fr, node.nl, node.en);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(file, `${key}[${i}]`, v, seen));
    return;
  }
  for (const k of Object.keys(node))
    walk(file, key ? `${key}.${k}` : k, node[k], seen);
}

async function main() {
  for (const file of sources) {
    let mod: Record<string, unknown>;
    try {
      mod = await import(path.join(root, file.replace(/\.ts$/, "")));
    } catch (e) {
      console.warn(`skipped ${file}: ${e instanceof Error ? e.message : e}`);
      continue; // Server-only modules are skipped.
    }
    const seen = new Set<unknown>();
    for (const [name, value] of Object.entries(mod))
      walk(file.replace(/^src\//, ""), name, value, seen);
  }
  for (const file of inline) {
    const seen = new Set<unknown>();
    for (const [name, value] of Object.entries(literals(file)))
      walk(file.replace(/^src\//, ""), name, value, seen);
  }
  const sentence = (s: string) => /\b[a-zà-ÿ]{3,}\s+[a-zà-ÿ]{2,}/.test(s);
  const cell = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [
    ["fichier", "cle", "fr", "nl", "en", "statut", "correction_nl"].join(";"),
    ...rows.map((r) =>
      [
        r.file,
        r.key,
        r.fr,
        r.nl,
        r.en,
        !r.nl || (r.nl === r.fr && sentence(r.fr)) ? "missing" : "ok",
        "",
      ]
        .map((v) => cell(String(v)))
        .join(";"),
    ),
  ];
  const out = path.join(root, "docs/traductions/nl-relecture.csv");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // BOM so that Excel opens the accents correctly.
  fs.writeFileSync(out, "﻿" + lines.join("\r\n") + "\r\n");
  const missing = rows.filter((r) => !r.nl).length;
  console.log(`${rows.length} texts, ${missing} without Dutch -> ${out}`);
}
void main();
