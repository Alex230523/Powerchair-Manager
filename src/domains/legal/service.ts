import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { isLocale, type Locale } from "../../lib/locale";
import { zip } from "../../lib/xlsx";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { unseal } from "../notifications/crypto";
import { storageAdapter } from "../../lib/storage-adapter";
import { brusselsToday } from "../people/service";
import { DPA_VERSION, dpaPlain, subprocessors } from "./texts";
import { careCommand, keptTables, retentionBounds, type CareCommand, type RetentionCategory } from "./schema";
import { duplicatesSql } from "../console/service";
export { careCommand };

/**
 * 21: what a club needs once the operator processes its data for it. The
 * processing agreement accepted by the presidency (a new version asks
 * again), the full export, the closure after 30 days with its certificate,
 * the people's requests sent to the club responsible, the retention periods
 * and their purge, and the « Sécurité et données » page.
 */
type Scope = { c: PoolClient; org: string; orgName: string; userId: string; president: boolean; privacy: boolean };
async function scope<T>(db: Pool, p: Principal, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    const rights = permissions(a.role as never, a.grants as never) as string[];
    const president = a.role === "club_president";
    const privacy = president || rights.includes("audit.read") || rights.includes("mandates.manage");
    if (!privacy) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, orgName: a.organization_name, userId: p.userId, president, privacy });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const needPresident = (s: Scope) => {
  if (!s.president) throw new AccessError("FORBIDDEN");
};
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/* ------------------------------------------------------------ The agreement */
export async function dpaState(c: PoolClient | Pool, org: string) {
  const o = (await c.query("SELECT dpa_required FROM organization WHERE id=$1", [org])).rows[0];
  const last = (
    await c.query('SELECT a.version,a.accepted_at,u.name AS accepted_by FROM club_dpa_acceptance a JOIN "user" u ON u.id=a.accepted_by WHERE a.organization_id=$1 ORDER BY a.version DESC LIMIT 1', [org])
  ).rows[0] as { version: string; accepted_at: string; accepted_by: string } | undefined;
  const required = !!o?.dpa_required || !!last;
  return { current: DPA_VERSION, required, accepted: last ?? null, upToDate: !required || last?.version === DPA_VERSION };
}
/** Members are invited into a club only once its presidency accepted the agreement in force. */
export async function requireDpa(c: PoolClient, org: string) {
  const kind = (await c.query("SELECT kind FROM organization WHERE id=$1", [org])).rows[0]?.kind;
  if (kind !== "club") return;
  if (!(await dpaState(c, org)).upToDate) throw new AccessError("DPA_REQUIRED", 409);
}

/* ------------------------------------------------------------ Retention */
async function retentionOf(c: PoolClient | Pool, org: string) {
  const rows = (await c.query("SELECT category,months FROM retention_setting WHERE organization_id=$1", [org])).rows as { category: RetentionCategory; months: number }[];
  return Object.fromEntries(Object.entries(retentionBounds).map(([k, b]) => [k, rows.find((r) => r.category === k)?.months ?? b.default])) as Record<RetentionCategory, number>;
}
/** The planned purge of one club; each category's count goes to the journal. */
export async function purgeClub(c: PoolClient, org: string) {
  const months = await retentionOf(c, org);
  const counts: Record<string, number> = {};
  counts.notifications = (await c.query("DELETE FROM app_notification WHERE organization_id=$1 AND created_at<now()-make_interval(months=>$2)", [org, months.notifications])).rowCount ?? 0;
  counts.sensitive_access = (await c.query("DELETE FROM sensitive_access_log WHERE organization_id=$1 AND created_at<now()-make_interval(months=>$2)", [org, months.sensitive_access])).rowCount ?? 0;
  counts.audit = (await c.query("DELETE FROM audit_log WHERE organization_id=$1 AND created_at<now()-make_interval(months=>$2)", [org, months.audit])).rowCount ?? 0;
  // A sensitive document expired for longer than the period: its versions and itself.
  const old = (
    await c.query("SELECT id FROM club_document WHERE organization_id=$1 AND sensitive AND expires_on IS NOT NULL AND expires_on<CURRENT_DATE-make_interval(months=>$2)", [org, months.health_documents])
  ).rows.map((r) => r.id as string);
  for (const id of old) await deleteRows(c, "club_document", "id=$1", [id]);
  counts.health_documents = old.length;
  for (const [category, removed] of Object.entries(counts))
    if (removed) await c.query("INSERT INTO retention_purge(organization_id,category,removed) VALUES($1,$2,$3)", [org, category, removed]);
  return counts;
}
export async function retentionTick(db: Pool) {
  const clubs = (await db.query("SELECT id FROM organization WHERE kind='club' AND closed_at IS NULL")).rows.map((r) => r.id as string);
  let n = 0;
  for (const org of clubs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const counts = await purgeClub(c, org);
      await c.query("COMMIT");
      n += Object.values(counts).reduce((a, b) => a + b, 0);
    } catch {
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
  }
  return n;
}

