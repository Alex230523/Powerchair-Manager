import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { invitationHeader, isPasswordSignIn, isSignUp, signupAllowed } from "@/domains/access/signup";
import { recordSignIn, signInBlocked } from "@/domains/access/lockout";

const noStore = { "Cache-Control": "private, no-store" };
const bodyEmail = async (request: Request) => {
  try {
    return ((await request.clone().json()) as { email?: unknown }).email ?? null;
  } catch {
    return null;
  }
};
export async function GET(request: Request) {
  return getAuth().handler(request);
}
/**
 * Public sign-up only with an invitation for the same email (wave 16, I1); a password
 * sign-in refused after ten failures for the same address (security, 06/11/2026);
 * everything else goes to Better Auth. The path is read the way the auth router reads it.
 */
export async function POST(request: Request) {
  const path = new URL(request.url).pathname;
  if (isSignUp(path)) {
    if (!(await signupAllowed(getDb(), request.headers.get(invitationHeader), await bodyEmail(request))))
      return Response.json({ code: "INVITATION_REQUIRED", message: "An invitation is required to create an account." }, { status: 403, headers: noStore });
  }
  if (isPasswordSignIn(path)) {
    const email = await bodyEmail(request);
    if (await signInBlocked(getDb(), email))
      return Response.json({ code: "TOO_MANY_ATTEMPTS", message: "Too many failed attempts for this address. Try again in a quarter of an hour." }, { status: 429, headers: noStore });
    const response = await getAuth().handler(request);
    if (response.status === 200 || response.status === 401) await recordSignIn(getDb(), email, response.status === 200);
    return response;
  }
  return getAuth().handler(request);
}
