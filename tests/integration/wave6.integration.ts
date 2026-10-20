import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  execute,
  workspace,
  type Principal,
} from "../../src/domains/access/service";
import {
  assertModule,
  governanceExecute,
  governanceView,
  journalView,
} from "../../src/domains/club/governance";
import {
  financeExecute,
  financeView,
} from "../../src/domains/finance/service";
import { duesView } from "../../src/domains/dues/service";
import {
  playerProfileExecute,
  playerProfileView,
} from "../../src/domains/player-profile/service";
import { search } from "../../src/domains/search/service";

const schema = "wave6_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  president: Principal,
  auditor: Principal,
  auditorMandate: string,
  coach: Principal,
  lea: string;

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
      "INSERT INTO organization(name,kind) VALUES('Club vague 6','club') RETURNING id",
    )
  ).rows[0].id;
  president = (await actor(club, "club_president", ["people.sensitive"])).p;
  const a = await actor(club, "coach", ["dues.read"]);
  auditor = a.p;
  auditorMandate = a.mandateId;
  coach = (await actor(club, "coach", ["people.read"])).p;
  const person = (
    await db.query("INSERT INTO person(user_id) VALUES(NULL) RETURNING id")
  ).rows[0].id;
  lea = (
    await db.query(
      "INSERT INTO club_person(organization_id,person_id,full_name,birth_date,directory_roles) VALUES($1,$2,'Léa Dupont','2010-02-02','{player}') RETURNING id",
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

it("switches modules off for the whole club without deleting anything, president only", async () => {
  await expect(
    governanceExecute(db, coach, { action: "modules", disabled: ["finance"] }, club),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await governanceExecute(
    db,
    president,
    { action: "modules", disabled: ["equipment", "finance"] },
    club,
  );
  expect((await governanceView(db, auditor)).disabled).toEqual([
    "finance",
    "equipment",
  ]);
  const w = await workspace(db, auditor);
  expect(w.selected?.disabled_modules).toEqual(["finance", "equipment"]);
  await expect(assertModule(db, auditor, "finance")).rejects.toMatchObject({
    code: "MODULE_OFF",
  });
  await expect(assertModule(db, auditor, "dues")).resolves.toBeUndefined();
  await governanceExecute(db, president, { action: "modules", disabled: [] }, club);
  await expect(assertModule(db, auditor, "finance")).resolves.toBeUndefined();
  const journal = await journalView(db, president, { kind: "rights" });
  expect(journal.rows.filter((r) => r.action === "modules.changed")).toHaveLength(2);
});

it("opens the accounts read-only with dues.read", async () => {
  await financeExecute(
    db,
    president,
    {
      action: "record",
      occurredOn: today(),
      label: "Subside",
      direction: "in",
      category: "other",
      amountCents: 5000,
      method: "transfer",
      counterparty: "",
      reference: "",
      notes: "",
    },
    club,
  );
  const view = await financeView(db, auditor);
  expect(view.can_edit).toBe(false);
  expect(view.entries.map((e) => e.label)).toContain("Subside");
  await expect(
    financeExecute(
      db,
      auditor,
      {
        action: "record",
        occurredOn: today(),
        label: "Refusé",
        direction: "out",
        category: "other",
        amountCents: 100,
        method: "cash",
        counterparty: "",
        reference: "",
        notes: "",
      },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await financeView(db, president)).can_edit).toBe(true);
  const dues = await duesView(db, auditor);
  expect(dues.manage).toBe(false);
  expect(dues.readOnly).toBe(true);
  await expect(financeView(db, coach)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("keeps club profiles within the author's rights and journals grant changes", async () => {
  await expect(
    governanceExecute(
      db,
      coach,
      { action: "saveProfile", name: "Kiné", grants: ["people.read"] },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const saved = await governanceExecute(
    db,
    president,
    { action: "saveProfile", name: "Vérificateur", grants: ["dues.read", "audit.read"] },
    club,
  );
  expect((await governanceView(db, president)).profiles).toMatchObject([
    { name: "Vérificateur", grants: ["dues.read", "audit.read"] },
  ]);
  await execute(db, president, {
    action: "grants",
    id: auditorMandate,
    grants: ["dues.read", "audit.read"],
  });
  const journal = await journalView(db, president, {
    kind: "rights",
    userId: auditor.userId,
  });
  const change = journal.rows.find((r) => r.action === "mandate.grants");
  expect(change?.details).toMatchObject({
    before: ["dues.read"],
    after: ["dues.read", "audit.read"],
  });
  expect(change?.subject).toBe("Test coach");
  await governanceExecute(
    db,
    president,
    { action: "deleteProfile", id: (saved as { id: string }).id },
    club,
  );
  expect((await governanceView(db, president)).profiles).toEqual([]);
});

it("writes a line each time staff read someone's health data", async () => {
  await playerProfileExecute(
    db,
    president,
    {
      action: "support",
      id: lea,
      version: 0,
      supportNeeds: "Aide au transfert",
      safetyNotes: "",
      emergencyContact: "Maman",
    },
    club,
  );
  await playerProfileExecute(
    db,
    president,
    {
      action: "confidential",
      id: lea,
      version: 1,
      impairment: "Amyotrophie spinale",
      medicalNotes: "",
    },
    club,
  );
  const seen = await playerProfileView(db, president, lea);
  expect(seen.confidential?.impairment).toBe("Amyotrophie spinale");
  // A coach without the health grant sees nothing and leaves no line.
  expect((await playerProfileView(db, coach, lea)).confidential).toBeNull();
  const journal = await journalView(db, president, { kind: "health" });
  expect(journal.rows.map((r) => [r.kind, r.subject])).toEqual([
    ["player_health", "Léa Dupont"],
  ]);
  await expect(
    journalView(db, auditor, { kind: "health" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("finds people across accents, only among those the searcher may see", async () => {
  const found = await search(db, coach, "lea");
  expect(found.people.map((p) => p.name)).toEqual(["Léa Dupont"]);
  expect((await search(db, president, "DUPONT")).people).toHaveLength(1);
  expect((await search(db, auditor, "lea")).people).toEqual([]);
});
