import type { Pool, PoolClient } from "pg";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  AccessError,
  account,
  active,
  audit,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import { ownProfiles } from "../calendar/access";

/**
 * Fundraising, kept apart from the club accounts. A group (support committee,
 * "new chairs 2027" project) holds pots with a goal. Gifts, sponsors and
 * actions are noted here; nothing is written in the ledger, and the treasurer
 * books the money on their side as usual.
 */
const text = (n: number) => z.string().trim().max(n);
export const movementKinds = ["donation", "sponsor", "action", "subsidy", "expense"] as const;
export const fundraisingCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("group"),
    id: z.uuid().optional(),
    name: text(120).min(2),
    description: text(2000),
    archived: z.boolean(),
  }),
  z.object({
    action: z.literal("pot"),
    id: z.uuid().optional(),
    groupId: z.uuid(),
    name: text(120).min(2),
    description: text(2000),
    goalCents: z.number().int().min(100).max(1000000000),
    deadline: z.iso.date().nullable(),
    status: z.enum(["open", "closed"]),
    /** The players take part: they see the pot and note what they collect. */
    playersJoin: z.boolean().optional(),
    /** A pot of one team (wave 15): only its players take part; null or absent: the whole club. */
    teamId: z.uuid().nullable().optional(),
    /** 9: an outside page (a donation page, a form). */
    linkUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]).optional(),
  }),
  /** 9: a goal per person (« vendre 20 boîtes »); target 0 removes it. */
  z.object({ action: z.literal("goal"), potId: z.uuid(), profileId: z.uuid(), target: z.number().int().min(0).max(100000), unit: text(60) }),
  /** 9: the progress of a goal, by the club, the player or his parent. */
  z.object({ action: z.literal("progress"), potId: z.uuid(), profileId: z.uuid(), done: z.number().int().min(0).max(100000) }),
  /** 9: tasks given to players and coaches, in the central to-do (« Collecte de fonds »). */
  z.object({ action: z.literal("tasks"), potId: z.uuid(), title: text(200).min(2), dueOn: z.iso.date().nullable(), profileIds: z.array(z.uuid()).min(1).max(100) }),
  z.object({ action: z.literal("publish"), potId: z.uuid(), public: z.boolean() }),
  z.object({
    action: z.literal("movement"),
    potId: z.uuid(),
    occurredOn: z.iso.date(),
    kind: z.enum(movementKinds),
    label: text(160).min(2),
    amountCents: z.number().int().min(1).max(1000000000),
    donor: text(160),
    anonymous: z.boolean(),
    /** The player who collected it, when the pot is run with the players. */
    profileId: z.uuid().nullable().optional(),
    /** A4: the donor, a contact of the club's book. */
    contactId: z.uuid().nullable().optional(),
  }),
  /** A player (or a parent for a child) notes what they collected themselves. */
  z.object({
    action: z.literal("collect"),
    potId: z.uuid(),
    profileId: z.uuid(),
    occurredOn: z.iso.date(),
    kind: z.enum(["donation", "sponsor", "action"]),
    label: text(160).min(2),
    amountCents: z.number().int().min(1).max(1000000000),
    donor: text(160),
  }),
  z.object({ action: z.literal("cancelMovement"), id: z.uuid() }),
]);
export type FundraisingCommand = z.infer<typeof fundraisingCommand>;
export type Goal = { profile_id: string; full_name: string; target: number; unit: string; done: number };
/** A movement as shown: amounts and donors only for money managers and readers. */
export type MovementView = {
  id: string;
  occurred_on: string;
  kind: string;
  label: string;
  amount_cents?: number;
  donor?: string;
  anonymous?: boolean;
  cancelled_at?: string | null;
  author?: string;
  profile_id?: string | null;
  collector?: string | null;
  self_reported?: boolean;
};

/** Collected = gifts, sponsors, actions and subsidies, minus expenses. */
export function potProgress(
  goalCents: number,
  movements: { kind: string; amount_cents: number; cancelled_at?: unknown }[],
) {
  const live = movements.filter((m) => !m.cancelled_at);
  const raised = live
    .filter((m) => m.kind !== "expense")
    .reduce((n, m) => n + m.amount_cents, 0);
  const spent = live
    .filter((m) => m.kind === "expense")
    .reduce((n, m) => n + m.amount_cents, 0);
  const net = raised - spent;
  return {
    raised,
    spent,
    net,
    left: Math.max(0, goalCents - net),
    percent: goalCents ? Math.min(100, Math.floor((Math.max(0, net) * 100) / goalCents)) : 0,
    reached: net >= goalCents,
  };
}

