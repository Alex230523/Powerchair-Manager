import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { buildExport, secretColumn } from "../../src/domains/legal/service";

/**
 * Security (06/11/2026), leaked keys and secrets: the club's full export is a
 * file the presidency keeps and passes on (an accountant, a new board). It
 * carried the live link tokens (a public pot, a sponsor's report, an open
 * event, a live match), the sealed national numbers and the hashes. Now no
 * column holding a secret, a token, a sealed value or a hash is written, and
 * a new such column cannot slip in unseen.
 */
const schema = "secsec_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let club: string, user: string;
/** Columns named like a key but holding a fixed code, reviewed: never a secret. */
const reviewedKeys = new Set(["idem_key", "template_key", "system_key", "team_key", "source_key", "dedupe_key", "builtin_key", "event_key", "key", "source_kind"]);

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  club = (await db.query("INSERT INTO organization(name,kind) VALUES('Club A','club') RETURNING id")).rows[0].id;
  user = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [user, "Président", `${user}@example.test`]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("knows every column of a club's tables that holds a secret, a token, a sealed value or a hash", async () => {
  const cols = (
    await db.query(
      `SELECT c.table_name,c.column_name FROM information_schema.columns c
        WHERE c.table_schema=current_schema() AND c.column_name ~* '(token|secret|passw|cipher|seal|hash|key|backup|private|credential)'
          AND c.column_name !~ '^(input|output)_tokens$'
          AND c.table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name='organization_id')`,
    )
  ).rows as { table_name: string; column_name: string }[];
  expect(cols.length).toBeGreaterThan(20);
  const missed = cols.filter((x) => !secretColumn(x.column_name) && !reviewedKeys.has(x.column_name)).map((x) => `${x.table_name}.${x.column_name}`);
  expect(missed).toEqual([]);
  for (const c of ["public_token", "report_token", "token", "live_token", "screenshot_token", "token_sealed", "national_sealed", "national_hash", "key_hash", "email_hash", "secret_sealed", "confidential_ciphertext"]) expect(secretColumn(c), c).toBe(true);
  for (const c of ["name", "full_name", "amount_cents", "event_key", "status"]) expect(secretColumn(c), c).toBe(false);
});

it("writes no live link token, sealed value or hash to the club's export", async () => {
  const potToken = "pot-" + randomUUID().replaceAll("-", ""),
    reportToken = "rep-" + randomUUID().replaceAll("-", ""),
    liveToken = randomUUID().replaceAll("-", "");
  const group = (await db.query("INSERT INTO fundraising_group(organization_id,name,created_by) VALUES($1,'Tournoi',$2) RETURNING id", [club, user])).rows[0].id;
  await db.query("INSERT INTO fundraising_pot(organization_id,group_id,name,goal_cents,public_token,created_by) VALUES($1,$2,'Cagnotte du tournoi',50000,$3,$4)", [club, group, potToken, user]);
  await db.query("INSERT INTO partner(organization_id,name,kind,report_token,created_by) VALUES($1,'Sponsor',$2,$3,$4)", [club, "sponsor", reportToken, user]).catch(async () => {
    await db.query("INSERT INTO partner(organization_id,name,kind,report_token) VALUES($1,'Sponsor','sponsor',$2)", [club, reportToken]);
  });
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27','2026-09-01','2027-06-30') RETURNING id", [club])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [club, season])).rows[0].id;
  await db.query("INSERT INTO match(organization_id,team_id,opponent,kind,starts_at,created_by,live_token) VALUES($1,$2,'Club B','friendly',now(),$3,$4)", [club, team, user, liveToken]);
  const c = await db.connect();
  try {
    const out = await buildExport(c, club);
    const { inflateRawSync } = await import("node:zlib");
    // Every file of the archive, opened (stored or deflated).
    const zipped = Buffer.from(out.bytes);
    const parts: string[] = [];
    for (let i = 0; i + 30 < zipped.length && zipped.readUInt32LE(i) === 0x04034b50; ) {
      const method = zipped.readUInt16LE(i + 8),
        size = zipped.readUInt32LE(i + 18),
        nameLen = zipped.readUInt16LE(i + 26),
        extra = zipped.readUInt16LE(i + 28),
        start = i + 30 + nameLen + extra,
        data = zipped.subarray(start, start + size);
      parts.push((method === 8 ? inflateRawSync(data) : data).toString("utf8"));
      i = start + size;
    }
    const text = parts.join("\n");
    expect(parts.length).toBeGreaterThan(3);
    // The rows are there, their tokens are not.
    expect(text).toContain("Cagnotte du tournoi");
    expect(text).toContain("Aigles");
    for (const t of [potToken, reportToken, liveToken]) expect(text).not.toContain(t);
    const manifest = out.manifest.tables;
    expect(manifest.find((m) => m.table === "fundraising_pot")?.left_out).toContain("public_token");
    expect(manifest.find((m) => m.table === "match")?.left_out).toContain("live_token");
    for (const m of manifest) for (const col of m.columns) expect(secretColumn(col), `${m.table}.${col}`).toBe(false);
  } finally {
    c.release();
  }
});
