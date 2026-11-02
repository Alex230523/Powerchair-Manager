import type { Pool, PoolClient } from "pg";
import { fedCan } from "../access/policy";
import { createHash, randomBytes } from "node:crypto";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { brusselsToday, moveProfile } from "../people/service";
import { publish } from "../notifications/queue";
import { seasonOf } from "../finance/schema";
import { ageBand } from "../statistics/club-math";
import { shownClass } from "../classification/schema";
import { canDecide, setVisibility } from "./consent";
import { adultOn, amountAllowed, marketOpen, offerMoves, rulesOf, transferCommand, type Rules, type TransferCommand } from "./schema";
export { transferCommand };

/**
 * Wave 17 (J3): the transfer market between the clubs of a federation.
 *
 * Only players who chose to be seen (the adult player, or a parent for a
 * minor) are listed, with sporting information only: name, club and team,
 * province, classification, age category, seasons played; the sheet adds
 * match statistics, clubs and prizes. Never a birth date, photo, address,
 * email, phone, health datum or document.
 *
 * A club with the players right asks for a transfer; the current club and
 * the requesting one talk in a conversation of their own, read by the
 * presidents and the people with the players right of both clubs; the
 * player (or a parent) agrees before any acceptance; an accepted offer goes
 * to the federation, whose validation moves the player as the token
 * transfer does (moveProfile) and shows in its licences list.
 */
