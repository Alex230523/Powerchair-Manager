import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  peopleExecute,
  peopleExport,
  peopleView,
  filterSchema,
} from "../../src/domains/people/service";
import type { PeopleCommand } from "../../src/domains/people/schema";
const schema = "people_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
let admin: Principal,
  adminB: Principal,
  coach: Principal,
  parent: Principal,
  parentB: Principal,
  player: Principal,
  federal: Principal;
let orgA: string,
  orgB: string,
  coachMandate: string,
  teamA: string,
  teamOther: string,
  seasonA: string,
  teamB: string,
  childA: string,
  childB: string,
  adult: string,
  coachProfile: string,
  parentProfile: string,
  parentBProfile: string,
  relationA: string,
  relationB: string;
async function org(name: string, kind = "club") {
  return (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES($1,$2) RETURNING id",
      [name, kind],
    )
  ).rows[0].id as string;
}
async function actor(
  name: string,
  organizationId: string,
  role: string,
  mfa = true,
) {
  const id = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,$4)',
    [id, name, id + "@example.test", mfa],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [id]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, id, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [organizationId, id],
  );
  const mandate = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id",
      [organizationId, id, role],
    )
  ).rows[0].id;
  const principal = { userId: id, sessionId };
  await execute(db, principal, { action: "context", mandateId: mandate });
  return { ...principal, mandate };
}
async function command(p: Principal, c: PeopleCommand) {
  return peopleExecute(db, p, c);
}
async function person(
  name: string,
  birthDate: string | null,
  accountUserId?: string,
  p = admin,
) {
  return (
    await command(p, {
      action: "createPerson",
      fullName: name,
      birthDate,
      email: name.replaceAll(" ", "") + "@example.test",
      phone: "+32 400 00 00 00",
      joinedOn: day,
      accountUserId,
    })
  ).id!;
}
async function view(p: Principal, filters: Record<string, unknown> = {}) {
  return peopleView(db, p, filterSchema.parse(filters));
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  orgA = await org("Club A");
  orgB = await org("Club B");
  const fed = await org("Federation", "federation");
  admin = await actor("Admin A", orgA, "club_president");
  adminB = await actor("Admin B", orgB, "club_president");
  const c = await actor("Coach", orgA, "coach");
  coach = c;
  coachMandate = c.mandate;
  parent = await actor("Parent", orgA, "guardian", false);
  parentB = await actor("Parent B", orgA, "guardian", false);
  const pl = await actor("Player", orgA, "player", false);
  player = pl;
  federal = await actor("Federal", fed, "federation_president");
  coachProfile = await person("Coach Profile", "1980-01-01", coach.userId);
  parentProfile = await person("Parent Profile", "1980-01-02", parent.userId);
  parentBProfile = await person("Second Parent", "1981-01-02", parentB.userId);
  adult = await person("Adult Player", "2000-01-01", player.userId);
  childA = await person("Child One", "2015-01-01");
  childB = await person("Child Two", "2014-01-01");
  seasonA = (
    await command(admin, {
      action: "season",
      name: "2026-2027",
      startsOn: "2026-01-01",
      endsOn: "2027-12-31",
    })
  ).id!;
  teamA = (
    await command(admin, {
      action: "team",
      seasonId: seasonA,
      name: "Team A",
      category: "",
      level: "",
      homeLocation: "",
    })
  ).id!;
  teamOther = (
    await command(admin, {
      action: "team",
      seasonId: seasonA,
      name: "Other Team",
      category: "",
      level: "",
      homeLocation: "",
    })
  ).id!;
  const seasonB = (
    await command(adminB, {
      action: "season",
      name: "2026-2027",
      startsOn: "2026-01-01",
      endsOn: "2027-12-31",
    })
  ).id!;
  teamB = (
    await command(adminB, {
      action: "team",
      seasonId: seasonB,
      name: "Club B Team",
      category: "",
      level: "",
      homeLocation: "",
    })
  ).id!;
  await command(admin, {
    action: "assign",
    teamId: teamA,
    profileId: coachProfile,
    role: "coach",
    position: "",
    startsOn: day,
    endsOn: null,
  });
  await command(admin, {
    action: "assign",
    teamId: teamA,
    profileId: childA,
    role: "player",
    position: "Forward",
    startsOn: day,
    endsOn: null,
  });
  await command(admin, {
    action: "assign",
    teamId: teamOther,
    profileId: childB,
    role: "player",
    position: "",
    startsOn: day,
    endsOn: null,
  });
  relationA = (
    await command(admin, {
      action: "guardian",
      guardianId: parentProfile,
      subjectId: childA,
      kind: "legal_verified",
      canView: true,
      canEdit: true,
      startsOn: day,
      endsOn: null,
      authorizationNote: "Verified locally by club",
    })
  ).id!;
  relationB = (
    await command(admin, {
      action: "guardian",
      guardianId: parentBProfile,
      subjectId: childA,
      kind: "legal_verified",
      canView: true,
      canEdit: false,
      startsOn: day,
      endsOn: null,
      authorizationNote: "Verified locally by club",
    })
  ).id!;
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
describe("club persons, families, teams and seasons", () => {
  it("creates offline identities and links existing unique account identities", async () => {
    const result = await view(admin);
    expect(result.profiles).toHaveLength(6);
    expect(
      (
        await db.query(
          "SELECT user_id FROM person WHERE id=(SELECT person_id FROM club_person WHERE id=$1)",
          [adult],
        )
      ).rows[0].user_id,
    ).toBe(player.userId);
  });
  it("rejects duplicates transactionally, including missing birth dates", async () => {
    await expect(person("Child One", "2015-01-01")).rejects.toMatchObject({
      code: "DUPLICATE",
    });
    await person("No Date", null);
    await expect(person("  no date  ", null)).rejects.toMatchObject({
      code: "DUPLICATE",
    });
  });
  it("keeps another club and federation out of private profiles", async () => {
    expect((await view(adminB)).profiles).toHaveLength(0);
    await expect(
      command(adminB, {
        action: "updatePerson",
        id: childA,
        version: 1,
        fullName: "Stolen",
        birthDate: null,
        email: "",
        phone: "",
        joinedOn: day,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(view(federal)).rejects.toMatchObject({ code: "CLUB_ONLY" });
  });
  it("rejects cross-organization team assignments in service and composite foreign keys", async () => {
    await expect(
      command(admin, {
        action: "assign",
        teamId: teamB,
        profileId: childA,
        role: "player",
        position: "",
        startsOn: day,
        endsOn: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      db.query(
        "INSERT INTO team_membership(organization_id,team_id,profile_id,role) VALUES($1,$2,$3,'player')",
        [orgB, teamB, childA],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("limits a coach to own teams and redacts contacts and birth dates", async () => {
    const result = await view(coach);
    expect(result.teams.map((t) => t.id)).toEqual([teamA]);
    const child = result.profiles.find((p) => p.id === childA)!;
    expect(child).toBeTruthy();
    expect(child).not.toHaveProperty("email");
    expect(child).not.toHaveProperty("birth_date");
    expect(result.profiles.some((p) => p.id === childB)).toBe(false);
    await expect(view(coach, { minAge: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("applies explicit coach scope instead of merging both team assignments", async () => {
    await command(admin, {
      action: "assign",
      teamId: teamOther,
      profileId: coachProfile,
      role: "assistant",
      position: "",
      startsOn: day,
      endsOn: null,
    });
    expect((await view(coach)).teams).toHaveLength(2);
    await command(admin, {
      action: "coachScope",
      mandateId: coachMandate,
      teamId: teamA,
    });
    expect((await view(coach)).teams.map((t) => t.id)).toEqual([teamA]);
  });
  it("supports two parents with distinct read and edit permissions", async () => {
    const first = (await view(parent)).profiles.find((p) => p.id === childA)!;
    const second = (await view(parentB)).profiles.find((p) => p.id === childA)!;
    expect(first.can_edit).toBe(true);
    expect(second.can_edit).toBe(false);
    expect((await view(parent)).profiles.some((p) => p.id === childB)).toBe(
      false,
    );
    await command(parent, {
      action: "contacts",
      id: childA,
      version: first.version,
      email: "updated@example.test",
      phone: "123",
    });
    await expect(
      command(parentB, {
        action: "contacts",
        id: childA,
        version: first.version + 1,
        email: "no@example.test",
        phone: "",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows one parent to represent multiple children without directory access", async () => {
    await command(admin, {
      action: "guardian",
      guardianId: parentProfile,
      subjectId: childB,
      kind: "legal_verified",
      canView: true,
      canEdit: false,
      startsOn: day,
      endsOn: null,
      authorizationNote: "Separate verified authorization",
    });
    expect((await view(parent)).profiles.map((p) => p.id)).toEqual(
      expect.arrayContaining([parentProfile, childA, childB]),
    );
    await expect(
      command(parent, {
        action: "createPerson",
        fullName: "Illegal",
        birthDate: null,
        email: "",
        phone: "",
        joinedOn: day,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("gives declared family relationships no access and rejects self-granted rights", async () => {
    const hidden = await person("Declared Child", "2016-02-02");
    await command(admin, {
      action: "guardian",
      guardianId: parentProfile,
      subjectId: hidden,
      kind: "declared",
      canView: false,
      canEdit: false,
      startsOn: day,
      endsOn: null,
      authorizationNote: "",
    });
    expect((await view(parent)).profiles.some((p) => p.id === hidden)).toBe(
      false,
    );
    await expect(
      command(parent, {
        action: "guardian",
        guardianId: parentProfile,
        subjectId: hidden,
        kind: "legal_verified",
        canView: true,
        canEdit: true,
        startsOn: day,
        endsOn: null,
        authorizationNote: "Self declared",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("stops legal representative access at majority and allows explicit time-limited adult assistance", async () => {
    const d = new Date(day + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() - 18);
    await db.query("UPDATE club_person SET birth_date=$2 WHERE id=$1", [
      childA,
      d.toISOString().slice(0, 10),
    ]);
    expect((await view(parent)).profiles.some((p) => p.id === childA)).toBe(
      false,
    );
    await command(admin, { action: "revokeGuardian", id: relationA });
    await command(admin, {
      action: "guardian",
      guardianId: parentProfile,
      subjectId: childA,
      kind: "delegated_aid",
      canView: true,
      canEdit: true,
      startsOn: day,
      endsOn: "2027-12-31",
      authorizationNote: "Adult consent verified by club",
    });
    expect((await view(parent)).profiles.some((p) => p.id === childA)).toBe(
      true,
    );
  });
  it("revokes representative permissions immediately", async () => {
    await command(admin, { action: "revokeGuardian", id: relationB });
    expect((await view(parentB)).profiles.some((p) => p.id === childA)).toBe(
      false,
    );
  });
  it("allows an adult player to edit own contacts without gaining directory privileges", async () => {
    const own = (await view(player)).profiles[0];
    expect(own.id).toBe(adult);
    expect(own.can_edit).toBe(true);
    await command(player, {
      action: "contacts",
      id: adult,
      version: own.version,
      email: "own@example.test",
      phone: "555",
    });
    await expect(
      command(player, {
        action: "contacts",
        id: childB,
        version: 1,
        email: "",
        phone: "",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("detects stale edits rather than overwriting another change", async () => {
    const profile = (await view(admin)).profiles.find((p) => p.id === childB)!;
    await command(admin, {
      action: "contacts",
      id: childB,
      version: profile.version,
      email: "new@example.test",
      phone: "",
    });
    await expect(
      command(admin, {
        action: "contacts",
        id: childB,
        version: profile.version,
        email: "stale@example.test",
        phone: "",
      }),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
  });
  it("enforces season dates and preserves history through archives and reactivation", async () => {
    await expect(
      command(admin, {
        action: "assign",
        teamId: teamA,
        profileId: childB,
        role: "player",
        position: "",
        startsOn: "2020-01-01",
        endsOn: null,
      }),
    ).rejects.toMatchObject({ code: "SEASON_DATES" });
    await command(admin, { action: "status", id: childB, status: "archived" });
    expect((await view(admin)).profiles.some((p) => p.id === childB)).toBe(
      false,
    );
    expect(
      (await view(admin, { status: "archived" })).profiles.find(
        (p) => p.id === childB,
      )?.assignments.length,
    ).toBeGreaterThan(0);
    await command(admin, { action: "status", id: childB, status: "active" });
    expect((await view(admin)).profiles.some((p) => p.id === childB)).toBe(
      true,
    );
  });
  it("rejects a stale form after the active organization changes", async () => {
    await expect(
      peopleExecute(
        db,
        admin,
        {
          action: "createPerson",
          fullName: "Wrong club",
          birthDate: null,
          email: "",
          phone: "",
          joinedOn: day,
        },
        orgB,
      ),
    ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  });
  it("supports scoped search, season, role and age filters", async () => {
    expect(
      (
        await view(admin, {
          q: "Child Two",
          team: teamOther,
          season: seasonA,
          sportRole: "player",
          minAge: 1,
          maxAge: 30,
        })
      ).profiles.map((p) => p.id),
    ).toEqual([childB]);
  });
  it("keeps identity and historical records on transfer, removes the old player context and supports return", async () => {
    const original = (
      await db.query("SELECT person_id FROM club_person WHERE id=$1", [adult])
    ).rows[0].person_id;
    const issued = await command(admin, {
      action: "transfer",
      id: adult,
      authorizationNote: "Transfer consent verified",
    });
    expect(issued.token).toBeTruthy();
    const accepted = await command(adminB, {
      action: "acceptTransfer",
      token: issued.token!,
    });
    const newProfile = accepted.id!;
    expect(
      (
        await db.query("SELECT person_id FROM club_person WHERE id=$1", [
          newProfile,
        ])
      ).rows[0].person_id,
    ).toBe(original);
    await expect(view(player)).rejects.toMatchObject({
      code: "CONTEXT_REQUIRED",
    });
    expect(
      (await view(admin, { status: "transferred" })).profiles.some(
        (p) => p.id === adult,
      ),
    ).toBe(true);
    expect((await view(adminB)).profiles.map((p) => p.id)).toEqual([
      newProfile,
    ]);
    await expect(
      command(adminB, { action: "acceptTransfer", token: issued.token! }),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID" });
    const back = await command(adminB, {
      action: "transfer",
      id: newProfile,
      authorizationNote: "Return consent verified",
    });
    expect(
      (await command(admin, { action: "acceptTransfer", token: back.token! }))
        .id,
    ).toBe(adult);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM club_person WHERE organization_id=$1 AND person_id=$2",
          [orgA, original],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("exports only the authorized club and rejects exports without a separate permission", async () => {
    const csv = await peopleExport(
      db,
      admin,
      filterSchema.parse({ q: "Child" }),
      orgA,
    );
    expect(csv).toContain("Child Two");
    expect(csv).not.toContain("Club B");
    await expect(
      peopleExport(db, coach, filterSchema.parse({}), orgA),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      peopleExport(db, admin, filterSchema.parse({}), orgB),
    ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  });
  it("associates an offline profile to an existing verified club account without changing local history", async () => {
    const identity = await actor("Late account", orgA, "player", false);
    const profileId = await person("Previously Offline", "2001-03-02");
    await command(admin, {
      action: "assign",
      teamId: teamA,
      profileId,
      role: "player",
      position: "",
      startsOn: day,
      endsOn: null,
    });
    await command(admin, {
      action: "linkAccount",
      id: profileId,
      userId: identity.userId,
    });
    expect((await view(identity)).profiles[0].id).toBe(profileId);
    expect((await view(identity)).profiles[0].assignments).toHaveLength(1);
  });
  it("edits teams and validates season changes against the retained roster history", async () => {
    await command(admin, {
      action: "updateTeam",
      id: teamA,
      name: "Renamed Team",
      category: "Senior",
      level: "Club",
      homeLocation: "Main Hall",
    });
    expect((await view(admin)).teams.find((t) => t.id === teamA)?.name).toBe(
      "Renamed Team",
    );
    await expect(
      command(admin, {
        action: "updateSeason",
        id: seasonA,
        name: "Invalid dates",
        startsOn: "2027-01-01",
        endsOn: "2027-12-31",
      }),
    ).rejects.toMatchObject({ code: "SEASON_DATES" });
    await command(admin, {
      action: "updateSeason",
      id: seasonA,
      name: "Current Season",
      startsOn: "2026-01-01",
      endsOn: "2027-12-31",
    });
  });
  it("closes roster-based coach access immediately without erasing historical assignments", async () => {
    await command(admin, {
      action: "coachScope",
      mandateId: coachMandate,
      teamId: null,
    });
    const assignments = (
      await db.query(
        "SELECT id FROM team_membership WHERE profile_id=$1 AND closed_at IS NULL",
        [coachProfile],
      )
    ).rows;
    for (const a of assignments)
      await command(admin, { action: "endAssignment", id: a.id, endsOn: day });
    expect((await view(coach)).teams).toHaveLength(0);
    expect(
      (
        await db.query("SELECT id FROM team_membership WHERE profile_id=$1", [
          coachProfile,
        ])
      ).rowCount,
    ).toBeGreaterThan(0);
  });
  it("keeps coaching and identity when a player becomes former, without reviving old assignments", async () => {
    const created = await command(admin, {
      action: "createPerson",
      fullName: "Dual function",
      birthDate: "1990-01-01",
      email: "",
      phone: "",
      joinedOn: day,
      directoryRoles: ["player", "coach"],
    });
    const id = created.id!;
    for (const role of ["player", "coach"] as const)
      await command(admin, {
        action: "assign",
        profileId: id,
        teamId: teamA,
        role,
        position: "Polyvalent",
        startsOn: day,
        endsOn: null,
      });
    const before = (await view(admin)).profiles.find((p) => p.id === id)!;
    await command(admin, {
      action: "gameInfo",
      id,
      version: before.version,
      position: "Gardien",
      jerseyNumber: 7,
    });
    await expect(
      command(admin, {
        action: "gameInfo",
        id,
        version: before.version,
        position: "Pivot",
        jerseyNumber: 9,
      }),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    await command(admin, {
      action: "directoryArchive",
      id,
      role: "player",
      archived: true,
    });
    expect(
      (
        await view(admin, { directoryRole: "player", former: "false" })
      ).profiles.some((p) => p.id === id),
    ).toBe(false);
    const former = (
      await view(admin, {
        directoryRole: "player",
        former: "true",
        status: "all",
      })
    ).profiles.find((p) => p.id === id)!;
    expect(former.status).toBe("active");
    expect(former.playing_position).toBe("Gardien");
    expect(former.jersey_number).toBe(7);
    expect(
      former.assignments.find((a) => a.role === "player")?.closed_at,
    ).toBeTruthy();
    expect(
      former.assignments.find((a) => a.role === "coach")?.closed_at,
    ).toBeNull();
    expect(
      (
        await view(admin, { directoryRole: "coach", former: "false" })
      ).profiles.some((p) => p.id === id),
    ).toBe(true);
    await expect(
      command(admin, {
        action: "assign",
        profileId: id,
        teamId: teamOther,
        role: "player",
        position: "",
        startsOn: day,
        endsOn: null,
      }),
    ).rejects.toMatchObject({ code: "PROFILE_INACTIVE" });
    await command(admin, {
      action: "directoryArchive",
      id,
      role: "player",
      archived: false,
    });
    expect(
      (await view(admin, { directoryRole: "player", former: "false" })).profiles
        .find((p) => p.id === id)
        ?.assignments.find((a) => a.role === "player")?.closed_at,
    ).toBeTruthy();
  });
  it("restricts sporting updates and directory classification to authorised club managers", async () => {
    const plainPlayer=await actor("Directory player",orgA,"player"),plainCoach=await actor("Directory coach",orgA,"coach");
    await expect(
      command(plainPlayer, { action: "directoryRole", id: childA, role: "coach" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      command(plainCoach, {
        action: "gameInfo",
        id: childA,
        version: 1,
        position: "Pivot",
        jerseyNumber: 8,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      peopleExecute(db, adminB, {
        action: "directoryArchive",
        id: childA,
        role: "player",
        archived: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("requires current issuer authority for a prepared transfer", async () => {
    const pending = await command(admin, {
      action: "transfer",
      id: childB,
      authorizationNote: "Consent verified before preparation",
    });
    await db.query(
      "UPDATE role_assignment SET revoked_at=now() WHERE user_id=$1 AND organization_id=$2",
      [admin.userId, orgA],
    );
    await expect(
      command(adminB, { action: "acceptTransfer", token: pending.token! }),
    ).rejects.toMatchObject({ code: "TRANSFER_INVALID" });
  });
});
