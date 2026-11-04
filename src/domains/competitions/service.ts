import { suspensionsFor } from "../discipline/service";
import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import {
  peopleScope,
  peopleRecords,
  peopleVisibility,
  brusselsToday,
  type PeopleScope,
} from "../people/service";
import { publish } from "../notifications/queue";
import {
  clubCommand,
  federationCommand,
  refereeCommand,
  fromOurSide,
  officialKinds,
  playerTotals,
  teamRecord,
  formOf,
  type ClubCommand,
  type FederationCommand,
  type RefereeCommand,
  type StatRow,
} from "./schema";
export { clubCommand, federationCommand, refereeCommand };
import { byTournamentDay, friendlyCommand, type FriendlyCommand } from "./schema";
import { friendlyContext, friendlyExecute, matchEvent, proposeScore, tournamentMatches, upcomingDetails } from "./friendly";
export { friendlyCommand };
/** Wave 17 (C5): friendlies between clubs, scores to confirm, transport to organise. */
export const friendlyMatchExecute = (db: Pool, p: Principal, command: FriendlyCommand, expected: string) => friendlyExecute(db, p, command, expected, manageable);
type Tally = { coming: number; invited: number; names: string[]; waiting: string[]; tone: "ok" | "warn" | "low" };
export type MatchLine = { players: Tally; coaches: Tally; transport: "home" | "ready" | "todo"; transportTasks: number };

type Lang = "fr" | "nl" | "en";
const statusText: Record<string, Record<Lang, string>> = {
  proposed: {
    fr: "vous êtes désigné(e) comme arbitre, merci de confirmer",
    nl: "u bent aangeduid als scheidsrechter, gelieve te bevestigen",
    en: "you are designated as referee, please confirm",
  },
  accepted: {
    fr: "désignation acceptée",
    nl: "aanduiding aanvaard",
    en: "designation accepted",
  },
  declined: {
    fr: "désignation refusée",
    nl: "aanduiding geweigerd",
    en: "designation declined",
  },
  withdrawn: {
    fr: "désignation retirée",
    nl: "aanduiding ingetrokken",
    en: "designation withdrawn",
  },
  report: {
    fr: "rapport d'arbitre disponible",
    nl: "scheidsrechtersverslag beschikbaar",
    en: "referee report available",
  },
};
async function notify(
  c: PoolClient,
  input: {
    organizationId: string;
    userIds: string[];
    matchId: string;
    match: string;
    status: keyof typeof statusText;
    path: string;
  },
) {
  if (!input.userIds.length) return;
  const users = (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(p.locale,'fr') AS locale,o.name AS organization
         FROM "user" u LEFT JOIN person p ON p.user_id=u.id JOIN organization o ON o.id=$2
        WHERE u.id=ANY($1) AND u.active`,
      [input.userIds, input.organizationId],
    )
  ).rows as {
    id: string;
    email: string;
    name: string;
    locale: Lang;
    organization: string;
  }[];
  for (const u of users)
    await publish(c, {
      organizationId: input.organizationId,
      userId: u.id,
      email: u.email,
      kind: "match_update",
      category: "administrative",
      resourceType: "match",
      resourceId: input.matchId,
      eventKey: `match:${input.matchId}:${input.status}:${u.id}`,
      locale: u.locale,
      variables: {
        name: u.name,
        organization: u.organization,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}${input.path}`,
        match: input.match,
        status: statusText[input.status][u.locale],
      },
    });
}

/* ---------------------------------------------------------------- Club side */

/** Teams whose matches the actor may edit: team managers, or coaches of the team. */
export function manageable(s: PeopleScope, visibleTeams: Set<string>) {
  const mfa = mfaSatisfied(!!s.user.twoFactorEnabled);
  if (!mfa) return new Set<string>();
  if (s.rights.includes("teams.manage")) return visibleTeams;
  if (s.context.role === "coach") return visibleTeams;
  return new Set<string>();
}

