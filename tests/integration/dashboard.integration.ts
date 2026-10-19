import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { dashboardView } from "../../src/domains/dashboard/service";
const schema = "dashboard_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
type P = Principal & { mandateId: string };
let clubA: string,
  clubB: string,
  seasonA: string,
  presidentA: P,
  playerA: P,
  presidentB: P,
  playerProfile: string,
  eventId: string;
async function actor(org: string, role: string, name: string): Promise<P> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,true)',
    [userId, name, userId + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [org, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
      [org, userId, role],
    )
  ).rows[0].id;
  const p = { userId, sessionId, mandateId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const keys = (d: Awaited<ReturnType<typeof dashboardView>>) =>
  Object.fromEntries(d.todos.map((t) => [t.key, t.count]));
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  [clubA, clubB] = await Promise.all(
    ["Club A", "Club B"].map(
      async (name) =>
        (
          await db.query(
            "INSERT INTO organization(name,kind) VALUES($1,'club') RETURNING id",
            [name],
          )
        ).rows[0].id as string,
    ),
  );
  seasonA = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-07-01','2027-06-30') RETURNING id",
      [clubA],
    )
  ).rows[0].id;
  presidentA = await actor(clubA, "club_president", "Alex President");
  playerA = await actor(clubA, "player", "Camille Player");
  presidentB = await actor(clubB, "club_president", "Bo Other");
  playerProfile = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) SELECT $1,id,'Camille Player','2000-01-01','{player}' FROM person WHERE user_id=$2 RETURNING id",
      [clubA, playerA.userId],
    )
  ).rows[0].id;
  // A submitted application waiting for review.
  const form = (
    await db.query(
      "INSERT INTO registration_form(organization_id,season_id,title,published) VALUES($1,$2,'Saison',true) RETURNING id",
      [clubA, seasonA],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,status,submitted_at) VALUES($1,$2,$3,$4,'Noah Candidate','2012-05-01','fr','{}','submitted',now())",
    [clubA, form, presidentB.userId, seasonA],
  );
  // One upcoming organisation-wide training with a call-up for the player.
  const series = (
    await db.query(
      "INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id",
      [clubA, presidentA.userId],
    )
  ).rows[0].id;
  eventId = (
    await db.query(
      "INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,responsible_user_id,visibility) VALUES($1,$2,1,'Entraînement A','training','Europe/Brussels',now()+interval '2 days',now()+interval '2 days 2 hours','2026-10-21T18:30','2026-10-21T20:30',$3,'organization') RETURNING id",
      [clubA, series, presidentA.userId],
    )
  ).rows[0].id;
  const register = (
    await db.query(
      "INSERT INTO attendance_register(organization_id,event_id,deadline) VALUES($1,$2,now()+interval '1 day') RETURNING id",
      [clubA, eventId],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO attendance_invitation(organization_id,register_id,profile_id) VALUES($1,$2,$3)",
    [clubA, register, playerProfile],
  );
});
beforeEach(async () => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
  await db.query("DELETE FROM club_document");
  await db.query(
    "INSERT INTO club_document(organization_id,profile_id,season_id,name,category,sensitive,status,expires_on) VALUES" +
      "($1,NULL,$2,'Assurance','insurance',false,'uploaded',NULL)," +
      "($1,NULL,$2,'Certificat','fitness',true,'uploaded',NULL)," +
      "($1,NULL,$2,'Licence','licence',false,'valid',CURRENT_DATE-1)," +
      "($1,$3,$2,'Carte d’identité','identity',false,'requested',NULL)",
    [clubA, seasonA, playerProfile],
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
it("gives the president actionable counts without sensitive documents", async () => {
  const d = await dashboardView(db, presidentA);
  expect(d.context).toMatchObject({ organization: "Club A", kind: "club" });
  expect(keys(d)).toEqual({
    documentsExpired: 1,
    registrationsReview: 1,
    documentsReview: 1,
    documentsMissing: 1,
  });
  expect(d.agenda.map((e) => [e.title, e.responseNeeded])).toEqual([
    ["Entraînement A", false],
  ]);
  const figures = Object.fromEntries(d.metrics.map((m) => [m.key, m.value]));
  expect(figures).toMatchObject({
    upcomingEvents: 1,
    activeMembers: 1,
    activePlayers: 1,
    pendingResponses: 1,
  });
});
it("shows a player only their own pieces and answers", async () => {
  const d = await dashboardView(db, playerA);
  expect(keys(d)).toEqual({ myAttendance: 1, myDocuments: 1 });
  expect(d.agenda[0]).toMatchObject({ id: eventId, responseNeeded: true });
  expect(d.metrics.map((m) => m.key)).toEqual(["upcomingEvents"]);
  expect(d.scopes).not.toContain("documents");
});
it("never leaks another club's figures", async () => {
  const d = await dashboardView(db, presidentB);
  expect(d.context?.organization).toBe("Club B");
  expect(d.todos).toEqual([]);
  expect(d.agenda).toEqual([]);
  expect(
    Object.fromEntries(d.metrics.map((m) => [m.key, m.value])),
  ).toMatchObject({ upcomingEvents: 0, activeMembers: 0 });
});
it("drops an alert as soon as its cause is resolved", async () => {
  await db.query(
    "UPDATE club_document SET status='valid',expires_on=CURRENT_DATE+365 WHERE name IN ('Licence','Assurance')",
  );
  const d = await dashboardView(db, presidentA);
  expect(keys(d)).toEqual({ registrationsReview: 1, documentsMissing: 1 });
});
it("still answers for an account with no active profile", async () => {
  await db.query("DELETE FROM active_context WHERE session_id=$1", [
    playerA.sessionId,
  ]);
  const d = await dashboardView(db, playerA);
  expect(d.context).toBeNull();
  expect(d.agenda).toEqual([]);
  await execute(db, playerA, {
    action: "context",
    mandateId: playerA.mandateId,
  });
});
it("rejects an expired session", async () => {
  await expect(
    dashboardView(db, { userId: playerA.userId, sessionId: randomUUID() }),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
