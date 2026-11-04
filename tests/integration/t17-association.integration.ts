import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { associationExecute, associationTick, associationView, registerPdf } from "../../src/domains/association/service";
import { associationCommand } from "../../src/domains/association/schema";

/**
 * 17: the register fed by minutes, a line never changed and its motivated
 * correction, the assembly's deadline from the financial year, the
 * invitation sent once at J-15, a proxy beyond the maximum refused, a missed
 * quorum that proposes a second assembly, minutes generated and signed,
 * the Moniteur and UBO tasks after a change of directors, a player who is
 * not a member and stays out of the register, two clubs.
 */
const schema = "t17_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, member: Principal;
let presidentProfile: string, memberProfile: string, alice: string, bob: string, carla: string, playerProfile: string, assembly: string;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const run = async (p: Principal, body: Record<string, unknown>, org = clubA) => associationExecute(db, p, associationCommand.parse(body), org) as Promise<Record<string, unknown> & { id: string }>;
const dispatches = async (userId: string) => Number((await db.query("SELECT count(*)::int AS n FROM notification_dispatch WHERE recipient_user_id=$1", [userId])).rows[0].n);

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  const profile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,$3) RETURNING id", [org, person, name])).rows[0].id as string;
  return { p, profile };
}
const person = async (org: string, name: string) => {
  const p = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,$3) RETURNING id", [org, p, name])).rows[0].id as string;
};

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const a = await actor(clubA, "club_president", "Présidente");
  [president, presidentProfile] = [a.p, a.profile];
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const m = await actor(clubA, "coach", "Membre Effectif");
  [member, memberProfile] = [m.p, m.profile];
  alice = await person(clubA, "Alice");
  bob = await person(clubA, "Bob");
  carla = await person(clubA, "Carla");
  playerProfile = (await actor(clubA, "player", "Joueur Seulement")).profile;
  await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison',CURRENT_DATE-200,CURRENT_DATE+200)", [clubA]);
  for (const pid of [presidentProfile, memberProfile, alice, bob])
    await run(president, { action: "status", profileId: pid, event: "admission", status: "effective", decisionBody: "assembly", decisionOn: day(-300).slice(0, 10) });
  await run(president, { action: "rules", rules: { noticeDays: 15, quorumPercent: 50, maxProxies: 1 } });
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("keeps the register apart from the sport: four effective members, not the player; a line never changes", async () => {
  const v = await associationView(db, president, "fr");
  expect(v.members.filter((x) => x.status === "effective").map((x) => x.full_name).sort()).toEqual(["Alice", "Bob", "Membre Effectif", "Présidente"]);
  expect(v.members.some((x) => x.profile_id === playerProfile)).toBe(false);
  const line = v.register.find((l) => l.profile_id === bob)!;
  await expect(db.query("UPDATE member_register SET reason='x' WHERE id=$1", [line.id])).rejects.toThrow(/MEMBER_REGISTER_FROZEN/);
  await expect(db.query("DELETE FROM member_register WHERE id=$1", [line.id])).rejects.toThrow(/MEMBER_REGISTER_FROZEN/);
  await expect(run(president, { action: "correct", lineId: line.id, status: "adherent", reason: "" })).rejects.toThrow();
  await run(president, { action: "correct", lineId: line.id, status: "adherent", reason: "Inscrit par erreur comme effectif" });
  const after = await associationView(db, president, "fr");
  expect(after.members.find((x) => x.profile_id === bob)!.status).toBe("adherent");
  expect(after.register.filter((l) => l.profile_id === bob).map((l) => l.event)).toEqual(["correction", "admission"]);
  // An effective member reads the register; a player who is not one does not.
  expect((await associationView(db, member, "fr")).register.length).toBeGreaterThan(0);
  const pdf = await registerPdf(db, member, "fr");
  expect(Buffer.from(pdf.bytes).subarray(0, 5).toString()).toBe("%PDF-");
});

it("asks to set the assembly's date by the deadline of the last closed year, once", async () => {
  await associationTick(db);
  await associationTick(db);
  const v = await associationView(db, president, "fr");
  const tasks = (await db.query("SELECT title FROM task WHERE organization_id=$1 AND source_key LIKE 'assembly:%'", [clubA])).rows;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe(`Fixer la date de l'assemblée générale (au plus tard le ${v.year.deadline})`);
  expect(v.year.deadline).toMatch(/-06-30$/);
});

it("plans the assembly: agenda prefilled, tasks, the invitation sent once at J-15 and the reminder", async () => {
  const v = await associationView(db, president, "fr");
  assembly = (await run(president, { action: "plan", kind: "assembly", title: "Assemblée générale ordinaire", startsAt: day(14), place: "Local du club", fiscalYearStart: v.year.from, locale: "fr" })).id;
  const m = (await associationView(db, president, "fr")).meetings.find((x) => x.id === assembly)!;
  expect(m.items.map((i) => i.kind)).toEqual(["accounts", "budget", "discharge", "free"]);
  expect(m.attendees).toHaveLength(3);
  expect((await db.query("SELECT status FROM task WHERE organization_id=$1 AND source_key LIKE 'assembly:%'", [clubA])).rows[0].status).toBe("done");
  await run(president, { action: "item", meetingId: assembly, kind: "admission", title: "Admission de Carla", profileId: carla });
  await run(president, { action: "item", meetingId: assembly, kind: "mandate", title: "Mandat d'administratrice : Alice", profileId: alice, boardRole: "treasurer" });
  const before = await dispatches(member.userId);
  await associationTick(db);
  await associationTick(db);
  expect(await dispatches(member.userId)).toBe(before + 1);
  await expect(run(president, { action: "sendInvite", meetingId: assembly })).rejects.toMatchObject({ code: "ALREADY_SENT" });
  expect((await db.query("SELECT status FROM task WHERE organization_id=$1 AND source_key=$2", [clubA, `meeting:${assembly}:invite`])).rows[0].status).toBe("done");
});

