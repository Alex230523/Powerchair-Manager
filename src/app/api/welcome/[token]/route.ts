import { getDb } from "@/lib/db";
import { throttle } from "@/lib/rate-limit";
import { getAuth } from "@/lib/auth-server";
import { AccessError } from "@/domains/access/service";
import { welcomeCommand, welcomeComplete, welcomeDispute, welcomeView } from "@/domains/access/invite";
import { origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Guided account creation (wave 16, I2): what the invitation says. No session needed: the link is the key. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    await throttle(getDb(), request, "public-read");
    return Response.json(await welcomeView(getDb(), (await params).token), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}

/** « Ce n'est pas mon rôle », or the creation itself: account, invitation accepted, then signed in. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    // Security (07/11/2026): an account created, a password hashed, a link disputed: counted by address.
    await throttle(getDb(), request, "public-write", "public-write-day");
    origin(request);
    const token = (await params).token;
    const cmd = welcomeCommand.parse(JSON.parse(new TextDecoder().decode(await bounded(request, 8000))));
    const db = getDb();
    if (cmd.action === "dispute") return Response.json(await welcomeDispute(db, token, cmd.note), { headers: noStore });
    const view = await welcomeView(db, token);
    if (view.state !== "valid") throw new AccessError("INVITATION_INVALID", 404);
    // An account with a password accepts from « Mon espace » after signing in.
    if (view.existing === "password") throw new AccessError("ACCOUNT_EXISTS", 409);
    const auth = getAuth();
    let userId: string;
    if (view.existing === "none") {
      // Created on the server: the public sign-up route stays closed (I1).
      try {
        userId = (
          await auth.api.signUpEmail({
            body: { email: view.email, password: cmd.password, name: `${cmd.firstName} ${cmd.lastName}`.trim(), callbackURL: `/${cmd.locale}/access` },
          })
        ).user.id;
      } catch (e) {
        // Created a moment ago in another tab: same answer as an existing account.
        if (e && typeof e === "object" && "statusCode" in e && e.statusCode === 422) throw new AccessError("ACCOUNT_EXISTS", 409);
        throw e;
      }
    } else {
      // A registration-link account (no password yet) gets one now.
      userId = (await db.query('SELECT id FROM "user" WHERE lower(email)=lower($1)', [view.email])).rows[0].id as string;
      const context = await auth.$context;
      await context.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: await context.password.hash(cmd.password) });
    }
    await welcomeComplete(db, token, userId, cmd);
    const signed = await auth.api.signInEmail({ body: { email: view.email, password: cmd.password }, asResponse: true });
    const headers = new Headers(noStore);
    for (const cookie of signed.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    return Response.json({ ok: true, home: `/${cmd.locale}` }, { headers });
  } catch (e) {
    return failure(e);
  }
}
