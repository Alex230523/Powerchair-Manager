import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { documentDrive, documentExecute, documentUpload, documentDownload } from "../../src/domains/documents/service";
import { mailTemplateCommand, mailTemplateExecute, mailTemplatesView } from "../../src/domains/mail-templates/service";
import { remindersExecute } from "../../src/domains/reminders/service";
import { unsubscribeExecute } from "../../src/domains/communication/service";

/**
 * 10: documents in folders and the email templates. Folders built by type
 * and season; a free folder seen by the presidency only; a sensitive
 * document never seen without the right, even in a shared folder; a move;
 * a template filled with a real person, an invitation from an event in
 * each recipient's language, a reminder written from a changed template,
 * the test to oneself, the unsubscribe link; two clubs.
 */
const schema = "drv_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, staff: Principal, player: Principal, presidentB: Principal, seasonNow: string, seasonBefore: string, lea: string, user: string;
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function actor(org: string, role: string, name: string, grants: string[] = [], locale = "fr") {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id,locale) VALUES($1,$2) RETURNING id", [userId, locale])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
const doc = (p: Principal, body: Record<string, unknown>, org = clubA) => documentExecute(db, p, body as never, org) as Promise<{ id: string }>;
const tpl = (p: Principal, body: Record<string, unknown>, org = clubA) => mailTemplateExecute(db, p, mailTemplateCommand.parse(body), org) as Promise<Record<string, unknown>>;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente", ["documents.sensitive"])).p;
  user = president.userId;
  staff = (await actor(clubA, "coach", "Coach lecteur", ["documents.read"])).p;
  const pl = await actor(clubA, "player", "Léa Peeters", [], "nl");
  player = pl.p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  seasonNow = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-2027','2026-07-01','2027-06-30') RETURNING id", [clubA])).rows[0].id;
  seasonBefore = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2025-2026','2025-07-01','2026-06-30') RETURNING id", [clubA])).rows[0].id;
  lea = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Peeters','2000-01-01','{player}') RETURNING id", [clubA, pl.person])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("builds the folders by type and season, the player seeing only hers", async () => {
  await doc(president, { action: "request", profileId: lea, seasonId: seasonNow, name: "Assurance 2026", category: "insurance", sensitive: false });
  await doc(president, { action: "request", profileId: lea, seasonId: seasonBefore, name: "Assurance 2025", category: "insurance", sensitive: false });
  await doc(president, { action: "request", seasonId: seasonNow, name: "Contrat de salle", category: "contract", sensitive: false });
  const all = await documentDrive(db, president);
  expect(all.documents.map((d) => [d.category, d.season_name, d.name]).sort()).toEqual([
    ["contract", "2026-2027", "Contrat de salle"],
    ["insurance", "2025-2026", "Assurance 2025"],
    ["insurance", "2026-2027", "Assurance 2026"],
  ]);
  const mine = await documentDrive(db, player);
  expect(mine.documents.map((d) => d.name).sort()).toEqual(["Assurance 2025", "Assurance 2026"]);
  expect(mine.manage).toBe(false);
});

