import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { commissionExecute, commissionView, recordDecision } from "../../src/domains/commission/service";
import { finesExecute } from "../../src/domains/fines/service";
import { federationLicensesExecute, federationLicensesView } from "../../src/domains/federation/service";

/** Lot 6 (05/11/2026): the commission's journal, signed by its members; the licence numbers taken from a file. */
const schema = "comm_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, other: string, clubA: string, president: Principal, worker: Principal, referee: Principal, otherFed: Principal, presidentA: Principal;

async function actor(org: string, role: string, name: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  other = (await db.query("INSERT INTO organization(name,kind) VALUES('Autre','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  president = await actor(fed, "federation_president", "Présidente");
  worker = await actor(fed, "federation_worker", "Secrétaire", ["federation.licences"]);
  referee = await actor(fed, "federation_worker", "Arbitrage", ["federation.referees"]);
  otherFed = await actor(other, "federation_president", "Autre présidente");
  presidentA = await actor(clubA, "club_president", "Président A");
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("records the decisions, by hand and from a fine, each member signing in their own name", async () => {
  await expect(commissionView(db, presidentA)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
  await expect(commissionExecute(db, referee, { action: "record", kind: "other", subject: "x", decision: "y", reference: "", decidedOn: "2026-11-05" }, fed)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const id = (await commissionExecute(db, president, { action: "record", kind: "other", subject: "Calendrier 2027", decision: "Adopté", reference: "", decidedOn: "2026-11-05" }, fed)).id;
  // A fine given elsewhere lands in the journal, signed by the one who gave it.
  await finesExecute(db, worker, { action: "create", clubId: clubA, kind: "late", amountCents: 2500, issuedOn: "2026-11-05", reason: "" }, fed);
  const v = await commissionView(db, worker);
  expect(v.members.map((m) => m.name)).toEqual(["Présidente", "Secrétaire"]);
  expect(v.decisions.map((d) => [d.kind, d.subject, d.signatures.map((g) => g.name), d.mine])).toEqual([
    ["fine", "Club A : retard", ["Secrétaire"], true],
    ["other", "Calendrier 2027", ["Présidente"], false],
  ]);
  await commissionExecute(db, worker, { action: "sign", id }, fed);
  expect((await commissionView(db, president)).decisions.find((d) => d.id === id)!.signatures.map((g) => g.name)).toEqual(["Présidente", "Secrétaire"]);
  await commissionExecute(db, worker, { action: "unsign", id }, fed);
  expect((await commissionView(db, president)).decisions.find((d) => d.id === id)!.signatures).toHaveLength(1);
  // Another federation sees nothing of it and cannot sign it.
  expect((await commissionView(db, otherFed)).decisions).toEqual([]);
  await expect(commissionExecute(db, otherFed, { action: "sign", id }, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const c = await db.connect();
  try {
    await recordDecision(c, fed, president.userId, { kind: "transfer", subject: "Ana", decision: "Validé", signed: false });
  } finally {
    c.release();
  }
  expect((await commissionView(db, president)).decisions[0]).toMatchObject({ kind: "transfer", signatures: [] });
});

it("takes the licence numbers from the federation's file, matched by name, club and season", async () => {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Émile Dupont','2001-01-01','{player}') RETURNING id", [clubA, person])).rows[0].id;
  await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,status,requested_by) VALUES($1,$2,$3,'2026-27','requested',$4)", [fed, clubA, profile, presidentA.userId]);
  const r = await federationLicensesExecute(
    db,
    worker,
    {
      action: "importLicenses",
      rows: [
        { number: "BPCF-2026-0042", fullName: "emile dupont", club: "club a", season: "2026-27" },
        { number: "BPCF-2026-0043", fullName: "Inconnu", club: "Club A", season: "2026-27" },
      ],
    },
    fed,
  );
  expect(r).toMatchObject({ updated: 1, unmatched: ["Inconnu · Club A · 2026-27"], conflicts: [] });
  const l = (await federationLicensesView(db, worker)).licenses.find((x) => x.full_name === "Émile Dupont")!;
  expect(l).toMatchObject({ number: "BPCF-2026-0042", status: "active" });
  // The same number for someone else is refused.
  const p2 = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const profile2 = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Zoé Martin','2001-01-01','{player}') RETURNING id", [clubA, p2])).rows[0].id;
  await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,status,requested_by) VALUES($1,$2,$3,'2026-27','requested',$4)", [fed, clubA, profile2, presidentA.userId]);
  const again = await federationLicensesExecute(db, worker, { action: "importLicenses", rows: [{ number: "BPCF-2026-0042", fullName: "Zoé Martin", club: "Club A", season: "2026-27" }] }, fed);
  expect(again).toMatchObject({ updated: 0, conflicts: ["BPCF-2026-0042 (Zoé Martin)"] });
  await expect(federationLicensesExecute(db, otherFed, { action: "importLicenses", rows: [{ number: "X", fullName: "Émile Dupont", club: "Club A", season: "2026-27" }] }, other)).resolves.toMatchObject({ updated: 0, unmatched: ["Émile Dupont · Club A · 2026-27"] });
});