type Lang = "fr" | "nl" | "en";
type Ctx = {
  c: PoolClient;
  userId: string;
  org: string;
  orgName: string;
  kind: "club" | "federation" | string;
  fed: string | null;
  /** A club officer with the players right (president included). */
  players: boolean;
  /** Reads the market: club officers and the federation. */
  read: boolean;
  /** Federation president or worker. */
  federation: boolean;
  today: string;
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
    const club = a.kind === "club",
      federation = a.kind === "federation";
    const fed = federation
      ? a.organization_id
      : ((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id ?? null);
    const rights = permissions(a.role, a.grants);
    const out = await fn({
      c,
      userId: p.userId,
      org: a.organization_id,
      orgName: a.organization_name,
      kind: a.kind,
      fed,
      players: mfa && club && rights.includes("people.manage"),
      read: mfa && ((club && rights.includes("people.read")) || (federation && fedCan(a.role, a.grants, "federation.licences"))),
      federation: mfa && federation && fedCan(a.role, a.grants, "federation.licences"),
      today: brusselsToday(),
    });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}

const rulesFor = async (c: PoolClient, fed: string | null) => rulesOf(fed ? (await c.query("SELECT * FROM transfer_rules WHERE federation_id=$1", [fed])).rows[0] : undefined);

/* ------------------------------------------------------------- The market */

const live = (m: string) => `NOT ${m}.cancelled AND ${m}.closed_at IS NULL AND ${m}.starts_on<=CURRENT_DATE AND (${m}.ends_on IS NULL OR ${m}.ends_on>=CURRENT_DATE)`;
/**
 * The visible players of a federation: one line per person, from their
 * active player profile in one of its clubs, otherwise their last one
 * (« Sans club »). Sporting fields only.
 */
const marketSql = `
  WITH clubs AS (SELECT id,name,province FROM organization WHERE federation_id=$1 AND kind='club'),
  profiles AS (
    SELECT cp.id,cp.person_id,cp.organization_id,cp.full_name,cp.birth_date,cp.status,
           (cp.status='active' AND 'player'=ANY(cp.directory_roles) AND NOT ('player'=ANY(cp.former_roles))) AS current,
           cp.updated_at,cp.joined_on
      FROM club_person cp JOIN clubs o ON o.id=cp.organization_id
     WHERE 'player'=ANY(cp.directory_roles) AND cp.departure_status IS DISTINCT FROM 'deceased'),
  chosen AS (
    SELECT DISTINCT ON (p.person_id) p.* FROM profiles p JOIN transfer_visibility v ON v.person_id=p.person_id AND v.visible
     ORDER BY p.person_id,p.current DESC,p.updated_at DESC)
  SELECT ch.person_id AS key,ch.id AS profile_id,ch.full_name,ch.birth_date::text AS birth_date,
         CASE WHEN ch.current THEN o.id END AS club_id,CASE WHEN ch.current THEN o.name END AS club,o.province,
         CASE WHEN ch.current THEN (SELECT string_agg(DISTINCT t.name,', ') FROM team_membership m JOIN team t ON t.id=m.team_id WHERE m.profile_id=ch.id AND m.role='player' AND ${live("m")}) END AS team,
         COALESCE(sp.classification,'not_classified') AS classification,
         (SELECT count(DISTINCT se.name)::int FROM club_person x JOIN clubs xo ON xo.id=x.organization_id JOIN team_membership m ON m.profile_id=x.id AND m.role='player' AND NOT m.cancelled
             JOIN team t ON t.id=m.team_id JOIN season se ON se.id=t.season_id WHERE x.person_id=ch.person_id) AS seasons
    FROM chosen ch JOIN clubs o ON o.id=ch.organization_id LEFT JOIN player_sport_profile sp ON sp.profile_id=ch.id
   ORDER BY lower(ch.full_name)`;
type MarketRow = { key: string; profile_id: string; full_name: string; birth_date: string | null; club_id: string | null; club: string | null; province: string; team: string | null; classification: string; seasons: number };
export type Listed = Omit<MarketRow, "birth_date" | "profile_id" | "classification"> & { age: ReturnType<typeof ageBand>; classification: ReturnType<typeof shownClass>; own: boolean };

async function market(s: Ctx) {
  if (!s.fed) return [];
  const season = seasonOf(s.today).from;
  return ((await s.c.query(marketSql, [s.fed])).rows as MarketRow[]).map(
    (r): Listed => ({
      key: r.key,
      full_name: r.full_name,
      club_id: r.club_id,
      club: r.club,
      province: r.province,
      team: r.team,
      // The age category only, never the birth date.
      age: ageBand(r.birth_date, season),
      classification: shownClass(r.classification),
      seasons: r.seasons,
      own: r.club_id === s.org,
    }),
  );
}

/** The persons this account decides for: oneself as an adult player, a child as a parent. */
async function mine(s: Ctx) {
  const rows = (
    await s.c.query(
      `SELECT DISTINCT ON (cp.person_id) cp.person_id,cp.full_name,cp.birth_date::text AS birth_date,pe.user_id=$1 AS self,COALESCE(v.visible,false) AS visible
         FROM club_person cp JOIN person pe ON pe.id=cp.person_id LEFT JOIN transfer_visibility v ON v.person_id=cp.person_id
        WHERE 'player'=ANY(cp.directory_roles) AND cp.departure_status IS DISTINCT FROM 'deceased'
          AND (pe.user_id=$1 OR EXISTS (
            SELECT 1 FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person gpe ON gpe.id=gp.person_id
             WHERE g.subject_profile_id=cp.id AND gpe.user_id=$1 AND g.revoked_at IS NULL AND g.kind<>'delegated_aid' AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)))
        ORDER BY cp.person_id,cp.updated_at DESC`,
      [s.userId],
    )
  ).rows as { person_id: string; full_name: string; birth_date: string | null; self: boolean; visible: boolean }[];
  return Promise.all(
    rows.map(async (r) => ({ person_id: r.person_id, full_name: r.full_name, visible: r.visible, minor: !adultOn(r.birth_date, s.today), can: await canDecide(s.c, s.userId, r.person_id, s.today) })),
  );
}

const offerSql = `SELECT t.id,t.person_id,t.from_organization_id,t.to_organization_id,t.source_organization_id,t.source_profile_id,t.season,t.amount_cents,t.message,t.status,t.player_consent,
    t.decision_note,t.federation_note,t.completed_at,t.created_at,t.version,cp.full_name,fo.name AS from_club,tor.name AS to_club,
    (SELECT count(*)::int FROM transfer_message m WHERE m.offer_id=t.id) AS messages
  FROM transfer_offer t JOIN club_person cp ON cp.id=t.source_profile_id LEFT JOIN organization fo ON fo.id=t.from_organization_id JOIN organization tor ON tor.id=t.to_organization_id`;
export type Offer = {
  id: string;
  person_id: string;
  from_organization_id: string | null;
  to_organization_id: string;
  source_organization_id: string;
  source_profile_id: string;
  season: string;
  amount_cents: number | null;
  message: string;
  status: "sent" | "discussing" | "accepted" | "refused" | "withdrawn" | "validated";
  player_consent: "pending" | "given" | "refused";
  decision_note: string;
  federation_note: string;
  completed_at: string | null;
  created_at: string;
  version: number;
  full_name: string;
  from_club: string | null;
  to_club: string;
  messages: number;
};
const shown = (o: Offer) => {
  // The source profile and organisation stay on the server.
  const { source_profile_id: _p, source_organization_id: _o, ...rest } = o;
  void _p;
  void _o;
  return rest;
};

export async function transfersView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const rules = await rulesFor(s.c, s.fed);
    const players = s.read ? await market(s) : [];
    const consents = (
      await s.c.query(`${offerSql} WHERE t.status IN ('sent','discussing') AND t.person_id=ANY($1::uuid[]) ORDER BY t.created_at DESC`, [(await mine(s)).filter((m) => m.can).map((m) => m.person_id)])
    ).rows as Offer[];
    const offers =
      s.kind === "club" && s.players
        ? ((await s.c.query(`${offerSql} WHERE (t.to_organization_id=$1 OR t.from_organization_id=$1) ORDER BY t.created_at DESC LIMIT 200`, [s.org])).rows as Offer[])
        : s.federation
          ? ((await s.c.query(`${offerSql} WHERE t.federation_id=$1 AND (t.status='accepted' OR t.created_at>now()-interval '365 days') ORDER BY (t.status='accepted') DESC,t.created_at DESC LIMIT 300`, [s.fed])).rows as Offer[])
          : [];
    const clubs = s.federation ? (await s.c.query("SELECT id,name,province FROM organization WHERE federation_id=$1 AND kind='club' ORDER BY lower(name)", [s.fed])).rows : [];
    const season = seasonOf(s.today).label,
      next = `${Number(season.slice(0, 4)) + 1}-${String(Number(season.slice(0, 4)) + 2).slice(2)}`;
    return {
      organization_id: s.org,
      mode: s.federation ? ("federation" as const) : s.read ? ("club" as const) : ("member" as const),
      today: s.today,
      seasons: [season, next],
      rules,
      open: marketOpen(rules, s.today),
      players,
      mine: await mine(s),
      consents: consents.map(shown),
      offers: offers.map((o) => ({
        ...shown(o),
        side: (s.federation ? "federation" : o.to_organization_id === s.org ? "to" : "from") as "to" | "from" | "federation",
        moves: offerMoves(o, s.federation ? "federation" : o.to_organization_id === s.org ? "to" : "from", rules.federationValidation),
      })),
      clubs: clubs as { id: string; name: string; province: string }[],
      can: { request: s.players && !!s.fed, rules: s.federation },
    };
  });
}

