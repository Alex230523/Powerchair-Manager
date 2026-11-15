import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { fedCan } from "../access/policy";
import { publish } from "../notifications/queue";
import { unseal } from "../notifications/crypto";
import { contactsFor } from "../communication/service";
import { brusselsToday } from "../people/service";
import { seasonOf } from "../finance/schema";
import { logSensitiveAccess } from "../club/governance";
import { answerCommand, nationalCommand, pf2Allowed, type AnswerCommand, type NationalCommand } from "./schema";
export { answerCommand, nationalCommand };

/**
 * 6: the federation's national teams. Its presidency (and a delegate with
 * the competitions competence) builds them from the licensed players of its
 * clubs, sporting data only. Each status change is told to the player (or
 * the parents of a minor), to the club's president and to the player's
 * coaches; the player answers. Care instructions reach the national staff
 * only with a separate, revocable consent, during its period.
 */
type Fed = { c: PoolClient; fed: string; userId: string };
async function federation<T>(db: Pool, p: Principal, fn: (s: Fed) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    await account(c, p);
    if (!fedCan(a.role, a.grants, "federation.competitions")) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, fed: a.organization_id, userId: p.userId });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const teamOf = async (s: Fed, id: string) => {
  const t = (await s.c.query("SELECT * FROM national_team WHERE id=$1 AND federation_id=$2", [id, s.fed])).rows[0];
  if (!t) throw new AccessError("NOT_FOUND", 404);
  return t as { id: string; organization_id: string; name: string; season: string; max_pf2: number | null };
};
/** The licensed players of the federation's clubs, sporting data only. */
async function candidates(c: PoolClient, fed: string, season: string) {
  return (
    await c.query(
      `SELECT cp.id,cp.full_name,o.id AS club_id,o.name AS club,COALESCE(sp.classification,'not_classified') AS classification,EXTRACT(YEAR FROM cp.birth_date)::int AS birth_year,cp.birth_date::text AS birth_date,
              EXISTS(SELECT 1 FROM license l WHERE l.profile_id=cp.id AND l.federation_id=$1 AND l.season=$2 AND l.status='active') AS licensed
         FROM club_person cp JOIN organization o ON o.id=cp.organization_id AND o.kind='club' AND o.federation_id=$1
         LEFT JOIN player_sport_profile sp ON sp.profile_id=cp.id
        WHERE cp.status='active' AND 'player'=ANY(cp.directory_roles)
        ORDER BY cp.full_name LIMIT 2000`,
      [fed, season],
    )
  ).rows as { id: string; full_name: string; club_id: string; club: string; classification: string; birth_year: number | null; birth_date: string | null; licensed: boolean }[];
}

export async function nationalView(db: Pool, p: Principal) {
  return federation(db, p, async (s) => {
    const season = seasonOf(brusselsToday()).label;
    const teams = (await s.c.query("SELECT id,organization_id,name,category,season,color,max_pf2,archived FROM national_team WHERE federation_id=$1 ORDER BY archived,season DESC,name", [s.fed])).rows;
    const out = [];
    for (const t of teams) {
      const staff = (
        await s.c.query(
          `SELECT st.id,st.role,st.name,
                  COALESCE((SELECT json_agg(c.title ORDER BY r.completed_on DESC) FROM training_request r JOIN training_course c ON c.id=r.course_id WHERE r.profile_id=st.profile_id AND r.completed_on IS NOT NULL),'[]') AS trainings
             FROM national_team_staff st WHERE st.team_id=$1 ORDER BY st.role,st.name`,
          [t.id],
        )
      ).rows;
      const players = (
        await s.c.query(
          `SELECT ns.id,ns.profile_id,cp.full_name,o.name AS club,ns.status,ns.availability,ns.availability_note,COALESCE(sp.classification,'not_classified') AS classification,ns.version
             FROM national_selection ns JOIN club_person cp ON cp.id=ns.profile_id JOIN organization o ON o.id=ns.club_id LEFT JOIN player_sport_profile sp ON sp.profile_id=ns.profile_id
            WHERE ns.team_id=$1 ORDER BY ns.status='withdrawn',ns.status,cp.full_name`,
          [t.id],
        )
      ).rows;
      const gatherings = (await s.c.query("SELECT id,kind,title,starts_at,ends_at,place FROM national_gathering WHERE team_id=$1 ORDER BY starts_at DESC LIMIT 50", [t.id])).rows;
      out.push({ ...t, staff, players, gatherings });
    }
    const coaches = (
      await s.c.query(
        `SELECT DISTINCT cp.id,cp.full_name,o.name AS club FROM club_person cp JOIN organization o ON o.id=cp.organization_id AND o.kind='club' AND o.federation_id=$1
          WHERE cp.status='active' AND 'coach'=ANY(cp.directory_roles) ORDER BY cp.full_name LIMIT 500`,
        [s.fed],
      )
    ).rows;
    const accounts = (
      await s.c.query('SELECT DISTINCT u.id,u.name FROM role_assignment r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.revoked_at IS NULL ORDER BY u.name', [s.fed])
    ).rows;
    const tournaments = (await s.c.query("SELECT id,name FROM tournament WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 50", [s.fed])).rows;
    return { federation_id: s.fed, season, teams: out, candidates: await candidates(s.c, s.fed, season), coaches, accounts, tournaments };
  });
}

