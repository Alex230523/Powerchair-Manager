import type { Pool, PoolClient } from "pg";
import { AccessError, audit } from "../access/service";
import { permissions } from "../access/policy";
import { brusselsToday } from "../people/service";
import { publish } from "../notifications/queue";
import type { Scope } from "./service";
import { freeFor, returnReminderDue, type Command } from "./schema";

/**
 * Wave 17 (Q1): chair loans within a federation. A club (or the federation,
 * with its own fleet) lends a chair to another club, or a club asks for a
 * chair marked « Prêtable »; the lender accepts, hands it over (state on
 * departure), then notes the return (state on return). The borrower only
 * ever sees what it needs of the chair: name, model, owner, storage place
 * and the dates. Seven days before the end, both sides are reminded.
 */
type Lang = "fr" | "nl" | "en";
type LoanCommand = Extract<Command, { action: "lend" | "requestLoan" | "decideLoan" | "handOver" | "returnLoan" | "cancelLoan" }>;
type Recipient = { id: string; email: string; name: string; locale: Lang; organization: string };

const family = "(o.id=$2 OR (o.federation_id=$2 AND o.kind='club'))";
const loanFields =
  "l.id,l.chair_id,l.lender_id,l.borrower_id,l.starts_on::text AS starts_on,l.ends_on::text AS ends_on,l.status,l.conditions,l.deposit_cents,l.message,l.condition_out,l.condition_in,l.decision_note,l.initiated_by,l.created_at,l.version";
export type Loan = {
  id: string;
  chair_id: string;
  chair: string;
  lender_id: string;
  lender: string;
  borrower_id: string;
  borrower: string;
  starts_on: string;
  ends_on: string;
  status: "requested" | "accepted" | "ongoing" | "returned" | "refused" | "cancelled";
  conditions: string;
  deposit_cents: number | null;
  message: string;
  condition_out: string;
  condition_in: string;
  decision_note: string;
  initiated_by: "lender" | "borrower";
  created_at: string;
  version: number;
  model_brand: string | null;
  model_name: string | null;
  storage_name: string | null;
  storage_address: string | null;
};

export async function loansView(s: Scope) {
  const org = s.a.organization_id;
  const empty = { lent: [] as Loan[], borrowed: [] as Loan[], available: [] as Available[], partners: [] as { id: string; name: string }[], can: false };
  if (!s.manage || !s.fed) return empty;
  const base = `SELECT ${loanFields},c.name AS chair,lo.name AS lender,bo.name AS borrower,cm.brand AS model_brand,cm.name AS model_name,sl.name AS storage_name,sl.address AS storage_address
    FROM equipment_loan l JOIN equipment_chair c ON c.id=l.chair_id JOIN organization lo ON lo.id=l.lender_id JOIN organization bo ON bo.id=l.borrower_id
    LEFT JOIN chair_model cm ON cm.id=c.model_id LEFT JOIN storage_location sl ON sl.id=c.storage_location_id`;
  const recent = "(l.status IN ('requested','accepted','ongoing') OR l.created_at>now()-interval '365 days')";
  const order = "ORDER BY (l.status='requested') DESC,(l.status IN ('accepted','ongoing')) DESC,l.starts_on DESC LIMIT 300";
  const lent = (await s.c.query(`${base} WHERE l.lender_id=$1 AND ${recent} ${order}`, [org])).rows as Loan[];
  const borrowed = (await s.c.query(`${base} WHERE l.borrower_id=$1 AND ${recent} ${order}`, [org])).rows as Loan[];
  const available = (
    await s.c.query(
      `SELECT c.id,c.name,o.id AS owner_id,o.name AS owner,o.kind AS owner_kind,cm.brand AS model_brand,cm.name AS model_name,cm.status AS model_status,sl.name AS storage_name,c.max_speed_kmh::text AS max_speed_kmh,
              COALESCE((SELECT json_agg(json_build_object('starts_on',l.starts_on,'ends_on',l.ends_on,'status',l.status) ORDER BY l.starts_on) FROM equipment_loan l
                         WHERE l.chair_id=c.id AND l.status IN ('accepted','ongoing') AND l.ends_on>=CURRENT_DATE),'[]') AS busy
         FROM equipment_chair c JOIN organization o ON o.id=c.organization_id LEFT JOIN chair_model cm ON cm.id=c.model_id LEFT JOIN storage_location sl ON sl.id=c.storage_location_id
        WHERE c.lendable AND c.status<>'retired' AND c.organization_id<>$1 AND ${family}
        ORDER BY o.kind='federation' DESC,lower(o.name),lower(c.name) LIMIT 300`,
      [org, s.fed],
    )
  ).rows as Available[];
  const partners = (await s.c.query(`SELECT o.id,o.name FROM organization o WHERE o.id<>$1 AND ${family} ORDER BY o.kind='federation' DESC,lower(o.name)`, [org, s.fed])).rows as {
    id: string;
    name: string;
  }[];
  return { lent, borrowed, available, partners, can: true };
}
export type Available = {
  id: string;
  name: string;
  owner_id: string;
  owner: string;
  owner_kind: "club" | "federation";
  model_brand: string | null;
  model_name: string | null;
  model_status: string | null;
  storage_name: string | null;
  max_speed_kmh: string | null;
  busy: { starts_on: string; ends_on: string; status: string }[];
};

