import { NextResponse, type NextRequest } from "next/server";
import { newNonce, scriptPolicy } from "@/lib/csp";

/**
 * Security (07/11/2026), cross-site scripting: every page gets a nonce and a
 * policy that lets only the site's own scripts run (see src/lib/csp.ts). The
 * other headers of the pages stay in next.config.ts; the browser applies
 * both policies.
 */
export function proxy(request: NextRequest) {
  const nonce = newNonce(),
    policy = scriptPolicy(nonce, process.env);
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