export async function matchesView(db: Pool, p: Principal) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const teamIds = [...v.visibleTeams];
    const can = manageable(s, v.visibleTeams);
    const matches = (
      await c.query(
        `SELECT m.id,m.team_id,t.name AS team,t.color AS team_color,m.opponent,m.home,m.kind,m.competition,m.starts_at,
                to_char(m.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS local_start,
                m.venue,m.calendar_event_id,m.status,m.our_score,m.their_score,m.notes,m.version,
                m.place_id,m.linked_match_id,m.score_status,(m.score_proposed_by=$1) AS score_ours,
                (SELECT json_build_object('id',i.id,'status',i.status,'answer',i.answer) FROM match_invitation i WHERE i.match_id=m.id ORDER BY i.created_at DESC LIMIT 1) AS invitation,
                (SELECT count(*)::int FROM match_player mp WHERE mp.match_id=m.id) AS lineup,
                (SELECT json_build_object('home_score',r.home_score,'away_score',r.away_score,'incidents',r.incidents,'submitted_at',r.submitted_at) FROM match_report r WHERE r.match_id=m.id) AS report,
                COALESCE((SELECT json_agg(json_build_object('name',u.name,'role',a.role,'status',a.status)) FROM referee_assignment a JOIN "user" u ON u.id=a.referee_id WHERE a.match_id=m.id AND a.status IN ('proposed','accepted')),'[]') AS referees
           FROM match m JOIN team t ON t.id=m.team_id
          WHERE m.organization_id=$1 AND m.team_id=ANY($2::uuid[])
          ORDER BY m.starts_at DESC LIMIT 500`,
        [org, teamIds],
      )
    ).rows;
    const teams = all.teams
      .filter((t) => v.visibleTeams.has(t.id) && !t.archived)
      .map((t) => ({
        id: t.id,
        name: t.name,
        manageable: can.has(t.id),
        record: teamRecord(matches.filter((m) => m.team_id === t.id)),
        // 5: the team's card, its colour, its last five results and its next match.
        color: t.color ?? null,
        form: formOf(matches.filter((m) => m.team_id === t.id)),
        next: ((n) => (n ? { id: n.id as string, opponent: n.opponent as string, local_start: n.local_start as string } : null))(
          matches.filter((m) => m.team_id === t.id && m.status === "scheduled" && new Date(m.starts_at) >= new Date()).sort((a, b) => a.local_start.localeCompare(b.local_start))[0],
        ),
      }));
    const day = brusselsToday();
    const players = all.assignments
      .filter(
        (a) =>
          can.has(a.team_id) &&
          a.role === "player" &&
          !a.cancelled &&
          !a.closed_at &&
          a.starts_on <= day &&
          (!a.ends_on || a.ends_on >= day),
      )
      .map((a) => {
        const person = all.profiles.find((x) => x.id === a.profile_id);
        return {
          team_id: a.team_id,
          profile_id: a.profile_id,
          full_name: person?.full_name ?? "",
          position: a.position || person?.playing_position || "",
          jersey_number: person?.jersey_number ?? null,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    const events = can.size
      ? (
          await c.query(
            "SELECT id,title,team_id,to_char(starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD\"T\"HH24:MI') AS local_start FROM calendar_event WHERE organization_id=$1 AND status='scheduled' AND kind IN ('friendly','tournament') AND starts_at>=now()-interval '30 days' AND team_id=ANY($2::uuid[]) ORDER BY starts_at LIMIT 100",
            [org, [...can]],
          )
        ).rows
      : [];
    // Wave 17 (C5): the full line of upcoming matches, the federal tournament matches, the friendlies to answer.
    const details = await upcomingDetails(c, org, matches);
    const friendly = await friendlyContext(c, org);
    const planner = mfaSatisfied(!!s.user.twoFactorEnabled) && (s.context.role === "club_president" || s.rights.includes("calendar.manage"));
    return {
      organization_id: org,
      today: day,
      teams,
      matches: matches.map((m) => ({ ...m, line: details.get(m.id) ?? null })) as (typeof matches[number] & { line: MatchLine | null })[],
      players,
      events,
      tournament: byTournamentDay(await tournamentMatches(c, org)),
      invitations: planner ? friendly.invitations : [],
      opponents: can.size ? friendly.opponents : [],
      places: can.size ? friendly.places : [],
      can: { answer: planner, friendly: can.size > 0 },
    };
  });
}

