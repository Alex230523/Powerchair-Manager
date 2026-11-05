import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, audit, type Principal } from "./service";
import { delegable, permissions, type Permission } from "./policy";

/**
 * 7: staff roles. A role is a model of rights over the existing grants: a
 * person's effective grants = the union of his roles' grants (those a
 * role « for its teams only » gives through the coach's own teams are left
 * out of the club-wide list) + his own additions − his own removals. They
 * are written into role_assignment.grants, so every module keeps checking
 * the same thing. Changing a role updates everyone who has it, after a
 * confirmation that lists who gains or loses what; the rights journal keeps
 * each change.
 */
type T3 = { fr: string; nl: string; en: string };
/** Grants never given by a proposed role: health data, sensitive documents, exports, the donors' identity. */
export const sensitiveGrants: Permission[] = ["people.sensitive", "documents.sensitive", "people.export", "tax.identity"];
/** What a coach already reaches for the teams he coaches: a role « for its teams only » does not widen it to the club. */
export const teamScoped: Permission[] = ["calendar.manage", "calendar.read", "attendance.manage", "people.read"];
const assignable = delegable.filter((g) => g !== "tax.identity");
/** A club's roles never carry the federation's competences; a federation's carry only those. */
export const fitsKind = (kind: string, g: string) => (kind === "federation" ? g.startsWith("federation.") : !g.startsWith("federation."));

export type ProposedRole = { key: string; name: T3; description: T3; icon: string; grants: Permission[]; scope: "all" | "own_teams" };
export const proposedRoles: ProposedRole[] = [
  {
    key: "head-coach",
    name: { fr: "Coach principal", nl: "Hoofdcoach", en: "Head coach" },
    description: { fr: "Responsable sportif d'une équipe.", nl: "Sportief verantwoordelijke van een ploeg.", en: "Sports lead of a team." },
    icon: "whistle",
    grants: ["calendar.manage", "calendar.read", "attendance.manage", "people.read"],
    scope: "own_teams",
  },
  {
    key: "assistant-coach",
    name: { fr: "Coach adjoint", nl: "Assistent-coach", en: "Assistant coach" },
    description: { fr: "Aide le coach principal.", nl: "Helpt de hoofdcoach.", en: "Helps the head coach." },
    icon: "whistle",
    grants: ["attendance.manage", "calendar.read"],
    scope: "own_teams",
  },
  {
    key: "team-manager",
    name: { fr: "Team manager", nl: "Teammanager", en: "Team manager" },
    description: { fr: "Organisation et logistique de l'équipe.", nl: "Organisatie en logistiek van de ploeg.", en: "Organisation and logistics of the team." },
    icon: "clipboardList",
    grants: ["calendar.manage", "calendar.read", "documents.read"],
    scope: "all",
  },
  {
    key: "equipment-manager",
    name: { fr: "Responsable matériel", nl: "Materiaalverantwoordelijke", en: "Equipment manager" },
    description: { fr: "Fauteuils, batteries, stockage.", nl: "Rolstoelen, batterijen, opslag.", en: "Chairs, batteries, storage." },
    icon: "wrench",
    grants: ["equipment.manage", "calendar.read"],
    scope: "all",
  },
  {
    key: "transport-manager",
    name: { fr: "Responsable transport", nl: "Vervoersverantwoordelijke", en: "Transport manager" },
    description: { fr: "Camionnettes et chauffeurs.", nl: "Bestelwagens en chauffeurs.", en: "Vans and drivers." },
    icon: "bus",
    grants: ["calendar.manage", "calendar.read"],
    scope: "all",
  },
  {
    key: "treasurer",
    name: { fr: "Trésorier", nl: "Penningmeester", en: "Treasurer" },
    description: { fr: "L'argent du club.", nl: "Het geld van de club.", en: "The club's money." },
    icon: "funding",
    grants: ["dues.manage", "dues.read"],
    scope: "all",
  },
  {
    key: "secretary",
    name: { fr: "Secrétaire", nl: "Secretaris", en: "Secretary" },
    description: { fr: "L'administratif du club.", nl: "De administratie van de club.", en: "The club's paperwork." },
    icon: "document",
    grants: ["people.read", "people.manage", "registrations.manage", "documents.read", "documents.manage", "notifications.manage"],
    scope: "all",
  },
];

