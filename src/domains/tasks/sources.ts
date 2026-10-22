import type { Pool, PoolClient } from "pg";
import { accountsDeadlines } from "../accounts/service";
import { brusselsToday } from "../people/service";
import type { Category } from "./schema";

/**
 * A1: the tasks the application creates by itself. Each cause gives one
 * task per due date (source_key, unique per organisation); a task whose
 * cause is gone (the file filed, the chair serviced, the document renewed,
 * the pot closed) closes by itself. Titles are written in the reader's
 * language from source_kind and source_params; the stored title is the
 * French fallback.
 */
export const sourceKinds = ["grantDeadline", "grantReport", "chairService", "documentExpiry", "potDeadline", "accountsAssembly", "accountsFiling"] as const;
export type SourceKind = (typeof sourceKinds)[number];
type Desired = {
  key: string;
  category: Category;
  kind: "grant" | "equipment" | "documents" | "other";
  source: SourceKind;
  about: string;
  title: string;
  due: string | null;
  grant?: string;
  chair?: string;
  document?: string;
  pot?: string;
};
const fallback: Record<SourceKind, string> = {
  grantDeadline: "Déposer le dossier de subside",
  grantReport: "Envoyer le rapport justificatif du subside",
  chairService: "Réviser le fauteuil",
  documentExpiry: "Renouveler un document qui expire",
  potDeadline: "Clôturer la cagnotte",
  accountsAssembly: "Approuver les comptes en assemblée générale",
  accountsFiling: "Déposer les comptes annuels",
};
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function desired(c: PoolClient, org: string, today: string): Promise<Desired[]> {
  const out: Desired[] = [];
  const add = (d: Omit<Desired, "title">) => out.push({ ...d, title: `${fallback[d.source]} · ${d.about}`.slice(0, 200) });
  const grants = (
    await c.query(
      `SELECT id,CASE WHEN program<>'' THEN funder||' · '||program ELSE funder END AS about,status,deadline_on::text AS deadline,report_due_on::text AS report
         FROM grant_application g WHERE organization_id=$1 AND status IN ('idea','granted','paid')
          AND NOT EXISTS (SELECT 1 FROM funding_task f WHERE f.grant_id=g.id AND f.organization_id=g.organization_id AND f.source_key IS NULL)`,
      [org],
    )
  ).rows as { id: string; about: string; status: string; deadline: string | null; report: string | null }[];
  for (const g of grants) {
    if (g.status === "idea" && g.deadline) add({ key: `grant_deadline:${g.id}:${g.deadline}`, category: "grants", kind: "grant", source: "grantDeadline", about: g.about, due: g.deadline, grant: g.id });
    if (g.status !== "idea" && g.report) add({ key: `grant_report:${g.id}:${g.report}`, category: "grants", kind: "grant", source: "grantReport", about: g.about, due: g.report, grant: g.id });
  }
  for (const r of (
    await c.query("SELECT id,name,next_service_on::text AS next FROM equipment_chair WHERE organization_id=$1 AND status<>'retired' AND next_service_on<=$2::date", [org, addDays(today, 30)])
  ).rows as { id: string; name: string; next: string }[])
    add({ key: `chair_service:${r.id}:${r.next}`, category: "equipment", kind: "equipment", source: "chairService", about: r.name, due: r.next, chair: r.id });
  for (const r of (
    await c.query(
      `SELECT d.id,d.name||COALESCE(' · '||cp.full_name,'') AS about,d.expires_on::text AS expires FROM club_document d LEFT JOIN club_person cp ON cp.id=d.profile_id AND cp.organization_id=d.organization_id
        WHERE d.organization_id=$1 AND d.status='valid' AND d.expires_on<=$2::date AND (cp.id IS NULL OR cp.status='active')`,
      [org, addDays(today, 30)],
    )
  ).rows as { id: string; about: string; expires: string }[])
    add({ key: `document_expiry:${r.id}:${r.expires}`, category: "admin", kind: "documents", source: "documentExpiry", about: r.about, due: r.expires, document: r.id });
  for (const r of (
    await c.query("SELECT id,name,deadline::text AS deadline FROM fundraising_pot WHERE organization_id=$1 AND status='open' AND deadline<=$2::date", [org, addDays(today, 14)])
  ).rows as { id: string; name: string; deadline: string }[])
    add({ key: `pot_deadline:${r.id}:${r.deadline}`, category: "fundraising", kind: "other", source: "potDeadline", about: r.name, due: r.deadline, pot: r.id });
  for (const d of await accountsDeadlines(c, org))
    add({ key: `${d.kind}:${d.year.from}`, category: "admin", kind: "other", source: d.kind, about: d.year.label, due: d.date });
  return out;
}

/** Creates the missing tasks and closes the ones whose cause is resolved. Idempotent. */
export async function syncSources(c: PoolClient, org: string, today = brusselsToday()) {
  const want = await desired(c, org, today);
  const creator = (
    await c.query(
      "SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role IN ('club_president','federation_president') AND revoked_at IS NULL ORDER BY (valid_until IS NULL) DESC,created_at LIMIT 1",
      [org],
    )
  ).rows[0]?.user_id as string | undefined;
  let created = 0;
  if (creator)
    for (const d of want)
      created +=
        (
          await c.query(
            `INSERT INTO funding_task(organization_id,kind,category,title,due_on,grant_id,chair_id,document_id,pot_id,origin,source_key,source_kind,source_params,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'template',$10,$11,$12,$13)
             ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,
            [org, d.kind, d.category, d.title, d.due, d.grant ?? null, d.chair ?? null, d.document ?? null, d.pot ?? null, d.key, d.source, JSON.stringify({ about: d.about }), creator],
          )
        ).rowCount ?? 0;
  // A grant given its own check-list (wave 15) keeps only those steps: no double.
  await c.query(
    `DELETE FROM funding_task t WHERE t.organization_id=$1 AND t.source_kind IN ('grantDeadline','grantReport') AND t.status<>'done'
        AND EXISTS (SELECT 1 FROM funding_task f WHERE f.grant_id=t.grant_id AND f.organization_id=t.organization_id AND f.source_key IS NULL)`,
    [org],
  );
  const closed = (
    await c.query(
      "UPDATE funding_task SET status='done',done_on=$3,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key IS NOT NULL AND source_kind=ANY($4::text[]) AND status<>'done' AND NOT (source_key=ANY($2::text[])) RETURNING id",
      [org, want.map((d) => d.key), today, sourceKinds],
    )
  ).rowCount;
  return { created, closed: closed ?? 0 };
}

/** Daily: every club's automatic tasks (the reminders follow in fundingTaskTick). */
export async function taskSourcesTick(db: Pool) {
  let changed = 0;
  for (const { id } of (await db.query("SELECT id FROM organization WHERE kind='club'")).rows as { id: string }[]) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const r = await syncSources(c, id);
      await c.query("COMMIT");
      changed += r.created + r.closed;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return changed;
}
