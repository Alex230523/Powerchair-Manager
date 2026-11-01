import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { exportFile } from "../../src/domains/exports/service";
import { exportInput } from "../../src/domains/exports/schema";

/** Wave 17 (G2): the server writes the export, typed, and notes it in the journal; one club at a time. */
const schema = "w17exp_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coachB: Principal;

async function actor(org: string, role: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const input = (format: "xlsx" | "csv") =>
  exportInput.parse({
    dataset: "dues",
    format,
    subject: "Cotisations",
    period: "2026-27",
    columns: [
      { header: "Joueur", type: "text" },
      { header: "Montant", type: "money" },
      { header: "Échéance", type: "date" },
    ],
    rows: [
      ["Ana", 250, "2026-10-01"],
      ["Bilal", 125.5, null],
    ],
  });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('TigerStorm','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  coachB = await actor(clubB, "coach");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("writes a typed Excel file named after the club, and notes who exported what", async () => {
  const f = await exportFile(db, president, input("xlsx"), clubA);
  expect(f.name).toBe("tigerstorm-cotisations-2026-27.xlsx");
  const sheet = new TextDecoder().decode(f.body as Uint8Array);
  expect(sheet).toContain('<c r="B3" s="2"><v>125.5</v></c>');
  expect(sheet).toContain('<c r="C2" s="3"><v>46296</v></c>');
  const log = (await db.query("SELECT actor_id,details FROM audit_log WHERE organization_id=$1 AND action='export.dues'", [clubA])).rows;
  expect(log).toEqual([{ actor_id: president.userId, details: { rows: 2, format: "xlsx", columns: ["Joueur", "Montant", "Échéance"] } }]);
});

it("writes a CSV with two decimals, and refuses another club's context", async () => {
  const f = await exportFile(db, president, input("csv"), clubA);
  expect(f.name).toBe("tigerstorm-cotisations-2026-27.csv");
  expect(String(f.body)).toContain('"Bilal";"125.50";""');
  await expect(exportFile(db, coachB, input("xlsx"), clubA)).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  expect((await db.query("SELECT count(*)::int AS n FROM audit_log WHERE organization_id=$1 AND action LIKE 'export.%'", [clubB])).rows[0].n).toBe(0);
});
