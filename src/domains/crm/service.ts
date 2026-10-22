import type { Pool, PoolClient } from "pg";
import { AccessError, type Principal } from "../access/service";
import { log, scope, type Scope } from "../funding/service";
import { tellTaskResponsible } from "../tasks/service";
import { findDuplicates, type ContactCommand, type LegalBasis, type OrganizationKind } from "./schema";
import { logInteraction } from "./log";

/**
 * A4: the contact book as a light CRM. Read by the staff (president and
 * coaches), changed by those who manage people, mandates or mails. Every
 * query names the club.
 */
export type ContactRow = {
  id: string;
  full_name: string;
  organization_name: string;
  contact_organization_id: string | null;
  role: string;
  email: string;
  phone: string;
  tags: string[];
  notes: string;
  archived: boolean;
  version: number;
  updated_at: string;
  legal_basis: LegalBasis;
  contact_ok: boolean;
  consent_on: string | null;
  /** The last call, email, meeting or mail sent (notes aside). */
  last_contact_on: string | null;
  interactions: number;
  grants: number;
  partners: number;
  /** The files themselves, to open them from the contact (wave 15). */
  files: { kind: "grant" | "partner" | "funder"; id: string; name: string }[];
};
const selectContacts = `SELECT c.id,c.full_name,c.organization_name,c.contact_organization_id,c.role,c.email,c.phone,c.tags,c.notes,c.archived,c.version,c.updated_at::text AS updated_at,
    c.legal_basis,c.contact_ok,c.consent_on::text AS consent_on,
    (SELECT max(i.happened_on)::text FROM contact_interaction i WHERE i.contact_id=c.id AND i.organization_id=c.organization_id AND i.kind<>'note') AS last_contact_on,
    (SELECT count(*)::int FROM contact_interaction i WHERE i.contact_id=c.id AND i.organization_id=c.organization_id) AS interactions,
    (SELECT count(*)::int FROM grant_application g WHERE g.contact_id=c.id AND g.organization_id=c.organization_id) AS grants,
    (SELECT count(*)::int FROM partner p WHERE p.contact_id=c.id AND p.organization_id=c.organization_id) AS partners,
    COALESCE((SELECT json_agg(x ORDER BY x.name) FROM (
      SELECT 'grant' AS kind,g.id,CASE WHEN g.program<>'' THEN g.funder||' · '||g.program ELSE g.funder END AS name FROM grant_application g WHERE g.contact_id=c.id AND g.organization_id=c.organization_id
      UNION ALL SELECT 'partner',p.id,p.name FROM partner p WHERE p.contact_id=c.id AND p.organization_id=c.organization_id
      UNION ALL SELECT 'funder',f.id,f.name FROM grant_funder f WHERE f.contact_id=c.id AND f.organization_id=c.organization_id) x),'[]') AS files
  FROM contact c WHERE c.organization_id=$1`;

export type OrganizationRow = { id: string; name: string; kind: OrganizationKind; website: string; address: string; notes: string; contacts: number };

function canRead(s: Scope) {
  if (!s.contactsRead) throw new AccessError("FORBIDDEN");
}
function canManage(s: Scope) {
  if (!s.contactsManage) throw new AccessError("FORBIDDEN");
}

export async function contactsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    canRead(s);
    const contacts = (await s.c.query(selectContacts + " ORDER BY c.archived,c.full_name", [s.org])).rows as ContactRow[];
    const organizations = (
      await s.c.query(
        "SELECT o.id,o.name,o.kind,o.website,o.address,o.notes,(SELECT count(*)::int FROM contact c WHERE c.contact_organization_id=o.id AND c.organization_id=o.organization_id AND NOT c.archived) AS contacts FROM contact_organization o WHERE o.organization_id=$1 ORDER BY o.name",
        [s.org],
      )
    ).rows as OrganizationRow[];
    // People of the club with an account: they can take a contact's next action.
    const people = (
      await s.c.query(
        "SELECT c.id,c.full_name FROM club_person c JOIN person pe ON pe.id=c.person_id WHERE c.organization_id=$1 AND c.status='active' AND pe.user_id IS NOT NULL ORDER BY c.full_name",
        [s.org],
      )
    ).rows as { id: string; full_name: string }[];
    return {
      organization_id: s.org,
      can: { manage: s.contactsManage, money: s.moneyRead },
      contacts,
      organizations,
      people,
      duplicates: s.contactsManage ? findDuplicates(contacts).map((d) => ({ a: d.a.id, b: d.b.id, reason: d.reason })) : [],
    };
  });
}

