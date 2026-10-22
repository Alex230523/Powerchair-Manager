import type { Pool, PoolClient } from "pg";
import { account, active, audit, AccessError, validImage, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import {
  podium,
  readRules,
  standings,
  type ClubRef,
  type Format,
  type MatchResult,
  type Rules,
  type Stage,
  type TournamentCommand,
} from "./schema";

/**
 * Tournaments (21 October 2026), replacing the federation calendar.
 *
 * Who sees a tournament: its organiser (club or federation), the clubs
 * invited to it, the federation of the organising club, the clubs of an
 * organising federation, and the referees designated on one of its matches.
 * Who manages it: the president of the organising club or federation.
 * Results: the first allowed person reports (organiser, host club of the
 * day, designated referee, president or coach of one of the two clubs);
 * the organiser or the referee corrects and validates. Only validated
 * results count in the tables, the podium and the scorers.
 */

type Ctx = Awaited<ReturnType<typeof active>>;
type Scope = { c: PoolClient; a: Ctx; p: Principal; federation: string | null };

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await account(c, p);
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (write) await c.query("SELECT id FROM organization WHERE id=$1 FOR SHARE", [a.organization_id]);
    const federation =
      a.kind === "federation"
        ? a.organization_id
        : (((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id ?? null) as string | null);
    const out = await fn({ c, a, p, federation });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const isPresident = (a: Ctx) => (a.kind === "club" && a.role === "club_president") || (a.kind === "federation" && a.role === "federation_president");
/** SQL condition: tournament t is visible to org $1 (federation $2, user $3). */
const visible = `(t.organization_id=$1
  OR EXISTS(SELECT 1 FROM tournament_club tc WHERE tc.tournament_id=t.id AND tc.organization_id=$1)
  OR ($2::uuid IS NOT NULL AND t.organization_id=$2)
  OR EXISTS(SELECT 1 FROM organization ow WHERE ow.id=t.organization_id AND ow.federation_id=$1)
  OR EXISTS(SELECT 1 FROM tournament_match rm WHERE rm.tournament_id=t.id AND rm.referee_user_id=$3))`;
const args = (s: Scope) => [s.a.organization_id, s.federation, s.p.userId];

type TournamentRow = { id: string; organization_id: string; name: string; year: number; format: Format; rules: unknown; description: string; status: "open" | "finished"; version: number; owner_name: string; owner_kind: "club" | "federation" };
async function tournament(s: Scope, id: string, lock = false) {
  const t = (
    await s.c.query(
      `SELECT t.id,t.organization_id,t.name,t.year,t.format,t.rules,t.description,t.status,t.version,o.name AS owner_name,o.kind AS owner_kind
         FROM tournament t JOIN organization o ON o.id=t.organization_id WHERE t.id=$4 AND ${visible}${lock ? " FOR UPDATE OF t" : ""}`,
      [...args(s), id],
    )
  ).rows[0] as TournamentRow | undefined;
  if (!t) throw new AccessError("NOT_FOUND", 404);
  return t;
}
const manages = (s: Scope, t: { organization_id: string }) => isPresident(s.a) && s.a.organization_id === t.organization_id;

type MatchRow = {
  id: string;
  day_id: string;
  kickoff: string;
  stage: Stage;
  group_label: string;
  home_organization_id: string;
  away_organization_id: string;
  referee_user_id: string | null;
  referee_name: string | null;
  home_score: number | null;
  away_score: number | null;
  home_shootout: number | null;
  away_shootout: number | null;
  status: MatchResult["status"];
  version: number;
  reported_name: string | null;
  validated_name: string | null;
  host_organization_id: string | null;
};
async function matchRows(c: PoolClient, tournamentIds: string[]) {
  return (
    await c.query(
      `SELECT m.id,m.tournament_id,m.day_id,to_char(m.kickoff,'HH24:MI') AS kickoff,m.stage,m.group_label,m.home_organization_id,m.away_organization_id,m.referee_user_id,ru.name AS referee_name,
              m.home_score,m.away_score,m.home_shootout,m.away_shootout,m.status,m.version,rp.name AS reported_name,va.name AS validated_name,d.host_organization_id,d.day::text AS day
         FROM tournament_match m JOIN tournament_day d ON d.id=m.day_id
         LEFT JOIN "user" ru ON ru.id=m.referee_user_id LEFT JOIN "user" rp ON rp.id=m.reported_by LEFT JOIN "user" va ON va.id=m.validated_by
        WHERE m.tournament_id=ANY($1::uuid[]) ORDER BY d.day,m.kickoff,m.id`,
      [tournamentIds],
    )
  ).rows as (MatchRow & { tournament_id: string; day: string })[];
}
async function clubRows(c: PoolClient, tournamentIds: string[]) {
  return (
    await c.query(
      `SELECT tc.tournament_id,tc.organization_id AS id,COALESCE(NULLIF(tc.team_name,''),o.name) AS name,o.name AS club_name,tc.status,tc.group_label AS "group"
         FROM tournament_club tc JOIN organization o ON o.id=tc.organization_id WHERE tc.tournament_id=ANY($1::uuid[]) ORDER BY o.name`,
      [tournamentIds],
    )
  ).rows as { tournament_id: string; id: string; name: string; club_name: string; status: "invited" | "accepted" | "declined"; group: string }[];
}
const result = (m: MatchRow): MatchResult => ({
  stage: m.stage,
  group: m.group_label,
  home: m.home_organization_id,
  away: m.away_organization_id,
  homeScore: m.home_score,
  awayScore: m.away_score,
  homeShootout: m.home_shootout,
  awayShootout: m.away_shootout,
  status: m.status,
});

/* ------------------------------------------------------------------ Views */

/** The tournaments page: one card per tournament of the year, invitations waiting, what the person may create. */
export async function tournamentsView(db: Pool, p: Principal, year: number) {
  return scope(db, p, false, async (s) => {
    const years = (
      await s.c.query(`SELECT DISTINCT t.year FROM tournament t WHERE ${visible} ORDER BY t.year DESC`, args(s))
    ).rows.map((r) => r.year as number);
    const now = new Date().getFullYear();
    const list = (
      await s.c.query(
        `SELECT t.id,t.organization_id,t.name,t.year,t.format,t.rules,t.status,o.name AS owner_name,o.kind AS owner_kind,
                (SELECT min(d.day)::text FROM tournament_day d WHERE d.tournament_id=t.id) AS first_day,
                (SELECT max(d.day)::text FROM tournament_day d WHERE d.tournament_id=t.id) AS last_day,
                (SELECT count(*)::int FROM tournament_day d WHERE d.tournament_id=t.id) AS days,
                (SELECT min(d.day)::text FROM tournament_day d WHERE d.tournament_id=t.id AND d.day>=CURRENT_DATE) AS next_day,
                (SELECT tc.status FROM tournament_club tc WHERE tc.tournament_id=t.id AND tc.organization_id=$1) AS my_status
           FROM tournament t JOIN organization o ON o.id=t.organization_id WHERE t.year=$4 AND ${visible} ORDER BY t.status,t.name`,
        [...args(s), year],
      )
    ).rows;
    const ids = list.map((t) => t.id as string);
    const clubs = await clubRows(s.c, ids),
      matches = await matchRows(s.c, ids);
    const names = new Map(clubs.map((c) => [c.tournament_id + c.id, c.name]));
    const tournaments = list.map((t) => {
      const own = clubs.filter((c) => c.tournament_id === t.id && c.status === "accepted");
      const ms = matches.filter((m) => m.tournament_id === t.id);
      const places = podium(t.format, own, ms.map(result), readRules(t.rules));
      return {
        id: t.id as string,
        name: t.name as string,
        format: t.format as Format,
        status: t.status as "open" | "finished",
        owner: t.owner_name as string,
        ownerKind: t.owner_kind as "club" | "federation",
        firstDay: t.first_day as string | null,
        lastDay: t.last_day as string | null,
        nextDay: t.next_day as string | null,
        days: t.days as number,
        clubs: own.length,
        played: ms.filter((m) => m.status === "validated").length,
        matches: ms.filter((m) => m.status !== "cancelled").length,
        myStatus: (t.my_status ?? null) as "invited" | "accepted" | "declined" | null,
        podium: places.map((x) => ({ rank: x.rank, name: names.get(t.id + x.club) ?? "" })),
      };
    });
    const invitations = (
      await s.c.query(
        `SELECT t.id,t.name,t.year,o.name AS owner_name FROM tournament_club tc JOIN tournament t ON t.id=tc.tournament_id JOIN organization o ON o.id=t.organization_id
          WHERE tc.organization_id=$1 AND tc.status='invited' AND t.status='open' ORDER BY t.year DESC,t.name`,
        [s.a.organization_id],
      )
    ).rows;
    const canCreate = isPresident(s.a);
    const club = await clubTrips(s, year);
    return {
      ...club,
      organization_id: s.a.organization_id,
      kind: s.a.kind,
      year,
      years: [...new Set([now, year, ...years])].sort((x, y) => y - x),
      tournaments,
      invitations: s.a.kind === "club" && s.a.role === "club_president" ? invitations : [],
      canCreate,
      clubOptions: canCreate ? await clubOptions(s) : [],
    };
  });
}

/**
 * Wave 16 (E3): the club's own tournaments, from its trips of type
 * tournament: coming ones with their transport, past ones with the final
 * place and the matches played on those days. For the club's staff, when
 * the trips module is on; no new table.
 */
async function clubTrips(s: Scope, year: number) {
  const rights = permissions(s.a.role, s.a.grants);
  const staff = s.a.kind === "club" && (s.a.role === "club_president" || s.a.role === "coach" || rights.includes("calendar.manage") || rights.includes("teams.manage"));
  const off = ((await s.c.query("SELECT disabled_modules FROM organization WHERE id=$1", [s.a.organization_id])).rows[0]?.disabled_modules ?? []) as string[];
  if (!staff || off.includes("trips")) return { clubTrips: null };
  const rows = (
    await s.c.query(
      `SELECT tr.id,tr.title,tr.status,tr.starts_on::text AS starts_on,tr.ends_on::text AS ends_on,COALESCE(sv.name,pl.name,NULLIF(tr.destination,'')) AS place,
              tr.final_rank,tr.teams_count,tr.result_note,tr.calendar_event_id AS event_id,tm.name AS team,
              (SELECT count(*)::int FROM trip_vehicle v WHERE v.trip_id=tr.id) AS vehicles,
              (SELECT COALESCE(sum(v.wheelchair_places),0)::int FROM trip_vehicle v WHERE v.trip_id=tr.id) AS wheelchair_places,
              COALESCE((SELECT json_agg(json_build_object('id',m.id,'opponent',m.opponent,'our',m.our_score,'their',m.their_score) ORDER BY m.starts_at)
                 FROM match m WHERE m.organization_id=tr.organization_id AND m.kind='tournament' AND m.status='played'
                  AND (m.starts_at AT TIME ZONE 'Europe/Brussels')::date BETWEEN tr.starts_on AND tr.ends_on AND (e.team_id IS NULL OR m.team_id=e.team_id)),'[]') AS matches
         FROM trip tr LEFT JOIN calendar_event e ON e.id=tr.calendar_event_id AND e.organization_id=tr.organization_id LEFT JOIN team tm ON tm.id=e.team_id
         LEFT JOIN shared_venue sv ON sv.id=tr.shared_venue_id LEFT JOIN calendar_place pl ON pl.id=tr.place_id
        WHERE tr.organization_id=$1 AND tr.kind='tournament' AND tr.status<>'cancelled' AND extract(year FROM tr.starts_on)=$2
        ORDER BY tr.starts_on,tr.title`,
      [s.a.organization_id, year],
    )
  ).rows as {
    id: string;
    title: string;
    status: string;
    starts_on: string;
    ends_on: string;
    place: string | null;
    final_rank: number | null;
    teams_count: number | null;
    result_note: string;
    event_id: string | null;
    team: string | null;
    vehicles: number;
    wheelchair_places: number;
    matches: { id: string; opponent: string; our: number; their: number }[];
  }[];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const plan = s.a.role === "club_president" || rights.includes("calendar.manage") || s.a.role === "coach";
  const teams = plan
    ? ((
        await s.c.query(
          `SELECT t.id,t.name FROM team t JOIN season se ON se.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT se.archived AND CURRENT_DATE BETWEEN se.starts_on AND se.ends_on
              AND ($2 OR EXISTS(SELECT 1 FROM team_membership m JOIN club_person c ON c.id=m.profile_id JOIN person p ON p.id=c.person_id WHERE m.team_id=t.id AND p.user_id=$3 AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL))
            ORDER BY t.name`,
          [s.a.organization_id, s.a.role === "club_president" || rights.includes("calendar.manage"), s.p.userId],
        )
      ).rows as { id: string; name: string }[])
    : [];
  const type = ((await s.c.query("SELECT id FROM event_type WHERE organization_id=$1 AND legacy_kind='tournament' AND NOT archived ORDER BY position LIMIT 1", [s.a.organization_id])).rows[0]?.id ?? null) as
    | string
    | null;
  return {
    clubTrips: {
      upcoming: rows.filter((r) => r.ends_on >= today),
      past: rows.filter((r) => r.ends_on < today).reverse(),
      // « Préparer un tournoi »: the teams this person plans for, the club's tournament type, who is in charge.
      prepare: plan && teams.length ? { teams, typeId: type, userId: s.p.userId } : null,
    },
  };
}

/** Clubs that may be invited: the federation's clubs first, then the others; names only. */
async function clubOptions(s: Scope) {
  return (
    await s.c.query(
      `SELECT o.id,o.name,(o.federation_id IS NOT DISTINCT FROM $2::uuid AND $2::uuid IS NOT NULL) AS affiliated
         FROM organization o WHERE o.kind='club' AND o.id<>$1 ORDER BY 3 DESC,o.name LIMIT 500`,
      [s.a.organization_id, s.federation],
    )
  ).rows as { id: string; name: string; affiliated: boolean }[];
}

/** One tournament: current situation, match days with every result, and what the person may do. */
export async function tournamentView(db: Pool, p: Principal, id: string) {
  return scope(db, p, false, async (s) => {
    const t = await tournament(s, id);
    const rules = readRules(t.rules);
    const manage = manages(s, t);
    const clubs = await clubRows(s.c, [t.id]);
    const accepted: ClubRef[] = clubs.filter((c) => c.status === "accepted");
    const names = new Map(clubs.map((c) => [c.id, c.name]));
    const matches = await matchRows(s.c, [t.id]);
    const days = (
      await s.c.query(
        `SELECT d.id,d.label,d.day::text AS day,d.venue,d.notes,d.host_organization_id AS host_id,o.name AS host_name
           FROM tournament_day d LEFT JOIN organization o ON o.id=d.host_organization_id WHERE d.tournament_id=$1 ORDER BY d.day,d.created_at`,
        [t.id],
      )
    ).rows as { id: string; label: string; day: string; venue: string; notes: string; host_id: string | null; host_name: string | null }[];
    const stats = (
      await s.c.query(
        `SELECT st.match_id,st.organization_id,st.profile_id,cp.full_name AS name,st.goals,st.assists,st.yellow_cards,st.red_card
           FROM tournament_stat st JOIN tournament_match m ON m.id=st.match_id JOIN club_person cp ON cp.id=st.profile_id
          WHERE m.tournament_id=$1 ORDER BY st.goals DESC,cp.full_name`,
        [t.id],
      )
    ).rows as { match_id: string; organization_id: string; profile_id: string; name: string; goals: number; assists: number; yellow_cards: number; red_card: boolean }[];
    const organizer = (m: { host_organization_id: string | null }) =>
      manage || (s.a.kind === "club" && s.a.role === "club_president" && m.host_organization_id === s.a.organization_id);
    const staffOf = (m: MatchRow) =>
      s.a.kind === "club" && (s.a.role === "club_president" || s.a.role === "coach") && [m.home_organization_id, m.away_organization_id].includes(s.a.organization_id);
    const open = t.status === "open";
    const results = matches.map(result);
    const validatedIds = new Set(matches.filter((m) => m.status === "validated").map((m) => m.id));
    // Scorers: validated matches only.
    const scorers = new Map<string, { profile: string; name: string; club: string; goals: number; assists: number; yellow: number; red: number; matches: number }>();
    for (const st of stats) {
      if (!validatedIds.has(st.match_id)) continue;
      const row = scorers.get(st.profile_id) ?? { profile: st.profile_id, name: st.name, club: names.get(st.organization_id) ?? "", goals: 0, assists: 0, yellow: 0, red: 0, matches: 0 };
      row.goals += st.goals;
      row.assists += st.assists;
      row.yellow += st.yellow_cards;
      row.red += st.red_card ? 1 : 0;
      row.matches++;
      scorers.set(st.profile_id, row);
    }
    // Rosters, names only, for the clubs whose figures this person may enter.
    const rosterClubs = new Set<string>();
    for (const m of matches) {
      if (!open || m.status === "cancelled") continue;
      if (organizer(m) || m.referee_user_id === s.p.userId) {
        rosterClubs.add(m.home_organization_id);
        rosterClubs.add(m.away_organization_id);
      } else if (staffOf(m) && m.status === "scheduled") rosterClubs.add(s.a.organization_id);
    }
    const rosters = (
      await s.c.query(
        `SELECT cp.organization_id,cp.id,cp.full_name AS name FROM club_person cp
          WHERE cp.organization_id=ANY($1::uuid[]) AND cp.status='active' AND 'player'=ANY(cp.directory_roles) ORDER BY cp.full_name LIMIT 2000`,
        [[...rosterClubs]],
      )
    ).rows as { organization_id: string; id: string; name: string }[];
    const groups = [...new Set(accepted.map((c) => c.group).filter(Boolean))].sort();
    const tables =
      t.format === "knockout"
        ? []
        : t.format === "groups_knockout" && groups.length
          ? groups.map((g) => ({ group: g, rows: standings(accepted, results, rules, g) }))
          : [{ group: "", rows: standings(accepted, results, rules) }];
    return {
      organization_id: s.a.organization_id,
      tournament: { id: t.id, name: t.name, year: t.year, format: t.format, rules, description: t.description, status: t.status, version: t.version, owner: t.owner_name, ownerKind: t.owner_kind },
      manage,
      myClub: s.a.kind === "club" ? s.a.organization_id : null,
      canRespond: s.a.kind === "club" && s.a.role === "club_president" && clubs.some((c) => c.id === s.a.organization_id) && open,
      clubs: clubs.map(({ id, name, club_name, status, group }) => ({ id, name, clubName: club_name, status, group })),
      tables,
      podium: podium(t.format, accepted, results, rules).map((x) => ({ rank: x.rank, club: x.club, name: names.get(x.club) ?? "" })),
      pending: matches.filter((m) => m.status === "reported").length,
      scorers: [...scorers.values()].sort((x, y) => y.goals - x.goals || y.assists - x.assists || x.name.localeCompare(y.name)).slice(0, 30),
      days: days.map((d) => ({
        ...d,
        matches: matches
          .filter((m) => m.day_id === d.id)
          .map((m) => ({
            id: m.id,
            kickoff: m.kickoff,
            stage: m.stage,
            group: m.group_label,
            home: m.home_organization_id,
            away: m.away_organization_id,
            homeName: names.get(m.home_organization_id) ?? "",
            awayName: names.get(m.away_organization_id) ?? "",
            homeScore: m.home_score,
            awayScore: m.away_score,
            homeShootout: m.home_shootout,
            awayShootout: m.away_shootout,
            status: m.status,
            version: m.version,
            refereeId: m.referee_user_id,
            referee: m.referee_name,
            reportedBy: m.reported_name,
            validatedBy: m.validated_name,
            stats: stats
              .filter((st) => st.match_id === m.id)
              .map((st) => ({ profileId: st.profile_id, club: st.organization_id, name: st.name, goals: st.goals, assists: st.assists, yellowCards: st.yellow_cards, redCard: st.red_card })),
            canReport: open && m.status !== "cancelled" && (organizer(m) || m.referee_user_id === s.p.userId || (staffOf(m) && m.status === "scheduled")),
            canValidate: open && m.status === "reported" && (organizer(m) || m.referee_user_id === s.p.userId),
            /** Clubs whose players this person may enter for this match. */
            statClubs:
              organizer(m) || m.referee_user_id === s.p.userId ? [m.home_organization_id, m.away_organization_id] : staffOf(m) ? [s.a.organization_id] : [],
          })),
      })),
      rosters,
      referees: manage ? await refereeOptions(s) : [],
      clubOptions: manage ? await clubOptions(s) : [],
    };
  });
}

/** Referees of the federation (the organiser's own, or the organising club's federation). */
async function refereeOptions(s: Scope) {
  if (!s.federation) return [];
  return (
    await s.c.query(
      `SELECT DISTINCT u.id,u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id
        WHERE r.organization_id=$1 AND r.role='referee' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active ORDER BY u.name`,
      [s.federation],
    )
  ).rows as { id: string; name: string }[];
}

/** Trophy gallery: the podiums of finished tournaments the person can see, newest first. */
export async function trophiesView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(
        `SELECT tr.id,tr.rank,tr.organization_id,COALESCE(NULLIF(tc.team_name,''),o.name) AS club,t.id AS tournament_id,t.name AS tournament,t.year,t.organization_id AS owner_id,
                tr.photo_type IS NOT NULL AS has_photo,extract(epoch FROM tr.photo_updated_at)::bigint::text AS photo_version
           FROM tournament_trophy tr JOIN tournament t ON t.id=tr.tournament_id JOIN organization o ON o.id=tr.organization_id
           LEFT JOIN tournament_club tc ON tc.tournament_id=t.id AND tc.organization_id=tr.organization_id
          WHERE ${visible} ORDER BY t.year DESC,t.name,tr.rank`,
        args(s),
      )
    ).rows;
    return {
      organization_id: s.a.organization_id,
      trophies: rows.map((r) => ({
        id: r.id as string,
        rank: r.rank as 1 | 2 | 3,
        club: r.club as string,
        mine: r.organization_id === s.a.organization_id,
        tournamentId: r.tournament_id as string,
        tournament: r.tournament as string,
        year: r.year as number,
        hasPhoto: r.has_photo as boolean,
        photoVersion: (r.photo_version ?? null) as string | null,
        canPhoto: isPresident(s.a) && (r.organization_id === s.a.organization_id || r.owner_id === s.a.organization_id),
      })),
    };
  });
}

