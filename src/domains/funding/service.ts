import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import {
  grantNext,
  partnerNext,
  type ContactCommand,
  type FundingCommand,
  type GrantStatus,
} from "./schema";

type Scope = {
  c: PoolClient;
  org: string;
  userId: string;
  /** Money: dues.read sees grants and partners, dues.manage changes them. */
  moneyRead: boolean;
  moneyManage: boolean;
  /** Contact book: staff read it; people or mail managers and the president edit it. */
  contactsRead: boolean;
  contactsManage: boolean;
};

async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: Scope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [
      a.organization_id,
    ]);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const has = (...r: string[]) => mfa && r.some((x) => rights.includes(x as (typeof rights)[number]));
    const staff = a.role === "club_president" || a.role === "coach";
    const s: Scope = {
      c,
      org: a.organization_id,
      userId: p.userId,
      moneyRead: has("dues.read", "dues.manage"),
      moneyManage: has("dues.manage"),
      contactsRead: staff && mfa,
      contactsManage: has("mandates.manage", "people.manage", "notifications.manage"),
    };
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    if ((e as { code?: string }).code === "23503") throw new AccessError("NOT_FOUND", 404);
    throw e;
  } finally {
    c.release();
  }
}
async function log(s: Scope, action: string, target: string, details: unknown = {}) {
  await s.c.query(
    "INSERT INTO audit_log(organization_id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)",
    [s.org, s.userId, action, target, JSON.stringify(details)],
  );
}

export type ContactRow = {
  id: string;
  full_name: string;
  organization_name: string;
  role: string;
  email: string;
  phone: string;
  tags: string[];
  notes: string;
  archived: boolean;
  version: number;
  updated_at: string;
  /** Where the contact is used: grants and partners linked to it. */
  grants: number;
  partners: number;
};
const selectContacts =
  "SELECT c.id,c.full_name,c.organization_name,c.role,c.email,c.phone,c.tags,c.notes,c.archived,c.version,c.updated_at::text AS updated_at,(SELECT count(*)::int FROM grant_application g WHERE g.contact_id=c.id) AS grants,(SELECT count(*)::int FROM partner p WHERE p.contact_id=c.id) AS partners FROM contact c WHERE c.organization_id=$1";

export async function contactsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    if (!s.contactsRead) throw new AccessError("FORBIDDEN");
    const contacts = (
      await s.c.query(selectContacts + " ORDER BY c.archived,c.full_name", [s.org])
    ).rows as ContactRow[];
    return { organization_id: s.org, can: { manage: s.contactsManage }, contacts };
  });
}
export async function contactsExecute(db: Pool, p: Principal, cmd: ContactCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (!s.contactsManage) throw new AccessError("FORBIDDEN");
      if (cmd.id) {
        const changed = await s.c.query(
          "UPDATE contact SET full_name=$3,organization_name=$4,role=$5,email=$6,phone=$7,tags=$8,notes=$9,archived=COALESCE($10,archived),version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
          [cmd.id, s.org, cmd.fullName, cmd.organizationName, cmd.role, cmd.email, cmd.phone, cmd.tags, cmd.notes, cmd.archived ?? null],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await log(s, "contact.update", cmd.id);
        return { id: cmd.id };
      }
      const id = (
        await s.c.query(
          "INSERT INTO contact(organization_id,full_name,organization_name,role,email,phone,tags,notes,archived,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
          [s.org, cmd.fullName, cmd.organizationName, cmd.role, cmd.email, cmd.phone, cmd.tags, cmd.notes, cmd.archived ?? false, s.userId],
        )
      ).rows[0].id as string;
      await log(s, "contact.create", id);
      return { id };
    },
    expected,
  );
}

