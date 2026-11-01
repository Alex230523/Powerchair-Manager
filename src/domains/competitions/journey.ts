import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { audit, AccessError, type Principal } from "../access/service";
import { peopleScope, peopleRecords, peopleVisibility, type PeopleScope } from "../people/service";
import { brusselsToday } from "../people/service";
import { seasonOf } from "../finance/schema";
import { manageable } from "./service";
import { matchEvent, proposeScore } from "./friendly";

/**
 * A5: one match sheet in three steps (Avant | Jour J | Après), built on the
 * existing bricks: the match and its line-up (competitions), the call-up
 * and its answers (attendance, through the match's calendar event), the
 * trip (trips), the chairs (equipment), the to-do (A1), the referees and
 * their report. Only the line-up's publication, the result's validation and
 * the day's events (goals, cards, substitutions, typed live and offline)
 * are new. The coach acts for his team, the president for all; players and
 * parents see the call-up, the published line-up and the result.
 */
const id = z.uuid();
export const checklistKeys = ["chairs", "batteries", "balls", "shirts", "firstAid", "transport"] as const;
export const liveKinds = ["goal", "goal_against", "yellow", "red", "sub_in", "sub_out"] as const;
export const journeyCommand = z.discriminatedUnion("action", [
  /** A match created before A5, or whose event was removed: the call-up now. */
  z.object({ action: z.literal("convene"), id }),
  z.object({
    action: z.literal("lineup"),
    id,
    players: z
      .array(z.object({ profileId: id, starter: z.boolean(), position: z.string().trim().max(40).default(""), jerseyNumber: z.number().int().min(0).max(99).nullable() }))
      .max(30),
  }),
  z.object({ action: z.literal("publish"), id, published: z.boolean() }),
  z.object({ action: z.literal("checklist"), id, items: z.array(z.object({ key: z.enum(checklistKeys), responsibleId: id.nullable() })).min(1).max(checklistKeys.length) }),
  z.object({ action: z.literal("live"), id, clientId: id, kind: z.enum(liveKinds), profileId: id.nullable(), minute: z.number().int().min(0).max(200).nullable() }),
  z.object({ action: z.literal("undoLive"), id, eventId: id }),
  z.object({ action: z.literal("validate"), id, version: z.number().int().positive(), ourScore: z.number().int().min(0).max(99), theirScore: z.number().int().min(0).max(99) }),
]);
export type JourneyCommand = z.infer<typeof journeyCommand>;

export type Problem = "licence" | "chairBroken" | "documents" | "chairService" | "noChair";
/** What stops a player from playing (blocking) or deserves a look (warning). Pure. */
export function eligibility(p: { licence: string | null; documentsDue: number; chair: { status: string; serviceDue: boolean } | null }) {
  const blocking: Problem[] = [],
    warnings: Problem[] = [];
  if (p.licence !== "active") blocking.push("licence");
  if (p.chair?.status === "maintenance") blocking.push("chairBroken");
  if (p.documentsDue > 0) warnings.push("documents");
  if (p.chair && p.chair.status !== "maintenance" && p.chair.serviceDue) warnings.push("chairService");
  if (!p.chair) warnings.push("noChair");
  return { blocking, warnings };
}
/** The live score and each player's goals and cards, from the day's events (cancelled ones left out). Pure. */
export function tally(events: { kind: string; profile_id: string | null; cancelled_at: unknown }[]) {
  const live = events.filter((e) => !e.cancelled_at);
  const per = new Map<string, { goals: number; yellow: number; red: boolean }>();
  for (const e of live) {
    if (!e.profile_id) continue;
    const v = per.get(e.profile_id) ?? { goals: 0, yellow: 0, red: false };
    if (e.kind === "goal") v.goals++;
    if (e.kind === "yellow") v.yellow = Math.min(2, v.yellow + 1);
    if (e.kind === "red") v.red = true;
    per.set(e.profile_id, v);
  }
  return { ours: live.filter((e) => e.kind === "goal").length, theirs: live.filter((e) => e.kind === "goal_against").length, per };
}

