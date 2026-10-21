import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { publishAuth } from "../domains/notifications/queue";
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
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
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
