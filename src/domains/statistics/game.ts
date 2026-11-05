import type { Pool, PoolClient } from "pg";
import { AccessError, type Principal } from "../access/service";
import { periodOf, statisticsContext, type ClubQuery, type StatisticsContext } from "./club";
import { leaders, playerLines, record, recordsBy, type PlayedMatch } from "./game-math";

/**
 * The « Jeu » tab of the statistics (wave 16, S2), from the matches entered
 * in the Matches module (scores, competition, opponent) and the players'
 * lines (starter, minutes, goals, assists, cards). Only played matches
 * count. Same rules as the Club tab: season and team of the top bar, a
 * period per chart; the president and the directory readers see every team,
 * a coach the teams they supervise. A player or a parent sees their own
 * statistics on their sheet, not this tab.
 */
export const gameCharts = ["summary", "teams", "goals", "players", "competitions", "opponents", "tournaments"] as const;
export type GameChart = (typeof gameCharts)[number];
export const competitionKinds = ["league", "cup", "tournament", "friendly"] as const;
type Db = Pool | PoolClient;

async function played(c: Db, x: StatisticsContext, from: string, to: string) {
  return (
    await c.query(
      `SELECT x.id,to_char(x.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS starts_at,t.name AS team,t.color,x.opponent,x.kind,x.our_score AS our,x.their_score AS their
         FROM match x JOIN team t ON t.id=x.team_id
        WHERE x.organization_id=$1 AND x.status='played' AND x.score_status<>'proposed' AND x.starts_at>=$2::date AND x.starts_at<$3::date+1 AND ($4::text[] IS NULL OR t.name=ANY($4))
        ORDER BY x.starts_at,x.id`,
      [x.org, from, to, x.teamNames],
    )
  ).rows as (PlayedMatch & { color: string | null })[];
}
const spanOf = (span: ReturnType<typeof periodOf>) => ({ period: span.period, from: span.from, to: span.to, names: span.seasons.map((s) => s.name) });
/** Team colours by name, the latest season's. */
const colors = (rows: { team: string; color: string | null }[]) => Object.fromEntries(rows.map((r) => [r.team, r.color]));

