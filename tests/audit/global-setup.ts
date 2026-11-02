import { Pool } from "pg";
import { prepareAudit } from "./support";

/** Audits 23 and 26: the extra accounts, the second club and federation, once before every worker starts. */
export default async function globalSetup() {
  const db = new Pool({ connectionString: process.env.PFM_E2E_DATABASE_URL });
  try {
    await prepareAudit(db);
  } finally {
    await db.end();
  }
}
