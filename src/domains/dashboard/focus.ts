import type { PoolClient } from "pg";

/**
 * 15: the home by role. Only figures the application already holds, each
 * card leading to an action:
 * - a player or a parent: per person (one block per child), the next event
 *   with « Présent / Absent » and the team's last results;
 * - a coach: per coached team, the next training and the next match with
 *   their answers, and today's call or match;
 * - a federation: clubs late on its fees, the next classification days and
 *   tournament days, what waits for its validation (places, chair models).
 */
export type EventFocus = {
  id: string;
  title: string;
  startsAt: string;
  place: string | null;
  invited: number;
  answered: number;
  present: number;
};
export type MemberFocus = {
  kind: "member";
  people: {
    profileId: string;
    name: string;
    next: null | { eventId: string; title: string; startsAt: string; place: string | null; invitationId: string; version: number; response: string; open: boolean };
    results: { id: string; opponent: string; ours: number; theirs: number; date: string }[];
  }[];
};
export type CoachFocus = {
  kind: "coach";
  teams: { id: string; name: string; nextTraining: EventFocus | null; nextMatch: EventFocus | null }[];
  /** Today's session of one of the teams: « Faire l'appel ». */
  callToday: string | null;
  /** Today's match: « Ouvrir le match ». */
  matchToday: string | null;
};
export type FederationFocus = {
  kind: "federation";
  lateClubs: number;
  classificationDays: { id: string; day: string; place: string | null }[];
  tournamentDays: { id: string; tournamentId: string; name: string; day: string; place: string }[];
  pending: { places: number; models: number };
};
export type Focus = MemberFocus | CoachFocus | FederationFocus;

const place = `COALESCE(pl.name,sv.name,NULLIF(e.free_location,''))`;
const places = `LEFT JOIN calendar_place pl ON pl.id=e.place_id LEFT JOIN shared_venue sv ON sv.id=e.shared_venue_id`;

export async function memberFocus(c: PoolClient, org: string, own: string[]): Promise<MemberFocus> {
  const people = (
    await c.query("SELECT id,full_name FROM club_person WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND status='active' ORDER BY full_name LIMIT 4", [org, own])
  ).rows as { id: string; full_name: string }[];
  const out: MemberFocus["people"] = [];
  for (const person of people) {
    const next = (
      await c.query(
        `SELECT e.id,e.title,e.starts_at,${place} AS place,i.id AS invitation_id,i.version,i.response,(r.closed_at IS NULL AND r.deadline>now()) AS open
           FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id ${places}
          WHERE i.organization_id=$1 AND i.profile_id=$2 AND i.withdrawn_at IS NULL AND e.status='scheduled' AND e.starts_at>now()
          ORDER BY e.starts_at LIMIT 1`,
        [org, person.id],
      )
    ).rows[0];
    const results = (
      await c.query(
        `SELECT DISTINCT m.id,m.opponent,m.our_score,m.their_score,m.starts_at FROM match m
           JOIN team_membership tm ON tm.team_id=m.team_id AND tm.organization_id=m.organization_id AND tm.profile_id=$2 AND NOT tm.cancelled AND tm.closed_at IS NULL
          WHERE m.organization_id=$1 AND m.status='played' AND m.our_score IS NOT NULL ORDER BY m.starts_at DESC LIMIT 3`,
        [org, person.id],
      )
    ).rows;
    out.push({
      profileId: person.id,
      name: person.full_name,
      next: next
        ? { eventId: next.id, title: next.title, startsAt: new Date(next.starts_at).toISOString(), place: next.place, invitationId: next.invitation_id, version: next.version, response: next.response, open: next.open }
        : null,
      results: results.map((m) => ({ id: m.id, opponent: m.opponent, ours: m.our_score, theirs: m.their_score, date: new Date(m.starts_at).toISOString() })),
    });
  }
  return { kind: "member", people: out };
}

async function eventFocus(c: PoolClient, org: string, team: string, kinds: string[]): Promise<EventFocus | null> {
  const e = (
    await c.query(
      `SELECT e.id,e.title,e.starts_at,${place} AS place,
              (SELECT count(*)::int FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=e.id AND i.withdrawn_at IS NULL) AS invited,
              (SELECT count(*)::int FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=e.id AND i.withdrawn_at IS NULL AND i.response<>'none') AS answered,
              (SELECT count(*)::int FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=e.id AND i.withdrawn_at IS NULL AND i.response='present') AS present
         FROM calendar_event e ${places}
        WHERE e.organization_id=$1 AND e.team_id=$2 AND e.kind=ANY($3::text[]) AND e.status='scheduled' AND e.ends_at>now()
        ORDER BY e.starts_at LIMIT 1`,
      [org, team, kinds],
    )
  ).rows[0];
  return e ? { id: e.id, title: e.title, startsAt: new Date(e.starts_at).toISOString(), place: e.place, invited: e.invited, answered: e.answered, present: e.present } : null;
}