/* ------------------------------------------------------------ Structure of the data */
type Fk = { child: string; col: string; parent: string; pcol: string };
async function foreignKeys(c: PoolClient) {
  return (
    await c.query(
      `SELECT c.conrelid::regclass::text AS child,a.attname AS col,c.confrelid::regclass::text AS parent,af.attname AS pcol
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
         JOIN pg_attribute af ON af.attrelid=c.confrelid AND af.attnum=c.confkey[1]
        WHERE c.contype='f' AND cardinality(c.conkey)=1 AND c.connamespace=(SELECT oid FROM pg_namespace WHERE nspname=current_schema())`,
    )
  ).rows.map((r) => ({ ...r, child: String(r.child).replace(/"/g, ""), parent: String(r.parent).replace(/"/g, "") })) as Fk[];
}
/** Every table of the schema with an organization_id. */
async function clubTables(c: PoolClient) {
  return (
    await c.query(
      `SELECT k.table_name FROM information_schema.columns k JOIN information_schema.tables t ON t.table_schema=k.table_schema AND t.table_name=k.table_name AND t.table_type='BASE TABLE'
        WHERE k.table_schema=current_schema() AND k.column_name='organization_id' AND k.table_name<>'organization' ORDER BY k.table_name`,
    )
  ).rows.map((r) => r.table_name as string);
}
const ident = (t: string) => `"${t.replace(/"/g, "")}"`;
let fkCache: Fk[] | null = null;
/**
 * Deletes rows and, first, the rows of other tables that point at them
 * (never a kept table: then the row stays). Returns how many went.
 */
async function deleteRows(c: PoolClient, table: string, where: string, params: unknown[], depth = 0, counts: Record<string, number> = {}): Promise<number> {
  fkCache ??= await foreignKeys(c);
  for (const fk of fkCache.filter((f) => f.parent === table && f.child !== table)) {
    if (keptTables.includes(fk.child) || depth > 6) continue;
    await deleteRows(c, fk.child, `${ident(fk.col)} IN (SELECT ${ident(fk.pcol)} FROM ${ident(table)} WHERE ${where})`, params, depth + 1, counts);
  }
  await c.query("SAVEPOINT del");
  try {
    const n = (await c.query(`DELETE FROM ${ident(table)} WHERE ${where}`, params)).rowCount ?? 0;
    await c.query("RELEASE SAVEPOINT del");
    if (n) counts[table] = (counts[table] ?? 0) + n;
    return n;
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT del");
    if ((e as { code?: string }).code !== "23503") throw e;
    // Some rows are held by a kept table (the accounting): the others go one by one.
    if (depth > 0 || !(await c.query("SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name='id'", [table])).rowCount) return 0;
    let n = 0;
    for (const r of (await c.query(`SELECT id FROM ${ident(table)} WHERE ${where}`, params)).rows) {
      await c.query("SAVEPOINT one");
      try {
        n += (await c.query(`DELETE FROM ${ident(table)} WHERE id=$1`, [r.id])).rowCount ?? 0;
        await c.query("RELEASE SAVEPOINT one");
      } catch (err) {
        await c.query("ROLLBACK TO SAVEPOINT one");
        if ((err as { code?: string }).code !== "23503") throw err;
      }
    }
    if (n) counts[table] = (counts[table] ?? 0) + n;
    return n;
  }
}