/** A visible player's sporting sheet: statistics per season, clubs, prizes. */
export async function sheetView(db: Pool, p: Principal, person: string) {
  return scope(db, p, false, async (s) => {
    if (!s.read || !s.fed) throw new AccessError("FORBIDDEN");
    const row = (await market(s)).find((r) => r.key === person);
    if (!row) throw new AccessError("NOT_FOUND", 404);
    const profiles = `SELECT x.id FROM club_person x JOIN organization xo ON xo.id=x.organization_id WHERE x.person_id=$1 AND xo.federation_id=$2 AND xo.kind='club'`;
    const stats = (
      await s.c.query(
        `SELECT se.name AS season,o.name AS club,count(*)::int AS matches,sum(mp.minutes)::int AS minutes,sum(mp.goals)::int AS goals,sum(mp.assists)::int AS assists
           FROM match_player mp JOIN match m ON m.id=mp.match_id AND m.organization_id=mp.organization_id JOIN team t ON t.id=m.team_id JOIN season se ON se.id=t.season_id JOIN organization o ON o.id=m.organization_id
          WHERE mp.profile_id IN (${profiles}) AND m.status='played'
          GROUP BY se.name,o.name ORDER BY se.name DESC,o.name`,
        [person, s.fed],
      )
    ).rows as { season: string; club: string; matches: number; minutes: number; goals: number; assists: number }[];
    const clubs = (
      await s.c.query(
        `SELECT o.name AS club,COALESCE(string_agg(DISTINCT se.name,', ' ORDER BY se.name),'') AS seasons
           FROM club_person x JOIN organization o ON o.id=x.organization_id
           LEFT JOIN team_membership m ON m.profile_id=x.id AND m.role='player' AND NOT m.cancelled LEFT JOIN team t ON t.id=m.team_id LEFT JOIN season se ON se.id=t.season_id
          WHERE x.person_id=$1 AND o.federation_id=$2 AND o.kind='club' GROUP BY o.name ORDER BY min(se.name) NULLS LAST,o.name`,
        [person, s.fed],
      )
    ).rows as { club: string; seasons: string }[];
    const prizes = (
      await s.c.query(
        `SELECT a.id,a.title,a.competition,a.place,a.awarded_on::text AS awarded_on,o.name AS club FROM award a JOIN organization o ON o.id=a.organization_id
          WHERE (a.profile_id IN (${profiles}))
             OR (a.kind='team' AND EXISTS (SELECT 1 FROM team_membership m WHERE m.team_id=a.team_id AND m.role='player' AND NOT m.cancelled AND m.profile_id IN (${profiles})))
          ORDER BY a.awarded_on DESC LIMIT 50`,
        [person, s.fed],
      )
    ).rows as { id: string; title: string; competition: string; place: number | null; awarded_on: string; club: string }[];
    return { player: row, stats, clubs, prizes, canRequest: s.players && !row.own };
  });
}

