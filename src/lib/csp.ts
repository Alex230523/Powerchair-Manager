/**
 * Security (07/11/2026), cross-site scripting: the page's scripts. A script
 * runs only if it comes from the site itself or carries the nonce drawn for
 * this very answer; a script slipped into a page (a name, a message, a link)
 * finds neither. Next puts the nonce on its own scripts when it reads it in
 * the request's policy; the two inline scripts of the site (theme, club
 * palette) take it from `x-nonce`.
 */
export function scriptPolicy(nonce: string, env: Record<string, string | undefined>) {
  const sources = ["'self'", `'nonce-${nonce}'`];
  // React and hot reload evaluate code during development only.
  if (env.NODE_ENV !== "production") sources.push("'unsafe-eval'");
  // Vercel's comment bar on previews.
  if (env.VERCEL_ENV === "preview") sources.push("https://vercel.live");
  return [`script-src ${sources.join(" ")}`, "script-src-attr 'none'", "object-src 'none'", "base-uri 'self'"].join("; ");
}
/** 128 random bits, base64: never the same twice, never guessed. */
export function newNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
