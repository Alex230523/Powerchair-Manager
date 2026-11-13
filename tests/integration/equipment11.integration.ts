import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { commandSchema, equipmentExecute, equipmentView } from "../../src/domains/equipment/service";
import { brusselsDay } from "../../src/lib/today";

/**
 * 11: the equipment page. The chair's label with its model, a loan from the
 * row, the sheet and « Nouveau prêt » (to a club or a player), five balls
 * lent, a category created on the fly, a system category that stays, a
 * sub-place with its full path and a third level refused; two clubs.
 */
const schema = "eq11_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, president: Principal, presidentB: Principal, chair: string, bare: string, lea: string;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => equipmentExecute(db, p, commandSchema.parse(cmd), org) as Promise<{ id: string }>;
const day = (n: number) => brusselsDay(new Date(Date.now() + n * 86400000));
const item = (name: string, extra: Record<string, unknown> = {}) => ({ action: "item", name, category: "ball", quantity: 8, storage: "", expiresOn: null, notes: "", ...extra });

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  president = await actor(clubA, "club_president", "Présidente");
  presidentB = await actor(clubB, "club_president", "Président B");
  const model = (await db.query("INSERT INTO chair_model(brand,name,status) VALUES('Permobil','Strike Force X','validated') RETURNING id")).rows[0].id;
  chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership,model_id) VALUES($1,'Strike 3','available','club',$2) RETURNING id", [clubA, model])).rows[0].id;
  bare = (await db.query("INSERT INTO equipment_chair(organization_id,name,status,ownership) VALUES($1,'Vieux fauteuil','available','club') RETURNING id", [clubA])).rows[0].id;
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  lea = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Martin','2010-01-01','{player}') RETURNING id", [clubA, person])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("labels a chair « Nom · Marque Modèle » in the list, the loans and the trips, and flags one without a model", async () => {
  const v = await equipmentView(db, president);
  expect(v.chairs.find((c) => c.id === chair)?.label).toBe("Strike 3 · Permobil Strike Force X");
  const old = v.chairs.find((c) => c.id === bare)!;
  expect(old.label).toBe("Vieux fauteuil");
  expect(old.model_name).toBeNull();
  expect((await db.query("SELECT chair_label($1) AS l", [chair])).rows[0].l).toBe("Strike 3 · Permobil Strike Force X");
});

