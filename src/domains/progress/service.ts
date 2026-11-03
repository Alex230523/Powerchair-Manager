import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { publish } from "../notifications/queue";
import { seasonBounds, seasonOf } from "../finance/schema";
import { brusselsToday } from "../people/service";
import { figures, maxGoals, progressCommand, type Figures, type Presence, type ProgressCommand } from "./schema";
export { progressCommand };

/**
 * 31: « Mon suivi » of a player. The player and those responsible for him
 * read it; his current coaches (coach or assistant of a team he plays in)
 * write it; the presidency reads it. Never another player, never another
 * club, never a former coach. The coach's private notes are for the current
 * coaches only.
 */
type Access = "self" | "parent" | "coach" | "president";
type Scope = { c: PoolClient; org: string; userId: string; profileId: string; access: Access; own: string | null };

/** How the reader stands to the player, or null. */
async function accessTo(c: PoolClient, org: string, userId: string, role: string, profileId: string) {
  const own = ((await c.query("SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE pe.user_id=$1 AND cp.organization_id=$2 AND cp.status='active' LIMIT 1", [userId, org])).rows[0]?.id ??
    null) as string | null;
  const target = (await c.query("SELECT id FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active' AND 'player'=ANY(directory_roles)", [profileId, org])).rows[0];
  if (!target) return { access: null, own };
  if (own === profileId) return { access: "self" as const, own };
  if (own) {
    const coach = (
      await c.query(
        `SELECT 1 FROM team_membership c JOIN team_membership p ON p.team_id=c.team_id AND p.organization_id=c.organization_id JOIN team t ON t.id=c.team_id
          WHERE c.organization_id=$1 AND c.profile_id=$2 AND p.profile_id=$3 AND c.role IN ('coach','assistant') AND p.role='player'
            AND NOT c.cancelled AND c.closed_at IS NULL AND c.starts_on<=CURRENT_DATE AND (c.ends_on IS NULL OR c.ends_on>=CURRENT_DATE)
            AND NOT p.cancelled AND p.closed_at IS NULL AND p.starts_on<=CURRENT_DATE AND (p.ends_on IS NULL OR p.ends_on>=CURRENT_DATE)
            AND NOT t.archived LIMIT 1`,
        [org, own, profileId],
      )
    ).rowCount;
    if (coach) return { access: "coach" as const, own };
    const parent = (
      await c.query(
        `SELECT 1 FROM guardian_relationship g JOIN club_person s ON s.id=g.subject_profile_id
          WHERE g.organization_id=$1 AND g.guardian_profile_id=$2 AND g.subject_profile_id=$3 AND g.revoked_at IS NULL AND g.kind<>'declared' AND g.can_view
            AND (g.starts_on IS NULL OR g.starts_on<=CURRENT_DATE) AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)
            AND s.birth_date IS NOT NULL AND (g.kind<>'legal_verified' OR s.birth_date>CURRENT_DATE-interval '18 years')`,
        [org, own, profileId],
      )
    ).rowCount;
    if (parent) return { access: "parent" as const, own };
  }
  if (role === "club_president") return { access: "president" as const, own };
  return { access: null, own };
}
async function scope<T>(db: Pool, p: Principal, profileId: string, fn: (s: Scope) => Promise<T>, expected?: string) {
  z.uuid().parse(profileId);
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    const { access, own } = await accessTo(c, a.organization_id, p.userId, a.role, profileId);
    if (!access) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, profileId, access, own });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** The season's numbers: presences (trainings, matches), games played, minutes, goals, assists, cards. */
async function seasonFigures(c: PoolClient, org: string, profileId: string, from: string, to: string): Promise<Figures> {
  const rows = (
    await c.query(
      `SELECT e.starts_at AS at,EXISTS(SELECT 1 FROM match m WHERE m.calendar_event_id=e.id) AS match,i.actual,e.kind
         FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
        WHERE i.organization_id=$1 AND i.profile_id=$2 AND i.withdrawn_at IS NULL AND e.starts_at<now()
          AND (e.starts_at AT TIME ZONE 'Europe/Brussels')::date BETWEEN $3::date AND $4::date`,
      [org, profileId, from, to],
    )
  ).rows.filter((r) => r.match || r.kind === "training") as (Presence & { at: Date | string })[];
  const games = (
    await c.query(
      `SELECT count(*)::int AS played,COALESCE(sum(mp.minutes),0)::int AS minutes,COALESCE(sum(mp.goals),0)::int AS goals,COALESCE(sum(mp.assists),0)::int AS assists,
              COALESCE(sum(mp.yellow_cards),0)::int AS yellow,COALESCE(sum(CASE WHEN mp.red_card THEN 1 ELSE 0 END),0)::int AS red
         FROM match_player mp JOIN match m ON m.id=mp.match_id
        WHERE mp.organization_id=$1 AND mp.profile_id=$2 AND m.status='played' AND (m.starts_at AT TIME ZONE 'Europe/Brussels')::date BETWEEN $3::date AND $4::date`,
      [org, profileId, from, to],
    )
  ).rows[0] as { played: number; minutes: number; goals: number; assists: number; yellow: number; red: number };
  return figures(
    rows.map((r) => ({ at: new Date(r.at).toISOString(), match: r.match, actual: r.actual })),
    games,
  );
}

