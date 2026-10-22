import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { today } from "../calendar/access";
import { clubStatusSummary, nextYearDate, obligationState, obligationTemplates, type LegalForm } from "./obligation-templates";

/**
 * Wave 16 (A): « Statut et obligations » of the club (Settings > Club) and
 * the « Statut du club » square of the president's home. For the president
 * and the people trusted with the club's money or its management.
 */
type Scope = { c: PoolClient; org: string; userId: string };
/** Who sees and keeps the club's obligations. */
export function mayKeepObligations(a: { role: string; grants: string[] }) {
  const rights = permissions(a.role as never, a.grants as never);
  return a.role === "club_president" || rights.includes("dues.manage") || rights.includes("mandates.manage");
}
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    if (!mayKeepObligations(a)) throw new AccessError("FORBIDDEN");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const out = await fn({ c, org: a.organization_id, userId: p.userId });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const year = z.number().int().min(2000).max(2100);
const date = z.iso.date().nullable();
const fields = {
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000),
  periodicity: z.enum(["annual", "once"]),
  dueOn: date,
  doneOn: date,
  proofUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(500)]),
  responsibleId: z.uuid().nullable(),
};
export const obligationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), year, ...fields }),
  z.object({ action: z.literal("update"), id: z.uuid(), version: z.number().int().positive(), ...fields }),
  z.object({ action: z.literal("archive"), id: z.uuid() }),
  z.object({ action: z.literal("propose"), year, locale: z.enum(["fr", "nl", "en"]) }),
  z.object({ action: z.literal("nextYear"), year }),
]);
export type ObligationCommand = z.infer<typeof obligationCommand>;

/**
 * The lines of a year, with the two automatic ones ticked by the annual
 * accounts (approved by the assembly, filed) during that year.
 */
export async function obligationRows(c: PoolClient, org: string, y: number) {
  return (
    await c.query(
      `SELECT o.id,o.year,o.template_key,o.title,o.description,o.periodicity,o.due_on::text AS due_on,o.proof_url,o.responsible_profile_id,o.auto_source,o.position,o.version,
              cp.full_name AS responsible,
              COALESCE(o.done_on,
                CASE o.auto_source
                  WHEN 'accounts_approved' THEN (SELECT max(a.approved_on) FROM annual_accounts a WHERE a.organization_id=o.organization_id AND a.superseded_at IS NULL AND a.status IN ('approved','filed') AND extract(year FROM a.approved_on)=o.year)
                  WHEN 'accounts_filed' THEN (SELECT max(a.filed_on) FROM annual_accounts a WHERE a.organization_id=o.organization_id AND a.superseded_at IS NULL AND a.status='filed' AND extract(year FROM a.filed_on)=o.year)
                  WHEN 'affiliation' THEN (SELECT d.paid_on FROM affiliation_due d WHERE d.id=o.affiliation_due_id AND d.organization_id=o.organization_id)
                END)::text AS done_on,
              (o.done_on IS NULL AND o.auto_source<>'none') AS automatic
         FROM club_obligation o LEFT JOIN club_person cp ON cp.id=o.responsible_profile_id AND cp.organization_id=o.organization_id
        WHERE o.organization_id=$1 AND o.year=$2 AND NOT o.archived
        ORDER BY o.position,o.created_at`,
      [org, y],
    )
  ).rows as {
    id: string;
    year: number;
    template_key: string;
    title: string;
    description: string;
    periodicity: "annual" | "once";
    due_on: string | null;
    done_on: string | null;
    proof_url: string;
    responsible_profile_id: string | null;
    responsible: string | null;
    auto_source: "none" | "accounts_approved" | "accounts_filed" | "affiliation";
    position: number;
    version: number;
    automatic: boolean;
  }[];
}

/** The home square: this year's lines, done or not. Null when the club keeps none yet. */
export async function clubStatus(c: PoolClient, org: string) {
  const day = today();
  const rows = await obligationRows(c, org, Number(day.slice(0, 4)));
  return { year: Number(day.slice(0, 4)), ...clubStatusSummary(rows, day) };
}

export async function obligationsView(db: Pool, p: Principal, raw: { year?: number } = {}) {
  return scope(db, p, false, async (s) => {
    const day = today();
    const y = year.safeParse(raw.year).success ? raw.year! : Number(day.slice(0, 4));
    const org = (await s.c.query("SELECT legal_form FROM organization WHERE id=$1", [s.org])).rows[0] as { legal_form: LegalForm | null };
    const rows = (await obligationRows(s.c, s.org, y)).map((r) => ({ ...r, state: obligationState(r, day) }));
    const years = (await s.c.query("SELECT DISTINCT year FROM club_obligation WHERE organization_id=$1 AND NOT archived ORDER BY year DESC", [s.org])).rows.map((r) => r.year as number);
    const people = (
      await s.c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' AND (birth_date IS NULL OR birth_date<=CURRENT_DATE-interval '18 years') ORDER BY lower(full_name) LIMIT 500", [s.org])
    ).rows as { id: string; full_name: string }[];
    return { organization_id: s.org, year: y, years: [...new Set([y, ...years])].sort((a, b) => b - a), legalForm: org.legal_form, rows, people, summary: clubStatusSummary(rows, day) };
  });
}

