import { emitWebhook } from "../integrations/webhooks";
import type { Pool, PoolClient } from "pg";
import { createHash } from "node:crypto";
import { AccessError, account, active, audit, refuseSupport, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { validIban } from "../../lib/iban";
import { brusselsToday } from "../people/service";
import { findReference, formatReference } from "./reference";
import { suggest, type Candidate } from "./match";
import type { BankCommand, StatementLineInput } from "./schema";

/**
 * B1 (lot 09): the club's bank. Accounts, statements imported line by line
 * (a line seen twice is never created twice), and the reconciliation: by
 * itself only when the structured communication matches exactly and the
 * amount fits what is left; otherwise a person confirms a ranked
 * suggestion. Each part of a line becomes one ledger line, linked once.
 * Import and reconciliation need dues.manage; dues.read sees.
 */
type Scope = { c: PoolClient; org: string; orgName: string; userId: string; mandateId: string; manage: boolean; read: boolean };

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    if (a.disabled_modules.includes("finance")) throw new AccessError("MODULE_OFF");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const s: Scope = {
      c,
      org: a.organization_id,
      orgName: a.organization_name,
      userId: p.userId,
      mandateId: a.id,
      manage: mfa && rights.includes("dues.manage"),
      read: mfa && (rights.includes("dues.manage") || rights.includes("dues.read")),
    };
    if (!s.read) throw new AccessError("FORBIDDEN");
    if (write && !s.manage) throw new AccessError("FORBIDDEN");
    const out = await fn(s);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}

/** Date, amount, counterparty, communication and bank reference, on one account: the same line twice has the same print. */
export function fingerprint(account: string | null, l: StatementLineInput) {
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
  return createHash("sha256")
    .update([account ?? "", l.bookedOn, String(l.amountCents), norm(l.counterpartyIban || l.counterparty), norm(l.communication), norm(l.bankRef)].join("|"))
    .digest("hex");
}

/** Open receivables with what is left, their references and the family's names (for the suggestions). */
async function candidates(c: PoolClient, org: string): Promise<(Candidate & { category: string; season: string; profileId: string })[]> {
  return (
    await c.query(
      `SELECT d.id,d.profile_id AS "profileId",cp.full_name AS person,d.category,se.name AS season,d.reference,
              d.net_cents-(SELECT COALESCE(sum(t.amount_cents),0) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in')::int AS remaining,
              COALESCE((SELECT array_agg(i.reference ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id),'{}') AS "references",
              COALESCE((SELECT array_agg(i.amount_cents ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id),'{}') AS installments,
              COALESCE((SELECT array_agg(gp.full_name) FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id
                         WHERE g.organization_id=d.organization_id AND g.subject_profile_id=d.profile_id AND g.revoked_at IS NULL),'{}') AS family
         FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id JOIN season se ON se.id=d.season_id
        WHERE d.organization_id=$1 AND d.status='open'`,
      [org],
    )
  ).rows.map((r) => ({ ...r, remaining: Number(r.remaining) }));
}
/** The receivable a structured communication names (the receivable's or one of its instalments'). */
async function byReference(c: PoolClient, org: string, reference: string) {
  const receivable = (
    await c.query(
      `SELECT d.id,'receivable' AS target,d.net_cents-(SELECT COALESCE(sum(t.amount_cents),0) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in')::int AS remaining
         FROM dues_receivable d WHERE d.organization_id=$1 AND d.status='open'
          AND (d.reference=$2 OR EXISTS (SELECT 1 FROM dues_installment i WHERE i.receivable_id=d.id AND i.reference=$2))`,
      [org, reference],
    )
  ).rows[0] as { id: string; target: "receivable" | "event"; remaining: number } | undefined;
  if (receivable) return receivable;
  // B9: an open event's fee, by the registration's own communication.
  return (
    await c.query(
      "SELECT r.id,'event' AS target,(oe.fee_cents-r.paid_cents)::int AS remaining FROM open_registration r JOIN open_event oe ON oe.id=r.open_event_id AND oe.organization_id=r.organization_id WHERE r.organization_id=$1 AND r.payment_reference=$2 AND r.status<>'cancelled' AND r.paid_cents<oe.fee_cents",
      [org, reference],
    )
  ).rows[0] as { id: string; target: "receivable" | "event"; remaining: number } | undefined;
}

