import { afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { guardPool, poolSettings } from "../../src/lib/env";

/**
 * Security (06/11/2026), cloud misconfigurations: every connection of the
 * site tells the database to cut a statement still running after the site
 * gave up, and a transaction opened then forgotten. A small free database
 * (Neon) has few slots: one slow query must not hold one until it restarts.
 */
const site = guardPool(new Pool({ connectionString: process.env.DATABASE_URL, max: 2, ...poolSettings })),
  // The same guard without the client's own limit: the database alone cuts.
  bare = guardPool(new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }));
afterAll(async () => {
  await site.end();
  await bare.end();
});

it("gives every new connection of the site its limits", async () => {
  for (let i = 0; i < 3; i++) {
    const c = await site.connect();
    try {
      expect((await c.query("SHOW statement_timeout")).rows[0].statement_timeout).toBe("5s");
      expect((await c.query("SHOW idle_in_transaction_session_timeout")).rows[0].idle_in_transaction_session_timeout).toBe("2min");
    } finally {
      c.release();
    }
  }
});

it("lets the database cut a statement the site no longer waits for", async () => {
  const t0 = Date.now();
  await expect(bare.query("SELECT pg_sleep(8)")).rejects.toMatchObject({ code: "57014" });
  const ms = Date.now() - t0;
  expect(ms).toBeGreaterThanOrEqual(4500);
  expect(ms).toBeLessThan(7500);
  // The connection stays usable afterwards.
  expect((await bare.query("SELECT 1 AS one")).rows[0].one).toBe(1);
}, 15000);