export type Goal = {
  id: string;
  period: string;
  category: string;
  title: string;
  detail: string;
  status: "to_work" | "progressing" | "acquired";
  state: "proposed" | "active" | "declined";
  author: string;
  created_at: string;
  acquired_at: string | null;
  version: number;
};
export type Feedback = {
  id: string;
  body: string;
  author: string;
  created_at: string;
  about: string | null;
  about_href: string | null;
  seen_at: string | null;
  reaction: string;
  reacted_at: string | null;
};

export async function progressView(db: Pool, p: Principal, profileId: string) {
  return scope(db, p, profileId, async (s) => {
    const today = brusselsToday();
    const season = seasonOf(today);
    const start = Number(season.label.slice(0, 4)) - 1;
    const previous = seasonBounds(`${start}-${String(start + 1).slice(2)}`);
    const player = (await s.c.query("SELECT id,full_name FROM club_person WHERE id=$1", [profileId])).rows[0] as { id: string; full_name: string };
    const goals = (
      await s.c.query(
        `SELECT g.id,g.period,g.category,g.title,g.detail,g.status,g.state,u.name AS author,g.created_at,g.acquired_at,g.version
           FROM player_goal g JOIN "user" u ON u.id=g.created_by WHERE g.organization_id=$1 AND g.profile_id=$2 AND g.state<>'declined'
          ORDER BY g.period DESC,g.state='proposed' DESC,g.status='acquired',g.created_at`,
        [s.org, profileId],
      )
    ).rows as Goal[];
    const feedback = (
      await s.c.query(
        `SELECT f.id,f.body,u.name AS author,f.created_at,f.seen_at,f.reaction,f.reacted_at,
                COALESCE(CASE WHEN m.id IS NOT NULL THEN m.opponent END,e.title) AS about,
                CASE WHEN m.id IS NOT NULL THEN '/matches/' || m.id WHEN e.id IS NOT NULL THEN '/calendar?event=' || e.id END AS about_href
           FROM player_feedback f JOIN "user" u ON u.id=f.author_id LEFT JOIN match m ON m.id=f.match_id LEFT JOIN calendar_event e ON e.id=f.event_id
          WHERE f.organization_id=$1 AND f.profile_id=$2 ORDER BY f.created_at DESC LIMIT 100`,
        [s.org, profileId],
      )
    ).rows as Feedback[];
    const coach = s.access === "coach";
    // The private notes never leave this branch for anyone but the current coaches.
    const notes = coach
      ? ((
          await s.c.query(
            'SELECT n.id,n.body,u.name AS author,n.created_at,n.author_id=$3 AS mine FROM player_coach_note n JOIN "user" u ON u.id=n.author_id WHERE n.organization_id=$1 AND n.profile_id=$2 ORDER BY n.created_at DESC LIMIT 100',
            [s.org, profileId, s.userId],
          )
        ).rows as { id: string; body: string; author: string; created_at: string; mine: boolean }[])
      : null;
    // For a feedback « about » a session: the player's recent trainings and matches.
    const sessions = coach
      ? ((
          await s.c.query(
            `SELECT e.id,e.title,e.starts_at,(SELECT m.id FROM match m WHERE m.calendar_event_id=e.id LIMIT 1) AS match_id
               FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id
              WHERE i.organization_id=$1 AND i.profile_id=$2 AND i.withdrawn_at IS NULL AND e.starts_at BETWEEN now()-interval '60 days' AND now()+interval '1 day'
              ORDER BY e.starts_at DESC LIMIT 30`,
            [s.org, profileId],
          )
        ).rows as { id: string; title: string; starts_at: string; match_id: string | null }[])
      : [];
    return {
      organization_id: s.org,
      access: s.access,
      can: {
        write: coach,
        propose: s.access === "self" || s.access === "parent",
        react: s.access === "self" || s.access === "parent",
      },
      player,
      period: season.label,
      season: { label: season.label, previous: previous.label, now: await seasonFigures(s.c, s.org, profileId, season.from, season.to), before: await seasonFigures(s.c, s.org, profileId, previous.from, previous.to) },
      goals,
      maxGoals,
      feedback,
      notes,
      sessions,
    };
  });
}

