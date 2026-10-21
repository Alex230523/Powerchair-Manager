import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  registrationExecute,
  registrationView,
} from "../../src/domains/registrations/service";
import { tigerstormTemplate } from "../../src/domains/registrations/templates";
import { duesExecute, duesView } from "../../src/domains/dues/service";
import {
  remindersExecute,
  remindersView,
} from "../../src/domains/reminders/service";
import { unseal } from "../../src/domains/notifications/crypto";

const schema = "wave1_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  season: string,
  president: Principal,
  secretary: Principal,
  candidate: Principal;

async function actor(org: string | null, role = "", grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, "Test " + (role || "candidate"), userId + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  const p = { userId, sessionId };
  if (org) {
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [org, userId],
    );
    const mandateId = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
        [org, userId, role, grants],
      )
    ).rows[0].id;
    await execute(db, p, { action: "context", mandateId });
  }
  return p;
}

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Tigerstorm test','club') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison test',CURRENT_DATE-60,CURRENT_DATE+300) RETURNING id",
      [club],
    )
  ).rows[0].id;
  president = await actor(club, "club_president", ["people.sensitive"]);
  // A registrations manager without the sensitive-data grant.
  secretary = await actor(club, "coach", ["registrations.manage"]);
  candidate = await actor(null);
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

it("encrypts confidential answers, hides them without the grant and fills the profile on admission", async () => {
  const template = tigerstormTemplate("fr");
  const form = await registrationExecute(
    db,
    president,
    {
      action: "form",
      seasonId: season,
      title: template.title,
      description: template.description,
      fields: template.fields,
      published: true,
      capacity: null,
    },
    club,
  );
  const draft = await registrationExecute(db, candidate, {
    action: "draft",
    formId: form.id!,
    subjectKind: "represented",
    subjectName: "Inès Test",
    birthDate: "2014-03-02",
    locale: "fr",
    website: "",
    answers: {
      gender: ["Femme"],
      address: "Rue de Test 1",
      postal_code: "1030",
      email: "Famille@Example.test",
      phone: "+32 470 00 00 00",
      emergency: "Papa, +32 470 11 11 11",
      condition: "Pathologie confidentielle de test",
      national_number: "00.00.00-000.00",
      jersey_size: "M",
      jersey_number: "8",
      joystick: ["Main droite", "Menton"],
      installments: "3 fois",
      privacy_consent: true,
    },
  });
  const stored = (
    await db.query(
      "SELECT answers,confidential_answers,version FROM registration_application WHERE id=$1",
      [draft.id],
    )
  ).rows[0];
  expect(stored.answers.condition).toBeUndefined();
  expect(stored.answers.national_number).toBeUndefined();
  expect(stored.confidential_answers).not.toContain("confidentielle");
  expect(
    unseal<Record<string, string>>(
      stored.confidential_answers,
      "registration:" + draft.id,
    ).condition,
  ).toBe("Pathologie confidentielle de test");

  // A multiple choice above its limit is refused at submission.
  await expect(
    registrationExecute(db, candidate, {
      action: "save",
      id: draft.id,
      expectedVersion: stored.version,
      answers: { joystick: ["Main droite", "Menton", "Tête"] },
    }).then(() =>
      registrationExecute(db, candidate, {
        action: "submit",
        id: draft.id,
        expectedVersion: stored.version + 1,
      }),
    ),
  ).rejects.toMatchObject({ code: "MISSING_FIELDS" });
  const current = (
    await db.query("SELECT version FROM registration_application WHERE id=$1", [
      draft.id,
    ])
  ).rows[0].version;
  await registrationExecute(db, candidate, {
    action: "save",
    id: draft.id,
    expectedVersion: current,
    answers: {
      gender: ["Femme"],
      address: "Rue de Test 1",
      postal_code: "1030",
      email: "famille@example.test",
      phone: "+32 470 00 00 00",
      emergency: "Papa, +32 470 11 11 11",
      condition: "Pathologie confidentielle de test",
      jersey_size: "M",
      jersey_number: "8",
      joystick: ["Main droite", "Menton"],
      installments: "3 fois",
      privacy_consent: true,
    },
  });
  await registrationExecute(db, candidate, {
    action: "submit",
    id: draft.id,
    expectedVersion: current + 1,
  });

  const hidden = (await registrationView(db, secretary, true)).applications[0];
  expect(hidden.answers.condition).toBeUndefined();
  expect(hidden.confidential_hidden).toBe(true);
  const visible = (await registrationView(db, president, true)).applications[0];
  expect(visible.answers.condition).toBe("Pathologie confidentielle de test");
  const mine = (await registrationView(db, candidate, false)).applications[0];
  expect(mine.answers.condition).toBe("Pathologie confidentielle de test");

  await registrationExecute(
    db,
    president,
    {
      action: "decision",
      id: draft.id,
      expectedVersion: visible.version,
      status: "accepted",
      message: "",
      confirmDuplicate: false, acceptOverCapacity: false,
    },
    club,
  );
  const profile = (
    await db.query(
      "SELECT cp.id,cp.email,cp.phone,cp.jersey_number,s.control,s.jersey_size,s.sport_notes,sp.emergency_contact,sp.confidential_ciphertext FROM registration_application a JOIN club_person cp ON cp.id=a.profile_id LEFT JOIN player_sport_profile s ON s.profile_id=cp.id LEFT JOIN player_support_profile sp ON sp.profile_id=cp.id WHERE a.id=$1",
      [draft.id],
    )
  ).rows[0];
  expect(profile).toMatchObject({
    email: "famille@example.test",
    phone: "+32 470 00 00 00",
    jersey_number: 8,
    control: "right_hand",
    jersey_size: "M",
    sport_notes: "Joystick : Main droite, Menton",
    emergency_contact: "Papa, +32 470 11 11 11",
  });
  expect(
    unseal<{ impairment: string }>(
      profile.confidential_ciphertext,
      "player-health:" + profile.id,
    ).impairment,
  ).toBe("Pathologie confidentielle de test");

  // The dues follow-up suggests the number of payments chosen on the form.
  const dues = await duesView(db, president);
  expect(dues.followups.map((f) => f.installments)).toEqual([3]);
});