type Row = {
  id: string;
  team_id: string;
  team: string;
  opponent: string;
  home: boolean;
  kind: string;
  competition: string;
  starts_at: string;
  local_start: string;
  venue: string;
  status: string;
  our_score: number | null;
  their_score: number | null;
  calendar_event_id: string | null;
  lineup_published_at: string | null;
  validated_at: string | null;
  version: number;
  place_id: string | null;
};
async function matchOf(c: PoolClient, org: string, matchId: string, lock = false) {
  const m = (
    await c.query(
      `SELECT m.id,m.team_id,t.name AS team,m.opponent,m.home,m.kind,m.competition,m.starts_at,to_char(m.starts_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD"T"HH24:MI') AS local_start,
              m.venue,m.status,m.our_score,m.their_score,m.calendar_event_id,m.lineup_published_at,m.validated_at,m.version,m.place_id
         FROM match m JOIN team t ON t.id=m.team_id WHERE m.id=$1 AND m.organization_id=$2${lock ? " FOR UPDATE OF m" : ""}`,
      [matchId, org],
    )
  ).rows[0] as Row | undefined;
  if (!m) throw new AccessError("NOT_FOUND", 404);
  return m;
}
/** Current players of the team, each with the facts the line-up checks. */
async function squad(c: PoolClient, org: string, m: Row) {
  return (
    await c.query(
      `SELECT DISTINCT ON (cp.id) cp.id AS profile_id,cp.full_name,cp.jersey_number,COALESCE(NULLIF(tm.position,''),cp.playing_position) AS position,COALESCE(sp.classification,'not_classified') AS classification,
              (SELECT l.status FROM license l WHERE l.profile_id=cp.id AND l.organization_id=$1 AND l.season=$3 ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 WHEN 'requested' THEN 2 ELSE 3 END LIMIT 1) AS licence,
              (SELECT count(*)::int FROM club_document d WHERE d.profile_id=cp.id AND d.organization_id=$1 AND NOT d.sensitive AND (d.status IN ('missing','requested','refused','expired') OR (d.status='valid' AND d.expires_on<CURRENT_DATE))) AS documents_due,
              (SELECT json_build_object('name',ch.name,'status',ch.status,'serviceDue',COALESCE(ch.next_service_on<CURRENT_DATE,false)) FROM equipment_chair_assignment ea JOIN equipment_chair ch ON ch.id=ea.chair_id
                WHERE ea.profile_id=cp.id AND ea.ends_on IS NULL AND ch.organization_id=$1 ORDER BY ea.is_primary DESC,ea.starts_on DESC LIMIT 1) AS chair,
              (SELECT i.response FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id WHERE r.event_id=$4 AND i.profile_id=cp.id AND i.withdrawn_at IS NULL LIMIT 1) AS answer
         FROM team_membership tm JOIN club_person cp ON cp.id=tm.profile_id LEFT JOIN player_sport_profile sp ON sp.profile_id=cp.id
        WHERE tm.organization_id=$1 AND tm.team_id=$2 AND tm.role='player' AND NOT tm.cancelled AND tm.closed_at IS NULL AND tm.starts_on<=CURRENT_DATE AND (tm.ends_on IS NULL OR tm.ends_on>=CURRENT_DATE) AND cp.status='active'
        ORDER BY cp.id`,
      [org, m.team_id, seasonOf(brusselsToday()).label, m.calendar_event_id],
    )
  ).rows.map((r) => ({ ...r, ...eligibility({ licence: r.licence, documentsDue: r.documents_due, chair: r.chair }) })) as {
    profile_id: string;
    full_name: string;
    jersey_number: number | null;
    position: string;
    classification: string;
    licence: string | null;
    documents_due: number;
    chair: { name: string; status: string; serviceDue: boolean } | null;
    answer: "present" | "absent" | "uncertain" | "none" | null;
    blocking: Problem[];
    warnings: Problem[];
  }[];
}
async function lineupOf(c: PoolClient, org: string, matchId: string) {
  return (
    await c.query(
      `SELECT mp.profile_id,cp.full_name,mp.starter,mp.position,mp.jersey_number,mp.goals,mp.yellow_cards,mp.red_card,COALESCE(sp.classification,'not_classified') AS classification
         FROM match_player mp JOIN club_person cp ON cp.id=mp.profile_id LEFT JOIN player_sport_profile sp ON sp.profile_id=cp.id
        WHERE mp.match_id=$1 AND mp.organization_id=$2 ORDER BY mp.starter DESC,mp.jersey_number NULLS LAST,cp.full_name`,
      [matchId, org],
    )
  ).rows as { profile_id: string; full_name: string; starter: boolean; position: string; jersey_number: number | null; goals: number; yellow_cards: number; red_card: boolean; classification: string }[];
}
async function liveOf(c: PoolClient, org: string, matchId: string) {
  return (
    await c.query(
      "SELECT e.id,e.client_id,e.kind,e.profile_id,COALESCE(cp.full_name,'') AS name,e.minute,e.created_at,e.cancelled_at FROM match_live_event e LEFT JOIN club_person cp ON cp.id=e.profile_id WHERE e.match_id=$1 AND e.organization_id=$2 ORDER BY e.created_at",
      [matchId, org],
    )
  ).rows as { id: string; client_id: string; kind: string; profile_id: string | null; name: string; minute: number | null; created_at: string; cancelled_at: string | null }[];
}
async function officialsOf(c: PoolClient, org: string, m: Row) {
  const staff = (
    await c.query(
      "SELECT cp.id,cp.full_name,tm.role FROM team_membership tm JOIN club_person cp ON cp.id=tm.profile_id WHERE tm.organization_id=$1 AND tm.team_id=$2 AND tm.role IN ('coach','assistant','volunteer') AND NOT tm.cancelled AND tm.closed_at IS NULL AND (tm.ends_on IS NULL OR tm.ends_on>=CURRENT_DATE) ORDER BY tm.role,cp.full_name",
      [org, m.team_id],
    )
  ).rows as { id: string; full_name: string; role: string }[];
  const referees = (
    await c.query("SELECT u.name,a.role FROM referee_assignment a JOIN \"user\" u ON u.id=a.referee_id JOIN match mm ON mm.id=a.match_id WHERE a.match_id=$1 AND mm.organization_id=$2 AND a.status IN ('proposed','accepted') ORDER BY a.role", [
      m.id,
      org,
    ])
  ).rows as { name: string; role: string }[];
  const report = (
    await c.query("SELECT r.home_score,r.away_score,r.incidents,r.submitted_at FROM match_report r JOIN match mm ON mm.id=r.match_id WHERE r.match_id=$1 AND mm.organization_id=$2", [m.id, org])
  ).rows[0] as { home_score: number; away_score: number; incidents: string; submitted_at: string } | undefined;
  return { staff, referees, report: report ?? null };
}