export async function gameStatistics(db: Pool, p: Principal, chart: string, q: ClubQuery) {
  if (!(gameCharts as readonly string[]).includes(chart)) throw new AccessError("NOT_FOUND", 404);
  const c = await db.connect();
  try {
    const x = await statisticsContext(c, p, q);
    switch (chart as GameChart) {
      case "summary": {
        const season = x.season;
        const r = season ? record(await played(c, x, season.starts_on, season.ends_on)) : null;
        return {
          season: season ? { id: season.id, name: season.name } : null,
          team: x.team ? { id: x.team.id, name: x.team.name } : null,
          restricted: x.restricted,
          tiles: r && { played: r.played, won: r.won, winRate: r.winRate, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, difference: r.difference },
        };
      }
      case "teams": {
        const span = periodOf(x, "teams", q.period, "season");
        const rows = await played(c, x, span.from, span.to);
        // Point 14: the corners noted from the side of the pitch, ours and theirs, per team.
        const corners = new Map(
          (
            await c.query(
              `SELECT t.name AS team,count(*) FILTER (WHERE e.kind='corner')::int AS ours,count(*) FILTER (WHERE e.kind='corner_against')::int AS theirs
                 FROM match_live_event e JOIN match m ON m.id=e.match_id JOIN team t ON t.id=m.team_id
                WHERE m.id=ANY($1::uuid[]) AND e.cancelled_at IS NULL AND e.kind IN ('corner','corner_against') GROUP BY t.name`,
              [rows.map((r) => r.id)],
            )
          ).rows.map((r) => [r.team as string, { ours: r.ours as number, theirs: r.theirs as number }]),
        );
        return { ...spanOf(span), colors: colors(rows), teams: recordsBy(rows, (m) => m.team).map((r) => ({ ...r, corners: corners.get(r.name) ?? { ours: 0, theirs: 0 } })) };
      }
      case "goals": {
        const span = periodOf(x, "goals", q.period, "season");
        const rows = await played(c, x, span.from, span.to);
        return { ...spanOf(span), colors: colors(rows), matches: rows };
      }
      case "competitions": {
        const span = periodOf(x, "competitions", q.period, "season");
        const rows = await played(c, x, span.from, span.to);
        const by = recordsBy(rows, (m) => m.kind);
        return { ...spanOf(span), kinds: competitionKinds.map((k) => by.find((r) => r.name === k) ?? { name: k, ...record([]) }) };
      }
      case "opponents": {
        const span = periodOf(x, "opponents", q.period, "season");
        const rows = await played(c, x, span.from, span.to);
        // The same opponent written with extra spaces counts once.
        return { ...spanOf(span), opponents: recordsBy(rows, (m) => m.opponent.trim().replace(/\s+/g, " ")) };
      }
      case "players": {
        const span = periodOf(x, "players", q.period, "season");
        const rows = (
          await c.query(
            `SELECT mp.profile_id,cp.full_name,t.name AS team,mp.starter,mp.minutes,mp.goals,mp.assists,mp.yellow_cards,mp.red_card
               FROM match_player mp JOIN match x ON x.id=mp.match_id AND x.organization_id=mp.organization_id JOIN team t ON t.id=x.team_id JOIN club_person cp ON cp.id=mp.profile_id
              WHERE mp.organization_id=$1 AND x.status='played' AND x.score_status<>'proposed' AND x.starts_at>=$2::date AND x.starts_at<$3::date+1 AND ($4::text[] IS NULL OR t.name=ANY($4))`,
            [x.org, span.from, span.to, x.teamNames],
          )
        ).rows;
        const lines = playerLines(rows);
        // Cards per team: every team that played, even without a card.
        const teams = new Map<string, { yellow: number; red: number }>();
        for (const m of await played(c, x, span.from, span.to)) teams.set(m.team, { yellow: 0, red: 0 });
        for (const r of rows) {
          const t = teams.get(r.team) ?? { yellow: 0, red: 0 };
          t.yellow += r.yellow_cards;
          if (r.red_card) t.red++;
          teams.set(r.team, t);
        }
        return {
          ...spanOf(span),
          scorers: leaders(lines, "goals"),
          assisters: leaders(lines, "assists"),
          minutes: lines.filter((l) => l.minutes > 0 || l.starts > 0).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
          discipline: {
            players: lines.filter((l) => l.yellow || l.red).sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.name.localeCompare(b.name)),
            teams: [...teams].map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name)),
          },
        };
      }
      case "tournaments": {
        const span = periodOf(x, "tournaments", q.period, "last5");
        const rows = (
          await c.query(
            `SELECT tr.id,tr.title,tr.ends_on::text AS ends_on,tr.final_rank,tr.teams_count,t.name AS team,
                    (SELECT s.name FROM season s WHERE s.organization_id=tr.organization_id AND tr.ends_on BETWEEN s.starts_on AND s.ends_on ORDER BY s.starts_on DESC LIMIT 1) AS season,
                    EXISTS(SELECT 1 FROM award w WHERE w.trip_id=tr.id) AS awarded
               FROM trip tr LEFT JOIN team t ON t.id=tr.team_id
              WHERE tr.organization_id=$1 AND tr.kind='tournament' AND tr.status<>'cancelled' AND tr.final_rank IS NOT NULL AND tr.ends_on BETWEEN $2::date AND $3::date
                AND ($4::text[] IS NULL OR t.name=ANY($4))
              ORDER BY tr.ends_on DESC`,
            [x.org, span.from, span.to, x.teamNames],
          )
        ).rows as { id: string; title: string; ends_on: string; final_rank: number; teams_count: number | null; team: string | null; season: string | null; awarded: boolean }[];
        return { ...spanOf(span), tournaments: rows };
      }
    }
  } finally {
    c.release();
  }
}
