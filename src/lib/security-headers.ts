/**
 * B2: the headers of every page (widgets aside, which other sites embed).
 * HSTS keeps browsers on HTTPS once they met the site; the CSP only closes
 * what a club app never needs (being framed, plugins, foreign form targets,
 * a changed base address) so Next's own scripts keep working.
 */
export const pageCsp = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
export const widgetCsp = "frame-ancestors *; object-src 'none'; base-uri 'self'";
/** The widgets' addresses, the same as in next.config.ts. */
export const isWidgetPath = (pathname: string) => /^\/(fr|nl|en)\/(registration-widget\/|hall-of-fame-widget\/|c\/[a-z0-9-]+\/widget\/)/.test(pathname);
export const pageHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  // Cloud (06/11/2026): a window this site opens, or that opens it, cannot reach into it.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: pageCsp },
] as const;
/** Widgets are embedded by the clubs' own sites. */
export const widgetHeaders = [
  { key: "Content-Security-Policy", value: widgetCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
] as const;
/**
 * Security (06/11/2026), cloud: the answers of the API are never indexed, and
 * nothing of a preview (a copy of the site on demo data, at a public Vercel
 * address) is, even when its Deployment Protection is switched off.
 */
export function robotsHeaders(env: Record<string, string | undefined>) {
  const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
  return env.VERCEL_ENV === "preview" ? [{ source: "/:path*", headers: noindex }] : [{ source: "/api/:path*", headers: noindex }];
}