/** 32: the delegated roles a federation's presidency proposes (same mechanism as a club's staff roles). */
export const federationRoles: ProposedRole[] = [
  { key: "referees-lead", name: { fr: "Responsable arbitrage", nl: "Verantwoordelijke arbitrage", en: "Referees lead" }, description: { fr: "Arbitres, disponibilités, désignations, notes de frais, formations d'arbitres.", nl: "Scheidsrechters, beschikbaarheden, aanduidingen, onkostennota's, opleidingen.", en: "Referees, availability, appointments, expense claims, referee training." }, icon: "whistle", grants: ["federation.referees"], scope: "all" },
  { key: "competitions-lead", name: { fr: "Responsable compétitions", nl: "Verantwoordelijke competities", en: "Competitions lead" }, description: { fr: "Tournois, journées, calendrier, résultats.", nl: "Toernooien, speeldagen, kalender, uitslagen.", en: "Tournaments, match days, calendar, results." }, icon: "trophy", grants: ["federation.competitions"], scope: "all" },
  { key: "discipline-lead", name: { fr: "Responsable discipline", nl: "Verantwoordelijke tucht", en: "Discipline lead" }, description: { fr: "Sanctions, recours, amendes.", nl: "Sancties, beroepen, boetes.", en: "Sanctions, appeals, fines." }, icon: "shield", grants: ["federation.discipline"], scope: "all" },
  { key: "classification-lead", name: { fr: "Responsable classification", nl: "Verantwoordelijke classificatie", en: "Classification lead" }, description: { fr: "Journées de classification, textes PF1 et PF2.", nl: "Classificatiedagen, teksten PF1 en PF2.", en: "Classification days, PF1 and PF2 texts." }, icon: "badgeCheck", grants: ["federation.classification"], scope: "all" },
  { key: "licences-lead", name: { fr: "Responsable licences et affiliations", nl: "Verantwoordelijke licenties en aansluitingen", en: "Licences and affiliations lead" }, description: { fr: "Clubs, licences, affiliations, transferts.", nl: "Clubs, licenties, aansluitingen, transfers.", en: "Clubs, licences, affiliations, transfers." }, icon: "landmark", grants: ["federation.licences"], scope: "all" },
  { key: "courses-lead", name: { fr: "Responsable formations", nl: "Verantwoordelijke opleidingen", en: "Training lead" }, description: { fr: "Formations des coachs et des arbitres.", nl: "Opleidingen van coaches en scheidsrechters.", en: "Coach and referee training." }, icon: "team", grants: ["federation.courses"], scope: "all" },
  { key: "communication", name: { fr: "Communication", nl: "Communicatie", en: "Communication" }, description: { fr: "Circulaires, pages publiques, guide.", nl: "Omzendbrieven, openbare pagina's, gids.", en: "Circulars, public pages, guide." }, icon: "megaphone", grants: ["federation.communication"], scope: "all" },
  { key: "federation-treasurer", name: { fr: "Trésorier fédéral", nl: "Federaal penningmeester", en: "Federation treasurer" }, description: { fr: "Finances de la fédération, notes de frais à payer.", nl: "Financiën van de federatie, te betalen onkostennota's.", en: "The federation's money, expense claims to pay." }, icon: "funding", grants: ["federation.finance"], scope: "all" },
];

/** The club-wide grants a role gives. */
export function roleGrants(r: { grants: string[]; scope: string }): string[] {
  return r.scope === "own_teams" ? r.grants.filter((g) => !(teamScoped as string[]).includes(g)) : r.grants;
}
/** A person's effective grants from his roles and his own adjustments. */
export function effectiveGrants(roles: { grants: string[]; scope: string }[], added: string[], removed: string[]) {
  const fromRoles = new Set(roles.flatMap(roleGrants));
  for (const g of added) fromRoles.add(g);
  for (const g of removed) fromRoles.delete(g);
  return [...fromRoles].sort();
}
/** A rights grid saved by hand, read as additions and removals against the roles. */
export function adjustments(roles: { grants: string[]; scope: string }[], grants: string[]) {
  const fromRoles = new Set(roles.flatMap(roleGrants));
  return { added: grants.filter((g) => !fromRoles.has(g)).sort(), removed: [...fromRoles].filter((g) => !grants.includes(g)).sort() };
}

