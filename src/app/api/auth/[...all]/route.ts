import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { invitationHeader, signupAllowed } from "@/domains/access/signup";
export async function GET(request: Request) {
  return getAuth().handler(request);
}
/** Public sign-up only with an invitation for the same email (wave 16, I1); everything else goes to Better Auth. */
export async function POST(request: Request) {
  if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
    let email: unknown = null;
    try {
      email = ((await request.clone().json()) as { email?: unknown }).email;
    } catch {
      email = null;
    }
    if (!(await signupAllowed(getDb(), request.headers.get(invitationHeader), email)))
      return Response.json(
        { code: "INVITATION_REQUIRED", message: "An invitation is required to create an account." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
  }
  return getAuth().handler(request);
}
