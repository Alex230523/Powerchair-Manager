import { apiRoutes, matrixRoles, pages, type MatrixRole } from "../tests/access-matrix";

/**
 * Audit 26: docs/MATRICE-DROITS.md, written from tests/access-matrix.ts
 * (npm run audit:access, and checked up to date by
 * tests/access-matrix.test.ts).
 */
const roleNames: Record<MatrixRole, string> = {
  anonymous: "Visiteur",
  president: "Président",
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
  federation: "Fédération",
  referee: "Arbitre",
  federation_worker: "Permanent fédéral",
  president_b: "Président club B",
  federation_b: "Fédération B",
};
const statusNames: Record<number, string> = { 200: "oui", 401: "connexion", 403: "refusé", 404: "introuvable", 400: "invalide", 302: "redirigé", 307: "redirigé", 410: "expiré", 429: "limité" };

export function matrixMarkdown() {
  const head = `| Route | ${matrixRoles.map((r) => roleNames[r]).join(" | ")} |\n| --- | ${matrixRoles.map(() => "---").join(" | ")} |`;
  const api = Object.entries(apiRoutes)
    .map(([path, r]) => {
      if (r.skip) return `| \`/api/${path}\` | ${matrixRoles.map(() => "·").join(" | ")} |`;
      const get = r.expect?.GET;
      const cells = matrixRoles.map((role) => (r.methods.includes("GET") ? (get?.[role] !== undefined ? (statusNames[get[role]!] ?? String(get[role])) : "?") : "·"));
      return `| \`/api/${path}\`${r.methods.includes("POST") ? " (+ écriture)" : ""} | ${cells.join(" | ")} |`;
    })
    .join("\n");
  const skipped = Object.entries(apiRoutes)
    .filter(([, r]) => r.skip || r.note)
    .map(([path, r]) => `- \`/api/${path}\` : ${r.skip ?? r.note}`)
    .join("\n");
  const menuRoles = matrixRoles.filter((r) => r !== "anonymous");
  const pageRows = Object.entries(pages)
    .map(([path, p]) => `| \`${path}\` | ${menuRoles.map((r) => (p.menu?.includes(r) ? "menu" : "")).join(" | ")} | ${p.api ? `\`${p.api}\`` : ""} ${p.note ?? ""} |`)
    .join("\n");
  return `# Matrice des droits

Fichier généré par \`npm run audit:access\` depuis \`tests/access-matrix.ts\` : ne pas le modifier à la main.

Chaque route d'API est appelée pour de vrai par chaque rôle (\`tests/audit/access.spec.ts\`), sur le club de démo, un deuxième club, la fédération de démo et une deuxième fédération. Le test échoue si la réponse diffère de ce tableau, si une lecture montre des données de l'autre club ou de l'autre fédération, ou si une écriture au corps vide est acceptée.

Lecture (GET) : « oui » accès, « connexion » il faut se connecter, « refusé » le rôle n'y a pas droit, « introuvable » rien à son nom (ou un identifiant qui n'existe pas), « invalide » requête incomplète, « · » pas de lecture.

## Routes d'API

${head}
${api}

${skipped ? `Notes :\n\n${skipped}\n` : ""}
## Pages

Une page se charge pour toute personne connectée ; ce qu'elle montre dépend de l'API qu'elle lit. « menu » : la page figure dans le menu du rôle.

| Page | ${menuRoles.map((r) => roleNames[r]).join(" | ")} | API |
| --- | ${menuRoles.map(() => "---").join(" | ")} | --- |
${pageRows}
`;
}
