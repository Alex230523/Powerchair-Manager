import type { Pool } from "pg";
import { AccessError } from "../access/service";

/**
 * 12/11/2026: on a preview only, a demo account opens another demo account
 * in one click (president, coach, player, parent, federation, referee),
 * without signing out and in again. Never in production: the switch needs a
 * Vercel preview (or a local run that asks for it) and the project's own demo
 * password, it starts only from a demo account and leads only to one of the
 * six demo accounts, whose clubs and federation are marked « démo ». To be
 * removed before the real launch (docs/PRODUCTION.md).
 */
export const demoAccounts = [
  { key: "president", email: "president@demo.pfm", label: { fr: "Présidence du club", nl: "Clubvoorzitter", en: "Club president" } },
  { key: "coach", email: "coach@demo.pfm", label: { fr: "Coach", nl: "Coach", en: "Coach" } },
  { key: "player", email: "joueur@demo.pfm", label: { fr: "Joueuse", nl: "Speelster", en: "Player" } },
  { key: "parent", email: "parent@demo.pfm", label: { fr: "Parent", nl: "Ouder", en: "Parent" } },
  { key: "federation", email: "federation@demo.pfm", label: { fr: "Fédération", nl: "Federatie", en: "Federation" } },
  { key: "referee", email: "arbitre@demo.pfm", label: { fr: "Arbitre", nl: "Scheidsrechter", en: "Referee" } },
] as const;
export type DemoKey = (typeof demoAccounts)[number]["key"];
type Env = Record<string, string | undefined>;

/** A Vercel preview with the project's demo password, or a local run that asks for it; never production. */
export function demoSwitchEnabled(env: Env = process.env) {
  if (env.VERCEL_ENV === "production") return false;
  if (!env.PFM_DEMO_PASSWORD || env.PFM_DEMO_PASSWORD.length < 12) return false;
  return env.VERCEL_ENV === "preview" || (env.NODE_ENV !== "production" && env.PFM_DEMO_SWITCH === "true");
}

/** The current account is one of the demo accounts, of an organisation marked « démo ». */
export async function isDemoAccount(db: Pool, userId: string) {
  const r = await db.query(
    `SELECT u.email FROM "user" u WHERE u.id=$1 AND u.active AND lower(u.email)=ANY($2::text[])
        AND EXISTS (SELECT 1 FROM organization_membership m JOIN organization o ON o.id=m.organization_id WHERE m.user_id=u.id AND o.is_demo)`,
    [userId, demoAccounts.map((a) => a.email)],
  );
  return r.rowCount ? (r.rows[0].email as string).toLowerCase() : null;
}

/** The target, checked: a demo account of a demo organisation. */
export async function demoTarget(db: Pool, key: string) {
  const a = demoAccounts.find((x) => x.key === key);
  if (!a) throw new AccessError("NOT_FOUND", 404);
  const u = (
    await db.query(
      `SELECT u.id FROM "user" u WHERE lower(u.email)=$1 AND u.active
          AND EXISTS (SELECT 1 FROM organization_membership m JOIN organization o ON o.id=m.organization_id WHERE m.user_id=u.id AND o.is_demo)`,
      [a.email],
    )
  ).rows[0] as { id: string } | undefined;
  if (!u) throw new AccessError("NOT_FOUND", 404);
  return { ...a, userId: u.id };
}

/** The first mandate of the account, to open its space at once. */
export async function firstMandate(db: Pool, userId: string) {
  return ((
    await db.query(
      `SELECT r.id FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id
        WHERE r.user_id=$1 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active
        ORDER BY r.created_at LIMIT 1`,
      [userId],
    )
  ).rows[0]?.id ?? null) as string | null;
}