/** The people who handle the material of an organisation, with an account. */
async function managers(c: PoolClient, org: string) {
  const rows = (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization,o.kind,r.role,r.grants
         FROM role_assignment r JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id JOIN organization o ON o.id=r.organization_id
        WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active`,
      [org],
    )
  ).rows as (Recipient & { kind: string; role: string; grants: string[] })[];
  const out = new Map<string, Recipient>();
  for (const r of rows)
    if (r.kind === "federation" ? ["federation_president", "federation_worker"].includes(r.role) : permissions(r.role as never, r.grants ?? []).includes("equipment.manage"))
      out.set(r.id, { id: r.id, email: r.email, name: r.name, locale: (["fr", "nl", "en"].includes(r.locale) ? r.locale : "fr") as Lang, organization: r.organization });
  return [...out.values()];
}
const words: Record<"requested" | "lent" | "accepted" | "refused" | "cancelled" | "returnBorrower" | "returnLender", Record<Lang, string>> = {
  requested: { fr: "Demande de prêt du fauteuil {chair} par {club}", nl: "Uitleenaanvraag voor rolstoel {chair} door {club}", en: "Loan request for chair {chair} from {club}" },
  lent: { fr: "Le fauteuil {chair} vous est prêté par {club}", nl: "Rolstoel {chair} wordt u uitgeleend door {club}", en: "Chair {chair} is lent to you by {club}" },
  accepted: { fr: "Prêt du fauteuil {chair} accepté par {club}", nl: "Uitlening van rolstoel {chair} aanvaard door {club}", en: "Loan of chair {chair} accepted by {club}" },
  refused: { fr: "Prêt du fauteuil {chair} refusé par {club}", nl: "Uitlening van rolstoel {chair} geweigerd door {club}", en: "Loan of chair {chair} refused by {club}" },
  cancelled: { fr: "Prêt du fauteuil {chair} annulé par {club}", nl: "Uitlening van rolstoel {chair} geannuleerd door {club}", en: "Loan of chair {chair} cancelled by {club}" },
  returnBorrower: { fr: "Rendre le fauteuil {chair} à {club}", nl: "Rolstoel {chair} terugbrengen naar {club}", en: "Return chair {chair} to {club}" },
  returnLender: { fr: "Retour du fauteuil {chair} prêté à {club}", nl: "Terugkeer van rolstoel {chair} uitgeleend aan {club}", en: "Return of chair {chair} lent to {club}" },
};
async function tell(c: PoolClient, org: string, what: keyof typeof words, vars: { chair: string; club: string; due: string }, key: string) {
  for (const u of await managers(c, org))
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "funding_task",
      category: "administrative",
      resourceType: "team",
      resourceId: key,
      eventKey: `equipment_loan:${key}:${what}:${u.id}`,
      locale: u.locale,
      inApp: true,
      variables: {
        name: u.name,
        organization: u.organization,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/equipment`,
        title: words[what][u.locale].replace("{chair}", vars.chair).replace("{club}", vars.club),
        due: vars.due,
      },
    });
}
/** The loan's trace on the chair's own history (the lender's). */
async function trace(s: Scope, loan: { lender_id: string; chair_id: string; id: string }, action: string, details: Record<string, unknown>) {
  await s.c.query("INSERT INTO equipment_history(organization_id,chair_id,actor_id,action,before_data,after_data) VALUES($1,$2,$3,$4,NULL,$5)", [
    loan.lender_id,
    loan.chair_id,
    s.p.userId,
    "loan." + action,
    JSON.stringify({ loan: loan.id, ...details }),
  ]);
  await audit(s.c, s.a.organization_id, s.p.userId, "equipment.loan." + action, loan.id);
}
async function busy(c: PoolClient, chair: string, range: { starts_on: string; ends_on: string }, except: string | null = null) {
  const loans = (
    await c.query("SELECT status,starts_on::text AS starts_on,ends_on::text AS ends_on FROM equipment_loan WHERE chair_id=$1 AND status IN ('accepted','ongoing') AND id IS DISTINCT FROM $2", [chair, except])
  ).rows;
  return !freeFor(loans, range);
}

