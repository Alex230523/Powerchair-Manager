import { Pool } from "pg";
import { createAuth } from "../src/lib/auth";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const rl = createInterface({ input: stdin, output: stdout });
try {
  const email = (await rl.question("Adresse email du président : "))
    .trim()
    .toLowerCase();
  const name = (await rl.question("Nom de la personne : ")).trim();
  const organization = (await rl.question("Nom de l’organisation : ")).trim();
  const contactEmail = (
    await rl.question("Email de contact du club (facultatif) : ")
  ).trim();
  const kind = (await rl.question("Type (club/federation) : ")).trim();
  if (contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail))
    throw new Error("Email de contact invalide");
  if (
    !["club", "federation"].includes(kind) ||
    organization.length < 2 ||
    !email.includes("@") ||
    !name
  )
    throw new Error("Entrées invalides");
  // A random password is never displayed. The owner sets one using local recovery mail.
  const { randomBytes } = await import("node:crypto");
  let user = (
    await db.query('SELECT id FROM "user" WHERE lower(email)=$1', [email])
  ).rows[0];
  if (!user)
    user = (
      await createAuth(db).api.signUpEmail({
        body: { email, name, password: randomBytes(32).toString("hex") },
      })
    ).user;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const org = await client.query(
      "INSERT INTO organization(name,kind,contact_email) VALUES($1,$2,$3) RETURNING id",
      [organization, kind, contactEmail || null],
    );
    await client.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org.rows[0].id, user.id],
    );
    const mandate = await client.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,created_by) VALUES($1,$2,$3,$2) RETURNING id",
      [
        org.rows[0].id,
        user.id,
        kind === "club" ? "club_president" : "federation_president",
      ],
    );
    await client.query(
      "INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,'organization.bootstrap',$3)",
      [org.rows[0].id, user.id, mandate.rows[0].id],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  await createAuth(db).api.requestPasswordReset({
    body: { email, redirectTo: process.env.BETTER_AUTH_URL + "/fr/access" },
  });
  console.log(
    "Organisation créée. Récupération mise en attente. Lancez npm run mail:worker en mode local pour obtenir les liens dans .local/mail/. Aucun email externe envoyé par cette commande.",
  );
} finally {
  rl.close();
  await db.end();
}
