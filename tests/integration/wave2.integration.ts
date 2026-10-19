import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import {
  financeExecute,
  financeReceiptFile,
  financeReceiptUpload,
  financeReport,
  financeView,
} from "../../src/domains/finance/service";
import { seasonOf } from "../../src/domains/finance/schema";
import { duesExecute } from "../../src/domains/dues/service";
import { remindersView } from "../../src/domains/reminders/service";
import { peopleExecute, peopleView } from "../../src/domains/people/service";
import {
  privacyExecute,
  privacyExport,
  privacyView,
} from "../../src/domains/privacy/service";
import { seal, unseal } from "../../src/domains/notifications/crypto";

const schema = "wave2_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
let club: string,
  season: string,
  team: string,
  president: Principal,
  coach: Principal;

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
const ago = (days: number) => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};
const record = (extra: Record<string, unknown> = {}) => ({
  action: "record" as const,
  occurredOn: today(),
  label: "Opération test",
  direction: "in" as const,
  category: "other" as const,
  amountCents: 1000,
  method: "transfer" as const,
  counterparty: "",
  reference: "",
  notes: "",
  ...extra,
});

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (
    await db.query(
      "INSERT INTO organization(name,kind) VALUES('Club vague 2','club') RETURNING id",
    )
  ).rows[0].id;
  season = (
    await db.query(
      "INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'Saison test',CURRENT_DATE-120,CURRENT_DATE+240) RETURNING id",
      [club],
    )
  ).rows[0].id;
  team = (
    await db.query(
      "INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Équipe A') RETURNING id",
      [club, season],
    )
  ).rows[0].id;
  president = await actor(club, "club_president", ["people.sensitive"]);
  coach = await actor(club, "coach");
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

