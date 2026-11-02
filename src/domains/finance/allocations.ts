import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { moneyRights } from "../access/policy";
import { brusselsToday } from "../people/service";
import { alertDue, allocationCommand, allocationCsv, allocationState, type AllocationCommand } from "./allocations-schema";

/**
 * 9, part 1: reserved funds. A grant (or a sponsor, a gift, a pot) carries
 * allocations; the income and the expenses linked to an allocation say what
 * stays reserved. The cash reads in three figures: total, reserved, available.
 * Money rights only, every query filtered on the organisation.
 */
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (c: PoolClient, org: string, edit: boolean) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("CLUB_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const money = moneyRights(a);
    if (!money.manage && (write || !money.read)) throw new AccessError("FORBIDDEN");
    if (!mfaSatisfied(!!(await account(c, p)).twoFactorEnabled)) throw new AccessError("MFA_REQUIRED");
    const out = await fn(c, a.organization_id, money.manage);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

type Row = {
  id: string;
  source_kind: string;
  grant_id: string | null;
  partner_id: string | null;
  pot_id: string | null;
  source_label: string;
  origin: string;
  purpose: string;
  label: string;
  amount_cents: number;
  use_by: string | null;
  proof: string;
  closed_at: string | null;
  received_cents: number;
  spent_cents: number;
};
/** The organisation's allocations with what was received and spent on each. */
export async function allocationsOf(c: PoolClient, org: string, open = false) {
  const rows = (
    await c.query(
      `SELECT a.id,a.source_kind,a.grant_id,a.partner_id,a.pot_id,a.source_label,COALESCE(g.funder,pa.name,po.name,a.source_label) AS origin,a.purpose,a.label,a.amount_cents,a.use_by::text AS use_by,a.proof,a.closed_at,
              COALESCE((SELECT sum(t.amount_cents) FROM finance_transaction t WHERE t.allocation_id=a.id AND t.direction='in' AND t.cancelled_at IS NULL AND t.deleted_at IS NULL),0)::int AS received_cents,
              COALESCE((SELECT sum(t.amount_cents) FROM finance_transaction t WHERE t.allocation_id=a.id AND t.direction='out' AND t.cancelled_at IS NULL AND t.deleted_at IS NULL),0)::int AS spent_cents
         FROM fund_allocation a LEFT JOIN grant_application g ON g.id=a.grant_id LEFT JOIN partner pa ON pa.id=a.partner_id LEFT JOIN fundraising_pot po ON po.id=a.pot_id
        WHERE a.organization_id=$1 ${open ? "AND a.closed_at IS NULL" : ""} ORDER BY a.closed_at IS NOT NULL,a.use_by NULLS LAST,a.label`,
      [org],
    )
  ).rows as Row[];
  return rows.map((r) => ({ ...r, state: allocationState(r.amount_cents, r.received_cents, r.spent_cents) }));
}
/** What stays reserved on the open allocations (the « dont réservée » of the cash). */
export async function reservedTotal(c: PoolClient, org: string) {
  return (await allocationsOf(c, org, true)).reduce((n, a) => n + a.state.remaining, 0);
}

export async function allocationsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (c, org, edit) => {
    const allocations = await allocationsOf(c, org);
    const operations = (
      await c.query(
        `SELECT t.id,t.allocation_id,t.occurred_on::text AS occurred_on,t.label,t.direction,t.amount_cents FROM finance_transaction t
          WHERE t.organization_id=$1 AND t.allocation_id IS NOT NULL AND t.cancelled_at IS NULL AND t.deleted_at IS NULL ORDER BY t.occurred_on`,
        [org],
      )
    ).rows as { id: string; allocation_id: string; occurred_on: string; label: string; direction: "in" | "out"; amount_cents: number }[];
    // Operations that may still be attached (the last 18 months, not yet attached).
    const free = (
      await c.query(
        `SELECT t.id,t.occurred_on::text AS occurred_on,t.label,t.direction,t.amount_cents FROM finance_transaction t
          WHERE t.organization_id=$1 AND t.allocation_id IS NULL AND t.cancelled_at IS NULL AND t.deleted_at IS NULL AND t.occurred_on>=CURRENT_DATE-548 ORDER BY t.occurred_on DESC LIMIT 200`,
        [org],
      )
    ).rows as { id: string; occurred_on: string; label: string; direction: "in" | "out"; amount_cents: number }[];
    const sources = {
      grants: (await c.query("SELECT id,funder AS name FROM grant_application WHERE organization_id=$1 AND status IN ('granted','paid','closed') ORDER BY created_at DESC LIMIT 100", [org])).rows as { id: string; name: string }[],
      partners: (await c.query("SELECT id,name FROM partner WHERE organization_id=$1 AND status<>'prospect' ORDER BY name LIMIT 200", [org])).rows as { id: string; name: string }[],
      pots: (await c.query("SELECT id,name FROM fundraising_pot WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100", [org])).rows as { id: string; name: string }[],
    };
    return { organization_id: org, can: { edit }, today: brusselsToday(), allocations: allocations.map((a) => ({ ...a, operations: operations.filter((o) => o.allocation_id === a.id) })), free, sources };
  });
}

