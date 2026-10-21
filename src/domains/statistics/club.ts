import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { resolveScope, seasonOptions, teamOptions } from "../scope/service";
import { today } from "../calendar/access";
import { storageOf, largestFiles } from "../storage/service";
import { seasonKeyFigures, treasury } from "./key-figures";
import { monthsBetween, percentage, retention } from "./summary";
import { parsePeriod, resolvePeriod, type PeriodKind, type SeasonSpan } from "./period";
import { ageBand, ageBands, categoryCounts, rateSeries, teamCounts, weeksBetween } from "./club-math";

/**
 * The « Club » tab of the statistics (wave 16, S1). Who sees it: like the
 * menu, those who manage attendance or the calendar or read the directory. A
 * coach without the directory sees only the teams they supervise. The season
 * and team come from the top bar (checked here); each chart has its period.
 */
export const clubCharts = ["summary", "attendance", "headcount", "results", "storage", "largest"] as const;
export type ClubChart = (typeof clubCharts)[number];
export const headcountViews = ["teams", "age", "classification", "coaches"] as const;
export type HeadcountView = (typeof headcountViews)[number];
export const classifications = ["PF1", "PF2", "pending", "not_classified"] as const;
export type ClubQuery = { season?: string; team?: string; period?: string; grain?: string; view?: string };

type Db = Pool | PoolClient;
const defaults: Record<string, PeriodKind> = { attendance: "season", headcount: "last5", results: "season" };

export async function statisticsContext(c: Db, p: Principal, raw: { season?: string; team?: string }) {
  const a = await active(c, p);
  if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
  const user = await account(c, p);
  const rights = permissions(a.role, a.grants);
  const has = (x: string) => mfaSatisfied(!!user.twoFactorEnabled) && (rights as string[]).includes(x);
  // A coach always sees the statistics of the teams they supervise (wave 16, S2).
  if (!(has("people.read") || has("attendance.manage") || has("calendar.manage") || has("teams.manage") || a.role === "coach")) throw new AccessError("FORBIDDEN");
  const org = a.organization_id as string;
  const actor = { organization_id: org, role: a.role, user_id: p.userId, team_id: a.team_id };
  const seasons = await seasonOptions(c, org);
  const allowed = await teamOptions(c, actor);
  // A coach without the directory: only the teams they supervise, never the whole club.
  const restricted = a.role === "coach" && !has("people.read") && !has("teams.manage");
  const scope = await resolveScope(c, actor, raw);
  const team = scope.teamId ? (allowed.find((t) => t.id === scope.teamId) ?? null) : null;
  const season = seasons.find((s) => s.id === scope.seasonId) ?? null;
  return {
    org,
    userId: p.userId,
    seasons,
    season,
    team,
    // Within one season: team ids. Across seasons (teams are per season): team names.
    teamIds: team ? [team.id] : restricted ? allowed.map((t) => t.id) : null,
    teamNames: team ? [team.name] : restricted ? [...new Set(allowed.map((t) => t.name))] : null,
    restricted,
    money: has("dues.manage") || has("dues.read"),
    financeOn: !(a.disabled_modules ?? []).includes("finance"),
    president: a.role === "club_president" || has("mandates.manage"),
    manageAwards: a.role === "club_president" || has("mandates.manage") || has("teams.manage"),
  };
}
export type StatisticsContext = Awaited<ReturnType<typeof statisticsContext>>;
type Context = StatisticsContext;

/** The period of a chart: its address value, else its default; the dates and the seasons it covers. */
export function periodOf(x: Context, chart: string, raw?: string, fallback?: PeriodKind) {
  const period = parsePeriod(raw, fallback ?? defaults[chart] ?? "season");
  const spans: SeasonSpan[] = x.seasons.map((s) => ({ id: s.id, name: s.name, starts_on: s.starts_on, ends_on: s.ends_on }));
  return { period, ...resolvePeriod(spans, x.season?.id ?? null, period, today()) };
}

