import { mkdirSync, writeFileSync } from "node:fs";
import { DPA_VERSION, LEGAL_UPDATED, legalDocs, legalTexts, reviewNotice, subprocessors } from "../src/domains/legal/texts";

/** 21: writes docs/legal/<doc>.<lang>.md from the texts the public pages show (one source). */
mkdirSync("docs/legal", { recursive: true });
for (const doc of legalDocs)
  for (const lang of ["fr", "nl", "en"] as const) {
    const t = legalTexts[doc][lang];
    const lines = [`# ${t.title}`, "", `> ${reviewNotice[lang]}`, "", `Version : ${doc === "dpa" ? DPA_VERSION : LEGAL_UPDATED}`, ""];
    if (t.summary) lines.push(...t.summary.map((x) => `- ${x}`), "");
    for (const s of t.sections) lines.push(`## ${s.heading}`, "", ...s.body.flatMap((p) => [p, ""]));
    if (doc === "subprocessors") lines.push("| Service | Role | Region |", "| --- | --- | --- |", ...subprocessors.map((x) => `| ${x.name[lang]} | ${x.role[lang]} | ${typeof x.region === "string" ? x.region : x.region[lang]} |`), "");
    writeFileSync(`docs/legal/${doc}.${lang}.md`, lines.join("\n"));
  }
console.log("docs/legal written");
