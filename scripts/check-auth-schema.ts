import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../src/lib/auth";
const db = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await getMigrations(createAuth(db).options);
  console.log(await result.compileMigrations());
  console.log(
    JSON.stringify({
      tables: result.toBeCreated.map((t) => t.table),
      fields: result.toBeAdded,
      schemaProblems: result.schemaProblems,
    }),
  );
} finally {
  await db.end();
}
