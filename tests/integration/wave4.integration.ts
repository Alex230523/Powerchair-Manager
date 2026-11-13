import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  guestPrincipal,
  requestGuestLink,
} from "../../src/domains/registrations/guest";
import {
  registrationExecute,
  registrationView,
} from "../../src/domains/registrations/service";
import {
  documentExecute,
  documentSign,
  documentView,
} from "../../src/domains/documents/service";
import {
  clubLicensesExecute,
  clubLicensesView,
  federalCalendarView,
  federationLicensesExecute,
  federationLicensesView,
} from "../../src/domains/federation/service";
import { calendarExecute } from "../../src/domains/calendar/service";
import { playerProfileExecute } from "../../src/domains/player-profile/service";
import { seasonOf } from "../../src/domains/finance/schema";
import { brusselsDay } from "../../src/lib/today";

const schema = "wave4_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  federation: string,
  season: string,
  president: Principal,
  fedPresident: Principal,
  parent: Principal,
  child: string;

async function actor(org: string, role: string, grants: string[] = []) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
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
  ).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function member(name: string, birth: string | null, roles = "{player}") {
  const person = (
    await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")
  ).rows[0].id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [club, person, name, birth, roles],
    )
  ).rows[0].id as string;
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
  federation = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('BPCF test','federation') RETURNING id",
    )
  ).rows[0].id;
  club = (
    await db.query(
      "INSERT INTO organization(name,kind,federation_id) VALUES('Club vague 4','club',$1) RETURNING id",
      [federation],
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison test',CURRENT_DATE-120,CURRENT_DATE+240) RETURNING id",
      [club],
    )
  ).rows[0].id;
  president = await actor(club, "club_president");
  fedPresident = await actor(federation, "federation_president");
  parent = await actor(club, "guardian");
  child = await member("Enfant Signature", "2014-05-05");
  const parentPerson = (
    await db.query("SELECT id FROM person WHERE user_id=$1", [parent.userId])
  ).rows[0].id;
  const parentProfile = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name) VALUES($1,$2,'Parent Signature') RETURNING id",
      [club, parentPerson],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Vérifié pour le test',$4)",
    [club, parentProfile, child, president.userId],
  );
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

it("lets an applicant register through an email link, without a password", async () => {
  const form = await registrationExecute(
    db,
    president,
    {
      action: "form",
      seasonId: season,
      title: "Inscription lien",
      description: "",
      fields: [],
      published: true,
      capacity: null,
    },
    club,
  );
  await requestGuestLink(db, {
    formId: form.id!,
    name: "Famille Lien",
    email: "Famille.Lien@example.test",
    locale: "fr",
  });
  const user = (
    await db.query('SELECT id,"emailVerified" FROM "user" WHERE email=$1', [
      "famille.lien@example.test",
    ])
  ).rows[0];
  expect(user.emailVerified).toBe(false);
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM registration_guest_link WHERE user_id=$1",
        [user.id],
      )
    ).rows[0].n,
  ).toBe(1);
  // A staff address never receives a link (its owner signs in with password and second factor).
  const staffEmail = (
    await db.query('SELECT email FROM "user" WHERE id=$1', [president.userId])
  ).rows[0].email;
  await requestGuestLink(db, {
    formId: form.id!,
    name: "Président",
    email: staffEmail,
    locale: "fr",
  });
  expect(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM registration_guest_link WHERE user_id=$1",
        [president.userId],
      )
    ).rows[0].n,
  ).toBe(0);

  const token = "t".repeat(43);
  await db.query(
    "INSERT INTO registration_guest_link(user_id,form_id,token_hash) VALUES($1,$2,$3)",
    [user.id, form.id, createHash("sha256").update(token).digest("hex")],
  );
  const guest = await guestPrincipal(db, token);
  const draft = await registrationExecute(db, guest, {
    action: "draft",
    formId: form.id!,
    subjectKind: "represented",
    subjectName: "Enfant Lien",
    birthDate: "2015-01-01",
    locale: "fr",
    website: "",
    answers: {},
  });
  const mine = await registrationView(db, guest, false);
  await registrationExecute(db, guest, {
    action: "submit",
    id: draft.id!,
    expectedVersion: mine.applications[0].version,
  });
  const admin = await registrationView(db, president, true);
  expect(
    admin.applications.find((a) => a.id === draft.id)?.applicant_email,
  ).toBe("famille.lien@example.test");
  expect(
    (
      await db.query('SELECT "emailVerified" FROM "user" WHERE id=$1', [
        user.id,
      ])
    ).rows[0].emailVerified,
  ).toBe(true);
  await expect(guestPrincipal(db, "x".repeat(43))).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});