/* ------------------------------------------------------------ Export */
/** A column that holds a secret, a token, a sealed value or a hash: never written to an export. */
export const secretColumn = (name: string) => /token|secret|password|passwd|ciphertext|sealed|_hash$|^hash$|backup_?codes/i.test(name);
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const binary = (v: unknown) => Buffer.isBuffer(v);
/** The whole club: one CSV and one JSON per table, a manifest, and the files. */
export async function buildExport(c: PoolClient, org: string) {
  const enc = new TextEncoder();
  const entries: { name: string; data: Uint8Array }[] = [];
  const manifest: { table: string; rows: number; columns: string[]; left_out: string[] }[] = [];
  for (const table of await clubTables(c)) {
    if (table === "club_export") continue;
    const rows = (await c.query(`SELECT * FROM ${ident(table)} WHERE organization_id=$1`, [org])).rows as Record<string, unknown>[];
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    // Binary and encrypted columns are not readable: the files come apart, the secrets never.
    // Security (06/11/2026): no live link token either (a public pot, a sponsor's report, an open
    // event, a live match), no sealed value (national numbers) and no hash (keys, e-mail addresses).
    const left = columns.filter((k) => secretColumn(k) || rows.some((r) => binary(r[k])));
    const kept = columns.filter((k) => !left.includes(k));
    entries.push({ name: `data/${table}.csv`, data: enc.encode([kept.join(","), ...rows.map((r) => kept.map((k) => csvCell(r[k])).join(","))].join("\n") + "\n") });
    entries.push({ name: `data/${table}.json`, data: enc.encode(JSON.stringify(rows.map((r) => Object.fromEntries(kept.map((k) => [k, r[k]]))), null, 1)) });
    manifest.push({ table, rows: rows.length, columns: kept, left_out: left });
  }
  // The documents' files, in clear.
  const versions = (
    await c.query("SELECT v.id,v.filename,v.sequence,v.content_ciphertext,d.id AS document_id FROM document_version v JOIN club_document d ON d.id=v.document_id WHERE d.organization_id=$1", [org])
  ).rows;
  for (const v of versions) {
    try {
      const body = unseal<{ data: string }>(await storageAdapter().get("document:" + v.id, v.content_ciphertext), "document:" + v.id);
      entries.push({ name: `files/documents/${v.document_id}-${v.sequence}-${String(v.filename).replace(/[^\p{L}\p{N}._-]/gu, "_")}`, data: Buffer.from(body.data, "base64") });
    } catch {
      /* A version the key cannot open is listed in the manifest only. */
    }
  }
  for (const d of (await c.query("SELECT exercise_id,media_type,content FROM exercise_diagram WHERE organization_id=$1", [org])).rows)
    entries.push({ name: `files/exercises/${d.exercise_id}.${String(d.media_type).split("/")[1]}`, data: d.content });
  const readme = {
    generated_at: new Date().toISOString(),
    organization_id: org,
    format: "One CSV (comma separated, UTF-8) and one JSON per table in data/; the files in files/. Binary and encrypted columns are left out of the tables and listed in left_out.",
    tables: manifest,
    files: entries.filter((e) => e.name.startsWith("files/")).length,
  };
  entries.unshift({ name: "README.json", data: enc.encode(JSON.stringify(readme, null, 1)) });
  return { bytes: zip(entries), manifest: readme };
}
/** Builds the exports asked for (background job). */
export async function exportTick(db: Pool) {
  const pending = (await db.query("SELECT id,organization_id FROM club_export WHERE status='pending' ORDER BY requested_at LIMIT 3")).rows as { id: string; organization_id: string }[];
  for (const x of pending) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const r = await buildExport(c, x.organization_id);
      await c.query("UPDATE club_export SET status='ready',content=$2,size_bytes=$3,manifest=$4,ready_at=now(),expires_at=now()+interval '7 days' WHERE id=$1", [
        x.id,
        Buffer.from(r.bytes),
        r.bytes.length,
        JSON.stringify(r.manifest),
      ]);
      await c.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id) SELECT organization_id,requested_by,'club.export_ready',id FROM club_export WHERE id=$1", [x.id]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      await db.query("UPDATE club_export SET status='failed',error=$2 WHERE id=$1", [x.id, String((e as Error).message).slice(0, 300)]);
    } finally {
      c.release();
    }
  }
  await db.query("UPDATE club_export SET status='expired',content=NULL WHERE status='ready' AND expires_at<now()");
  return pending.length;
}
/** The archive, for the presidency of the club, through its temporary link. */
export async function exportDownload(db: Pool, p: Principal, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AccessError("NOT_FOUND", 404);
  return scope(db, p, async (s) => {
    needPresident(s);
    const x = (await s.c.query("SELECT id,content FROM club_export WHERE token_hash=$1 AND organization_id=$2 AND status='ready' AND expires_at>now()", [sha(token), s.org])).rows[0];
    if (!x?.content) throw new AccessError("NOT_FOUND", 404);
    await s.c.query("UPDATE club_export SET downloaded_at=now() WHERE id=$1", [x.id]);
    await audit(s.c, s.org, s.userId, "club.export_downloaded", x.id);
    return { bytes: x.content as Buffer, name: `export-${s.orgName.replace(/[^\p{L}\p{N}]+/gu, "-")}-${brusselsToday()}.zip` };
  });
}

