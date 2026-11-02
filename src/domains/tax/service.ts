import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { seal, unseal } from "../notifications/crypto";
import { publish } from "../notifications/queue";
import { brusselsToday } from "../people/service";
import { formatNationalNumber, maskedNationalNumber, normalizeCompanyNumber, normalizeNationalNumber, validCompanyNumber, validNationalNumber } from "./identity";
import { approvalAlert, belcotaxDeadline, controlReport, purgeAfter, yearTotals, type DonorRow, type GiftRow } from "./rules";
import { buildBelcotax, checkBelcotax, type Fiche, type Issue } from "./belcotax";
import { receiptPdf, type ReceiptPrint, type ReceiptSnapshot } from "./receipt-pdf";
import type { TaxCommand } from "./schema";

/**
 * B8: tax receipts for gifts (281.71), only for a club the SPF Finances
 * approved. Off by default: until the club says « oui », every call but the
 * approval refuses. Money rights (dues.manage) run the module; the national
 * number is sealed at rest, shown and typed only with the dedicated right
 * tax.identity, and each access is written to the audit log. It is collected
 * through a private form sent to the donor, never from a transfer.
 */
type Scope = { c: PoolClient; org: string; orgName: string; userId: string; manage: boolean; read: boolean; identity: boolean; approve: boolean; approved: boolean; financeOff: boolean };

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const org = (await c.query(`SELECT tax_approved FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id])).rows[0];
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const s: Scope = {
      c,
      org: a.organization_id,
      orgName: a.organization_name,
      userId: p.userId,
      manage: mfa && rights.includes("dues.manage"),
      read: mfa && (rights.includes("dues.manage") || rights.includes("dues.read")),
      identity: mfa && rights.includes("tax.identity"),
      approve: mfa && rights.includes("mandates.manage"),
      approved: !!org?.tax_approved,
      financeOff: a.disabled_modules.includes("finance"),
    };
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** The module exists only for an approved club, and for the money rights. */
function open(s: Scope, write: boolean) {
  if (!s.approved || s.financeOff) throw new AccessError("TAX_NOT_APPROVED", 404);
  if (!s.read || (write && !s.manage)) throw new AccessError("FORBIDDEN");
}
const aad = (donor: string) => "tax-donor:" + donor;
function nationalHash(org: string, n: string) {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32) throw new Error("MAIL_KEY_MISSING");
  return createHash("sha256").update(`pfm-tax-v1:${secret}:${org}:${n}`).digest("hex");
}
const token = () => randomBytes(32).toString("base64url");
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const base = () => process.env.BETTER_AUTH_URL ?? "";

/* ------------------------------------------------------------ Approval (Réglages › Club) */
export async function taxApprovalView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const o = (
      await s.c.query("SELECT tax_approved,tax_approval_number,tax_approval_from::text,tax_approval_to::text,tax_threshold_cents FROM organization WHERE id=$1", [s.org])
    ).rows[0];
    return { organization_id: s.org, canEdit: s.approve, approved: o.tax_approved as boolean, number: o.tax_approval_number as string, from: o.tax_approval_from as string | null, to: o.tax_approval_to as string | null, thresholdCents: o.tax_threshold_cents as number };
  });
}

/* ------------------------------------------------------------ The module's view */
export async function taxView(db: Pool, p: Principal, year?: number) {
  return scope(db, p, false, async (s) => {
    open(s, false);
    const today = brusselsToday();
    const y = year ?? Number(today.slice(0, 4)) - 1;
    const o = (
      await s.c.query(
        "SELECT name,address,company_number,signatory,tax_approval_number,tax_approval_from::text AS approval_from,tax_approval_to::text AS approval_to,tax_threshold_cents AS threshold FROM organization WHERE id=$1",
        [s.org],
      )
    ).rows[0];
    const donors = (
      await s.c.query(
        `SELECT id,kind,name,street,postal_code,city,country,email,company_number,contact_id,national_sealed IS NOT NULL AS has_national,national_hash,last_gift_on::text,purge_after::text,purged_at IS NOT NULL AS purged,
                (SELECT max(created_at) FROM tax_identity_request r WHERE r.donor_id=d.id AND r.used_at IS NULL AND r.expires_at>now()) AS pending_request
           FROM tax_donor d WHERE organization_id=$1 ORDER BY name`,
        [s.org],
      )
    ).rows as (DonorRow & { street: string; city: string; country: string; email: string; contact_id: string | null; last_gift_on: string | null; purge_after: string | null; purged: boolean; pending_request: string | null })[];
    const gifts = (
      await s.c.query(
        "SELECT id,donor_id,received_on::text,amount_cents,nature,note,transaction_id,movement_id,cancelled_at,cancel_reason FROM tax_gift WHERE organization_id=$1 AND (extract(year FROM received_on)=$2 OR cancelled_at IS NULL AND received_on>=make_date($2::int,1,1)) ORDER BY received_on DESC,created_at DESC",
        [s.org, y],
      )
    ).rows as (GiftRow & { id: string; note: string; transaction_id: string | null; movement_id: string | null; cancel_reason: string | null })[];
    const totals = yearTotals(gifts, y);
    const report = controlReport(donors, totals, o.threshold);
    const receipts = (
      await s.c.query(
        "SELECT r.id,r.donor_id,d.name,r.year,r.sequence,r.amount_cents,r.status,r.replaces_id IS NOT NULL AS correction,r.reason,r.issued_at,r.emailed_at FROM tax_receipt r JOIN tax_donor d ON d.id=r.donor_id WHERE r.organization_id=$1 AND r.year=$2 ORDER BY r.sequence,r.issued_at",
        [s.org, y],
      )
    ).rows;
    // What the ledger and the pots received as gifts, not yet qualified here.
    const candidates = (
      await s.c.query(
        `SELECT 'ledger' AS source,t.id,t.occurred_on::text AS received_on,t.amount_cents,COALESCE(NULLIF(t.counterparty,''),t.label) AS name,t.label
           FROM finance_transaction t WHERE t.organization_id=$1 AND t.direction='in' AND t.category='donation' AND t.cancelled_at IS NULL AND extract(year FROM t.occurred_on)=$2
            AND NOT EXISTS (SELECT 1 FROM tax_gift g WHERE g.transaction_id=t.id)
         UNION ALL
         SELECT 'pot',m.id,m.occurred_on::text,m.amount_cents,m.donor,p.name
           FROM fundraising_movement m JOIN fundraising_pot p ON p.id=m.pot_id WHERE p.organization_id=$1 AND m.kind='donation' AND m.cancelled_at IS NULL AND NOT m.anonymous AND m.donor<>'' AND extract(year FROM m.occurred_on)=$2
            AND NOT EXISTS (SELECT 1 FROM tax_gift g WHERE g.movement_id=m.id)
         ORDER BY 3 DESC LIMIT 300`,
        [s.org, y],
      )
    ).rows as { source: "ledger" | "pot"; id: string; received_on: string; amount_cents: number; name: string; label: string }[];
    // Who may open the national numbers: the presidency always, others by this right.
    const mandates = s.approve
      ? ((
          await s.c.query(
            `SELECT r.id,u.name,r.role,'tax.identity'=ANY(r.grants) AS granted FROM role_assignment r JOIN "user" u ON u.id=r.user_id
              WHERE r.organization_id=$1 AND r.role NOT IN ('club_president','player','guardian') AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) ORDER BY u.name`,
            [s.org],
          )
        ).rows as { id: string; name: string; role: string; granted: boolean }[])
      : [];
    const contacts = (await s.c.query("SELECT id,full_name AS name,email FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY full_name LIMIT 500", [s.org])).rows;
    return {
      organization_id: s.org,
      today,
      year: y,
      can: { manage: s.manage, identity: s.identity, approve: s.approve },
      mandates,
      club: { name: o.name, address: o.address ?? "", companyNumber: (o.company_number ?? "").replace(/\D/g, ""), approvalNumber: o.tax_approval_number, approvalFrom: o.approval_from, approvalTo: o.approval_to, thresholdCents: o.threshold },
      alert: approvalAlert(o.approval_to, today),
      deadline: belcotaxDeadline(y),
      donors: donors.map(({ national_hash: _h, ...d }) => (void _h, { ...d, total_cents: totals.get(d.id) ?? 0 })),
      gifts,
      receipts,
      report,
      candidates,
      contacts: contacts as { id: string; name: string; email: string }[],
    };
  });
}

/* ------------------------------------------------------------ Commands */
async function donorOf(s: Scope, id: string) {
  const d = (await s.c.query("SELECT * FROM tax_donor WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, s.org])).rows[0];
  if (!d) throw new AccessError("NOT_FOUND", 404);
  return d;
}
async function refreshDonor(s: Scope, donor: string) {
  const last = (await s.c.query("SELECT max(received_on)::text AS d FROM tax_gift WHERE donor_id=$1 AND organization_id=$2 AND cancelled_at IS NULL", [donor, s.org])).rows[0].d as string | null;
  await s.c.query("UPDATE tax_donor SET last_gift_on=$3,purge_after=$4 WHERE id=$1 AND organization_id=$2", [donor, s.org, last, last ? purgeAfter(last) : null]);
}
/** What is printed: the club and the donor as they are now (the national number reduced to its last two digits). */
async function snapshotOf(s: Scope, donor: Record<string, unknown>): Promise<ReceiptSnapshot> {
  const o = (await s.c.query("SELECT name,address,company_number,signatory,tax_approval_number,tax_approval_from::text AS f,tax_approval_to::text AS t FROM organization WHERE id=$1", [s.org])).rows[0];
  const national = donor.national_sealed ? normalizeNationalNumber(unseal<string>(String(donor.national_sealed), aad(String(donor.id)))) : "";
  return {
    club: { name: o.name, address: o.address ?? "", companyNumber: (o.company_number ?? "").replace(/\D/g, ""), approvalNumber: o.tax_approval_number, approvalFrom: o.f ?? "", approvalTo: o.t ?? "", signatory: o.signatory ?? "" },
    donor: {
      kind: donor.kind as "person" | "company",
      name: String(donor.name),
      street: String(donor.street),
      postalCode: String(donor.postal_code),
      city: String(donor.city),
      country: String(donor.country),
      identifier: donor.kind === "company" ? String(donor.company_number) : national ? national.slice(9) : "",
    },
  };
}
async function nextSequence(s: Scope, year: number) {
  return (await s.c.query("SELECT COALESCE(max(sequence),0)+1 AS n FROM tax_receipt WHERE organization_id=$1 AND year=$2", [s.org, year])).rows[0].n as number;
}
async function yearTotal(s: Scope, donor: string, year: number) {
  return (
    await s.c.query("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM tax_gift WHERE organization_id=$1 AND donor_id=$2 AND nature='gift' AND cancelled_at IS NULL AND extract(year FROM received_on)=$3", [s.org, donor, year])
  ).rows[0].n as number;
}

export async function taxExecute(db: Pool, p: Principal, cmd: TaxCommand, expected: string) {
  return scope(
    db,
    p,
    cmd.action !== "revealNational",
    async (s) => {
      if (cmd.action === "approval") {
        if (!s.approve) throw new AccessError("FORBIDDEN");
        if (cmd.approved && (cmd.number.trim().length < 2 || !cmd.from || !cmd.to || cmd.to < cmd.from)) throw new AccessError("TAX_APPROVAL_REQUIRED", 400);
        // « Non » hides the module; the number, the period and the history stay.
        await s.c.query(
          "UPDATE organization SET tax_approved=$2,tax_approval_number=CASE WHEN $2 THEN $3 ELSE tax_approval_number END,tax_approval_from=CASE WHEN $2 THEN $4::date ELSE tax_approval_from END,tax_approval_to=CASE WHEN $2 THEN $5::date ELSE tax_approval_to END,tax_threshold_cents=$6 WHERE id=$1",
          [s.org, cmd.approved, cmd.number.trim(), cmd.from, cmd.to, cmd.thresholdCents],
        );
        await audit(s.c, s.org, s.userId, "tax.approval", s.org, { approved: cmd.approved, number: cmd.number.trim(), from: cmd.from, to: cmd.to });
        return { approved: cmd.approved };
      }
      open(s, true);
      switch (cmd.action) {
        case "donor": {
          const company = cmd.kind === "company" ? normalizeCompanyNumber(cmd.companyNumber) : "";
          if (cmd.kind === "company" && company && !validCompanyNumber(company)) throw new AccessError("INVALID_COMPANY_NUMBER", 400);
          if (cmd.contactId && !(await s.c.query("SELECT 1 FROM contact WHERE id=$1 AND organization_id=$2", [cmd.contactId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          const values = [cmd.kind, cmd.name, cmd.street, cmd.postalCode, cmd.city, cmd.country, cmd.email, company, cmd.contactId];
          if (cmd.id) {
            const d = await donorOf(s, cmd.id);
            // A company has no national number: switching the kind forgets it.
            await s.c.query(
              "UPDATE tax_donor SET kind=$3,name=$4,street=$5,postal_code=$6,city=$7,country=$8,email=$9,company_number=$10,contact_id=$11,national_sealed=CASE WHEN $3='company' THEN NULL ELSE national_sealed END,national_hash=CASE WHEN $3='company' THEN NULL ELSE national_hash END WHERE id=$1 AND organization_id=$2",
              [d.id, s.org, ...values],
            );
            await audit(s.c, s.org, s.userId, "tax.donor.updated", d.id);
            return { id: d.id as string };
          }
          const id = (
            await s.c.query("INSERT INTO tax_donor(organization_id,kind,name,street,postal_code,city,country,email,company_number,contact_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id", [
              s.org,
              ...values,
              s.userId,
            ])
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "tax.donor.created", id);
          return { id };
        }
        case "national": {
          if (!s.identity) throw new AccessError("FORBIDDEN");
          const d = await donorOf(s, cmd.donorId);
          if (d.kind !== "person") throw new AccessError("INVALID_INPUT", 400);
          const n = normalizeNationalNumber(cmd.value);
          if (!validNationalNumber(n)) throw new AccessError("INVALID_NATIONAL_NUMBER", 400);
          await s.c.query("UPDATE tax_donor SET national_sealed=$3,national_hash=$4,national_set_at=now() WHERE id=$1 AND organization_id=$2", [d.id, s.org, seal(n, aad(d.id)), nationalHash(s.org, n)]);
          await audit(s.c, s.org, s.userId, "tax.national.set", d.id, { by: "club" });
          return { id: d.id as string, masked: maskedNationalNumber(n) };
        }
        case "identityRight": {
          if (!s.approve) throw new AccessError("FORBIDDEN");
          const m = (
            await s.c.query(
              "UPDATE role_assignment SET grants=CASE WHEN $3 THEN array_append(array_remove(grants,'tax.identity'),'tax.identity') ELSE array_remove(grants,'tax.identity') END WHERE id=$1 AND organization_id=$2 AND role NOT IN ('club_president','player','guardian') AND revoked_at IS NULL RETURNING id",
              [cmd.mandateId, s.org, cmd.granted],
            )
          ).rows[0];
          if (!m) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, cmd.granted ? "tax.identity.granted" : "tax.identity.revoked", cmd.mandateId);
          return { id: cmd.mandateId };
        }
        case "revealNational": {
          if (!s.identity) throw new AccessError("FORBIDDEN");
          const d = await donorOf(s, cmd.donorId);
          if (!d.national_sealed) throw new AccessError("NOT_FOUND", 404);
          // Every opening of the number is written down.
          await audit(s.c, s.org, s.userId, "tax.national.read", d.id, { purpose: "screen" });
          return { value: formatNationalNumber(unseal<string>(d.national_sealed, aad(d.id))) };
        }
        case "requestNational": {
          const d = await donorOf(s, cmd.donorId);
          if (d.kind !== "person" || !d.email) throw new AccessError("INVALID_INPUT", 400);
          const t = token();
          await s.c.query("UPDATE tax_identity_request SET expires_at=now() WHERE donor_id=$1 AND organization_id=$2 AND used_at IS NULL AND expires_at>now()", [d.id, s.org]);
          await s.c.query("INSERT INTO tax_identity_request(organization_id,donor_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '30 days',$4)", [s.org, d.id, hashToken(t), s.userId]);
          const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
          await publish(s.c, {
            organizationId: s.org,
            userId: null,
            email: d.email,
            kind: "tax_identity",
            category: "administrative",
            resourceType: "tax",
            resourceId: d.id,
            eventKey: "tax_identity:" + hashToken(t),
            locale,
            inApp: false,
            variables: { name: d.name, organization: s.orgName, url: `${base()}/${locale}/don/${t}` },
          });
          await audit(s.c, s.org, s.userId, "tax.national.requested", d.id);
          return { id: d.id as string };
        }
        case "gift": {
          const d = await donorOf(s, cmd.donorId);
          if (cmd.transactionId && !(await s.c.query("SELECT 1 FROM finance_transaction WHERE id=$1 AND organization_id=$2 AND direction='in' AND cancelled_at IS NULL", [cmd.transactionId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          if (cmd.movementId && !(await s.c.query("SELECT 1 FROM fundraising_movement m JOIN fundraising_pot p ON p.id=m.pot_id WHERE m.id=$1 AND p.organization_id=$2 AND m.cancelled_at IS NULL", [cmd.movementId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          let id = cmd.id;
          if (id) {
            const changed = await s.c.query(
              "UPDATE tax_gift SET donor_id=$3,received_on=$4,amount_cents=$5,nature=$6,note=$7 WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL RETURNING donor_id",
              [id, s.org, d.id, cmd.receivedOn, cmd.amountCents, cmd.nature, cmd.note],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
          } else
            id = (
              await s.c.query(
                "INSERT INTO tax_gift(organization_id,donor_id,received_on,amount_cents,nature,note,transaction_id,movement_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
                [s.org, d.id, cmd.receivedOn, cmd.amountCents, cmd.nature, cmd.note, cmd.transactionId, cmd.movementId, s.userId],
              )
            ).rows[0].id as string;
          await refreshDonor(s, d.id);
          await audit(s.c, s.org, s.userId, "tax.gift", id!, { donor: d.id, amount: cmd.amountCents, nature: cmd.nature });
          return { id: id! };
        }
        case "cancelGift": {
          const g = (await s.c.query("UPDATE tax_gift SET cancelled_at=now(),cancel_reason=$3 WHERE id=$1 AND organization_id=$2 AND cancelled_at IS NULL RETURNING donor_id", [cmd.id, s.org, cmd.reason])).rows[0];
          if (!g) throw new AccessError("NOT_FOUND", 404);
          await refreshDonor(s, g.donor_id);
          await audit(s.c, s.org, s.userId, "tax.gift.cancelled", cmd.id, { reason: cmd.reason });
          return { id: cmd.id };
        }
        case "issue": {
          if (cmd.year > Number(brusselsToday().slice(0, 4))) throw new AccessError("INVALID_DATE", 400);
          const threshold = (await s.c.query("SELECT tax_threshold_cents AS n FROM organization WHERE id=$1", [s.org])).rows[0].n as number;
          const donors = (
            await s.c.query(
              `SELECT d.* FROM tax_donor d WHERE d.organization_id=$1 AND NOT EXISTS (SELECT 1 FROM tax_receipt r WHERE r.donor_id=d.id AND r.year=$2 AND r.status='issued') ORDER BY d.name`,
              [s.org, cmd.year],
            )
          ).rows;
          let issued = 0;
          for (const d of donors) {
            const total = await yearTotal(s, d.id, cmd.year);
            if (total < Math.max(threshold, 1)) continue;
            const seq = await nextSequence(s, cmd.year);
            const id = (
              await s.c.query("INSERT INTO tax_receipt(organization_id,donor_id,year,sequence,amount_cents,snapshot,issued_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
                s.org,
                d.id,
                cmd.year,
                seq,
                total,
                JSON.stringify(await snapshotOf(s, d)),
                s.userId,
              ])
            ).rows[0].id;
            await audit(s.c, s.org, s.userId, "tax.receipt.issued", id, { year: cmd.year, sequence: seq, amount: total });
            issued++;
          }
          return { issued };
        }
        case "correct": {
          const r = (await s.c.query("SELECT * FROM tax_receipt WHERE id=$1 AND organization_id=$2 AND status='issued' FOR UPDATE", [cmd.id, s.org])).rows[0];
          if (!r) throw new AccessError("NOT_FOUND", 404);
          const d = await donorOf(s, r.donor_id);
          const total = await yearTotal(s, d.id, r.year);
          if (total < 1) throw new AccessError("INVALID_INPUT", 400);
          // The correction keeps the number of the receipt it replaces (Belcotax: same sequence, treatment « modification »).
          await s.c.query("UPDATE tax_receipt SET status='corrected',closed_at=now(),closed_by=$3,reason=$4 WHERE id=$1 AND organization_id=$2", [r.id, s.org, s.userId, cmd.reason]);
          const id = (
            await s.c.query("INSERT INTO tax_receipt(organization_id,donor_id,year,sequence,amount_cents,snapshot,replaces_id,issued_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [
              s.org,
              d.id,
              r.year,
              r.sequence,
              total,
              JSON.stringify(await snapshotOf(s, d)),
              r.id,
              s.userId,
              cmd.reason,
            ])
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "tax.receipt.corrected", id, { replaces: r.id, before: r.amount_cents, after: total, reason: cmd.reason });
          return { id };
        }
        case "cancelReceipt": {
          const r = (
            await s.c.query("UPDATE tax_receipt SET status='cancelled',closed_at=now(),closed_by=$3,reason=$4 WHERE id=$1 AND organization_id=$2 AND status='issued' RETURNING id", [cmd.id, s.org, s.userId, cmd.reason])
          ).rows[0];
          if (!r) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, "tax.receipt.cancelled", cmd.id, { reason: cmd.reason });
          return { id: cmd.id };
        }
        case "send": {
          const rows = (
            await s.c.query(
              "SELECT r.id,r.amount_cents,d.name,d.email,d.id AS donor FROM tax_receipt r JOIN tax_donor d ON d.id=r.donor_id WHERE r.organization_id=$1 AND r.year=$2 AND r.status='issued' AND r.emailed_at IS NULL AND d.email<>''",
              [s.org, cmd.year],
            )
          ).rows;
          const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
          const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
          for (const r of rows) {
            const t = token();
            await s.c.query("UPDATE tax_receipt SET token_hash=$3,emailed_at=now() WHERE id=$1 AND organization_id=$2", [r.id, s.org, hashToken(t)]);
            await publish(s.c, {
              organizationId: s.org,
              userId: null,
              email: r.email,
              kind: "tax_receipt",
              category: "administrative",
              resourceType: "tax",
              resourceId: r.id,
              eventKey: "tax_receipt:" + r.id,
              locale,
              inApp: false,
              variables: {
                name: r.name,
                organization: s.orgName,
                url: `${base()}/api/tax/receipt/${t}`,
                amount: new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(r.amount_cents / 100),
                details: String(cmd.year),
              },
            });
            await audit(s.c, s.org, s.userId, "tax.receipt.sent", r.id);
          }
          return { sent: rows.length };
        }
      }
    },
    expected,
  );
}

/* ------------------------------------------------------------ Files: the receipt PDF and the Belcotax export */
function printOf(r: Record<string, unknown>): ReceiptPrint {
  return {
    year: Number(r.year),
    sequence: Number(r.sequence),
    amountCents: Number(r.amount_cents),
    issuedOn: new Date(String(r.issued_at)).toISOString().slice(0, 10),
    status: r.status as ReceiptPrint["status"],
    correction: !!r.replaces_id,
    snapshot: r.snapshot as ReceiptSnapshot,
  };
}
export async function receiptFile(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (s) => {
    open(s, false);
    const r = (await s.c.query("SELECT * FROM tax_receipt WHERE id=$1 AND organization_id=$2", [id, s.org])).rows[0];
    if (!r) throw new AccessError("NOT_FOUND", 404);
    const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
    return { name: `attestation-281-71-${r.year}-${r.sequence}.pdf`, bytes: receiptPdf(printOf(r), locale) };
  });
}
/** The donor's own link from the e-mail: their receipt, nothing else. */
export async function receiptByToken(db: Pool, t: string) {
  const r = (await db.query("SELECT r.* FROM tax_receipt r JOIN organization o ON o.id=r.organization_id WHERE r.token_hash=$1 AND o.tax_approved", [hashToken(t)])).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return { name: `attestation-281-71-${r.year}-${r.sequence}.pdf`, bytes: receiptPdf(printOf(r), "fr") };
}

/** The fiches of a year (receipts current, corrected and cancelled), with the national numbers opened for the file. */
async function fichesOf(s: Scope, year: number) {
  const rows = (
    await s.c.query(
      `SELECT r.id,r.sequence,r.amount_cents,r.status,r.replaces_id,d.id AS donor,d.kind,d.name,d.street,d.postal_code,d.city,d.country,d.company_number,d.national_sealed
         FROM tax_receipt r JOIN tax_donor d ON d.id=r.donor_id WHERE r.organization_id=$1 AND r.year=$2 AND (r.status IN ('issued','cancelled')) ORDER BY r.sequence,r.issued_at`,
      [s.org, year],
    )
  ).rows;
  return rows.map(
    (r): Fiche => ({
      sequence: r.sequence,
      kind: r.kind,
      identifier: r.kind === "company" ? r.company_number : r.national_sealed ? normalizeNationalNumber(unseal<string>(r.national_sealed, aad(r.donor))) : "",
      name: r.name,
      street: r.street,
      postalCode: r.postal_code,
      city: r.city,
      country: r.country,
      amountCents: r.amount_cents,
      treatment: r.status === "cancelled" ? 3 : r.replaces_id ? 1 : 0,
    }),
  );
}
const blocking = (i: Issue, f: Fiche[]) => i.code !== "IDENTIFIER" || f.find((x) => x.sequence === i.sequence)?.identifier !== "";
/**
 * The Belcotax-on-Web file of a year, checked before it leaves: it opens the
 * national numbers, so it needs tax.identity and is written to the audit
 * log. Blocking problems refuse the export; a missing national number is
 * listed (tolerated for the gifts of 2024 and 2025, to confirm for 2026).
 */
export async function belcotaxExport(db: Pool, p: Principal, year: number, check = false) {
  return scope(db, p, false, async (s) => {
    open(s, false);
    if (!s.identity) throw new AccessError("FORBIDDEN");
    const o = (await s.c.query("SELECT name,address,company_number,contact_email FROM organization WHERE id=$1", [s.org])).rows[0];
    const u = (await s.c.query('SELECT u.name,u.email,COALESCE(pe.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1', [s.userId])).rows[0];
    const [street = "", place = ""] = String(o.address ?? "")
      .split(/,|\n/)
      .map((x: string) => x.trim());
    const [, postalCode = "", city = ""] = place.match(/^(\d{4})\s+(.*)$/) ?? [];
    const sender = { name: o.name, street, postalCode, city, companyNumber: String(o.company_number ?? "").replace(/\D/g, ""), email: o.contact_email || u.email, phone: "", contact: u.name, language: u.locale };
    const fiches = await fichesOf(s, year);
    const xml = buildBelcotax(year, sender, fiches, brusselsToday());
    const issues = checkBelcotax(year, sender, fiches, xml);
    await audit(s.c, s.org, s.userId, "tax.national.read", s.org, { purpose: check ? "belcotax-check" : "belcotax-export", year, fiches: fiches.length });
    if (check) return { issues, fiches: fiches.length };
    if (!fiches.length) throw new AccessError("NOT_FOUND", 404);
    if (issues.some((i) => blocking(i, fiches))) throw new AccessError("BELCOTAX_INVALID", 409);
    return { name: `belcotax-281-71-${year}.xml`, xml, issues };
  });
}

/* ------------------------------------------------------------ The donor's secure form */
export async function identityRequestInfo(db: Pool, t: string) {
  const r = (
    await db.query(
      "SELECT d.name,o.name AS organization FROM tax_identity_request q JOIN tax_donor d ON d.id=q.donor_id JOIN organization o ON o.id=q.organization_id WHERE q.token_hash=$1 AND q.used_at IS NULL AND q.expires_at>now() AND o.tax_approved",
      [hashToken(t)],
    )
  ).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return { name: r.name as string, organization: r.organization as string };
}
export async function identityRequestSubmit(db: Pool, t: string, value: string) {
  const n = normalizeNationalNumber(value);
  if (!validNationalNumber(n)) throw new AccessError("INVALID_NATIONAL_NUMBER", 400);
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const q = (
      await c.query(
        "SELECT q.id,q.organization_id,q.donor_id,q.created_by FROM tax_identity_request q JOIN organization o ON o.id=q.organization_id WHERE q.token_hash=$1 AND q.used_at IS NULL AND q.expires_at>now() AND o.tax_approved FOR UPDATE OF q",
        [hashToken(t)],
      )
    ).rows[0];
    if (!q) throw new AccessError("NOT_FOUND", 404);
    await c.query("UPDATE tax_donor SET national_sealed=$3,national_hash=$4,national_set_at=now() WHERE id=$1 AND organization_id=$2 AND kind='person'", [
      q.donor_id,
      q.organization_id,
      seal(n, aad(q.donor_id)),
      nationalHash(q.organization_id, n),
    ]);
    await c.query("UPDATE tax_identity_request SET used_at=now() WHERE id=$1", [q.id]);
    // The journal names who sent the request; the number came from the donor.
    await c.query("INSERT INTO audit_log(organization_id,actor_id,action,target_id,details) VALUES($1,$2,'tax.national.set',$3,$4)", [q.organization_id, q.created_by, q.donor_id, JSON.stringify({ by: "donor" })]);
    await c.query("COMMIT");
    return { ok: true as const };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Ten years after a donor's last gift: the national number, the address and the e-mail go (the receipts' snapshots never held the number). */
export async function taxPurge(db: Pool, today = brusselsToday()) {
  return (
    await db.query(
      "UPDATE tax_donor SET national_sealed=NULL,national_hash=NULL,street='',postal_code='',city='',email='',purged_at=now() WHERE purged_at IS NULL AND purge_after IS NOT NULL AND purge_after<=$1::date",
      [today],
    )
  ).rowCount ?? 0;
}
