import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { activityReport } from "../../src/domains/report/service";
import { buildSlides } from "../../src/domains/report/slides";
import { reportPdf } from "../../src/domains/report/pdf";
import { reportCopy, reportSections } from "../../src/components/report-copy";

/** Wave 15 (C11): the activity report's figures from the modules, one club at a time, no player name. */
const schema = "w15rp_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, secretary: Principal, player: Principal, seasonA: string, teamA: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)', [userId, "Test " + role, userId + "@example.test"]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id", [org, userId, role, grants])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const person = async (org: string, name: string) =>
  (await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,birth_date) SELECT $1,p.id,$2,'2010-01-01' FROM p RETURNING id", [org, name])).rows[0].id as string;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president");
  presidentB = await actor(clubB, "club_president");
  secretary = await actor(clubA, "coach", ["people.read"]);
  player = await actor(clubA, "player");
  const prev = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Avant',CURRENT_DATE-500,CURRENT_DATE-101) RETURNING id", [clubA])).rows[0].id;
  seasonA = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Maintenant',CURRENT_DATE-100,CURRENT_DATE+200) RETURNING id", [clubA])).rows[0].id;
  const oldTeam = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, prev])).rows[0].id;
  teamA = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Lions') RETURNING id", [clubA, seasonA])).rows[0].id;
  const [zoe, ben, coachP] = [await person(clubA, "Zoé Secrète"), await person(clubA, "Ben Discret"), await person(clubA, "Sam Coach")];
  for (const [t, p, role] of [
    [oldTeam, zoe, "player"],
    [teamA, zoe, "player"],
    [teamA, ben, "player"],
    [teamA, coachP, "coach"],
  ])
    await db.query("INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,$4)", [clubA, t, p, role]);
  // Two past trainings of 2 h with a closed register (3 of 4 present), one highlight, one tournament.
  for (const [days, highlight] of [
    [20, false],
    [10, true],
  ] as const) {
    const series = (await db.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
    const e = (
      await db.query(
        `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,responsible_user_id,visibility,highlight)
         VALUES($1,$2,1,$3,'training','Europe/Brussels',now()-($4::int||' days')::interval,now()-($4::int||' days')::interval+interval '2 hours','2026-01-01T18:00','2026-01-01T20:00',$5,$6,'team',$7) RETURNING id`,
        [clubA, series, highlight ? "Journée découverte" : "Entraînement", days, teamA, president.userId, highlight],
      )
    ).rows[0].id;
    const reg = (await db.query("INSERT INTO attendance_register(organization_id,event_id,deadline,closed_at,closed_by) VALUES($1,$2,now(),now(),$3) RETURNING id", [clubA, e, president.userId])).rows[0].id;
    for (const [p, actual] of [
      [zoe, "present"],
      [ben, days === 20 ? "absent" : "late"],
    ])
      await db.query("INSERT INTO attendance_invitation(organization_id,register_id,profile_id,response,actual) VALUES($1,$2,$3,'present',$4)", [clubA, reg, p, actual]);
  }
  await db.query(
    "INSERT INTO trip(organization_id,title,kind,starts_on,ends_on,team_id,final_rank,teams_count,result_note,created_by) VALUES($1,'Tournoi de Gand','tournament',CURRENT_DATE-30,CURRENT_DATE-29,$2,2,8,'Finale',$3)",
    [clubA, teamA, president.userId],
  );
  await db.query("INSERT INTO match(organization_id,team_id,opponent,starts_at,status,our_score,their_score,created_by,kind) VALUES($1,$2,'Namur',now()-interval '5 days','played',4,2,$3,'league')", [clubA, teamA, president.userId]);
  await db.query("INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,created_by) VALUES($1,CURRENT_DATE-3,'Cotisations','in','dues',40000,$2)", [clubA, president.userId]);
  await db.query("INSERT INTO partner(organization_id,name,kind,status,amount_cents,created_by) VALUES($1,'Garage Dupont','sponsor','active',100000,$2)", [clubA, president.userId]).catch(() => undefined);
  // Club B: its own season and a big number that must never show in A.
  const sb = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Maintenant',CURRENT_DATE-100,CURRENT_DATE+200) RETURNING id", [clubB])).rows[0].id;
  await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Autres')", [clubB, sb]);
});
beforeEach(() => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("counts from the modules, compares with last season and names no player", async () => {
  const r = await activityReport(db, president);
  if (!r.season || !("figures" in r)) throw new Error("no season");
  expect(r.season.id).toBe(seasonA);
  expect(r.figures).toEqual({ members: 3, players: 2, teams: 1, trainings: 2, hours: 4, attendance: 75 });
  expect(r.previous?.figures).toMatchObject({ members: 1, players: 1, teams: 1 });
  expect(r.tournaments).toEqual([expect.objectContaining({ title: "Tournoi de Gand", final_rank: 2, teams_count: 8, result_note: "Finale", team: "Lions" })]);
  expect(r.matches).toEqual([{ team: "Lions", played: 1, won: 1, drawn: 0, lost: 0, scored: 4, conceded: 2 }]);
  expect(r.highlights.map((h) => h.title)).toEqual(["Tournoi de Gand", "Journée découverte"]);
  expect(r.staff.coaches).toEqual(["Sam Coach"]);
  expect(r.finances).toEqual([{ direction: "in", category: "dues", cents: 40000 }]);
  // Lot 5 (05/11/2026): the awards (a minor's name stays out), the year's obligations.
  await db.query("INSERT INTO award(organization_id,season_id,awarded_on,title,competition,kind,place,team_id,created_by) VALUES($1,$2,CURRENT_DATE-10,'Coupe de Belgique','Coupe','team',2,$3,$4)", [clubA, seasonA, teamA, president.userId]);
  await db.query("INSERT INTO award(organization_id,season_id,awarded_on,title,kind,profile_id,created_by) SELECT $1,$2,CURRENT_DATE-9,'Meilleure joueuse','individual',id,$3 FROM club_person WHERE full_name='Zoé Secrète'", [clubA, seasonA, president.userId]);
  await db.query("INSERT INTO club_obligation(organization_id,year,template_key,title,done_on,position,created_by) VALUES($1,$2,'assembly','Assemblée générale tenue',CURRENT_DATE,1,$3)", [clubA, Number((await db.query("SELECT extract(year FROM ends_on)::int AS y FROM season WHERE id=$1", [seasonA])).rows[0].y), president.userId]);
  const again = await activityReport(db, president);
  if (!("awards" in again) || !again.awards) throw new Error("no awards");
  expect(again.awards.map((a) => [a.title, a.team, a.person])).toEqual([["Coupe de Belgique", "Lions", null], ["Meilleure joueuse", null, null]]);
  expect(again.obligations).toEqual([{ title: "Assemblée générale tenue", due_on: null, done_on: expect.any(String) }]);
  const pdf = Buffer.from(reportPdf(buildSlides(again, { sections: [...reportSections], word: "", thanks: "", locale: "fr" }, reportCopy.fr, {}), "Club A", "Rapport", "aujourd'hui")).toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  expect(pdf).toContain("Distinctions");
  expect(pdf).not.toContain("Zo");
  const text = JSON.stringify(buildSlides(r, { sections: [...reportSections], word: "", thanks: "", locale: "fr" }, reportCopy.fr, {})) + JSON.stringify(r);
  expect(text).not.toContain("Zoé");
  expect(text).not.toContain("Ben Discret");
});

it("hides the finances without the money right and refuses without the directory right", async () => {
  const r = await activityReport(db, secretary);
  expect([r.money, "finances" in r ? r.finances : "absent"]).toEqual([false, null]);
  expect(buildSlides(r, { sections: [...reportSections], word: "", thanks: "", locale: "fr" }, reportCopy.fr, {}).map((s) => s.id)).not.toContain("finances");
  await expect(activityReport(db, player)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("keeps each club to itself and follows the chosen team", async () => {
  const b = await activityReport(db, presidentB);
  expect("figures" in b && b.figures).toMatchObject({ members: 0, trainings: 0, teams: 1 });
  expect(JSON.stringify(b)).not.toContain("Tournoi de Gand");
  await expect(activityReport(db, presidentB, { team: teamA })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const lions = await activityReport(db, president, { team: teamA });
  expect(lions.team).toBe("Lions");
  expect("figures" in lions && lions.figures?.players).toBe(2);
});
