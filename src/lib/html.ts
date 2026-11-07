/**
 * Security (07/11/2026), cross-site scripting: the two rules for what the site
 * writes outside React's own escaping.
 */

/** Text put in HTML written by hand (an embed code, an email, a printable page): every special character escaped. */
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * An address typed by someone, as the target of a link: only a web address
 * (http or https) is a link; `javascript:`, `data:`, `vbscript:` and the rest
 * are not, even when an older row or an import holds one.
 */
export function externalHref(value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return undefined;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:" ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Security (07/11/2026), cross-site scripting: the type a stored file is sent
 * with. Only the formats the site accepts are sent as themselves; anything
 * else (an HTML page, an SVG, an XML file that slipped in under another
 * name) goes as raw bytes, which no browser runs.
 */
const servedTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/csv",
  "text/csv; charset=utf-8",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
/**
 * How a file is offered: its name is never written raw in the header (a
 * quote or a line break in a name typed by someone would rewrite the header),
 * but in ASCII for old browsers and encoded for the others.
 */
export function disposition(kind: "attachment" | "inline", filename: string) {
  const ascii = filename.replace(/[^\w.\- ]/g, "_").slice(0, 150) || "fichier";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename.slice(0, 150))}`;
}
export function servedType(type: string | null | undefined) {
  const t = (type ?? "").trim().toLowerCase();
  return servedTypes.has(t) ? t : "application/octet-stream";
}