/** Attendance rate over all closed registers of a period (the tile when the money is not shown). */
async function attendanceRate(c: Db, x: Context, from: string, to: string) {
  const r = (
    await c.query(
      `SELECT count(*) FILTER (WHERE i.actual IN ('present','late','early'))::int AS attended,count(*)::int AS invited
         FROM calendar_event e JOIN attendance_register r ON r.event_id=e.id AND r.closed_at IS NOT NULL
         JOIN attendance_invitation i ON i.register_id=r.id AND i.withdrawn_at IS NULL
        WHERE e.organization_id=$1 AND e.status<>'cancelled' AND e.starts_at>=$2::date AND e.starts_at<$3::date+1 AND ($4::uuid[] IS NULL OR e.team_id=ANY($4))`,
      [x.org, from, to, x.teamIds],
    )
  ).rows[0] as { attended: number; invited: number };
  return { rate: percentage(r.attended, r.invited), ...r };
}

async function summary(c: Db, x: Context) {
  const season = x.season;
  const figures = season ? await seasonKeyFigures(c, x.org, season, x.teamIds) : null;
  const showMoney = x.money && x.financeOn;
  return {
    season: season ? { id: season.id, name: season.name, starts_on: season.starts_on, ends_on: season.ends_on } : null,
    team: x.team ? { id: x.team.id, name: x.team.name, color: x.team.color } : null,
    restricted: x.restricted,
    tiles: figures
      ? {
          players: figures.players,
          coaches: figures.coaches,
          trainings: figures.trainings,
          matches: figures.matches,
          treasury: showMoney ? await treasury(c, x.org) : null,
          attendance: showMoney ? null : (await attendanceRate(c, x, season!.starts_on, season!.ends_on)).rate,
        }
      : null,
    can: { money: showMoney, storage: x.president, manageAwards: x.manageAwards },
  };
}

/** « Évolution des présences »: a rate per month or per ISO week, per team and for the club. */
async function attendance(c: Db, x: Context, q: ClubQuery) {
  const span = periodOf(x, "attendance", q.period);
  const grain = q.grain === "week" ? "week" : "month";
  const buckets = grain === "week" ? weeksBetween(span.from, span.to) : monthsBetween(span.from, span.to);
  const rows = (
    await c.query(
      `SELECT e.team_id,t.name,t.color,
              ${grain === "week" ? "to_char(date_trunc('week',e.starts_at AT TIME ZONE 'Europe/Brussels'),'YYYY-MM-DD')" : "to_char(e.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM')"} AS bucket,
              count(*) FILTER (WHERE i.actual IN ('present','late','early'))::int AS attended,count(*)::int AS invited
         FROM calendar_event e JOIN attendance_register r ON r.event_id=e.id AND r.closed_at IS NOT NULL
         JOIN attendance_invitation i ON i.register_id=r.id AND i.withdrawn_at IS NULL
         LEFT JOIN team t ON t.id=e.team_id
        WHERE e.organization_id=$1 AND e.status<>'cancelled' AND e.starts_at>=$2::date AND e.starts_at<$3::date+1
        GROUP BY e.team_id,t.name,t.color,bucket`,
      [x.org, span.from, span.to],
    )
  ).rows as { team_id: string | null; name: string | null; color: string | null; bucket: string; attended: number; invited: number }[];
  // Teams by name: a team keeps its name from one season to the next.
  const names = new Map<string, { name: string; color: string | null; rows: typeof rows }>();
  for (const r of rows) {
    if (!r.team_id || !r.name) continue;
    if (x.teamNames && !x.teamNames.includes(r.name)) continue;
    const t = names.get(r.name) ?? { name: r.name, color: r.color, rows: [] };
    t.rows.push(r);
    if (r.color) t.color = r.color;
    names.set(r.name, t);
  }
  const mine = rows.filter((r) => !x.teamNames || (r.name && x.teamNames.includes(r.name)));
  return {
    period: span.period,
    from: span.from,
    to: span.to,
    names: span.seasons.map((s) => s.name),
    grain,
    buckets,
    teams: [...names.values()]
      .map((t) => ({ name: t.name, color: t.color, values: rateSeries(buckets, t.rows) }))
      .filter((t) => t.values.some((v) => v !== null))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // The whole club (team or not); the teams in view when the view is limited.
    club: rateSeries(buckets, rows),
    scoped: x.teamNames ? rateSeries(buckets, mine) : null,
  };
}

