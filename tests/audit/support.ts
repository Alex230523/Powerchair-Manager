import type { APIRequestContext } from "@playwright/test";
import type { Pool } from "pg";
import { createAccount } from "../support/session";

/**
 * Audits 23 and 26: the demo accounts (scripts/demo-seed.ts, public
 * password, never online) plus a federation worker, a second club and a
 * second federation made here, each signed in through the real sign-in.
 */
export const origin = "http://127.0.0.1:3100";
export const demoPassword = "Demo-Powerchair-2026";
export const auditPassword = "Audit-passphrase-2026!";

export type AuditRole = "president" | "coach" | "player" | "parent" | "federation" | "referee" | "federation_worker" | "president_b" | "federation_b";
export const demoRoles: { role: AuditRole; email: string }[] = [
  { role: "president", email: "president@demo.pfm" },
  { role: "coach", email: "coach@demo.pfm" },
  { role: "player", email: "joueur@demo.pfm" },
  { role: "parent", email: "parent@demo.pfm" },
  { role: "federation", email: "federation@demo.pfm" },
  { role: "referee", email: "arbitre@demo.pfm" },
];
export const extraRoles: { role: AuditRole; email: string }[] = [
  { role: "federation_worker", email: "audit-secretariat@example.test" },
  { role: "president_b", email: "audit-president-b@example.test" },
  { role: "federation_b", email: "audit-federation-b@example.test" },
];
/** Words that belong to club B and federation B only: no demo role may ever read them. */
export const secretsB = ["Zoé Marqueur-Audit", "AUDIT-SECRET-B-FINANCE", "Fédération Audit B"];

/** The federation worker, a club B with one player and one ledger line, a federation B. Idempotent. */
export async function prepareAudit(db: Pool) {
  const demoFed = (await db.query("SELECT id FROM organization WHERE name='BPCF (démo)' AND kind='federation'")).rows[0]?.id as string | undefined;
  if (!demoFed) throw new Error("Run scripts/demo-seed.ts on this database first.");
  const fedB =
    ((await db.query("SELECT id FROM organization WHERE name=$1", [secretsB[2]])).rows[0]?.id as string | undefined) ??
    ((await db.query("INSERT INTO organization(name,kind,is_demo) VALUES($1,'federation',true) RETURNING id", [secretsB[2]])).rows[0].id as string);
  const clubB =
    ((await db.query("SELECT id FROM organization WHERE name='Club audit B'")).rows[0]?.id as string | undefined) ??
    ((await db.query("INSERT INTO organization(name,kind,federation_id,is_demo) VALUES('Club audit B','club',$1,true) RETURNING id", [fedB])).rows[0].id as string);
  async function member(email: string, name: string, org: string, role: string) {
    const existing = (await db.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0]?.id as string | undefined;
    const user = existing ?? (await createAccount(db, name, email, auditPassword)).id;
    await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [org, user]);
    if (!(await db.query("SELECT 1 FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role=$3 AND revoked_at IS NULL", [org, user, role])).rowCount)
      await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3)", [org, user, role]);
    return user;
  }
  await member(extraRoles[0].email, "Secrétariat audit", demoFed, "federation_worker");
  const presidentB = await member(extraRoles[1].email, "Président audit B", clubB, "club_president");
  await member(extraRoles[2].email, "Présidente fédération B", fedB, "federation_president");
  if (!(await db.query("SELECT 1 FROM club_person WHERE organization_id=$1 AND full_name=$2", [clubB, secretsB[0]])).rowCount)
    await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,p.id,$2,'2012-03-04','{player}' FROM p", [clubB, secretsB[0]]);
  if (!(await db.query("SELECT 1 FROM finance_transaction WHERE organization_id=$1 AND label=$2", [clubB, secretsB[1]])).rowCount)
    await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE,$2,'in','donation',4321,$3)", [clubB, secretsB[1], presidentB]);
  // The first-connection tour stays out of the way.
  await db.query(
    "INSERT INTO user_tutorial(user_id,audience,tutorial_seen_at) SELECT u.id,a,now() FROM \"user\" u, unnest(ARRAY['coach','player','parent']) a WHERE u.email LIKE '%@demo.pfm' ON CONFLICT DO NOTHING",
  );
  return { clubB, fedB, demoFed };
}

export function passwordOf(role: AuditRole) {
  return demoRoles.some((r) => r.role === role) ? demoPassword : auditPassword;
}
export function emailOf(role: AuditRole) {
  return [...demoRoles, ...extraRoles].find((r) => r.role === role)!.email;
}

/** Signs `request` in (the page's request shares its cookies) and picks the role's first profile. */
export async function signIn(request: APIRequestContext, db: Pool, role: AuditRole) {
  // Several tests sign the same account in at once: a refused attempt is tried again.
  let context: { id: string } | undefined;
  for (let attempt = 1; attempt <= 4 && !context; attempt++) {
    await db.query('DELETE FROM "rateLimit"');
    const login = await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email: emailOf(role), password: passwordOf(role) } });
    if (login.status() !== 200) {
      if (attempt === 4) throw new Error(`Sign-in of ${role}: ${login.status()}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    const workspace = await request.get("/api/workspace").then((r) => r.json()).catch(() => ({}));
    context = ((workspace as { contexts?: { id: string }[] }).contexts ?? [])[0];
    if (!context) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  if (!context) throw new Error(`No profile for ${role}`);
  const chosen = await request.post("/api/workspace", { headers: { origin }, data: { action: "context", mandateId: context.id } });
  if (chosen.status() !== 200) throw new Error(`Context of ${role}: ${chosen.status()}`);
}
