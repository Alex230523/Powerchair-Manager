import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  registrationExecute,
  registrationView,
  publicForm,
  attachmentUpload,
  attachmentRead,
  commandSchema,
} from "../../src/domains/registrations/service";
import { processOne } from "../../src/domains/notifications/worker";
import { createTransport } from "../../src/domains/notifications/transport";
const schema = "registration_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
    max: 10,
  });
let org: string,
  otherOrg: string,
  season: string,
  nextSeason: string,
  team: string,
  admin: Principal,
  other: Principal,
  candidate: Principal,
  stranger: Principal,
  formId: string,
  directory: string;
async function actor(
  orgId?: string,
  role = "club_president",
  grants: string[] = [],
) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,true,true)',
    [userId, "Actor " + userId, userId + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  const p = { userId, sessionId };
  if (orgId) {
    await db.query(
      "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
      [orgId, userId],
    );
    const mandate = (
      await db.query(
        "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
        [orgId, userId, role, grants],
      )
    ).rows[0].id;
    await execute(db, p, { action: "context", mandateId: mandate });
  }
  return p;
}
const fields = [
  {
    key: "phone",
    type: "phone",
    label: { fr: "Téléphone", nl: "Telefoon" },
    required: true,
    options: [],
  },
  {
    key: "contact",
    type: "choice",
    label: { fr: "Contact", nl: "Contact" },
    required: true,
    options: ["Email", "Phone"],
  },
  {
    key: "detail",
    type: "text",
    label: { fr: "Précision", nl: "Details" },
    required: true,
    options: [],
    condition: { key: "contact", equals: "Phone" },
  },
  {
    key: "consent",
    type: "consent",
    label: { fr: "Accord", nl: "Toestemming" },
    required: true,
    options: [],
  },
  {
    key: "proof",
    type: "file",
    label: { fr: "Justificatif", nl: "Bewijs" },
    required: false,
    options: [],
  },
];
function run(p: Principal, input: unknown, expectedOrg = org) {
  return registrationExecute(db, p, commandSchema.parse(input), expectedOrg);
}
async function createForm(overrides: Record<string, unknown> = {}) {
  return (
    await run(admin, {
      action: "form",
      seasonId: season,
      title: "Saison pilote",
      description: "Bienvenue",
      fields,
      published: true,
      capacity: null,
      ...overrides,
    })
  ).id as string;
}
async function draft(
  name = "Child " + randomUUID(),
  options: Record<string, unknown> = {},
) {
  return (
    await run(candidate, {
      action: "draft",
      formId,
      subjectName: name,
      birthDate: "2015-02-03",
      locale: "fr",
      answers: { phone: "+32 400 111 222", contact: "Email", consent: true },
      ...options,
    })
  ).id as string;
}
async function row(id: string) {
  return (
    await db.query("SELECT * FROM registration_application WHERE id=$1", [id])
  ).rows[0];
}
async function submit(id: string) {
  return run(candidate, {
    action: "submit",
    id,
    expectedVersion: (await row(id)).version,
  });
}
async function decide(
  id: string,
  status = "accepted",
  options: Record<string, unknown> = {},
) {
  return run(admin, {
    action: "decision",
    id,
    status,
    message: "Bienvenue au club",
    expectedVersion: (await row(id)).version,
    ...options,
  });
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const file of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + file, "utf8"));
  directory = await mkdtemp(join(tmpdir(), "pfm-registration-"));
});
beforeEach(async () => {
  org = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id",
    )
  ).rows[0].id;
  otherOrg = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club B','club') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026','2026-01-01','2026-12-31') RETURNING id",
      [org],
    )
  ).rows[0].id;
  nextSeason = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2027','2027-01-01','2027-12-31') RETURNING id",
      [org],
    )
  ).rows[0].id;
  team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Team A') RETURNING id",
      [org, season],
    )
  ).rows[0].id;
  admin = await actor(org);
  other = await actor(otherOrg);
  candidate = await actor();
  stranger = await actor();
  formId = await createForm();
  await db.query(
    "TRUNCATE mail_attempt,mail_job,app_notification,notification_dispatch",
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
  await rm(directory, { recursive: true, force: true });
});
it("publishes a public form without applicant or club-private data", async () => {
  const f = await publicForm(db, formId);
  expect(f.fields).toHaveLength(5);
  expect(f).not.toHaveProperty("applicant_email");
  expect(f).not.toHaveProperty("organization_id");
});
it("allows unverified accounts while retaining administrative MFA", async () => {
  await db.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1', [
    candidate.userId,
  ]);
  expect(await draft()).toBeTruthy();
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    admin.userId,
  ]);
  await expect(createForm()).rejects.toMatchObject({ code: "MFA_REQUIRED" });
});
it("honours delegated secretary permission and rejects a coach without it", async () => {
  const coach = await actor(org, "coach");
  await expect(registrationView(db, coach, true)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  const secretary = await actor(org, "coach", ["registrations.manage"]);
  expect((await registrationView(db, secretary, true)).forms).toHaveLength(1);
});
it("isolates administrative contexts, applicants and attachment ids", async () => {
  const app = await draft();
  await submit(app);
  await expect(
    run(
      other,
      {
        action: "decision",
        id: app,
        expectedVersion: 2,
        status: "review",
        message: "",
      },
      otherOrg,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (await registrationView(db, stranger, false)).applications,
  ).toHaveLength(0);
  await expect(
    run(stranger, { action: "withdraw", id: app, expectedVersion: 2 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    run(admin, { action: "note", id: app, message: "Private" }, otherOrg),
  ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
});
it("deduplicates double draft creation and repeated submissions", async () => {
  const name = "Same child";
  const results = await Promise.all([draft(name), draft(name)]);
  expect(results[0]).toBe(results[1]);
  await submit(results[0]);
  await expect(submit(results[0])).rejects.toMatchObject({
    code: "INVALID_TRANSITION",
  });
  expect(
    (
      await db.query(
        "SELECT id FROM registration_application WHERE form_id=$1",
        [formId],
      )
    ).rowCount,
  ).toBe(1);
});
it("validates conditional required fields and consent", async () => {
  const app = await draft(undefined, {
    answers: { phone: "12345", contact: "Phone", consent: false },
  });
  await expect(submit(app)).rejects.toMatchObject({ code: "MISSING_FIELDS" });
  await run(candidate, {
    action: "save",
    id: app,
    expectedVersion: 1,
    answers: {
      phone: "12345",
      contact: "Phone",
      detail: "After 18:00",
      consent: true,
    },
  });
  await submit(app);
  expect((await row(app)).status).toBe("submitted");
});
it("snapshots fields and detects stale form edits", async () => {
  const app = await draft();
  await createForm({
    id: formId,
    expectedVersion: 1,
    fields: [
      ...fields,
      {
        key: "extra",
        label: { fr: "Extra", nl: "Extra" },
        type: "text",
        required: true,
        options: [],
      },
    ],
  });
  expect((await row(app)).form_snapshot.fields).toHaveLength(5);
  await submit(app);
  await expect(
    createForm({ id: formId, expectedVersion: 1 }),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
});
it("allows incomplete and resubmission while keeping internal notes private", async () => {
  const app = await draft();
  await submit(app);
  await run(admin, { action: "note", id: app, message: "Private club note" });
  await decide(app, "incomplete", {
    message: "Merci de confirmer le téléphone",
  });
  const mine = await registrationView(db, candidate, false);
  expect(JSON.stringify(mine)).not.toContain("Private club note");
  await run(candidate, {
    action: "save",
    id: app,
    expectedVersion: 3,
    answers: { phone: "12345", contact: "Email", consent: true },
  });
  await submit(app);
  expect((await row(app)).status).toBe("submitted");
  const history = (
    await db.query(
      "SELECT status FROM registration_history WHERE application_id=$1",
      [app],
    )
  ).rows;
  expect(history.filter((r) => r.status === "submitted")).toHaveLength(2);
});
it("requires a reason for refusals and requested complements", async () => {
  const app = await draft();
  await submit(app);
  await expect(decide(app, "refused", { message: "" })).rejects.toMatchObject({
    code: "MESSAGE_REQUIRED",
  });
  await expect(
    decide(app, "incomplete", { message: "No" }),
  ).rejects.toMatchObject({ code: "MESSAGE_REQUIRED" });
  await decide(app, "refused");
  await expect(decide(app)).rejects.toMatchObject({
    code: "INVALID_TRANSITION",
  });
});
it("accepts once, creates a private member and assignment with future followup intents", async () => {
  const app = await draft();
  await submit(app);
  await decide(app, "accepted", { teamId: team });
  const a = await row(app);
  expect(a.profile_id).toBeTruthy();
  expect(
    (
      await db.query("SELECT id FROM team_membership WHERE profile_id=$1", [
        a.profile_id,
      ])
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await db.query(
        "SELECT kind,state FROM registration_followup WHERE application_id=$1",
        [app],
      )
    ).rows,
  ).toEqual(
    expect.arrayContaining([
      { kind: "documents", state: "awaiting_module" },
      { kind: "dues", state: "awaiting_module" },
    ]),
  );
  expect(
    (
      await db.query(
        "SELECT user_id FROM organization_membership WHERE organization_id=$1 AND user_id=$2",
        [org, candidate.userId],
      )
    ).rowCount,
  ).toBe(0);
  await expect(decide(app)).rejects.toMatchObject({
    code: "INVALID_TRANSITION",
  });
});
it("requires selecting a matching existing member and preserves identity", async () => {
  const first = await draft("Known child");
  await submit(first);
  await decide(first);
  const profile = (await row(first)).profile_id;
  const form2 = await createForm({ seasonId: nextSeason });
  const next = await draft("Known child", { formId: form2 });
  await submit(next);
  await expect(decide(next)).rejects.toMatchObject({ code: "MATCH_EXISTING" });
  await decide(next, "accepted", { profileId: profile });
  expect((await row(next)).profile_id).toBe(profile);
  expect(
    (
      await db.query(
        "SELECT id FROM club_person WHERE organization_id=$1 AND full_name='Known child'",
        [org],
      )
    ).rowCount,
  ).toBe(1);
});
it("rejects a second accepted dossier for the same member and season", async () => {
  const first = await draft("Duplicate child");
  await submit(first);
  await decide(first);
  const profile = (await row(first)).profile_id;
  const secondForm = await createForm();
  const second = await draft("Duplicate child", { formId: secondForm });
  await submit(second);
  await expect(
    decide(second, "accepted", { profileId: profile }),
  ).rejects.toMatchObject({ code: "DUPLICATE" });
  expect((await row(second)).status).toBe("submitted");
});
it("serializes capacity admission and supports waiting list promotion", async () => {
  await createForm({ id: formId, expectedVersion: 1, capacity: 1 });
  const one = await draft(),
    two = await draft();
  await submit(one);
  await submit(two);
  const results = await Promise.allSettled([decide(one), decide(two)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const pending = (await row(one)).status === "accepted" ? two : one;
  await decide(pending, "waiting");
  expect((await row(pending)).status).toBe("waiting");
  await createForm({ id: formId, expectedVersion: 2, capacity: 2 });
  await decide(pending);
  expect((await row(pending)).status).toBe("accepted");
});
it("rolls back all acceptance changes for an unauthorized team", async () => {
  const app = await draft();
  await submit(app);
  await expect(
    decide(app, "accepted", { teamId: randomUUID() }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (
      await db.query("SELECT id FROM club_person WHERE organization_id=$1", [
        org,
      ])
    ).rowCount,
  ).toBe(0);
  expect((await row(app)).profile_id).toBeNull();
});
it("allows withdrawal but prevents subsequent decisions", async () => {
  const app = await draft();
  await submit(app);
  await run(candidate, { action: "withdraw", id: app, expectedVersion: 2 });
  expect((await row(app)).status).toBe("withdrawn");
  await expect(decide(app)).rejects.toMatchObject({
    code: "INVALID_TRANSITION",
  });
});
it("keeps renewal history and does not copy consents or files", async () => {
  const first = await draft("Renewed child");
  await submit(first);
  await decide(first);
  const f = await createForm({ seasonId: nextSeason });
  const next = await draft("Renewed child", {
    formId: f,
    priorId: first,
    answers: {},
  });
  const a = await row(next);
  expect(a.prior_application_id).toBe(first);
  expect(a.answers.phone).toBe("+32 400 111 222");
  expect(a.answers.consent).toBeUndefined();
  expect((await row(first)).status).toBe("accepted");
  await expect(submit(next)).rejects.toMatchObject({ code: "MISSING_FIELDS" });
});
it("protects and validates actual attachments and required file questions", async () => {
  await createForm({
    id: formId,
    expectedVersion: 1,
    fields: fields.map((f) =>
      f.key === "proof" ? { ...f, required: true } : f,
    ),
  });
  const app = await draft();
  await expect(submit(app)).rejects.toMatchObject({ code: "MISSING_FIELDS" });
  await expect(
    attachmentUpload(db, candidate, app, "proof", 1, {
      name: "bad.pdf",
      type: "application/pdf",
      bytes: Buffer.from("not-pdf"),
    }),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await attachmentUpload(db, candidate, app, "proof", 1, {
    name: "proof.pdf",
    type: "application/pdf",
    bytes: Buffer.from("%PDF-1.7\nfixture"),
  });
  const file = (
    await db.query(
      "SELECT id FROM registration_attachment WHERE application_id=$1",
      [app],
    )
  ).rows[0].id;
  await expect(attachmentRead(db, admin, file, org)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(
    (await attachmentRead(db, candidate, file)).content.toString(),
  ).toContain("%PDF-");
  await expect(attachmentRead(db, stranger, file)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(attachmentRead(db, other, file, otherOrg)).rejects.toMatchObject(
    { code: "NOT_FOUND" },
  );
  await submit(app);
  await expect(
    attachmentUpload(db, candidate, app, "proof", 3, {
      name: "proof.pdf",
      type: "application/pdf",
      bytes: Buffer.from("%PDF-1.7"),
    }),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});
it("closes public intake without deleting existing applications", async () => {
  const app = await draft();
  await createForm({ id: formId, expectedVersion: 1, published: false });
  await expect(publicForm(db, formId)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(submit(app)).rejects.toMatchObject({ code: "FORM_CLOSED" });
  expect(
    (await registrationView(db, candidate, false)).applications,
  ).toHaveLength(1);
});
it("notifies an applicant with no club membership through the real local queue", async () => {
  const app = await draft();
  await submit(app);
  const queued = (
    await db.query(
      "SELECT * FROM mail_job WHERE kind='registration_update' AND resource_id=$1",
      [app],
    )
  ).rows;
  expect(queued).toHaveLength(1);
  expect(queued[0].recipient_user_id).toBe(candidate.userId);
  const transport = createTransport({
    ...process.env,
    MAIL_TRANSPORT: "local",
    PFM_MAIL_DIR: directory,
  });
  expect(await processOne(db, transport)).toMatchObject({ state: "local" });
  const captured = JSON.parse(
    await readFile(join(directory, queued[0].id + ".json"), "utf8"),
  );
  expect(captured.text).not.toContain("2015-02-03");
  expect(captured.url).toContain("/fr/registrations/mine");
});
it("rejects bot honeypots and excessive creation while preserving a valid draft", async () => {
  await expect(draft(undefined, { website: "bot" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await draft();
  await db.query("UPDATE registration_rate SET count=20 WHERE user_id=$1", [
    candidate.userId,
  ]);
  await expect(draft()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(
    (await registrationView(db, candidate, false)).applications,
  ).toHaveLength(1);
});
it("denies revoked administrative mandates immediately", async () => {
  const app = await draft();
  await submit(app);
  await db.query(
    "UPDATE role_assignment SET revoked_at=now() WHERE organization_id=$1 AND user_id=$2",
    [org, admin.userId],
  );
  await expect(decide(app)).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
  await expect(registrationView(db, admin, true)).rejects.toMatchObject({
    code: "CONTEXT_REQUIRED",
  });
});
it("reuses the authenticated adult identity without requiring a parent or adding mandates", async () => {
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    candidate.userId,
  ]);
  const app = await draft("Autonomous adult", {
    subjectKind: "self",
    birthDate: "1990-03-04",
  });
  await submit(app);
  await decide(app);
  const profile = (await row(app)).profile_id;
  const linked = (
    await db.query(
      "SELECT p.user_id FROM club_person c JOIN person p ON p.id=c.person_id WHERE c.id=$1",
      [profile],
    )
  ).rows[0];
  expect(linked.user_id).toBe(candidate.userId);
  expect(
    (
      await db.query("SELECT id FROM person WHERE user_id=$1", [
        candidate.userId,
      ])
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await db.query("SELECT id FROM role_assignment WHERE user_id=$1", [
        candidate.userId,
      ])
    ).rowCount,
  ).toBe(0);
});
it("accepts renewal using the same profile and cannot substitute a different identity", async () => {
  const first = await draft("Renewal profile");
  await submit(first);
  await decide(first);
  const oldProfile = (await row(first)).profile_id;
  const form = await createForm({ seasonId: nextSeason });
  const next = await draft("Renewal profile", {
    formId: form,
    priorId: first,
    answers: { phone: "12345", contact: "Email", consent: true },
  });
  await submit(next);
  await expect(
    decide(next, "accepted", { profileId: randomUUID() }),
  ).rejects.toMatchObject({ code: "IDENTITY_MISMATCH" });
  await decide(next);
  expect((await row(next)).profile_id).toBe(oldProfile);
  expect(
    (
      await db.query("SELECT id FROM club_person WHERE organization_id=$1", [
        org,
      ])
    ).rowCount,
  ).toBe(1);
});
it("lets the applicant correct a draft identity and rejects stale concurrent edits", async () => {
  const app = await draft("Typo child");
  await run(candidate, {
    action: "save",
    id: app,
    expectedVersion: 1,
    subjectName: "Corrected child",
    birthDate: "2014-05-06",
    answers: { phone: "12345", contact: "Email", consent: true },
  });
  const edited = await row(app);
  expect(edited.subject_name).toBe("Corrected child");
  await expect(
    run(candidate, {
      action: "save",
      id: app,
      expectedVersion: 1,
      answers: {},
    }),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
  await submit(app);
  await expect(
    run(candidate, {
      action: "save",
      id: app,
      expectedVersion: 3,
      answers: {},
    }),
  ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
});
it("keeps an unsubmitted or withdrawn draft invisible to the club and excludes hidden files at submission", async () => {
  const optionalFields = [
    ...fields,
    {
      key: "conditional_file",
      type: "file",
      label: { fr: "Pièce conditionnelle", nl: "Voorwaardelijk bestand" },
      required: false,
      options: [],
      condition: { key: "contact", equals: "Phone" },
    },
  ];
  await createForm({ id: formId, expectedVersion: 1, fields: optionalFields });
  const app = await draft();
  await attachmentUpload(db, candidate, app, "conditional_file", 1, {
    name: "private.pdf",
    type: "application/pdf",
    bytes: Buffer.from("%PDF-1.7\nprivate"),
  });
  const attachment = (
    await db.query(
      "SELECT id FROM registration_attachment WHERE application_id=$1",
      [app],
    )
  ).rows[0].id;
  expect((await registrationView(db, admin, true)).applications).toHaveLength(
    0,
  );
  await expect(
    attachmentRead(db, admin, attachment, org),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await submit(app);
  expect(
    (
      await db.query(
        "SELECT id FROM registration_attachment WHERE application_id=$1",
        [app],
      )
    ).rowCount,
  ).toBe(0);
  const withdrawn = await draft();
  await run(candidate, {
    action: "withdraw",
    id: withdrawn,
    expectedVersion: 1,
  });
  expect((await registrationView(db, admin, true)).applications).toHaveLength(
    1,
  );
  await expect(
    run(admin, {
      action: "note",
      id: withdrawn,
      message: "Should not see this",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
