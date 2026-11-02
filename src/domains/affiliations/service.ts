import type { Pool, PoolClient } from "pg";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { offerUndo } from "../undo/service";
import { publish } from "../notifications/queue";
import { seasonOf } from "../finance/schema";
import { brusselsToday } from "../people/service";
import {
  currentPeriod,
  dueAmount,
  dueState,
  feeRuleValid,
  type ClubAffiliationCommand,
  type FederationAffiliationCommand,
  type FeeRule,
} from "./schema";

/**
 * Wave 17 (N2): affiliations and federal fees. A federation defines fees for
 * all its clubs or chosen ones, a club adds its own; each club owes one due
 * per period (created when the period opens), marks it « en ordre » in one
 * click (with the expense in the ledger if wanted, undone for a few
 * seconds), and the due ticks its line in « Statut du club ». Each club sees
 * only its own dues; the federation sees, for its fees, which club paid.
 */
type Fee = FeeRule & {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  contact_id: string | null;
  basis: "player" | "club";
  amount_cents: number;
  all_clubs: boolean;
  archived: boolean;
  created_by: string;
};
const feeColumns =
  "f.id,f.organization_id,f.name,f.description,f.contact_id,f.basis,f.frequency,f.amount_cents,f.opens_month,f.opens_day,f.due_days,f.due_month,f.due_day,f.all_clubs,f.archived,f.created_by";

/** The fees a club owes: its own, and its federation's for all clubs or for it. */
export async function feesOf(c: PoolClient, club: string) {
  return (
    await c.query(
      `SELECT ${feeColumns} FROM affiliation_fee f JOIN organization club ON club.id=$1
        WHERE NOT f.archived AND (f.organization_id=club.id OR (club.federation_id IS NOT NULL AND f.organization_id=club.federation_id
          AND (f.all_clubs OR EXISTS(SELECT 1 FROM affiliation_fee_club x WHERE x.fee_id=f.id AND x.club_id=club.id))))
        ORDER BY f.created_at`,
      [club],
    )
  ).rows as Fee[];
}

/** Licensed players of the club for the season of an opening day (the previous season while none is licensed yet). */
async function licensedPlayers(c: PoolClient, club: string, opensOn: string) {
  const season = seasonOf(opensOn).label;
  const previous = seasonOf(`${Number(opensOn.slice(0, 4)) - 1}${opensOn.slice(4)}`).label;
  const rows = (
    await c.query("SELECT season,count(DISTINCT profile_id)::int AS n FROM license WHERE organization_id=$1 AND status='active' AND season=ANY($2::text[]) GROUP BY season", [
      club,
      [season, previous],
    ])
  ).rows as { season: string; n: number }[];
  return rows.find((r) => r.season === season)?.n || rows.find((r) => r.season === previous)?.n || 0;
}

/**
 * Creates the due of every period opened by today, with its line in « Statut
 * du club ». Returns the dues created.
 */
export async function ensureDues(c: PoolClient, club: string, today = brusselsToday()) {
  const created: string[] = [];
  for (const f of await feesOf(c, club)) {
    const p = currentPeriod(f, today);
    if ((await c.query("SELECT 1 FROM affiliation_due WHERE fee_id=$1 AND organization_id=$2 AND period=$3", [f.id, club, p.period])).rowCount) continue;
    const players = f.basis === "player" ? await licensedPlayers(c, club, p.opensOn) : null;
    const due = (
      await c.query(
        "INSERT INTO affiliation_due(fee_id,organization_id,period,opens_on,due_on,players,amount_cents) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(fee_id,organization_id,period) DO NOTHING RETURNING id",
        [f.id, club, p.period, p.opensOn, p.dueOn, players, dueAmount(f.basis, f.amount_cents, players ?? 0)],
      )
    ).rows[0]?.id as string | undefined;
    if (!due) continue;
    // « Statut du club » gets the line, ticked when the due is marked « en ordre ».
    await c.query(
      `INSERT INTO club_obligation(organization_id,year,title,description,periodicity,due_on,auto_source,affiliation_due_id,position,created_by)
       VALUES($1,$2,$3,$4,'once',$5,'affiliation',$6,(SELECT COALESCE(max(position),0)+1 FROM club_obligation WHERE organization_id=$1 AND year=$2),$7)`,
      [club, Number(p.dueOn.slice(0, 4)), `${f.name} ${p.period}`.slice(0, 160), f.description.slice(0, 1000), p.dueOn, due, f.created_by],
    );
    created.push(due);
  }
  return created;
}

