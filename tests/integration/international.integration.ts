import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { transferExecute, transfersView } from "../../src/domains/transfers/service";
import { policyExecute, policyView } from "../../src/domains/federation/policy-service";
import { finesView } from "../../src/domains/fines/service";
import { commissionView } from "../../src/domains/commission/service";

/**
 * International (05/11/2026): two federations of two countries on the
 * platform. Each has its country and its rulebook (the BPCF scale by
 * default); a dossier sent from one to the other is accepted with a
 * certificate, both journals keep it, and nothing else crosses.
 */
const schema = "intl_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let bpcf: string, knvb: string, clubA: string, clubN: string, be: Principal, nl: Principal, nlWorker: Principal, presidentA: Principal, danProfile: string;

async function actor(org: string, role: string, name: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, `${userId}@example.test`]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, org: string, command: Record<string, unknown>) => transferExecute(db, p, command as never, org) as Promise<{ ok: true; id?: string; certificate?: string }>;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  bpcf = (await db.query("INSERT INTO organization(name,kind) VALUES('BPCF','federation') RETURNING id")).rows[0].id;
  knvb = (await db.query("INSERT INTO organization(name,kind,country_code) VALUES('KNVB Powerchair','federation','NL') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id,training_format) VALUES('Club A','club',$1,'elite') RETURNING id", [bpcf])).rows[0].id;
  clubN = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Rotterdam PC','club',$1) RETURNING id", [knvb])).rows[0].id;
  be = await actor(bpcf, "federation_president", "Présidente BE");
  nl = await actor(knvb, "federation_president", "Voorzitter NL");
  nlWorker = await actor(knvb, "federation_worker", "Scheidsrechters NL", ["federation.referees"]);
  presidentA = await actor(clubA, "club_president", "Président A");
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  danProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles,status,phone) VALUES($1,$2,'Dan Leroy','1999-05-05','{player}','active','0470 11 22 33') RETURNING id", [clubA, person])).rows[0].id;
  await db.query("INSERT INTO player_sport_profile(profile_id,organization_id,classification) VALUES($1,$2,'PF1') ON CONFLICT DO NOTHING", [danProfile, clubA]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("gives each federation its country and its rulebook, the BPCF scale by default, every change versioned", async () => {
  await expect(policyView(db, presidentA)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
  const v0 = await policyView(db, be);
  expect(v0).toMatchObject({ country: "BE", isDefault: true, version: null, canManage: true });
  expect(v0.policy.trainingRates.international.academy).toBe(50000);
  expect(v0.countries.map((c) => c.code)).toContain("GB");
  // The Dutch federation raises its international academy rate and its late fine; the BPCF is untouched.
  const policy = { ...v0.policy, trainingRates: { ...v0.policy.trainingRates, international: { ...v0.policy.trainingRates.international, academy: 60000 } }, fineDefaults: { ...v0.policy.fineDefaults, late: 4000 } };
  await expect(policyExecute(db, nlWorker, { action: "save", policy }, knvb)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await policyExecute(db, nl, { action: "save", policy }, knvb)).version).toBe(1);
  await policyExecute(db, nl, { action: "save", policy: { ...policy, internationalFileFeeCents: 30000 } }, knvb);
  const v = await policyView(db, nl);
  expect(v).toMatchObject({ country: "NL", isDefault: false, version: 2 });
  expect(v.policy.internationalFileFeeCents).toBe(30000);
  expect(v.history.map((h) => h.version)).toEqual([2, 1]);
  expect((await policyView(db, be)).policy.fineDefaults.late).toBe(2500);
  // The fines page offers the federation's own amounts.
  expect((await finesView(db, nl)).defaults).toMatchObject({ late: 4000, forfeit: 5000, other: null });
  // The country of the federation is its clubs' country.
  await policyExecute(db, nl, { action: "country", code: "NL" }, knvb);
  expect((await db.query("SELECT country_code FROM organization WHERE id=$1", [clubN])).rows[0].country_code).toBe("NL");
  await expect(policyExecute(db, nl, { action: "country", code: "ZZ" }, knvb)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Back to the scale: the row goes, the history stays.
  await policyExecute(db, nl, { action: "reset" }, knvb);
  expect((await policyView(db, nl)).isDefault).toBe(true);
  expect((await policyView(db, nl)).history.length).toBe(2);
});

it("sends a dossier from one federation to the other, which accepts it with a certificate; both journals keep it", async () => {
  const before = await transfersView(db, be);
  expect(before.federations.map((f) => [f.name, f.country])).toEqual([["KNVB Powerchair", "NL"]]);
  expect(before.country).toBe("BE");
  // Off the platform: the country is typed; on it: the federation is chosen and its country applies.
  await expect(run(be, bpcf, { action: "international", profileId: danProfile, foreignClub: "Rotterdam PC", country: "", toFederationId: null, trainingYears: 2, note: "" })).rejects.toMatchObject({ code: "COUNTRY_REQUIRED" });
  await expect(run(be, bpcf, { action: "international", profileId: danProfile, foreignClub: "Rotterdam PC", country: "", toFederationId: bpcf, trainingYears: 2, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const id = (await run(be, bpcf, { action: "international", profileId: danProfile, foreignClub: "Rotterdam PC", country: "", toFederationId: knvb, trainingYears: 2, note: "Formé chez nous" })).id!;
  const sent = (await transfersView(db, be)).international[0];
  expect(sent).toMatchObject({ id, status: "sent", country: "NL", to_federation: "KNVB Powerchair", amount_cents: 2 * 75000 + 25000, certificate: "" });
  // The receiving federation sees the dossier: name, class, training, amount; the club president of A sees nothing of it.
  const inbox = (await transfersView(db, nl)).incoming;
  expect(inbox).toHaveLength(1);
  expect(inbox[0]).toMatchObject({ id, full_name: "Dan Leroy", classification: "PF1", federation: "BPCF", country: "BE", club: "Club A", status: "sent", training_years: 2, training_format: "elite" });
  expect(Object.keys(inbox[0])).not.toContain("birth_date");
  expect((await transfersView(db, be)).incoming).toEqual([]);
  // The notice went to the Dutch presidency.
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND resource_id=$2", [knvb, `international:${id}:sent`])).rows[0].n).toBe(1);
  // Only the receiving federation decides, once, naming one of its own clubs.
  await expect(run(be, bpcf, { action: "internationalDecide", id, decision: "accepted", toClubId: null, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(nlWorker, knvb, { action: "internationalDecide", id, decision: "accepted", toClubId: null, note: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(run(nl, knvb, { action: "internationalDecide", id, decision: "accepted", toClubId: clubA, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const { certificate } = await run(nl, knvb, { action: "internationalDecide", id, decision: "accepted", toClubId: clubN, note: "Welkom" });
  expect(certificate).toMatch(/^CIT-\d{4}-0001$/);
  await expect(run(nl, knvb, { action: "internationalDecide", id, decision: "refused", toClubId: null, note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await transfersView(db, nl)).incoming[0]).toMatchObject({ status: "accepted", certificate, to_club: "Rotterdam PC", decision_note: "Welkom" });
  expect((await transfersView(db, be)).international[0]).toMatchObject({ status: "accepted", certificate, to_club: "Rotterdam PC" });
  // Both commissions keep the decision; the Belgian one unsigned until its members sign.
  const nlJournal = (await commissionView(db, nl)).decisions;
  expect(nlJournal.map((d) => [d.kind, d.signatures.length])).toEqual([["international", 1]]);
  const beJournal = (await commissionView(db, be)).decisions;
  expect(beJournal.map((d) => [d.kind, d.signatures.length])).toEqual([
    ["international", 0],
    ["international", 1],
  ]);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE organization_id=$1 AND resource_id=$2", [bpcf, `international:${id}:accepted`])).rows[0].n).toBe(1);
});
