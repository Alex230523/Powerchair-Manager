import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { publishAuth } from "../domains/notifications/queue";
import { invitationHeader, signupAllowed } from "../domains/access/signup";
export function createAuth(pool: Pool, mailPool: Pool = pool) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL) throw new Error("BETTER_AUTH_URL required");
  return betterAuth({
    appName: "Powerchair Football Manager",
    baseURL,
    secret,
    database: pool,
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        publishAuth(mailPool, user, url, "auth_reset").then(() => {}),
    },
    session: {
      expiresIn: 60 * 60 * 24,
      updateAge: 60 * 30,
      cookieCache: { enabled: false },
    },
    user: {
      additionalFields: {
        active: { type: "boolean", defaultValue: true, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      // Security (06/11/2026): a reset e-mail at most three times in five minutes per network
      // address (no mailbox flooded), a reset link tried at most five times.
      customRules: {
        "/request-password-reset": { window: 300, max: 3 },
        "/forget-password": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
      },
    },
    // Security (06/11/2026): the invitation is checked again inside the library, after its own
    // routing, whatever the form of the address that reached it. Accounts made on the server
    // (welcome page, scripts, tests) carry no request and are not concerned.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || !ctx.request) return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        const token = ctx.headers?.get(invitationHeader) ?? ctx.request.headers.get(invitationHeader);
        if (!(await signupAllowed(pool, token, email))) throw new APIError("FORBIDDEN", { code: "INVITATION_REQUIRED", message: "An invitation is required to create an account." });
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            const callback =
              typeof context?.body?.callbackURL === "string"
                ? context.body.callbackURL
                : "/fr/access";
            const language = new URL(
              callback,
              process.env.BETTER_AUTH_URL,
            ).pathname.split("/")[1];
            const locale =
              language === "en" || language === "nl" ? language : "fr";
            await pool.query(
              "INSERT INTO person(user_id,locale) VALUES ($1,$2) ON CONFLICT DO NOTHING",
              [user.id, locale],
            );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query(
              'SELECT active FROM "user" WHERE id=$1',
              [session.userId],
            );
            if (result.rowCount && !result.rows[0].active) return false;
            return { data: session };
          },
        },
      },
    },
  });
}
