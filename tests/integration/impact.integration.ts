import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { execute, type Principal } from "../../src/domains/access/service";
import { grantAttachment, impactExecute, impactPdf, impactView, impactXlsx } from "../../src/domains/report/impact";

/**
 * H13: sport hours over a period with cancelled sessions left out; no name
 * nor health datum in the exports; volunteering computed then adjusted; the
 * report filed with a grant; two clubs.
 */
const schema = "imp_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, coach: Principal, presidentB: Principal, grant: string;
const period = { from: "2026-09-01", to: "2026-10-31" };
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
  return { p, person };
}
/** The text of every sheet of an .xlsx (stored or deflated zip entries). */
function xlsxText(b: Uint8Array) {
  const buf = Buffer.from(b);
  let out = "";
  for (let i = 0; i + 30 < buf.length; ) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8),
      size = buf.readUInt32LE(i + 18),
      nameLen = buf.readUInt16LE(i + 26),
      extra = buf.readUInt16LE(i + 28);
    const data = buf.subarray(i + 30 + nameLen + extra, i + 30 + nameLen + extra + size);
    out += (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    i += 30 + nameLen + extra + size;
  }
  return out;
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = (await actor(clubA, "club_president", "Présidente")).p;
  const c = await actor(clubA, "coach", "Coach Paul");
  coach = c.p;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const u = president.userId;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30') RETURNING id", [clubA])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Paul','{coach}') RETURNING id", [clubA, c.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach','2026-08-01')", [clubA, team, coachProfile]);
  const players: string[] = [];
  for (const [name, birth, address] of [["Zoé Secret", "2014-03-01", "Rue A 1, 4000 Liège"], ["Yanis Caché", "1995-06-01", "Rue B 2, 4020 Liège"], ["Xavier", null, ""]] as const) {
    const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,postal_address,directory_roles) VALUES($1,$2,$3,$4,$5,'{player}') RETURNING id", [clubA, person, name, birth, address])).rows[0].id;
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player','2026-09-05')", [clubA, team, id]);
    players.push(id);
  }
  await db.query("INSERT INTO player_support_profile(organization_id,profile_id,support_needs,safety_notes) VALUES($1,$2,'Aide au transfert','Sangle thoracique')", [clubA, players[0]]);
  // Two trainings of 2 hours held (one with 2 present), one cancelled.
  const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,7,3,$2) RETURNING id", [clubA, u])).rows[0].id;
  for (const [i, day, status] of [[1, "2026-09-10", "scheduled"], [2, "2026-09-17", "scheduled"], [3, "2026-09-24", "cancelled"]] as const) {
    const e = (
      await db.query(
        `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,status,visibility,responsible_user_id)
         VALUES($1,$2,$3,'Entraînement','training','Europe/Brussels',$4::timestamptz,$4::timestamptz+interval '2 hours',$5,$6,$7,$8,'team',$9) RETURNING id`,
        [clubA, series, i, `${day}T18:00:00+02:00`, `${day}T18:00`, `${day}T20:00`, team, status, u],
      )
    ).rows[0].id;
    if (i === 1) {
      const r = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at) VALUES($1,$2,$3::timestamptz,now()) RETURNING id", [clubA, e, `${day}T12:00:00+02:00`])).rows[0].id;
      for (const [k, actual] of [[0, "present"], [1, "late"], [2, "absent"]] as const) await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,actual) VALUES($1,$2,$3,$4)", [clubA, r, players[k], actual]);
    }
  }
  // Two tasks done (admin 1 h, events 3 h by default).
  for (const cat of ["admin", "events"]) await db.query("INSERT INTO task(organization_id,kind,category,title,status,done_on,origin,created_by) VALUES($1,'other',$2,'Tâche','done','2026-09-20','manual',$3)", [clubA, cat, u]);
  grant = (await db.query("INSERT INTO grant_application(organization_id,funder,program,purpose,status,created_by) VALUES($1,'Province','Sport adapté','Achat de fauteuils','granted',$2) RETURNING id", [clubA, u])).rows[0].id;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("counts sport hours over the period, cancelled sessions left out", async () => {
  const f = (await impactView(db, president, period)).figures;
  expect(f.sessions.value).toBe(2);
  expect(f.sessionHours).toBe(4);
  // 2 hours × 2 players seen present (the second session has no attendance recorded).
  expect(f.sportHours.value).toBe(4);
  expect(f.beneficiaries.value).toBe(3);
  expect(f.byAge).toMatchObject({ under12: 0, "12to17": 1, "30to49": 1, unknown: 1 });
  expect(f.communes).toEqual([{ name: "4000 Liège", n: 1 }, { name: "4020 Liège", n: 1 }]);
  expect(f.newPlayers).toBe(3);
  // No kilometre recorded: unknown, not zero; sex not recorded.
  expect(f.kilometres.value).toBeNull();
  expect(f.bySex).toBeNull();
});

it("never puts a name nor a health datum in the exports", async () => {
  const pdf = Buffer.from(await impactPdf(db, president, "fr", period)).toString("latin1");
  const sheet = xlsxText(await impactXlsx(db, president, "fr", period));
  expect(sheet).toContain("Bénéficiaires");
  for (const text of [pdf, sheet, JSON.stringify(await impactView(db, president, period))]) expect(text).not.toMatch(/Zoé|Yanis|Xavier|Secret|Caché|Aide au transfert|Sangle|Rue A|Rue B/);
});

it("computes the volunteering, then adds an adjustment with its note", async () => {
  const f = (await impactView(db, president, period)).figures;
  // Tasks 1 + 3 h; supervision 2 trainings × 2 h × 1 coach.
  expect(f.volunteer).toMatchObject({ tasks: 4, supervision: 4, drivers: 0, total: 8, value: 8 });
  await impactExecute(db, president, { action: "settings", taskHours: { admin: 2, events: 3 }, tripHours: 4, hourlyRateCents: 1500 }, clubA);
  await impactExecute(db, president, { action: "adjust", ...period, indicator: "volunteerHours", delta: 10, note: "Fête du club non saisie" }, clubA);
  const g = (await impactView(db, president, period)).figures;
  expect(g.volunteer).toMatchObject({ computed: 9, value: 19 });
  expect(g.valuationCents).toBe(19 * 1500);
  await expect(impactExecute(db, coach, { action: "adjust", ...period, indicator: "sessions", delta: 1, note: "Essai" }, clubA)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("files the report with the grant's justification", async () => {
  const { id } = (await impactExecute(db, president, { action: "attach", grantId: grant, ...period, locale: "fr" }, clubA)) as { id: string };
  const file = await grantAttachment(db, president, id);
  const text = Buffer.from(file.bytes).toString("latin1");
  expect(text.startsWith("%PDF")).toBe(true);
  expect(text).toContain("Province");
  expect((await impactView(db, president, { ...period, grant })).grant).toMatchObject({ funder: "Province" });
});

it("keeps each club to its own figures", async () => {
  const b = (await impactView(db, presidentB, period)).figures;
  expect(b.beneficiaries.value).toBe(0);
  expect(b.sessions.value).toBe(0);
  expect(b.adjustments).toEqual([]);
  await expect(impactView(db, presidentB, { ...period, grant })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(impactExecute(db, presidentB, { action: "attach", grantId: grant, ...period, locale: "fr" }, clubB)).rejects.toBeTruthy();
  const att = (await db.query("SELECT id FROM grant_attachment LIMIT 1")).rows[0].id;
  await expect(grantAttachment(db, presidentB, att)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
