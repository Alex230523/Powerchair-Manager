import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { matchExecute } from "../../src/domains/competitions/service";
import { journeyCommand, journeyExecute, journeyView, matchSheet } from "../../src/domains/competitions/journey";
import { matchSheetPdf } from "../../src/domains/competitions/match-sheet";
import { seasonOf } from "../../src/domains/finance/schema";
import { brusselsToday } from "../../src/domains/people/service";

/**
 * A5: a match from the call-up to the announcement. The call-up at the
 * match's creation; a player without a valid licence and a broken chair
 * flagged and refused in the line-up; only those present lined up; the
 * day's checklist in the to-do; the score typed live (sent twice, written
 * once, as from the offline queue); the result confirmed with the scorers;
 * the PDF sheet; the draft announcement; players see the published line-up
 * only; a coach of another team has no access; two clubs apart.
 */
const schema = "a5journey_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, coach: Principal, otherCoach: Principal, parent: Principal, team: string, other: string, match: string;
let ana: string, bilal: string, chloe: string, user: string, coachProfile: string;

async function actor(org: string, role: string, name: string, teamId: string | null = null) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  const person = (await db.query("INSERT INTO person(user_id) VALUES($1) RETURNING id", [userId])).rows[0].id as string;
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,team_id) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, teamId])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, person };
}
async function player(name: string, teamId: string, licensed: boolean) {
  const person = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
  const id = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2012-01-01','{player}') RETURNING id", [clubA, person, name])).rows[0].id as string;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-30)", [clubA, teamId, id]);
  if (licensed)
    await db.query("INSERT INTO license(federation_id,organization_id,profile_id,season,number,status,requested_by) SELECT federation_id,$1,$2,$3,$4,'active',$5 FROM organization WHERE id=$1", [
      clubA,
      id,
      seasonOf(brusselsToday()).label,
      "L-" + name,
      user,
    ]);
  return id;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => journeyExecute(db, p, journeyCommand.parse({ id: match, ...cmd }), org) as Promise<Record<string, unknown>>;
const answer = (profile: string, response: string) =>
  db.query("UPDATE attendance_invitation i SET response=$2 FROM attendance_register r JOIN match m ON m.calendar_event_id=r.event_id WHERE i.register_id=r.id AND m.id=$3 AND i.profile_id=$1", [profile, response, match]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  const federation = (await db.query("INSERT INTO organization(name,kind) VALUES('Fédé','federation') RETURNING id")).rows[0].id;
  clubA = (await db.query("INSERT INTO organization(name,kind,federation_id) VALUES('Club A','club',$1) RETURNING id", [federation])).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  const pr = await actor(clubA, "club_president", "Présidente");
  president = pr.p;
  user = president.userId;
  presidentB = (await actor(clubB, "club_president", "Président B")).p;
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  other = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Ours') RETURNING id", [clubA, season])).rows[0].id;
  // Coaches have their profile in the club and their team.
  const c1 = await actor(clubA, "coach", "Coach Aigles", team);
  coach = c1.p;
  coachProfile = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Aigles','{coach}') RETURNING id", [clubA, c1.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, team, coachProfile]);
  const c2 = await actor(clubA, "coach", "Coach Ours", other);
  otherCoach = c2.p;
  const p2 = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Coach Ours','{coach}') RETURNING id", [clubA, c2.person])).rows[0].id;
  await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'coach',CURRENT_DATE-30)", [clubA, other, p2]);
  ana = await player("Ana", team, true);
  bilal = await player("Bilal", team, false);
  chloe = await player("Chloé", team, true);
  // Chloé's chair is broken.
  const chair = (await db.query("INSERT INTO equipment_chair(organization_id,name,status) VALUES($1,'Strike 9','maintenance') RETURNING id", [clubA])).rows[0].id;
  await db.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,starts_on,is_primary,created_by) VALUES($1,$2,$3,CURRENT_DATE-5,true,$4)", [clubA, chair, chloe, user]);
  // Ana's parent.
  const pa = await actor(clubA, "guardian", "Parent d'Ana");
  parent = pa.p;
  const guardian = (await db.query("INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent d''Ana') RETURNING id", [clubA, pa.person])).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,false,'Vérifié pour le test',$4)",
    [clubA, guardian, ana, user],
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("calls the team up when the match is created, with an answer due the day before", async () => {
  const day = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  match = (await matchExecute(db, coach, { action: "create", teamId: team, opponent: "Lions", home: true, kind: "league", competition: "D1", startsAt: `${day}T14:00`, venue: "Salle du club", calendarEventId: null, notes: "" } as never, clubA)).id as string;
  const v = await journeyView(db, coach, match);
  expect(v.manage).toBe(true);
  if (!v.manage) return;
  expect(v.match.calendar_event_id).toBeTruthy();
  expect(v.players.map((p) => [p.full_name, p.answer]).sort()).toEqual([["Ana", "none"], ["Bilal", "none"], ["Chloé", "none"]]);
  await expect(run(coach, { action: "convene" })).rejects.toMatchObject({ code: "DUPLICATE" });
});

