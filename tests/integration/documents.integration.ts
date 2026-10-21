import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { processOne } from "../../src/domains/notifications/worker";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  documentExecute,
  documentView,
  documentUpload,
  documentDownload,
  sweepDocuments,
  commandSchema,
} from "../../src/domains/documents/service";
const schema = "docs_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
    max: 10,
  });
type Actor = Principal & { mandateId: string };
let org: string,
  otherOrg: string,
  fed: string,
  season: string,
  admin: Actor,
  player: Actor,
  parent: Actor,
  outsider: Actor,
  federal: Actor,
  profile: string,
  child: string,
  parentProfile: string;
async function actor(
  orgId: string,
  role: string,
  grants: string[] = [],
): Promise<Actor> {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","twoFactorEnabled") VALUES($1,$2,$3,false,true)',
    [userId, "Document user", userId + "@example.test"],
  );
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query(
    'INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')',
    [sessionId, userId, randomUUID()],
  );
  await db.query(
    "INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)",
    [orgId, userId],
  );
  const mandateId = (
    await db.query(
      "INSERT INTO role_assignment(organization_id,user_id,role,grants) VALUES($1,$2,$3,$4) RETURNING id",
      [orgId, userId, role, grants],
    )
  ).rows[0].id;
  const p = { userId, sessionId, mandateId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
async function person(name: string, birth: string, userId?: string) {
  const identity = userId
    ? (await db.query("SELECT id FROM person WHERE user_id=$1", [userId]))
        .rows[0].id
    : (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0]
        .id;
  return (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,$3,$4) RETURNING id",
      [org, identity, name, birth],
    )
  ).rows[0].id as string;
}
function run(p: Principal, input: unknown, orgId = org) {
  return documentExecute(db, p, commandSchema.parse(input), orgId);
}
async function request(overrides: Record<string, unknown> = {}) {
  return (
    await run(admin, {
      action: "request",
      name: "Consentement",
      category: "consent",
      sensitive: false,
      profileId: profile,
      seasonId: season,
      ...overrides,
    })
  ).id as string;
}
async function row(id: string) {
  return (await db.query("SELECT * FROM club_document WHERE id=$1", [id]))
    .rows[0];
}
async function upload(id: string, p: Principal = player, text = "fixture") {
  return documentUpload(
    db,
    p,
    id,
    (await row(id)).version,
    {
      name: "proof.pdf",
      type: "application/pdf",
      bytes: Buffer.from("%PDF-1.7\n" + text),
    },
    org,
  );
}
async function review(
  id: string,
  status = "valid",
  expiresOn: string | null = null,
) {
  return run(admin, {
    action: "review",
    id,
    expectedVersion: (await row(id)).version,
    status,
    message: "Réponse au déposant",
    expiresOn,
  });
}
async function fileId(id: string) {
  return (await row(id)).current_version_id as string;
}
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  org = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club Docs','club') RETURNING id",
    )
  ).rows[0].id;
  otherOrg = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club Other','club') RETURNING id",
    )
  ).rows[0].id;
  fed = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Federation','federation') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026','2026-01-01','2026-12-31') RETURNING id",
      [org],
    )
  ).rows[0].id;
  admin = await actor(org, "club_president");
  player = await actor(org, "player");
  parent = await actor(org, "guardian");
  outsider = await actor(otherOrg, "club_president");
  federal = await actor(fed, "federation_president");
  profile = await person("Adult", "1990-01-02", player.userId);
  parentProfile = await person("Guardian", "1980-01-02", parent.userId);
  child = await person("Child", "2015-01-02");
  await db.query(
    "INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by) VALUES($1,$2,$3,'legal_verified',true,true,'Verified responsibility',$4)",
    [org, parentProfile, child, admin.userId],
  );
});
beforeEach(async () => {
  await db.query(
    "TRUNCATE club_document,document_version,document_rule,document_template,document_task,document_share,document_history CASCADE",
  );
  await db.query(
    "TRUNCATE mail_job,mail_attempt,notification_dispatch,app_notification",
  );
  await db.query(
    "UPDATE role_assignment SET revoked_at=NULL,grants=ARRAY[]::text[]",
  );
  await db.query('UPDATE "user" SET active=true,"twoFactorEnabled"=true');
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    player.userId,
  ]);
  await db.query(
    "UPDATE guardian_relationship SET revoked_at=NULL,can_edit=true",
  );
  await db.query(
    "UPDATE club_person SET status='active',birth_date='2015-01-02' WHERE id=$1",
    [child],
  );
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});
it("lets an unverified player upload and download only their own requested file", async () => {
  const id = await request();
  await upload(id);
  expect((await row(id)).status).toBe("uploaded");
  const f = await documentDownload(db, player, await fileId(id), org);
  expect(f.bytes.toString()).toContain("fixture");
  const content = (
    await db.query(
      "SELECT content_ciphertext FROM document_version WHERE document_id=$1",
      [id],
    )
  ).rows[0].content_ciphertext;
  expect(content).not.toContain("%PDF");
  expect((await documentView(db, player)).documents).toHaveLength(1);
});
it("lets administrators work without a second factor (removed) nor email verification", async () => {
  await db.query('UPDATE "user" SET "twoFactorEnabled"=false WHERE id=$1', [
    admin.userId,
  ]);
  expect(await request()).toBeTruthy();
  await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1', [
    admin.userId,
  ]);
});
it("rejects another club and incorrect active context on every write and download", async () => {
  const id = await request();
  await upload(id);
  await expect(
    documentDownload(db, outsider, await fileId(id), otherOrg),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    run(
      admin,
      {
        action: "review",
        id,
        expectedVersion: 2,
        status: "valid",
        message: "",
        expiresOn: null,
      },
      otherOrg,
    ),
  ).rejects.toMatchObject({ code: "CONTEXT_CHANGED" });
  await expect(
    run(
      outsider,
      {
        action: "review",
        id,
        expectedVersion: 2,
        status: "valid",
        message: "",
        expiresOn: null,
      },
      otherOrg,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("retains historical versions and deduplicates an immediate repeated upload", async () => {
  const id = await request();
  await upload(id);
  await upload(id);
  expect(
    (
      await db.query("SELECT id FROM document_version WHERE document_id=$1", [
        id,
      ])
    ).rowCount,
  ).toBe(1);
  const first = await fileId(id);
  await review(id);
  await upload(id, player, "replacement");
  expect((await row(id)).status).toBe("uploaded");
  expect(
    (await documentDownload(db, player, first, org)).bytes.toString(),
  ).toContain("fixture");
  expect(
    (
      await db.query("SELECT id FROM document_version WHERE document_id=$1", [
        id,
      ])
    ).rowCount,
  ).toBe(2);
});
it("separates deposit, review and validation and requires a file and refusal reason", async () => {
  const id = await request();
  await expect(review(id)).rejects.toMatchObject({ code: "FILE_REQUIRED" });
  await upload(id);
  expect((await row(id)).status).not.toBe("valid");
  await review(id, "review");
  await expect(
    run(admin, {
      action: "review",
      id,
      expectedVersion: 3,
      status: "refused",
      message: "",
      expiresOn: null,
    }),
  ).rejects.toMatchObject({ code: "MESSAGE_REQUIRED" });
  await review(id, "refused");
  await upload(id);
  expect((await row(id)).status).toBe("uploaded");
  await review(id);
  expect(
    (
      await db.query(
        "SELECT reviewed_by,verdict FROM document_version WHERE id=$1",
        [await fileId(id)],
      )
    ).rows[0],
  ).toMatchObject({ reviewed_by: admin.userId, verdict: "valid" });
});
it("rejects an invalid file, stale version and archived upload", async () => {
  const id = await request();
  await expect(
    documentUpload(
      db,
      player,
      id,
      1,
      { name: "x.pdf", type: "application/pdf", bytes: Buffer.from("not pdf") },
      org,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await upload(id);
  await expect(
    documentUpload(
      db,
      player,
      id,
      1,
      {
        name: "x.pdf",
        type: "application/pdf",
        bytes: Buffer.from("%PDF-1.7"),
      },
      org,
    ),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
  await review(id, "archived");
  await expect(upload(id)).rejects.toMatchObject({
    code: "INVALID_TRANSITION",
  });
});
it("allows an authorized parent then revokes immediately and at majority", async () => {
  const id = await request({ profileId: child });
  await upload(id, parent);
  const f = await fileId(id);
  expect(
    (await documentDownload(db, parent, f, org)).bytes.length,
  ).toBeGreaterThan(0);
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  await expect(documentDownload(db, parent, f, org)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await db.query("UPDATE guardian_relationship SET revoked_at=NULL");
  await db.query("UPDATE club_person SET birth_date='2000-01-01' WHERE id=$1", [
    child,
  ]);
  await expect(documentDownload(db, parent, f, org)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("distinguishes guardian read and edit permissions", async () => {
  const id = await request({ profileId: child });
  await upload(id, parent);
  await db.query("UPDATE guardian_relationship SET can_edit=false");
  expect(
    (await documentDownload(db, parent, await fileId(id), org)).bytes.length,
  ).toBeGreaterThan(0);
  await expect(upload(id, parent, "new")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("requires explicit staff sensitive authorization and MFA for fitness documents", async () => {
  await expect(request({ category: "fitness" })).rejects.toMatchObject({
    code: "SENSITIVE_PERMISSION_REQUIRED",
  });
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY['documents.sensitive'] WHERE id=$1",
    [admin.mandateId],
  );
  const id = await request({ category: "fitness", sensitive: false });
  expect((await row(id)).sensitive).toBe(true);
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY[]::text[] WHERE id=$1",
    [admin.mandateId],
  );
  expect((await documentView(db, admin)).documents).toHaveLength(0);
  await expect(upload(id, admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // The player's own document, without a second factor (removed).
  await upload(id, player);
});
it("expires a document once and opens a persistent renewal task", async () => {
  const id = await request();
  await upload(id);
  await review(id);
  await db.query(
    "UPDATE club_document SET expires_on=CURRENT_DATE-1 WHERE id=$1",
    [id],
  );
  expect(await sweepDocuments(db)).toBe(1);
  expect(await sweepDocuments(db)).toBe(0);
  expect((await row(id)).status).toBe("expired");
  expect(
    (
      await db.query(
        "SELECT kind,state FROM document_task WHERE document_id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ kind: "expired", state: "open" });
  expect(
    (
      await db.query(
        "SELECT id FROM document_history WHERE document_id=$1 AND action='expired'",
        [id],
      )
    ).rowCount,
  ).toBe(1);
  await upload(id, player, "renewed");
  await review(id);
  expect(
    (
      await db.query("SELECT state FROM document_task WHERE document_id=$1", [
        id,
      ])
    ).rows[0].state,
  ).toBe("closed");
});
it("shares only an explicitly approved version and denies a revoked share", async () => {
  const id = await request();
  await upload(id);
  expect((await documentView(db, federal)).documents).toHaveLength(0);
  await review(id);
  const share = (
    await run(admin, {
      action: "share",
      id,
      expectedVersion: (await row(id)).version,
      federationId: fed,
      expiresOn: "2026-12-31",
    })
  ).id;
  const f = await fileId(id);
  expect(
    (await documentDownload(db, federal, f, fed)).bytes.length,
  ).toBeGreaterThan(0);
  await run(admin, { action: "revoke", id: share });
  await expect(documentDownload(db, federal, f, fed)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("suspends federation access after replacement or expiration", async () => {
  const id = await request();
  await upload(id);
  await review(id);
  await run(admin, {
    action: "share",
    id,
    expectedVersion: (await row(id)).version,
    federationId: fed,
    expiresOn: "2026-12-31",
  });
  const f = await fileId(id);
  await upload(id, player, "new");
  await expect(documentDownload(db, federal, f, fed)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await review(id);
  await run(admin, {
    action: "share",
    id,
    expectedVersion: (await row(id)).version,
    federationId: fed,
    expiresOn: "2026-12-31",
  });
  await db.query(
    "UPDATE club_document SET expires_on=CURRENT_DATE-1 WHERE id=$1",
    [id],
  );
  await expect(
    documentDownload(db, federal, await fileId(id), fed),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("does not grant sensitive federation access from a general share alone", async () => {
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY['documents.sensitive'] WHERE id=$1",
    [admin.mandateId],
  );
  const id = await request({ category: "fitness" });
  await upload(id, admin);
  await review(id);
  await run(admin, {
    action: "share",
    id,
    expectedVersion: (await row(id)).version,
    federationId: fed,
    expiresOn: "2026-12-31",
  });
  await expect(
    documentDownload(db, federal, await fileId(id), fed),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY['documents.sensitive'] WHERE id=$1",
    [federal.mandateId],
  );
  expect(
    (await documentDownload(db, federal, await fileId(id), fed)).bytes.length,
  ).toBeGreaterThan(0);
});
it("applies age and role rules idempotently and does not prepare a second slot", async () => {
  await run(admin, {
    action: "rule",
    seasonId: season,
    name: "Consentement enfant",
    category: "consent",
    sensitive: false,
    role: "any",
    minAge: 0,
    maxAge: 17,
    active: true,
  });
  expect((await run(admin, { action: "plan", seasonId: season })).count).toBe(
    1,
  );
  expect((await run(admin, { action: "plan", seasonId: season })).count).toBe(
    0,
  );
  const docs = (await db.query("SELECT profile_id,status FROM club_document"))
    .rows;
  expect(docs).toEqual([{ profile_id: child, status: "missing" }]);
});
it("versions plain text templates and traces generated documents", async () => {
  const id = await request();
  const tpl = (
    await run(admin, {
      action: "template",
      name: "Attestation",
      locale: "fr",
      body: "Bonjour {name}, {organization}, {season}, {date}",
      expectedVersion: 0,
    })
  ).id;
  await expect(
    run(admin, {
      action: "template",
      name: "Attestation",
      locale: "fr",
      body: "Stale {name}",
      expectedVersion: 0,
    }),
  ).rejects.toMatchObject({ code: "STALE_VERSION" });
  await expect(
    run(admin, {
      action: "template",
      name: "Bad",
      locale: "fr",
      body: "{secret}",
      expectedVersion: 0,
    }),
  ).rejects.toMatchObject({ code: "INVALID_TEMPLATE" });
  await run(admin, {
    action: "generate",
    id,
    templateId: tpl,
    expectedVersion: 1,
  });
  const file = await documentDownload(db, player, await fileId(id), org);
  expect(file.bytes.toString()).toContain("Bonjour Adult, Club Docs, 2026");
  expect((await row(id)).status).toBe("uploaded");
  expect(
    (
      await db.query(
        "SELECT template_id FROM document_version WHERE document_id=$1",
        [id],
      )
    ).rows[0].template_id,
  ).toBe(tpl);
});
it("rechecks revocation of an administrative mandate and global account activity", async () => {
  const id = await request();
  await upload(id);
  await db.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1", [
    admin.mandateId,
  ]);
  await expect(review(id)).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
  await db.query('UPDATE "user" SET active=false WHERE id=$1', [player.userId]);
  await expect(
    documentDownload(db, player, await fileId(id), org),
  ).rejects.toMatchObject({ code: "CONTEXT_REQUIRED" });
});
it("consumes only document followups and imports an admitted registration file as an unvalidated version", async () => {
  const form = (
    await db.query(
      "INSERT INTO registration_form(organization_id,season_id,title) VALUES($1,$2,'Admitted form') RETURNING id",
      [org, season],
    )
  ).rows[0].id;
  const application = (
    await db.query(
      "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,status,profile_id,submitted_at) VALUES($1,$2,$3,$4,'Adult','1990-01-02','fr','{}','accepted',$5,now()) RETURNING id",
      [org, form, player.userId, season, profile],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO registration_followup(application_id,kind) VALUES($1,'documents'),($1,'dues')",
    [application],
  );
  const attachment = (
    await db.query(
      "INSERT INTO registration_attachment(application_id,field_key,filename,media_type,content) VALUES($1,'consent','admitted.pdf','application/pdf',$2) RETURNING id",
      [application, Buffer.from("%PDF-1.7\noriginal")],
    )
  ).rows[0].id;
  await run(admin, {
    action: "rule",
    name: "Pièce inscription",
    category: "registration",
    seasonId: season,
    sensitive: false,
    role: "any",
    minAge: 0,
    maxAge: 120,
    active: true,
  });
  await run(admin, { action: "plan", seasonId: season });
  const doc = (
    await db.query("SELECT id FROM club_document WHERE profile_id=$1", [
      profile,
    ])
  ).rows[0].id;
  await run(admin, {
    action: "import",
    id: doc,
    attachmentId: attachment,
    expectedVersion: 1,
  });
  expect((await row(doc)).status).toBe("uploaded");
  expect(
    (
      await documentDownload(db, player, await fileId(doc), org)
    ).bytes.toString(),
  ).toContain("original");
  expect(
    (
      await db.query(
        "SELECT kind,state FROM registration_followup WHERE application_id=$1",
        [application],
      )
    ).rows,
  ).toEqual(
    expect.arrayContaining([
      { kind: "documents", state: "processed" },
      { kind: "dues", state: "awaiting_module" },
    ]),
  );
  const another = await request({ profileId: child });
  await expect(
    run(admin, {
      action: "import",
      id: another,
      attachmentId: attachment,
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("lists a populated administrator library without ambiguous joins", async () => {
  const id = await request();
  expect((await documentView(db, admin)).documents[0].id).toBe(id);
  await upload(id);
  await review(id);
  const shared = await run(admin, {
    action: "share",
    id,
    expectedVersion: (await row(id)).version,
    federationId: fed,
    expiresOn: "2026-12-31",
  });
  expect((await documentView(db, admin)).documents[0].shares[0].id).toBe(
    shared.id,
  );
});
it("keeps rule seasons immutable and never downgrades existing sensitive slots", async () => {
  const spec = {
    action: "rule",
    name: "Rule protection",
    category: "consent",
    seasonId: season,
    sensitive: false,
    role: "any",
    minAge: 0,
    maxAge: 120,
    active: true,
  };
  const ruleId = (await run(admin, spec)).id;
  await run(admin, { action: "plan", seasonId: season });
  const next = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2027 rules','2027-01-01','2027-12-31') RETURNING id",
      [org],
    )
  ).rows[0].id;
  await expect(
    run(admin, { ...spec, id: ruleId, expectedVersion: 1, seasonId: next }),
  ).rejects.toMatchObject({ code: "SEASON_IMMUTABLE" });
  await db.query(
    "UPDATE role_assignment SET grants=ARRAY['documents.sensitive'] WHERE id=$1",
    [admin.mandateId],
  );
  await run(admin, {
    ...spec,
    id: ruleId,
    expectedVersion: 1,
    sensitive: true,
  });
  expect(
    (
      await db.query("SELECT sensitive FROM club_document WHERE rule_id=$1", [
        ruleId,
      ])
    ).rows.every((r) => r.sensitive),
  ).toBe(true);
  await run(admin, {
    ...spec,
    id: ruleId,
    expectedVersion: 2,
    sensitive: false,
  });
  expect(
    (
      await db.query("SELECT sensitive FROM club_document WHERE rule_id=$1", [
        ruleId,
      ])
    ).rows.every((r) => r.sensitive),
  ).toBe(true);
});

it("cancels a queued document email when the guardian authorization is revoked", async () => {
  const id = await request({ profileId: child });
  const queued = (
    await db.query(
      "SELECT id FROM mail_job WHERE resource_id=$1 AND recipient_user_id=$2",
      [id, parent.userId],
    )
  ).rows[0].id;
  await db.query("UPDATE mail_job SET state='cancelled' WHERE id<>$1", [
    queued,
  ]);
  await db.query("UPDATE guardian_relationship SET revoked_at=now()");
  expect(
    await processOne(db, {
      mode: "local",
      async send() {
        throw new Error("Must not send");
      },
    }),
  ).toMatchObject({ id: queued, state: "cancelled" });
});
