import { rounds } from "../trips/rounds";
import { transportReady } from "../trips/transport";
import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { audit, AccessError, type Principal } from "../access/service";
import { publish } from "../notifications/queue";
import { audience, type Actor, type Event } from "../calendar/access";
import { inviteForEvent } from "../attendance/service";
import { peopleScope, peopleRecords, peopleVisibility, type PeopleScope } from "../people/service";
import { presenceRules, toneFor } from "../dashboard/presence";
import { dueBefore, suggestedTemplates, type TemplateItem } from "../tasks/schema";
import { presenceLine, transportState, type FriendlyCommand } from "./schema";

/**
 * Wave 17 (C5): friendlies between the clubs of a federation, the score
 * proposed by one club and confirmed by the other, the full line of an
 * upcoming match (players, coaches, referee, transport) and the federal
 * tournament matches of the club.
 */
type Lang = "fr" | "nl" | "en";
const words: Record<string, Record<Lang, string>> = {
  invited: { fr: "invitation à un match amical", nl: "uitnodiging voor een vriendschappelijke wedstrijd", en: "invitation to a friendly" },
  accepted: { fr: "match amical accepté", nl: "vriendschappelijke wedstrijd aanvaard", en: "friendly accepted" },
  refused: { fr: "match amical refusé", nl: "vriendschappelijke wedstrijd geweigerd", en: "friendly refused" },
  cancelled: { fr: "match amical annulé", nl: "vriendschappelijke wedstrijd geannuleerd", en: "friendly cancelled" },
  score: { fr: "score proposé, à confirmer", nl: "score voorgesteld, te bevestigen", en: "score proposed, to confirm" },
  confirmed: { fr: "score confirmé", nl: "score bevestigd", en: "score confirmed" },
};

/** Who answers for a club: its presidents and those with calendar.manage. */
async function deciders(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization
         FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization o ON o.id=r.organization_id
         JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active
          AND (r.role='club_president' OR 'calendar.manage'=ANY(r.grants))`,
      [org],
    )
  ).rows as { id: string; email: string; name: string; locale: Lang; organization: string }[];
}
async function tell(c: PoolClient, org: string, matchId: string, match: string, what: keyof typeof words) {
  for (const u of await deciders(c, org))
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "match_update",
      category: "sport",
      resourceType: "match",
      resourceId: matchId,
      eventKey: `friendly:${matchId}:${what}:${u.id}:${Date.now()}`,
      locale: (["fr", "nl", "en"].includes(u.locale) ? u.locale : "fr") as Lang,
      variables: { name: u.name, organization: u.organization, url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/matches`, match, status: words[what][u.locale] ?? words[what].fr },
    });
}

/** The calendar event of a friendly, the team invited with an answer asked, as the calendar does it. */
export async function matchEvent(c: PoolClient, s: PeopleScope, i: { teamId: string; title: string; startsAt: Date; placeId: string | null; venue: string }) {
  const org = s.context.organization_id;
  const series = (await c.query("INSERT INTO calendar_series(organization_id,interval_days,occurrences,created_by) VALUES($1,0,1,$2) RETURNING id", [org, s.p.userId])).rows[0].id;
  const type = (await c.query("SELECT id FROM event_type WHERE organization_id=$1 AND legacy_kind='friendly' AND NOT archived ORDER BY position LIMIT 1", [org])).rows[0]?.id ?? null;
  const e = (
    await c.query(
      `INSERT INTO calendar_event(organization_id,series_id,ordinal,title,kind,timezone,starts_at,ends_at,local_start,local_end,team_id,place_id,responsible_user_id,visibility,free_location,event_type_id)
       VALUES($1,$2,1,$3,'friendly','Europe/Brussels',$4::timestamptz,$4::timestamptz+interval '2 hours',
              to_char($4::timestamptz AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),to_char(($4::timestamptz+interval '2 hours') AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI'),
              $5,$6,$7,'team',$8,$9) RETURNING *`,
      [org, series, i.title.slice(0, 120), i.startsAt, i.teamId, i.placeId, s.p.userId, i.placeId ? "" : i.venue, type],
    )
  ).rows[0] as Event;
  await c.query("INSERT INTO calendar_invite_group(organization_id,event_id,kind,ref) VALUES($1,$2,'team',$3) ON CONFLICT DO NOTHING", [org, e.id, i.teamId]);
  const people = (await audience(c, e)).map((x) => x.id);
  const day = 86400000;
  const deadline = new Date(Math.max(i.startsAt.getTime() - day, Math.min(Date.now() + 3600000, i.startsAt.getTime() - 60000)));
  if (people.length) await inviteForEvent(c, s.p, { ...s.context, twoFactorEnabled: !!s.user.twoFactorEnabled } as Actor, e, people, deadline);
  return e.id;
}

