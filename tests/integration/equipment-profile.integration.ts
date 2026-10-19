import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  equipmentExecute,
  equipmentView,
} from "../../src/domains/equipment/service";
import {
  playerProfileExecute,
  playerProfileView,
} from "../../src/domains/player-profile/service";
const schema = "equipment_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let clubA: string,
  clubB: string,
  team: string,
  president: Principal,
  coach: Principal,
  player: Principal,
  otherPresident: Principal,
  camille: string,
  yanis: string;
async function actor(
  org: string,
  role: string,
  grants: string[] = [],
  teamId: string | null = null,
) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,true)',
    [userId, role, userId + "@example.test"],
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
      "INSERT INTO role_assignment(organization_id,user_id,role,grants,team_id) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [org, userId, role, grants, teamId],
    )
  ).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function member(
  org: string,
  name: string,
  userId: string | null,
  roles = "{player}",
) {
  const person = userId
    ? (await db.query("SELECT id FROM person WHERE user_id=$1", [userId]))
        .rows[0].id
    : (await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id"))
        .rows[0].id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,'2000-01-01',$4) RETURNING id",
      [org, person, name, roles],
    )
  ).rows[0].id as string;
}
const chairInput = (name: string) => ({
  action: "chair" as const,
  name,
  brand: "Test",
  model: "T1",
  serialNumber: "",
  ownership: "club" as const,
  status: "available" as const,
  maxSpeedKmh: 10,
  battery: "",
  acquiredOn: null,
  lastServiceOn: null,
  nextServiceOn: null,
  notes: "",
});
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
  const season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison test',CURRENT_DATE-30,CURRENT_DATE+300) RETURNING id",
      [clubA],
    )
  ).rows[0].id;
  team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id",
      [clubA, season],
    )
  ).rows[0].id;
  president = await actor(clubA, "club_president", ["people.sensitive"]);
  coach = await actor(clubA, "coach", [], team);
  player = await actor(clubA, "player");
  otherPresident = await actor(clubB, "club_president");
  camille = await member(clubA, "Camille", player.userId);
  yanis = await member(clubA, "Yanis", null);
  // The people module recognises a coach through their own club record.
  await member(clubA, "Coach", coach.userId, "{coach}");
  for (const id of [camille, yanis])
    await db.query(
      "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-10)",
      [clubA, team, id],
    );
});
beforeEach(async () => {
  vi.stubEnv("PFM_MFA_SUSPENDED", "false");
  await db.query("DELETE FROM equipment_history");
  await db.query("DELETE FROM equipment_chair_assignment");
  await db.query("DELETE FROM equipment_chair");
  await db.query("DELETE FROM player_sport_profile");
  await db.query("DELETE FROM player_support_profile");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("links one chair to several players and keeps the history", async () => {
  const { id } = await equipmentExecute(
    db,
    president,
    chairInput("Club 1"),
    clubA,
  );
  await equipmentExecute(
    db,
    president,
    {
      action: "assign",
      chairId: id,
      profileId: camille,
      primary: true,
      startsOn: "2026-09-01",
    },
    clubA,
  );
  const second = await equipmentExecute(
    db,
    president,
    {
      action: "assign",
      chairId: id,
      profileId: yanis,
      primary: false,
      startsOn: "2026-09-01",
    },
    clubA,
  );
  let chair = (await equipmentView(db, president)).chairs[0];
  expect(chair.status).toBe("in_use");
  expect(chair.links.map((l) => [l.full_name, l.is_primary])).toEqual([
    ["Camille", true],
    ["Yanis", false],
  ]);
  await expect(
    equipmentExecute(
      db,
      president,
      {
        action: "assign",
        chairId: id,
        profileId: yanis,
        primary: false,
        startsOn: "2026-09-02",
      },
      clubA,
    ),
  ).rejects.toMatchObject({ code: "DUPLICATE" });
  await equipmentExecute(
    db,
    president,
    { action: "unassign", id: second.id, endsOn: "2026-10-01" },
    clubA,
  );
  chair = (await equipmentView(db, president)).chairs[0];
  expect(chair.links.filter((l) => !l.ends_on)).toHaveLength(1);
  expect(chair.links.filter((l) => l.ends_on)).toHaveLength(1);
});

it("shows a player only their chairs and counts other users without naming them", async () => {
  const { id } = await equipmentExecute(
    db,
    president,
    chairInput("Shared"),
    clubA,
  );
  await equipmentExecute(db, president, chairInput("Not mine"), clubA);
  for (const profileId of [camille, yanis])
    await equipmentExecute(
      db,
      president,
      {
        action: "assign",
        chairId: id,
        profileId,
        primary: true,
        startsOn: "2026-09-01",
      },
      clubA,
    );
  const v = await equipmentView(db, player);
  expect(v.manage).toBe(false);
  expect(
    v.chairs.map((c) => [c.name, c.links.map((l) => l.full_name), c.others]),
  ).toEqual([["Shared", ["Camille"], 1]]);
  await expect(
    equipmentExecute(db, player, chairInput("Mine"), clubA),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const coachView = await equipmentView(db, coach);
  expect(coachView.chairs[0].links).toHaveLength(2);
});

it("never shows another club's equipment", async () => {
  await equipmentExecute(db, president, chairInput("Club A chair"), clubA);
  expect((await equipmentView(db, otherPresident)).chairs).toEqual([]);
  await expect(
    equipmentExecute(db, otherPresident, chairInput("x"), clubA),
  ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});

it("separates sport, support and confidential data by audience", async () => {
  await playerProfileExecute(
    db,
    president,
    {
      action: "sport",
      id: camille,
      version: 0,
      classification: "PF2",
      classificationValidUntil: null,
      control: "right_hand",
      sportNotes: "Capitaine",
    },
    clubA,
  );
  await playerProfileExecute(
    db,
    president,
    {
      action: "support",
      id: camille,
      version: 0,
      supportNeeds: "Aide au transfert",
      safetyNotes: "Sangle",
      emergencyContact: "Marc",
    },
    clubA,
  );
  await playerProfileExecute(
    db,
    player,
    {
      action: "confidential",
      id: camille,
      version: 1,
      impairment: "Myopathie",
      medicalNotes: "",
    },
    clubA,
  );

  const own = await playerProfileView(db, player, camille);
  expect(own.confidential?.impairment).toBe("Myopathie");
  expect(own.sport.classification).toBe("PF2");

  const byCoach = await playerProfileView(db, coach, camille);
  expect(byCoach.support?.support_needs).toBe("Aide au transfert");
  expect(byCoach.confidential).toBeNull();
  expect(byCoach.player.birth_date).toBeUndefined();
  expect(byCoach.can.editSport).toBe(true);

  const byPresident = await playerProfileView(db, president, camille);
  expect(byPresident.confidential?.impairment).toBe("Myopathie");

  // Stored encrypted: the plain text never appears in the table.
  const raw = (
    await db.query(
      "SELECT confidential_ciphertext FROM player_support_profile WHERE profile_id=$1",
      [camille],
    )
  ).rows[0];
  expect(raw.confidential_ciphertext).not.toContain("Myopathie");
});

it("refuses confidential edits without the explicit grant and stale versions", async () => {
  await expect(
    playerProfileExecute(
      db,
      coach,
      {
        action: "confidential",
        id: yanis,
        version: 0,
        impairment: "x",
        medicalNotes: "",
      },
      clubA,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await playerProfileExecute(
    db,
    coach,
    {
      action: "sport",
      id: yanis,
      version: 0,
      classification: "PF1",
      classificationValidUntil: null,
      control: "chin",
      sportNotes: "",
    },
    clubA,
  );
  await expect(
    playerProfileExecute(
      db,
      coach,
      {
        action: "sport",
        id: yanis,
        version: 0,
        classification: "PF2",
        classificationValidUntil: null,
        control: "chin",
        sportNotes: "",
      },
      clubA,
    ),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
  await expect(playerProfileView(db, player, yanis)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    playerProfileView(db, otherPresident, camille),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