export async function journeyView(db: Pool, p: Principal, matchId: string) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const m = await matchOf(c, org, matchId);
    if (!v.visibleTeams.has(m.team_id)) throw new AccessError("NOT_FOUND", 404);
    const manage = manageable(s, v.visibleTeams).has(m.team_id);
    const published = !!m.lineup_published_at;
    const done = m.status === "played";
    if (!manage) {
      // A player or a parent: their call-up, the published line-up, the result.
      const subjects = new Set([...(v.own ? [v.own.id] : []), ...v.authorizedRelations.map((r) => r.subject_profile_id)]);
      const callUp = m.calendar_event_id
        ? ((
            await c.query(
              "SELECT i.profile_id,cp.full_name,i.response FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN club_person cp ON cp.id=i.profile_id WHERE r.event_id=$1 AND cp.organization_id=$2 AND i.profile_id=ANY($3::uuid[]) AND i.withdrawn_at IS NULL",
              [m.calendar_event_id, org, [...subjects]],
            )
          ).rows as { profile_id: string; full_name: string; response: string }[])
        : [];
      return {
        organization_id: org,
        manage: false as const,
        match: m,
        callUp,
        lineup: published ? (await lineupOf(c, org, matchId)).map(({ profile_id, full_name, starter, jersey_number, position }) => ({ profile_id, full_name, starter, jersey_number, position })) : null,
        result: done ? { ours: m.our_score, theirs: m.their_score } : null,
      };
    }
    const players = await squad(c, org, m);
    const lineup = await lineupOf(c, org, matchId);
    const live = await liveOf(c, org, matchId);
    const t = tally(live);
    const trip = m.calendar_event_id
      ? (((await c.query("SELECT id,title FROM trip WHERE calendar_event_id=$1 AND organization_id=$2 ORDER BY created_at LIMIT 1", [m.calendar_event_id, org])).rows[0] ?? null) as { id: string; title: string } | null)
      : null;
    const tasks = (
      await c.query("SELECT t.id,t.title,t.source_kind,t.status,COALESCE(cp.full_name,'') AS responsible FROM funding_task t LEFT JOIN club_person cp ON cp.id=t.responsible_id WHERE t.organization_id=$1 AND t.match_id=$2 ORDER BY t.created_at", [
        org,
        matchId,
      ])
    ).rows as { id: string; title: string; source_kind: string; status: string; responsible: string }[];
    const officials = await officialsOf(c, org, m);
    return {
      organization_id: org,
      manage: true as const,
      match: m,
      players,
      lineup,
      live,
      liveScore: { ours: t.ours, theirs: t.theirs },
      trip,
      tasks,
      ...officials,
      announcement: (await c.query("SELECT id FROM newsletter WHERE organization_id=$1 AND status='draft' AND subject LIKE '%' || $2 || '%' ORDER BY created_at DESC LIMIT 1", [org, m.opponent])).rows[0]?.id ?? null,
    };
  });
}