/* ------------------------------------------------------------ Closure */
/** Deletes everything of the club but its accounting (and the closure itself); people kept by it are anonymised. */
export async function closeClub(c: PoolClient, org: string) {
  fkCache = null;
  const counts: Record<string, number> = {};
  const tables = (await clubTables(c)).filter((t) => !keptTables.includes(t));
  // Security (07/11/2026): the journals refuse any deletion before twelve months, except in this
  // transaction, the closure the club asked for 30 days ago (db/migrations/0142).
  await c.query("SET LOCAL pfm.journal_purge = 'club'");
  for (let pass = 0; pass < 4; pass++) for (const t of tables) await deleteRows(c, t, "organization_id=$1", [org], 0, counts);
  // The people the accounting still points at keep no name, no birth date, no address.
  const anonymised =
    (
      await c.query(
        "UPDATE club_person SET full_name='Personne supprimée',birth_date=NULL,email=NULL,phone='',anonymized_at=COALESCE(anonymized_at,now()) WHERE organization_id=$1",
        [org],
      )
    ).rowCount ?? 0;
  const left = [];
  for (const t of await clubTables(c)) {
    const n = Number((await c.query(`SELECT count(*)::int AS n FROM ${ident(t)} WHERE organization_id=$1`, [org])).rows[0].n);
    if (n) left.push({ table: t, rows: n });
  }
  await c.query("UPDATE organization SET closed_at=now() WHERE id=$1", [org]);
  return { deleted: counts, anonymised_people: anonymised, kept: left, kept_reason: "accounting and the closure record, as the law requires" };
}
export async function closureTick(db: Pool) {
  const due = (await db.query("SELECT id,organization_id FROM club_termination WHERE cancelled_at IS NULL AND completed_at IS NULL AND effective_on<=$1::date", [brusselsToday()])).rows as {
    id: string;
    organization_id: string;
  }[];
  for (const x of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const certificate = { closure_id: x.id, organization_id: x.organization_id, completed_at: new Date().toISOString(), ...(await closeClub(c, x.organization_id)) };
      await c.query("UPDATE club_termination SET completed_at=now(),certificate=$2 WHERE id=$1", [x.id, JSON.stringify(certificate)]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      // Tried again at the next run; the reason stays visible to the operator.
      console.error("club closure failed", x.id, e instanceof Error ? e.name : "unknown");
    } finally {
      c.release();
    }
  }
  return due.length;
}

