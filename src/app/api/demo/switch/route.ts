import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth-server";
import { limit } from "@/lib/rate-limit";
import { AccessError, execute } from "@/domains/access/service";
import { demoAccounts, demoSwitchEnabled, demoTarget, firstMandate, isDemoAccount } from "@/domains/demo/switch";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 12/11/2026, previews only: the demo accounts one can open from a demo account. */
export async function GET(request: Request) {
  try {
    const p = await principal(request);
    const enabled = demoSwitchEnabled() && !!(await isDemoAccount(getDb(), p.userId));
    return Response.json({ enabled, accounts: enabled ? demoAccounts.map(({ key, label, email }) => ({ key, label, email })) : [] }, { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
/** Opens another demo account: a new session for it, the current one closed. */
export async function POST(request: Request) {
  try {
    origin(request);
    if (!demoSwitchEnabled()) throw new AccessError("NOT_FOUND", 404);
    const p = await principal(request);
    await limit(getDb(), "user-invite", p.userId);
    if (!(await isDemoAccount(getDb(), p.userId))) throw new AccessError("FORBIDDEN");
    const { account } = z.object({ account: z.string().max(20) }).parse(JSON.parse(new TextDecoder().decode(await bounded(request, 500))));
    const target = await demoTarget(getDb(), account);
    const auth = getAuth();
    const signed = await auth.api.signInEmail({ body: { email: target.email, password: process.env.PFM_DEMO_PASSWORD! }, asResponse: true });
    if (!signed.ok) throw new AccessError("DEMO_UNAVAILABLE", 409);
    const token = ((await signed.clone().json()) as { token?: string }).token;
    // The demo space opens at once on the account's first profile.
    const session = token ? ((await getDb().query('SELECT id FROM session WHERE token=$1 AND "userId"=$2', [token, target.userId])).rows[0]?.id as string | undefined) : undefined;
    const mandate = await firstMandate(getDb(), target.userId);
    if (session && mandate) await execute(getDb(), { userId: target.userId, sessionId: session }, { action: "context", mandateId: mandate });
    // The previous demo session ends.
    await getDb().query('DELETE FROM session WHERE id=$1 AND "userId"=$2', [p.sessionId, p.userId]);
    const out = Response.json({ ok: true, account: target.key }, { headers: noStore });
    for (const c of signed.headers.getSetCookie()) out.headers.append("Set-Cookie", c);
    return out;
  } catch (e) {
    return failure(e);
  }
}