/** The photo of a trophy, for those who can see the tournament. */
export async function trophyPhoto(db: Pool, p: Principal, trophyId: string) {
  return scope(db, p, false, async (s) => {
    const r = (
      await s.c.query(
        `SELECT tr.photo,tr.photo_type FROM tournament_trophy tr JOIN tournament t ON t.id=tr.tournament_id WHERE tr.id=$4 AND tr.photo IS NOT NULL AND ${visible}`,
        [...args(s), trophyId],
      )
    ).rows[0] as { photo: Buffer; photo_type: string } | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return r;
  });
}

/** Adds or replaces the photo of a trophy: the winning club's president, or the organiser. */
export async function trophyPhotoSave(db: Pool, p: Principal, trophyId: string, mediaType: string, data: string, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const r = (
        await s.c.query(
          `SELECT tr.id,tr.organization_id,t.organization_id AS owner_id FROM tournament_trophy tr JOIN tournament t ON t.id=tr.tournament_id WHERE tr.id=$4 AND ${visible} FOR UPDATE OF tr`,
          [...args(s), trophyId],
        )
      ).rows[0] as { id: string; organization_id: string; owner_id: string } | undefined;
      if (!r) throw new AccessError("NOT_FOUND", 404);
      if (!isPresident(s.a) || (r.organization_id !== s.a.organization_id && r.owner_id !== s.a.organization_id)) throw new AccessError("FORBIDDEN");
      const bytes = Buffer.from(data, "base64");
      if (!validImage(mediaType, bytes, 1_572_864)) throw new AccessError("INVALID_FILE", 400);
      await s.c.query("UPDATE tournament_trophy SET photo=$2,photo_type=$3,photo_updated_at=now() WHERE id=$1", [r.id, bytes, mediaType]);
      await audit(s.c, s.a.organization_id, s.p.userId, "tournament.trophyPhoto", r.id);
      return { ok: true as const };
    },
    expected,
  );
}

