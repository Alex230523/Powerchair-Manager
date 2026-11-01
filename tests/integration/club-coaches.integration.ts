import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  execute,
  workspace,
  type Principal,
} from "../../src/domains/access/service";
import { financeExecute, financeView } from "../../src/domains/finance/service";
import {
  clubExecute,
  clubLogo,
  clubView,
} from "../../src/domains/club/service";
import { peopleExecute, peopleView } from "../../src/domains/people/service";
import {
  coachExecute,
  coachProfileView,
  coursesExecute,
  coursesView,
} from "../../src/domains/coaches/service";

const schema = "club_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  federation: string,
  team: string,
  president: Principal,
  coach: Principal,
  coachMandate: string,
  fedPresident: Principal,
  fedWorker: Principal,
  coachProfile: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,true)',
    [userId, "Test " + role, userId + "@example.test"],
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
      "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
      [org, userId, role, grants],
    )
  ).rows[0].id as string;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return { p, mandateId };
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
    new Date(),
  );

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club test','club') RETURNING id",
    )
  ).rows[0].id;
  federation = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Fédération test','federation') RETURNING id",
    )
  ).rows[0].id;
  const season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison test',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id",
      [club],
    )
  ).rows[0].id;
  team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id",
      [club, season],
    )
  ).rows[0].id;
  await db.query("UPDATE organization SET federation_id=$1 WHERE id=$2", [
    federation,
    club,
  ]);
  president = (await actor(club, "club_president")).p;
  const c = await actor(club, "coach");
  coach = c.p;
  coachMandate = c.mandateId;
  fedPresident = (await actor(federation, "federation_president")).p;
  fedWorker = (await actor(federation, "federation_worker")).p;
  const person = (
    await db.query("SELECT id FROM person WHERE user_id=$1", [coach.userId])
  ).rows[0].id;
  coachProfile = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) VALUES($1,$2,'Sam Coach','{coach}') RETURNING id",
      [club, person],
    )
  ).rows[0].id;
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

it("keeps a club ledger reserved to people trusted with money", async () => {
  const record = {
    action: "record" as const,
    occurredOn: today(),
    label: "Subside communal",
    direction: "in" as const,
    category: "subsidy" as const,
    amountCents: 120000,
    method: "transfer" as const,
    counterparty: "Commune",
    reference: "",
    notes: "",
  };
  const { id } = await financeExecute(db, president, record, club);
  await financeExecute(
    db,
    president,
    {
      ...record,
      label: "Location salle",
      direction: "out",
      category: "venue",
      amountCents: 30000,
    },
    club,
  );
  let view = await financeView(db, president);
  expect(view.summary.balance).toBe(90000);
  expect(view.summary.income).toBe(120000);
  await financeExecute(
    db,
    president,
    { action: "cancel", id, reason: "Doublon de saisie" },
    club,
  );
  view = await financeView(db, president);
  expect(view.summary.balance).toBe(-30000);
  expect(view.entries.find((e) => e.id === id)?.cancel_reason).toBe(
    "Doublon de saisie",
  );
  await expect(financeView(db, coach)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    financeExecute(
      db,
      president,
      { ...record, occurredOn: "2999-01-01" },
      club,
    ),
  ).rejects.toMatchObject({ code: "INVALID_DATE" });
});