const dueColumns = `d.id,d.fee_id,d.organization_id,d.period,d.opens_on::text AS opens_on,d.due_on::text AS due_on,d.players,d.amount_cents,d.paid_on::text AS paid_on,d.transaction_id,
  f.name,f.basis,f.frequency,f.organization_id AS owner_id,o.kind AS owner_kind,o.name AS owner_name`;
type DueRow = {
  id: string;
  fee_id: string;
  organization_id: string;
  period: string;
  opens_on: string;
  due_on: string;
  players: number | null;
  amount_cents: number;
  paid_on: string | null;
  transaction_id: string | null;
  name: string;
  basis: "player" | "club";
  frequency: "annual" | "monthly";
  owner_id: string;
  owner_kind: "club" | "federation";
  owner_name: string;
};

type ClubScope = { c: PoolClient; org: string; userId: string; manage: boolean };
async function clubScope<T>(db: Pool, p: Principal, write: boolean, fn: (s: ClubScope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    const rights = permissions(a.role, a.grants);
    const manage = a.role === "club_president" || rights.includes("dues.manage");
    if (!manage && !rights.includes("dues.read")) throw new AccessError("FORBIDDEN");
    if (write && !manage) throw new AccessError("FORBIDDEN");
    // Dues are created when a period opens: on reading too, so the page is never behind.
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    await ensureDues(c, a.organization_id);
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Finances > Affiliations: this club's fees and dues (two years back), with their state. */
export async function clubAffiliationsView(db: Pool, p: Principal) {
  return clubScope(db, p, false, async (s) => {
    const today = brusselsToday();
    const fees = (
      await s.c.query(
        `SELECT ${feeColumns},o.kind AS owner_kind,o.name AS owner_name,ct.full_name AS contact_name,ct.email AS contact_email,ct.phone AS contact_phone
           FROM affiliation_fee f JOIN organization o ON o.id=f.organization_id LEFT JOIN contact ct ON ct.id=f.contact_id AND ct.organization_id=f.organization_id
          WHERE f.id=ANY($1::uuid[])`,
        [(await feesOf(s.c, s.org)).map((f) => f.id)],
      )
    ).rows;
    const dues = (
      await s.c.query(
        `SELECT ${dueColumns} FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id JOIN organization o ON o.id=f.organization_id
          WHERE d.organization_id=$1 AND d.opens_on>=CURRENT_DATE-interval '2 years' ORDER BY d.due_on DESC,f.name`,
        [s.org],
      )
    ).rows as DueRow[];
    return {
      organization_id: s.org,
      today,
      canManage: s.manage,
      fees,
      dues: dues.map((d) => ({ ...d, state: dueState(d, today) })),
      contacts: s.manage
        ? (await s.c.query("SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 ORDER BY lower(full_name) LIMIT 500", [s.org])).rows
        : [],
    };
  });
}

async function checkContact(c: PoolClient, owner: string, contactId: string | null) {
  if (contactId && !(await c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [contactId, owner])).rowCount) throw new AccessError("NOT_FOUND", 404);
}
async function insertFee(c: PoolClient, owner: string, userId: string, f: Extract<ClubAffiliationCommand, { action: "addFee" }>, allClubs = true) {
  if (!feeRuleValid(f)) throw new AccessError("INVALID_INPUT", 400);
  await checkContact(c, owner, f.contactId);
  return (
    await c.query(
      `INSERT INTO affiliation_fee(organization_id,name,description,contact_id,basis,frequency,amount_cents,opens_month,opens_day,due_days,due_month,due_day,all_clubs,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [owner, f.name, f.description, f.contactId, f.basis, f.frequency, f.amountCents, f.opensMonth, f.opensDay, f.dueDays, f.dueMonth, f.dueDay, allClubs, userId],
    )
  ).rows[0].id as string;
}

export async function clubAffiliationsExecute(db: Pool, p: Principal, command: ClubAffiliationCommand, expected: string) {
  return clubScope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "addFee") {
        const id = await insertFee(s.c, s.org, s.userId, command);
        await ensureDues(s.c, s.org);
        await audit(s.c, s.org, s.userId, "affiliation.fee.added", id);
        return { ok: true as const, id };
      }
      if (command.action === "archiveFee") {
        // Only the club's own definitions: the federation's are archived by the federation.
        const r = await s.c.query("UPDATE affiliation_fee SET archived=true,version=version+1 WHERE id=$1 AND organization_id=$2 AND NOT archived RETURNING id", [command.id, s.org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(s.c, s.org, s.userId, "affiliation.fee.archived", command.id);
        return { ok: true as const };
      }
      const due = (
        await s.c.query(
          `SELECT ${dueColumns} FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id JOIN organization o ON o.id=f.organization_id WHERE d.id=$1 AND d.organization_id=$2 FOR UPDATE OF d`,
          [command.id, s.org],
        )
      ).rows[0] as DueRow | undefined;
      if (!due) throw new AccessError("NOT_FOUND", 404);
      if (due.paid_on) throw new AccessError("ALREADY_PAID", 409);
      if (command.paidOn > brusselsToday()) throw new AccessError("INVALID_DATE", 400);
      let transaction: string | null = null;
      if (command.createExpense && due.amount_cents > 0)
        transaction = (
          await s.c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by) VALUES($1,$2,$3,'out','affiliation',$4,$5,$6,$7,'',$8) RETURNING id",
            [s.org, command.paidOn, `${due.name} ${due.period}`.slice(0, 160), due.amount_cents, command.method, due.owner_kind === "federation" ? due.owner_name.slice(0, 160) : "", due.period, s.userId],
          )
        ).rows[0].id;
      await s.c.query("UPDATE affiliation_due SET paid_on=$2,marked_by=$3,transaction_id=$4 WHERE id=$1", [due.id, command.paidOn, s.userId, transaction]);
      await audit(s.c, s.org, s.userId, "affiliation.paid", due.id);
      return { ok: true as const, transaction, undo: await offerUndo(s.c, s.org, s.userId, "affiliationPaid", due.id, { transaction }) };
    },
    expected,
  );
}

type FedScope = { c: PoolClient; fed: string; userId: string; manage: boolean };
async function federationScope<T>(db: Pool, p: Principal, write: boolean, fn: (s: FedScope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    if (!["federation_president", "federation_worker"].includes(a.role)) throw new AccessError("FORBIDDEN");
    await account(c, p);
    const manage = a.role === "federation_president";
    if (write && !manage) throw new AccessError("FORBIDDEN");
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const clubs = (await c.query("SELECT id FROM organization WHERE kind='club' AND federation_id=$1 ORDER BY id", [a.organization_id])).rows.map((r) => r.id as string);
    for (const club of clubs) await ensureDues(c, club);
    const out = await fn({ c, fed: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** The federation's fees, and for each club whether its current due is paid, to pay or late. */
export async function federationAffiliationsView(db: Pool, p: Principal) {
  return federationScope(db, p, false, async (s) => {
    const today = brusselsToday();
    const fees = (
      await s.c.query(
        `SELECT ${feeColumns},ct.full_name AS contact_name,COALESCE((SELECT array_agg(x.club_id) FROM affiliation_fee_club x WHERE x.fee_id=f.id),'{}') AS club_ids
           FROM affiliation_fee f LEFT JOIN contact ct ON ct.id=f.contact_id AND ct.organization_id=f.organization_id
          WHERE f.organization_id=$1 AND NOT f.archived ORDER BY f.created_at`,
        [s.fed],
      )
    ).rows;
    const clubs = (await s.c.query("SELECT id,name FROM organization WHERE kind='club' AND federation_id=$1 ORDER BY lower(name)", [s.fed])).rows as { id: string; name: string }[];
    // The latest due of each fee for each club: what the club owes the federation, nothing of its other finances.
    const dues = (
      await s.c.query(
        `SELECT DISTINCT ON (d.fee_id,d.organization_id) d.id,d.fee_id,d.organization_id AS club_id,c.name AS club,d.period,d.due_on::text AS due_on,d.amount_cents,d.players,d.paid_on::text AS paid_on
           FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id AND f.organization_id=$1 JOIN organization c ON c.id=d.organization_id
          WHERE NOT f.archived ORDER BY d.fee_id,d.organization_id,d.opens_on DESC`,
        [s.fed],
      )
    ).rows as { id: string; fee_id: string; club_id: string; club: string; period: string; due_on: string; amount_cents: number; players: number | null; paid_on: string | null }[];
    return {
      organization_id: s.fed,
      today,
      canManage: s.manage,
      fees,
      clubs,
      dues: dues.map((d) => ({ ...d, state: dueState(d, today) })),
      contacts: (await s.c.query("SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 ORDER BY lower(full_name) LIMIT 500", [s.fed])).rows,
    };
  });
}

export async function federationAffiliationsExecute(db: Pool, p: Principal, command: FederationAffiliationCommand, expected: string) {
  return federationScope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "addFee") {
        const clubIds = [...new Set(command.clubIds)];
        if (!command.allClubs) {
          if (!clubIds.length) throw new AccessError("INVALID_INPUT", 400);
          const mine = (await s.c.query("SELECT count(*)::int AS n FROM organization WHERE id=ANY($1::uuid[]) AND kind='club' AND federation_id=$2", [clubIds, s.fed])).rows[0].n;
          if (mine !== clubIds.length) throw new AccessError("NOT_FOUND", 404);
        }
        const id = await insertFee(s.c, s.fed, s.userId, { ...command, action: "addFee" }, command.allClubs);
        if (!command.allClubs) for (const club of clubIds) await s.c.query("INSERT INTO affiliation_fee_club(fee_id,club_id) VALUES($1,$2)", [id, club]);
        for (const club of (await s.c.query("SELECT id FROM organization WHERE kind='club' AND federation_id=$1", [s.fed])).rows) await ensureDues(s.c, club.id);
        await audit(s.c, s.fed, s.userId, "affiliation.fee.added", id);
        return { ok: true as const, id };
      }
      if (command.action === "archiveFee") {
        const r = await s.c.query("UPDATE affiliation_fee SET archived=true,version=version+1 WHERE id=$1 AND organization_id=$2 AND NOT archived RETURNING id", [command.id, s.fed]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(s.c, s.fed, s.userId, "affiliation.fee.archived", command.id);
        return { ok: true as const };
      }
      // A reminder to the presidents of the clubs late on the federation's fees (once a day per due).
      const today = brusselsToday();
      const late = (
        await s.c.query(
          `SELECT d.id,d.organization_id,c.name AS club,f.name,d.period,d.due_on::text AS due_on,u.id AS user_id,u.email,u.name AS person,COALESCE(pe.locale,'fr') AS locale
             FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id AND f.organization_id=$1 AND NOT f.archived JOIN organization c ON c.id=d.organization_id
             JOIN role_assignment r ON r.organization_id=d.organization_id AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
             JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
            WHERE d.paid_on IS NULL AND d.due_on<$2 AND ($3::uuid IS NULL OR d.fee_id=$3)`,
          [s.fed, today, command.feeId],
        )
      ).rows;
      const base = process.env.BETTER_AUTH_URL ?? "";
      for (const x of late)
        await publish(s.c, {
          organizationId: x.organization_id,
          userId: x.user_id,
          email: x.email,
          kind: "funding_task",
          category: "administrative",
          resourceType: "funding",
          resourceId: x.id,
          eventKey: `affiliation_reminder:${x.id}:${today}:${x.user_id}`,
          locale: x.locale,
          variables: { name: x.person, organization: x.club, url: `${base}/${x.locale}/funding/affiliations`, title: `${x.name} ${x.period}`, due: x.due_on },
        });
      await audit(s.c, s.fed, s.userId, "affiliation.reminded", command.feeId ?? s.fed);
      return { ok: true as const, clubs: new Set(late.map((x) => x.organization_id)).size };
    },
    expected,
  );
}

/**
 * The worker's tick: opens the new periods of every club and tells its
 * presidents once: « Renouvellement : Affiliation BPCF 2026-27 à payer avant
 * le 30 septembre ».
 */
export async function affiliationTick(db: Pool) {
  const today = brusselsToday();
  const base = process.env.BETTER_AUTH_URL ?? "";
  let sent = 0;
  const clubs = (await db.query("SELECT id FROM organization WHERE kind='club' AND NOT ('finance'=ANY(disabled_modules))")).rows as { id: string }[];
  for (const club of clubs) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
      await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [club.id]);
      await ensureDues(c, club.id, today);
      const fresh = (
        await c.query(
          `SELECT d.id,d.period,d.due_on::text AS due_on,f.name,c.name AS club,u.id AS user_id,u.email,u.name AS person,COALESCE(pe.locale,'fr') AS locale
             FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id JOIN organization c ON c.id=d.organization_id
             JOIN role_assignment r ON r.organization_id=d.organization_id AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
             JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
            WHERE d.organization_id=$1 AND d.notified_at IS NULL AND d.paid_on IS NULL`,
          [club.id],
        )
      ).rows;
      for (const x of fresh) {
        const due = new Intl.DateTimeFormat(x.locale === "en" ? "en-GB" : `${x.locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(x.due_on + "T12:00:00Z"));
        const title = { fr: "Renouvellement", nl: "Hernieuwing", en: "Renewal" }[x.locale as "fr" | "nl" | "en"] ?? "Renouvellement";
        await publish(c, {
          organizationId: club.id,
          userId: x.user_id,
          email: x.email,
          kind: "funding_task",
          category: "administrative",
          resourceType: "funding",
          resourceId: x.id,
          eventKey: `affiliation_open:${x.id}:${x.user_id}`,
          locale: x.locale,
          variables: { name: x.person, organization: x.club, url: `${base}/${x.locale}/funding/affiliations`, title: `${title}${x.locale === "fr" ? " :" : ":"} ${x.name} ${x.period}`, due },
        });
        sent++;
      }
      await c.query("UPDATE affiliation_due SET notified_at=now() WHERE organization_id=$1 AND notified_at IS NULL", [club.id]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}