export async function allocationsExecute(db: Pool, p: Principal, raw: z.input<typeof allocationCommand>, expected: string) {
  const cmd: AllocationCommand = allocationCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (c, org) => {
      if (cmd.action === "create" || cmd.action === "update") {
        // The source belongs to the organisation (a foreign key with the organisation enforces it too).
        const source = { grant: cmd.sourceKind === "grant" ? cmd.grantId : null, partner: cmd.sourceKind === "sponsor" ? cmd.partnerId : null, pot: cmd.sourceKind === "fundraising" ? cmd.potId : null };
        if (source.pot && !(await c.query("SELECT 1 FROM fundraising_pot WHERE id=$1 AND organization_id=$2", [source.pot, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
        const values = [org, cmd.sourceKind, source.grant, source.partner, source.pot, cmd.sourceLabel, cmd.purpose, cmd.label, cmd.amountCents, cmd.useBy, cmd.proof, p.userId];
        if (cmd.action === "create") {
          const id = (
            await c.query(
              "INSERT INTO fund_allocation(organization_id,source_kind,grant_id,partner_id,pot_id,source_label,purpose,label,amount_cents,use_by,proof,created_by,responsible_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id",
              values,
            )
          ).rows[0].id as string;
          await audit(c, org, p.userId, "allocation.created", id);
          return { id };
        }
        const r = await c.query(
          "UPDATE fund_allocation SET source_kind=$2,grant_id=$3,partner_id=$4,pot_id=$5,source_label=$6,purpose=$7,label=$8,amount_cents=$9,use_by=$10,proof=$11 WHERE id=$13 AND organization_id=$1",
          [...values.slice(0, 11), cmd.id],
        );
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { id: cmd.id };
      }
      if (cmd.action === "close") {
        const r = await c.query("UPDATE fund_allocation SET closed_at=CASE WHEN $3 THEN now() END WHERE id=$1 AND organization_id=$2", [cmd.id, org, cmd.closed]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { id: cmd.id };
      }
      if (cmd.allocationId && !(await c.query("SELECT 1 FROM fund_allocation WHERE id=$1 AND organization_id=$2", [cmd.allocationId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      const r = await c.query("UPDATE finance_transaction SET allocation_id=$3 WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL", [cmd.transactionId, org, cmd.allocationId]);
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      return { id: cmd.transactionId };
    },
    expected,
  );
}

const head = {
  fr: ["Affectation", "Origine", "Objet", "Date", "Opération", "Reçu (EUR)", "Dépensé (EUR)", "Reste (EUR)"],
  nl: ["Bestemming", "Herkomst", "Doel", "Datum", "Verrichting", "Ontvangen (EUR)", "Uitgegeven (EUR)", "Saldo (EUR)"],
  en: ["Allocation", "Source", "Purpose", "Date", "Operation", "Received (EUR)", "Spent (EUR)", "Left (EUR)"],
};
/** The justification export of a grant's allocations (or all of them). */
export async function allocationsExport(db: Pool, p: Principal, locale: "fr" | "nl" | "en", grantId: string | null) {
  return scope(db, p, false, async (c, org) => {
    const all = (await allocationsOf(c, org)).filter((a) => !grantId || a.grant_id === grantId);
    const ops = (
      await c.query(
        "SELECT allocation_id,occurred_on::text AS date,label,direction,amount_cents AS cents FROM finance_transaction WHERE organization_id=$1 AND allocation_id=ANY($2::uuid[]) AND cancelled_at IS NULL AND deleted_at IS NULL ORDER BY occurred_on",
        [org, all.map((a) => a.id)],
      )
    ).rows as { allocation_id: string; date: string; label: string; direction: string; cents: number }[];
    return allocationCsv(
      all.map((a) => ({ label: a.label, source: a.origin, purpose: a.purpose, useBy: a.use_by, operations: ops.filter((o) => o.allocation_id === a.id), state: a.state })),
      head[locale],
    );
  });
}

/** 60 and 30 days before the use-by date, if money is left: a task, once each. */
export async function allocationsTick(db: Pool) {
  const today = brusselsToday();
  const orgs = (await db.query("SELECT DISTINCT organization_id FROM fund_allocation WHERE closed_at IS NULL AND use_by IS NOT NULL AND use_by>=CURRENT_DATE")).rows.map((r) => r.organization_id as string);
  let created = 0;
  for (const org of orgs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      for (const a of await allocationsOf(c, org, true)) {
        const days = alertDue(a.use_by, today, a.state.remaining);
        if (!days) continue;
        const kind = (await c.query("SELECT kind FROM organization WHERE id=$1", [org])).rows[0].kind as string;
        const r = await c.query(
          `INSERT INTO task(organization_id,kind,category,title,detail,due_on,responsible_user_id,origin,created_by,source_key,source_kind,source_params)
           SELECT $1,'other',$2,$3,$4,$5::date,a.responsible_user_id,'manual',a.created_by,$6,'allocationDeadline',$7::jsonb FROM fund_allocation a WHERE a.id=$8
           ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,
          [
            org,
            kind === "federation" ? "fed_finance" : a.source_kind === "sponsor" ? "sponsors" : "grants",
            `Fonds réservés : ${a.label}`.slice(0, 200),
            `${(a.state.remaining / 100).toFixed(2)} EUR à utiliser avant le ${a.use_by}`,
            a.use_by,
            `allocation:${a.id}:${days}`,
            JSON.stringify({ about: a.label, days, remaining: a.state.remaining, useBy: a.use_by }),
            a.id,
          ],
        );
        created += r.rowCount ?? 0;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return created;
}

/** The reserved funds left at a closing date (the annual accounts and the financial report mention them). */
export async function reservedAt(c: PoolClient, org: string, day: string) {
  const rows = (
    await c.query(
      `SELECT a.label,
              COALESCE(sum(t.amount_cents) FILTER (WHERE t.direction='in'),0)::int AS received,
              COALESCE(sum(t.amount_cents) FILTER (WHERE t.direction='out'),0)::int AS spent
         FROM fund_allocation a LEFT JOIN finance_transaction t ON t.allocation_id=a.id AND t.cancelled_at IS NULL AND t.deleted_at IS NULL AND t.occurred_on<=$2::date
        WHERE a.organization_id=$1 AND (a.closed_at IS NULL OR a.closed_at::date>$2::date) AND a.created_at::date<=$2::date
        GROUP BY a.id,a.label ORDER BY a.label`,
      [org, day],
    )
  ).rows as { label: string; received: number; spent: number }[];
  const items = rows.map((r) => ({ label: r.label, remaining: Math.max(0, r.received - r.spent) })).filter((r) => r.remaining > 0);
  return { total: items.reduce((n, r) => n + r.remaining, 0), items };
}
