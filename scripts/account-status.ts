import { Pool } from "pg";
const [email, action] = process.argv.slice(2);
if (!email || !["activate", "deactivate"].includes(action))
  throw new Error("Usage: npm run admin:account -- email activate|deactivate");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await db.connect();
try {
  await client.query("BEGIN");
  const user = (
    await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1)', [
      email,
    ])
  ).rows[0];
  if (!user) throw new Error("Unknown account");
  // Lock every affected organization in a stable order; do not remove the last administrator.
  const orgs = await client.query(
    "SELECT o.id FROM organization o JOIN organization_membership m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.id FOR UPDATE OF o",
    [user.id],
  );
  await client.query('UPDATE "user" SET active=$2 WHERE id=$1', [
    user.id,
    action === "activate",
  ]);
  for (const org of orgs.rows) {
    if (action === "deactivate") {
      const count = await client.query(
        `SELECT 1 FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND r.valid_until IS NULL AND r.role IN ('club_president','federation_president') LIMIT 1`,
        [org.id],
      );
      if (!count.rowCount) throw new Error("LAST_ADMIN");
    }
    await client.query(
      "INSERT INTO audit_log(organization_id,actor_id,action,target_id) VALUES($1,$2,$3,$2)",
      [org.id, user.id, "operator.account." + action],
    );
  }
  if (action === "deactivate")
    await client.query('DELETE FROM session WHERE "userId"=$1', [user.id]);
  await client.query("COMMIT");
  console.log("Account status updated; local operator action recorded.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await db.end();
}