it("flags a player without a valid licence and a broken chair, and lines up only those present and eligible", async () => {
  const v = await journeyView(db, coach, match);
  if (!v.manage) throw new Error("manage");
  expect(v.players.find((p) => p.profile_id === bilal)!.blocking).toEqual(["licence"]);
  expect(v.players.find((p) => p.profile_id === chloe)!.blocking).toEqual(["chairBroken"]);
  expect(v.players.find((p) => p.profile_id === ana)).toMatchObject({ blocking: [], warnings: ["noChair"] });
  await expect(run(coach, { action: "lineup", players: [{ profileId: ana, starter: true, jerseyNumber: 7 }] })).rejects.toMatchObject({ code: "NOT_PRESENT" });
  for (const p of [ana, bilal, chloe]) await answer(p, "present");
  await expect(run(coach, { action: "lineup", players: [{ profileId: bilal, starter: true, jerseyNumber: 4 }] })).rejects.toMatchObject({ code: "PLAYER_NOT_ELIGIBLE" });
  await expect(run(coach, { action: "lineup", players: [{ profileId: chloe, starter: true, jerseyNumber: 9 }] })).rejects.toMatchObject({ code: "PLAYER_NOT_ELIGIBLE" });
  await run(coach, { action: "lineup", players: [{ profileId: ana, starter: true, jerseyNumber: 7 }] });
  // Players and parents: no line-up until it is published.
  const before = await journeyView(db, parent, match);
  expect(before).toMatchObject({ manage: false, lineup: null, result: null });
  if (!before.manage) expect(before.callUp.map((c) => [c.full_name, c.response])).toEqual([["Ana", "present"]]);
  // 04/11/2026: an automatic reveal: 1 min before kick-off is not yet; a week before already is.
  await run(coach, { action: "reveal", minutes: 1 });
  expect(await journeyView(db, parent, match)).toMatchObject({ lineup: null });
  await run(coach, { action: "reveal", minutes: 10080 });
  expect(((await journeyView(db, parent, match)) as { lineup: unknown[] | null }).lineup).toHaveLength(1);
  await run(coach, { action: "reveal", minutes: null });
  expect(await journeyView(db, parent, match)).toMatchObject({ lineup: null });
  await run(coach, { action: "publish", published: true });
  const after = await journeyView(db, parent, match);
  expect(!after.manage && after.lineup?.map((x) => [x.full_name, x.jersey_number])).toEqual([["Ana", 7]]);
});

it("sends the day's checklist to the to-do once, with its people in charge", async () => {
  expect(await run(coach, { action: "checklist", items: [{ key: "chairs", responsibleId: coachProfile }, { key: "transport", responsibleId: null }] })).toMatchObject({ created: 2 });
  expect(await run(coach, { action: "checklist", items: [{ key: "chairs", responsibleId: coachProfile }, { key: "balls", responsibleId: null }] })).toMatchObject({ created: 1 });
  const tasks = (await db.query("SELECT kind,category,source_kind,responsible_id,team_id,due_on::text FROM task WHERE match_id=$1 ORDER BY source_kind", [match])).rows;
  expect(tasks.map((t) => [t.source_kind, t.kind, t.category])).toEqual([
    ["match_balls", "equipment", "sport"],
    ["match_chairs", "equipment", "sport"],
    ["match_transport", "transport", "sport"],
  ]);
  expect(tasks.find((t) => t.source_kind === "match_chairs")!.responsible_id).toBe(coachProfile);
});