/** Match days shown in the calendar: tournaments the organisation runs or plays in, matches the person referees. */
export async function tournamentDaysIn(db: Pool, p: Principal, from: string, to: string) {
  return scope(db, p, false, async (s) => {
    const rows = (
      await s.c.query(
        `SELECT d.id,d.day::text AS date,d.label,t.id AS tournament_id,t.name FROM tournament_day d JOIN tournament t ON t.id=d.tournament_id
          WHERE d.day>=$3::date AND d.day<=$4::date AND (t.organization_id=$1
             OR EXISTS(SELECT 1 FROM tournament_club tc WHERE tc.tournament_id=t.id AND tc.organization_id=$1 AND tc.status='accepted')
             OR EXISTS(SELECT 1 FROM tournament_match m WHERE m.day_id=d.id AND m.referee_user_id=$2))
          ORDER BY d.day,t.name LIMIT 200`,
        [s.a.organization_id, s.p.userId, from, to],
      )
    ).rows;
    return rows.map((r) => ({
      id: "tournament-" + r.id,
      date: r.date as string,
      title: r.label ? `${r.name} · ${r.label}` : (r.name as string),
      href: `/tournaments/${r.tournament_id}#day-${r.id}`,
    }));
  });
}

/* --------------------------------------------------------------- Commands */