/* ---------------------------------------------------------- Notifications */

type Recipient = { id: string; email: string; name: string; locale: Lang; organization: string };
async function officers(c: PoolClient, org: string) {
  const rows = (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization,r.role,r.grants
         FROM role_assignment r JOIN "user" u ON u.id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id JOIN organization o ON o.id=r.organization_id
        WHERE r.organization_id=$1 AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND u.active`,
      [org],
    )
  ).rows as (Recipient & { role: string; grants: string[] })[];
  return rows.filter((r) => permissions(r.role as never, r.grants ?? []).includes("people.manage"));
}
/** The player with an account, and the parents of the profile that moves. */
async function family(c: PoolClient, org: string, profile: string) {
  return (
    await c.query(
      `SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS organization
         FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=cp.organization_id
        WHERE cp.id=$2 AND cp.organization_id=$1 AND u.active
       UNION
       SELECT u.id,u.email,u.name,COALESCE(pe.locale,'fr'),o.name
         FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id JOIN organization o ON o.id=g.organization_id
        WHERE g.organization_id=$1 AND g.subject_profile_id=$2 AND g.revoked_at IS NULL AND g.kind<>'delegated_aid' AND u.active`,
      [org, profile],
    )
  ).rows as Recipient[];
}
const words: Record<"request" | "consent" | "answer" | "message" | "accepted" | "refused" | "validated", Record<Lang, string>> = {
  request: { fr: "Demande de transfert de {name} par {club}", nl: "Transferaanvraag voor {name} door {club}", en: "Transfer request for {name} from {club}" },
  consent: { fr: "Votre accord est demandé : transfert de {name} vers {club}", nl: "Uw akkoord wordt gevraagd: transfer van {name} naar {club}", en: "Your agreement is asked: transfer of {name} to {club}" },
  answer: { fr: "Accord du joueur pour le transfert de {name} vers {club}", nl: "Akkoord van de speler voor de transfer van {name} naar {club}", en: "The player agrees to the transfer of {name} to {club}" },
  message: { fr: "Nouveau message sur le transfert de {name}", nl: "Nieuw bericht over de transfer van {name}", en: "New message about the transfer of {name}" },
  accepted: { fr: "Transfert de {name} accepté par {club}", nl: "Transfer van {name} aanvaard door {club}", en: "Transfer of {name} accepted by {club}" },
  refused: { fr: "Transfert de {name} refusé par {club}", nl: "Transfer van {name} geweigerd door {club}", en: "Transfer of {name} refused by {club}" },
  validated: { fr: "Transfert de {name} vers {club} validé", nl: "Transfer van {name} naar {club} gevalideerd", en: "Transfer of {name} to {club} validated" },
};
async function tell(c: PoolClient, users: Recipient[], what: keyof typeof words, vars: { name: string; club: string; season: string }, key: string) {
  const seen = new Set<string>();
  for (const u of users) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    await publish(c, {
      organizationId: null,
      userId: u.id,
      email: u.email,
      kind: "funding_task",
      category: "administrative",
      resourceType: "license",
      resourceId: key,
      eventKey: `transfer:${key}:${what}:${u.id}:${Date.now()}`,
      locale: u.locale,
      inApp: true,
      variables: {
        name: u.name,
        organization: u.organization,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/transfers`,
        title: words[what][u.locale].replace("{name}", vars.name).replace("{club}", vars.club),
        due: vars.season,
      },
    });
  }
}

