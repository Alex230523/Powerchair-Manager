import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { venueCommand, venueExecute, venuesView } from "../../src/domains/venues/service";
import { builtin, renderTemplate } from "../../src/domains/notifications/templates";
import { blockSchema, renderNewsletter } from "../../src/domains/communication/schema";
import { externalHref } from "../../src/lib/html";

/**
 * Security (07/11/2026), cross-site scripting: the shared hall directory is
 * written by the federation and read by every club. A hall's website is a web
 * address or nothing (the form, then the database, refuse `javascript:`); an
 * older row holding one loses it. A name full of HTML is kept as written and
 * read as written by both clubs; the emails escape it.
 */
const schema = "secxss_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let fed: string, clubA: string, clubB: string, fedPresident: Principal, presidentA: Principal, presidentB: Principal, legacy: string;
const payload = `<img src=x onerror="alert(document.cookie)"><script>alert(1)</script>`;
const venue = (over: Record<string, unknown> = {}) => ({
  action: "save",
  name: "Salle " + payload.slice(0, 90),
  address: "Rue des Sports 1",
  city: "Namur",
  phone: "",
  website: "https://salle.example/acces",
  stepFree: true,
  adaptedToilets: true,
  changingRooms: null,
  showers: null,
  lift: null,
  hoist: null,
  parking: null,
  charging: null,
  doorWidthCm: null,
  floor: "",
  court: "",
  notes: payload,
  checkedOn: null,
  ...over,
});

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  const migrations = (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const before = migrations.filter((f) => f < "0140_");
  for (const f of before) await db.query(await readFile("db/migrations/" + f, "utf8"));
  // A row written before this date, with a website a link must never open.
  fed = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédération','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES($1,'club',$2) RETURNING id", ["Club " + payload.slice(0, 60), fed])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club B','club',$1) RETURNING id", [fed])).rows[0].id;
  fedPresident = await actor(fed, "federation_president", "Présidente");
  presidentA = await actor(clubA, "club_president", "Président A");
  presidentB = await actor(clubB, "club_president", "Président B");
  legacy = (
    await db.query("INSERT INTO shared_venue(name,address,website,created_by,organization_id) VALUES('Vieille salle','Rue 2','javascript:alert(document.cookie)',$1,$2) RETURNING id", [fedPresident.userId, fed])
  ).rows[0].id;
  for (const f of migrations.filter((f) => !before.includes(f))) await db.query(await readFile("db/migrations/" + f, "utf8"));
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("takes the dangerous website off an older hall, and runs again without harm", async () => {
  expect((await db.query("SELECT website FROM shared_venue WHERE id=$1", [legacy])).rows[0].website).toBe("");
  await db.query(await readFile("db/migrations/0140_venue_website.sql", "utf8"));
  expect((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='shared_venue_website_web'")).rows[0].n).toBe(1);
});

it("refuses a website that is not a web address, in the form and in the database", async () => {
  for (const website of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd"]) {
    expect(venueCommand.safeParse(venue({ website })).success, website).toBe(false);
    await expect(db.query("UPDATE shared_venue SET website=$2 WHERE id=$1", [legacy, website]), website).rejects.toMatchObject({ code: "23514" });
  }
  await db.query("UPDATE shared_venue SET website='https://salle.example' WHERE id=$1", [legacy]);
});

it("keeps a name full of HTML as written, and both clubs read it as written", async () => {
  await venueExecute(db, fedPresident, venueCommand.parse(venue()) as never);
  for (const p of [presidentA, presidentB]) {
    const { venues } = (await venuesView(db, p)) as unknown as { venues: { name: string; website: string; notes?: string }[] };
    const saved = venues.find((v) => v.name.startsWith("Salle "));
    expect(saved?.name).toBe("Salle " + payload.slice(0, 90));
    // Every website of the directory is a link or nothing.
    for (const v of venues) expect(v.website === "" || externalHref(v.website) === v.website, v.website).toBe(true);
  }
  // A club may not write the directory at all.
  await expect(venueExecute(db, presidentA, venueCommand.parse(venue({ name: "Autre salle" })) as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("escapes a name full of HTML in every email, and refuses a button that runs a script", () => {
  const template = Object.values(builtin)[0].fr;
  const mail = renderTemplate(template, { name: payload, organization: payload, url: "https://pfm.example/fr/access", role: payload } as never);
  expect(mail.html).not.toMatch(/<script|<img/);
  expect(mail.html).toContain("&lt;script&gt;");
  expect(mail.html).toContain('<a href="https://pfm.example/fr/access">');
  const letter = renderNewsletter(
    [
      { type: "heading", text: payload },
      { type: "text", text: payload },
    ] as never,
    [{ id: randomUUID(), title: payload, when: "samedi", place: payload }],
    { organization: payload, locale: "fr", unsubscribeUrl: "https://pfm.example/stop" },
  );
  expect(letter.html).not.toMatch(/<script|<img/);
  for (const url of ["javascript:alert(1)", "data:text/html,x", "https://x.example/\"onmouseover=alert(1)"]) expect(blockSchema.safeParse({ type: "button", label: "Ouvrir", url }).success, url).toBe(false);
});