/** The light list of the « Choisir ou créer un contact » field. */
export async function contactChoices(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    canRead(s);
    const contacts = (
      await s.c.query("SELECT id,full_name,organization_name FROM contact WHERE organization_id=$1 AND NOT archived ORDER BY full_name LIMIT 3000", [s.org])
    ).rows as { id: string; full_name: string; organization_name: string }[];
    return { organization_id: s.org, can: { create: s.contactsManage }, contacts };
  });
}

/** One contact: its log and everything it is linked to, each with its link. */
export async function contactDetail(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (s) => detail(s, id));
}
async function detail(s: Scope, id: string) {
  canRead(s);
  const contact = (await s.c.query(selectContacts + " AND c.id=$2", [s.org, id])).rows[0] as ContactRow | undefined;
  if (!contact) throw new AccessError("NOT_FOUND", 404);
  const q = async <T>(sql: string) => (await s.c.query(sql, [s.org, id])).rows as T[];
  const interactions = (
    await s.c.query(
      `SELECT i.id,i.kind,i.summary,i.happened_on::text AS happened_on,i.source,u.name AS author,(i.author_id IS NOT DISTINCT FROM $3) AS mine
         FROM contact_interaction i LEFT JOIN "user" u ON u.id=i.author_id WHERE i.organization_id=$1 AND i.contact_id=$2 ORDER BY i.happened_on DESC,i.created_at DESC LIMIT 500`,
      [s.org, id, s.userId],
    )
  ).rows as { id: string; kind: string; summary: string; happened_on: string; source: string; author: string | null; mine: boolean }[];
  const organization = contact.contact_organization_id
    ? ((await s.c.query("SELECT id,name,kind,website,address FROM contact_organization WHERE id=$1 AND organization_id=$2", [contact.contact_organization_id, s.org])).rows[0] ?? null)
    : null;
  const donations = s.moneyRead
    ? await q<{ id: string; pot_id: string; pot: string; occurred_on: string; amount_cents: number; label: string }>(
        `SELECT m.id,m.pot_id,pt.name AS pot,m.occurred_on::text AS occurred_on,m.amount_cents,m.label FROM fundraising_movement m JOIN fundraising_pot pt ON pt.id=m.pot_id
          WHERE pt.organization_id=$1 AND m.contact_id=$2 AND m.cancelled_at IS NULL AND m.kind<>'expense' ORDER BY m.occurred_on DESC`,
      )
    : [];
  const byYear = new Map<string, number>();
  for (const d of donations) byYear.set(d.occurred_on.slice(0, 4), (byYear.get(d.occurred_on.slice(0, 4)) ?? 0) + d.amount_cents);
  return {
    organization_id: s.org,
    can: { manage: s.contactsManage, money: s.moneyRead },
    contact,
    organization,
    interactions,
    linked: {
      grants: s.moneyRead ? contact.files.filter((f) => f.kind === "grant") : [],
      partners: s.moneyRead ? contact.files.filter((f) => f.kind === "partner") : [],
      funders: s.moneyRead ? contact.files.filter((f) => f.kind === "funder") : [],
      donations,
      donationsByYear: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, cents]) => ({ year, cents })),
      chairs: await q<{ id: string; name: string }>("SELECT id,name FROM equipment_chair WHERE organization_id=$1 AND supplier_contact_id=$2 ORDER BY name"),
      venues: await q<{ id: string; name: string }>("SELECT id,name FROM calendar_place WHERE organization_id=$1 AND contact_id=$2 ORDER BY name"),
      events: await q<{ id: string; title: string; starts_at: string }>(
        `SELECT e.id,e.title,e.starts_at::text AS starts_at FROM calendar_event e JOIN calendar_place pl ON pl.id=e.place_id AND pl.organization_id=e.organization_id
          WHERE e.organization_id=$1 AND pl.contact_id=$2 AND e.starts_at>=now()-interval '1 day' AND e.status<>'cancelled' ORDER BY e.starts_at LIMIT 10`,
      ),
      tasks: await q<{ id: string; title: string; due_on: string | null; status: string; responsible: string | null }>(
        `SELECT t.id,t.title,t.due_on::text AS due_on,t.status,cp.full_name AS responsible FROM funding_task t LEFT JOIN club_person cp ON cp.id=t.responsible_id
          WHERE t.organization_id=$1 AND t.contact_id=$2 ORDER BY t.status='done',t.due_on NULLS LAST`,
      ),
    },
  };
}