/* ---------------------------------------------------------------- Execute */

async function lockedOffer(s: Ctx, id: string) {
  const o = (await s.c.query(`${offerSql} WHERE t.id=$1`, [id])).rows[0] as Offer | undefined;
  if (!o) throw new AccessError("NOT_FOUND", 404);
  // Both clubs, in a fixed order, then the offer.
  await s.c.query("SELECT id FROM organization WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[o.to_organization_id, o.from_organization_id ?? o.to_organization_id]]);
  await s.c.query("SELECT id FROM transfer_offer WHERE id=$1 FOR UPDATE", [id]);
  return (await s.c.query(`${offerSql} WHERE t.id=$1`, [id])).rows[0] as Offer;
}
/** Transfers completed for a club this season, against the federation's maximum. */
async function belowMax(s: Ctx, rules: Rules, org: string, season: string) {
  if (rules.maxPerClubSeason === null) return true;
  const n = (await s.c.query("SELECT count(*)::int AS n FROM transfer_offer WHERE to_organization_id=$1 AND season=$2 AND completed_at IS NOT NULL", [org, season])).rows[0].n as number;
  return n < rules.maxPerClubSeason;
}
/** The move itself, once everyone agreed (and the federation validated when its rules ask it). */
async function complete(s: Ctx, o: Offer, status: "accepted" | "validated") {
  const moved = await moveProfile(s.c, { organization: o.source_organization_id, profile: o.source_profile_id }, o.to_organization_id, s.userId, o.from_organization_id ? ["active"] : ["active", "inactive", "archived", "transferred"]);
  await s.c.query("UPDATE club_person SET directory_roles=ARRAY(SELECT DISTINCT unnest(directory_roles||'{player}'::text[])),former_roles='{}' WHERE id=$1", [moved.target]);
  // The classification follows the player.
  await s.c.query(
    `INSERT INTO player_sport_profile(profile_id,organization_id,classification,classification_valid_until,classification_status,control,jersey_size)
     SELECT $1,$2,classification,classification_valid_until,classification_status,control,jersey_size FROM player_sport_profile WHERE profile_id=$3 ON CONFLICT (profile_id) DO NOTHING`,
    [moved.target, o.to_organization_id, o.source_profile_id],
  );
  // Seen by the federation in its licences list, like a token transfer.
  await s.c.query(
    "INSERT INTO person_transfer(source_organization_id,source_profile_id,token_hash,created_by,authorization_note,accepted_at,target_organization_id) VALUES($1,$2,$3,$4,$5,now(),$6)",
    [o.source_organization_id, o.source_profile_id, createHash("sha256").update(randomBytes(32)).digest("hex"), s.userId, `Bourse aux transferts ${o.season}`, o.to_organization_id],
  );
  await s.c.query("UPDATE transfer_offer SET status=$2,completed_at=now(),target_profile_id=$3,version=version+1 WHERE id=$1", [o.id, status, moved.target]);
  await audit(s.c, o.to_organization_id, s.userId, "transfer.completed", o.id, { person: o.person_id, from: o.source_organization_id, season: o.season });
  await audit(s.c, o.source_organization_id, s.userId, "people.transfer.out", o.source_profile_id);
  const people = [...(await officers(s.c, o.to_organization_id)), ...(await officers(s.c, o.source_organization_id)), ...(await family(s.c, o.to_organization_id, moved.target))];
  await tell(s.c, people, "validated", { name: o.full_name, club: o.to_club, season: o.season }, o.id);
}

export async function transferExecute(db: Pool, p: Principal, command: TransferCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (command.action === "visibility") {
        if (!(await setVisibility(s.c, s.userId, command.personId, command.visible, s.today))) throw new AccessError("FORBIDDEN");
        await audit(s.c, s.org, s.userId, command.visible ? "transfer.visible" : "transfer.hidden", command.personId);
        return { ok: true as const };
      }

      if (command.action === "rules" || command.action === "province") {
        if (!s.federation) throw new AccessError("FORBIDDEN");
        if (command.action === "province") {
          const r = await s.c.query("UPDATE organization SET province=$3 WHERE id=$1 AND federation_id=$2 AND kind='club' RETURNING id", [command.clubId, s.fed, command.province]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { ok: true as const };
        }
        const r = command.rules;
        await s.c.query(
          `INSERT INTO transfer_rules(federation_id,windows,amounts_allowed,amount_cap_cents,max_per_club_season,federation_validation,rules_text,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
           ON CONFLICT (federation_id) DO UPDATE SET windows=EXCLUDED.windows,amounts_allowed=EXCLUDED.amounts_allowed,amount_cap_cents=EXCLUDED.amount_cap_cents,max_per_club_season=EXCLUDED.max_per_club_season,
             federation_validation=EXCLUDED.federation_validation,rules_text=EXCLUDED.rules_text,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [s.fed, JSON.stringify(r.windows), r.amountsAllowed, r.amountCapCents, r.maxPerClubSeason, r.federationValidation, r.rulesText, s.userId],
        );
        await audit(s.c, s.org, s.userId, "transfer.rules", s.org);
        return { ok: true as const };
      }

      if (!s.fed) throw new AccessError("NO_FEDERATION", 409);
      const rules = await rulesFor(s.c, s.fed);

      if (command.action === "request") {
        if (!s.players) throw new AccessError("FORBIDDEN");
        if (!marketOpen(rules, s.today)) throw new AccessError("MARKET_CLOSED", 409);
        if (!amountAllowed(rules, command.amountCents)) throw new AccessError("AMOUNT_NOT_ALLOWED", 400);
        const row = (await market(s)).find((r) => r.key === command.personId);
        if (!row) throw new AccessError("NOT_FOUND", 404);
        if (row.own) throw new AccessError("OWN_PLAYER", 409);
        if (!(await belowMax(s, rules, s.org, command.season))) throw new AccessError("TRANSFER_LIMIT", 409);
        const source = (await s.c.query(marketSql, [s.fed])).rows.find((r: { key: string }) => r.key === command.personId) as { profile_id: string; club_id: string | null };
        const sourceOrg = (await s.c.query("SELECT organization_id FROM club_person WHERE id=$1", [source.profile_id])).rows[0].organization_id as string;
        const id = (
          await s.c.query(
            `INSERT INTO transfer_offer(federation_id,person_id,from_organization_id,source_organization_id,source_profile_id,to_organization_id,season,amount_cents,message,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [s.fed, command.personId, source.club_id, sourceOrg, source.profile_id, s.org, command.season, command.amountCents, command.message, s.userId],
          )
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "transfer.request", id, { person: command.personId, season: command.season });
        const vars = { name: row.full_name, club: s.orgName, season: command.season };
        if (source.club_id) await tell(s.c, await officers(s.c, source.club_id), "request", vars, id);
        await tell(s.c, await family(s.c, sourceOrg, source.profile_id), "consent", vars, id);
        return { ok: true as const, id };
      }

      const o = await lockedOffer(s, command.id);
      const vars = { name: o.full_name, club: s.orgName, season: o.season };
      const clubSide = o.to_organization_id === s.org ? "to" : o.from_organization_id === s.org ? "from" : null;

      if (command.action === "consent") {
        if (!(await canDecide(s.c, s.userId, o.person_id, s.today))) throw new AccessError("FORBIDDEN");
        if (!["sent", "discussing"].includes(o.status)) throw new AccessError("INVALID_TRANSITION", 409);
        await s.c.query("UPDATE transfer_offer SET player_consent=$2,consent_by=$3,consent_at=now(),version=version+1 WHERE id=$1", [o.id, command.consent, s.userId]);
        await audit(s.c, s.org, s.userId, "transfer.consent." + command.consent, o.id);
        const clubs = [...(await officers(s.c, o.to_organization_id)), ...(o.from_organization_id ? await officers(s.c, o.from_organization_id) : [])];
        await tell(s.c, clubs, command.consent === "given" ? "answer" : "refused", { ...vars, club: o.to_club }, o.id);
        // A player without club: their agreement is the acceptance.
        if (!o.from_organization_id) {
          if (command.consent === "refused") await s.c.query("UPDATE transfer_offer SET status='refused',decided_at=now() WHERE id=$1", [o.id]);
          else if (!rules.federationValidation) await complete(s, { ...o, player_consent: "given" }, "accepted");
          else await s.c.query("UPDATE transfer_offer SET status='accepted',decided_at=now() WHERE id=$1", [o.id]);
        }
        return { ok: true as const };
      }

      if (command.action === "message") {
        // The two clubs only: presidents and people with the players right.
        if (!s.players || !clubSide || !o.from_organization_id) throw new AccessError("FORBIDDEN");
        await s.c.query("INSERT INTO transfer_message(offer_id,organization_id,sender_id,body) VALUES($1,$2,$3,$4)", [o.id, s.org, s.userId, command.body]);
        if (o.status === "sent") await s.c.query("UPDATE transfer_offer SET status='discussing',version=version+1 WHERE id=$1", [o.id]);
        const other = clubSide === "to" ? o.from_organization_id : o.to_organization_id;
        await tell(s.c, await officers(s.c, other), "message", vars, o.id);
        return { ok: true as const };
      }

      if (command.action === "withdraw") {
        if (!s.players || clubSide !== "to") throw new AccessError("FORBIDDEN");
        if (!["sent", "discussing", "accepted"].includes(o.status) || o.completed_at) throw new AccessError("INVALID_TRANSITION", 409);
        await s.c.query("UPDATE transfer_offer SET status='withdrawn',version=version+1 WHERE id=$1", [o.id]);
        await audit(s.c, s.org, s.userId, "transfer.withdraw", o.id);
        return { ok: true as const };
      }

      if (command.action === "answer") {
        if (!s.players || clubSide !== "from") throw new AccessError("FORBIDDEN");
        if (!["sent", "discussing"].includes(o.status)) throw new AccessError("INVALID_TRANSITION", 409);
        if (command.decision === "accepted") {
          // The player (or a parent) agrees before any acceptance.
          if (o.player_consent !== "given") throw new AccessError("CONSENT_REQUIRED", 409);
          if (!marketOpen(rules, s.today)) throw new AccessError("MARKET_CLOSED", 409);
          if (!(await belowMax(s, rules, o.to_organization_id, o.season))) throw new AccessError("TRANSFER_LIMIT", 409);
        }
        await s.c.query("UPDATE transfer_offer SET status=$2,decision_note=$3,decided_by=$4,decided_at=now(),version=version+1 WHERE id=$1", [o.id, command.decision, command.note, s.userId]);
        await audit(s.c, s.org, s.userId, "transfer." + command.decision, o.id);
        await tell(s.c, [...(await officers(s.c, o.to_organization_id)), ...(await family(s.c, o.source_organization_id, o.source_profile_id))], command.decision, vars, o.id);
        if (command.decision === "accepted" && !rules.federationValidation) await complete(s, o, "accepted");
        return { ok: true as const };
      }

      // The federation validates (or refuses) an accepted offer.
      if (!s.federation) throw new AccessError("FORBIDDEN");
      if ((await s.c.query("SELECT federation_id FROM transfer_offer WHERE id=$1", [o.id])).rows[0].federation_id !== s.fed) throw new AccessError("NOT_FOUND", 404);
      if (o.status !== "accepted" || o.completed_at) throw new AccessError("INVALID_TRANSITION", 409);
      await s.c.query("UPDATE transfer_offer SET federation_by=$2,federation_at=now(),federation_note=$3,version=version+1 WHERE id=$1", [o.id, s.userId, command.note]);
      if (command.decision === "refused") {
        await s.c.query("UPDATE transfer_offer SET status='refused' WHERE id=$1", [o.id]);
        await audit(s.c, s.org, s.userId, "transfer.federation.refused", o.id);
        const people = [...(await officers(s.c, o.to_organization_id)), ...(await officers(s.c, o.source_organization_id))];
        await tell(s.c, people, "refused", vars, o.id);
        return { ok: true as const };
      }
      await complete(s, o, "validated");
      await audit(s.c, s.org, s.userId, "transfer.federation.validated", o.id);
      return { ok: true as const };
    },
    expected,
  );
}