/** Tells the player (or, without an account, those responsible for him) that a feedback is waiting. */
async function tellFeedback(c: PoolClient, org: string, profileId: string, feedbackId: string) {
  const users = (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id AND u.active WHERE cp.id=$1
       UNION
       SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id
         JOIN "user" u ON u.id=pe.user_id AND u.active
        WHERE g.subject_profile_id=$1 AND g.organization_id=$2 AND g.revoked_at IS NULL AND g.can_view AND g.kind<>'declared'
          AND NOT EXISTS(SELECT 1 FROM club_person cp JOIN person p2 ON p2.id=cp.person_id JOIN "user" u2 ON u2.id=p2.user_id AND u2.active WHERE cp.id=$1)`,
      [profileId, org],
    )
  ).rows as { id: string; email: string; name: string; locale: string }[];
  const club = (await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0]?.name as string;
  const words = {
    fr: { title: "Nouveau retour de votre coach", message: "Un retour vous attend dans « Mon suivi »." },
    nl: { title: "Nieuwe feedback van uw coach", message: "Er wacht feedback op u in « Mijn opvolging »." },
    en: { title: "New feedback from your coach", message: "Feedback is waiting for you in « My progress »." },
  };
  for (const u of users) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "sport",
      resourceType: "automation",
      resourceId: `feedback:${feedbackId}`,
      eventKey: `feedback:${feedbackId}:${u.id}`,
      locale,
      variables: { name: u.name, title: words[locale].title, message: words[locale].message, organization: club, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/players/${profileId}?tab=progress` },
    });
  }
  return users.length;
}