export async function tournamentExecute(db: Pool, p: Principal, input: TournamentCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const org = s.a.organization_id;
      if (input.action === "create") {
        if (!isPresident(s.a)) throw new AccessError("FORBIDDEN");
        const id = (
          await s.c.query(
            "INSERT INTO tournament(organization_id,name,year,format,rules,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [org, input.name, input.year, input.format, JSON.stringify(input.rules), input.description, s.p.userId],
          )
        ).rows[0].id as string;
        // A club organiser plays in its own tournament.
        if (s.a.kind === "club")
          await s.c.query("INSERT INTO tournament_club(tournament_id,organization_id,status,responded_at,responded_by) VALUES($1,$2,'accepted',now(),$3)", [id, org, s.p.userId]);
        await invite(s, id, input.clubs);
        await audit(s.c, org, s.p.userId, "tournament.create", id);
        return { id };
      }
      const t = await tournament(s, input.id, true);
      if (input.action === "respond") {
        if (!(s.a.kind === "club" && s.a.role === "club_president")) throw new AccessError("FORBIDDEN");
        if (t.status !== "open") throw new AccessError("TOURNAMENT_FINISHED", 409);
        const r = await s.c.query(
          "UPDATE tournament_club SET status=$3,team_name=$4,responded_at=now(),responded_by=$5 WHERE tournament_id=$1 AND organization_id=$2 RETURNING 1",
          [t.id, org, input.accept ? "accepted" : "declined", input.teamName, s.p.userId],
        );
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        await audit(s.c, org, s.p.userId, input.accept ? "tournament.accept" : "tournament.decline", t.id);
        return { id: t.id };
      }
      if (input.action === "result" || input.action === "validate") return report(s, t, input);
      if (!manages(s, t)) throw new AccessError("FORBIDDEN");
      if (t.status !== "open" && input.action !== "update") throw new AccessError("TOURNAMENT_FINISHED", 409);
      switch (input.action) {
        case "update": {
          const r = await s.c.query(
            "UPDATE tournament SET name=$3,year=$4,format=$5,rules=$6,description=$7,version=version+1 WHERE id=$1 AND version=$2 RETURNING id",
            [t.id, input.version, input.name, input.year, input.format, JSON.stringify(input.rules), input.description],
          );
          if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
          break;
        }
        case "invite":
          await invite(s, t.id, input.clubs);
          break;
        case "uninvite": {
          if (input.club === t.organization_id) throw new AccessError("FORBIDDEN");
          if ((await s.c.query("SELECT 1 FROM tournament_match WHERE tournament_id=$1 AND $2 IN (home_organization_id,away_organization_id)", [t.id, input.club])).rowCount)
            throw new AccessError("CLUB_HAS_MATCHES", 409);
          await s.c.query("DELETE FROM tournament_club WHERE tournament_id=$1 AND organization_id=$2", [t.id, input.club]);
          break;
        }
        case "group":
          await s.c.query("UPDATE tournament_club SET group_label=$3 WHERE tournament_id=$1 AND organization_id=$2", [t.id, input.club, input.group]);
          break;
        case "day": {
          if (input.hostId && !(await s.c.query("SELECT 1 FROM organization WHERE id=$1 AND kind='club'", [input.hostId])).rowCount) throw new AccessError("NOT_FOUND", 404);
          if (input.dayId) {
            const r = await s.c.query("UPDATE tournament_day SET label=$3,day=$4,venue=$5,host_organization_id=$6,notes=$7 WHERE id=$1 AND tournament_id=$2", [
              input.dayId,
              t.id,
              input.label,
              input.day,
              input.venue,
              input.hostId,
              input.notes,
            ]);
            if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          } else
            return {
              id: (
                await s.c.query("INSERT INTO tournament_day(tournament_id,label,day,venue,host_organization_id,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
                  t.id,
                  input.label,
                  input.day,
                  input.venue,
                  input.hostId,
                  input.notes,
                ])
              ).rows[0].id as string,
            };
          break;
        }
        case "removeDay":
          if ((await s.c.query("SELECT 1 FROM tournament_match WHERE day_id=$1 AND status IN ('reported','validated')", [input.dayId])).rowCount)
            throw new AccessError("DAY_HAS_RESULTS", 409);
          await s.c.query("DELETE FROM tournament_day WHERE id=$1 AND tournament_id=$2", [input.dayId, t.id]);
          break;
        case "match": {
          if (input.home === input.away) throw new AccessError("INVALID_INPUT", 400);
          const playing = (
            await s.c.query("SELECT organization_id FROM tournament_club WHERE tournament_id=$1 AND status='accepted' AND organization_id IN ($2,$3)", [t.id, input.home, input.away])
          ).rowCount;
          if (playing !== 2) throw new AccessError("CLUB_NOT_ACCEPTED", 409);
          if (input.refereeId && !(await refereeOptions(s)).some((r) => r.id === input.refereeId)) throw new AccessError("NOT_FOUND", 404);
          if (!(await s.c.query("SELECT 1 FROM tournament_day WHERE id=$1 AND tournament_id=$2", [input.dayId, t.id])).rowCount) throw new AccessError("NOT_FOUND", 404);
          if (input.matchId) {
            const r = await s.c.query(
              "UPDATE tournament_match SET day_id=$3,kickoff=$4,stage=$5,group_label=$6,home_organization_id=$7,away_organization_id=$8,referee_user_id=$9,version=version+1 WHERE id=$1 AND tournament_id=$2 AND status IN ('scheduled','cancelled')",
              [input.matchId, t.id, input.dayId, input.kickoff, input.stage, input.group, input.home, input.away, input.refereeId],
            );
            if (!r.rowCount) throw new AccessError("MATCH_HAS_RESULT", 409);
          } else {
            const id = (
              await s.c.query(
                "INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,group_label,home_organization_id,away_organization_id,referee_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
                [t.id, input.dayId, input.kickoff, input.stage, input.group, input.home, input.away, input.refereeId],
              )
            ).rows[0].id as string;
            await audit(s.c, org, s.p.userId, "tournament.match", id);
            return { id };
          }
          break;
        }
        case "removeMatch":
          await s.c.query("DELETE FROM tournament_match WHERE id=$1 AND tournament_id=$2", [input.matchId, t.id]);
          break;
        case "finish": {
          const clubs = (await clubRows(s.c, [t.id])).filter((c) => c.status === "accepted");
          const matches = await matchRows(s.c, [t.id]);
          const places = podium(t.format, clubs, matches.map(result), readRules(t.rules));
          for (const x of places)
            await s.c.query("INSERT INTO tournament_trophy(tournament_id,organization_id,rank) VALUES($1,$2,$3) ON CONFLICT (tournament_id,rank) DO NOTHING", [t.id, x.club, x.rank]);
          await s.c.query("UPDATE tournament SET status='finished',finished_at=now(),version=version+1 WHERE id=$1", [t.id]);
          break;
        }
      }
      await audit(s.c, org, s.p.userId, "tournament." + input.action, t.id);
      return { id: t.id };
    },
    expected,
  );
}