/** Who to tell about a player: the player or the parents (minor), the club's president and the player's coaches. */
async function tellAboutSelection(c: PoolClient, sel: { id: string; profile_id: string; club_id: string; status: string }, team: { name: string }) {
  const words = {
    fr: { title: `Sélection nationale : ${team.name}`, message: "Le statut d'un joueur du club en équipe nationale a changé. Le joueur (ou son parent) indique sa disponibilité depuis sa fiche." },
    nl: { title: `Nationale selectie: ${team.name}`, message: "De status van een speler van de club in de nationale ploeg is gewijzigd. De speler (of zijn ouder) geeft zijn beschikbaarheid aan via zijn fiche." },
    en: { title: `National selection: ${team.name}`, message: "The status of a club player in the national team changed. The player (or a parent) gives their availability from the player's sheet." },
  };
  const family = await contactsFor(c, sel.club_id, [sel.profile_id]);
  const club = (
    await c.query(
      `SELECT DISTINCT u.id AS "userId",u.email,u.name,COALESCE(pe.locale,'fr') AS locale FROM role_assignment r JOIN "user" u ON u.id=r.user_id AND u.active LEFT JOIN person pe ON pe.user_id=u.id
        WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())
       UNION
       SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') FROM team_membership p JOIN team_membership m ON m.team_id=p.team_id AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL
         JOIN club_person cp ON cp.id=m.profile_id JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id AND u.active
        WHERE p.profile_id=$2 AND p.role='player' AND NOT p.cancelled AND p.closed_at IS NULL`,
      [sel.club_id, sel.profile_id],
    )
  ).rows as { userId: string; email: string; name: string; locale: string }[];
  const name = (await c.query("SELECT name FROM organization WHERE id=$1", [sel.club_id])).rows[0]?.name as string;
  const seen = new Set<string>();
  let n = 0;
  for (const to of [...family, ...club]) {
    if (seen.has(to.email.toLowerCase())) continue;
    seen.add(to.email.toLowerCase());
    const locale: Locale = isLocale(to.locale) ? to.locale : "fr";
    await publish(c, {
      organizationId: sel.club_id,
      userId: to.userId,
      email: to.email,
      kind: "automation",
      category: "sport",
      resourceType: "automation",
      resourceId: `national:${sel.id}`,
      eventKey: `national:${sel.id}:${sel.status}:${to.email.toLowerCase()}`,
      locale,
      variables: { name: to.name, title: words[locale].title, message: words[locale].message, organization: name, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/players/${sel.profile_id}` },
    });
    n++;
  }
  return n;
}

export async function nationalExecute(db: Pool, p: Principal, command: NationalCommand, expected?: string) {
  return federation(
    db,
    p,
    async (s) => {
      switch (command.action) {
        case "team": {
          if (command.id) {
            const t = await teamOf(s, command.id);
            await s.c.query("UPDATE national_team SET name=$2,category=$3,season=$4,color=$5,max_pf2=$6 WHERE id=$1", [t.id, command.name, command.category, command.season, command.color, command.maxPf2]);
            await s.c.query("UPDATE organization SET name=$2 WHERE id=$1", [t.organization_id, command.name]);
            return { ok: true as const, id: t.id };
          }
          // The team takes part in tournaments as a guest participant of its own.
          const org = (await s.c.query("INSERT INTO organization(name,kind) VALUES($1,'guest') RETURNING id", [command.name])).rows[0].id;
          const id = (
            await s.c.query("INSERT INTO national_team(federation_id,organization_id,name,category,season,color,max_pf2,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [
              s.fed,
              org,
              command.name,
              command.category,
              command.season,
              command.color,
              command.maxPf2,
              s.userId,
            ])
          ).rows[0].id as string;
          await audit(s.c, s.fed, s.userId, "national.team_created", id);
          return { ok: true as const, id };
        }
        case "staffAdd": {
          const t = await teamOf(s, command.teamId);
          let name: string | undefined;
          if (command.profileId)
            name = (
              await s.c.query("SELECT cp.full_name FROM club_person cp JOIN organization o ON o.id=cp.organization_id AND o.federation_id=$2 WHERE cp.id=$1 AND cp.status='active'", [command.profileId, s.fed])
            ).rows[0]?.full_name;
          else if (command.userId)
            name = (await s.c.query('SELECT u.name FROM "user" u JOIN role_assignment r ON r.user_id=u.id AND r.organization_id=$2 WHERE u.id=$1 LIMIT 1', [command.userId, s.fed])).rows[0]?.name;
          if (!name) throw new AccessError("NOT_FOUND", 404);
          const id = (
            await s.c.query("INSERT INTO national_team_staff(team_id,role,user_id,profile_id,name) VALUES($1,$2,$3,$4,$5) RETURNING id", [t.id, command.role, command.userId ?? null, command.profileId ?? null, name])
          ).rows[0].id as string;
          return { ok: true as const, id };
        }
        case "staffRemove": {
          const r = await s.c.query("DELETE FROM national_team_staff st USING national_team t WHERE st.id=$1 AND t.id=st.team_id AND t.federation_id=$2", [command.id, s.fed]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { ok: true as const, id: command.id };
        }
        case "select": {
          const t = await teamOf(s, command.teamId);
          // A player of a club of this federation only, licensed for the season.
          const player = (await candidates(s.c, s.fed, t.season)).find((x) => x.id === command.profileId);
          if (!player) throw new AccessError("NOT_FOUND", 404);
          if (!player.licensed && command.status !== "withdrawn") throw new AccessError("LICENCE_REQUIRED", 409);
          if (command.status === "selected") {
            const chosen = (
              await s.c.query(
                "SELECT COALESCE(sp.classification,'not_classified') AS classification FROM national_selection ns LEFT JOIN player_sport_profile sp ON sp.profile_id=ns.profile_id WHERE ns.team_id=$1 AND ns.status='selected' AND ns.profile_id<>$2",
                [t.id, command.profileId],
              )
            ).rows as { classification: string }[];
            if (!pf2Allowed([...chosen, { classification: player.classification }], t.max_pf2).ok) throw new AccessError("PF2_LIMIT", 409);
          }
          const sel = (
            await s.c.query(
              `INSERT INTO national_selection(team_id,profile_id,club_id,status,created_by) VALUES($1,$2,$3,$4,$5)
               ON CONFLICT (team_id,profile_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now(),version=national_selection.version+1
               RETURNING id,profile_id,club_id,status,(xmax=0) AS created`,
              [t.id, command.profileId, player.club_id, command.status, s.userId],
            )
          ).rows[0];
          const told = await tellAboutSelection(s.c, sel, t);
          await audit(s.c, s.fed, s.userId, "national.selection", sel.id, { status: command.status });
          return { ok: true as const, id: sel.id as string, told };
        }
        case "gathering": {
          const t = await teamOf(s, command.teamId);
          const id = (
            await s.c.query("INSERT INTO national_gathering(team_id,kind,title,starts_at,ends_at,place,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              t.id,
              command.kind,
              command.title,
              command.startsAt,
              command.endsAt,
              command.place,
              s.userId,
            ])
          ).rows[0].id as string;
          // Those selected (and the reserves) are expected; they answer from the player's sheet.
          await s.c.query("INSERT INTO national_gathering_answer(gathering_id,selection_id) SELECT $1,id FROM national_selection WHERE team_id=$2 AND status IN ('selected','reserve')", [id, t.id]);
          return { ok: true as const, id };
        }
        case "enterTournament":
        case "guestTeam": {
          const tour = (await s.c.query("SELECT id FROM tournament WHERE id=$1 AND organization_id=$2", [command.tournamentId, s.fed])).rows[0];
          if (!tour) throw new AccessError("NOT_FOUND", 404);
          let org: string, name: string;
          if (command.action === "enterTournament") {
            const t = await teamOf(s, command.teamId);
            org = t.organization_id;
            name = t.name;
          } else {
            // A foreign team in free text: a guest participant, nothing more.
            name = command.name;
            org = (await s.c.query("INSERT INTO organization(name,kind) VALUES($1,'guest') RETURNING id", [command.name])).rows[0].id;
          }
          await s.c.query(
            "INSERT INTO tournament_club(tournament_id,organization_id,team_name,status,responded_at,responded_by) VALUES($1,$2,$3,'accepted',now(),$4) ON CONFLICT (tournament_id,organization_id) DO NOTHING",
            [tour.id, org, name, s.userId],
          );
          return { ok: true as const, id: org };
        }
        case "lineup": {
          const t = await teamOf(s, command.teamId);
          const m = (await s.c.query("SELECT m.id FROM tournament_match m JOIN tournament tt ON tt.id=m.tournament_id WHERE m.id=$1 AND tt.organization_id=$2 AND $3 IN (m.home_organization_id,m.away_organization_id)", [command.matchId, s.fed, t.organization_id])).rows[0];
          if (!m) throw new AccessError("NOT_FOUND", 404);
          await s.c.query("DELETE FROM national_match_player WHERE match_id=$1 AND team_id=$2", [m.id, t.id]);
          for (const x of command.players) {
            if (!(await s.c.query("SELECT 1 FROM national_selection WHERE id=$1 AND team_id=$2 AND status<>'withdrawn'", [x.selectionId, t.id])).rowCount) throw new AccessError("NOT_FOUND", 404);
            await s.c.query("INSERT INTO national_match_player(match_id,team_id,selection_id,starter,goals,assists) VALUES($1,$2,$3,$4,$5,$6)", [m.id, t.id, x.selectionId, x.starter, x.goals, x.assists]);
          }
          return { ok: true as const, id: m.id as string };
        }
        case "award": {
          const t = await teamOf(s, command.teamId);
          const id = (
            await s.c.query(
              "INSERT INTO award(organization_id,awarded_on,title,competition,kind,place,national_team_id,created_by,publishable) VALUES($1,$2,$3,$4,'team',$5,$6,$7,true) RETURNING id",
              [s.fed, command.awardedOn, command.title, command.competition, command.place, t.id, s.userId],
            )
          ).rows[0].id as string;
          return { ok: true as const, id };
        }
      }
    },
    expected,
  );
}

/* ------------------------------------------------------------ The player's side */
type Side = { c: PoolClient; org: string; userId: string; profiles: string[]; staff: boolean };
/** In a club: the player himself, the parents of a minor, or the club's staff (sporting data only). */
async function clubSide<T>(db: Pool, p: Principal, fn: (s: Side) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    await account(c, p);
    const own = (
      await c.query(
        `SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE pe.user_id=$1 AND cp.organization_id=$2
         UNION SELECT g.subject_profile_id FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id
          WHERE pe.user_id=$1 AND g.organization_id=$2 AND g.revoked_at IS NULL AND g.can_view AND g.kind<>'declared'`,
        [p.userId, a.organization_id],
      )
    ).rows.map((r) => r.id as string);
    const out = await fn({ c, org: a.organization_id, userId: p.userId, profiles: own, staff: a.role !== "player" && a.role !== "guardian" });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
/** « Sélection nationale » on a player's sheet: teams, status, gatherings, caps and goals, honours. */
export async function playerNational(db: Pool, p: Principal, profileId: string) {
  z.uuid().parse(profileId);
  return clubSide(db, p, async (s) => {
    if (!s.staff && !s.profiles.includes(profileId)) throw new AccessError("FORBIDDEN");
    const mine = s.profiles.includes(profileId);
    const selections = (
      await s.c.query(
        `SELECT ns.id,t.name AS team,t.season,t.category,ns.status,ns.availability,ns.availability_note,
                (SELECT count(DISTINCT mp.match_id)::int FROM national_match_player mp WHERE mp.selection_id=ns.id) AS caps,
                (SELECT COALESCE(sum(mp.goals),0)::int FROM national_match_player mp WHERE mp.selection_id=ns.id) AS goals,
                COALESCE((SELECT json_agg(json_build_object('id',g.id,'title',g.title,'kind',g.kind,'starts_at',g.starts_at,'place',g.place,'response',a.response) ORDER BY g.starts_at)
                   FROM national_gathering g JOIN national_gathering_answer a ON a.gathering_id=g.id AND a.selection_id=ns.id WHERE g.ends_at>now()-interval '30 days'),'[]') AS gatherings,
                COALESCE((SELECT json_agg(json_build_object('title',w.title,'competition',w.competition,'place',w.place,'awarded_on',w.awarded_on)) FROM award w WHERE w.national_team_id=t.id),'[]') AS honours,
                (SELECT json_build_object('id',k.id,'starts_on',k.starts_on,'ends_on',k.ends_on) FROM national_care_consent k WHERE k.selection_id=ns.id AND k.revoked_at IS NULL AND k.ends_on>=CURRENT_DATE ORDER BY k.created_at DESC LIMIT 1) AS consent
           FROM national_selection ns JOIN national_team t ON t.id=ns.team_id WHERE ns.profile_id=$1 AND ns.club_id=$2 AND ns.status<>'withdrawn' ORDER BY t.season DESC,t.name`,
        [profileId, s.org],
      )
    ).rows;
    return { organization_id: s.org, can: { answer: mine }, selections };
  });
}
export async function answerExecute(db: Pool, p: Principal, command: AnswerCommand) {
  return clubSide(db, p, async (s) => {
    const sel = async (id: string) => {
      const r = (await s.c.query("SELECT id,profile_id FROM national_selection WHERE id=$1 AND club_id=$2", [id, s.org])).rows[0];
      // Only the player or the parents answer; never the club for them.
      if (!r || !s.profiles.includes(r.profile_id)) throw new AccessError("NOT_FOUND", 404);
      return r as { id: string; profile_id: string };
    };
    if (command.action === "availability") {
      await sel(command.selectionId);
      await s.c.query("UPDATE national_selection SET availability=$2,availability_note=$3,answered_by=$4,answered_at=now(),version=version+1 WHERE id=$1", [
        command.selectionId,
        command.availability,
        command.note,
        s.userId,
      ]);
      return { ok: true as const };
    }
    if (command.action === "consent") {
      await sel(command.selectionId);
      if (command.endsOn < command.startsOn) throw new AccessError("INVALID_INPUT", 400);
      const id = (await s.c.query("INSERT INTO national_care_consent(selection_id,granted_by,starts_on,ends_on) VALUES($1,$2,$3,$4) RETURNING id", [command.selectionId, s.userId, command.startsOn, command.endsOn])).rows[0].id;
      await audit(s.c, s.org, s.userId, "national.care_consent", id);
      return { ok: true as const, id: id as string };
    }
    if (command.action === "revoke") {
      const k = (await s.c.query("SELECT k.id,ns.profile_id FROM national_care_consent k JOIN national_selection ns ON ns.id=k.selection_id WHERE k.id=$1 AND ns.club_id=$2", [command.consentId, s.org])).rows[0];
      if (!k || !s.profiles.includes(k.profile_id)) throw new AccessError("NOT_FOUND", 404);
      await s.c.query("UPDATE national_care_consent SET revoked_at=now() WHERE id=$1", [k.id]);
      await audit(s.c, s.org, s.userId, "national.care_revoked", k.id);
      return { ok: true as const };
    }
    await sel(command.selectionId);
    const r = await s.c.query("UPDATE national_gathering_answer SET response=$3,responded_by=$4,responded_at=now() WHERE gathering_id=$1 AND selection_id=$2", [
      command.gatheringId,
      command.selectionId,
      command.response,
      s.userId,
    ]);
    if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
    return { ok: true as const };
  });
}

/** 13/11/2026: who, among the staff, reads the care instructions (the mechanic does not). */
export const careRoles = ["head_coach", "assistant", "physio", "companion"] as const;
/** The staff lines of the account: by its own account, or by its club sheet. */
const staffOf = `SELECT st.team_id,st.role FROM national_team_staff st LEFT JOIN club_person cp ON cp.id=st.profile_id LEFT JOIN person pe ON pe.id=cp.person_id
                  WHERE st.user_id=$1 OR pe.user_id=$1`;

/** 13/11/2026: does the account sit on the staff of a national team still in use (the menu shows « Sélection nationale »)? */
export async function isNationalStaff(c: Pool | PoolClient, userId: string) {
  return !!(await c.query(`SELECT 1 FROM (${staffOf}) s JOIN national_team t ON t.id=s.team_id WHERE NOT t.archived LIMIT 1`, [userId])).rowCount;
}

/**
 * 13/11/2026: « Sélection nationale », the national staff's own page (the
 * coach, the assistant, the physio, the mechanic, the companion). Read only:
 * the teams they are on, the others of the staff, the players (sporting data,
 * their answer, whether care instructions are shared), the gatherings with
 * who comes. The care instructions themselves load on demand (nationalCare),
 * journaled in the player's club.
 */
export async function nationalStaffView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    await account(c, p);
    const mine = (await c.query(`SELECT team_id,array_agg(DISTINCT role) AS roles FROM (${staffOf}) s GROUP BY team_id`, [p.userId])).rows as { team_id: string; roles: string[] }[];
    if (!mine.length) return { teams: [] };
    const teams = (
      await c.query("SELECT t.id,t.name,t.category,t.season,t.color,o.name AS federation FROM national_team t JOIN organization o ON o.id=t.federation_id WHERE t.id=ANY($1::uuid[]) AND NOT t.archived ORDER BY t.season DESC,t.name", [mine.map((m) => m.team_id)])
    ).rows;
    const out = [];
    for (const t of teams) {
      const roles = mine.find((m) => m.team_id === t.id)!.roles;
      const staff = (await c.query("SELECT id,role,name FROM national_team_staff WHERE team_id=$1 ORDER BY role,name", [t.id])).rows;
      const players = (
        await c.query(
          `SELECT ns.id,cp.full_name,o.name AS club,ns.status,ns.availability,ns.availability_note,COALESCE(sp.classification,'not_classified') AS classification,
                  EXISTS(SELECT 1 FROM national_care_consent k WHERE k.selection_id=ns.id AND k.revoked_at IS NULL AND CURRENT_DATE BETWEEN k.starts_on AND k.ends_on) AS care_shared
             FROM national_selection ns JOIN club_person cp ON cp.id=ns.profile_id JOIN organization o ON o.id=ns.club_id LEFT JOIN player_sport_profile sp ON sp.profile_id=ns.profile_id
            WHERE ns.team_id=$1 AND ns.status<>'withdrawn' ORDER BY ns.status,cp.full_name`,
          [t.id],
        )
      ).rows;
      const gatherings = (
        await c.query(
          `SELECT g.id,g.kind,g.title,g.starts_at,g.ends_at,g.place,
                  COALESCE((SELECT json_agg(json_build_object('name',cp.full_name,'response',COALESCE(a.response,'none')) ORDER BY cp.full_name)
                              FROM national_selection ns JOIN club_person cp ON cp.id=ns.profile_id
                              LEFT JOIN national_gathering_answer a ON a.gathering_id=g.id AND a.selection_id=ns.id
                             WHERE ns.team_id=g.team_id AND ns.status IN ('selected','reserve','preselected') AND a.gathering_id IS NOT NULL),'[]') AS answers
             FROM national_gathering g WHERE g.team_id=$1 AND g.ends_at>now()-interval '30 days' ORDER BY g.starts_at LIMIT 20`,
          [t.id],
        )
      ).rows;
      out.push({ ...t, roles, readsCare: roles.some((r) => (careRoles as readonly string[]).includes(r)), staff, players, gatherings });
    }
    return { teams: out };
  } finally {
    c.release();
  }
}

/**
 * For the national staff: the care instructions of the players who consented,
 * for the period only. 13/11/2026: each reading is journaled in the player's
 * club (« Accès aux données sensibles »), like a trip's care book.
 */
export async function nationalCare(db: Pool, p: Principal, teamId: string) {
  z.uuid().parse(teamId);
  const c = await db.connect();
  try {
    await account(c, p);
    const staff = (await c.query(`SELECT 1 FROM (${staffOf}) s JOIN national_team t ON t.id=s.team_id WHERE s.team_id=$2 AND s.role=ANY($3::text[]) AND NOT t.archived`, [p.userId, teamId, careRoles])).rowCount;
    if (!staff) throw new AccessError("FORBIDDEN");
    const rows = (
      await c.query(
        `SELECT ns.profile_id,ns.club_id,cp.full_name,ci.id,ci.moment,ci.time,ci.ciphertext,k.starts_on::text AS shared_from,k.ends_on::text AS shared_until
           FROM national_selection ns JOIN club_person cp ON cp.id=ns.profile_id
           JOIN national_care_consent k ON k.selection_id=ns.id AND k.revoked_at IS NULL AND CURRENT_DATE BETWEEN k.starts_on AND k.ends_on
           JOIN care_instruction ci ON ci.profile_id=ns.profile_id AND ci.active
          WHERE ns.team_id=$1 AND ns.status<>'withdrawn' ORDER BY cp.full_name,ci.time NULLS LAST`,
        [teamId],
      )
    ).rows;
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.profile_id)) continue;
      seen.add(r.profile_id);
      await logSensitiveAccess(c, r.club_id, p.userId, r.profile_id, "national_care", teamId);
    }
    return rows.map(({ ciphertext, club_id: _club, ...r }) => ({ ...r, ...unseal<{ title: string; details: string }>(ciphertext, "care:" + r.id) }));
  } finally {
    c.release();
  }
}

/** The gatherings of the national teams where players of this club are expected, read only (the club's calendar). */
export async function nationalEventsFor(c: PoolClient, org: string, profiles: string[] | null) {
  return (
    await c.query(
      `SELECT g.id,g.kind,g.title,g.starts_at,g.ends_at,g.place,t.name AS team,array_agg(DISTINCT cp.full_name) AS players
         FROM national_gathering g JOIN national_team t ON t.id=g.team_id JOIN national_gathering_answer a ON a.gathering_id=g.id
         JOIN national_selection ns ON ns.id=a.selection_id AND ns.club_id=$1 AND ns.status<>'withdrawn' JOIN club_person cp ON cp.id=ns.profile_id
        WHERE g.ends_at>now()-interval '7 days' AND ($2::uuid[] IS NULL OR ns.profile_id=ANY($2::uuid[]))
        GROUP BY g.id,t.name ORDER BY g.starts_at LIMIT 50`,
      [org, profiles],
    )
  ).rows as { id: string; kind: string; title: string; starts_at: string; ends_at: string; place: string; team: string; players: string[] }[];
}
/** For the club's activity report: how many of its players are in a national team this season. */
export async function nationalCount(c: PoolClient | Pool, org: string, season: string) {
  return Number(
    (await c.query("SELECT count(DISTINCT ns.profile_id)::int AS n FROM national_selection ns JOIN national_team t ON t.id=ns.team_id WHERE ns.club_id=$1 AND t.season=$2 AND ns.status IN ('selected','reserve')", [org, season])).rows[0].n,
  );
}