export async function loanExecute(s: Scope, input: LoanCommand) {
  if (!s.manage) throw new AccessError("FORBIDDEN");
  if (!s.fed) throw new AccessError("NO_FEDERATION", 409);
  const org = s.a.organization_id,
    today = brusselsToday();
  const dates = (startsOn: string, endsOn: string) => {
    if (endsOn < startsOn || startsOn < today) throw new AccessError("LOAN_DATES", 400);
    return { starts_on: startsOn, ends_on: endsOn };
  };

  if (input.action === "lend") {
    const chair = (await s.c.query("SELECT id,name,status FROM equipment_chair WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.chairId, org])).rows[0];
    if (!chair) throw new AccessError("NOT_FOUND", 404);
    if (chair.status === "retired") throw new AccessError("INVALID_TRANSITION", 409);
    const partner = (await s.c.query(`SELECT o.id,o.name FROM organization o WHERE o.id=$1 AND o.id<>$3 AND ${family}`, [input.borrowerId, s.fed, org])).rows[0];
    if (!partner) throw new AccessError("NOT_FOUND", 404);
    const range = dates(input.startsOn, input.endsOn);
    if (await busy(s.c, chair.id, range)) throw new AccessError("LOAN_OVERLAP", 409);
    const id = (
      await s.c.query(
        `INSERT INTO equipment_loan(chair_id,lender_id,borrower_id,starts_on,ends_on,conditions,deposit_cents,status,initiated_by,created_by,decided_by,decided_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'accepted','lender',$8,$8,now()) RETURNING id`,
        [chair.id, org, partner.id, range.starts_on, range.ends_on, input.conditions, input.depositCents, s.p.userId],
      )
    ).rows[0].id as string;
    await trace(s, { id, chair_id: chair.id, lender_id: org }, "lend", { borrower: partner.name, ...range });
    await tell(s.c, partner.id, "lent", { chair: chair.name, club: s.orgName, due: range.starts_on }, id);
    return { id };
  }

  if (input.action === "requestLoan") {
    const chair = (
      await s.c.query(
        `SELECT c.id,c.name,c.organization_id FROM equipment_chair c JOIN organization o ON o.id=c.organization_id
          WHERE c.id=$1 AND c.lendable AND c.status<>'retired' AND c.organization_id<>$3 AND ${family} FOR UPDATE OF c`,
        [input.chairId, s.fed, org],
      )
    ).rows[0];
    if (!chair) throw new AccessError("NOT_FOUND", 404);
    const range = dates(input.startsOn, input.endsOn);
    if (await busy(s.c, chair.id, range)) throw new AccessError("LOAN_OVERLAP", 409);
    const id = (
      await s.c.query(
        "INSERT INTO equipment_loan(chair_id,lender_id,borrower_id,starts_on,ends_on,message,status,initiated_by,created_by) VALUES($1,$2,$3,$4,$5,$6,'requested','borrower',$7) RETURNING id",
        [chair.id, chair.organization_id, org, range.starts_on, range.ends_on, input.message, s.p.userId],
      )
    ).rows[0].id as string;
    await trace(s, { id, chair_id: chair.id, lender_id: chair.organization_id }, "request", { borrower: s.orgName, ...range });
    await tell(s.c, chair.organization_id, "requested", { chair: chair.name, club: s.orgName, due: range.starts_on }, id);
    return { id };
  }

  const loan = (
    await s.c.query(
      `SELECT ${loanFields},c.name AS chair FROM equipment_loan l JOIN equipment_chair c ON c.id=l.chair_id WHERE l.id=$1 AND (l.lender_id=$2 OR l.borrower_id=$2) FOR UPDATE OF l`,
      [input.id, org],
    )
  ).rows[0] as (Loan & { chair: string }) | undefined;
  if (!loan) throw new AccessError("NOT_FOUND", 404);
  const lender = loan.lender_id === org;
  const other = lender ? loan.borrower_id : loan.lender_id;

  if (input.action === "cancelLoan") {
    if (!["requested", "accepted"].includes(loan.status)) throw new AccessError("INVALID_TRANSITION", 409);
    await s.c.query("UPDATE equipment_loan SET status='cancelled',version=version+1 WHERE id=$1", [loan.id]);
    await trace(s, loan, "cancel", { by: s.orgName });
    await tell(s.c, other, "cancelled", { chair: loan.chair, club: s.orgName, due: loan.starts_on }, loan.id);
    return { id: loan.id };
  }
  // Every other step is the lender's.
  if (!lender) throw new AccessError("FORBIDDEN");
  if (input.action === "decideLoan") {
    if (loan.status !== "requested") throw new AccessError("INVALID_TRANSITION", 409);
    if (input.decision === "accepted" && (await busy(s.c, loan.chair_id, loan, loan.id))) throw new AccessError("LOAN_OVERLAP", 409);
    await s.c.query(
      "UPDATE equipment_loan SET status=$2,decision_note=$3,conditions=COALESCE($4,conditions),deposit_cents=CASE WHEN $6 THEN $5 ELSE deposit_cents END,decided_by=$7,decided_at=now(),version=version+1 WHERE id=$1",
      [loan.id, input.decision, input.note, input.conditions ?? null, input.depositCents ?? null, input.depositCents !== undefined, s.p.userId],
    );
    await trace(s, loan, input.decision === "accepted" ? "accept" : "refuse", { note: input.note });
    await tell(s.c, other, input.decision, { chair: loan.chair, club: s.orgName, due: loan.starts_on }, loan.id);
    return { id: loan.id };
  }
  if (input.action === "handOver") {
    if (loan.status !== "accepted") throw new AccessError("INVALID_TRANSITION", 409);
    await s.c.query("UPDATE equipment_loan SET status='ongoing',condition_out=$2,handed_at=now(),version=version+1 WHERE id=$1", [loan.id, input.condition]);
    await trace(s, loan, "handOver", { condition: input.condition });
    return { id: loan.id };
  }
  if (loan.status !== "ongoing") throw new AccessError("INVALID_TRANSITION", 409);
  await s.c.query("UPDATE equipment_loan SET status='returned',condition_in=$2,returned_at=now(),version=version+1 WHERE id=$1", [loan.id, input.condition]);
  await trace(s, loan, "return", { condition: input.condition });
  return { id: loan.id };
}

/** Daily: seven days before the end of an ongoing loan, both sides hear it once. */
export async function equipmentLoanTick(db: Pool) {
  const today = brusselsToday();
  const rows = (
    await db.query(
      `SELECT l.id,l.lender_id,l.borrower_id,l.ends_on::text AS ends_on,l.reminded_on::text AS reminded_on,c.name AS chair,lo.name AS lender,bo.name AS borrower
         FROM equipment_loan l JOIN equipment_chair c ON c.id=l.chair_id JOIN organization lo ON lo.id=l.lender_id JOIN organization bo ON bo.id=l.borrower_id
        WHERE l.status='ongoing' AND l.reminded_on IS NULL AND l.ends_on BETWEEN $1::date AND $1::date+7`,
      [today],
    )
  ).rows.filter((r) => returnReminderDue(r.ends_on, today, r.reminded_on));
  let sent = 0;
  for (const r of rows) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await tell(c, r.borrower_id, "returnBorrower", { chair: r.chair, club: r.lender, due: r.ends_on }, r.id);
      await tell(c, r.lender_id, "returnLender", { chair: r.chair, club: r.borrower, due: r.ends_on }, r.id);
      await c.query("UPDATE equipment_loan SET reminded_on=$2 WHERE id=$1", [r.id, today]);
      await c.query("COMMIT");
      sent++;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return sent;
}
