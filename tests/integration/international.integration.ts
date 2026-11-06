import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { transferExecute, transfersView } from "../../src/domains/transfers/service";
import { policyExecute, policyView } from "../../src/domains/federation/policy-service";
import { finesView } from "../../src/domains/fines/service";
import { commissionView } from "../../src/domains/commission/service";
import { registryExecute, registryView } from "../../src/domains/classification/registry";
import { playerProfileView } from "../../src/domains/player-profile/service";

/**
 * International (05/11/2026): two federations of two countries on the
 * platform. Each has its country and its rulebook (the BPCF scale by
 * default); a dossier sent from one to the other is accepted with a
 * certificate, both journals keep it, and nothing else crosses.
 */
const schema = "intl_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let bpcf: string, knvb: string, clubA: string, clubN: string, be: Principal, nl: Principal, nlWorker: Principal, presidentA: Principal, presidentN: Principal, danProfile: string, danPerson: string;

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
  presidentN = await actor(clubN, "club_president", "Voorzitter N");
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  danPerson = person;
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

it("keeps the person's identity and classification across clubs and countries: registry, dossier, arrival", async () => {
  // Every person carries an identity code; the Belgian federation records Dan's classification by hand (older than the platform).
  const code = (await db.query("SELECT identity_code FROM person WHERE id=$1", [danPerson])).rows[0].identity_code as string;
  expect(code).toMatch(/^PFM-[0-9A-F]{10}$/);
  await expect(registryView(db, presidentA)).rejects.toMatchObject({ code: "FEDERATION_ONLY" });
  // Dan already left for Rotterdam (dossier accepted above): no longer an active player of a Belgian club, but his person is known.
  expect((await registryView(db, be)).players.map((x) => x.full_name)).not.toContain("Dan Leroy");
  await expect(registryExecute(db, be, { action: "record", identityCode: "PFM-0000000000", classification: "PF2", decidedOn: "2025-03-01", validUntil: null, classifier: "", international: false, note: "" }, bpcf)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await registryExecute(db, be, { action: "record", identityCode: code.toLowerCase(), classification: "PF2", decidedOn: "2025-03-01", validUntil: "2027-03-01", classifier: "Dr Peeters", international: false, note: "Avant la plateforme" }, bpcf);
  const after = await registryView(db, be);
  expect(after.records.map((r) => [r.identity_code, r.full_name, r.classification, r.source, r.valid_until])).toEqual([[code, "Dan Leroy", "PF2", "manual", "2027-03-01"]]);
  // The former club's sheet (transferred) is left alone; the player's page shows the code and the record all the same.
  expect((await db.query("SELECT classification FROM player_sport_profile WHERE profile_id=$1", [danProfile])).rows[0]?.classification ?? "not_classified").not.toBe("PF2");
  const sheet = await playerProfileView(db, presidentA, danProfile);
  expect(sheet.identity_code).toBe(code);
  // The latest record wins: the one the Dutch federation wrote from the dossier (PF1, recognised from abroad), newer than the 2025 one.
  expect(sheet.registry).toMatchObject({ classification: "PF1", federation: "KNVB Powerchair", international: true });
  // The Dutch federation sees nothing of Dan in its registry (not its club), and cannot remove the Belgian record.
  expect((await registryView(db, nl)).players.map((x) => x.full_name)).not.toContain("Dan Leroy");
  await expect(registryExecute(db, nl, { action: "remove", id: after.records[0].id }, knvb)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The dossier carried his code and his person.
  const dossier = (await db.query("SELECT identity_code,classification,person_id,to_club_id FROM international_transfer WHERE profile_id=$1", [danProfile])).rows[0];
  expect(dossier).toMatchObject({ identity_code: code, person_id: danPerson, to_club_id: clubN });
  // The receiving club opens the sheet: same person, same code, the registry followed into the Dutch club.
  const arrivalsBefore = (await transfersView(db, presidentN)).arrivals;
  expect(arrivalsBefore.map((a) => [a.full_name, a.identity_code, a.arrival_profile_id])).toEqual([["Dan Leroy", code, null]]);
  await expect(run(presidentA, clubA, { action: "internationalArrive", id: arrivalsBefore[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const { profileId } = (await run(presidentN, clubN, { action: "internationalArrive", id: arrivalsBefore[0].id })) as unknown as { profileId: string };
  const created = (await db.query("SELECT person_id,full_name,status,organization_id FROM club_person WHERE id=$1", [profileId])).rows[0];
  expect(created).toMatchObject({ person_id: danPerson, full_name: "Dan Leroy", status: "active", organization_id: clubN });
  expect((await db.query("SELECT classification,classification_status FROM player_sport_profile WHERE profile_id=$1", [profileId])).rows[0]).toEqual({ classification: "PF1", classification_status: "validated" });
  expect((await transfersView(db, presidentN)).arrivals[0].arrival_profile_id).toBe(profileId);
  await expect(run(presidentN, clubN, { action: "internationalArrive", id: arrivalsBefore[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  // Now the Dutch registry lists him, with the Belgian record; and the Belgian federation's records still show him.
  const nlRegistry = await registryView(db, nl);
  expect(nlRegistry.players.map((x) => [x.full_name, x.club, x.identity_code, x.current?.federation, x.current?.source])).toEqual([["Dan Leroy", "Rotterdam PC", code, "KNVB Powerchair", "dossier"]]);
  expect(nlRegistry.records.map((r) => [r.classification, r.source])).toEqual([
    ["PF1", "dossier"],
    ["PF2", "manual"],
  ]);
  expect((await playerProfileView(db, presidentN, profileId)).identity_code).toBe(code);
});
