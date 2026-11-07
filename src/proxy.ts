import { NextResponse, type NextRequest } from "next/server";
import { newNonce, scriptPolicy } from "@/lib/csp";
import { isWidgetPath, pageCsp, widgetCsp } from "@/lib/security-headers";

/**
 * Security (07/11/2026), cross-site scripting: every page gets a nonce and a
 * policy that lets only the site's own scripts run (see src/lib/csp.ts). Its
 * header replaces the policy of next.config.ts, so it carries the page's
 * other directives too: framing closed, or open to any site for a widget.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce(),
    policy = scriptPolicy(nonce, process.env, isWidgetPath(request.nextUrl.pathname) ? widgetCsp : pageCsp);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Pages only: not the API, not Next's files, not the files of public/ (a dot in the name).
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