it("keeps a free folder for the presidency only, and never shows a sensitive document without the right", async () => {
  const board = (await doc(president, { action: "folderSave", name: "Conseil d'administration", visibility: "presidency" })).id;
  const minutes = (await doc(president, { action: "request", seasonId: seasonNow, name: "PV du CA", category: "contract", sensitive: false, folderId: board })).id;
  await documentUpload(db, president, minutes, 1, { name: "pv.pdf", type: "application/pdf", bytes: pdf }, clubA);
  expect((await documentDrive(db, president)).documents.find((d) => d.id === minutes)?.folder_id).toBe(board);
  // The coach may read the club's documents, but not in the presidency's folder.
  const seen = await documentDrive(db, staff);
  expect(seen.folders.map((f) => f.name)).toEqual([]);
  expect(seen.documents.map((d) => d.name)).not.toContain("PV du CA");
  // A folder for every member: the statutes are read by the player; a sensitive paper never.
  const club = (await doc(president, { action: "folderSave", name: "Vie du club", visibility: "members" })).id;
  const statutes = (await doc(president, { action: "request", seasonId: seasonNow, name: "Statuts", category: "contract", sensitive: false, folderId: club })).id;
  await documentUpload(db, president, statutes, 1, { name: "statuts.pdf", type: "application/pdf", bytes: pdf }, clubA);
  const medical = (await doc(president, { action: "request", profileId: lea, seasonId: seasonNow, name: "Certificat médical", category: "fitness", sensitive: true, folderId: club })).id;
  const forPlayer = await documentDrive(db, player);
  expect(forPlayer.folders.map((f) => f.name)).toEqual(["Vie du club"]);
  // Her own certificate stays hers; nobody else's comes in through the folder.
  expect(forPlayer.documents.map((d) => d.name).sort()).toEqual(["Assurance 2025", "Assurance 2026", "Certificat médical", "Statuts"]);
  const version = (await db.query("SELECT current_version_id FROM club_document WHERE id=$1", [statutes])).rows[0].current_version_id;
  expect((await documentDownload(db, player, version, clubA)).filename).toBe("statuts.pdf");
  expect((await documentDrive(db, staff)).documents.map((d) => d.name)).not.toContain("Certificat médical");
  expect((await documentDrive(db, president)).documents.map((d) => d.name)).toContain("Certificat médical");
  // A coach who reads the club's documents, without the health right, does not see it.
  expect((await documentDrive(db, staff)).documents.map((d) => d.id)).not.toContain(medical);
});

