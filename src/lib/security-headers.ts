/**
 * B2: the headers of every page (widgets aside, which other sites embed).
 * HSTS keeps browsers on HTTPS once they met the site; the CSP only closes
 * what a club app never needs (being framed, plugins, foreign form targets,
 * a changed base address) so Next's own scripts keep working.
 */
export const pageHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
] as const;
/** Widgets are embedded by the clubs' own sites. */
export const widgetHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors *; object-src 'none'; base-uri 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
] as const;