it("updates the club identity and checks the logo signature", async () => {
  await clubExecute(
    db,
    president,
    { action: "identity", name: "Club renommé", contactEmail: "" },
    club,
  );
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    Buffer.from("fake image body"),
  ]);
  await clubExecute(
    db,
    president,
    { action: "logo", mediaType: "image/png", data: png.toString("base64") },
    club,
  );
  expect((await clubLogo(db, club))?.media_type).toBe("image/png");
  const view = await clubView(db, president);
  expect(view.organization.name).toBe("Club renommé");
  expect(view.organization.logo_version).toBeTruthy();
  expect(view.teams.map((t: { name: string }) => t.name)).toEqual(["Équipe A"]);
  await expect(
    clubExecute(
      db,
      president,
      { action: "logo", mediaType: "image/jpeg", data: png.toString("base64") },
      club,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await expect(
    clubExecute(db, coach, { action: "removeLogo" }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("lets the president delegate rights to a coach, never beyond their own", async () => {
  await execute(db, president, {
    action: "grants",
    id: coachMandate,
    grants: ["people.read", "attendance.manage"],
  });
  const ws = await workspace(db, coach);
  expect(ws.permissions).toEqual(
    expect.arrayContaining(["people.read", "attendance.manage"]),
  );
  await expect(
    execute(db, coach, { action: "grants", id: coachMandate, grants: [] }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await execute(db, president, {
    action: "grants",
    id: coachMandate,
    grants: [],
  });
});

it("adds the president as a coach without duplicating their profile", async () => {
  await peopleExecute(
    db,
    president,
    { action: "selfCoach", teamId: team },
    club,
  );
  await peopleExecute(
    db,
    president,
    { action: "selfCoach", teamId: team },
    club,
  );
  const rows = (
    await db.query(
      "SELECT cp.id,cp.directory_roles FROM club_person cp JOIN person p ON p.id=cp.person_id WHERE p.user_id=$1",
      [president.userId],
    )
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].directory_roles).toEqual(["coach"]);
  const memberships = await db.query(
    "SELECT 1 FROM team_membership WHERE profile_id=$1 AND role='coach'",
    [rows[0].id],
  );
  expect(memberships.rowCount).toBe(1);
});

it("imports players from a spreadsheet and skips those already listed", async () => {
  const rows = [
    {
      fullName: "Léa Import",
      birthDate: "2008-04-15",
      email: "",
      phone: "",
      joinedOn: null,
      position: "Défense",
      jerseyNumber: 5,
    },
    {
      fullName: "Tom Import",
      birthDate: null,
      email: "tom@example.test",
      phone: "",
      joinedOn: null,
      position: "",
      jerseyNumber: null,
    },
  ];
  expect(
    await peopleExecute(
      db,
      president,
      { action: "importPlayers", teamId: team, rows },
      club,
    ),
  ).toMatchObject({ created: 2, skipped: 0 });
  expect(
    await peopleExecute(
      db,
      president,
      { action: "importPlayers", teamId: null, rows },
      club,
    ),
  ).toMatchObject({ created: 0, skipped: 2 });
  const view = await peopleView(db, president);
  const lea = view.profiles.find((p) => p.full_name === "Léa Import");
  expect(lea?.directory_roles).toEqual(["player"]);
  expect(lea?.assignments.map((a) => a.role)).toEqual(["player"]);
  await expect(
    peopleExecute(
      db,
      coach,
      { action: "importPlayers", teamId: null, rows },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("runs the course workflow: federation creates, club asks, federation confirms", async () => {
  const course = await coursesExecute(
    db,
    fedPresident,
    {
      action: "createCourse",
      title: "Initiateur",
      level: "Niveau 1",
      description: "",
      hours: 16,
      validityYears: 3,
    },
    federation,
  );
  await expect(
    coursesExecute(
      db,
      fedWorker,
      {
        action: "createCourse",
        title: "Autre",
        level: "",
        description: "",
        hours: null,
        validityYears: null,
      },
      federation,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  // Wave 17 (O1): a coach may ask for their own course, never for a colleague's.
  const colleague = (
    await db.query("WITH p AS (INSERT INTO person DEFAULT VALUES RETURNING id) INSERT INTO club_person(organization_id,person_id,full_name,directory_roles) SELECT $1,id,'Alex Collègue','{coach}' FROM p RETURNING id", [club])
  ).rows[0].id as string;
  await expect(
    coachExecute(
      db,
      coach,
      {
        action: "requestCourse",
        profileId: colleague,
        courseId: course.id,
        note: "",
      },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const request = await coachExecute(
    db,
    president,
    {
      action: "requestCourse",
      profileId: coachProfile,
      courseId: course.id,
      note: "Suivie en mars",
    },
    club,
  );
  await expect(
    coachExecute(
      db,
      president,
      {
        action: "requestCourse",
        profileId: coachProfile,
        courseId: course.id,
        note: "",
      },
      club,
    ),
  ).rejects.toMatchObject({ code: "DUPLICATE" });
  // The federation president is told in the app that a request is waiting.
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM app_notification WHERE kind='training_update' AND recipient_user_id=$1",
        [fedPresident.userId],
      )
    ).rows[0].n,
  ).toBe(1);
  const pending = await coursesView(db, fedWorker);
  expect(pending.clubs.map((c: { name: string }) => c.name)).toEqual([
    "Club renommé",
  ]);
  expect(pending.can.manage).toBe(false);
  expect(
    pending.requests.map((r: { coach: string; status: string }) => [
      r.coach,
      r.status,
    ]),
  ).toEqual([["Sam Coach", "requested"]]);
  await coursesExecute(
    db,
    fedPresident,
    {
      action: "decide",
      id: request.id,
      decision: "approved",
      note: "",
      completedOn: "2026-03-10",
    },
    federation,
  );
  const profile = await coachProfileView(db, president, coachProfile);
  expect(
    profile.formations.map((f: { status: string; valid_until: string }) => [
      f.status,
      f.valid_until,
    ]),
  ).toEqual([["approved", "2029-03-10"]]);
  expect(profile.can.request).toBe(true);
  await expect(coursesView(db, president)).rejects.toMatchObject({
    code: "FEDERATION_ONLY",
  });
});
