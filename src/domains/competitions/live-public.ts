import type { Pool } from "pg";
import { publicName } from "../integrations/public";
import { brusselsToday } from "../people/service";
import { tally } from "./journey";

/**
 * Lot 3 (05/11/2026): the public page of a match, by its link. The score
 * (live from the side of the pitch, then the confirmed result), the facts
 * of the match with the minute, and the scorers named only as the public
 * rules allow (adults, or with consent; the others by their number).
 */
export type PublicLive = {
  team: string;
  club: string;
  opponent: string;
  home: boolean | null;
  starts_at: string;
  status: "scheduled" | "live" | "played" | "postponed" | "cancelled";
  score: { ours: number; theirs: number } | null;
  events: { minute: number | null; kind: string; who: string | null; number: number | null }[];
  updated_at: string;
};
export async function publicLive(db: Pool, token: string): Promise<PublicLive | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const m = (
    await db.query(
      `SELECT m.id,m.organization_id,t.name AS team,o.name AS club,m.opponent,m.home,to_char(m.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS starts_at,
              m.status,m.our_score,m.their_score,m.starts_at<=now() AS started
         FROM match m JOIN team t ON t.id=m.team_id JOIN organization o ON o.id=m.organization_id WHERE m.live_token=$1 AND m.live_public_at IS NOT NULL`,
      [token],
    )
  ).rows[0] as { id: string; organization_id: string; team: string; club: string; opponent: string; home: boolean | null; starts_at: string; status: string; our_score: number | null; their_score: number | null; started: boolean } | undefined;
  if (!m) return null;
  const today = brusselsToday();
  const rows = (
    await db.query(
      `SELECT e.kind,e.minute,e.profile_id,e.cancelled_at,cp.full_name,cp.birth_date::text AS birth_date,cp.public_name_consent,
              (SELECT jersey_number FROM match_player p WHERE p.match_id=e.match_id AND p.profile_id=e.profile_id) AS number
         FROM match_live_event e LEFT JOIN club_person cp ON cp.id=e.profile_id WHERE e.match_id=$1 ORDER BY e.minute NULLS LAST,e.created_at`,
      [m.id],
    )
  ).rows as { kind: string; minute: number | null; profile_id: string | null; cancelled_at: string | null; full_name: string | null; birth_date: string | null; public_name_consent: boolean; number: number | null }[];
  const live = rows.filter((e) => !e.cancelled_at);
  const t = tally(live);
  const played = m.status === "played" && m.our_score !== null && m.their_score !== null;
  const status = m.status === "scheduled" ? (m.started || live.length ? "live" : "scheduled") : (m.status as PublicLive["status"]);
  return {
    team: m.team,
    club: m.club,
    opponent: m.opponent,
    home: m.home,
    starts_at: m.starts_at,
    status,
    score: played ? { ours: m.our_score!, theirs: m.their_score! } : status === "live" ? { ours: t.ours, theirs: t.theirs } : null,
    events: live
      .filter((e) => ["goal", "goal_against", "yellow", "red", "corner", "corner_against", "timeout"].includes(e.kind))
      .map((e) => ({ minute: e.minute, kind: e.kind, who: e.full_name ? publicName(e.full_name, e.birth_date, e.public_name_consent, today) : null, number: e.number })),
    updated_at: new Date().toISOString(),
  };
}