export type GrantRow = {
  id: string;
  season_id: string | null;
  season_name: string | null;
  funder: string;
  program: string;
  purpose: string;
  requested_cents: number;
  granted_cents: number | null;
  status: GrantStatus;
  deadline_on: string | null;
  submitted_on: string | null;
  decision_on: string | null;
  paid_on: string | null;
  report_due_on: string | null;
  contact_id: string | null;
  contact_name: string | null;
  notes: string;
  version: number;
  next: ReturnType<typeof grantNext>;
};
export type PartnerRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  amount_cents: number;
  in_kind: string;
  counterpart: string;
  starts_on: string | null;
  ends_on: string | null;
  next_action_on: string | null;
  next_action: string;
  contact_id: string | null;
  contact_name: string | null;
  notes: string;
  version: number;
  next: ReturnType<typeof partnerNext>;
};
const selectGrants =
  "SELECT g.id,g.season_id,se.name AS season_name,g.funder,g.program,g.purpose,g.requested_cents,g.granted_cents,g.status,g.deadline_on::text AS deadline_on,g.submitted_on::text AS submitted_on,g.decision_on::text AS decision_on,g.paid_on::text AS paid_on,g.report_due_on::text AS report_due_on,g.contact_id,c.full_name AS contact_name,g.notes,g.version FROM grant_application g LEFT JOIN season se ON se.id=g.season_id LEFT JOIN contact c ON c.id=g.contact_id WHERE g.organization_id=$1";
const selectPartners =
  "SELECT p.id,p.name,p.kind,p.status,p.amount_cents,p.in_kind,p.counterpart,p.starts_on::text AS starts_on,p.ends_on::text AS ends_on,p.next_action_on::text AS next_action_on,p.next_action,p.contact_id,c.full_name AS contact_name,p.notes,p.version FROM partner p LEFT JOIN contact c ON c.id=p.contact_id WHERE p.organization_id=$1";

/** Grants and partners together: one page each, one view (the lists are small). */
export async function fundingView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    if (!s.moneyRead) throw new AccessError("FORBIDDEN");
    const grants = (
      await s.c.query(selectGrants + " ORDER BY COALESCE(g.deadline_on,g.report_due_on,g.submitted_on,g.decision_on) NULLS LAST,g.funder", [s.org])
    ).rows.map((g) => ({ ...g, next: grantNext(g) })) as GrantRow[];
    const partners = (
      await s.c.query(selectPartners + " ORDER BY p.status='ended',p.name", [s.org])
    ).rows.map((r) => ({ ...r, next: partnerNext(r) })) as PartnerRow[];
    const contacts = s.contactsRead
      ? ((
          await s.c.query(
            "SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY full_name",
            [s.org],
          )
        ).rows as { id: string; full_name: string; organization_name: string }[])
      : [];
    const seasons = (
      await s.c.query("SELECT id,name FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC", [s.org])
    ).rows as { id: string; name: string }[];
    // Money actually received this season from grants and partners, from the ledger.
    const received = (
      await s.c.query(
        "SELECT category,COALESCE(sum(amount_cents),0)::int AS cents FROM finance_transaction WHERE organization_id=$1 AND direction='in' AND cancelled_at IS NULL AND category IN ('subsidy','sponsor','donation') AND occurred_on>=CURRENT_DATE-interval '365 days' GROUP BY category",
        [s.org],
      )
    ).rows as { category: string; cents: number }[];
    return {
      organization_id: s.org,
      can: { manage: s.moneyManage, contacts: s.contactsRead },
      grants,
      partners,
      contacts,
      seasons,
      received: Object.fromEntries(received.map((r) => [r.category, r.cents])) as Record<string, number>,
    };
  });
}

