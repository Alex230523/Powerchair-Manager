import type { Pool, PoolClient } from "pg";
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

/**
 * Season rollover: the new season starts from the previous one. Teams are
 * copied, the people chosen for each team are re-enrolled from the first day
 * of the new season, the dues plans can follow (one year later) and the old
 * season can be archived (it stays readable, it refuses changes).
 */
export const rolloverCommand = z.object({
  fromSeasonId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  teams: z
    .array(z.object({ teamId: z.uuid(), profiles: z.array(z.uuid()).max(200) }))
    .max(50),
  copyPlans: z.boolean(),
  archiveOld: z.boolean(),
});
export type RolloverCommand = z.infer<typeof rolloverCommand>;

/** The same calendar date one year later (29 February becomes 28 February). */
export function nextYear(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
/** Suggested name: "2026-2027" after "2025-2026", otherwise the name plus one year. */
export function suggestedName(name: string) {
  const m = name.match(/(\d{4})\s*([-/])\s*(\d{2,4})/);
  if (!m) return name;
  const a = Number(m[1]) + 1,
    b = m[3].length === 2 ? String((Number(m[3]) + 1) % 100).padStart(2, "0") : String(Number(m[3]) + 1);
  return name.replace(m[0], `${a}${m[2]}${b}`);
}

async function scope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (x: { c: PoolClient; org: string; money: boolean }) => Promise<T>,
  expected?: string,
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
    if (!mfa) throw new AccessError("MFA_REQUIRED");
    if (!rights.includes("teams.manage")) throw new AccessError("FORBIDDEN");
    const out = await fn({
      c,
      org: a.organization_id,
      money: rights.includes("dues.manage"),
    });
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

export async function rolloverView(db: Pool, p: Principal, fromSeasonId?: string) {
  return scope(db, p, false, async ({ c, org, money }) => {
    const seasons = (
      await c.query(
        "SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on,archived FROM season WHERE organization_id=$1 ORDER BY starts_on DESC",
        [org],
      )
    ).rows;
    const from = seasons.find((s) => s.id === fromSeasonId) ?? seasons.find((s) => !s.archived) ?? seasons[0];
    if (!from) return { organization_id: org, can: { money }, seasons, from: null, teams: [], plans: [], suggestion: null };
    const teams = (
      await c.query(
        `SELECT t.id,t.name,t.category,t.level,
                COALESCE(json_agg(json_build_object('profile_id',cp.id,'full_name',cp.full_name,'role',m.role,'status',cp.status) ORDER BY m.role,cp.full_name) FILTER (WHERE cp.id IS NOT NULL),'[]') AS members
           FROM team t
           LEFT JOIN team_membership m ON m.team_id=t.id AND NOT m.cancelled AND m.closed_at IS NULL
           LEFT JOIN club_person cp ON cp.id=m.profile_id
          WHERE t.organization_id=$1 AND t.season_id=$2 AND NOT t.archived
          GROUP BY t.id ORDER BY t.name`,
        [org, from.id],
      )
    ).rows;
    return {
      organization_id: org,
      can: { money },
      seasons,
      from,
      teams,
      plans: money
        ? (
            await c.query(
              "SELECT id,category,amount_cents,max_installments,first_due::text AS first_due FROM dues_plan WHERE organization_id=$1 AND season_id=$2 AND NOT archived ORDER BY category",
              [org, from.id],
            )
          ).rows
        : [],
      suggestion: {
        name: suggestedName(from.name),
        startsOn: nextYear(from.starts_on),
        endsOn: nextYear(from.ends_on),
      },
    };
  });
}

export async function rolloverExecute(
  db: Pool,
  p: Principal,
  cmd: RolloverCommand,
  expected: string,
) {
  return scope(
    db,
    p,
    true,
    async ({ c, org, money }) => {
      if (cmd.endsOn < cmd.startsOn) throw new AccessError("INVALID_DATE", 400);
      const from = (
        await c.query("SELECT *,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE id=$1 AND organization_id=$2 FOR UPDATE", [
          cmd.fromSeasonId,
          org,
        ])
      ).rows[0];
      if (!from) throw new AccessError("NOT_FOUND", 404);
      if (cmd.startsOn <= from.starts_on) throw new AccessError("INVALID_DATE", 400);
      if (cmd.copyPlans && !money) throw new AccessError("FORBIDDEN");
      const season = (
        await c.query(
          "INSERT INTO season(organization_id,name,starts_on,ends_on,rolled_from) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [org, cmd.name, cmd.startsOn, cmd.endsOn, from.id],
        )
      ).rows[0].id as string;
      let enrolled = 0;
      for (const team of cmd.teams) {
        const old = (
          await c.query(
            "SELECT * FROM team WHERE id=$1 AND organization_id=$2 AND season_id=$3",
            [team.teamId, org, from.id],
          )
        ).rows[0];
        if (!old) throw new AccessError("NOT_FOUND", 404);
        const copy = (
          await c.query(
            // The places per team (wave 16, R1) and the colour follow the team into the new season.
            "INSERT INTO team(organization_id,season_id,name,category,level,home_location,capacity,color) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            [org, season, old.name, old.category, old.level, old.home_location, old.capacity ?? null, old.color ?? null],
          )
        ).rows[0].id as string;
        // The chosen people keep the role they had in the team.
        const members = (
          await c.query(
            "SELECT DISTINCT ON (m.profile_id,m.role) m.profile_id,m.role,m.position FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=$1 AND NOT m.cancelled AND m.closed_at IS NULL AND cp.status='active' AND m.profile_id=ANY($2::uuid[])",
            [old.id, team.profiles],
          )
        ).rows;
        for (const m of members) {
          await c.query(
            "INSERT INTO team_membership(organization_id,team_id,profile_id,role,position,starts_on) VALUES($1,$2,$3,$4,$5,$6)",
            [org, copy, m.profile_id, m.role, m.position, cmd.startsOn],
          );
          enrolled++;
        }
      }
      // Memberships of the old season end with it (history is kept).
      await c.query(
        `UPDATE team_membership m SET ends_on=GREATEST(m.starts_on,LEAST($2::date,$3::date-1))
           FROM team t WHERE t.id=m.team_id AND t.season_id=$1 AND m.ends_on IS NULL AND NOT m.cancelled`,
        [from.id, from.ends_on, cmd.startsOn],
      );
      let plans = 0;
      if (cmd.copyPlans)
        plans =
          (
            await c.query(
              `INSERT INTO dues_plan(organization_id,season_id,category,amount_cents,max_installments,first_due,sibling_second_percent,sibling_next_percent)
               SELECT organization_id,$2,category,amount_cents,max_installments,(first_due+interval '1 year')::date,sibling_second_percent,sibling_next_percent
                 FROM dues_plan WHERE organization_id=$1 AND season_id=$3 AND NOT archived`,
              [org, season, from.id],
            )
          ).rowCount ?? 0;
      if (cmd.archiveOld)
        await c.query("UPDATE season SET archived=true WHERE id=$1", [from.id]);
      await audit(c, org, p.userId, "season.rollover", season, {
        from: from.id,
        teams: cmd.teams.length,
        enrolled,
        plans,
        archived: cmd.archiveOld,
      });
      return { id: season, enrolled, plans };
    },
    expected,
  );
}
