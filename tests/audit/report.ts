/** Audits 23 and 26: findings, justified exceptions and the HTML report. */
export type Issue = {
  rule: string;
  role: string;
  variant: string;
  locale: string;
  path: string;
  what: string;
  target: string;
  detail: string;
  shot: string | null;
};
/**
 * A justified exception (tests/audit/exceptions.json): a rule, a page (or
 * « * »), optionally the element's path, and always the reason.
 */
/** `detail`: a part of the finding's text, so that one known message is excused, not every console error of the page. */
export type Exception = { rule: string; path: string; target?: string; detail?: string; reason: string };

export function matches(e: Exception, i: Issue) {
  const path = i.path.replace(/^\/(nl|en)(?=\/|$)/, "/fr");
  return e.rule === i.rule && (e.path === "*" || e.path === path) && (!e.target || e.target === i.target) && (!e.detail || i.detail.includes(e.detail));
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function reportHtml(title: string, issues: Issue[], exceptions: Exception[]) {
  const rows = issues
    .map((i) => {
      const known = exceptions.find((e) => matches(e, i));
      return `<tr${known ? ' class="known"' : ""}><td>${esc(i.rule)}</td><td>${esc(i.path)}<br><small>${esc(i.what)}</small></td><td>${esc(i.role)}</td><td>${esc(i.variant)} · ${esc(i.locale)}</td><td><code>${esc(i.target)}</code><br>${esc(i.detail)}${known ? `<br><em>Exception : ${esc(known.reason)}</em>` : ""}</td><td>${i.shot ? `<img src="${esc(i.shot)}" alt="" loading="lazy">` : ""}</td></tr>`;
    })
    .join("\n");
  const fresh = issues.filter((i) => !exceptions.some((e) => matches(e, i))).length;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px system-ui;margin:24px;color:#1b1b1f;background:#fff}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:6px;vertical-align:top;text-align:left}tr.known{opacity:.55}img{max-width:420px;border:1px solid #ccd}code{font-size:12px}</style></head>
<body><h1>${esc(title)}</h1><p>${issues.length} constats, dont ${fresh} nouveaux (hors exceptions justifiées).</p>
<table><thead><tr><th>Règle</th><th>Page</th><th>Rôle</th><th>Écran</th><th>Élément</th><th>Capture</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
}