it("lends a chair to another club and to a player, never twice on the same dates", async () => {
  // From the row, the sheet or « Nouveau prêt »: one command.
  await run(president, { action: "lendDirect", chairId: chair, borrowerId: clubB, startsOn: day(0), endsOn: day(10) });
  await expect(run(president, { action: "lendDirect", chairId: chair, profileId: lea, startsOn: day(5), endsOn: day(6) })).rejects.toMatchObject({ code: "CHAIR_NOT_FREE" });
  await run(president, { action: "lendDirect", chairId: bare, profileId: lea, startsOn: day(0), endsOn: day(30) });
  const loans = (await equipmentView(db, president)).directLoans;
  expect(loans.map((l) => [l.chair, l.borrower]).sort()).toEqual([["Vieux fauteuil", "Léa Martin"]]);
  // The chair lent to the other club stays in the loans between clubs, with its label.
  expect((await equipmentView(db, president)).loans.lent.map((l) => l.chair)).toEqual(["Strike 3 · Permobil Strike Force X"]);
  // Not to oneself, nor to a club outside the federation.
  const outside = (await db.query("INSERT INTO organization(name,kind) VALUES('Hors fédé','club') RETURNING id")).rows[0].id;
  await expect(run(president, { action: "lendDirect", chairId: bare, borrowerId: outside, startsOn: day(40), endsOn: day(41) })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("lends five balls out of eight, and refuses more than what is left", async () => {
  const balls = (await run(president, item("Ballons de match"))).id;
  const loan = (await run(president, { action: "lendDirect", itemId: balls, quantity: 5, borrowerId: clubB, startsOn: day(0), endsOn: day(7) })).id;
  const v = await equipmentView(db, president);
  expect(v.items.find((i) => i.id === balls)).toMatchObject({ quantity: 8, lent: 5 });
  await expect(run(president, { action: "lendDirect", itemId: balls, quantity: 4, profileId: lea, startsOn: day(0), endsOn: day(7) })).rejects.toMatchObject({ code: "NOT_ENOUGH" });
  await run(president, { action: "returnDirect", id: loan });
  expect((await equipmentView(db, president)).items.find((i) => i.id === balls)?.lent).toBe(0);
  // Club B cannot return Club A's loan.
  await expect(run(presidentB, { action: "returnDirect", id: loan }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("creates a category on the fly, keeps the system ones, merges and archives the others", async () => {
  const v = await equipmentView(db, president);
  const battery = v.categories.find((g) => g.system_key === "battery")!;
  expect(v.categories.filter((g) => g.system_key).length).toBe(10);
  const signs = (await run(president, { action: "categoryCreate", name: "Signalétique" })).id;
  expect((await run(president, { action: "categoryCreate", name: "signalétique" })).id).toBe(signs);
  const panel = (await run(president, item("Panneau d'accueil", { categoryId: signs, quantity: 2 }))).id;
  const pack = (await run(president, item("Batterie 24 V", { categoryId: battery.id, category: "other", quantity: 2 }))).id;
  const items = (await equipmentView(db, president)).items;
  expect(items.find((i) => i.id === panel)).toMatchObject({ category: "other", category_name: "Signalétique" });
  // A system category keeps its key for the alerts.
  expect(items.find((i) => i.id === pack)).toMatchObject({ category: "battery" });
  await expect(run(president, { action: "categoryArchive", id: battery.id, archived: true })).rejects.toMatchObject({ code: "SYSTEM_CATEGORY" });
  await run(president, { action: "categoryRename", id: battery.id, name: "Batteries et chargeurs" });
  const tools = v.categories.find((g) => g.system_key === "tool")!;
  await run(president, { action: "categoryMerge", id: signs, into: tools.id });
  const after = await equipmentView(db, president);
  expect(after.items.find((i) => i.id === panel)).toMatchObject({ category: "tool", category_id: tools.id });
  expect(after.categories.find((g) => g.id === signs)?.archived).toBe(true);
  expect(after.categories.find((g) => g.id === battery.id)?.name).toBe("Batteries et chargeurs");
  // Another club's categories are its own.
  expect((await equipmentView(db, presidentB)).categories.some((g) => g.id === signs)).toBe(false);
  await expect(run(presidentB, { action: "categoryRename", id: battery.id, name: "X" }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("nests a place in another with its full path, and refuses a third level", async () => {
  const place = (n: string, parentId: string | null = null) => run(president, { action: "storage", name: n, placeId: null, address: "", contact: "", access: "", notes: "", parentId });
  const room = (await place("Local du club")).id;
  const shelf = (await place("Étagère A", room)).id;
  await expect(place("Boîte 1", shelf)).rejects.toMatchObject({ code: "TOO_DEEP" });
  const balls = (await run(president, item("Ballons d'entraînement", { storageLocationId: shelf }))).id;
  const v = await equipmentView(db, president);
  expect(v.items.find((i) => i.id === balls)?.storage_path).toBe("Local du club › Étagère A");
  expect(v.storage.places.find((p) => p.id === shelf)).toMatchObject({ parent_id: room, parent_name: "Local du club" });
  // The database refuses it too.
  await expect(db.query("INSERT INTO storage_location(organization_id,name,parent_id) VALUES($1,'Tiroir',$2)", [clubA, shelf])).rejects.toBeTruthy();
  // A place of another club cannot be a parent.
  await expect(run(presidentB, { action: "storage", name: "Garage", placeId: null, address: "", contact: "", access: "", notes: "", parentId: room }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