const text3 = z.object({ fr: z.string().trim().min(2).max(80), nl: z.string().trim().max(80).default(""), en: z.string().trim().max(80).default("") });
const sentence = z.object({ fr: z.string().trim().max(200).default(""), nl: z.string().trim().max(200).default(""), en: z.string().trim().max(200).default("") });
export const staffRoleCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.uuid().optional(),
    name: text3,
    description: sentence.default({ fr: "", nl: "", en: "" }),
    icon: z.string().max(40).default("team"),
    grants: z.array(z.enum(assignable)).max(assignable.length),
    scope: z.enum(["all", "own_teams"]),
    /** 2: without it, a change to a role used by people only returns what each would gain or lose. */
    confirm: z.boolean().default(false),
  }),
  z.object({ action: z.literal("archive"), id: z.uuid(), archived: z.boolean() }),
  /** A person's roles (one or several). */
  z.object({ action: z.literal("assign"), mandateId: z.uuid(), roleIds: z.array(z.uuid()).max(10) }),
  /** 32: the federation's presidency appoints someone who already has an account (a referee, a club's president or coach). */
  z.object({ action: z.literal("appoint"), userId: z.string().min(1).max(200), roleIds: z.array(z.uuid()).min(1).max(10), validUntil: z.iso.datetime({ offset: true }).nullable().default(null) }),
  /** 32: the end of a delegation (his other roles stay). */
  z.object({ action: z.literal("endDelegate"), mandateId: z.uuid() }),
]);
export type StaffRoleCommand = z.infer<typeof staffRoleCommand>;

type Ctx = { c: PoolClient; org: string; kind: "club" | "federation"; userId: string; manage: boolean; mine: Permission[] };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" && a.kind !== "federation") throw new AccessError("FORBIDDEN");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const mine = permissions(a.role, a.grants);
    const out = await fn({ c, org: a.organization_id, kind: a.kind as "club" | "federation", userId: p.userId, manage: mfa && mine.includes("mandates.manage"), mine });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** 1: the seven proposed roles, created once per club (the eight delegated roles for a federation), then its own. */
export async function ensureProposed(c: PoolClient, org: string, kind: "club" | "federation" = "club") {
  for (const r of kind === "federation" ? federationRoles : proposedRoles)
    await c.query("INSERT INTO staff_role(organization_id,key,name,description,icon,grants,scope) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (organization_id,key) WHERE key IS NOT NULL DO NOTHING", [
      org,
      r.key,
      JSON.stringify(r.name),
      JSON.stringify(r.description),
      r.icon,
      r.grants,
      r.scope,
    ]);
}

type RoleRow = { id: string; key: string | null; name: T3; description: T3; icon: string; grants: string[]; scope: "all" | "own_teams"; archived: boolean; version: number };
async function rolesOf(c: PoolClient, mandateId: string) {
  return (await c.query("SELECT r.grants,r.scope FROM mandate_staff_role m JOIN staff_role r ON r.id=m.role_id WHERE m.mandate_id=$1 AND NOT r.archived", [mandateId])).rows as { grants: string[]; scope: string }[];
}
/** Recomputes a person's grants from his roles and his adjustments; the journal keeps the change. */
export async function recompute(c: PoolClient, org: string, mandateId: string, by: string, why: string) {
  const m = (await c.query("SELECT id,user_id,role,grants,grants_added,grants_removed FROM role_assignment WHERE id=$1 AND organization_id=$2 FOR UPDATE", [mandateId, org])).rows[0] as
    | { id: string; user_id: string; role: string; grants: string[]; grants_added: string[]; grants_removed: string[] }
    | undefined;
  if (!m) return;
  // tax.identity is given from the tax receipts page only: kept as it is.
  const kept = m.grants.includes("tax.identity") ? ["tax.identity"] : [];
  const next = [...new Set([...effectiveGrants(await rolesOf(c, mandateId), m.grants_added, m.grants_removed), ...kept])].sort();
  const before = [...m.grants].sort();
  if (next.join() === before.join()) return;
  await c.query("UPDATE role_assignment SET grants=$2 WHERE id=$1", [mandateId, next]);
  await audit(c, org, by, "mandate.grants", mandateId, { userId: m.user_id, role: m.role, before, after: next, why });
}

/** For the rights grid saved by hand: its additions and removals against the person's roles. */
export async function rememberAdjustments(c: PoolClient, mandateId: string, grants: string[]) {
  const { added, removed } = adjustments(await rolesOf(c, mandateId), grants);
  await c.query("UPDATE role_assignment SET grants_added=$2,grants_removed=$3 WHERE id=$1", [mandateId, added, removed]);
}