/** A player is in a team today (same rule as the scope of the top bar). */
const currentMemberSql =
  "SELECT 1 FROM team_membership m WHERE m.team_id=$1 AND m.profile_id=$2 AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)";
async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (x: {
    c: PoolClient;
    org: string;
    manage: boolean;
    detail: boolean;
    userId: string;
    own: Set<string>;
  }) => Promise<T>,
  expected?: string,
  /** The command is a member's own collection: no money right needed. */
  member = false,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [
      a.organization_id,
    ]);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const manage = mfa && rights.includes("dues.manage");
    // Donor names and the movement list: money managers and readers only.
    const detail = manage || (mfa && rights.includes("dues.read"));
    if (write && !manage && !member) throw new AccessError(mfa ? "FORBIDDEN" : "MFA_REQUIRED");
    const own = await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled });
    const out = await fn({ c, org: a.organization_id, manage, detail, userId: p.userId, own });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}

export async function fundraisingView(db: Pool, p: Principal) {
  return scope(db, p, false, async ({ c, org, manage, detail, own }) => {
    const groups = (
      await c.query(
        "SELECT id,name,description,archived FROM fundraising_group WHERE organization_id=$1 AND ($2 OR NOT archived) ORDER BY archived,name",
        [org, manage],
      )
    ).rows;
    const pots = (
      await c.query(
        `SELECT p.id,p.group_id,p.name,p.description,p.goal_cents,p.deadline::text AS deadline,p.status,p.public_token,p.players_join,p.version,p.team_id,t.name AS team_name,t.color AS team_color,p.link_url,
                COALESCE((SELECT json_agg(json_build_object('profile_id',g.profile_id,'full_name',cp.full_name,'target',g.target,'unit',g.unit,'done',g.done) ORDER BY cp.full_name) FROM fundraising_goal g JOIN club_person cp ON cp.id=g.profile_id WHERE g.pot_id=p.id),'[]') AS goals,
                COALESCE((SELECT array_agg(DISTINCT m.profile_id::text) FROM team_membership m WHERE m.team_id=p.team_id AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)),'{}'::text[]) AS team_members
           FROM fundraising_pot p LEFT JOIN team t ON t.id=p.team_id WHERE p.organization_id=$1 ORDER BY p.status,p.created_at DESC`,
        [org],
      )
    ).rows as {
      id: string;
      group_id: string;
      name: string;
      description: string;
      goal_cents: number;
      deadline: string | null;
      status: string;
      public_token: string | null;
      players_join: boolean;
      version: number;
      team_id: string | null;
      team_name: string | null;
      team_color: string | null;
      team_members: string[];
      link_url: string;
      goals: Goal[];
    }[];
    const movements = (
      await c.query(
        `SELECT m.id,m.pot_id,m.occurred_on::text AS occurred_on,m.kind,m.label,m.amount_cents,m.donor,m.anonymous,m.cancelled_at,u.name AS author,m.profile_id,cp.full_name AS collector,m.self_reported
           FROM fundraising_movement m JOIN fundraising_pot p ON p.id=m.pot_id JOIN "user" u ON u.id=m.created_by LEFT JOIN club_person cp ON cp.id=m.profile_id
          WHERE p.organization_id=$1 ORDER BY m.occurred_on DESC,m.created_at DESC`,
        [org],
      )
    ).rows as (MovementView & { pot_id: string; amount_cents: number })[];
    const players = manage
      ? ((
          await c.query(
            "SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles) AND NOT 'player'=ANY(former_roles) ORDER BY full_name",
            [org],
          )
        ).rows as { id: string; full_name: string }[])
      : [];
    // 9: the people a fundraising task can be given to (players and coaches).
    const helpers = manage
      ? ((
          await c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' AND ('player'=ANY(directory_roles) OR 'coach'=ANY(directory_roles)) ORDER BY full_name", [org])
        ).rows as { id: string; full_name: string }[])
      : [];
    const ownProfilesList = own.size
      ? ((
          await c.query("SELECT id,full_name FROM club_person WHERE id=ANY($1::uuid[]) ORDER BY full_name", [[...own]])
        ).rows as { id: string; full_name: string }[])
      : [];
    return {
      organization_id: org,
      can: { manage, detail },
      groups,
      players,
      helpers,
      ownProfiles: ownProfilesList,
      // A team pot is offered to that team's players (and their parents) only; money managers and readers see every pot.
      teams: manage ? ((await c.query("SELECT id,name,color FROM team WHERE organization_id=$1 AND NOT archived ORDER BY name", [org])).rows as { id: string; name: string; color: string | null }[]) : [],
      pots: pots
        .filter((pot) => detail || !pot.team_id || pot.team_members.some((m) => own.has(m)))
        .map(({ team_members, ...pot }) => {
        const members = new Set(team_members);
        const mine = movements.filter((m) => m.pot_id === pot.id);
        // Who collected what: shown to everyone when the players take part.
        const byCollector = new Map<string, { profile_id: string; name: string; cents: number; count: number }>();
        for (const m of mine)
          if (m.profile_id && !m.cancelled_at && m.kind !== "expense") {
            const v = byCollector.get(m.profile_id) ?? { profile_id: m.profile_id, name: m.collector ?? "", cents: 0, count: 0 };
            v.cents += m.amount_cents;
            v.count += 1;
            byCollector.set(m.profile_id, v);
          }
        // "Who collected what" lists the team's players only on a team pot.
        const collectors = [...byCollector.values()].filter((v) => !pot.team_id || members.has(v.profile_id)).sort((a, b) => b.cents - a.cents);
        const ownMovements = mine.filter((m) => m.profile_id && own.has(m.profile_id));
        return {
          ...pot,
          /** The team's current players, for the collector list of a money manager (wave 15). */
          team_members: manage ? team_members : [],
          public_token: manage ? pot.public_token : null,
          /** 9: the goals per person: all of them when the players take part, otherwise one's own. */
          goals: pot.goals.filter((g) => manage || detail || pot.players_join || own.has(g.profile_id)),
          progress: potProgress(pot.goal_cents, mine),
          collectors: pot.players_join || detail ? collectors : [],
          /** What the viewer (or their children) collected, with amounts. */
          own_movements: ownMovements.map((m) => ({
            id: m.id,
            occurred_on: m.occurred_on,
            kind: m.kind,
            label: m.label,
            amount_cents: m.amount_cents,
            donor: m.donor,
            collector: m.collector,
            cancelled_at: m.cancelled_at,
          })),
          movements: (detail
            ? mine
            : // Members see the effort, not who gave what.
              mine
                .filter((m) => !m.cancelled_at && m.kind !== "expense")
                .map((m) => ({ id: m.id, occurred_on: m.occurred_on, kind: m.kind, label: m.label, collector: m.collector }))) as MovementView[],
        };
      }),
    };
  });
}