it("lists people not up to date and sends reminders once a day", async () => {
  const profile = (
    await db.query(
      "SELECT profile_id FROM registration_application WHERE profile_id IS NOT NULL LIMIT 1",
    )
  ).rows[0].profile_id;
  const plan = await duesExecute(
    db,
    president,
    {
      action: "plan",
      seasonId: season,
      category: "Cotisation",
      amountCents: 25000,
      maxInstallments: 4,
      firstDue: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
    },
    club,
  );
  await duesExecute(
    db,
    president,
    {
      action: "issue",
      planId: plan.id!,
      profileId: profile,
      discountCents: 0,
      reason: "",
      installments: 2,
      firstDue: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
    },
    club,
  );
  const view = await remindersView(db, president);
  const row = view.dues.find((r) => r.profile_id === profile)!;
  expect(row.overdueCents).toBe(12500);
  const sent = await remindersExecute(
    db,
    president,
    { action: "send", kind: "dues", profileIds: [profile] },
    club,
  );
  expect(sent.people).toBe(1);
  const jobs = await db.query(
    "SELECT count(*)::int AS n FROM mail_job WHERE kind='dues_reminder' AND organization_id=$1",
    [club],
  );
  // The profile email recorded at admission receives it (no account linked).
  expect(jobs.rows[0].n).toBe(1);
  await remindersExecute(
    db,
    president,
    { action: "send", kind: "dues", profileIds: [profile] },
    club,
  );
  const again = await db.query(
    "SELECT count(*)::int AS n FROM mail_job WHERE kind='dues_reminder' AND organization_id=$1",
    [club],
  );
  expect(again.rows[0].n).toBe(1);
  expect((await remindersView(db, president)).dues[0].last_sent).toBeTruthy();
  await expect(remindersView(db, secretary)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