it("lets a parent sign a template document electronically", async () => {
  const tpl = await documentExecute(
    db,
    president,
    {
      action: "template",
      name: "Autorisation",
      locale: "fr",
      body: "J'autorise {organization} à inscrire {name} pour la saison {season}.",
      expectedVersion: 0,
    },
    club,
  );
  await documentExecute(
    db,
    president,
    {
      action: "request",
      profileId: child,
      seasonId: season,
      name: "Autorisation",
      category: "consent",
      sensitive: false,
    },
    club,
  );
  let doc = (
    await db.query("SELECT id,version FROM club_document WHERE profile_id=$1", [
      child,
    ])
  ).rows[0];
  await documentExecute(
    db,
    president,
    {
      action: "generate",
      id: doc.id,
      templateId: tpl.id!,
      expectedVersion: doc.version,
    },
    club,
  );
  const view = await documentView(db, parent);
  const seen = view.documents.find((d) => d.id === doc.id)!;
  expect(seen.canSign).toBe(true);
  expect(
    (await documentView(db, president)).documents.find((d) => d.id === doc.id)
      ?.canSign,
  ).toBe(false);
  doc = (
    await db.query("SELECT id,version FROM club_document WHERE id=$1", [doc.id])
  ).rows[0];
  const png =
    "data:image/png;base64," +
    Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      Buffer.from("signature"),
    ]).toString("base64");
  await documentSign(
    db,
    parent,
    doc.id,
    {
      expectedVersion: doc.version,
      signerName: "Parent Signature",
      signature: png,
      accept: true,
    },
    club,
  );
  const signature = (
    await db.query(
      "SELECT signer_name,text_sha256 FROM document_signature WHERE document_id=$1",
      [doc.id],
    )
  ).rows[0];
  expect(signature.signer_name).toBe("Parent Signature");
  expect(signature.text_sha256).toMatch(/^[0-9a-f]{64}$/);
  const after = (await documentView(db, parent)).documents.find(
    (d) => d.id === doc.id,
  )!;
  expect(after.canSign).toBe(false);
  expect(after.signatures).toHaveLength(1);
  expect(after.status).toBe("uploaded");
});

it("runs licences and classification checks between club and federation", async () => {
  const label = seasonOf(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(
      new Date(),
    ),
  ).label;
  const player = await member("Licencié Test", "2004-04-04");
  await clubLicensesExecute(
    db,
    president,
    { action: "requestLicenses", season: label, profileIds: [player] },
    club,
  );
  const pending = await federationLicensesView(db, fedPresident);
  const request = pending.licenses.find(
    (l) => l.full_name === "Licencié Test",
  )!;
  expect(request.status).toBe("requested");
  await federationLicensesExecute(
    db,
    fedPresident,
    {
      action: "decideLicenses",
      ids: [request.id],
      decision: "active",
      note: "",
    },
    federation,
  );
  const clubView = await clubLicensesView(db, president);
  expect(clubView.players.find((p) => p.id === player)).toMatchObject({
    license_status: "active",
    license_number: label.slice(0, 4) + "-0001",
  });

  await playerProfileExecute(
    db,
    president,
    {
      action: "sport",
      id: player,
      version: 0,
      classification: "PF1",
      classificationValidUntil: null,
      control: "chin",
      sportNotes: "",
    },
    club,
  );
  await clubLicensesExecute(
    db,
    president,
    { action: "requestClassification", profileId: player },
    club,
  );
  await federationLicensesExecute(
    db,
    fedPresident,
    {
      action: "decideClassification",
      profileId: player,
      decision: "validated",
      classification: "PF2",
      validUntil: "2028-06-30",
      note: "",
    },
    federation,
  );
  let sport = (
    await db.query(
      "SELECT classification,classification_status,version FROM player_sport_profile WHERE profile_id=$1",
      [player],
    )
  ).rows[0];
  expect([sport.classification, sport.classification_status]).toEqual([
    "PF2",
    "validated",
  ]);
  // A change made by the club needs a new check.
  await playerProfileExecute(
    db,
    president,
    {
      action: "sport",
      id: player,
      version: sport.version,
      classification: "PF1",
      classificationValidUntil: null,
      control: "chin",
      sportNotes: "",
    },
    club,
  );
  sport = (
    await db.query(
      "SELECT classification_status FROM player_sport_profile WHERE profile_id=$1",
      [player],
    )
  ).rows[0];
  expect(sport.classification_status).toBe("unverified");
});

it("shows the federation's public events to affiliated clubs", async () => {
  const day = brusselsDay(new Date(Date.now() + 10 * 86400000));
  await calendarExecute(
    db,
    fedPresident,
    {
      action: "create",
      title: "Tournoi fédéral test",
      kind: "tournament",
      customType: "",
      timezone: "Europe/Brussels",
      localStart: `${day}T10:00`,
      localEnd: `${day}T17:00`,
      fold: "reject",
      teamId: null,
      placeId: null,
      freeLocation: "Salle test",
      responsibleId: fedPresident.userId,
      visibility: "organization",
      equipment: "",
      instructions: "",
      participants: [],
      documents: [],
      intervalDays: 0,
      occurrences: 1,
      requestId: randomUUID(),
    },
    federation,
  );
  const view = await federalCalendarView(db, president);
  expect(view.federation?.name).toBe("BPCF test");
  expect(view.events.map((e) => [e.title, e.location])).toEqual([
    ["Tournoi fédéral test", "Salle test"],
  ]);
});