it("links a dues payment to the ledger and stops reminding for the paid part", async () => {
  const player = await member("Payeur Test", "2008-01-01");
  const plan = await duesExecute(
    db,
    president,
    {
      action: "plan",
      seasonId: season,
      category: "Cotisation joueur",
      amountCents: 25000,
      maxInstallments: 2,
      firstDue: ago(10),
    },
    club,
  );
  await duesExecute(
    db,
    president,
    {
      action: "issue",
      planId: plan.id,
      profileId: player,
      discountCents: 0,
      reason: "",
      installments: 2,
      firstDue: ago(10),
    },
    club,
  );
  const receivable = (
    await db.query("SELECT id FROM dues_receivable WHERE profile_id=$1", [
      player,
    ])
  ).rows[0].id;
  let reminders = await remindersView(db, president);
  expect(
    reminders.dues.find((d) => d.profile_id === player)?.overdueCents,
  ).toBe(12500);
  await expect(
    financeExecute(db, president, record({ receivableId: receivable }), club),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await financeExecute(
    db,
    president,
    record({ category: "dues", amountCents: 12500, receivableId: receivable }),
    club,
  );
  reminders = await remindersView(db, president);
  expect(
    reminders.dues.find((d) => d.profile_id === player)?.overdueCents ?? 0,
  ).toBe(0);
  const view = await financeView(db, president);
  expect(view.receivables.find((r) => r.id === receivable)?.paid_cents).toBe(
    12500,
  );
  expect(view.dues.collected).toBe(12500);
});

it("keeps a season budget and builds the annual report", async () => {
  const label = seasonOf(today()).label;
  await financeExecute(
    db,
    president,
    {
      action: "budget",
      season: label,
      lines: [
        { direction: "out", category: "venue", amountCents: 50000 },
        { direction: "in", category: "subsidy", amountCents: 0 },
      ],
    },
    club,
  );
  await financeExecute(
    db,
    president,
    record({ direction: "out", category: "venue", amountCents: 20000 }),
    club,
  );
  const view = await financeView(db, president);
  expect(view.budget).toEqual([
    { direction: "out", category: "venue", amount_cents: 50000 },
  ]);
  expect(
    view.comparison.find(
      (r) => r.category === "venue" && r.direction === "out",
    ),
  ).toMatchObject({ planned: 50000, actual: 20000, gap: 30000 });
  const report = await financeReport(db, president, label);
  // A link without a season opens the current one.
  expect((await financeReport(db, president, "")).season.label).toMatch(
    /^\d{4}-\d{2}$/,
  );
  expect(report.closing).toBe(report.opening + report.summary.result);
  expect(report.entries.length).toBeGreaterThan(0);
  await expect(financeReport(db, coach, label)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

it("attaches, serves and removes receipts, checking the file signature", async () => {
  const { id } = await financeExecute(db, president, record(), club);
  const pdf = new TextEncoder().encode("%PDF-1.4\n%test\n");
  const receipt = await financeReceiptUpload(
    db,
    president,
    id,
    { name: "facture.pdf", bytes: pdf },
    club,
  );
  const file = await financeReceiptFile(db, president, receipt.id);
  expect(file.media_type).toBe("application/pdf");
  await expect(
    financeReceiptUpload(
      db,
      president,
      id,
      { name: "page.html", bytes: new TextEncoder().encode("<html>") },
      club,
    ),
  ).rejects.toMatchObject({ code: "INVALID_FILE" });
  await financeExecute(
    db,
    president,
    { action: "removeReceipt", id: receipt.id },
    club,
  );
  await expect(
    financeReceiptFile(db, president, receipt.id),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

it("imports team names, parents and coaches from a spreadsheet", async () => {
  const result = await peopleExecute(
    db,
    president,
    {
      action: "importPlayers",
      teamId: null,
      role: "player",
      rows: [
        {
          fullName: "Import Équipe",
          birthDate: "2012-03-04",
          email: "",
          phone: "",
          joinedOn: null,
          position: "",
          jerseyNumber: null,
          team: "équipe a",
          guardianName: "Parent Import",
          guardianEmail: "parent@example.test",
          guardianPhone: "",
        },
        {
          fullName: "Import Sans Équipe",
          birthDate: null,
          email: "",
          phone: "",
          joinedOn: null,
          position: "",
          jerseyNumber: null,
          team: "Équipe Z",
          guardianName: "",
          guardianEmail: "",
          guardianPhone: "",
        },
      ],
    },
    club,
  );
  expect(result).toMatchObject({ created: 2, guardians: 1, unknownTeams: 1 });
  const view = await peopleView(db, president);
  const child = view.profiles.find((p) => p.full_name === "Import Équipe")!;
  expect(child.assignments.map((a) => a.team_id)).toEqual([team]);
  const relation = await db.query(
    "SELECT kind,can_view FROM guardian_relationship WHERE subject_profile_id=$1",
    [child.id],
  );
  expect(relation.rows).toEqual([{ kind: "declared", can_view: false }]);
  await peopleExecute(
    db,
    president,
    {
      action: "importPlayers",
      teamId: team,
      role: "coach",
      rows: [
        {
          fullName: "Coach Importé",
          birthDate: null,
          email: "",
          phone: "",
          joinedOn: null,
          position: "",
          jerseyNumber: null,
          team: "",
          guardianName: "",
          guardianEmail: "",
          guardianPhone: "",
        },
      ],
    },
    club,
  );
  const coachRow = await db.query(
    "SELECT cp.directory_roles,m.role FROM club_person cp JOIN team_membership m ON m.profile_id=cp.id WHERE cp.full_name='Coach Importé'",
  );
  expect(coachRow.rows).toEqual([
    { directory_roles: ["coach"], role: "coach" },
  ]);
});

it("merges a duplicate, re-encrypting confidential notes for the kept profile", async () => {
  const keep = await member("Double Test", "2006-06-06");
  const remove = await member("Double Test", null);
  await db.query(
    "INSERT INTO player_support_profile(profile_id,organization_id,support_needs,confidential_ciphertext) VALUES($1,$2,'Aide au transfert',$3)",
    [
      remove,
      club,
      seal(
        { impairment: "Test", medical_notes: "" },
        "player-health:" + remove,
      ),
    ],
  );
  await db.query(
    "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',CURRENT_DATE-5)",
    [club, team, remove],
  );
  const pairs = (await privacyView(db, president)).duplicates;
  expect(
    pairs.some(
      (x) => [x.a.id, x.b.id].sort().join() === [keep, remove].sort().join(),
    ),
  ).toBe(true);
  await privacyExecute(
    db,
    president,
    { action: "merge", keepId: keep, removeId: remove },
    club,
  );
  const support = (
    await db.query(
      "SELECT confidential_ciphertext FROM player_support_profile WHERE profile_id=$1",
      [keep],
    )
  ).rows[0];
  expect(
    unseal<{ impairment: string }>(
      support.confidential_ciphertext,
      "player-health:" + keep,
    ).impairment,
  ).toBe("Test");
  const moved = await db.query(
    "SELECT 1 FROM team_membership WHERE profile_id=$1",
    [keep],
  );
  expect(moved.rowCount).toBe(1);
  const old = (
    await db.query("SELECT status,merged_into FROM club_person WHERE id=$1", [
      remove,
    ])
  ).rows[0];
  expect(old).toEqual({ status: "archived", merged_into: keep });
  await expect(
    privacyExecute(
      db,
      coach,
      { action: "merge", keepId: keep, removeId: remove },
      club,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("exports then anonymises a former member, and purges old refused applications", async () => {
  const gone = await member("Ancien Membre", "1990-01-01");
  await db.query(
    "INSERT INTO player_support_profile(profile_id,organization_id,emergency_contact) VALUES($1,$2,'Maman 0470')",
    [gone, club],
  );
  const data = await privacyExport(db, president, gone);
  expect(data.person.full_name).toBe("Ancien Membre");
  expect(data.support?.emergency_contact).toBe("Maman 0470");
  await expect(
    privacyExecute(
      db,
      president,
      { action: "anonymize", id: gone, confirmName: "Autre nom" },
      club,
    ),
  ).rejects.toMatchObject({ code: "CONFIRMATION_MISMATCH" });
  await privacyExecute(
    db,
    president,
    { action: "anonymize", id: gone, confirmName: "ancien membre" },
    club,
  );
  const row = (
    await db.query(
      "SELECT full_name,birth_date,anonymized_at FROM club_person WHERE id=$1",
      [gone],
    )
  ).rows[0];
  expect(row.full_name).toMatch(/^Personne anonymisée/);
  expect(row.birth_date).toBeNull();
  expect(
    (
      await db.query(
        "SELECT 1 FROM player_support_profile WHERE profile_id=$1",
        [gone],
      )
    ).rowCount,
  ).toBe(0);

  await privacyExecute(
    db,
    president,
    { action: "settings", formerMemberYears: 2, refusedApplicationMonths: 1 },
    club,
  );
  const form = (
    await db.query(
      "INSERT INTO registration_form(organization_id,season_id,title,published) VALUES($1,$2,'Form',true) RETURNING id",
      [club, season],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,form_snapshot,answers,status,submitted_at,updated_at) VALUES($1,$2,$3,$4,'Refusé Ancien','2010-01-01','fr','{}','{\"address\":\"Rue X\"}','refused',now()-interval '3 months',now()-interval '3 months')",
    [club, form, president.userId, season],
  );
  expect((await privacyView(db, president)).retention.applications).toBe(1);
  const purge = await privacyExecute(
    db,
    president,
    { action: "purgeApplications" },
    club,
  );
  expect(purge).toMatchObject({ count: 1 });
  const app = (
    await db.query(
      "SELECT subject_name,answers FROM registration_application WHERE form_id=$1",
      [form],
    )
  ).rows[0];
  expect(app.subject_name).toMatch(/^Candidature anonymisée/);
  expect(app.answers).toEqual({});
});