export async function bankView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const accounts = (await s.c.query("SELECT id,label,iban,bic,holder,for_dues,archived FROM bank_account WHERE organization_id=$1 ORDER BY archived,for_dues DESC,label", [s.org])).rows;
    const lines = (
      await s.c.query(
        `SELECT l.id,l.bank_account_id,l.booked_on::text AS booked_on,l.amount_cents,l.counterparty,l.counterparty_iban,l.communication,l.bank_ref,l.reference,l.status,l.note,
                COALESCE((SELECT json_agg(json_build_object('id',a.id,'target',a.target,'target_id',a.target_id,'amount_cents',a.amount_cents,'automatic',a.automatic,
                   'label',COALESCE(cp.full_name||' · '||d.category,ccp.full_name,pot.name,pa.name,CASE WHEN g.id IS NULL THEN NULL ELSE g.funder END,reg.full_name,'')) ORDER BY a.created_at)
                   FROM bank_allocation a LEFT JOIN dues_receivable d ON a.target='receivable' AND d.id=a.target_id LEFT JOIN club_person cp ON cp.id=d.profile_id
                   LEFT JOIN club_person ccp ON a.target='credit' AND ccp.id=a.target_id LEFT JOIN fundraising_pot pot ON a.target='pot' AND pot.id=a.target_id
                   LEFT JOIN partner pa ON a.target='partner' AND pa.id=a.target_id LEFT JOIN grant_application g ON a.target='grant' AND g.id=a.target_id
                   LEFT JOIN open_registration reg ON a.target='event' AND reg.id=a.target_id AND reg.organization_id=a.organization_id
                  WHERE a.line_id=l.id AND a.cancelled_at IS NULL),'[]') AS allocations
           FROM bank_line l WHERE l.organization_id=$1 ORDER BY l.status='new' DESC,l.booked_on DESC,l.created_at DESC LIMIT 500`,
        [s.org],
      )
    ).rows as {
      id: string;
      bank_account_id: string | null;
      booked_on: string;
      amount_cents: number;
      counterparty: string;
      counterparty_iban: string;
      communication: string;
      bank_ref: string;
      reference: string | null;
      status: "new" | "matched" | "ignored";
      note: string;
      allocations: { id: string; target: string; target_id: string | null; amount_cents: number; automatic: boolean; label: string }[];
    }[];
    const open = await candidates(s.c, s.org);
    const suggestions = Object.fromEntries(
      lines
        .filter((l) => l.status === "new")
        .map((l) => {
          const left = Math.abs(l.amount_cents) - l.allocations.reduce((n, a) => n + a.amount_cents, 0);
          return [l.id, suggest({ amountCents: l.amount_cents > 0 ? left : -1, counterparty: l.counterparty, communication: l.communication, reference: l.reference }, open)];
        }),
    );
    const credits = (
      await s.c.query(
        `SELECT t.credit_profile_id AS profile_id,cp.full_name,sum(t.amount_cents)::int AS cents FROM finance_transaction t JOIN club_person cp ON cp.id=t.credit_profile_id
          WHERE t.organization_id=$1 AND t.credit_profile_id IS NOT NULL AND t.cancelled_at IS NULL GROUP BY t.credit_profile_id,cp.full_name ORDER BY cp.full_name`,
        [s.org],
      )
    ).rows as { profile_id: string; full_name: string; cents: number }[];
    const imports = (
      await s.c.query("SELECT i.id,i.format,i.bank,i.filename,i.lines,i.created,i.matched,i.imported_at,u.name AS author FROM bank_import i LEFT JOIN \"user\" u ON u.id=i.imported_by WHERE i.organization_id=$1 ORDER BY i.imported_at DESC LIMIT 20", [s.org])
    ).rows;
    const mappings = Object.fromEntries((await s.c.query("SELECT bank,columns FROM bank_mapping WHERE organization_id=$1", [s.org])).rows.map((r) => [r.bank, r.columns]));
    const targets = {
      pots: (await s.c.query("SELECT id,name FROM fundraising_pot WHERE organization_id=$1 AND status='open' ORDER BY name", [s.org])).rows as { id: string; name: string }[],
      partners: (await s.c.query("SELECT id,name FROM partner WHERE organization_id=$1 AND status<>'ended' ORDER BY name", [s.org])).rows as { id: string; name: string }[],
      grants: (
        await s.c.query("SELECT id,CASE WHEN program<>'' THEN funder||' · '||program ELSE funder END AS name FROM grant_application WHERE organization_id=$1 AND status IN ('granted','paid') ORDER BY funder", [s.org])
      ).rows as { id: string; name: string }[],
      people: (await s.c.query("SELECT DISTINCT cp.id,cp.full_name AS name FROM club_person cp JOIN dues_receivable d ON d.profile_id=cp.id WHERE cp.organization_id=$1 ORDER BY cp.full_name", [s.org])).rows as {
        id: string;
        name: string;
      }[],
    };
    return { organization_id: s.org, can: { manage: s.manage }, today: brusselsToday(), accounts, lines, suggestions, receivables: open, credits, imports, mappings, targets };
  });
}