it("14: marks presences from the pitch side, takes an assist and a timeout, files the sheet's photo, refuses a stale validation", async () => {
  await run(coach, { action: "presence", profileId: ana, actual: "present" });
  await run(coach, { action: "presence", profileId: bilal, actual: "excused" });
  const actual = (await db.query("SELECT cp.full_name,i.actual FROM attendance_invitation i JOIN club_person cp ON cp.id=i.profile_id WHERE i.profile_id=ANY($1::uuid[]) ORDER BY cp.full_name", [[ana, bilal]])).rows;
  expect(actual).toEqual([{ full_name: "Ana", actual: "present" }, { full_name: "Bilal", actual: "excused" }]);
  await run(coach, { action: "live", clientId: randomUUID(), kind: "assist", profileId: ana, minute: 5 });
  await run(coach, { action: "live", clientId: randomUUID(), kind: "timeout", profileId: null, minute: 6 });
  // 04/11/2026: corners, ours and theirs, name nobody.
  await run(coach, { action: "live", clientId: randomUUID(), kind: "corner", profileId: null, minute: 7 });
  await run(coach, { action: "live", clientId: randomUUID(), kind: "corner_against", profileId: null, minute: 8 });
  expect((await db.query("SELECT kind FROM match_live_event WHERE match_id=$1 AND kind LIKE 'corner%' ORDER BY minute", [match])).rows.map((r) => r.kind)).toEqual(["corner", "corner_against"]);
  const v = await journeyView(db, coach, match);
  if (!v.manage) throw new Error("manage");
  expect(v.liveScore).toEqual({ ours: 0, theirs: 0 });
  expect(v.players.find((p) => p.profile_id === ana)!.actual).toBe("present");
  await run(coach, { action: "sheetPhoto", type: "image/png", base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64") });
  expect((await db.query("SELECT media_type FROM match_sheet_photo WHERE match_id=$1", [match])).rows).toEqual([{ media_type: "image/png" }]);
  // An action made on an older state of the match is refused, and only that one.
  await expect(run(coach, { action: "validate", version: v.match.version - 1 > 0 ? v.match.version - 1 : v.match.version + 1, ourScore: 0, theirScore: 0 })).rejects.toMatchObject({ code: "STALE_VERSION" });
  await expect(run(otherCoach, { action: "presence", profileId: ana, actual: "absent" })).rejects.toBeTruthy();
});

it("takes the score live, an event sent twice written once (the offline queue), and confirms the result", async () => {
  const goal = randomUUID();
  await run(coach, { action: "live", clientId: goal, kind: "goal", profileId: ana, minute: 12 });
  // The phone was offline: the same event arrives again when the network comes back.
  expect(await run(coach, { action: "live", clientId: goal, kind: "goal", profileId: ana, minute: 12 })).toMatchObject({ ours: 1, theirs: 0 });
  await run(coach, { action: "live", clientId: randomUUID(), kind: "goal_against", profileId: null, minute: 30 });
  await run(coach, { action: "live", clientId: randomUUID(), kind: "yellow", profileId: ana, minute: 33 });
  const second = randomUUID();
  await run(coach, { action: "live", clientId: second, kind: "goal", profileId: ana, minute: 40 });
  await expect(run(coach, { action: "live", clientId: randomUUID(), kind: "goal", profileId: bilal, minute: 41 })).rejects.toMatchObject({ code: "NOT_IN_LINEUP" });
  let v = await journeyView(db, coach, match);
  if (!v.manage) throw new Error("manage");
  expect(v.liveScore).toEqual({ ours: 2, theirs: 1 });
  // A wrong tap is undone.
  await run(coach, { action: "undoLive", eventId: v.live.find((e) => e.client_id === second)!.id });
  v = await journeyView(db, coach, match);
  if (!v.manage) throw new Error("manage");
  expect(v.liveScore).toEqual({ ours: 1, theirs: 1 });
  await expect(run(coach, { action: "validate", version: v.match.version, ourScore: 0, theirScore: 1 })).rejects.toMatchObject({ code: "GOALS_EXCEED_SCORE" });
  const done = await run(coach, { action: "validate", version: v.match.version, ourScore: 1, theirScore: 1 });
  expect((await db.query("SELECT status,our_score,their_score,validated_at IS NOT NULL AS validated FROM match WHERE id=$1", [match])).rows[0]).toEqual({ status: "played", our_score: 1, their_score: 1, validated: true });
  expect((await db.query("SELECT goals,yellow_cards,red_card FROM match_player WHERE match_id=$1 AND profile_id=$2", [match, ana])).rows[0]).toEqual({ goals: 1, yellow_cards: 1, red_card: false });
  // The draft announcement waits in Communication, not sent.
  const draft = (await db.query("SELECT subject,status,blocks FROM newsletter WHERE id=$1", [done.announcement])).rows[0];
  expect(draft).toMatchObject({ status: "draft", subject: "Résultat : Aigles 1-1 Lions" });
  expect(JSON.stringify(draft.blocks)).toContain("Ana");
  await expect(run(coach, { action: "live", clientId: randomUUID(), kind: "goal", profileId: ana, minute: 50 })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  const member = await journeyView(db, parent, match);
  expect(!member.manage && member.result).toEqual({ ours: 1, theirs: 1 });
});

it("prints the match sheet as a PDF", async () => {
  const s = await matchSheet(db, coach, match);
  const pdf = Buffer.from(matchSheetPdf({ ...s, match: { ...s.match, starts_at: new Date(s.match.starts_at).toISOString() } })).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("(Feuille de match");
  expect(pdf).toContain("Ana");
});

it("gives a coach of another team no access, and keeps two clubs apart", async () => {
  await expect(journeyView(db, otherCoach, match)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(otherCoach, { action: "publish", published: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(matchSheet(db, parent, match)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(journeyView(db, presidentB, match)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(run(presidentB, { action: "publish", published: false }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The president acts for every team.
  expect((await journeyView(db, president, match)).manage).toBe(true);
});