const words = {
  fr: { about: "{team} · {opponent}", result: "Résultat : {team} {ours}-{theirs} {opponent}", scorers: "Buteurs : {names}.", none: "Merci à tous les joueurs, au staff et aux supporters !", heading: "{team} contre {opponent}" },
  nl: { about: "{team} · {opponent}", result: "Uitslag: {team} {ours}-{theirs} {opponent}", scorers: "Doelpuntenmakers: {names}.", none: "Bedankt aan alle spelers, de staf en de supporters!", heading: "{team} tegen {opponent}" },
  en: { about: "{team} · {opponent}", result: "Result: {team} {ours}-{theirs} {opponent}", scorers: "Scorers: {names}.", none: "Thanks to all the players, the staff and the supporters!", heading: "{team} against {opponent}" },
};
const fill = (x: string, v: Record<string, string | number>) => x.replace(/\{(\w+)\}/g, (k, n: string) => (n in v ? String(v[n]) : k));

export async function journeyExecute(db: Pool, p: Principal, cmd: JourneyCommand, expected: string) {
  return peopleScope(db, p, true, async (s: PeopleScope) => {
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const m = await matchOf(c, org, cmd.id, true);
    if (!v.visibleTeams.has(m.team_id)) throw new AccessError("NOT_FOUND", 404);
    if (!manageable(s, v.visibleTeams).has(m.team_id)) throw new AccessError("FORBIDDEN");
    const locale = ((await c.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
    const about = fill(words[locale].about, { team: m.team, opponent: m.opponent });
    let out: Record<string, unknown> = { id: m.id };
    switch (cmd.action) {
      case "convene": {
        if (m.calendar_event_id) throw new AccessError("DUPLICATE", 409);
        const event = await matchEvent(c, s, { teamId: m.team_id, title: about, startsAt: new Date(m.starts_at), placeId: m.place_id, venue: m.venue });
        await c.query("UPDATE match SET calendar_event_id=$3,version=version+1 WHERE id=$1 AND organization_id=$2", [m.id, org, event]);
        out = { id: m.id, event };
        break;
      }
      case "lineup": {
        if (m.status === "played") throw new AccessError("INVALID_TRANSITION", 409);
        const players = new Map((await squad(c, org, m)).map((x) => [x.profile_id, x]));
        for (const x of cmd.players) {
          const pl = players.get(x.profileId);
          if (!pl) throw new AccessError("NOT_IN_TEAM", 400);
          // Only those who said « présent » once a call-up exists, never a blocking problem.
          if (m.calendar_event_id && pl.answer !== "present") throw new AccessError("NOT_PRESENT", 400);
          if (pl.blocking.length) throw new AccessError("PLAYER_NOT_ELIGIBLE", 400);
        }
        const keep = cmd.players.map((x) => x.profileId);
        await c.query("DELETE FROM match_player WHERE match_id=$1 AND organization_id=$2 AND NOT (profile_id=ANY($3::uuid[]))", [m.id, org, keep]);
        for (const x of cmd.players)
          await c.query(
            "INSERT INTO match_player(match_id,organization_id,profile_id,starter,position,jersey_number) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(match_id,profile_id) DO UPDATE SET starter=EXCLUDED.starter,position=EXCLUDED.position,jersey_number=EXCLUDED.jersey_number",
            [m.id, org, x.profileId, x.starter, x.position, x.jerseyNumber],
          );
        break;
      }
      case "publish": {
        await c.query("UPDATE match SET lineup_published_at=CASE WHEN $3 THEN now() END WHERE id=$1 AND organization_id=$2", [m.id, org, cmd.published]);
        break;
      }
      case "checklist": {
        const staff = new Set(
          (await c.query("SELECT profile_id FROM team_membership WHERE organization_id=$1 AND team_id=$2 AND NOT cancelled AND closed_at IS NULL AND (ends_on IS NULL OR ends_on>=CURRENT_DATE)", [org, m.team_id])).rows.map(
            (r) => r.profile_id as string,
          ),
        );
        let created = 0;
        for (const item of cmd.items) {
          if (item.responsibleId && !staff.has(item.responsibleId)) throw new AccessError("NOT_IN_TEAM", 400);
          const kind = item.key === "transport" ? "transport" : "equipment";
          const r = await c.query(
            `INSERT INTO funding_task(organization_id,kind,category,title,due_on,responsible_id,match_id,team_id,origin,source_key,source_kind,source_params,created_by)
             VALUES($1,$2,'sport',$3,($4::timestamptz AT TIME ZONE 'Europe/Brussels')::date,$5,$6,$7,'template',$8,$9,$10,$11)
             ON CONFLICT (organization_id,source_key) WHERE source_key IS NOT NULL DO NOTHING RETURNING id`,
            [org, kind, `${item.key} · ${about}`.slice(0, 200), m.starts_at, item.responsibleId, m.id, m.team_id, `match:${m.id}:${item.key}`, `match_${item.key}`, JSON.stringify({ about }), p.userId],
          );
          created += r.rowCount ?? 0;
        }
        out = { id: m.id, created };
        break;
      }
      case "live": {
        if (m.status === "played" && m.validated_at) throw new AccessError("INVALID_TRANSITION", 409);
        if (cmd.kind !== "goal_against") {
          if (!cmd.profileId) throw new AccessError("INVALID_INPUT", 400);
          if (!(await c.query("SELECT 1 FROM match_player WHERE match_id=$1 AND organization_id=$2 AND profile_id=$3", [m.id, org, cmd.profileId])).rowCount) throw new AccessError("NOT_IN_LINEUP", 400);
        }
        // The same event sent twice (from the offline queue) is written once.
        await c.query(
          "INSERT INTO match_live_event(organization_id,match_id,client_id,kind,profile_id,minute,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (client_id) DO NOTHING",
          [org, m.id, cmd.clientId, cmd.kind, cmd.kind === "goal_against" ? null : cmd.profileId, cmd.minute, p.userId],
        );
        const t = tally(await liveOf(c, org, m.id));
        out = { id: m.id, ours: t.ours, theirs: t.theirs };
        break;
      }
      case "undoLive": {
        const r = await c.query("UPDATE match_live_event SET cancelled_at=now() WHERE id=$1 AND match_id=$2 AND organization_id=$3 AND cancelled_at IS NULL", [cmd.eventId, m.id, org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        break;
      }
      case "validate": {
        if (m.version !== cmd.version) throw new AccessError("STALE_VERSION", 409);
        const live = await liveOf(c, org, m.id);
        const t = tally(live);
        if (t.ours > cmd.ourScore) throw new AccessError("GOALS_EXCEED_SCORE", 400);
        // The statistics follow the day's events; without any, the line-up keeps what was typed.
        if (live.some((e) => !e.cancelled_at))
          for (const row of await lineupOf(c, org, m.id)) {
            const x = t.per.get(row.profile_id) ?? { goals: 0, yellow: 0, red: false };
            await c.query("UPDATE match_player SET goals=$3,yellow_cards=$4,red_card=$5 WHERE match_id=$1 AND profile_id=$2", [m.id, row.profile_id, x.goals, x.yellow, x.red]);
          }
        await c.query("UPDATE match SET status='played',our_score=$3,their_score=$4,validated_at=now(),validated_by=$5,version=version+1 WHERE id=$1 AND organization_id=$2", [
          m.id,
          org,
          cmd.ourScore,
          cmd.theirScore,
          p.userId,
        ]);
        await proposeScore(c, org, m.id);
        // A draft for the club, proposed in Communication (never sent by itself).
        const w = words[locale];
        const scorers = [...t.per.entries()].filter(([, x]) => x.goals > 0).map(([pid, x]) => `${all.profiles.find((pp) => pp.id === pid)?.full_name ?? ""}${x.goals > 1 ? ` (${x.goals})` : ""}`);
        const subject = fill(w.result, { team: m.team, opponent: m.opponent, ours: cmd.ourScore, theirs: cmd.theirScore }).slice(0, 160);
        const draft = (
          await c.query("INSERT INTO newsletter(organization_id,subject,blocks,created_by) VALUES($1,$2,$3,$4) RETURNING id", [
            org,
            subject,
            JSON.stringify([
              { type: "heading", text: fill(w.heading, { team: m.team, opponent: m.opponent }).slice(0, 160) },
              { type: "text", text: [subject, scorers.length ? fill(w.scorers, { names: scorers.join(", ") }) : "", w.none].filter(Boolean).join("\n") },
            ]),
            p.userId,
          ])
        ).rows[0].id as string;
        out = { id: m.id, announcement: draft };
        break;
      }
    }
    await audit(c, org, p.userId, "match.journey." + cmd.action, m.id);
    return out;
  });
}

/** The match sheet's facts, for the printable PDF (managers only). */
export async function matchSheet(db: Pool, p: Principal, matchId: string) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const m = await matchOf(c, org, matchId);
    if (!v.visibleTeams.has(m.team_id) || !manageable(s, v.visibleTeams).has(m.team_id)) throw new AccessError("NOT_FOUND", 404);
    const club = (await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0].name as string;
    const locale = ((await c.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
    return { club, locale, match: m, lineup: await lineupOf(c, org, matchId), live: (await liveOf(c, org, matchId)).filter((e) => !e.cancelled_at), ...(await officialsOf(c, org, m)) };
  });
}