export async function fundraisingExecute(
  db: Pool,
  p: Principal,
  cmd: FundraisingCommand,
  expected: string,
) {
  return scope(
    db,
    p,
    true,
    async ({ c, org, userId, own, manage }) => {
      if (cmd.action !== "collect" && cmd.action !== "cancelMovement" && cmd.action !== "progress" && !manage)
        throw new AccessError("FORBIDDEN");
      const pot = async (id: string) => {
        const row = (
          await c.query("SELECT * FROM fundraising_pot WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, org])
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
        return row;
      };
      switch (cmd.action) {
        case "group": {
          if (cmd.id) {
            const changed = await c.query(
              "UPDATE fundraising_group SET name=$3,description=$4,archived=$5 WHERE id=$1 AND organization_id=$2",
              [cmd.id, org, cmd.name, cmd.description, cmd.archived],
            );
            if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
            return { id: cmd.id };
          }
          const id = (
            await c.query(
              "INSERT INTO fundraising_group(organization_id,name,description,created_by) VALUES($1,$2,$3,$4) RETURNING id",
              [org, cmd.name, cmd.description, userId],
            )
          ).rows[0].id as string;
          await audit(c, org, userId, "fundraising.group", id);
          return { id };
        }
        case "pot": {
          if (
            !(await c.query("SELECT 1 FROM fundraising_group WHERE id=$1 AND organization_id=$2", [cmd.groupId, org]))
              .rowCount
          )
            throw new AccessError("NOT_FOUND", 404);
          if (cmd.teamId && !(await c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2", [cmd.teamId, org])).rowCount)
            throw new AccessError("NOT_FOUND", 404);
          const values = [cmd.groupId, cmd.name, cmd.description, cmd.goalCents, cmd.deadline, cmd.status, cmd.playersJoin ?? null];
          if (cmd.id) {
            await pot(cmd.id);
            await c.query(
              "UPDATE fundraising_pot SET group_id=$3,name=$4,description=$5,goal_cents=$6,deadline=$7,status=$8,players_join=COALESCE($9,players_join),team_id=CASE WHEN $10::boolean THEN $11::uuid ELSE team_id END,link_url=COALESCE($12,link_url),version=version+1 WHERE id=$1 AND organization_id=$2",
              [cmd.id, org, ...values, cmd.teamId !== undefined, cmd.teamId ?? null, cmd.linkUrl ?? null],
            );
            return { id: cmd.id };
          }
          const id = (
            await c.query(
              "INSERT INTO fundraising_pot(organization_id,group_id,name,description,goal_cents,deadline,status,players_join,created_by,team_id,link_url) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,false),$9,$10,$11) RETURNING id",
              [org, ...values, userId, cmd.teamId ?? null, cmd.linkUrl ?? ""],
            )
          ).rows[0].id as string;
          await audit(c, org, userId, "fundraising.pot", id);
          return { id };
        }
        case "goal": {
          await pot(cmd.potId);
          if (!(await c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.profileId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          if (!cmd.target) await c.query("DELETE FROM fundraising_goal WHERE pot_id=$1 AND profile_id=$2", [cmd.potId, cmd.profileId]);
          else
            await c.query(
              "INSERT INTO fundraising_goal(pot_id,organization_id,profile_id,target,unit) VALUES($1,$2,$3,$4,$5) ON CONFLICT (pot_id,profile_id) DO UPDATE SET target=EXCLUDED.target,unit=EXCLUDED.unit,updated_at=now()",
              [cmd.potId, org, cmd.profileId, cmd.target, cmd.unit],
            );
          return { id: cmd.potId };
        }
        case "progress": {
          // The club, or the person himself (a parent for his child).
          if (!manage && !own.has(cmd.profileId)) throw new AccessError("FORBIDDEN");
          const r = await c.query("UPDATE fundraising_goal SET done=$4,updated_at=now() WHERE pot_id=$1 AND profile_id=$2 AND organization_id=$3", [cmd.potId, cmd.profileId, org, cmd.done]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.potId };
        }
        case "tasks": {
          const row = await pot(cmd.potId);
          const people = (
            await c.query("SELECT id FROM club_person WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND status='active' AND ('player'=ANY(directory_roles) OR 'coach'=ANY(directory_roles))", [org, cmd.profileIds])
          ).rows.map((r) => r.id as string);
          if (people.length !== new Set(cmd.profileIds).size) throw new AccessError("NOT_FOUND", 404);
          const task = (
            await c.query(
              "INSERT INTO task(organization_id,kind,category,title,detail,due_on,pot_id,origin,created_by,completion,link_url) VALUES($1,'other','fundraising',$2,$3,$4,$5,'manual',$6,'each',$7) RETURNING id",
              [org, cmd.title, row.name, cmd.dueOn, cmd.potId, userId, row.link_url ?? ""],
            )
          ).rows[0].id as string;
          for (const id of people) await c.query("INSERT INTO task_assignee(task_id,organization_id,profile_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [task, org, id]);
          await audit(c, org, userId, "fundraising.tasks", cmd.potId, { task, people: people.length });
          return { id: task, assigned: people.length };
        }
        case "publish": {
          await pot(cmd.potId);
          // The public page shows the goal and the progress, never the donors.
          await c.query("UPDATE fundraising_pot SET public_token=$2 WHERE id=$1", [
            cmd.potId,
            cmd.public ? randomBytes(18).toString("base64url") : null,
          ]);
          return { id: cmd.potId };
        }
        case "movement": {
          const row = await pot(cmd.potId);
          if (
            cmd.profileId &&
            !(await c.query("SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.profileId, org])).rowCount
          )
            throw new AccessError("NOT_FOUND", 404);
          // On a team pot, the collector is one of the team's players.
          if (cmd.profileId && row.team_id && !(await c.query(currentMemberSql, [row.team_id, cmd.profileId])).rowCount)
            throw new AccessError("FORBIDDEN");
          // A4: a donor chosen in the contact book gives the name when none is typed.
          const donor = cmd.contactId
            ? ((await c.query("SELECT full_name FROM contact WHERE id=$1 AND organization_id=$2", [cmd.contactId, org])).rows[0]?.full_name as string | undefined)
            : undefined;
          if (cmd.contactId && !donor) throw new AccessError("NOT_FOUND", 404);
          const id = (
            await c.query(
              "INSERT INTO fundraising_movement(pot_id,occurred_on,kind,label,amount_cents,donor,anonymous,created_by,profile_id,contact_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
              [cmd.potId, cmd.occurredOn, cmd.kind, cmd.label, cmd.amountCents, cmd.donor || (donor ?? "").slice(0, 160), cmd.anonymous, userId, cmd.profileId ?? null, cmd.contactId ?? null],
            )
          ).rows[0].id as string;
          return { id };
        }
        case "collect": {
          // A member notes what they (or their child) collected on a pot run with the players.
          const row = await pot(cmd.potId);
          if (!row.players_join || row.status !== "open") throw new AccessError("FORBIDDEN");
          if (!own.has(cmd.profileId)) throw new AccessError("FORBIDDEN");
          if (row.team_id && !(await c.query(currentMemberSql, [row.team_id, cmd.profileId])).rowCount) throw new AccessError("FORBIDDEN");
          const id = (
            await c.query(
              "INSERT INTO fundraising_movement(pot_id,occurred_on,kind,label,amount_cents,donor,anonymous,created_by,profile_id,self_reported) VALUES($1,$2,$3,$4,$5,$6,false,$7,$8,true) RETURNING id",
              [cmd.potId, cmd.occurredOn, cmd.kind, cmd.label, cmd.amountCents, cmd.donor, userId, cmd.profileId],
            )
          ).rows[0].id as string;
          await audit(c, org, userId, "fundraising.collect", id);
          return { id };
        }
        case "cancelMovement": {
          // Managers cancel anything; a member only what they noted themselves.
          const changed = await c.query(
            "UPDATE fundraising_movement m SET cancelled_at=now(),cancelled_by=$3 FROM fundraising_pot p WHERE m.id=$1 AND p.id=m.pot_id AND p.organization_id=$2 AND m.cancelled_at IS NULL AND ($4 OR (m.self_reported AND m.created_by=$3))",
            [cmd.id, org, userId, manage],
          );
          if (!changed.rowCount) throw new AccessError(manage ? "NOT_FOUND" : "FORBIDDEN", manage ? 404 : 403);
          return { id: cmd.id };
        }
      }
    },
    expected,
    cmd.action === "collect" || cmd.action === "cancelMovement" || cmd.action === "progress",
  );
}

/** Public progress page of a pot (no account needed, no donor). */
export async function publicPot(db: Pool, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new AccessError("NOT_FOUND", 404);
  const pot = (
    await db.query(
      `SELECT p.id,p.name,p.description,p.goal_cents,p.deadline::text AS deadline,p.status,o.name AS club,g.name AS group_name
         FROM fundraising_pot p JOIN organization o ON o.id=p.organization_id JOIN fundraising_group g ON g.id=p.group_id
        WHERE p.public_token=$1 AND NOT ('fundraising'=ANY(o.disabled_modules))`,
      [token],
    )
  ).rows[0];
  if (!pot) throw new AccessError("NOT_FOUND", 404);
  const movements = (
    await db.query(
      "SELECT kind,amount_cents,cancelled_at FROM fundraising_movement WHERE pot_id=$1",
      [pot.id],
    )
  ).rows;
  const { id: _id, ...rest } = pot;
  void _id;
  return { ...rest, progress: potProgress(pot.goal_cents, movements) };
}