type Line = { id: string; amount_cents: number; booked_on: string; counterparty: string; communication: string; bank_ref: string; reference: string | null; status: string };
async function lineOf(s: Scope, id: string) {
  const l = (await s.c.query("SELECT id,amount_cents,booked_on::text AS booked_on,counterparty,communication,bank_ref,reference,status FROM bank_line WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, s.org])).rows[0] as
    | Line
    | undefined;
  if (!l) throw new AccessError("NOT_FOUND", 404);
  return l;
}
const allocated = async (s: Scope, lineId: string) =>
  (await s.c.query("SELECT COALESCE(sum(amount_cents),0)::int AS n FROM bank_allocation WHERE line_id=$1 AND cancelled_at IS NULL", [lineId])).rows[0].n as number;

/**
 * One part of a line: its ledger line (one, linked once) and what it pays.
 * A receivable never takes more than what is left on it.
 */
async function allocate(s: Scope, line: Line, part: { target: string; targetId: string | null; amountCents: number; category?: string }, automatic = false) {
  const incoming = line.amount_cents > 0;
  const ref = line.reference ? formatReference(line.reference) : line.bank_ref;
  let category = "other",
    label = (line.counterparty || line.communication || "Mouvement bancaire").slice(0, 160),
    receivable: string | null = null,
    creditProfile: string | null = null,
    linked: string | null = null;
  if (!incoming && part.target !== "other") throw new AccessError("INVALID_INPUT", 400);
  if (part.target === "receivable") {
    const d = (
      await s.c.query(
        `SELECT d.id,cp.full_name,d.net_cents-(SELECT COALESCE(sum(t.amount_cents),0) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in')::int AS remaining
           FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id WHERE d.id=$1 AND d.organization_id=$2 AND d.status='open' FOR UPDATE OF d`,
        [part.targetId, s.org],
      )
    ).rows[0] as { id: string; full_name: string; remaining: number } | undefined;
    if (!d) throw new AccessError("NOT_FOUND", 404);
    // More than what is left: the rest goes to a credit, never onto the receivable.
    if (part.amountCents > d.remaining) throw new AccessError("OVERPAID", 409);
    category = "dues";
    label = `Cotisation ${d.full_name}`.slice(0, 160);
    receivable = d.id;
  } else if (part.target === "credit") {
    const p = (await s.c.query("SELECT id,full_name FROM club_person WHERE id=$1 AND organization_id=$2", [part.targetId, s.org])).rows[0];
    if (!p) throw new AccessError("NOT_FOUND", 404);
    category = "dues";
    label = `Crédit ${p.full_name}`.slice(0, 160);
    creditProfile = p.id;
  } else if (part.target === "pot") {
    const pot = (await s.c.query("SELECT id,name FROM fundraising_pot WHERE id=$1 AND organization_id=$2 AND status='open'", [part.targetId, s.org])).rows[0];
    if (!pot) throw new AccessError("NOT_FOUND", 404);
    category = "donation";
    label = `${pot.name} · ${line.counterparty || "don"}`.slice(0, 160);
    linked = (
      await s.c.query(
        "INSERT INTO fundraising_movement(pot_id,occurred_on,kind,label,amount_cents,donor,anonymous,created_by) VALUES($1,$2,'donation',$3,$4,$5,false,$6) RETURNING id",
        [pot.id, line.booked_on, `Virement ${line.counterparty || ""}`.trim().slice(0, 160).padEnd(2, "."), part.amountCents, line.counterparty.slice(0, 160), s.userId],
      )
    ).rows[0].id;
  } else if (part.target === "event") {
    const r = (
      await s.c.query(
        "SELECT r.id,r.full_name,e.title,(oe.fee_cents-r.paid_cents)::int AS remaining FROM open_registration r JOIN open_event oe ON oe.id=r.open_event_id AND oe.organization_id=r.organization_id JOIN calendar_event e ON e.id=oe.event_id WHERE r.id=$1 AND r.organization_id=$2 AND r.status<>'cancelled' FOR UPDATE OF r",
        [part.targetId, s.org],
      )
    ).rows[0] as { id: string; full_name: string; title: string; remaining: number } | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    if (part.amountCents > r.remaining) throw new AccessError("OVERPAID", 409);
    category = "event";
    label = `${r.title} · ${r.full_name}`.slice(0, 160);
    await s.c.query("UPDATE open_registration SET paid_cents=paid_cents+$3,paid_at=CASE WHEN paid_cents+$3>=(SELECT fee_cents FROM open_event WHERE id=open_event_id) THEN now() ELSE paid_at END WHERE id=$1 AND organization_id=$2", [r.id, s.org, part.amountCents]);
  } else if (part.target === "partner") {
    const pa = (await s.c.query("SELECT id,name FROM partner WHERE id=$1 AND organization_id=$2", [part.targetId, s.org])).rows[0];
    if (!pa) throw new AccessError("NOT_FOUND", 404);
    category = "sponsor";
    label = pa.name.slice(0, 160);
  } else if (part.target === "grant") {
    const g = (await s.c.query("SELECT id,funder,status FROM grant_application WHERE id=$1 AND organization_id=$2", [part.targetId, s.org])).rows[0];
    if (!g) throw new AccessError("NOT_FOUND", 404);
    if (!["granted", "paid", "closed"].includes(g.status)) throw new AccessError("GRANT_NOT_GRANTED", 409);
    category = "subsidy";
    label = `Subside ${g.funder}`.slice(0, 160);
    linked = (
      await s.c.query("INSERT INTO grant_payment(organization_id,grant_id,received_on,amount_cents,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
        s.org,
        g.id,
        line.booked_on,
        part.amountCents,
        "Relevé bancaire",
        s.userId,
      ])
    ).rows[0].id;
  } else category = part.category ?? "other";
  const tx = (
    await s.c.query(
      `INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,source,created_by,receivable_id,bank_line_id,credit_profile_id)
       VALUES($1,$2,$3,$4,$5,$6,'transfer',$7,$8,'','bank',$9,$10,$11,$12) RETURNING id`,
      [s.org, line.booked_on, label.length >= 2 ? label : "Mouvement bancaire", incoming ? "in" : "out", category, part.amountCents, line.counterparty.slice(0, 160), ref.slice(0, 160), s.userId, receivable, line.id, creditProfile],
    )
  ).rows[0].id as string;
  if (part.target === "partner")
    await s.c.query("UPDATE partner SET paid_on=COALESCE(paid_on,$3::date),payment_transaction_id=COALESCE(payment_transaction_id,$4) WHERE id=$1 AND organization_id=$2", [part.targetId, s.org, line.booked_on, tx]);
  const id = (
    await s.c.query(
      "INSERT INTO bank_allocation(organization_id,line_id,target,target_id,amount_cents,automatic,transaction_id,linked_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      [s.org, line.id, part.target, part.targetId, part.amountCents, automatic, tx, linked, s.userId],
    )
  ).rows[0].id as string;
  if (receivable)
    await s.c.query(
      "INSERT INTO dues_history(organization_id,plan_id,receivable_id,actor_id,action,before_data,after_data,reason) SELECT organization_id,plan_id,id,$2,'payment','{}'::jsonb,$3,$4 FROM dues_receivable WHERE id=$1",
      [receivable, s.userId, JSON.stringify({ transaction: tx, bank_line: line.id, amount_cents: part.amountCents, automatic }), automatic ? "Rapprochement automatique" : "Rapprochement bancaire"],
    );
  // B6: the club's systems are told of an incoming payment.
  if (incoming) await emitWebhook(s.c, s.org, "payment.reconciled", `allocation:${id}`, { allocation_id: id, bank_line_id: line.id, target: part.target, target_id: part.targetId, amount_cents: part.amountCents, booked_on: line.booked_on, automatic });
  await audit(s.c, s.org, s.userId, automatic ? "bank.matched.auto" : "bank.allocated", line.id, { target: part.target, amount: part.amountCents });
  return id;
}
async function refreshStatus(s: Scope, line: Line) {
  const used = await allocated(s, line.id);
  const status = used >= Math.abs(line.amount_cents) ? "matched" : "new";
  await s.c.query("UPDATE bank_line SET status=$3 WHERE id=$1 AND organization_id=$2 AND status<>'ignored'", [line.id, s.org, status]);
  return status;
}

/** What an import would create and reconcile, without writing. */
async function previewLines(s: Scope, accountId: string | null, lines: StatementLineInput[]) {
  const prints = lines.map((l) => fingerprint(accountId, l));
  const known = new Set(((await s.c.query("SELECT fingerprint FROM bank_line WHERE organization_id=$1 AND fingerprint=ANY($2::text[])", [s.org, prints])).rows as { fingerprint: string }[]).map((r) => r.fingerprint));
  const seen = new Set<string>();
  const out = [];
  for (const [i, l] of lines.entries()) {
    const duplicate = known.has(prints[i]) || seen.has(prints[i]);
    seen.add(prints[i]);
    const reference = findReference(l.communication);
    const target = !duplicate && l.amountCents > 0 && reference ? await byReference(s.c, s.org, reference) : undefined;
    out.push({
      ...l,
      fingerprint: prints[i],
      duplicate,
      reference,
      automatic: !!target && l.amountCents <= target.remaining,
      receivableId: target?.target === "receivable" ? target.id : null,
      registrationId: target?.target === "event" ? target.id : null,
    });
  }
  return out;
}

export async function bankExecute(db: Pool, p: Principal, cmd: BankCommand, expected: string) {
  return scope(
    db,
    p,
    cmd.action !== "preview",
    async (s) => {
      switch (cmd.action) {
        case "account": {
          if (!s.manage) throw new AccessError("FORBIDDEN");
          // Security (07/11/2026): a support access never changes where the members' money goes.
          await refuseSupport(s.c, s.mandateId);
          const iban = cmd.iban.replace(/\s+/g, "").toUpperCase();
          if (!validIban(iban)) throw new AccessError("INVALID_IBAN", 400);
          if (cmd.forDues) await s.c.query("UPDATE bank_account SET for_dues=false WHERE organization_id=$1 AND ($2::uuid IS NULL OR id<>$2)", [s.org, cmd.id ?? null]);
          const bic = cmd.bic.replace(/\s+/g, "").toUpperCase();
          if (cmd.id) {
            const changed = await s.c.query("UPDATE bank_account SET label=$3,iban=$4,bic=$5,holder=$6,for_dues=$7 WHERE id=$1 AND organization_id=$2", [cmd.id, s.org, cmd.label, iban, bic, cmd.holder, cmd.forDues]);
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await audit(s.c, s.org, s.userId, "bank.account.updated", cmd.id);
            return { id: cmd.id };
          }
          const id = (
            await s.c.query("INSERT INTO bank_account(organization_id,label,iban,bic,holder,for_dues,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [s.org, cmd.label, iban, bic, cmd.holder || s.orgName.slice(0, 70), cmd.forDues, s.userId])
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "bank.account.created", id);
          return { id };
        }
        case "archiveAccount": {
          if (!(await s.c.query("UPDATE bank_account SET archived=$3,for_dues=CASE WHEN $3 THEN false ELSE for_dues END WHERE id=$1 AND organization_id=$2", [cmd.id, s.org, cmd.archived])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "preview": {
          if (!s.manage) throw new AccessError("FORBIDDEN");
          if (cmd.accountId && !(await s.c.query("SELECT 1 FROM bank_account WHERE id=$1 AND organization_id=$2", [cmd.accountId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          return { lines: await previewLines(s, cmd.accountId, cmd.lines) };
        }
        case "import": {
          if (cmd.accountId && !(await s.c.query("SELECT 1 FROM bank_account WHERE id=$1 AND organization_id=$2", [cmd.accountId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          const preview = await previewLines(s, cmd.accountId, cmd.lines);
          const importId = (
            await s.c.query("INSERT INTO bank_import(organization_id,bank_account_id,format,bank,filename,lines,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              s.org,
              cmd.accountId,
              cmd.format,
              cmd.bank,
              cmd.filename,
              cmd.lines.length,
              s.userId,
            ])
          ).rows[0].id as string;
          let created = 0,
            matched = 0;
          for (const l of preview) {
            if (l.duplicate) continue;
            const row = (
              await s.c.query(
                `INSERT INTO bank_line(organization_id,import_id,bank_account_id,booked_on,amount_cents,counterparty,counterparty_iban,communication,bank_ref,reference,fingerprint)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (organization_id,fingerprint) DO NOTHING
                 RETURNING id,amount_cents,booked_on::text AS booked_on,counterparty,communication,bank_ref,reference,status`,
                [s.org, importId, cmd.accountId, l.bookedOn, l.amountCents, l.counterparty, l.counterpartyIban, l.communication, l.bankRef, l.reference, l.fingerprint],
              )
            ).rows[0] as Line | undefined;
            if (!row) continue;
            created++;
            // By itself only when the communication names one receivable and the amount fits what is left.
            if (l.automatic && (l.receivableId || l.registrationId)) {
              const target = await byReference(s.c, s.org, l.reference!);
              if (target && row.amount_cents <= target.remaining) {
                await allocate(s, row, { target: target.target, targetId: target.id, amountCents: row.amount_cents }, true);
                await refreshStatus(s, row);
                matched++;
              }
            }
          }
          await s.c.query("UPDATE bank_import SET created=$3,matched=$4 WHERE id=$1 AND organization_id=$2", [importId, s.org, created, matched]);
          if (cmd.columns)
            await s.c.query(
              "INSERT INTO bank_mapping(organization_id,bank,columns) VALUES($1,$2,$3) ON CONFLICT (organization_id,bank) DO UPDATE SET columns=EXCLUDED.columns,updated_at=now()",
              [s.org, cmd.bank, JSON.stringify(cmd.columns)],
            );
          await audit(s.c, s.org, s.userId, "bank.imported", importId, { lines: cmd.lines.length, created, matched });
          return { id: importId, created, duplicates: cmd.lines.length - created, matched };
        }
        case "allocate": {
          const line = await lineOf(s, cmd.lineId);
          if (line.status === "ignored") throw new AccessError("INVALID_TRANSITION", 409);
          const left = Math.abs(line.amount_cents) - (await allocated(s, line.id));
          if (cmd.parts.reduce((n, x) => n + x.amountCents, 0) > left) throw new AccessError("OVERPAID", 409);
          const ids: string[] = [];
          for (const part of cmd.parts) ids.push(await allocate(s, line, part));
          return { ids, status: await refreshStatus(s, line) };
        }
        case "cancelAllocation": {
          const a = (
            await s.c.query("SELECT a.*,t.amount_cents AS tx_cents,t.credit_profile_id,t.receivable_id FROM bank_allocation a JOIN finance_transaction t ON t.id=a.transaction_id WHERE a.id=$1 AND a.organization_id=$2 AND a.cancelled_at IS NULL FOR UPDATE OF a", [
              cmd.id,
              s.org,
            ])
          ).rows[0];
          if (!a) throw new AccessError("NOT_FOUND", 404);
          // A credit already used or paid back stays: its parts have their own lines.
          if (a.target === "credit" && (a.credit_profile_id === null || a.tx_cents !== a.amount_cents)) throw new AccessError("INVALID_TRANSITION", 409);
          await s.c.query("UPDATE bank_allocation SET cancelled_at=now(),cancelled_by=$3,cancel_reason=$4 WHERE id=$1 AND organization_id=$2", [a.id, s.org, s.userId, cmd.reason]);
          await s.c.query("UPDATE finance_transaction SET cancelled_at=now(),cancelled_by=$3,cancel_reason=$4 WHERE id=$1 AND organization_id=$2", [a.transaction_id, s.org, s.userId, cmd.reason]);
          if (a.target === "pot" && a.linked_id) await s.c.query("UPDATE fundraising_movement SET cancelled_at=now(),cancelled_by=$2 WHERE id=$1", [a.linked_id, s.userId]);
          if (a.target === "grant" && a.linked_id) await s.c.query("DELETE FROM grant_payment WHERE id=$1 AND organization_id=$2", [a.linked_id, s.org]);
          if (a.target === "event") await s.c.query("UPDATE open_registration SET paid_cents=GREATEST(0,paid_cents-$3),paid_at=NULL WHERE id=$1 AND organization_id=$2", [a.target_id, s.org, a.amount_cents]);
          if (a.target === "partner") await s.c.query("UPDATE partner SET paid_on=NULL,payment_transaction_id=NULL WHERE id=$1 AND organization_id=$2 AND payment_transaction_id=$3", [a.target_id, s.org, a.transaction_id]);
          if (a.receivable_id)
            await s.c.query(
              "INSERT INTO dues_history(organization_id,plan_id,receivable_id,actor_id,action,before_data,after_data,reason) SELECT organization_id,plan_id,id,$2,'payment_cancelled',$3,'{}'::jsonb,$4 FROM dues_receivable WHERE id=$1",
              [a.receivable_id, s.userId, JSON.stringify({ transaction: a.transaction_id, amount_cents: a.amount_cents }), cmd.reason],
            );
          await audit(s.c, s.org, s.userId, "bank.allocation.cancelled", a.line_id, { allocation: a.id, reason: cmd.reason });
          await refreshStatus(s, await lineOf(s, a.line_id));
          return { id: a.id };
        }
        case "ignore": {
          const line = await lineOf(s, cmd.lineId);
          if (cmd.ignored && (await allocated(s, line.id)) > 0) throw new AccessError("INVALID_TRANSITION", 409);
          await s.c.query("UPDATE bank_line SET status=$3,note=$4 WHERE id=$1 AND organization_id=$2", [line.id, s.org, cmd.ignored ? "ignored" : "new", cmd.note]);
          if (!cmd.ignored) await refreshStatus(s, line);
          await audit(s.c, s.org, s.userId, cmd.ignored ? "bank.ignored" : "bank.unignored", line.id);
          return { id: line.id };
        }
        case "applyCredit": {
          const d = (
            await s.c.query(
              `SELECT d.id,cp.full_name,d.net_cents-(SELECT COALESCE(sum(t.amount_cents),0) FROM finance_transaction t WHERE t.receivable_id=d.id AND t.cancelled_at IS NULL AND t.direction='in')::int AS remaining
                 FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id WHERE d.id=$1 AND d.organization_id=$2 AND d.status='open' FOR UPDATE OF d`,
              [cmd.receivableId, s.org],
            )
          ).rows[0] as { id: string; full_name: string; remaining: number } | undefined;
          if (!d) throw new AccessError("NOT_FOUND", 404);
          if (cmd.amountCents > d.remaining) throw new AccessError("OVERPAID", 409);
          const pieces = await takeCredit(s, cmd.profileId, cmd.amountCents);
          for (const id of pieces)
            await s.c.query("UPDATE finance_transaction SET receivable_id=$3,label=$4 WHERE id=$1 AND organization_id=$2", [id, s.org, d.id, `Cotisation ${d.full_name} (crédit)`.slice(0, 160)]);
          await s.c.query(
            "INSERT INTO dues_history(organization_id,plan_id,receivable_id,actor_id,action,before_data,after_data,reason) SELECT organization_id,plan_id,id,$2,'payment','{}'::jsonb,$3,'Crédit reporté' FROM dues_receivable WHERE id=$1",
            [d.id, s.userId, JSON.stringify({ credit_from: cmd.profileId, amount_cents: cmd.amountCents })],
          );
          await audit(s.c, s.org, s.userId, "bank.credit.applied", d.id, { profile: cmd.profileId, amount: cmd.amountCents });
          return { ok: true as const };
        }
        case "refundCredit": {
          if (cmd.occurredOn > brusselsToday()) throw new AccessError("INVALID_DATE", 400);
          const person = (await s.c.query("SELECT full_name FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.profileId, s.org])).rows[0];
          if (!person) throw new AccessError("NOT_FOUND", 404);
          const pieces = await takeCredit(s, cmd.profileId, cmd.amountCents);
          for (const id of pieces) await s.c.query("UPDATE finance_transaction SET label=$3 WHERE id=$1 AND organization_id=$2", [id, s.org, `Trop-perçu remboursé ${person.full_name}`.slice(0, 160)]);
          const out = (
            await s.c.query(
              "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,created_by) VALUES($1,$2,$3,'out','dues',$4,'transfer',$5,'',$6,$7) RETURNING id",
              [s.org, cmd.occurredOn, `Remboursement ${person.full_name}`.slice(0, 160), cmd.amountCents, person.full_name.slice(0, 160), cmd.reason, s.userId],
            )
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, "bank.credit.refunded", cmd.profileId, { amount: cmd.amountCents, transaction: out, reason: cmd.reason });
          return { id: out };
        }
      }
    },
    expected,
  );
}

/**
 * Takes `cents` from a person's credit, oldest first: a credit line used in
 * full loses its credit mark; one used in part is split in two ledger lines
 * of the same day and bank line (the cash counted once). Returns the ledger
 * lines now taken.
 */
async function takeCredit(s: Scope, profileId: string, cents: number) {
  const rows = (
    await s.c.query(
      "SELECT id,amount_cents,occurred_on::text AS occurred_on,label,counterparty,reference,bank_line_id,created_by FROM finance_transaction WHERE organization_id=$1 AND credit_profile_id=$2 AND cancelled_at IS NULL ORDER BY occurred_on,created_at FOR UPDATE",
      [s.org, profileId],
    )
  ).rows as { id: string; amount_cents: number; occurred_on: string; label: string; counterparty: string; reference: string; bank_line_id: string | null; created_by: string }[];
  if (rows.reduce((n, r) => n + r.amount_cents, 0) < cents) throw new AccessError("CREDIT_TOO_LOW", 409);
  const taken: string[] = [];
  let left = cents;
  for (const r of rows) {
    if (left <= 0) break;
    if (r.amount_cents <= left) {
      await s.c.query("UPDATE finance_transaction SET credit_profile_id=NULL WHERE id=$1 AND organization_id=$2", [r.id, s.org]);
      taken.push(r.id);
      left -= r.amount_cents;
    } else {
      await s.c.query("UPDATE finance_transaction SET amount_cents=amount_cents-$2 WHERE id=$1 AND organization_id=$3", [r.id, left, s.org]);
      taken.push(
        (
          await s.c.query(
            "INSERT INTO finance_transaction(organization_id,occurred_on,label,direction,category,amount_cents,method,counterparty,reference,notes,source,created_by,bank_line_id) VALUES($1,$2,$3,'in','dues',$4,'transfer',$5,$6,'',$7,$8,$9) RETURNING id",
            [s.org, r.occurred_on, r.label, left, r.counterparty, r.reference, r.bank_line_id ? "bank" : "manual", s.userId, r.bank_line_id],
          )
        ).rows[0].id,
      );
      left = 0;
    }
  }
  return taken;
}

/** The account the families pay their dues to (the dues page, the email, the QR). */
export async function duesAccount(c: PoolClient | Pool, org: string) {
  return (
    (await c.query("SELECT iban,bic,holder,label FROM bank_account WHERE organization_id=$1 AND for_dues AND NOT archived LIMIT 1", [org])).rows[0] as
      | { iban: string; bic: string; holder: string; label: string }
      | undefined
  ) ?? null;
}