it("refuses a proxy beyond the maximum, and asks a second assembly when the quorum is missed", async () => {
  // The member gives his proxy to Alice; the president cannot give hers to Alice too (one each).
  await run(member, { action: "proxy", meetingId: assembly, giverId: memberProfile, holderId: alice });
  await expect(run(president, { action: "proxy", meetingId: assembly, giverId: presidentProfile, holderId: alice })).rejects.toMatchObject({ code: "PROXY_LIMIT" });
  // Someone else's proxy: refused to a member.
  await expect(run(member, { action: "proxy", meetingId: assembly, giverId: alice, holderId: memberProfile })).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Only the president present: 1 of 3, the quorum (2) is missed.
  await run(president, { action: "presence", meetingId: assembly, profileId: presidentProfile, present: true });
  const items = (await associationView(db, president, "fr")).meetings.find((x) => x.id === assembly)!.items;
  await expect(run(president, { action: "vote", itemId: items[0].id, for: 1, against: 0, abstain: 0 })).rejects.toMatchObject({ code: "NO_QUORUM" });
  const second = (await run(president, { action: "second", meetingId: assembly, startsAt: day(30), locale: "fr" })).id;
  const s = (await associationView(db, president, "fr")).meetings.find((x) => x.id === second)!;
  expect(s.title).toBe("Seconde assemblée générale : Assemblée générale ordinaire");
  expect(s.items).toHaveLength(items.length);
  assembly = second;
});

it("votes, writes and signs the minutes, then the register, the Moniteur and UBO tasks follow", async () => {
  // The second assembly decides whatever the number present.
  await run(president, { action: "presence", meetingId: assembly, profileId: presidentProfile, present: true });
  const items = (await associationView(db, president, "fr")).meetings.find((x) => x.id === assembly)!.items;
  for (const it of items) await run(president, { action: "vote", itemId: it.id, for: 1, against: 0, abstain: 0 });
  const closed = await run(president, { action: "close", meetingId: assembly, locale: "fr" });
  expect(closed.quorum).toMatchObject({ reached: true, needed: 0 });
  const m = (await associationView(db, president, "fr")).meetings.find((x) => x.id === assembly)!;
  expect(m.minutes).toContain("Procès-verbal : Seconde assemblée générale");
  expect(m.minutes).toContain("Admission de Carla");
  expect(m.minutes).toContain("Pour : 1, contre : 0, abstentions : 0. Décision adoptée.");
  // Carla joins the register by the minutes; Alice becomes treasurer.
  const v = await associationView(db, president, "fr");
  expect(v.members.find((x) => x.profile_id === carla)).toMatchObject({ status: "effective" });
  expect(v.register.find((l) => l.profile_id === carla)).toMatchObject({ event: "admission", decision_body: "assembly", meeting_id: assembly });
  expect(v.members.find((x) => x.profile_id === alice)).toMatchObject({ board_role: "treasurer" });
  const follow = (await db.query("SELECT title FROM task WHERE organization_id=$1 AND source_key IN ($2,$3) ORDER BY title", [clubA, `meeting:${assembly}:moniteur`, `meeting:${assembly}:ubo`])).rows.map((r) => r.title);
  expect(follow).toHaveLength(2);
  expect(follow[0]).toMatch(/^Mettre à jour le registre UBO/);
  expect(follow[1]).toMatch(/^Publication au Moniteur belge/);
  // Signed by both: the minutes become a PDF in Documents.
  await run(president, { action: "sign", meetingId: assembly, role: "president", name: "Présidente" });
  expect((await db.query("SELECT document_id FROM association_meeting WHERE id=$1", [assembly])).rows[0].document_id).toBeNull();
  await run(president, { action: "sign", meetingId: assembly, role: "secretary", name: "Alice" });
  const doc = (await db.query("SELECT d.name,v.media_type FROM association_meeting m JOIN club_document d ON d.id=m.document_id JOIN document_version v ON v.id=d.current_version_id WHERE m.id=$1", [assembly])).rows[0];
  expect(doc.media_type).toBe("application/pdf");
  expect(doc.name).toMatch(/^Vie de l'ASBL · \d{4} · Seconde assemblée générale/);
  await expect(run(president, { action: "minutes", meetingId: assembly, text: "Modification après signature" })).rejects.toMatchObject({ code: "MEETING_SIGNED" });
});

it("keeps two clubs apart, and a member who is not effective out", async () => {
  expect((await associationView(db, presidentB, "fr")).members).toEqual([]);
  await expect(run(presidentB, { action: "status", profileId: alice, event: "exclusion", status: "none", decisionBody: "board", decisionOn: null }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "cancel", meetingId: assembly }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(member, { action: "status", profileId: alice, event: "exclusion", status: "none", decisionBody: "board", decisionOn: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