/** « Effectif par année »: per season, by team, age band, classification or coaches. */
async function headcount(c: Db, x: Context, q: ClubQuery) {
  const span = periodOf(x, "headcount", q.period);
  const view: HeadcountView = (headcountViews as readonly string[]).includes(q.view ?? "") ? (q.view as HeadcountView) : "teams";
  const seasons = span.seasons;
  // The season before the first one, for who stayed, joined and left.
  const all = [...x.seasons].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const first = seasons.length ? all.findIndex((s) => s.id === seasons[0].id) : -1;
  const before = first > 0 ? all[first - 1] : null;
  const rows = seasons.length
    ? ((
        await c.query(
          `SELECT t.season_id,m.profile_id,t.name AS team,t.color,cp.birth_date::text AS birth
             FROM team_membership m JOIN team t ON t.id=m.team_id JOIN club_person cp ON cp.id=m.profile_id
            WHERE t.organization_id=$1 AND t.season_id=ANY($2::uuid[]) AND NOT m.cancelled AND m.role=ANY($3::text[])
              AND ($4::text[] IS NULL OR t.name=ANY($4))`,
          [x.org, [...seasons.map((s) => s.id), ...(before ? [before.id] : [])], view === "coaches" ? ["coach", "assistant"] : ["player"], x.teamNames],
        )
      ).rows as { season_id: string; profile_id: string; team: string; color: string | null; birth: string | null }[])
    : [];
  const today_ = today();
  let historyStart: string | null = null;
  const classOf = new Map<string, Map<string, string>>();
  if (view === "classification" && rows.length) {
    historyStart = ((await c.query("SELECT min(valid_from)::text AS d FROM classification_history WHERE organization_id=$1", [x.org])).rows[0]?.d as string | null) ?? null;
    const people = [...new Set(rows.map((r) => r.profile_id))];
    const current = new Map(
      (
        await c.query("SELECT profile_id,classification FROM player_sport_profile WHERE organization_id=$1 AND profile_id=ANY($2::uuid[])", [x.org, people])
      ).rows.map((r) => [r.profile_id as string, r.classification as string]),
    );
    for (const s of seasons) {
      const on = s.ends_on < today_ ? s.ends_on : today_;
      const map = new Map<string, string>(people.map((id) => [id, current.get(id) ?? "not_classified"]));
      if (historyStart && on >= historyStart)
        for (const r of (
          await c.query(
            "SELECT DISTINCT ON (profile_id) profile_id,classification FROM classification_history WHERE organization_id=$1 AND profile_id=ANY($2::uuid[]) AND valid_from<=$3::date AND (valid_to IS NULL OR valid_to>$3::date) ORDER BY profile_id,valid_from DESC,id",
            [x.org, people, on],
          )
        ).rows)
          map.set(r.profile_id, r.classification);
      classOf.set(s.id, map);
    }
  }
  const members = (id: string) => [...new Set(rows.filter((r) => r.season_id === id).map((r) => r.profile_id))];
  const kept = retention([...(before ? [before] : []), ...seasons].map((s) => ({ name: s.name, members: members(s.id) }))).slice(before ? 1 : 0);
  return {
    period: span.period,
    from: span.from,
    to: span.to,
    names: span.seasons.map((s) => s.name),
    view,
    historyStart,
    seasons: seasons.map((s, i) => {
      const mine = rows.filter((r) => r.season_id === s.id);
      const counts = teamCounts(mine.map((r) => ({ profile: r.profile_id, team: r.team, color: r.color })));
      const on = s.ends_on < today_ ? s.ends_on : today_;
      return {
        id: s.id,
        name: s.name,
        ...counts,
        ages: view === "age" ? categoryCounts(mine.map((r) => ({ profile: r.profile_id, category: ageBand(r.birth, s.starts_on) })), ageBands) : null,
        classes:
          view === "classification"
            ? categoryCounts(
                mine.map((r) => ({ profile: r.profile_id, category: (classOf.get(s.id)?.get(r.profile_id) ?? "not_classified") as (typeof classifications)[number] })),
                classifications,
              )
            : null,
        // Before the history existed, today's classification stands in.
        currentClassification: view === "classification" ? !historyStart || on < historyStart : false,
        retention: { stayed: kept[i].stayed, joined: kept[i].joined, left: kept[i].left, rate: kept[i].rate },
      };
    }),
  };
}