it("moves a document into a folder and back; the folder must be the club's", async () => {
  const contract = (await documentDrive(db, president)).documents.find((d) => d.name === "Contrat de salle")!;
  const club = (await documentDrive(db, president)).folders.find((f) => f.name === "Vie du club")!;
  await doc(president, { action: "move", id: contract.id, folderId: club.id });
  expect((await documentDrive(db, president)).documents.find((d) => d.id === contract.id)?.folder_id).toBe(club.id);
  await doc(president, { action: "move", id: contract.id, folderId: null });
  expect((await documentDrive(db, president)).documents.find((d) => d.id === contract.id)?.folder_id).toBeNull();
  await expect(doc(presidentB, { action: "move", id: contract.id, folderId: null }, clubB)).rejects.toBeTruthy();
  await expect(doc(president, { action: "folderDelete", id: club.id })).rejects.toMatchObject({ code: "FOLDER_NOT_EMPTY" });
  await expect(doc(staff, { action: "folderSave", name: "Libre", visibility: "staff" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("offers the club's templates and fills the variables with a real person, in her language", async () => {
  const v = await mailTemplatesView(db, president);
  expect(v.templates.map((t) => t.usage).sort()).toEqual(["document_reminder", "dues_reminder", "event_invitation", "match_invitation", "new_season", "sponsor_thanks", "welcome"]);
  expect(JSON.stringify(v.templates)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  const welcome = v.templates.find((t) => t.usage === "welcome")!;
  const preview = await tpl(president, { action: "preview", id: welcome.id, profileId: lea });
  expect(preview).toMatchObject({ locale: "nl", subject: "Welkom bij Club A, Léa!" });
  expect(() => mailTemplateCommand.parse({ action: "save", name: "Cassé", usage: "free", texts: { fr: { subject: "Bonjour {nom}", body: "Corps" }, nl: { subject: "Hallo", body: "Tekst" }, en: { subject: "Hello", body: "Text" } } })).toThrow();
  // Another club sees none of them.
  expect((await mailTemplatesView(db, presidentB)).templates.every((t) => !v.templates.some((x) => x.id === t.id))).toBe(true);
  await expect(tpl(presidentB, { action: "preview", id: welcome.id, profileId: null }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("sends an invitation from an event to those invited, each in their language, and keeps the history", async () => {
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, user])).rows[0].id;
  const event = (
    await db.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility,free_location)
       VALUES($1,$2,1,'Barbecue du club','custom','Europe/Brussels',now()+interval '9 days',now()+interval '9 days 3 hours','2026-11-12T18:00','2026-11-12T21:00',$3,'organization','Salle des sports') RETURNING id`,
      [clubA, series, user],
    )
  ).rows[0].id;
  const register = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '8 days') RETURNING id", [clubA, event])).rows[0].id;
  await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id) VALUES($1,$2,$3)", [clubA, register, lea]);
  const invitation = (await mailTemplatesView(db, president)).templates.find((t) => t.usage === "event_invitation")!;
  const r = await tpl(president, { action: "send", id: invitation.id, eventId: event, toInvited: true });
  expect(r.recipients).toBe(1);
  const note = (await db.query("SELECT title,body FROM app_notification WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 1", [player.userId])).rows[0];
  expect(note.title).toContain("Uitnodiging: Barbecue du club");
  expect((await db.query("SELECT locale FROM mail_job WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 1", [player.userId])).rows[0].locale).toBe("nl");
  const history = (await mailTemplatesView(db, president)).history;
  expect(history[0]).toMatchObject({ template_id: invitation.id, kind: "event", recipients: 1, event: "Barbecue du club" });
});

it("writes a reminder from a changed template, and sends a test to oneself", async () => {
  const v = await mailTemplatesView(db, president);
  const reminder = v.templates.find((t) => t.usage === "document_reminder")!;
  const texts = { ...reminder.texts, nl: { subject: "{club}: nog één document, {prénom}", body: "Hallo {prénom}, upload het hier: {lien}" } };
  await tpl(president, { action: "save", id: reminder.id, version: reminder.version, name: reminder.name, usage: "document_reminder", texts });
  await tpl(president, { action: "bind", target: "documents_reminder", templateId: reminder.id });
  await remindersExecute(db, president, { action: "send", kind: "documents", profileIds: [lea] }, clubA);
  const note = (await db.query("SELECT title FROM app_notification WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 1", [player.userId])).rows[0];
  expect(note.title).toBe("Club A: nog één document, Léa");
  expect((await mailTemplatesView(db, president)).history.find((h) => h.kind === "reminder")).toMatchObject({ template_id: reminder.id, recipients: 1 });
  const test = await tpl(president, { action: "test", id: reminder.id });
  expect(test.recipients).toBe(1);
  expect((await db.query("SELECT count(*)::int AS n FROM mail_job WHERE recipient_user_id=$1", [president.userId])).rows[0].n).toBeGreaterThan(0);
});

it("adds the unsubscribe link to the messages one may stop, and leaves out who stopped them", async () => {
  const group = (await db.query("INSERT INTO recipient_group(organization_id,name,audiences,created_by) VALUES($1,'Joueurs','{players}',$2) RETURNING id", [clubA, user])).rows[0].id;
  const season = (await mailTemplatesView(db, president)).templates.find((t) => t.usage === "new_season")!;
  expect((await tpl(president, { action: "send", id: season.id, groupIds: [group] })).recipients).toBe(1);
  const delivery = (await db.query("SELECT id FROM mail_template_delivery ORDER BY created_at DESC LIMIT 1")).rows[0].id;
  const body = (await db.query("SELECT body FROM app_notification WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 1", [player.userId])).rows[0].body;
  expect(body).toContain(`/desinscription/${delivery}`);
  await unsubscribeExecute(db, delivery, true);
  await expect(tpl(president, { action: "send", id: season.id, groupIds: [group] })).rejects.toMatchObject({ code: "NO_RECIPIENT" });
  // A coach may invite to an event, not write to the club's groups.
  await expect(tpl(staff, { action: "send", id: season.id, groupIds: [group] })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