/** One match with its line-up and statistics (players visible to the actor). */
export async function matchDetail(db: Pool, p: Principal, id: string) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const match = (
      await c.query(
        "SELECT team_id FROM match WHERE id=$1 AND organization_id=$2",
        [id, org],
      )
    ).rows[0];
    if (!match || !v.visibleTeams.has(match.team_id))
      throw new AccessError("NOT_FOUND", 404);
    const lineup = (
      await c.query(
        "SELECT mp.profile_id,cp.full_name,mp.starter,mp.position,mp.jersey_number,mp.minutes,mp.goals,mp.assists,mp.yellow_cards,mp.red_card FROM match_player mp JOIN club_person cp ON cp.id=mp.profile_id WHERE mp.match_id=$1 AND mp.organization_id=$2 ORDER BY mp.starter DESC,mp.jersey_number NULLS LAST,cp.full_name",
        [id, org],
      )
    ).rows;
    return {
      id,
      lineup,
      manageable: manageable(s, v.visibleTeams).has(match.team_id),
    };
  });
}

async function localTime(c: PoolClient, local: string) {
  return (
    await c.query(
      "SELECT ($1::timestamp AT TIME ZONE 'Europe/Brussels') AS t",
      [local],
    )
  ).rows[0].t as Date;
}

export async function matchExecute(
  db: Pool,
  p: Principal,
  command: ClubCommand,
  expected: string,
) {
  return peopleScope(db, p, true, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const can = manageable(s, v.visibleTeams);
    const teamOf = async (matchId: string) => {
      const row = (
        await c.query(
          "SELECT team_id,version,status FROM match WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [matchId, org],
        )
      ).rows[0];
      if (!row) throw new AccessError("NOT_FOUND", 404);
      if (!can.has(row.team_id)) throw new AccessError("FORBIDDEN");
      return row as { team_id: string; version: number; status: string };
    };
    const checkEvent = async (teamId: string, eventId: string | null) => {
      if (!eventId) return;
      const ok = await c.query(
        "SELECT 1 FROM calendar_event WHERE id=$1 AND organization_id=$2 AND (team_id IS NULL OR team_id=$3)",
        [eventId, org, teamId],
      );
      if (!ok.rowCount) throw new AccessError("NOT_FOUND", 404);
    };
    let target: string;
    if (command.action === "create" || command.action === "update") {
      if (!can.has(command.teamId)) throw new AccessError("FORBIDDEN");
      await checkEvent(command.teamId, command.calendarEventId);
      const startsAt = await localTime(c, command.startsAt);
      if (command.action === "create") {
        // A5: a match without an event gets one at once, and with it the call-up of the team (deadline the day before).
        let eventId = command.calendarEventId;
        if (!eventId) {
          const team = (await c.query("SELECT name FROM team WHERE id=$1 AND organization_id=$2", [command.teamId, org])).rows[0]?.name ?? "";
          eventId = await matchEvent(c, s, { teamId: command.teamId, title: `${team} · ${command.opponent}`.slice(0, 120), startsAt, placeId: null, venue: command.venue });
        }
        target = (
          await c.query(
            "INSERT INTO match(organization_id,team_id,opponent,home,kind,competition,starts_at,venue,calendar_event_id,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
            [
              org,
              command.teamId,
              command.opponent,
              command.home,
              command.kind,
              command.competition,
              startsAt,
              command.venue,
              eventId,
              command.notes,
              p.userId,
            ],
          )
        ).rows[0].id;
      } else {
        const current = await teamOf(command.id);
        if (current.version !== command.version)
          throw new AccessError("STALE_VERSION", 409);
        await c.query(
          "UPDATE match SET team_id=$3,opponent=$4,home=$5,kind=$6,competition=$7,starts_at=$8,venue=$9,calendar_event_id=$10,notes=$11,status=$12,our_score=NULL,their_score=NULL,version=version+1 WHERE id=$1 AND organization_id=$2",
          [
            command.id,
            org,
            command.teamId,
            command.opponent,
            command.home,
            command.kind,
            command.competition,
            startsAt,
            command.venue,
            command.calendarEventId,
            command.notes,
            command.status,
          ],
        );
        target = command.id;
      }
    } else if (command.action === "lineup") {
      const m = await teamOf(command.id);
      const allowedPlayers = new Set(
        all.assignments
          .filter((a) => a.team_id === m.team_id && a.role === "player")
          .map((a) => a.profile_id),
      );
      if (command.players.some((x) => !allowedPlayers.has(x.profileId)))
        throw new AccessError("NOT_IN_TEAM", 400);
      // 34: a suspended player stays off the sheet.
      if ((await suspensionsFor(c, org, command.players.map((x) => x.profileId))).size)
        throw new AccessError("PLAYER_SUSPENDED", 409);
      const keep = command.players.map((x) => x.profileId);
      await c.query(
        "DELETE FROM match_player WHERE match_id=$1 AND organization_id=$2 AND NOT (profile_id=ANY($3::uuid[]))",
        [command.id, org, keep],
      );
      for (const x of command.players)
        await c.query(
          "INSERT INTO match_player(match_id,organization_id,profile_id,starter,position,jersey_number) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(match_id,profile_id) DO UPDATE SET starter=EXCLUDED.starter,position=EXCLUDED.position,jersey_number=EXCLUDED.jersey_number",
          [command.id, org, x.profileId, x.starter, x.position, x.jerseyNumber],
        );
      target = command.id;
    } else {
      const m = await teamOf(command.id);
      if (m.version !== command.version)
        throw new AccessError("STALE_VERSION", 409);
      const inLineup = new Set(
        (
          await c.query(
            "SELECT profile_id FROM match_player WHERE match_id=$1",
            [command.id],
          )
        ).rows.map((r) => r.profile_id as string),
      );
      if (command.stats.some((x) => !inLineup.has(x.profileId)))
        throw new AccessError("NOT_IN_LINEUP", 400);
      const goals = command.stats.reduce((n, x) => n + x.goals, 0);
      if (goals > command.ourScore)
        throw new AccessError("GOALS_EXCEED_SCORE", 400);
      for (const x of command.stats)
        await c.query(
          "UPDATE match_player SET minutes=$3,goals=$4,assists=$5,yellow_cards=$6,red_card=$7 WHERE match_id=$1 AND profile_id=$2",
          [
            command.id,
            x.profileId,
            x.minutes,
            x.goals,
            x.assists,
            x.yellowCards,
            x.redCard,
          ],
        );
      await c.query(
        "UPDATE match SET status='played',our_score=$3,their_score=$4,version=version+1 WHERE id=$1 AND organization_id=$2",
        [command.id, org, command.ourScore, command.theirScore],
      );
      // Wave 17 (C5): a friendly with another club: the score is proposed to it.
      await proposeScore(c, org, command.id);
      target = command.id;
    }
    await audit(c, org, p.userId, "match." + command.action, target);
    return { ok: true as const, id: target };
  });
}