export async function coachFocus(c: PoolClient, org: string, own: string[]): Promise<CoachFocus> {
  const teams = (
    await c.query(
      `SELECT DISTINCT t.id,t.name FROM team_membership m JOIN team t ON t.id=m.team_id AND t.organization_id=m.organization_id JOIN season s ON s.id=t.season_id
        WHERE m.organization_id=$1 AND m.profile_id=ANY($2::uuid[]) AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL
          AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE) AND NOT t.archived AND NOT s.archived
        ORDER BY t.name LIMIT 3`,
      [org, own],
    )
  ).rows as { id: string; name: string }[];
  const out: CoachFocus["teams"] = [];
  for (const t of teams) out.push({ id: t.id, name: t.name, nextTraining: await eventFocus(c, org, t.id, ["training"]), nextMatch: await eventFocus(c, org, t.id, ["match", "friendly", "tournament"]) });
  const ids = teams.map((t) => t.id);
  const today = async (kinds: string[]) =>
    ((
      await c.query(
        "SELECT e.id FROM calendar_event e WHERE e.organization_id=$1 AND e.team_id=ANY($2::uuid[]) AND e.kind=ANY($3::text[]) AND e.status='scheduled' AND (e.starts_at AT TIME ZONE 'Europe/Brussels')::date=(now() AT TIME ZONE 'Europe/Brussels')::date ORDER BY e.starts_at LIMIT 1",
        [org, ids, kinds],
      )
    ).rows[0]?.id as string | undefined) ?? null;
  const matchEvent = await today(["match", "friendly", "tournament"]);
  const match = matchEvent ? ((await c.query("SELECT id FROM match WHERE organization_id=$1 AND calendar_event_id=$2 LIMIT 1", [org, matchEvent])).rows[0]?.id as string | undefined) ?? null : null;
  return { kind: "coach", teams: out, callToday: await today(["training"]), matchToday: match };
}

export async function federationFocus(c: PoolClient, fed: string): Promise<FederationFocus> {
  const lateClubs = (
    await c.query(
      "SELECT count(DISTINCT d.organization_id)::int AS n FROM affiliation_due d JOIN affiliation_fee f ON f.id=d.fee_id AND f.organization_id=$1 AND NOT f.archived WHERE d.paid_on IS NULL AND d.due_on<(now() AT TIME ZONE 'Europe/Brussels')::date",
      [fed],
    )
  ).rows[0].n as number;
  const classificationDays = (
    await c.query(
      "SELECT s.id,s.day::text AS day,v.name AS place FROM classification_session s LEFT JOIN shared_venue v ON v.id=s.shared_venue_id WHERE s.federation_id=$1 AND s.status<>'cancelled' AND s.day>=CURRENT_DATE ORDER BY s.day LIMIT 5",
      [fed],
    )
  ).rows as FederationFocus["classificationDays"];
  const tournamentDays = (
    await c.query(
      `SELECT d.id,t.id AS tournament_id,t.name,d.day::text AS day,d.venue AS place FROM tournament_day d JOIN tournament t ON t.id=d.tournament_id
        WHERE t.organization_id=$1 AND d.day>=CURRENT_DATE ORDER BY d.day LIMIT 5`,
      [fed],
    )
  ).rows.map((r) => ({ id: r.id, tournamentId: r.tournament_id, name: r.name, day: r.day, place: r.place })) as FederationFocus["tournamentDays"];
  const places = (
    await c.query("SELECT count(*)::int AS n FROM calendar_place p JOIN organization o ON o.id=p.organization_id WHERE o.federation_id=$1 AND p.share_status='pending'", [fed])
  ).rows[0].n as number;
  const models = (await c.query("SELECT count(*)::int AS n FROM chair_model WHERE federation_id=$1 AND status='proposed'", [fed])).rows[0].n as number;
  return { kind: "federation", lateClubs, classificationDays, tournamentDays, pending: { places, models } };
}
