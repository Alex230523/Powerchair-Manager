import { nationalCount } from "../national/service";
import { seasonOf } from "../finance/schema";
import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { account, active, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { obligationRows } from "../club/obligations";

/**
 * The season's activity report (wave 15, C11): figures only, aggregated.
 * No medical data and no player's name; the only names are the coaches',
 * the partners' and the funders', and what the president types.
 * Finances only for people with the money right.
 */
type Season = { id: string; name: string; starts_on: string; ends_on: string };
type Scope = { c: PoolClient; org: string; money: boolean };

async function scope<T>(db: Pool, p: Principal, fn: (s: Scope) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const rights = permissions(a.role, a.grants);
    if (!rights.some((r) => r === "people.read" || r === "people.manage") || !mfaSatisfied(!!user.twoFactorEnabled)) throw new AccessError("FORBIDDEN");
    const off = ((await c.query("SELECT disabled_modules FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.disabled_modules ?? []) as string[];
    const out = await fn({ c, org: a.organization_id, money: (rights.includes("dues.read") || rights.includes("dues.manage")) && !off.includes("finance") });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Members, players, teams, trainings, hours and attendance of a season (and of some teams). */
async function figures(c: PoolClient, org: string, season: Season, teams: string[]) {
  const people = (
    await c.query(
      "SELECT count(DISTINCT m.profile_id)::int AS members,count(DISTINCT m.profile_id) FILTER (WHERE m.role='player')::int AS players FROM team_membership m WHERE m.organization_id=$1 AND m.team_id=ANY($2::uuid[]) AND NOT m.cancelled",
      [org, teams],
    )
  ).rows[0];
  const trainings = (
    await c.query(
      `SELECT count(*)::int AS n,COALESCE(round(sum(extract(epoch FROM e.ends_at-e.starts_at))/3600),0)::int AS hours
         FROM calendar_event e WHERE e.organization_id=$1 AND e.kind='training' AND e.status='scheduled' AND e.team_id=ANY($2::uuid[])
          AND e.starts_at>=$3::date AND e.starts_at<($4::date+1) AND e.starts_at<now()`,
      [org, teams, season.starts_on, season.ends_on],
    )
  ).rows[0];
  const presence = (
    await c.query(
      `SELECT count(*)::int AS closed,count(*) FILTER (WHERE i.actual IN ('present','late','early'))::int AS attended
         FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
        WHERE e.organization_id=$1 AND e.team_id=ANY($2::uuid[]) AND e.status='scheduled' AND r.closed_at IS NOT NULL AND i.withdrawn_at IS NULL
          AND e.starts_at>=$3::date AND e.starts_at<($4::date+1)`,
      [org, teams, season.starts_on, season.ends_on],
    )
  ).rows[0];
  return {
    members: people.members as number,
    players: people.players as number,
    teams: teams.length,
    trainings: trainings.n as number,
    hours: trainings.hours as number,
    attendance: presence.closed ? Math.round((presence.attended * 100) / presence.closed) : null,
  };
}

/** Everything the report can show for a season; the page picks the sections. */
export async function activityReport(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}) {
  return scope(db, p, async ({ c, org, money }) => {
    const seasons = (await c.query("SELECT id,name,starts_on::text,ends_on::text FROM season WHERE organization_id=$1 ORDER BY starts_on DESC", [org])).rows as Season[];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    const season = seasons.find((s) => s.id === raw.season) ?? seasons.find((s) => s.starts_on <= today && s.ends_on >= today) ?? seasons[0] ?? null;
    const club = (
      await c.query(
        "SELECT o.name,extract(epoch FROM l.updated_at)::bigint::text AS logo_version FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id WHERE o.id=$1",
        [org],
      )
    ).rows[0] as { name: string; logo_version: string | null };
    if (!season) return { organization_id: org, club, seasons, season: null, money };
    const allTeams = (await c.query("SELECT id,name,season_id FROM team WHERE organization_id=$1", [org])).rows as { id: string; name: string; season_id: string }[];
    const team = raw.team ? allTeams.find((t) => t.id === raw.team) ?? null : null;
    if (raw.team && !team) throw new AccessError("NOT_FOUND", 404);
    const teamsOf = (s: Season) => allTeams.filter((t) => t.season_id === s.id && (!team || t.name === team.name)).map((t) => t.id);
    const teamIds = teamsOf(season);
    const previous = seasons.find((s) => s.ends_on < season.starts_on) ?? null;
    const range = [season.starts_on, season.ends_on];
    const tournaments = (
      await c.query(
        `SELECT t.title,t.starts_on::text AS starts_on,t.destination,t.final_rank,t.teams_count,t.result_note,tm.name AS team
           FROM trip t LEFT JOIN team tm ON tm.id=t.team_id
          WHERE t.organization_id=$1 AND t.kind='tournament' AND t.status<>'cancelled' AND t.starts_on BETWEEN $2 AND $3 AND ($4::uuid[] IS NULL OR t.team_id=ANY($4::uuid[]))
          ORDER BY t.starts_on`,
        [org, ...range, team ? teamIds : null],
      )
    ).rows as { title: string; starts_on: string; destination: string; final_rank: number | null; teams_count: number | null; result_note: string; team: string | null }[];
    const matches = (
      await c.query(
        `SELECT tm.name AS team,count(*)::int AS played,count(*) FILTER (WHERE m.our_score>m.their_score)::int AS won,count(*) FILTER (WHERE m.our_score=m.their_score)::int AS drawn,
                count(*) FILTER (WHERE m.our_score<m.their_score)::int AS lost,COALESCE(sum(m.our_score),0)::int AS scored,COALESCE(sum(m.their_score),0)::int AS conceded
           FROM match m JOIN team tm ON tm.id=m.team_id
          WHERE m.organization_id=$1 AND m.status='played' AND m.team_id=ANY($2::uuid[]) GROUP BY tm.name ORDER BY tm.name`,
        [org, teamIds],
      )
    ).rows as { team: string; played: number; won: number; drawn: number; lost: number; scored: number; conceded: number }[];
    const highlights = [
      ...((
        await c.query(
          `SELECT e.title,(e.starts_at AT TIME ZONE 'Europe/Brussels')::date::text AS day,COALESCE(p.name,v.name,NULLIF(e.free_location,'')) AS place
             FROM calendar_event e LEFT JOIN calendar_place p ON p.id=e.place_id LEFT JOIN shared_venue v ON v.id=e.shared_venue_id
            WHERE e.organization_id=$1 AND e.highlight AND e.status='scheduled' AND e.starts_at>=$2::date AND e.starts_at<($3::date+1)
              AND ($4::uuid[] IS NULL OR e.team_id IS NULL OR e.team_id=ANY($4::uuid[])) ORDER BY e.starts_at`,
          [org, ...range, team ? teamIds : null],
        )
      ).rows as { title: string; day: string; place: string | null }[]).map((x) => ({ ...x, kind: "event" as const })),
      ...((
        await c.query(
          `SELECT title,starts_on::text AS day,NULLIF(destination,'') AS place FROM trip
            WHERE organization_id=$1 AND status<>'cancelled' AND starts_on BETWEEN $2 AND $3 AND ($4::uuid[] IS NULL OR team_id=ANY($4::uuid[])) ORDER BY starts_on`,
          [org, ...range, team ? teamIds : null],
        )
      ).rows as { title: string; day: string; place: string | null }[]).map((x) => ({ ...x, kind: "trip" as const })),
    ].sort((a, b) => a.day.localeCompare(b.day));
    const coaches = (
      await c.query(
        "SELECT DISTINCT c.full_name FROM team_membership m JOIN club_person c ON c.id=m.profile_id WHERE m.organization_id=$1 AND m.team_id=ANY($2::uuid[]) AND m.role IN ('coach','assistant') AND NOT m.cancelled ORDER BY c.full_name",
        [org, teamIds],
      )
    ).rows.map((r) => r.full_name as string);
    const volunteers = (
      await c.query("SELECT count(DISTINCT m.profile_id)::int AS n FROM team_membership m WHERE m.organization_id=$1 AND m.team_id=ANY($2::uuid[]) AND m.role='volunteer' AND NOT m.cancelled", [org, teamIds])
    ).rows[0].n as number;
    const courses = (
      await c.query(
        "SELECT k.title,count(*)::int AS n FROM training_request r JOIN training_course k ON k.id=r.course_id WHERE r.organization_id=$1 AND r.status='approved' AND r.completed_on BETWEEN $2 AND $3 GROUP BY k.title ORDER BY k.title",
        [org, ...range],
      )
    ).rows as { title: string; n: number }[];
    const equipment = {
      chairs: (await c.query("SELECT count(*)::int AS n FROM equipment_chair WHERE organization_id=$1 AND status<>'retired'", [org])).rows[0].n as number,
      purchases: (
        await c.query(
          "SELECT e.name,e.purchase_value_cents,g.funder FROM equipment_chair e LEFT JOIN grant_application g ON g.id=e.grant_id WHERE e.organization_id=$1 AND e.acquired_on BETWEEN $2 AND $3 ORDER BY e.acquired_on",
          [org, ...range],
        )
      ).rows as { name: string; purchase_value_cents: number | null; funder: string | null }[],
    };
    const finances = money
      ? ((
          await c.query(
            "SELECT direction,category,sum(amount_cents)::bigint::text AS cents FROM finance_transaction WHERE organization_id=$1 AND cancelled_at IS NULL AND occurred_on BETWEEN $2 AND $3 GROUP BY direction,category ORDER BY direction,category",
            [org, ...range],
          )
        ).rows.map((r) => ({ direction: r.direction as "in" | "out", category: r.category as string, cents: Number(r.cents) })))
      : null;
    const thanks = {
      partners: (await c.query("SELECT name FROM partner WHERE organization_id=$1 AND status='active' ORDER BY name", [org])).rows.map((r) => r.name as string),
      funders: (
        await c.query(
          "SELECT DISTINCT funder FROM grant_application WHERE organization_id=$1 AND status IN ('granted','paid') AND COALESCE(decision_on,paid_on) BETWEEN $2 AND $3 ORDER BY funder",
          [org, ...range],
        )
      ).rows.map((r) => r.funder as string),
    };
    // Lot 5 (05/11/2026): the season's awards (team and club ones; a person's only with their public name) and the year's obligations.
    const awards = (
      await c.query(
        `SELECT a.title,a.competition,a.kind,a.place,a.awarded_on::text AS awarded_on,t.name AS team,
                CASE WHEN a.kind='individual' AND (cp.public_name_consent OR cp.birth_date<=CURRENT_DATE-interval '18 years') THEN cp.full_name END AS person
           FROM award a LEFT JOIN team t ON t.id=a.team_id LEFT JOIN club_person cp ON cp.id=a.profile_id
          WHERE a.organization_id=$1 AND a.awarded_on BETWEEN $2 AND $3 ORDER BY a.awarded_on,a.title`,
        [org, ...range],
      )
    ).rows as { title: string; competition: string; kind: "team" | "individual" | "club"; place: number | null; awarded_on: string; team: string | null; person: string | null }[];
    const obligations = (await obligationRows(c, org, Number(season.ends_on.slice(0, 4)))).map((o) => ({ title: o.title, due_on: o.due_on, done_on: o.done_on }));
    return {
      organization_id: org,
      club,
      seasons,
      season,
      awards,
      obligations,
      previous: previous ? { name: previous.name, figures: await figures(c, org, previous, teamsOf(previous)) } : null,
      team: team ? team.name : null,
      money,
      figures: await figures(c, org, season, teamIds),
      tournaments,
      matches,
      highlights,
      staff: { coaches, volunteers, courses },
      equipment,
      finances,
      thanks,
      // 6: the club's players in a national team this season.
      national: await nationalCount(c, org, seasonOf(season.starts_on).label),
    };
  });
}
export type ActivityReport = Awaited<ReturnType<typeof activityReport>>;