/** Match statistics of one player (player profile, sport view). */
export async function playerMatchStats(
  c: PoolClient,
  org: string,
  profileId: string,
) {
  const rows = (
    await c.query(
      `SELECT mp.starter,mp.minutes,mp.goals,mp.assists,mp.yellow_cards,mp.red_card,m.id,m.opponent,m.home,m.kind,m.starts_at,m.our_score,m.their_score,t.name AS team
         FROM match_player mp JOIN match m ON m.id=mp.match_id JOIN team t ON t.id=m.team_id
        WHERE mp.organization_id=$1 AND mp.profile_id=$2 AND m.status='played' ORDER BY m.starts_at DESC`,
      [org, profileId],
    )
  ).rows as (StatRow & {
    id: string;
    opponent: string;
    home: boolean;
    kind: string;
    starts_at: string;
    our_score: number;
    their_score: number;
    team: string;
  })[];
  return { totals: playerTotals(rows), recent: rows.slice(0, 5) };
}
/** Results of the teams a coach leads (coach profile). */
export async function teamResults(
  c: PoolClient,
  org: string,
  teamIds: string[],
) {
  const rows = (
    await c.query(
      "SELECT team_id,status,our_score,their_score,score_status FROM match WHERE organization_id=$1 AND team_id=ANY($2::uuid[])",
      [org, teamIds],
    )
  ).rows;
  return teamRecord(rows);
}