const planner = (s: PeopleScope) => mfaSatisfied(!!s.user.twoFactorEnabled) && (s.context.role === "club_president" || s.rights.includes("calendar.manage"));

export async function friendlyExecute(db: Pool, p: Principal, command: FriendlyCommand, expected: string, manageable: (s: PeopleScope, teams: Set<string>) => Set<string>) {
  return peopleScope(db, p, true, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const can = manageable(s, v.visibleTeams);
    const own = async (id: string) => {
      const m = (await c.query("SELECT * FROM match WHERE id=$1 AND organization_id=$2 FOR UPDATE", [id, org])).rows[0];
      if (!m) throw new AccessError("NOT_FOUND", 404);
      if (!can.has(m.team_id) && !planner(s)) throw new AccessError("FORBIDDEN");
      return m;
    };
    if (command.action === "friendly") {
      if (!can.has(command.teamId)) throw new AccessError("FORBIDDEN");
      const ours = (await c.query("SELECT t.name,o.name AS club,o.federation_id FROM team t JOIN organization o ON o.id=t.organization_id WHERE t.id=$1 AND t.organization_id=$2", [command.teamId, org])).rows[0];
      let opponent = command.opponentName;
      let other: { id: string; organization_id: string; name: string; club: string } | undefined;
      if (command.opponentTeamId) {
        other = (
          await c.query(
            `SELECT t.id,t.organization_id,t.name,o.name AS club FROM team t JOIN organization o ON o.id=t.organization_id
              WHERE t.id=$1 AND NOT t.archived AND o.kind='club' AND (o.id=$2 OR (o.federation_id IS NOT NULL AND o.federation_id=$3))`,
            [command.opponentTeamId, org, ours.federation_id],
          )
        ).rows[0];
        if (!other || other.id === command.teamId) throw new AccessError("NOT_FOUND", 404);
        opponent = other.organization_id === org ? other.name : `${other.club} · ${other.name}`;
      }
      if (opponent.trim().length < 2) throw new AccessError("INVALID_INPUT", 400);
      if (command.placeId && !(await c.query("SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2", [command.placeId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      const startsAt = (await c.query("SELECT ($1::timestamp AT TIME ZONE 'Europe/Brussels') AS t", [command.startsAt])).rows[0].t as Date;
      const place = command.placeId ? ((await c.query("SELECT name,address FROM calendar_place WHERE id=$1", [command.placeId])).rows[0] as { name: string; address: string }) : null;
      const venue = place ? [place.name, place.address].filter(Boolean).join(", ").slice(0, 200) : command.venue;
      const event = await matchEvent(c, s, { teamId: command.teamId, title: `${ours.name} · ${opponent}`, startsAt, placeId: command.placeId, venue });
      const id = (
        await c.query(
          "INSERT INTO match(organization_id,team_id,opponent,home,kind,competition,starts_at,venue,calendar_event_id,notes,created_by,place_id,opponent_team_id) VALUES($1,$2,$3,$4,'friendly','',$5,$6,$7,$8,$9,$10,$11) RETURNING id",
          [org, command.teamId, opponent.slice(0, 120), command.home, startsAt, venue, event, command.message, p.userId, command.placeId, other?.id ?? null],
        )
      ).rows[0].id as string;
      if (other) {
        const invitation = (
          await c.query("INSERT INTO match_invitation(match_id,organization_id,invited_organization_id,invited_team_id,message,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
            id,
            org,
            other.organization_id,
            other.id,
            command.message,
            p.userId,
          ])
        ).rows[0].id as string;
        // Both teams in the same club: nothing to ask, the other side is created at once.
        if (other.organization_id === org) await accept(c, s, invitation, "");
        else await tell(c, other.organization_id, id, `${ours.club} · ${ours.name}`, "invited");
      }
      await audit(c, org, p.userId, "match.friendly", id);
      return { ok: true as const, id };
    }
    if (command.action === "answerInvitation") {
      if (!planner(s)) throw new AccessError("FORBIDDEN");
      const inv = (await c.query("SELECT * FROM match_invitation WHERE id=$1 AND invited_organization_id=$2 AND status='sent' FOR UPDATE", [command.id, org])).rows[0];
      if (!inv) throw new AccessError("NOT_FOUND", 404);
      if (command.accept) await accept(c, s, inv.id, command.answer);
      else {
        await c.query("UPDATE match_invitation SET status='refused',answer=$2,answered_by=$3,answered_at=now() WHERE id=$1", [inv.id, command.answer, p.userId]);
        const m = (await c.query("UPDATE match SET status='cancelled',version=version+1 WHERE id=$1 RETURNING opponent", [inv.match_id])).rows[0];
        await tell(c, inv.organization_id, inv.match_id, m.opponent, "refused");
      }
      await audit(c, org, p.userId, command.accept ? "match.invitation.accepted" : "match.invitation.refused", inv.id);
      return { ok: true as const, id: inv.id };
    }
    if (command.action === "cancelInvitation") {
      const m = await own(command.id);
      const inv = (await c.query("UPDATE match_invitation SET status='cancelled' WHERE match_id=$1 AND status='sent' RETURNING invited_organization_id", [m.id])).rows[0];
      if (!inv) throw new AccessError("NOT_FOUND", 404);
      await c.query("UPDATE match SET status='cancelled',version=version+1 WHERE id=$1", [m.id]);
      if (m.calendar_event_id) await c.query("UPDATE calendar_event SET status='cancelled',version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2", [m.calendar_event_id, org]);
      await tell(c, inv.invited_organization_id, m.id, m.opponent, "cancelled");
      await audit(c, org, p.userId, "match.invitation.cancelled", m.id);
      return { ok: true as const, id: m.id };
    }
    if (command.action === "confirmScore") {
      const m = await own(command.id);
      if (m.score_status !== "proposed" || m.score_proposed_by === org || !m.linked_match_id) throw new AccessError("NOT_FOUND", 404);
      await c.query("UPDATE match SET score_status='confirmed',score_proposed_by=NULL,version=version+1 WHERE id=ANY($1::uuid[])", [[m.id, m.linked_match_id]]);
      const other = (await c.query("SELECT organization_id FROM match WHERE id=$1", [m.linked_match_id])).rows[0].organization_id as string;
      if (other !== org) await tell(c, other, m.linked_match_id, m.opponent, "confirmed");
      await audit(c, org, p.userId, "match.score.confirmed", m.id);
      return { ok: true as const, id: m.id };
    }
    // organizeTransport: the club's Transport template (or the proposed one), due before the match, given to the team's coach.
    const m = await own(command.id);
    const lang = (((await c.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale as Lang) ?? "fr") as Lang;
    const tpl = (await c.query("SELECT items FROM task_template WHERE organization_id=$1 AND kind='transport' ORDER BY created_at LIMIT 1", [org])).rows[0]?.items as TemplateItem[] | undefined;
    const items = tpl ?? suggestedTemplates[["fr", "nl", "en"].includes(lang) ? lang : "fr"].find((t) => t.key === "transport")!.items;
    const coach = (
      await c.query(
        "SELECT profile_id FROM team_membership WHERE team_id=$1 AND organization_id=$2 AND role IN ('coach','assistant') AND NOT cancelled AND closed_at IS NULL AND starts_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>=CURRENT_DATE) ORDER BY (role='coach') DESC,starts_on LIMIT 1",
        [m.team_id, org],
      )
    ).rows[0]?.profile_id as string | undefined;
    const date = (await c.query("SELECT (starts_at AT TIME ZONE 'Europe/Brussels')::date::text AS d FROM match WHERE id=$1", [m.id])).rows[0].d as string;
    const ids: string[] = [];
    for (const i of items)
      ids.push(
        (
          await c.query(
            "INSERT INTO task(organization_id,kind,title,detail,due_on,responsible_id,match_id,origin,created_by) VALUES($1,'transport',$2,$3,$4,$5,$6,'template',$7) RETURNING id",
            [org, i.title, i.detail ?? "", dueBefore(date, i.daysBefore), coach ?? null, m.id, p.userId],
          )
        ).rows[0].id,
      );
    await audit(c, org, p.userId, "match.transport.organized", m.id, { tasks: ids.length });
    return { ok: true as const, id: m.id, tasks: ids.length };
  });
}

/** Accepting: the invited club's match and event, both matches linked. */
async function accept(c: PoolClient, s: PeopleScope, invitationId: string, answer: string) {
  const inv = (await c.query("SELECT * FROM match_invitation WHERE id=$1", [invitationId])).rows[0];
  const theirs = (await c.query("SELECT m.*,t.name AS team,o.name AS club FROM match m JOIN team t ON t.id=m.team_id JOIN organization o ON o.id=m.organization_id WHERE m.id=$1", [inv.match_id])).rows[0];
  const team = (await c.query("SELECT name FROM team WHERE id=$1", [inv.invited_team_id])).rows[0].name as string;
  const opponent = inv.organization_id === inv.invited_organization_id ? theirs.team : `${theirs.club} · ${theirs.team}`;
  // The invited club acts in its own organization: `s` is its scope (the same one for two teams of a club).
  const event = await matchEvent(c, s, { teamId: inv.invited_team_id, title: `${team} · ${opponent}`, startsAt: theirs.starts_at, placeId: null, venue: theirs.venue });
  const mine = (
    await c.query(
      "INSERT INTO match(organization_id,team_id,opponent,home,kind,competition,starts_at,venue,calendar_event_id,notes,created_by,opponent_team_id,linked_match_id) VALUES($1,$2,$3,$4,'friendly','',$5,$6,$7,'',$8,$9,$10) RETURNING id",
      [inv.invited_organization_id, inv.invited_team_id, opponent.slice(0, 120), !theirs.home, theirs.starts_at, theirs.venue, event, s.p.userId, theirs.team_id, theirs.id],
    )
  ).rows[0].id as string;
  await c.query("UPDATE match SET linked_match_id=$2,version=version+1 WHERE id=$1", [theirs.id, mine]);
  await c.query("UPDATE match_invitation SET status='accepted',answer=$2,answered_by=$3,answered_at=now() WHERE id=$1", [inv.id, answer, s.p.userId]);
  if (inv.organization_id !== inv.invited_organization_id) await tell(c, inv.organization_id, theirs.id, `${theirs.team} · ${team}`, "accepted");
  return mine;
}

/**
 * Wave 17 (C5): a result on a match linked to another club proposes the
 * score (each side from its own point of view); the other club confirms it.
 * Called inside the match command, after the result is written.
 */
export async function proposeScore(c: PoolClient, org: string, matchId: string) {
  const m = (await c.query("SELECT id,linked_match_id,our_score,their_score,opponent FROM match WHERE id=$1 AND organization_id=$2", [matchId, org])).rows[0];
  if (!m?.linked_match_id) return;
  const other = (await c.query("SELECT organization_id FROM match WHERE id=$1", [m.linked_match_id])).rows[0].organization_id as string;
  await c.query("UPDATE match SET score_status='proposed',score_proposed_by=$2 WHERE id=$1", [m.id, org]);
  await c.query("UPDATE match SET status='played',our_score=$2,their_score=$3,score_status='proposed',score_proposed_by=$4,version=version+1 WHERE id=$1", [
    m.linked_match_id,
    m.their_score,
    m.our_score,
    org,
  ]);
  if (other !== org) await tell(c, other, m.linked_match_id, m.opponent, "score");
}

type Row = { id: string; team_id: string; status: string; starts_at: Date; calendar_event_id: string | null; place_id: string | null };
/** The full line of the upcoming matches: answers, referee, transport. */
export async function upcomingDetails(c: PoolClient, org: string, matches: Row[]) {
  const soon = matches.filter((m) => m.status === "scheduled" && new Date(m.starts_at).getTime() > Date.now() - 3 * 3600000);
  const rules = presenceRules((await c.query("SELECT presence_rules FROM organization WHERE id=$1", [org])).rows[0]?.presence_rules).match;
  const out = new Map<string, unknown>();
  for (const m of soon) {
    const answers = m.calendar_event_id
      ? ((
          await c.query(
            `SELECT cp.full_name AS name,i.response,
                    EXISTS(SELECT 1 FROM team_membership tm WHERE tm.profile_id=i.profile_id AND tm.team_id=$2 AND tm.role IN ('coach','assistant') AND NOT tm.cancelled AND tm.closed_at IS NULL) AS coach
               FROM attendance_register r JOIN attendance_invitation i ON i.register_id=r.id AND i.withdrawn_at IS NULL JOIN club_person cp ON cp.id=i.profile_id
              WHERE r.event_id=$1 AND r.organization_id=$3 ORDER BY cp.full_name`,
            [m.calendar_event_id, m.team_id, org],
          )
        ).rows as { name: string; response: string; coach: boolean }[])
      : [];
    const players = presenceLine(answers.filter((a) => !a.coach));
    const coaches = presenceLine(answers.filter((a) => a.coach));
    const place = m.place_id ?? (m.calendar_event_id ? ((await c.query("SELECT place_id FROM calendar_event WHERE id=$1", [m.calendar_event_id])).rows[0]?.place_id as string | null) : null);
    const atHome = !!place && !!(await c.query("SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2 AND home", [place, org])).rowCount;
    // 3 (11): « En ordre » when the trip serving the match has its vehicles, each with a driver and a load that fits.
    const trip = (
      await c.query(
        "SELECT id,starts_on::text AS starts_on,ends_on::text AS ends_on FROM trip WHERE organization_id=$1 AND status<>'cancelled' AND (match_id=$2 OR ($3::uuid IS NOT NULL AND calendar_event_id=$3)) ORDER BY match_id IS NULL,created_at LIMIT 1",
        [org, m.id, m.calendar_event_id ?? null],
      )
    ).rows[0] as { id: string; starts_on: string; ends_on: string } | undefined;
    const tripReady = trip
      ? transportReady(
          (
            await rounds(
              c,
              org,
              trip,
              (await c.query("SELECT tp.id,tp.profile_id,tp.chair,tp.status,cp.full_name FROM trip_participant tp JOIN club_person cp ON cp.id=tp.profile_id WHERE tp.trip_id=$1", [trip.id])).rows,
            )
          ).map((v) => ({ drivers: v.drivers.length, problems: v.check.problems })),
        )
      : false;
    const tasks = (await c.query("SELECT count(*)::int AS n FROM task WHERE match_id=$1 AND organization_id=$2 AND kind='transport'", [m.id, org])).rows[0].n as number;
    out.set(m.id, {
      players: { ...players, tone: toneFor(players.coming, rules.players) },
      coaches: { ...coaches, tone: toneFor(coaches.coming, rules.coaches) },
      transport: transportState({ atHome, tripReady }),
      transportTasks: tasks,
    });
  }
  return out;
}

/** Federal tournament matches of the club (invited or registered), with their day. */
export async function tournamentMatches(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT tm.id,tm.day_id,d.day::text AS day,d.label,d.venue,t.name AS tournament,t.id AS tournament_id,to_char(tm.kickoff,'HH24:MI') AS kickoff,tm.stage,tm.status,
              tm.home_score,tm.away_score,ho.name AS home,ao.name AS away,(tm.home_organization_id=$1) AS at_home
         FROM tournament_match tm JOIN tournament_day d ON d.id=tm.day_id JOIN tournament t ON t.id=tm.tournament_id
         JOIN organization ho ON ho.id=tm.home_organization_id JOIN organization ao ON ao.id=tm.away_organization_id
        WHERE (tm.home_organization_id=$1 OR tm.away_organization_id=$1) AND tm.status<>'cancelled'
          AND EXISTS (SELECT 1 FROM tournament_club tc WHERE tc.tournament_id=t.id AND tc.organization_id=$1 AND tc.status IN ('invited','accepted'))
          AND d.day>=CURRENT_DATE-60
        ORDER BY d.day,tm.kickoff LIMIT 300`,
      [org],
    )
  ).rows as { id: string; day_id: string; day: string; label: string; venue: string; tournament: string; tournament_id: string; kickoff: string; stage: string; status: string; home_score: number | null; away_score: number | null; home: string; away: string; at_home: boolean }[];
}

/** Invitations received by the club, and the teams of the federation one may invite. */
export async function friendlyContext(c: PoolClient, org: string) {
  const invitations = (
    await c.query(
      `SELECT i.id,i.message,i.created_at,m.starts_at,to_char(m.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS local_start,m.venue,m.home,
              o.name AS club,t.name AS team,it.name AS invited_team
         FROM match_invitation i JOIN match m ON m.id=i.match_id JOIN organization o ON o.id=i.organization_id JOIN team t ON t.id=m.team_id JOIN team it ON it.id=i.invited_team_id
        WHERE i.invited_organization_id=$1 AND i.organization_id<>$1 AND i.status='sent' AND m.starts_at>now() ORDER BY m.starts_at`,
      [org],
    )
  ).rows;
  const opponents = (
    await c.query(
      `SELECT t.id,t.name,o.name AS club,(o.id=$1) AS own FROM team t JOIN organization o ON o.id=t.organization_id JOIN season se ON se.id=t.season_id
         JOIN organization me ON me.id=$1
        WHERE NOT t.archived AND NOT se.archived AND o.kind='club' AND (o.id=$1 OR (me.federation_id IS NOT NULL AND o.federation_id=me.federation_id))
        ORDER BY (o.id=$1) DESC,o.name,t.name LIMIT 500`,
      [org],
    )
  ).rows as { id: string; name: string; club: string; own: boolean }[];
  const places = (await c.query("SELECT id,name,category,home FROM calendar_place WHERE organization_id=$1 AND NOT archived ORDER BY (category='training') DESC,name", [org])).rows;
  return { invitations, opponents, places };
}