/** 4: an accepted invitation brings the roles chosen with it. */
export async function rolesOnAccept(c: PoolClient, org: string, invitationId: string, mandateId: string, by: string) {
  const ids = ((await c.query("SELECT staff_role_ids FROM invitation WHERE id=$1", [invitationId])).rows[0]?.staff_role_ids ?? []) as string[];
  if (!ids.length) return;
  for (const id of ids) await c.query("INSERT INTO mandate_staff_role(mandate_id,role_id,organization_id) SELECT $1,id,organization_id FROM staff_role WHERE id=$2 AND organization_id=$3 AND NOT archived ON CONFLICT DO NOTHING", [mandateId, id, org]);
  const grants = ((await c.query("SELECT grants FROM role_assignment WHERE id=$1", [mandateId])).rows[0]?.grants ?? []) as string[];
  await rememberAdjustments(c, mandateId, grants);
  await recompute(c, org, mandateId, by, "invitation");
}

export async function staffRolesView(db: Pool, p: Principal) {
  return scope(db, p, true, async (x) => {
    if (x.manage) await ensureProposed(x.c, x.org, x.kind);
    const roles = (
      await x.c.query(
        `SELECT r.id,r.key,r.name,r.description,r.icon,r.grants,r.scope,r.archived,r.version,
                (SELECT count(*)::int FROM mandate_staff_role m JOIN role_assignment a ON a.id=m.mandate_id WHERE m.role_id=r.id AND a.revoked_at IS NULL AND (a.valid_until IS NULL OR a.valid_until>now())) AS people
           FROM staff_role r WHERE r.organization_id=$1 ORDER BY r.archived,r.key IS NULL,r.created_at`,
        [x.org],
      )
    ).rows as (RoleRow & { people: number })[];
    // The staff: the club's mandates that are not a presidency, a player or a parent.
    const staff = x.manage
      ? ((
          await x.c.query(
            `SELECT a.id,u.name,a.role,a.grants,a.grants_added,a.grants_removed,COALESCE(array_agg(m.role_id) FILTER (WHERE m.role_id IS NOT NULL),'{}') AS roles
               FROM role_assignment a JOIN "user" u ON u.id=a.user_id LEFT JOIN mandate_staff_role m ON m.mandate_id=a.id
              WHERE a.organization_id=$1 AND a.role=$2 AND a.revoked_at IS NULL AND (a.valid_until IS NULL OR a.valid_until>now())
              GROUP BY a.id,u.name ORDER BY u.name`,
            [x.org, x.kind === "federation" ? "federation_worker" : "coach"],
          )
        ).rows as { id: string; name: string; role: string; grants: string[]; grants_added: string[]; grants_removed: string[]; roles: string[] }[])
      : [];
    // 32: for the federation's presidency, who may be appointed and the journal of the delegations.
    const federation = x.kind === "federation" && x.manage;
    const candidates = federation
      ? ((
          await x.c.query(
            `SELECT DISTINCT ON (u.id) u.id,u.name,o.name AS organization,r.role FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization o ON o.id=r.organization_id
              WHERE ((r.organization_id=$1 AND r.role='referee') OR (o.federation_id=$1 AND r.role IN ('club_president','coach'))) AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active
                AND NOT EXISTS (SELECT 1 FROM role_assignment w WHERE w.organization_id=$1 AND w.user_id=u.id AND w.role='federation_worker' AND w.revoked_at IS NULL AND (w.valid_until IS NULL OR w.valid_until>now()))
              ORDER BY u.id,u.name LIMIT 500`,
            [x.org],
          )
        ).rows as { id: string; name: string; organization: string; role: string }[])
      : [];
    const journal = federation
      ? ((
          await x.c.query(
            `SELECT l.action,l.created_at,l.details,a.name AS actor FROM audit_log l LEFT JOIN "user" a ON a.id=l.actor_id
              WHERE l.organization_id=$1 AND l.action IN ('mandate.grants','mandate.roles','staff_role.created','staff_role.changed','delegate.appointed','delegate.ended') ORDER BY l.created_at DESC LIMIT 50`,
            [x.org],
          )
        ).rows as { action: string; created_at: string; details: Record<string, unknown> | null; actor: string | null }[])
      : [];
    const until = federation
      ? Object.fromEntries((await x.c.query("SELECT id,valid_until FROM role_assignment WHERE organization_id=$1 AND role='federation_worker'", [x.org])).rows.map((r) => [r.id, r.valid_until as string | null]))
      : {};
    return { organization_id: x.org, kind: x.kind, can: { manage: x.manage }, candidates: candidates.sort((a, b) => a.name.localeCompare(b.name)), journal, until, mine: x.mine.filter((g) => fitsKind(x.kind, g)), roles, staff: staff.map((s) => ({ ...s, custom: s.grants_added.length + s.grants_removed.length > 0 })) };
  });
}