/* ------------------------------------------------------------ Requests of the people */
/** A person asks the club that holds the data (access, rectification, erasure); the presidency is told. */
export async function dataRequestCreate(db: Pool, p: Principal, input: { organizationId: string; kind: "access" | "rectification" | "erasure"; details: string }) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await account(c, p);
    const member = (
      await c.query(
        `SELECT o.id,o.name,(SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE pe.user_id=$2 AND cp.organization_id=o.id LIMIT 1) AS profile_id
           FROM organization o JOIN organization_membership m ON m.organization_id=o.id AND m.user_id=$2 WHERE o.id=$1 AND o.kind='club'`,
        [input.organizationId, p.userId],
      )
    ).rows[0];
    if (!member) throw new AccessError("NOT_FOUND", 404);
    const id = (
      await c.query("INSERT INTO data_request(organization_id,requester_id,profile_id,kind,details,due_on) VALUES($1,$2,$3,$4,$5,CURRENT_DATE+30) RETURNING id", [
        member.id,
        p.userId,
        member.profile_id,
        input.kind,
        input.details,
      ])
    ).rows[0].id as string;
    const presidents = (
      await c.query(
        `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
          WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())`,
        [member.id],
      )
    ).rows;
    const words = {
      fr: { title: "Une demande sur les données personnelles", message: "Un membre a fait une demande d'accès, de rectification ou d'effacement. Répondez dans les 30 jours." },
      nl: { title: "Een verzoek over persoonsgegevens", message: "Een lid heeft een verzoek tot inzage, verbetering of verwijdering ingediend. Antwoord binnen 30 dagen." },
      en: { title: "A request about personal data", message: "A member asked for access, rectification or erasure. Answer within 30 days." },
    };
    for (const u of presidents) {
      const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
      await publish(c, {
        organizationId: member.id,
        userId: u.id,
        email: u.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: `data_request:${id}`,
        eventKey: `data_request:${id}:${u.id}`,
        locale,
        variables: { name: u.name, title: words[locale].title, message: words[locale].message, organization: member.name, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/settings/journals#security` },
      });
    }
    await audit(c, member.id, p.userId, "privacy.request_received", id);
    await c.query("COMMIT");
    return { ok: true as const, id, organizationId: member.id as string };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** A person's own requests and the clubs they may write to. */
export async function myDataRequests(db: Pool, p: Principal) {
  const clubs = (
    await db.query("SELECT o.id,o.name FROM organization o JOIN organization_membership m ON m.organization_id=o.id AND m.user_id=$1 AND m.active WHERE o.kind='club' AND o.closed_at IS NULL ORDER BY o.name", [p.userId])
  ).rows as { id: string; name: string }[];
  const requests = (
    await db.query(
      "SELECT r.id,r.kind,r.status,r.details,r.response,r.created_at,r.due_on::text AS due_on,r.certificate_number,o.name AS club FROM data_request r JOIN organization o ON o.id=r.organization_id WHERE r.requester_id=$1 ORDER BY r.created_at DESC LIMIT 50",
      [p.userId],
    )
  ).rows;
  return { clubs, requests };
}

/* ------------------------------------------------------------ « Sécurité et données » */
export async function securityView(db: Pool, p: Principal) {
  return scope(db, p, async (s) => {
    const dpa = await dpaState(s.c, s.org);
    const access = (
      await s.c.query(
        `SELECT r.role,r.grants,u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id
          WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND (r.role IN ('club_president','coach') OR cardinality(r.grants)>0)
          ORDER BY r.role,u.name LIMIT 200`,
        [s.org],
      )
    ).rows as { role: string; grants: string[]; name: string }[];
    const health = (
      await s.c.query(
        'SELECT l.kind,l.created_at,u.name AS actor,cp.full_name AS person FROM sensitive_access_log l JOIN "user" u ON u.id=l.actor_id LEFT JOIN club_person cp ON cp.id=l.profile_id WHERE l.organization_id=$1 ORDER BY l.created_at DESC LIMIT 20',
        [s.org],
      )
    ).rows as { kind: string; created_at: string; actor: string; person: string | null }[];
    const retention = await retentionOf(s.c, s.org);
    const purges = (await s.c.query("SELECT category,removed,run_at FROM retention_purge WHERE organization_id=$1 ORDER BY run_at DESC LIMIT 20", [s.org])).rows;
    const exports = (
      await s.c.query('SELECT x.id,x.status,x.requested_at,x.ready_at,x.expires_at,x.size_bytes,x.downloaded_at,u.name AS requested_by FROM club_export x JOIN "user" u ON u.id=x.requested_by WHERE x.organization_id=$1 ORDER BY x.requested_at DESC LIMIT 10', [s.org])
    ).rows as { id: string; status: string; requested_at: string; ready_at: string | null; expires_at: string | null; size_bytes: number | null; downloaded_at: string | null; requested_by: string }[];
    const closure = ((await s.c.query("SELECT id,requested_at,effective_on::text AS effective_on,reason FROM club_termination WHERE organization_id=$1 AND cancelled_at IS NULL AND completed_at IS NULL", [s.org])).rows[0] ??
      null) as { id: string; requested_at: string; effective_on: string; reason: string } | null;
    const requests = (
      await s.c.query(
        `SELECT r.id,r.kind,r.status,r.details,r.response,r.created_at,r.due_on::text AS due_on,r.certificate_number,u.name AS requester,cp.full_name AS person
           FROM data_request r JOIN "user" u ON u.id=r.requester_id LEFT JOIN club_person cp ON cp.id=r.profile_id WHERE r.organization_id=$1 ORDER BY r.status IN ('done','refused'),r.due_on LIMIT 100`,
        [s.org],
      )
    ).rows as { id: string; kind: string; status: string; details: string; response: string; created_at: string; due_on: string; certificate_number: string | null; requester: string; person: string | null }[];
    // Console, series D: the profiles that probably exist in another club under another identity (same name, same birth date).
    const duplicates = (await s.c.query(duplicatesSql, [s.org])).rows as { id: string; full_name: string }[];
    return { organization_id: s.org, can: { president: s.president }, dpa, hosting: { region: "UE", subprocessors }, access, health, retention, bounds: retentionBounds, purges, exports, closure, requests, duplicates };
  });
}

export async function careExecute(db: Pool, p: Principal, command: CareCommand, expected?: string) {
  return scope(
    db,
    p,
    async (s) => {
      switch (command.action) {
        case "acceptDpa": {
          needPresident(s);
          if (command.version !== DPA_VERSION) throw new AccessError("STALE_VERSION", 409);
          await s.c.query("INSERT INTO club_dpa_acceptance(organization_id,version,text_sha256,accepted_by) VALUES($1,$2,$3,$4) ON CONFLICT (organization_id,version) DO NOTHING", [
            s.org,
            DPA_VERSION,
            sha([dpaPlain("fr"), dpaPlain("nl"), dpaPlain("en")].join("\n")),
            s.userId,
          ]);
          await audit(s.c, s.org, s.userId, "club.dpa_accepted", s.org, { version: DPA_VERSION });
          return { ok: true as const };
        }
        case "export": {
          needPresident(s);
          const token = randomBytes(32).toString("hex");
          const id = (await s.c.query("INSERT INTO club_export(organization_id,requested_by,token_hash) VALUES($1,$2,$3) RETURNING id", [s.org, s.userId, sha(token)])).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "club.export_requested", id);
          // The token is shown once, as the download link.
          return { ok: true as const, id, token };
        }
        case "close": {
          needPresident(s);
          if (command.confirmName.trim().toLowerCase() !== s.orgName.trim().toLowerCase()) throw new AccessError("INVALID_INPUT", 400);
          const id = (
            await s.c.query("INSERT INTO club_termination(organization_id,requested_by,effective_on,reason) VALUES($1,$2,$3::date+30,$4) RETURNING id", [s.org, s.userId, brusselsToday(), command.reason]).catch((e: { code?: string }) => {
              if (e.code === "23505") throw new AccessError("DUPLICATE", 409);
              throw e;
            })
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "club.closure_requested", id);
          return { ok: true as const, id };
        }
        case "cancelClose": {
          needPresident(s);
          const r = await s.c.query("UPDATE club_termination SET cancelled_at=now(),cancelled_by=$2 WHERE organization_id=$1 AND cancelled_at IS NULL AND completed_at IS NULL RETURNING id", [s.org, s.userId]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, "club.closure_cancelled", r.rows[0].id);
          return { ok: true as const };
        }
        case "linkIdentity": {
          // Series D: the person gave their identity code (printed on their own profile); the club's profile joins that identity.
          needPresident(s);
          const profile = (await s.c.query("SELECT cp.id,cp.person_id,cp.full_name FROM club_person cp WHERE cp.id=$1 AND cp.organization_id=$2 FOR UPDATE", [command.profileId, s.org])).rows[0] as { id: string; person_id: string; full_name: string } | undefined;
          if (!profile) throw new AccessError("NOT_FOUND", 404);
          const target = (await s.c.query("SELECT id FROM person WHERE identity_code=$1", [command.identityCode])).rows[0] as { id: string } | undefined;
          if (!target) throw new AccessError("IDENTITY_UNKNOWN", 404);
          if (target.id === profile.person_id) throw new AccessError("IDENTITY_SAME", 409);
          if ((await s.c.query("SELECT 1 FROM club_person WHERE organization_id=$1 AND person_id=$2", [s.org, target.id])).rowCount) throw new AccessError("IDENTITY_IN_USE", 409);
          await s.c.query("UPDATE club_person SET person_id=$2 WHERE id=$1", [profile.id, target.id]);
          // The old identity goes when nothing else holds it (no account, no other profile, no registry entry).
          await s.c.query(
            `DELETE FROM person p WHERE p.id=$1 AND p.user_id IS NULL AND NOT EXISTS(SELECT 1 FROM club_person cp WHERE cp.person_id=p.id)
               AND NOT EXISTS(SELECT 1 FROM classification_record r WHERE r.person_id=p.id) AND NOT EXISTS(SELECT 1 FROM international_transfer t WHERE t.person_id=p.id)`,
            [profile.person_id],
          );
          await audit(s.c, s.org, s.userId, "privacy.identity_link", profile.id, { identityCode: command.identityCode });
          return { ok: true as const };
        }
        case "retention": {
          needPresident(s);
          const b = retentionBounds[command.category];
          if (command.months < b.min || command.months > b.max) throw new AccessError("INVALID_INPUT", 400);
          await s.c.query(
            `INSERT INTO retention_setting(organization_id,category,months,updated_by) VALUES($1,$2,$3,$4)
             ON CONFLICT (organization_id,category) DO UPDATE SET months=EXCLUDED.months,updated_by=EXCLUDED.updated_by,updated_at=now()`,
            [s.org, command.category, command.months, s.userId],
          );
          return { ok: true as const };
        }
        case "request": {
          const r = await s.c.query("UPDATE data_request SET status=$3,response=$4,handled_by=$5,handled_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [
            command.id,
            s.org,
            command.status,
            command.response,
            s.userId,
          ]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, "privacy.request_" + command.status, command.id);
          // Console, series C: a request answered gets its certificate, for the person and the presidency.
          if (command.status === "done" || command.status === "refused") {
            const { numberCertificate } = await import("../support/service");
            await numberCertificate(s.c, command.id);
          }
          return { ok: true as const };
        }
      }
    },
    expected,
  );
}