export async function fundingExecute(db: Pool, p: Principal, cmd: FundingCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (!s.moneyManage) throw new AccessError("FORBIDDEN");
      const contactOk = async (id: string | null | undefined) => {
        if (!id) return;
        if (!(await s.c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [id, s.org])).rowCount)
          throw new AccessError("NOT_FOUND", 404);
      };
      switch (cmd.action) {
        case "grant": {
          await contactOk(cmd.contactId);
          const values = [
            cmd.seasonId ?? null,
            cmd.funder,
            cmd.program,
            cmd.purpose,
            cmd.requestedCents,
            cmd.grantedCents ?? null,
            cmd.status,
            cmd.deadlineOn ?? null,
            cmd.submittedOn ?? null,
            cmd.decisionOn ?? null,
            cmd.paidOn ?? null,
            cmd.reportDueOn ?? null,
            cmd.contactId ?? null,
            cmd.notes,
          ];
          if (cmd.id) {
            const changed = await s.c.query(
              "UPDATE grant_application SET season_id=$3,funder=$4,program=$5,purpose=$6,requested_cents=$7,granted_cents=$8,status=$9,deadline_on=$10,submitted_on=$11,decision_on=$12,paid_on=$13,report_due_on=$14,contact_id=$15,notes=$16,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
              [cmd.id, s.org, ...values],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await log(s, "grant.update", cmd.id, { status: cmd.status });
            return { id: cmd.id };
          }
          const id = (
            await s.c.query(
              "INSERT INTO grant_application(organization_id,season_id,funder,program,purpose,requested_cents,granted_cents,status,deadline_on,submitted_on,decision_on,paid_on,report_due_on,contact_id,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id",
              [s.org, ...values, s.userId],
            )
          ).rows[0].id as string;
          await log(s, "grant.create", id, { funder: cmd.funder });
          return { id };
        }
        case "deleteGrant": {
          const gone = await s.c.query("DELETE FROM grant_application WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "grant.delete", cmd.id);
          return { id: cmd.id };
        }
        case "partner": {
          await contactOk(cmd.contactId);
          const values = [
            cmd.name,
            cmd.kind,
            cmd.status,
            cmd.amountCents,
            cmd.inKind,
            cmd.counterpart,
            cmd.startsOn ?? null,
            cmd.endsOn ?? null,
            cmd.nextActionOn ?? null,
            cmd.nextAction,
            cmd.contactId ?? null,
            cmd.notes,
          ];
          if (cmd.id) {
            const changed = await s.c.query(
              "UPDATE partner SET name=$3,kind=$4,status=$5,amount_cents=$6,in_kind=$7,counterpart=$8,starts_on=$9,ends_on=$10,next_action_on=$11,next_action=$12,contact_id=$13,notes=$14,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
              [cmd.id, s.org, ...values],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await log(s, "partner.update", cmd.id, { status: cmd.status });
            return { id: cmd.id };
          }
          const id = (
            await s.c.query(
              "INSERT INTO partner(organization_id,name,kind,status,amount_cents,in_kind,counterpart,starts_on,ends_on,next_action_on,next_action,contact_id,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
              [s.org, ...values, s.userId],
            )
          ).rows[0].id as string;
          await log(s, "partner.create", id, { name: cmd.name });
          return { id };
        }
        case "deletePartner": {
          const gone = await s.c.query("DELETE FROM partner WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "partner.delete", cmd.id);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}

/** Dates within the horizon for the home agenda (money managers and readers). */
export async function fundingDeadlines(c: PoolClient, org: string, days: number) {
  const grants = (await c.query(selectGrants + " AND g.status IN ('idea','submitted','granted','paid')", [org])).rows as GrantRow[];
  const partners = (await c.query(selectPartners + " AND p.status<>'ended'", [org])).rows as PartnerRow[];
  const limit = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const out: { kind: "grant" | "partner"; date: string; title: string; href: string; id: string }[] = [];
  for (const g of grants) {
    const n = grantNext(g);
    if (n && n.date <= limit)
      out.push({ kind: "grant", date: n.date, title: `${g.funder}${g.program ? " · " + g.program : ""}`, href: "/funding/grants", id: "grant:" + g.id });
  }
  for (const p of partners) {
    const n = partnerNext(p);
    if (n && n.date <= limit)
      out.push({ kind: "partner", date: n.date, title: n.kind === "action" && p.next_action ? `${p.name} · ${p.next_action}` : p.name, href: "/funding/partners", id: "partner:" + p.id });
  }
  return out;
}