/** The conversations of the clubs' offers, for the messages page and the offer window. */
export async function threadsView(db: Pool, p: Principal, offer?: string) {
  return scope(db, p, false, async (s) => {
    if (!s.players) return { organization_id: s.org, threads: [] };
    const offers = (
      await s.c.query(`${offerSql} WHERE (t.to_organization_id=$1 OR t.from_organization_id=$1) AND t.from_organization_id IS NOT NULL AND ($2::uuid IS NULL OR t.id=$2) ORDER BY t.created_at DESC LIMIT 100`, [
        s.org,
        offer ?? null,
      ])
    ).rows as Offer[];
    const messages = (
      await s.c.query(
        `SELECT m.id,m.offer_id,m.body,m.created_at,u.name AS sender,o.name AS club,m.sender_id=$2 AS mine FROM transfer_message m JOIN "user" u ON u.id=m.sender_id JOIN organization o ON o.id=m.organization_id
          WHERE m.offer_id=ANY($1::uuid[]) ORDER BY m.created_at`,
        [offers.map((o) => o.id), s.userId],
      )
    ).rows as { id: string; offer_id: string; body: string; created_at: string; sender: string; club: string; mine: boolean }[];
    return {
      organization_id: s.org,
      threads: offers.map((o) => ({ ...shown(o), side: (o.to_organization_id === s.org ? "to" : "from") as "to" | "from", messages: messages.filter((m) => m.offer_id === o.id) })),
    };
  });
}