/* ------------------------------------------------ Federation and referees */

type FedScope = {
  c: PoolClient;
  fed: string;
  userId: string;
  role: string;
  manage: boolean;
};
async function federationScope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (s: FedScope) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [a.organization_id],
    );
    const user = await account(c, p);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    if (
      !["federation_president", "federation_worker", "referee"].includes(a.role)
    )
      throw new AccessError("FORBIDDEN");
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const out = await fn({
      c,
      fed: a.organization_id,
      userId: p.userId,
      role: a.role,
      // 32: appointing referees belongs to the « arbitrage » competence.
      manage: mfa && fedCan(a.role, a.grants, "federation.referees"),
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const matchLabel = (r: {
  club: string;
  team: string;
  opponent: string;
  home: boolean;
}) =>
  r.home
    ? `${r.club} (${r.team}) · ${r.opponent}`
    : `${r.opponent} · ${r.club} (${r.team})`;

/** Official matches of affiliated clubs, referees and their availability. */
export async function designationsView(db: Pool, p: Principal) {
  return federationScope(db, p, false, async (s) => {
    if (s.role === "referee") throw new AccessError("FORBIDDEN");
    const matches = (
      await s.c.query(
        `SELECT m.id,o.name AS club,t.name AS team,m.opponent,m.home,m.kind,m.competition,m.starts_at,(m.starts_at AT TIME ZONE 'Europe/Brussels')::date::text AS day,m.venue,m.status,
                (SELECT json_build_object('home_score',r.home_score,'away_score',r.away_score,'incidents',r.incidents) FROM match_report r WHERE r.match_id=m.id) AS report,
                COALESCE((SELECT json_agg(json_build_object('referee_id',a.referee_id,'name',u.name,'role',a.role,'status',a.status)) FROM referee_assignment a JOIN "user" u ON u.id=a.referee_id WHERE a.match_id=m.id AND a.status<>'withdrawn'),'[]') AS referees
           FROM match m JOIN organization o ON o.id=m.organization_id JOIN team t ON t.id=m.team_id
          WHERE o.federation_id=$1 AND m.kind=ANY($2) AND m.status IN ('scheduled','played','postponed') AND m.starts_at>=now()-interval '60 days'
          ORDER BY m.starts_at LIMIT 300`,
        [s.fed, officialKinds],
      )
    ).rows;
    const referees = (
      await s.c.query(
        `SELECT DISTINCT u.id,u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id
          WHERE r.organization_id=$1 AND r.role='referee' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active ORDER BY u.name`,
        [s.fed],
      )
    ).rows as { id: string; name: string }[];
    const availability = (
      await s.c.query(
        "SELECT user_id,day::text,available,note FROM referee_availability WHERE federation_id=$1 AND day>=CURRENT_DATE-1",
        [s.fed],
      )
    ).rows;
    return {
      organization_id: s.fed,
      can: { manage: s.manage },
      matches,
      referees,
      availability,
    };
  });
}

export async function designationExecute(
  db: Pool,
  p: Principal,
  command: FederationCommand,
  expected: string,
) {
  return federationScope(
    db,
    p,
    true,
    async (s) => {
      if (s.role === "referee" || !s.manage) throw new AccessError("FORBIDDEN");
      const match = (
        await s.c.query(
          "SELECT m.id,m.home,m.opponent,o.name AS club,t.name AS team FROM match m JOIN organization o ON o.id=m.organization_id JOIN team t ON t.id=m.team_id WHERE m.id=$1 AND o.federation_id=$2 AND m.kind=ANY($3)",
          [command.matchId, s.fed, officialKinds],
        )
      ).rows[0];
      if (!match) throw new AccessError("NOT_FOUND", 404);
      if (command.action === "assign") {
        const referee = await s.c.query(
          "SELECT 1 FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='referee' AND revoked_at IS NULL",
          [s.fed, command.refereeId],
        );
        if (!referee.rowCount) throw new AccessError("NOT_FOUND", 404);
        await s.c.query(
          "INSERT INTO referee_assignment(match_id,federation_id,referee_id,role,assigned_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(match_id,referee_id) DO UPDATE SET role=EXCLUDED.role,status='proposed',assigned_by=EXCLUDED.assigned_by,assigned_at=now(),answered_at=NULL",
          [command.matchId, s.fed, command.refereeId, command.role, s.userId],
        );
        await notify(s.c, {
          organizationId: s.fed,
          userIds: [command.refereeId],
          matchId: command.matchId,
          match: matchLabel(match),
          status: "proposed",
          path: "/referee",
        });
      } else {
        const changed = await s.c.query(
          "UPDATE referee_assignment SET status='withdrawn',answered_at=now() WHERE match_id=$1 AND referee_id=$2 AND federation_id=$3 AND status<>'withdrawn' RETURNING 1",
          [command.matchId, command.refereeId, s.fed],
        );
        if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
        await notify(s.c, {
          organizationId: s.fed,
          userIds: [command.refereeId],
          matchId: command.matchId,
          match: matchLabel(match),
          status: "withdrawn",
          path: "/referee",
        });
      }
      await audit(
        s.c,
        s.fed,
        s.userId,
        "referee." + command.action,
        command.matchId,
      );
      return { ok: true as const };
    },
    expected,
  );
}

/** The referee's own space: availability, designations, reports. */
export async function refereeView(db: Pool, p: Principal) {
  return federationScope(db, p, false, async (s) => {
    if (s.role !== "referee") throw new AccessError("FORBIDDEN");
    const assignments = (
      await s.c.query(
        `SELECT a.match_id,a.role,a.status,o.name AS club,t.name AS team,m.opponent,m.home,m.kind,m.competition,m.starts_at,m.venue,m.status AS match_status,
                (SELECT json_build_object('home_score',r.home_score,'away_score',r.away_score,'incidents',r.incidents) FROM match_report r WHERE r.match_id=m.id) AS report
           FROM referee_assignment a JOIN match m ON m.id=a.match_id JOIN organization o ON o.id=m.organization_id JOIN team t ON t.id=m.team_id
          WHERE a.referee_id=$1 AND a.federation_id=$2 AND a.status<>'withdrawn' ORDER BY m.starts_at DESC LIMIT 200`,
        [s.userId, s.fed],
      )
    ).rows;
    const availability = (
      await s.c.query(
        "SELECT day::text,available,note FROM referee_availability WHERE federation_id=$1 AND user_id=$2 AND day>=CURRENT_DATE ORDER BY day",
        [s.fed, s.userId],
      )
    ).rows;
    return {
      organization_id: s.fed,
      today: brusselsToday(),
      assignments,
      availability,
    };
  });
}

export async function refereeExecute(
  db: Pool,
  p: Principal,
  command: RefereeCommand,
  expected: string,
) {
  return federationScope(
    db,
    p,
    true,
    async (s) => {
      if (s.role !== "referee") throw new AccessError("FORBIDDEN");
      if (command.action === "availability") {
        const today = brusselsToday();
        for (const d of command.days) {
          if (d.day < today) throw new AccessError("INVALID_DATE", 400);
          await s.c.query(
            "INSERT INTO referee_availability(federation_id,user_id,day,available,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT(federation_id,user_id,day) DO UPDATE SET available=EXCLUDED.available,note=EXCLUDED.note,updated_at=now()",
            [s.fed, s.userId, d.day, d.available, d.note],
          );
        }
        return { ok: true as const };
      }
      const assignment = (
        await s.c.query(
          "SELECT a.status,m.home,m.opponent,m.organization_id,m.starts_at,o.name AS club,t.name AS team FROM referee_assignment a JOIN match m ON m.id=a.match_id JOIN organization o ON o.id=m.organization_id JOIN team t ON t.id=m.team_id WHERE a.match_id=$1 AND a.referee_id=$2 AND a.federation_id=$3 FOR UPDATE OF a",
          [command.matchId, s.userId, s.fed],
        )
      ).rows[0];
      if (!assignment || assignment.status === "withdrawn")
        throw new AccessError("NOT_FOUND", 404);
      const presidents = (
        await s.c.query(
          "SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='federation_president' AND revoked_at IS NULL",
          [s.fed],
        )
      ).rows.map((r) => r.user_id as string);
      if (command.action === "answer") {
        const status = command.accept ? "accepted" : "declined";
        await s.c.query(
          "UPDATE referee_assignment SET status=$4,answered_at=now() WHERE match_id=$1 AND referee_id=$2 AND federation_id=$3",
          [command.matchId, s.userId, s.fed, status],
        );
        await notify(s.c, {
          organizationId: s.fed,
          userIds: presidents,
          matchId: command.matchId,
          match: matchLabel(assignment),
          status,
          path: "/federation/referees",
        });
      } else {
        if (assignment.status !== "accepted")
          throw new AccessError("NOT_ACCEPTED", 409);
        if (new Date(assignment.starts_at) > new Date())
          throw new AccessError("NOT_PLAYED_YET", 409);
        await s.c.query(
          "INSERT INTO match_report(match_id,referee_id,home_score,away_score,incidents) VALUES($1,$2,$3,$4,$5) ON CONFLICT(match_id) DO UPDATE SET referee_id=EXCLUDED.referee_id,home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,incidents=EXCLUDED.incidents,submitted_at=now()",
          [
            command.matchId,
            s.userId,
            command.homeScore,
            command.awayScore,
            command.incidents,
          ],
        );
        // The official score is copied to the club's match when it has none yet.
        const ours = fromOurSide(
          assignment.home,
          command.homeScore,
          command.awayScore,
        );
        await s.c.query(
          "UPDATE match SET our_score=COALESCE(our_score,$2),their_score=COALESCE(their_score,$3),status='played',version=version+1 WHERE id=$1 AND status IN ('scheduled','played')",
          [command.matchId, ours.our, ours.their],
        );
        const clubManagers = (
          await s.c.query(
            "SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL",
            [assignment.organization_id],
          )
        ).rows.map((r) => r.user_id as string);
        await notify(s.c, {
          organizationId: s.fed,
          userIds: presidents,
          matchId: command.matchId,
          match: matchLabel(assignment),
          status: "report",
          path: "/federation/referees",
        });
        await notify(s.c, {
          organizationId: assignment.organization_id,
          userIds: clubManagers,
          matchId: command.matchId,
          match: matchLabel(assignment),
          status: "report",
          path: "/matches",
        });
      }
      await audit(
        s.c,
        s.fed,
        s.userId,
        "referee." + command.action,
        command.matchId,
      );
      return { ok: true as const };
    },
    expected,
  );
}