/** GDPR: everything the club keeps about a contact, to hand over on request. */
export async function contactExport(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (s) => {
    canManage(s);
    const d = await detail(s, id);
    await log(s, "contact.exported", id);
    return {
      exported_at: new Date().toISOString(),
      contact: {
        full_name: d.contact.full_name,
        organization: d.organization?.name ?? d.contact.organization_name,
        role: d.contact.role,
        email: d.contact.email,
        phone: d.contact.phone,
        tags: d.contact.tags,
        notes: d.contact.notes,
        legal_basis: d.contact.legal_basis,
        contact_ok: d.contact.contact_ok,
        consent_on: d.contact.consent_on,
      },
      interactions: d.interactions.map(({ kind, summary, happened_on }) => ({ kind, summary, happened_on })),
      linked: d.linked,
    };
  });
}

/** The organisation of a contact: the one chosen, or found (or created) from the name typed. */
async function organizationFor(s: Scope, chosen: string | null | undefined, typed: string) {
  if (chosen) {
    const o = (await s.c.query("SELECT id,name FROM contact_organization WHERE id=$1 AND organization_id=$2", [chosen, s.org])).rows[0] as { id: string; name: string } | undefined;
    if (!o) throw new AccessError("NOT_FOUND", 404);
    return o;
  }
  if (chosen === null || typed.trim().length < 2) return null;
  return (
    await s.c.query(
      "INSERT INTO contact_organization(organization_id,name,created_by) VALUES($1,$2,$3) ON CONFLICT (organization_id,lower(trim(name))) DO UPDATE SET updated_at=contact_organization.updated_at RETURNING id,name",
      [s.org, typed.trim(), s.userId],
    )
  ).rows[0] as { id: string; name: string };
}
async function contactOf(s: Scope, id: string) {
  const c = (await s.c.query("SELECT id,full_name,email,phone,role,organization_name,contact_organization_id,notes,tags FROM contact WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, s.org]))
    .rows[0] as { id: string; full_name: string; email: string; phone: string; role: string; organization_name: string; contact_organization_id: string | null; notes: string; tags: string[] } | undefined;
  if (!c) throw new AccessError("NOT_FOUND", 404);
  return c;
}
/** Every place a contact is used, with the club column of each table. */
const references: [table: string, column: string, club: string | null][] = [
  ["grant_application", "contact_id", "organization_id"],
  ["grant_funder", "contact_id", "organization_id"],
  ["partner", "contact_id", "organization_id"],
  ["calendar_place", "contact_id", "organization_id"],
  ["affiliation_fee", "contact_id", null],
  ["funding_task", "contact_id", "organization_id"],
  ["equipment_chair", "supplier_contact_id", "organization_id"],
  ["fundraising_movement", "contact_id", null],
];
async function moveReferences(s: Scope, from: string, to: string | null) {
  for (const [table, column, club] of references)
    await s.c.query(`UPDATE ${table} SET ${column}=$2 WHERE ${column}=$1${club ? ` AND ${club}=$3` : ""}`, club ? [from, to, s.org] : [from, to]);
}
const sponsorCategory = (tags: string[]) =>
  tags.includes("sponsor") ? "sponsors" : tags.includes("donor") ? "fundraising" : tags.includes("supplier") ? "equipment" : tags.includes("venue") ? "events" : tags.includes("federation") ? "affiliation" : "other";

export async function contactsExecute(db: Pool, p: Principal, cmd: ContactCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      switch (cmd.action) {
        case "contact": {
          canManage(s);
          const org = await organizationFor(s, cmd.contactOrganizationId, cmd.organizationName);
          const values = [cmd.fullName, org?.name ?? cmd.organizationName, cmd.role, cmd.email, cmd.phone, cmd.tags, cmd.notes, org?.id ?? null];
          const gdpr = [cmd.legalBasis ?? null, cmd.contactOk ?? null, cmd.consentOn === undefined, cmd.consentOn ?? null];
          if (cmd.id) {
            const changed = await s.c.query(
              `UPDATE contact SET full_name=$3,organization_name=$4,role=$5,email=$6,phone=$7,tags=$8,notes=$9,contact_organization_id=$10,archived=COALESCE($11,archived),
                      legal_basis=COALESCE($12,legal_basis),contact_ok=COALESCE($13,contact_ok),consent_on=CASE WHEN $14 THEN consent_on ELSE $15::date END,version=version+1,updated_at=now()
                WHERE id=$1 AND organization_id=$2`,
              [cmd.id, s.org, ...values, cmd.archived ?? null, ...gdpr],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            await log(s, "contact.update", cmd.id);
            return { id: cmd.id };
          }
          const id = (
            await s.c.query(
              `INSERT INTO contact(organization_id,full_name,organization_name,role,email,phone,tags,notes,contact_organization_id,archived,legal_basis,contact_ok,consent_on,created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,'legitimate_interest'),COALESCE($12,true),$13,$14) RETURNING id`,
              [s.org, ...values, cmd.archived ?? false, gdpr[0], gdpr[1], gdpr[3], s.userId],
            )
          ).rows[0].id as string;
          await log(s, "contact.create", id);
          return { id, full_name: cmd.fullName, organization_name: org?.name ?? cmd.organizationName };
        }
        case "organization": {
          canManage(s);
          if (cmd.id) {
            const changed = await s.c.query(
              "UPDATE contact_organization SET name=$3,kind=$4,website=$5,address=$6,notes=$7,updated_at=now() WHERE id=$1 AND organization_id=$2",
              [cmd.id, s.org, cmd.name, cmd.kind, cmd.website, cmd.address, cmd.notes],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            // The contacts keep the organisation's name in their text column too.
            await s.c.query("UPDATE contact SET organization_name=$3,updated_at=now() WHERE contact_organization_id=$1 AND organization_id=$2", [cmd.id, s.org, cmd.name]);
            await log(s, "contact.organization.update", cmd.id);
            return { id: cmd.id };
          }
          const id = (
            await s.c.query("INSERT INTO contact_organization(organization_id,name,kind,website,address,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              s.org,
              cmd.name,
              cmd.kind,
              cmd.website,
              cmd.address,
              cmd.notes,
              s.userId,
            ])
          ).rows[0].id as string;
          await log(s, "contact.organization.create", id);
          return { id };
        }
        case "deleteOrganization": {
          canManage(s);
          await s.c.query("UPDATE contact SET contact_organization_id=NULL WHERE contact_organization_id=$1 AND organization_id=$2", [cmd.id, s.org]);
          if (!(await s.c.query("DELETE FROM contact_organization WHERE id=$1 AND organization_id=$2", [cmd.id, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          await log(s, "contact.organization.delete", cmd.id);
          return { id: cmd.id };
        }
        case "interaction": {
          // Logging an exchange is open to whoever reads the book.
          canRead(s);
          await contactOf(s, cmd.contactId);
          const id = await logInteraction(s.c, { org: s.org, contactId: cmd.contactId, kind: cmd.kind, summary: cmd.summary, authorId: s.userId, on: cmd.happenedOn });
          await log(s, "contact.interaction", cmd.contactId, { kind: cmd.kind });
          return { id };
        }
        case "deleteInteraction": {
          canRead(s);
          // One's own line, or any line for those who manage; never a mail the application sent.
          const gone = await s.c.query("DELETE FROM contact_interaction WHERE id=$1 AND organization_id=$2 AND kind<>'sent' AND (author_id=$3 OR $4) RETURNING contact_id", [
            cmd.id,
            s.org,
            s.userId,
            s.contactsManage,
          ]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "nextAction": {
          canManage(s);
          const c = await contactOf(s, cmd.contactId);
          if (cmd.responsibleId && !(await s.c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'", [cmd.responsibleId, s.org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const id = (
            await s.c.query(
              "INSERT INTO funding_task(organization_id,kind,category,title,due_on,responsible_id,contact_id,origin,created_by) VALUES($1,'other',$2,$3,$4,$5,$6,'manual',$7) RETURNING id",
              [s.org, sponsorCategory(c.tags), cmd.title, cmd.dueOn, cmd.responsibleId, c.id, s.userId],
            )
          ).rows[0].id as string;
          await log(s, "task.created", id, { contact: c.id });
          await tellTaskResponsible(s.c, s.org, s.userId, id);
          return { id };
        }
        case "merge": {
          canManage(s);
          if (cmd.keepId === cmd.mergeId) throw new AccessError("INVALID_INPUT", 400);
          const keep = await contactOf(s, cmd.keepId),
            gone = await contactOf(s, cmd.mergeId);
          await moveReferences(s, gone.id, keep.id);
          await s.c.query("UPDATE contact_interaction SET contact_id=$2 WHERE contact_id=$1 AND organization_id=$3", [gone.id, keep.id, s.org]);
          // The kept contact takes what it lacks; tags are joined, notes put one after the other.
          await s.c.query(
            `UPDATE contact SET email=CASE WHEN email='' THEN $3 ELSE email END,phone=CASE WHEN phone='' THEN $4 ELSE phone END,role=CASE WHEN role='' THEN $5 ELSE role END,
                    organization_name=CASE WHEN organization_name='' THEN $6 ELSE organization_name END,contact_organization_id=COALESCE(contact_organization_id,$7),
                    tags=ARRAY(SELECT DISTINCT unnest(tags||$8::text[])),notes=left(trim(BOTH E'\\n' FROM notes||E'\\n'||$9),4000),version=version+1,updated_at=now()
              WHERE id=$1 AND organization_id=$2`,
            [keep.id, s.org, gone.email, gone.phone, gone.role, gone.organization_name, gone.contact_organization_id, gone.tags, gone.notes],
          );
          await s.c.query("DELETE FROM contact WHERE id=$1 AND organization_id=$2", [gone.id, s.org]);
          await logInteraction(s.c, { org: s.org, contactId: keep.id, kind: "note", summary: `Fiche fusionnée avec ${gone.full_name}`, authorId: s.userId, source: "merge" });
          await log(s, "contact.merge", keep.id, { merged: gone.id });
          return { id: keep.id };
        }
        case "import": {
          canManage(s);
          const known = new Set(
            ((await s.c.query("SELECT lower(email) AS e FROM contact WHERE organization_id=$1 AND email<>''", [s.org])).rows as { e: string }[]).map((r) => r.e),
          );
          let created = 0,
            skipped = 0;
          for (const r of cmd.rows) {
            const email = r.email.toLowerCase();
            if (email && known.has(email)) {
              skipped++;
              continue;
            }
            if (email) known.add(email);
            const org = await organizationFor(s, undefined, r.organizationName);
            await s.c.query(
              "INSERT INTO contact(organization_id,full_name,organization_name,role,email,phone,tags,notes,contact_organization_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [s.org, r.fullName, org?.name ?? r.organizationName, r.role, r.email, r.phone, cmd.tags, r.notes, org?.id ?? null, s.userId],
            );
            created++;
          }
          await log(s, "contact.import", s.org, { created, skipped });
          return { created, skipped };
        }
        case "erase": {
          canManage(s);
          await contactOf(s, cmd.id);
          // The files keep their own text (the funder, the sponsor's name); only the link goes.
          await moveReferences(s, cmd.id, null);
          await s.c.query("DELETE FROM contact WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
          await log(s, "contact.erased", cmd.id);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}

/** Ctrl+K: the contacts whose name, organisation or email holds what was typed (folded, staff only). */
export async function searchContacts(c: PoolClient, org: string, needle: string) {
  const fold = (col: string) => `translate(lower(${col}),'àâäéèêëîïôöùûüç','aaaeeeeiioouuuc')`;
  return (
    await c.query(
      `SELECT id,full_name AS name,organization_name AS organization FROM contact WHERE organization_id=$1 AND NOT archived
          AND (${fold("full_name")} LIKE '%'||$2||'%' OR ${fold("organization_name")} LIKE '%'||$2||'%' OR lower(email) LIKE '%'||$2||'%')
        ORDER BY full_name LIMIT 5`,
      [org, needle.replace(/[\\%_]/g, "\\$&")],
    )
  ).rows as { id: string; name: string; organization: string }[];
}
