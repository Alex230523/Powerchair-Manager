import "server-only";
import { Pool } from "pg";
import { databaseUrl, guardPool, poolSettings } from "./env";
const globalDb = globalThis as unknown as {
  pfmPool?: Pool;
  pfmMailPool?: Pool;
};
export function getDb() {
  if (!globalDb.pfmPool)
    globalDb.pfmPool = guardPool(
      new Pool({
        connectionString: databaseUrl(process.env),
        max: 5,
        ...poolSettings,
      }),
    );
  return globalDb.pfmPool;
}

// Email callbacks can run while the authentication adapter holds its connection.
// A separate bounded pool prevents callback starvation under concurrent sign-ups.
export function getMailDb() {
  if (!globalDb.pfmMailPool)
    globalDb.pfmMailPool = guardPool(
      new Pool({
        connectionString: databaseUrl(process.env),
        max: 3,
        ...poolSettings,
      }),
    );
  return globalDb.pfmMailPool;
}