/** « Résultats par équipe »: played matches of the period, won, drawn, lost per team. */
async function results(c: Db, x: Context, q: ClubQuery) {
  const span = periodOf(x, "results", q.period);
  const rows = (
    await c.query(
      `SELECT t.name,(array_agg(t.color ORDER BY s.starts_on DESC))[1] AS color,(array_agg(t.id ORDER BY s.starts_on DESC))[1] AS team_id,(array_agg(t.season_id ORDER BY s.starts_on DESC))[1] AS season_id,
              count(*) FILTER (WHERE x.our_score>x.their_score)::int AS won,
              count(*) FILTER (WHERE x.our_score=x.their_score)::int AS drawn,
              count(*) FILTER (WHERE x.our_score<x.their_score)::int AS lost
         FROM match x JOIN team t ON t.id=x.team_id JOIN season s ON s.id=t.season_id
        WHERE x.organization_id=$1 AND x.status='played' AND x.starts_at>=$2::date AND x.starts_at<$3::date+1 AND ($4::text[] IS NULL OR t.name=ANY($4))
        GROUP BY t.name ORDER BY t.name`,
      [x.org, span.from, span.to, x.teamNames],
    )
  ).rows as { name: string; color: string | null; team_id: string; season_id: string; won: number; drawn: number; lost: number }[];
  // The teams of the season in view without a played match: a grey ring.
  const idle = x.season
    ? ((
        await c.query(
          "SELECT id AS team_id,season_id,name,color FROM team WHERE organization_id=$1 AND season_id=$2 AND NOT archived AND ($3::text[] IS NULL OR name=ANY($3)) ORDER BY name",
          [x.org, x.season.id, x.teamNames],
        )
      ).rows as { team_id: string; season_id: string; name: string; color: string | null }[])
    : [];
  const teams = [...rows, ...idle.filter((t) => !rows.some((r) => r.name === t.name)).map((t) => ({ ...t, won: 0, drawn: 0, lost: 0 }))].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { period: span.period, from: span.from, to: span.to, names: span.seasons.map((s) => s.name), teams };
}

export async function clubStatistics(db: Pool, p: Principal, chart: string, q: ClubQuery) {
  if (!(clubCharts as readonly string[]).includes(chart)) throw new AccessError("NOT_FOUND", 404);
  const c = await db.connect();
  try {
    const x = await statisticsContext(c, p, q);
    switch (chart as ClubChart) {
      case "summary":
        return await summary(c, x);
      case "attendance":
        return await attendance(c, x, q);
      case "headcount":
        return await headcount(c, x, q);
      case "results":
        return await results(c, x, q);
      case "storage":
        if (!x.president) throw new AccessError("FORBIDDEN");
        return await storageOf(c, x.org);
      case "largest":
        if (!x.president) throw new AccessError("FORBIDDEN");
        return { files: await largestFiles(c, x.org) };
    }
  } finally {
    c.release();
  }
}