/** Adds the proposed lines of the club's form that the year does not have yet. */
export async function proposeObligations(c: PoolClient, org: string, actor: string, y: number, locale: "fr" | "nl" | "en") {
  const form = ((await c.query("SELECT legal_form FROM organization WHERE id=$1", [org])).rows[0]?.legal_form ?? null) as LegalForm | null;
  if (!form) throw new AccessError("LEGAL_FORM_REQUIRED", 409);
  const start = Number((await c.query("SELECT COALESCE(max(position),0) AS n FROM club_obligation WHERE organization_id=$1 AND year=$2", [org, y])).rows[0].n);
  let added = 0;
  for (const [i, tpl] of obligationTemplates[form].entries()) {
    const r = await c.query(
      `INSERT INTO club_obligation(organization_id,year,template_key,title,auto_source,position,created_by)
       SELECT $1,$2,$3,$4,$5,$6,$7 WHERE NOT EXISTS(SELECT 1 FROM club_obligation WHERE organization_id=$1 AND year=$2 AND template_key=$3 AND NOT archived)`,
      [org, y, tpl.key, tpl.title[locale], tpl.auto, start + i + 1, actor],
    );
    added += r.rowCount ?? 0;
  }
  return added;
}

export async function obligationsExecute(db: Pool, p: Principal, command: ObligationCommand, expected?: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const responsible = async (id: string | null) => {
        if (id && !(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      };
      if (command.action === "add") {
        await responsible(command.responsibleId);
        const id = (
          await s.c.query(
            `INSERT INTO club_obligation(organization_id,year,title,description,periodicity,due_on,done_on,proof_url,responsible_profile_id,position,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,(SELECT COALESCE(max(position),0)+1 FROM club_obligation WHERE organization_id=$1 AND year=$2),$10) RETURNING id`,
            [s.org, command.year, command.title, command.description, command.periodicity, command.dueOn, command.doneOn, command.proofUrl, command.responsibleId, s.userId],
          )
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "obligation.added", id);
        return { ok: true as const, id };
      }
      if (command.action === "update") {
        await responsible(command.responsibleId);
        const r = await s.c.query(
          `UPDATE club_obligation SET title=$3,description=$4,periodicity=$5,due_on=$6,done_on=$7,proof_url=$8,responsible_profile_id=$9,version=version+1,updated_at=now()
            WHERE id=$1 AND organization_id=$2 AND version=$10 AND NOT archived RETURNING id`,
          [command.id, s.org, command.title, command.description, command.periodicity, command.dueOn, command.doneOn, command.proofUrl, command.responsibleId, command.version],
        );
        if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
        await audit(s.c, s.org, s.userId, "obligation.updated", command.id);
        return { ok: true as const };
      }
      if (command.action === "archive") {
        const r = await s.c.query("UPDATE club_obligation SET archived=true,updated_at=now() WHERE id=$1 AND organization_id=$2 AND NOT archived RETURNING id", [command.id, s.org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(s.c, s.org, s.userId, "obligation.archived", command.id);
        return { ok: true as const };
      }
      if (command.action === "propose") {
        const added = await proposeObligations(s.c, s.org, s.userId, command.year, command.locale);
        return { ok: true as const, added };
      }
      // « Préparer l'année suivante »: the yearly lines again, unticked, one year later.
      // Affiliation lines come back by themselves when the next period opens (wave 17, N2).
      const rows = (await obligationRows(s.c, s.org, command.year)).filter((r) => r.periodicity === "annual" && r.auto_source !== "affiliation");
      let added = 0;
      for (const r of rows) {
        const exists = await s.c.query(
          "SELECT 1 FROM club_obligation WHERE organization_id=$1 AND year=$2 AND NOT archived AND ((template_key<>'' AND template_key=$3) OR lower(title)=lower($4))",
          [s.org, command.year + 1, r.template_key, r.title],
        );
        if (exists.rowCount) continue;
        await s.c.query(
          `INSERT INTO club_obligation(organization_id,year,template_key,title,description,periodicity,due_on,responsible_profile_id,auto_source,position,created_by)
           VALUES($1,$2,$3,$4,$5,'annual',$6,$7,$8,$9,$10)`,
          [s.org, command.year + 1, r.template_key, r.title, r.description, nextYearDate(r.due_on), r.responsible_profile_id, r.auto_source, r.position, s.userId],
        );
        added++;
      }
      await audit(s.c, s.org, s.userId, "obligation.nextYear", String(command.year + 1));
      return { ok: true as const, added };
    },
    expected,
  );
}
