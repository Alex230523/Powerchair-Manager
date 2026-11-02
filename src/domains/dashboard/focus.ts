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
  /** 32: the cards follow the person's competences (all of them for the presidency). */
  can: { licences: boolean; competitions: boolean; referees: boolean; classification: boolean; courses: boolean; communication: boolean; discipline?: boolean };
  lateClubs: number;
  clubs: { affiliated: number; pending: number };
  licences: { season: string; category: string; n: number }[];
  classificationsToDo: number;
  matchesWithoutReferee: number;
  reportsPending: number;
  classificationDays: { id: string; day: string; place: string | null }[];
  tournamentDays: { id: string; tournamentId: string; name: string; day: string; place: string }[];
  pending: { places: number; models: number; courses: number };
  /** 34: sanctions to decide and appeals to settle. */
  discipline: { proposed: number; appeals: number };
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

export async function federationFocus(c: PoolClient, fed: string, can: FederationFocus["can"]): Promise<FederationFocus> {
  const n = async (sql: string, on: boolean) => (on ? Number((await c.query(sql, [fed])).rows[0].n) : 0);
  const clubs = can.licences
    ? ((
        await c.query(
          `SELECT count(*)::int AS affiliated,
                  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM role_assignment r WHERE r.organization_id=o.id AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())))::int AS pending
             FROM organization o WHERE o.federation_id=$1 AND o.kind='club'`,
          [fed],
        )
      ).rows[0] as { affiliated: number; pending: number })
    : { affiliated: 0, pending: 0 };
  // Licensees by season and category (player or coach), over the last seasons.
  const licences = can.licences
    ? ((
        await c.query(
          `SELECT l.season,CASE WHEN 'coach'=ANY(cp.directory_roles) AND NOT 'player'=ANY(cp.directory_roles) THEN 'coach' ELSE 'player' END AS category,count(*)::int AS n
             FROM license l JOIN club_person cp ON cp.id=l.profile_id WHERE l.federation_id=$1 AND l.status='active'
            GROUP BY 1,2 ORDER BY 1 DESC,2 LIMIT 20`,
          [fed],
        )
      ).rows as FederationFocus["licences"])
    : [];
  const classificationsToDo = await n("SELECT count(*)::int AS n FROM player_sport_profile s JOIN organization o ON o.id=s.organization_id WHERE o.federation_id=$1 AND s.classification_status='requested'", can.classification);
  const matchesWithoutReferee = await n(
    `SELECT count(*)::int AS n FROM match m JOIN organization o ON o.id=m.organization_id WHERE o.federation_id=$1 AND m.kind IN ('league','cup') AND m.status='scheduled' AND m.starts_at>now()
       AND NOT EXISTS (SELECT 1 FROM referee_assignment a WHERE a.match_id=m.id AND a.status='accepted')`,
    can.referees,
  );
  const reportsPending = await n(
    `SELECT count(*)::int AS n FROM match m JOIN organization o ON o.id=m.organization_id WHERE o.federation_id=$1 AND m.kind IN ('league','cup') AND m.starts_at<now()
       AND EXISTS (SELECT 1 FROM referee_assignment a WHERE a.match_id=m.id AND a.status='accepted') AND NOT EXISTS (SELECT 1 FROM match_report r WHERE r.match_id=m.id)`,
    can.referees,
  );
  const discipline = {
    proposed: await n("SELECT count(*)::int AS n FROM discipline_sanction WHERE federation_id=$1 AND status='proposed'", !!can.discipline),
    appeals: await n("SELECT count(*)::int AS n FROM discipline_appeal a JOIN discipline_sanction s ON s.id=a.sanction_id WHERE s.federation_id=$1 AND a.status='open'", !!can.discipline),
  };
  const courses = await n("SELECT count(*)::int AS n FROM training_request q JOIN training_course k ON k.id=q.course_id WHERE k.federation_id=$1 AND q.status='requested'", can.courses);
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
  return {
    kind: "federation",
    can,
    lateClubs: can.licences ? lateClubs : 0,
    clubs,
    licences,
    classificationsToDo,
    matchesWithoutReferee,
    reportsPending,
    classificationDays: can.classification ? classificationDays : [],
    tournamentDays: can.competitions ? tournamentDays : [],
    pending: { places: can.competitions ? places : 0, models: can.competitions ? models : 0, courses },
    discipline,
  };
}