export async function progressExecute(db: Pool, p: Principal, command: ProgressCommand, expected?: string) {
  // Commands about one item find its player first; the rights come from that player.
  const pool = await db.connect();
  let profileId: string;
  try {
    if ("profileId" in command) profileId = command.profileId;
    else {
      const table = command.action.startsWith("goal") ? "player_goal" : command.action.startsWith("feedback") ? "player_feedback" : "player_coach_note";
      const row = (await pool.query(`SELECT profile_id FROM ${table} WHERE id=$1`, [command.id])).rows[0];
      if (!row) throw new AccessError("NOT_FOUND", 404);
      profileId = row.profile_id;
    }
  } finally {
    pool.release();
  }
  return scope(
    db,
    p,
    profileId,
    async (s) => {
      const coach = s.access === "coach",
        family = s.access === "self" || s.access === "parent";
      const goalOf = async (id: string) => {
        const g = (await s.c.query("SELECT * FROM player_goal WHERE id=$1 AND organization_id=$2 AND profile_id=$3 FOR UPDATE", [id, s.org, s.profileId])).rows[0];
        if (!g) throw new AccessError("NOT_FOUND", 404);
        return g;
      };
      const count = async (period: string) =>
        Number((await s.c.query("SELECT count(*)::int AS n FROM player_goal WHERE organization_id=$1 AND profile_id=$2 AND period=$3 AND state<>'declined'", [s.org, s.profileId, period])).rows[0].n);
      const season = seasonOf(brusselsToday()).label;
      switch (command.action) {
        case "goalCreate":
        case "goalPropose": {
          if (command.action === "goalCreate" ? !coach : !family) throw new AccessError("FORBIDDEN");
          const period = (command.action === "goalCreate" ? command.period : undefined) ?? season;
          if ((await count(period)) >= maxGoals) throw new AccessError("TOO_MANY_GOALS", 409);
          const id = (
            await s.c.query(
              "INSERT INTO player_goal(organization_id,profile_id,period,category,title,detail,state,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
              [s.org, s.profileId, period, command.category, command.title, command.detail, command.action === "goalCreate" ? "active" : "proposed", s.userId],
            )
          ).rows[0].id as string;
          await audit(s.c, s.org, s.userId, command.action === "goalCreate" ? "progress.goal_created" : "progress.goal_proposed", id);
          return { ok: true as const, id };
        }
        case "goalEdit": {
          if (!coach) throw new AccessError("FORBIDDEN");
          await goalOf(command.id);
          const r = await s.c.query("UPDATE player_goal SET category=$2,title=$3,detail=$4,version=version+1,updated_at=now() WHERE id=$1 AND version=$5", [
            command.id,
            command.category,
            command.title,
            command.detail,
            command.version,
          ]);
          if (!r.rowCount) throw new AccessError("STALE_VERSION", 409);
          return { ok: true as const, id: command.id };
        }
        case "goalStatus": {
          if (!coach) throw new AccessError("FORBIDDEN");
          const g = await goalOf(command.id);
          if (g.state !== "active") throw new AccessError("NOT_FOUND", 404);
          await s.c.query(
            "UPDATE player_goal SET status=$2,acquired_at=CASE WHEN $2='acquired' THEN COALESCE(acquired_at,now()) ELSE NULL END,version=version+1,updated_at=now() WHERE id=$1",
            [command.id, command.status],
          );
          await audit(s.c, s.org, s.userId, "progress.goal_status", command.id, { status: command.status });
          return { ok: true as const, id: command.id };
        }
        case "goalDecide": {
          if (!coach) throw new AccessError("FORBIDDEN");
          const g = await goalOf(command.id);
          if (g.state !== "proposed") throw new AccessError("NOT_FOUND", 404);
          await s.c.query("UPDATE player_goal SET state=$2,version=version+1,updated_at=now() WHERE id=$1", [command.id, command.accept ? "active" : "declined"]);
          return { ok: true as const, id: command.id };
        }
        case "goalDelete": {
          const g = await goalOf(command.id);
          // The coach deletes any; the family only a proposal still waiting.
          if (!coach && !(family && g.state === "proposed")) throw new AccessError("FORBIDDEN");
          await s.c.query("DELETE FROM player_goal WHERE id=$1", [command.id]);
          return { ok: true as const, id: command.id };
        }
        case "feedbackCreate": {
          if (!coach) throw new AccessError("FORBIDDEN");
          if (command.eventId && !(await s.c.query("SELECT 1 FROM calendar_event WHERE id=$1 AND organization_id=$2", [command.eventId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          if (command.matchId && !(await s.c.query("SELECT 1 FROM match WHERE id=$1 AND organization_id=$2", [command.matchId, s.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
          const id = (
            await s.c.query("INSERT INTO player_feedback(organization_id,profile_id,author_id,body,event_id,match_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
              s.org,
              s.profileId,
              s.userId,
              command.body,
              command.matchId ? null : command.eventId,
              command.matchId,
            ])
          ).rows[0].id as string;
          const told = await tellFeedback(s.c, s.org, s.profileId, id);
          await audit(s.c, s.org, s.userId, "progress.feedback", id);
          return { ok: true as const, id, told };
        }
        case "feedbackDelete": {
          if (!coach) throw new AccessError("FORBIDDEN");
          const r = await s.c.query("DELETE FROM player_feedback WHERE id=$1 AND organization_id=$2 AND profile_id=$3 AND author_id=$4", [command.id, s.org, s.profileId, s.userId]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { ok: true as const, id: command.id };
        }
        case "feedbackSeen":
        case "feedbackReact": {
          if (!family) throw new AccessError("FORBIDDEN");
          const r =
            command.action === "feedbackSeen"
              ? await s.c.query("UPDATE player_feedback SET seen_at=COALESCE(seen_at,now()) WHERE id=$1 AND organization_id=$2 AND profile_id=$3", [command.id, s.org, s.profileId])
              : await s.c.query("UPDATE player_feedback SET reaction=$4,reacted_at=now(),reacted_by=$5,seen_at=COALESCE(seen_at,now()) WHERE id=$1 AND organization_id=$2 AND profile_id=$3", [
                  command.id,
                  s.org,
                  s.profileId,
                  command.reaction,
                  s.userId,
                ]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { ok: true as const, id: command.id };
        }
        case "noteCreate": {
          if (!coach) throw new AccessError("FORBIDDEN");
          const id = (await s.c.query("INSERT INTO player_coach_note(organization_id,profile_id,author_id,body) VALUES($1,$2,$3,$4) RETURNING id", [s.org, s.profileId, s.userId, command.body])).rows[0]
            .id as string;
          return { ok: true as const, id };
        }
        case "noteDelete": {
          if (!coach) throw new AccessError("FORBIDDEN");
          const r = await s.c.query("DELETE FROM player_coach_note WHERE id=$1 AND organization_id=$2 AND profile_id=$3 AND author_id=$4", [command.id, s.org, s.profileId, s.userId]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { ok: true as const, id: command.id };
        }
      }
    },
    expected,
  );
}
