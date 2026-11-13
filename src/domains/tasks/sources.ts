import type { Pool, PoolClient } from "pg";
import { accountsDeadlines } from "../accounts/service";
import { brusselsToday } from "../people/service";
import type { Category } from "./schema";
import { publish } from "../notifications/queue";

/**
 * A1: the tasks the application creates by itself. Each cause gives one
 * task per due date (source_key, unique per organisation); a task whose
 * cause is gone (the file filed, the chair serviced, the document renewed,
 * the pot closed) closes by itself. Titles are written in the reader's
 * language from source_kind and source_params; the stored title is the
 * French fallback.
 */
export const sourceKinds = ["grantDeadline", "grantOpening", "grantReport", "partnerRenewal", "partnerContact", "chairService", "documentExpiry", "potDeadline", "accountsAssembly", "accountsFiling", "matchPrep", "grantReopen", "seasonNext"] as const;
export type SourceKind = (typeof sourceKinds)[number];
type Desired = {
  key: string;
  category: Category;
  kind: "grant" | "sponsor" | "equipment" | "documents" | "training" | "other";
  source: SourceKind;
  about: string;
  title: string;
  due: string | null;
  grant?: string;
  chair?: string;
  document?: string;
  pot?: string;
  partner?: string;
  responsible?: string | null;
  /** 12/11/2026: a match to prepare, and everyone in charge of it (the team's coaches). */
  match?: string;
  team?: string;
  crew?: string[];
};
const fallback: Record<SourceKind, string> = {
  grantDeadline: "Déposer le dossier de subside",
  grantOpening: "L'appel est ouvert : préparer le dossier de subside",
  partnerRenewal: "Renouveler le sponsoring",
  partnerContact: "Reprendre contact avec le sponsor",
  grantReport: "Envoyer le rapport justificatif du subside",
  chairService: "Réviser le fauteuil",
  documentExpiry: "Renouveler un document qui expire",
  potDeadline: "Clôturer la cagnotte",
  accountsAssembly: "Approuver les comptes en assemblée générale",
  accountsFiling: "Déposer les comptes annuels",
  matchPrep: "Préparer le match",
  grantReopen: "L'appel rouvre bientôt : préparer le nouveau dossier",
  seasonNext: "Préparer la saison suivante",
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
      `SELECT id,CASE WHEN program<>'' THEN funder||' · '||program ELSE funder END AS about,status,deadline_on::text AS deadline,report_due_on::text AS report,opens_on::text AS opens
         FROM grant_application g WHERE organization_id=$1 AND status IN ('idea','granted','paid')
          AND NOT EXISTS (SELECT 1 FROM task f WHERE f.grant_id=g.id AND f.organization_id=g.organization_id AND f.source_key IS NULL)`,
      [org],
    )
  ).rows as { id: string; about: string; status: string; deadline: string | null; report: string | null; opens: string | null }[];
  for (const g of grants) {
    // A2: before the call opens, nothing to do yet; once open, one task until the file is filed.
    const open = !g.opens || g.opens <= today;
    if (g.status === "idea" && open && g.deadline) add({ key: `grant_deadline:${g.id}:${g.deadline}`, category: "grants", kind: "grant", source: "grantDeadline", about: g.about, due: g.deadline, grant: g.id });
    else if (g.status === "idea" && g.opens && open) add({ key: `grant_opening:${g.id}:${g.opens}`, category: "grants", kind: "grant", source: "grantOpening", about: g.about, due: null, grant: g.id });
    if (g.status !== "idea" && g.report) add({ key: `grant_report:${g.id}:${g.report}`, category: "grants", kind: "grant", source: "grantReport", about: g.about, due: g.report, grant: g.id });
  }
  // A2: an active sponsor ending within 60 days, or not contacted for 90 days.
  for (const r of (
    await c.query(
      `SELECT id,name,ends_on::text AS ends,responsible_id,COALESCE(last_contact_on,signed_on,starts_on,created_at::date)::text AS seen
         FROM partner WHERE organization_id=$1 AND status='active'`,
      [org],
    )
  ).rows as { id: string; name: string; ends: string | null; responsible_id: string | null; seen: string }[]) {
    if (r.ends && r.ends <= addDays(today, 60))
      add({ key: `partner_renewal:${r.id}:${r.ends}`, category: "sponsors", kind: "sponsor", source: "partnerRenewal", about: r.name, due: r.ends, partner: r.id, responsible: r.responsible_id });
    if (r.seen < addDays(today, -90))
      add({ key: `partner_contact:${r.id}:${r.seen}`, category: "sponsors", kind: "sponsor", source: "partnerContact", about: r.name, due: null, partner: r.id, responsible: r.responsible_id });
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
  // 12/11/2026: a match within two weeks: its preparation, given to the team's coaches.
  for (const m of (
    await c.query(
      `SELECT m.id,m.team_id,t.name||' · '||m.opponent AS about,(m.starts_at AT TIME ZONE 'Europe/Brussels')::date::text AS day,
              COALESCE((SELECT array_agg(DISTINCT tm.profile_id) FROM team_membership tm JOIN club_person cp ON cp.id=tm.profile_id AND cp.status='active'
                         WHERE tm.team_id=m.team_id AND tm.role='coach' AND NOT tm.cancelled AND tm.closed_at IS NULL AND (tm.ends_on IS NULL OR tm.ends_on>=$2::date)),'{}') AS coaches
         FROM match m JOIN team t ON t.id=m.team_id
        WHERE m.organization_id=$1 AND m.status='scheduled' AND (m.starts_at AT TIME ZONE 'Europe/Brussels')::date BETWEEN $2::date AND $3::date`,
      [org, today, addDays(today, 14)],
    )
  ).rows as { id: string; team_id: string; about: string; day: string; coaches: string[] }[]) {
    const due = addDays(m.day, -2) < today ? today : addDays(m.day, -2);
    add({ key: `match_prep:${m.id}:${m.day}`, category: "sport", kind: "training", source: "matchPrep", about: m.about, due, match: m.id, team: m.team_id, responsible: m.coaches[0] ?? null, crew: m.coaches });
  }
  // 12/11/2026: a yearly call that comes back: a month before it reopens, until the club starts a new file for it.
  for (const g of (
    await c.query(
      `SELECT g.id,CASE WHEN g.program<>'' THEN g.funder||' · '||g.program ELSE g.funder END AS about,
              (COALESCE(g.opens_on,g.deadline_on-60)+interval '1 year')::date::text AS reopens,(g.deadline_on+interval '1 year')::date::text AS deadline
         FROM grant_application g
        WHERE g.organization_id=$1 AND g.status IN ('granted','paid','closed','refused') AND COALESCE(g.opens_on,g.deadline_on) IS NOT NULL
          AND (COALESCE(g.opens_on,g.deadline_on-60)+interval '1 year')::date<=$2::date+30
          AND COALESCE((g.deadline_on+interval '1 year')::date,(g.opens_on+interval '1 year 3 months')::date)>=$2::date
          AND NOT EXISTS (SELECT 1 FROM grant_application n WHERE n.organization_id=g.organization_id AND n.id<>g.id AND lower(n.funder)=lower(g.funder) AND lower(n.program)=lower(g.program) AND n.created_at>g.created_at)`,
      [org, today],
    )
  ).rows as { id: string; about: string; reopens: string; deadline: string | null }[])
    add({ key: `grant_reopen:${g.id}:${g.reopens.slice(0, 4)}`, category: "grants", kind: "grant", source: "grantReopen", about: g.about, due: g.deadline, grant: g.id });
  // 12/11/2026: the season ends within 45 days and no next one exists yet.
  for (const se of (
    await c.query(
      `SELECT s.id,s.name,s.ends_on::text AS ends FROM season s WHERE s.organization_id=$1 AND NOT s.archived AND s.starts_on<=$2::date AND s.ends_on BETWEEN $2::date AND $2::date+45
          AND NOT EXISTS (SELECT 1 FROM season n WHERE n.organization_id=s.organization_id AND n.starts_on>s.starts_on)`,
      [org, today],
    )
  ).rows as { id: string; name: string; ends: string }[])
    add({ key: `season_next:${se.id}`, category: "admin", kind: "documents", source: "seasonNext", about: se.name, due: addDays(se.ends, -14) < today ? today : addDays(se.ends, -14) });
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
    for (const d of want) {
      const r = await c.query(
        `INSERT INTO task(organization_id,kind,category,title,due_on,grant_id,chair_id,document_id,pot_id,origin,source_key,source_kind,source_params,created_by,partner_id,responsible_id,match_id,team_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'template',$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING RETURNING id`,
        [org, d.kind, d.category, d.title, d.due, d.grant ?? null, d.chair ?? null, d.document ?? null, d.pot ?? null, d.key, d.source, JSON.stringify({ about: d.about }), creator, d.partner ?? null, d.responsible ?? null, d.match ?? null, d.team ?? null],
      );
      created += r.rowCount ?? 0;
      // Everyone in charge (the first is the responsible, already there): the hourly task tells them.
      if (r.rows[0] && d.crew?.length)
        for (const profile of d.crew.slice(1, 20)) await c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [r.rows[0].id, org, profile]);
    }
  // A grant given its own check-list (wave 15) keeps only those steps: no double.
  await c.query(
    `DELETE FROM task t WHERE t.organization_id=$1 AND t.source_kind IN ('grantDeadline','grantOpening','grantReport') AND t.status<>'done'
        AND EXISTS (SELECT 1 FROM task f WHERE f.grant_id=t.grant_id AND f.organization_id=t.organization_id AND f.source_key IS NULL)`,
    [org],
  );
  const closed = (
    await c.query(
      "UPDATE task SET status='done',done_on=$3,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key IS NOT NULL AND source_kind=ANY($4::text[]) AND status<>'done' AND NOT (source_key=ANY($2::text[])) RETURNING id",
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

/**
 * 12/11/2026: the people given a task by any path (a match's checklist, a
 * sponsor's responsible, a fine, a departure, a preparation) hear it once,
 * like a task given by hand; the person who gave it is not told.
 */
export async function tellAssignedTick(db: Pool) {
  const rows = (
    await db.query(
      `SELECT a.id,a.task_id,t.organization_id,t.title,t.due_on::text AS due_on,o.name AS organization,u.id AS user_id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,t.created_by
         FROM task_assignee a JOIN task t ON t.id=a.task_id AND t.organization_id=a.organization_id JOIN organization o ON o.id=t.organization_id
         LEFT JOIN club_person cp ON cp.id=a.profile_id AND cp.organization_id=a.organization_id LEFT JOIN person cpe ON cpe.id=cp.person_id
         LEFT JOIN "user" u ON u.id=COALESCE(a.user_id,cpe.user_id) AND u.active LEFT JOIN person pe ON pe.user_id=u.id
        WHERE a.told_at IS NULL AND t.status<>'done' ORDER BY a.created_at LIMIT 500`,
    )
  ).rows as { id: string; task_id: string; organization_id: string; title: string; due_on: string | null; organization: string; user_id: string | null; email: string | null; name: string; locale: "fr" | "nl" | "en"; created_by: string }[];
  let told = 0;
  for (const r of rows) {
    if (r.user_id && r.email && r.user_id !== r.created_by) {
      await publish(db, {
        organizationId: r.organization_id,
        userId: r.user_id,
        email: r.email,
        kind: "funding_task",
        category: "administrative",
        resourceType: "funding",
        resourceId: r.task_id,
        eventKey: `task_assigned:${r.task_id}:${r.user_id}`,
        locale: r.locale,
        inApp: true,
        variables: { name: r.name, organization: r.organization, url: `${process.env.BETTER_AUTH_URL ?? ""}/${r.locale}/tasks?task=${r.task_id}`, title: r.title, due: r.due_on ?? "" },
      });
      told++;
    }
    // Without an account, nobody to tell: marked too, so the row is not read again.
    await db.query("UPDATE task_assignee SET told_at=now() WHERE id=$1", [r.id]);
  }
  return told;
}
