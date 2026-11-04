import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { brusselsToday } from "../people/service";
import { publish } from "../notifications/queue";
import {
  classificationCommand,
  outcome,
  publishable,
  registrationOpen,
  shownClass,
  textsOf,
  validDates,
  type ClassificationCommand,
  type Decision,
} from "./schema";
export { classificationCommand };

/**
 * Wave 17 (J4): classification days. The federation (president or worker)
 * creates a day and invites clubs; the clubs register their players until
 * the deadline; the federation or a classifier named for the day (one of
 * its referees) marks who came and decides PF1, PF2 or « À revoir »;
 * publishing writes the result on each player's sport profile (its history
 * follows through the trigger of 0050), in the audit log, and tells the club
 * president, the team's coaches and the player or the parents.
 * The federation only ever reads sporting information here: name, club,
 * birth year and classification.
 */
type Lang = "fr" | "nl" | "en";
type Ctx = {
  c: PoolClient;
  org: string;
  orgName: string;
  userId: string;
  fed: string | null;
  /** Federation president or worker. */
  manage: boolean;
  /** A referee of the federation: classifier of the days naming them. */
  referee: boolean;
  /** A club officer who registers the club's players. */
  club: boolean;
};

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const federation = a.kind === "federation";
    const fed = federation
      ? a.organization_id
      : ((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id ?? null);
    const rights = permissions(a.role, a.grants);
    const out = await fn({
      c,
      org: a.organization_id,
      orgName: a.organization_name,
      userId: p.userId,
      fed,
      manage: mfa && federation && fedCan(a.role, a.grants, "federation.classification"),
      referee: mfa && federation && a.role === "referee",
      club: mfa && a.kind === "club" && (rights.includes("people.manage") || rights.includes("teams.manage")),
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

/* ------------------------------------------------------------ Notifications */

const said: Record<"invited" | "cancelled" | "PF1" | "PF2" | "review", Record<Lang, string>> = {
  invited: {
    fr: "invitation à la journée de classification du {day}, inscriptions jusqu'au {deadline}",
    nl: "uitnodiging voor de classificatiedag van {day}, inschrijven tot {deadline}",
    en: "invitation to the classification day of {day}, registration until {deadline}",
  },
  cancelled: { fr: "journée de classification du {day} annulée", nl: "classificatiedag van {day} geannuleerd", en: "classification day of {day} cancelled" },
  PF1: { fr: "classification PF1 validée", nl: "classificatie PF1 gevalideerd", en: "classification PF1 validated" },
  PF2: { fr: "classification PF2 validée", nl: "classificatie PF2 gevalideerd", en: "classification PF2 validated" },
  review: { fr: "classification à revoir", nl: "classificatie te herzien", en: "classification to review" },
};
const reviewNote = "À revoir";
type Recipient = { id: string; email: string; name: string; locale: Lang; organization: string };
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

async function presidents(c: PoolClient, org: string) {
  return (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization
         FROM role_assignment r JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id JOIN organization o ON o.id=r.organization_id
        WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active`,
      [org],
    )
  ).rows as Recipient[];
}
const live = (m: string) => `NOT ${m}.cancelled AND ${m}.closed_at IS NULL AND ${m}.starts_on<=CURRENT_DATE AND (${m}.ends_on IS NULL OR ${m}.ends_on>=CURRENT_DATE)`;
/** The coaches of the player's current teams, the player and the parents, with an account. */
async function aroundPlayer(c: PoolClient, org: string, profile: string) {
  return (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization
         FROM team_membership m JOIN team_membership k ON k.team_id=m.team_id AND k.organization_id=m.organization_id AND k.role='coach' AND ${live("k")}
         JOIN club_person cp ON cp.id=k.profile_id JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=m.organization_id
        WHERE m.organization_id=$1 AND m.profile_id=$2 AND m.role='player' AND ${live("m")} AND u.active
       UNION
       SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr'),o.name
         FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=cp.organization_id
        WHERE cp.organization_id=$1 AND cp.id=$2 AND u.active
       UNION
       SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr'),o.name
         FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=g.organization_id
        WHERE g.organization_id=$1 AND g.subject_profile_id=$2 AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND u.active`,
      [org, profile],
    )
  ).rows as Recipient[];
}
async function tell(c: PoolClient, org: string, users: Recipient[], input: { person: string; status: Record<Lang, string>; vars?: Record<string, string>; path: string; key: string }) {
  const seen = new Set<string>();
  for (const u of users) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "license_update",
      category: "administrative",
      resourceType: "license",
      resourceId: input.key,
      eventKey: `classification:${input.key}:${u.id}`,
      locale: u.locale,
      variables: {
        name: u.name,
        organization: u.organization,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}${input.path}`,
        person: input.person,
        status: fill(input.status[u.locale], input.vars ?? {}),
      },
    });
  }
}

/* --------------------------------------------------------------------- View */

type Session = {
  id: string;
  day: string;
  deadline: string;
  venue: string;
  venue_name: string | null;
  venue_city: string | null;
  notes: string;
  status: "open" | "published" | "cancelled";
  published_at: string | null;
};
type Line = {
  id: string;
  session_id: string;
  club_id: string;
  club: string;
  profile_id: string;
  full_name: string;
  birth_year: number | null;
  classification: "PF1" | "PF2" | "pending" | "not_classified";
  present: boolean | null;
  decision: Decision | null;
  status: "registered" | "decided" | "published";
  comment: string;
};

const sessionSql = `SELECT s.id,s.day::text AS day,s.registration_deadline::text AS deadline,s.venue,sv.name AS venue_name,sv.city AS venue_city,s.notes,s.status,s.published_at
  FROM classification_session s LEFT JOIN shared_venue sv ON sv.id=s.shared_venue_id`;
const lineSql = `SELECT l.id,l.session_id,l.organization_id AS club_id,o.name AS club,l.profile_id,cp.full_name,extract(year FROM cp.birth_date)::int AS birth_year,
       COALESCE(sp.classification,'not_classified') AS classification,l.present,l.decision,l.status,l.comment
  FROM classification_session_player l JOIN club_person cp ON cp.id=l.profile_id AND cp.organization_id=l.organization_id
  JOIN organization o ON o.id=l.organization_id LEFT JOIN player_sport_profile sp ON sp.profile_id=l.profile_id`;

async function details(c: PoolClient, sessions: Session[], lines: Line[], today: string) {
  const ids = sessions.map((s) => s.id);
  const clubs = (
    await c.query("SELECT k.session_id,o.id,o.name FROM classification_session_club k JOIN organization o ON o.id=k.organization_id WHERE k.session_id=ANY($1::uuid[]) ORDER BY lower(o.name)", [ids])
  ).rows as { session_id: string; id: string; name: string }[];
  const classifiers = (
    await c.query('SELECT k.session_id,u.id,u.name FROM classification_session_classifier k JOIN "user" u ON u.id=k.user_id WHERE k.session_id=ANY($1::uuid[]) ORDER BY lower(u.name)', [ids])
  ).rows as { session_id: string; id: string; name: string }[];
  return sessions.map((s) => {
    const mine = lines.filter((l) => l.session_id === s.id).map((l) => ({ ...l, classification: shownClass(l.classification) }));
    return {
      ...s,
      registrationOpen: registrationOpen({ status: s.status, registration_deadline: s.deadline }, today),
      clubs: clubs.filter((x) => x.session_id === s.id).map(({ id, name }) => ({ id, name })),
      classifiers: classifiers.filter((x) => x.session_id === s.id).map(({ id, name }) => ({ id, name })),
      players: mine,
      progress: publishable(mine),
    };
  });
}

export async function classificationView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const today = brusselsToday();
    const texts = textsOf(s.fed ? (await s.c.query("SELECT classification_texts FROM organization WHERE id=$1", [s.fed])).rows[0]?.classification_texts : null);
    const empty = {
      organization_id: s.org,
      today,
      texts,
      can: { manage: s.manage, mark: s.manage || s.referee, register: s.club && !!s.fed },
      sessions: [] as Awaited<ReturnType<typeof details>>,
      options: null as null | { clubs: { id: string; name: string }[]; classifiers: { id: string; name: string; role: string }[]; venues: { id: string; name: string; city: string }[] },
      eligible: [] as { id: string; full_name: string; birth_year: number | null; classification: ReturnType<typeof shownClass> }[],
    };
    if (!s.fed) return { ...empty, mode: "none" as const };
    if (s.manage || s.referee) {
      const sessions = (
        await s.c.query(
          `${sessionSql} WHERE s.federation_id=$1 AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM classification_session_classifier k WHERE k.session_id=s.id AND k.user_id=$2))
            ORDER BY (s.status='open') DESC,s.day DESC LIMIT 100`,
          [s.fed, s.manage ? null : s.userId],
        )
      ).rows as Session[];
      const lines = (await s.c.query(`${lineSql} WHERE l.session_id=ANY($1::uuid[]) ORDER BY lower(o.name),lower(cp.full_name)`, [sessions.map((x) => x.id)])).rows as Line[];
      const out = { ...empty, mode: s.manage ? ("federation" as const) : ("classifier" as const), sessions: await details(s.c, sessions, lines, today) };
      if (!s.manage) return out;
      const clubs = (await s.c.query("SELECT id,name FROM organization WHERE federation_id=$1 AND kind='club' ORDER BY lower(name)", [s.fed])).rows;
      const classifiers = (
        await s.c.query(
          `SELECT DISTINCT ON (u.id) u.id,u.name,r.role FROM role_assignment r JOIN "user" u ON u.id=r.user_id
            WHERE r.organization_id=$1 AND r.role IN ('referee','federation_worker','federation_president') AND r.revoked_at IS NULL
              AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active
            ORDER BY u.id,(r.role='referee') DESC`,
          [s.fed],
        )
      ).rows.sort((a, b) => a.name.localeCompare(b.name));
      const venues = (
        await s.c.query(
          `SELECT v.id,v.name,v.city FROM shared_venue v JOIN organization o ON o.id=v.organization_id
            WHERE v.status='approved' AND (o.id=$1 OR o.federation_id=$1) ORDER BY lower(v.name) LIMIT 300`,
          [s.fed],
        )
      ).rows;
      return { ...out, options: { clubs, classifiers, venues } };
    }
    // A club: the days it is invited to, its own registrations only. The
    // decisions are shown once published.
    const sessions = (
      await s.c.query(
        `${sessionSql} JOIN classification_session_club k ON k.session_id=s.id AND k.organization_id=$2
          WHERE s.federation_id=$1 AND (s.status<>'cancelled' OR s.day>=CURRENT_DATE) ORDER BY (s.status='open') DESC,s.day DESC LIMIT 50`,
        [s.fed, s.org],
      )
    ).rows as Session[];
    const lines = (
      (await s.c.query(`${lineSql} WHERE l.session_id=ANY($1::uuid[]) AND l.organization_id=$2 ORDER BY lower(cp.full_name)`, [sessions.map((x) => x.id), s.org])).rows as Line[]
    ).map((l) => (l.status === "published" ? l : { ...l, present: null, decision: null, comment: "" }));
    const eligible = s.club
      ? (
          await s.c.query(
            `SELECT cp.id,cp.full_name,extract(year FROM cp.birth_date)::int AS birth_year,COALESCE(sp.classification,'not_classified') AS classification
               FROM club_person cp LEFT JOIN player_sport_profile sp ON sp.profile_id=cp.id
              WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles) AND NOT ('player'=ANY(cp.former_roles))
              ORDER BY lower(cp.full_name) LIMIT 1000`,
            [s.org],
          )
        ).rows.map((r) => ({ id: r.id as string, full_name: r.full_name as string, birth_year: r.birth_year as number | null, classification: shownClass(r.classification) }))
      : [];
    return { ...empty, mode: "club" as const, sessions: await details(s.c, sessions, lines, today), eligible };
  });
}

/** The PF1/PF2 texts of the member's federation, for the tips of the badges. */
export async function classificationTextsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => ({
    texts: textsOf(s.fed ? (await s.c.query("SELECT classification_texts FROM organization WHERE id=$1", [s.fed])).rows[0]?.classification_texts : null),
  }));
}

/* ------------------------------------------------------------------ Execute */

async function ownSession(s: Ctx, id: string, lock = true) {
  const row = (
    await s.c.query(`SELECT id,day::text AS day,registration_deadline::text AS registration_deadline,status FROM classification_session WHERE id=$1 AND federation_id=$2${lock ? " FOR UPDATE" : ""}`, [id, s.fed])
  ).rows[0] as { id: string; day: string; registration_deadline: string; status: string } | undefined;
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return row;
}
const dayLabel = (d: string) => d.split("-").reverse().join("/");

export async function classificationExecute(db: Pool, p: Principal, command: ClassificationCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (!s.fed) throw new AccessError("NO_FEDERATION", 409);
      const today = brusselsToday();
      const federationOnly = () => {
        if (!s.manage) throw new AccessError("FORBIDDEN");
      };

      if (command.action === "texts") {
        federationOnly();
        await s.c.query("UPDATE organization SET classification_texts=$2 WHERE id=$1", [s.fed, JSON.stringify(command.texts)]);
        await audit(s.c, s.fed, s.userId, "classification.texts", s.fed);
        return { ok: true as const };
      }

      if (command.action === "create") {
        federationOnly();
        if (!validDates(command.day, command.registrationDeadline, today)) throw new AccessError("CLASSIFICATION_DATES", 400);
        if (!command.sharedVenueId && !command.venue) throw new AccessError("INVALID_INPUT", 400);
        const clubIds = [...new Set(command.clubIds)],
          classifierIds = [...new Set(command.classifierIds)];
        const clubs = (await s.c.query("SELECT id FROM organization WHERE id=ANY($1::uuid[]) AND federation_id=$2 AND kind='club'", [clubIds, s.fed])).rowCount;
        if (clubs !== clubIds.length) throw new AccessError("NOT_FOUND", 404);
        const people = (
          await s.c.query(
            `SELECT DISTINCT user_id FROM role_assignment WHERE organization_id=$1 AND user_id=ANY($2::text[]) AND role IN ('referee','federation_worker','federation_president')
              AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())`,
            [s.fed, classifierIds],
          )
        ).rowCount;
        if (people !== classifierIds.length) throw new AccessError("NOT_FOUND", 404);
        if (command.sharedVenueId) {
          const venue = await s.c.query(
            "SELECT 1 FROM shared_venue v JOIN organization o ON o.id=v.organization_id WHERE v.id=$1 AND v.status='approved' AND (o.id=$2 OR o.federation_id=$2)",
            [command.sharedVenueId, s.fed],
          );
          if (!venue.rowCount) throw new AccessError("NOT_FOUND", 404);
        }
        const id = (
          await s.c.query(
            "INSERT INTO classification_session(federation_id,day,shared_venue_id,venue,registration_deadline,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [s.fed, command.day, command.sharedVenueId, command.venue, command.registrationDeadline, command.notes, s.userId],
          )
        ).rows[0].id as string;
        for (const club of clubIds) await s.c.query("INSERT INTO classification_session_club(session_id,organization_id) VALUES($1,$2)", [id, club]);
        for (const user of classifierIds) await s.c.query("INSERT INTO classification_session_classifier(session_id,user_id) VALUES($1,$2)", [id, user]);
        for (const club of clubIds)
          await tell(s.c, club, await presidents(s.c, club), {
            person: s.orgName,
            status: said.invited,
            vars: { day: dayLabel(command.day), deadline: dayLabel(command.registrationDeadline) },
            path: "/classification",
            key: `${id}:invited:${club}`,
          });
        await audit(s.c, s.fed, s.userId, "classification.session.create", id, { day: command.day, clubs: clubIds.length, classifiers: classifierIds.length });
        return { ok: true as const, id };
      }

      if (command.action === "cancel") {
        federationOnly();
        const session = await ownSession(s, command.id);
        if (session.status !== "open") throw new AccessError("CLASSIFICATION_CLOSED", 409);
        await s.c.query("UPDATE classification_session SET status='cancelled' WHERE id=$1", [session.id]);
        const clubs = (await s.c.query("SELECT organization_id FROM classification_session_club WHERE session_id=$1", [session.id])).rows.map((r) => r.organization_id as string);
        for (const club of clubs)
          await tell(s.c, club, await presidents(s.c, club), { person: s.orgName, status: said.cancelled, vars: { day: dayLabel(session.day) }, path: "/classification", key: `${session.id}:cancelled:${club}` });
        await audit(s.c, s.fed, s.userId, "classification.session.cancel", session.id);
        return { ok: true as const };
      }

      if (command.action === "register" || command.action === "unregister") {
        if (!s.club) throw new AccessError("FORBIDDEN");
        const session = await ownSession(s, command.sessionId);
        const invited = await s.c.query("SELECT 1 FROM classification_session_club WHERE session_id=$1 AND organization_id=$2", [session.id, s.org]);
        if (!invited.rowCount) throw new AccessError("NOT_FOUND", 404);
        if (!registrationOpen(session, today)) throw new AccessError("CLASSIFICATION_CLOSED", 409);
        if (command.action === "unregister") {
          const gone = await s.c.query("DELETE FROM classification_session_player WHERE session_id=$1 AND organization_id=$2 AND profile_id=$3 AND status='registered' RETURNING id", [
            session.id,
            s.org,
            command.profileId,
          ]);
          if (!gone.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, s.org, s.userId, "classification.unregister", command.profileId, { session: session.id });
          return { ok: true as const };
        }
        const ids = [...new Set(command.profileIds)];
        const players = await s.c.query(
          "SELECT id FROM club_person WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND status='active' AND 'player'=ANY(directory_roles) AND NOT ('player'=ANY(former_roles))",
          [ids, s.org],
        );
        if (players.rowCount !== ids.length) throw new AccessError("NOT_FOUND", 404);
        let added = 0;
        for (const id of ids)
          added +=
            (
              await s.c.query(
                "INSERT INTO classification_session_player(session_id,organization_id,profile_id,registered_by) VALUES($1,$2,$3,$4) ON CONFLICT (session_id,profile_id) DO NOTHING",
                [session.id, s.org, id, s.userId],
              )
            ).rowCount ?? 0;
        await audit(s.c, s.org, s.userId, "classification.register", session.id, { players: added });
        return { ok: true as const, added };
      }

      if (command.action === "mark") {
        const line = (
          await s.c.query(
            `SELECT l.id,l.session_id FROM classification_session_player l JOIN classification_session s ON s.id=l.session_id
              WHERE l.id=$1 AND s.federation_id=$2 AND s.status='open' FOR UPDATE OF l`,
            [command.id, s.fed],
          )
        ).rows[0] as { id: string; session_id: string } | undefined;
        if (!line) throw new AccessError("NOT_FOUND", 404);
        if (!s.manage) {
          const named = s.referee && (await s.c.query("SELECT 1 FROM classification_session_classifier WHERE session_id=$1 AND user_id=$2", [line.session_id, s.userId])).rowCount;
          if (!named) throw new AccessError("FORBIDDEN");
        }
        // Absent, or not yet marked: no decision.
        const decision = command.present ? command.decision : null;
        await s.c.query(
          "UPDATE classification_session_player SET present=$2,decision=$3,comment=$4,status=$5,decided_by=$6,decided_at=CASE WHEN $3::text IS NULL THEN NULL ELSE now() END WHERE id=$1",
          [line.id, command.present, decision, command.comment, decision ? "decided" : "registered", decision ? s.userId : null],
        );
        return { ok: true as const };
      }

      // Publish: every line marked, the decisions written and told.
      federationOnly();
      const session = await ownSession(s, command.id);
      if (session.status !== "open") throw new AccessError("CLASSIFICATION_CLOSED", 409);
      const lines = (
        await s.c.query(
          `SELECT l.id,l.organization_id,l.profile_id,l.present,l.decision,l.comment,cp.full_name,COALESCE(sp.classification,'not_classified') AS classification
             FROM classification_session_player l JOIN club_person cp ON cp.id=l.profile_id AND cp.organization_id=l.organization_id
             LEFT JOIN player_sport_profile sp ON sp.profile_id=l.profile_id WHERE l.session_id=$1 FOR UPDATE OF l`,
          [session.id],
        )
      ).rows as { id: string; organization_id: string; profile_id: string; present: boolean | null; decision: Decision | null; comment: string; full_name: string; classification: string }[];
      const check = publishable(lines);
      if (!check.ok) throw Object.assign(new AccessError("CLASSIFICATION_INCOMPLETE", 409), { details: check });
      for (const l of lines) {
        if (!l.present || !l.decision) continue;
        const result = outcome(l.decision, l.classification, l.comment, reviewNote);
        await s.c.query(
          `INSERT INTO player_sport_profile(profile_id,organization_id,classification,classification_status,classification_note,classification_checked_by,classification_checked_at,updated_by)
           VALUES($1,$2,$3,$4,$5,$6,now(),$6)
           ON CONFLICT (profile_id) DO UPDATE SET classification=EXCLUDED.classification,classification_status=EXCLUDED.classification_status,classification_note=EXCLUDED.classification_note,
             classification_checked_by=EXCLUDED.classification_checked_by,classification_checked_at=now(),updated_by=EXCLUDED.updated_by,updated_at=now(),version=player_sport_profile.version+1`,
          [l.profile_id, l.organization_id, result.classification, result.status, result.note, s.userId],
        );
        await audit(s.c, l.organization_id, s.userId, "classification.session.decision", l.profile_id, { session: session.id, decision: l.decision, federation: s.fed });
        await tell(s.c, l.organization_id, [...(await presidents(s.c, l.organization_id)), ...(await aroundPlayer(s.c, l.organization_id, l.profile_id))], {
          person: l.full_name,
          status: said[l.decision],
          path: `/players/${l.profile_id}`,
          key: `${session.id}:${l.profile_id}`,
        });
      }
      await s.c.query("UPDATE classification_session_player SET status='published' WHERE session_id=$1", [session.id]);
      await s.c.query("UPDATE classification_session SET status='published',published_at=now() WHERE id=$1", [session.id]);
      await audit(s.c, s.fed, s.userId, "classification.session.publish", session.id, { decided: check.decided, players: lines.length });
      return { ok: true as const, decided: check.decided };
    },
    expected,
  );
}