async function invite(s: Scope, tournamentId: string, clubs: string[]) {
  const wanted = [...new Set(clubs)].filter((c) => c !== s.a.organization_id);
  if (!wanted.length) return;
  const found = (await s.c.query("SELECT id FROM organization WHERE id=ANY($1::uuid[]) AND kind='club'", [wanted])).rowCount;
  if (found !== wanted.length) throw new AccessError("NOT_FOUND", 404);
  for (const club of wanted)
    await s.c.query("INSERT INTO tournament_club(tournament_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [tournamentId, club]);
}

type ResultInput = Extract<TournamentCommand, { action: "result" | "validate" }>;
async function report(s: Scope, t: TournamentRow, input: ResultInput) {
  if (t.status !== "open") throw new AccessError("TOURNAMENT_FINISHED", 409);
  const m = (
    await s.c.query(
      `SELECT m.*,d.host_organization_id FROM tournament_match m JOIN tournament_day d ON d.id=m.day_id WHERE m.id=$1 AND m.tournament_id=$2 FOR UPDATE OF m`,
      [input.matchId, t.id],
    )
  ).rows[0] as (MatchRow & { home_organization_id: string }) | undefined;
  if (!m) throw new AccessError("NOT_FOUND", 404);
  if (m.version !== input.version) throw new AccessError("STALE_VERSION", 409);
  if (m.status === "cancelled") throw new AccessError("FORBIDDEN");
  const organizer = manages(s, t) || (s.a.kind === "club" && s.a.role === "club_president" && m.host_organization_id === s.a.organization_id);
  const referee = m.referee_user_id === s.p.userId;
  const staff =
    s.a.kind === "club" && (s.a.role === "club_president" || s.a.role === "coach") && [m.home_organization_id, m.away_organization_id].includes(s.a.organization_id);
  const checker = organizer || referee;
  if (input.action === "validate") {
    if (!checker) throw new AccessError("FORBIDDEN");
    if (m.status !== "reported") throw new AccessError("NOTHING_TO_VALIDATE", 409);
    await s.c.query("UPDATE tournament_match SET status='validated',validated_by=$2,validated_at=now(),version=version+1 WHERE id=$1", [m.id, s.p.userId]);
    await audit(s.c, s.a.organization_id, s.p.userId, "tournament.validate", m.id);
    return { id: m.id };
  }
  // The first one enters the result; after that only the organiser or the referee corrects it.
  if (!checker && !(staff && m.status === "scheduled")) throw new AccessError("FORBIDDEN");
  if (input.validate && !checker) throw new AccessError("FORBIDDEN");
  const clubsAllowed = checker ? [m.home_organization_id, m.away_organization_id] : [s.a.organization_id];
  const ids = input.stats.map((x) => x.profileId);
  if (new Set(ids).size !== ids.length) throw new AccessError("INVALID_INPUT", 400);
  const players = new Map(
    (
      await s.c.query("SELECT id,organization_id FROM club_person WHERE id=ANY($1::uuid[]) AND organization_id=ANY($2::uuid[]) AND status='active'", [ids, clubsAllowed])
    ).rows.map((r) => [r.id as string, r.organization_id as string]),
  );
  if (players.size !== ids.length) throw new AccessError("NOT_FOUND", 404);
  await s.c.query(
    `UPDATE tournament_match SET home_score=$2,away_score=$3,home_shootout=$4,away_shootout=$5,status=$6,
            reported_by=COALESCE(reported_by,$7),reported_at=COALESCE(reported_at,now()),
            validated_by=CASE WHEN $6='validated' THEN $7 ELSE NULL END,validated_at=CASE WHEN $6='validated' THEN now() ELSE NULL END,version=version+1 WHERE id=$1`,
    [m.id, input.homeScore, input.awayScore, input.homeShootout, input.awayShootout, input.validate ? "validated" : "reported", s.p.userId],
  );
  // Figures: replaced for the clubs this person may enter, kept for the other one.
  await s.c.query("DELETE FROM tournament_stat WHERE match_id=$1 AND organization_id=ANY($2::uuid[])", [m.id, clubsAllowed]);
  for (const x of input.stats)
    if (x.goals || x.assists || x.yellowCards || x.redCard)
      await s.c.query("INSERT INTO tournament_stat(match_id,organization_id,profile_id,goals,assists,yellow_cards,red_card) VALUES($1,$2,$3,$4,$5,$6,$7)", [
        m.id,
        players.get(x.profileId),
        x.profileId,
        x.goals,
        x.assists,
        x.yellowCards,
        x.redCard,
      ]);
  await audit(s.c, s.a.organization_id, s.p.userId, input.validate ? "tournament.validate" : "tournament.result", m.id);
  return { id: m.id };
}

export type { Rules };
