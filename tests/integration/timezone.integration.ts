import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { brusselsDay } from "../../src/lib/today";
import { guardPool } from "../../src/lib/env";

/**
 * 13/11/2026: « aujourd'hui » est le jour de Bruxelles, en base comme dans le
 * code. Après les migrations, une nouvelle session est en Europe/Brussels ;
 * une session de l'application aussi, même sur une base restée en UTC.
 */
const schema = "tz_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives every new session the Brussels time zone, and CURRENT_DATE the day in Brussels", async () => {
  const fresh = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    expect((await fresh.query("SHOW timezone")).rows[0].TimeZone).toBe("Europe/Brussels");
    expect((await fresh.query("SELECT CURRENT_DATE::text AS d")).rows[0].d).toBe(brusselsDay());
  } finally {
    await fresh.end();
  }
});

it("sets it on the application's sessions too, whatever the database says", async () => {
  const app = guardPool(new Pool({ connectionString: process.env.DATABASE_URL, max: 1, options: "-c timezone=UTC" }));
  try {
    const c = await app.connect();
    try {
      // The guards run on connect; wait for them like the first query would.
      await c.query("SELECT 1");
      expect((await c.query("SHOW timezone")).rows[0].TimeZone).toBe("Europe/Brussels");
    } finally {
      c.release();
    }
  } finally {
    await app.end();
  }
});

it("keeps instants as instants: a stored moment reads the same whatever the zone", async () => {
  const at = new Date("2026-11-12T23:30:00Z");
  const r = (await db.query("SELECT $1::timestamptz AS at,($1::timestamptz)::date::text AS day", [at])).rows[0];
  expect((r.at as Date).toISOString()).toBe(at.toISOString());
  // 23:30 UTC is 00:30 the next day in Brussels.
  expect(r.day).toBe("2026-11-13");
});