export async function staffRolesExecute(db: Pool, p: Principal, raw: z.input<typeof staffRoleCommand>, expected: string) {
  const cmd: StaffRoleCommand = staffRoleCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (!x.manage) throw new AccessError("FORBIDDEN");
      // Never hand out more than one holds.
      const beyond = (grants: string[]) => grants.some((g) => !(x.mine as string[]).includes(g) || !fitsKind(x.kind, g));
      if (cmd.action === "save") {
        if (beyond(cmd.grants)) throw new AccessError("FORBIDDEN");
        if (!cmd.id) {
          const id = (
            await x.c.query("INSERT INTO staff_role(organization_id,name,description,icon,grants,scope,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              x.org,
              JSON.stringify(cmd.name),
              JSON.stringify(cmd.description),
              cmd.icon,
              cmd.grants,
              cmd.scope,
              x.userId,
            ])
          ).rows[0].id as string;
          await audit(x.c, x.org, x.userId, "staff_role.created", id, { grants: cmd.grants, scope: cmd.scope });
          return { id, changes: [] };
        }
        const role = (await x.c.query("SELECT id,grants,scope FROM staff_role WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.id, x.org])).rows[0] as { id: string; grants: string[]; scope: string } | undefined;
        if (!role) throw new AccessError("NOT_FOUND", 404);
        // 2: who gains or loses what, person by person.
        const holders = (
          await x.c.query(
            'SELECT a.id,u.name,a.grants,a.grants_added,a.grants_removed FROM mandate_staff_role m JOIN role_assignment a ON a.id=m.mandate_id JOIN "user" u ON u.id=a.user_id WHERE m.role_id=$1 AND a.revoked_at IS NULL ORDER BY u.name',
            [role.id],
          )
        ).rows as { id: string; name: string; grants: string[]; grants_added: string[]; grants_removed: string[] }[];
        const changes = [];
        for (const h of holders) {
          const others = (await x.c.query("SELECT r.grants,r.scope FROM mandate_staff_role m JOIN staff_role r ON r.id=m.role_id WHERE m.mandate_id=$1 AND r.id<>$2 AND NOT r.archived", [h.id, role.id])).rows as { grants: string[]; scope: string }[];
          const next = effectiveGrants([...others, { grants: cmd.grants, scope: cmd.scope }], h.grants_added, h.grants_removed);
          const before = h.grants.filter((g) => g !== "tax.identity");
          const gained = next.filter((g) => !before.includes(g));
          const lost = before.filter((g) => !next.includes(g));
          if (gained.length || lost.length) changes.push({ mandateId: h.id, name: h.name, gained, lost });
        }
        if (changes.length && !cmd.confirm) return { id: role.id, changes, confirmed: false };
        await x.c.query("UPDATE staff_role SET name=$3,description=$4,icon=$5,grants=$6,scope=$7,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [
          role.id,
          x.org,
          JSON.stringify(cmd.name),
          JSON.stringify(cmd.description),
          cmd.icon,
          cmd.grants,
          cmd.scope,
        ]);
        await audit(x.c, x.org, x.userId, "staff_role.changed", role.id, { before: { grants: role.grants, scope: role.scope }, after: { grants: cmd.grants, scope: cmd.scope } });
        for (const h of holders) await recompute(x.c, x.org, h.id, x.userId, `role:${role.id}`);
        return { id: role.id, changes, confirmed: true };
      }
      if (cmd.action === "archive") {
        const r = await x.c.query("UPDATE staff_role SET archived=$3,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id", [cmd.id, x.org, cmd.archived]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        const holders = (await x.c.query("SELECT mandate_id FROM mandate_staff_role WHERE role_id=$1", [cmd.id])).rows.map((h) => h.mandate_id as string);
        for (const h of holders) await recompute(x.c, x.org, h, x.userId, `role:${cmd.id}`);
        return { id: cmd.id };
      }
      if (cmd.action === "appoint" || cmd.action === "endDelegate") {
        if (x.kind !== "federation") throw new AccessError("FORBIDDEN");
        if (cmd.action === "endDelegate") {
          const r = await x.c.query("UPDATE role_assignment SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND role='federation_worker' AND revoked_at IS NULL RETURNING user_id", [cmd.mandateId, x.org]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(x.c, x.org, x.userId, "delegate.ended", cmd.mandateId, { userId: r.rows[0].user_id });
          return { id: cmd.mandateId };
        }
        // Someone of this federation's world only: one of its referees, or a president or coach of an affiliated club.
        const known = await x.c.query(
          `SELECT 1 FROM role_assignment r JOIN organization o ON o.id=r.organization_id WHERE r.user_id=$2 AND r.revoked_at IS NULL
             AND ((r.organization_id=$1 AND r.role='referee') OR (o.federation_id=$1 AND r.role IN ('club_president','coach')))`,
          [x.org, cmd.userId],
        );
        if (!known.rowCount) throw new AccessError("NOT_FOUND", 404);
        if (cmd.validUntil && new Date(cmd.validUntil) <= new Date()) throw new AccessError("INVALID_DATE", 400);
        const roles = (await x.c.query("SELECT id,grants,scope FROM staff_role WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND NOT archived", [x.org, cmd.roleIds])).rows as { id: string; grants: string[]; scope: string }[];
        if (roles.length !== new Set(cmd.roleIds).size) throw new AccessError("NOT_FOUND", 404);
        await x.c.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT (organization_id,user_id) DO UPDATE SET active=true", [x.org, cmd.userId]);
        const mandate = (
          await x.c.query("INSERT INTO role_assignment(organization_id,user_id,role,grants,valid_until,created_by) VALUES($1,$2,'federation_worker','{}',$3,$4) RETURNING id", [x.org, cmd.userId, cmd.validUntil, x.userId])
        ).rows[0].id as string;
        for (const r of roles) await x.c.query("INSERT INTO mandate_staff_role(mandate_id,role_id,organization_id) VALUES($1,$2,$3)", [mandate, r.id, x.org]);
        await audit(x.c, x.org, x.userId, "delegate.appointed", mandate, { userId: cmd.userId, roles: roles.map((r) => r.id) });
        await recompute(x.c, x.org, mandate, x.userId, "appointed");
        return { id: mandate };
      }
      // assign
      const target = (await x.c.query("SELECT id,user_id,role FROM role_assignment WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL FOR UPDATE", [cmd.mandateId, x.org])).rows[0] as { id: string; user_id: string; role: string } | undefined;
      if (!target) throw new AccessError("NOT_FOUND", 404);
      if (target.role !== (x.kind === "federation" ? "federation_worker" : "coach") || target.user_id === x.userId) throw new AccessError("FORBIDDEN");
      const roles = (await x.c.query("SELECT id,grants,scope FROM staff_role WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND NOT archived", [x.org, cmd.roleIds])).rows as { id: string; grants: string[]; scope: string }[];
      if (roles.length !== new Set(cmd.roleIds).size) throw new AccessError("NOT_FOUND", 404);
      if (beyond(roles.flatMap(roleGrants))) throw new AccessError("FORBIDDEN");
      // What was set by hand so far stays as the person's own adjustments…
      const current = ((await x.c.query("SELECT grants FROM role_assignment WHERE id=$1", [target.id])).rows[0]?.grants ?? []) as string[];
      await rememberAdjustments(x.c, target.id, current.filter((g) => g !== "tax.identity"));
      await x.c.query("DELETE FROM mandate_staff_role WHERE mandate_id=$1", [target.id]);
      for (const r of roles) await x.c.query("INSERT INTO mandate_staff_role(mandate_id,role_id,organization_id) VALUES($1,$2,$3)", [target.id, r.id, x.org]);
      // …except what the new roles give anyway.
      const given = new Set(roles.flatMap(roleGrants));
      await x.c.query("UPDATE role_assignment SET grants_added=ARRAY(SELECT unnest(grants_added) EXCEPT SELECT unnest($2::text[])),grants_removed=ARRAY(SELECT unnest(grants_removed) INTERSECT SELECT unnest($2::text[])) WHERE id=$1", [target.id, [...given]]);
      await audit(x.c, x.org, x.userId, "mandate.roles", target.id, { userId: target.user_id, roles: roles.map((r) => r.id) });
      await recompute(x.c, x.org, target.id, x.userId, "roles");
      return { id: target.id };
    },
    expected,
  );
}
