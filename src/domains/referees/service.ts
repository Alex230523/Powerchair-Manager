import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { pdfDocument } from "../../lib/pdf";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { fedCan } from "../access/policy";
import { publish } from "../notifications/queue";
import { fromOurSide, officialKinds } from "../competitions/schema";
import type { IcsEvent } from "../calendar/ics";
import { mirrorTournamentReferee } from "./mirror";
import { expenseAmount, refereeingCommand, reviewOpen, routeLinks, type RefereeingCommand } from "./schema";
import type { z } from "zod";

/**
 * 25 and 36 to 39: one refereeing circuit for club matches and tournament
 * matches. The federation (or a delegate with the refereeing competence)
 * designates with the help of availability, level, season load and
 * conflicts; the referee answers, finds his designations in his calendar
 * feed, is reminded the day before, reports on his phone, claims his
 * expenses and adds his trainings. A referee only sees his own matches and
 * what refereeing needs: never health, dues or the players' contact details.
 */
type Ctx = { c: PoolClient; fed: string; userId: string; role: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const manage = mfa && fedCan(a.role, a.grants, "federation.referees");
    if (a.role !== "referee" && !manage) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, fed: a.organization_id, userId: p.userId, role: a.role, manage });
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
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const seasonStart = () => {
  const d = today();
  return Number(d.slice(5, 7)) >= 8 ? `${d.slice(0, 4)}-08-01` : `${Number(d.slice(0, 4)) - 1}-08-01`;
};

/** Every match to cover, club or tournament, with its designations. */
const matchesSql = `
  SELECT 'match' AS kind,m.id,concat_ws(' · ',o.name||' '||t.name,m.opponent) AS label,m.starts_at,(m.starts_at AT TIME ZONE 'Europe/Brussels')::date::text AS day,m.venue,
         ARRAY[m.organization_id] AS clubs,NULL::uuid AS day_id,m.status
    FROM match m JOIN organization o ON o.id=m.organization_id JOIN team t ON t.id=m.team_id
   WHERE o.federation_id=$1 AND m.kind=ANY($2) AND m.status IN ('scheduled','postponed','played') AND m.starts_at>=now()-interval '14 days'
  UNION ALL
  SELECT 'tournament',tm.id,concat_ws(' · ',tr.name,h.name||' vs '||aw.name),(d.day+tm.kickoff) AT TIME ZONE 'Europe/Brussels',d.day::text,d.venue,
         ARRAY[tm.home_organization_id,tm.away_organization_id],d.id,CASE WHEN tm.home_score IS NULL THEN 'scheduled' ELSE 'played' END
    FROM tournament_match tm JOIN tournament tr ON tr.id=tm.tournament_id JOIN tournament_day d ON d.id=tm.day_id
    JOIN organization ow ON ow.id=tr.organization_id JOIN organization h ON h.id=tm.home_organization_id JOIN organization aw ON aw.id=tm.away_organization_id
   WHERE (ow.id=$1 OR ow.federation_id=$1) AND d.day>=CURRENT_DATE-14`;
type Target = { kind: "match" | "tournament"; id: string };
type MatchRow = { kind: "match" | "tournament"; id: string; label: string; starts_at: string; day: string; venue: string; clubs: string[]; day_id: string | null; status: string };

async function matchOf(c: PoolClient, fed: string, t: Target) {
  const r = (await c.query(`SELECT * FROM (${matchesSql}) x WHERE x.kind=$3 AND x.id=$4`, [fed, officialKinds, t.kind, t.id])).rows[0] as MatchRow | undefined;
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
}
const table = (t: Target) => (t.kind === "match" ? { name: "referee_assignment", col: "match_id" } : { name: "tournament_referee_assignment", col: "tournament_match_id" });

async function tell(c: PoolClient, fed: string, userId: string, key: string, title: Record<Locale, string>, message: Record<Locale, string>, path: string) {
  const u = (await c.query('SELECT u.id,u.email,u.name,COALESCE(pe.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1 AND u.active', [userId])).rows[0] as
    | { id: string; email: string; name: string; locale: string }
    | undefined;
  if (!u) return;
  const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
  const club = (await c.query("SELECT name FROM organization WHERE id=$1", [fed])).rows[0]?.name as string;
  await publish(c, {
    organizationId: fed,
    userId: u.id,
    email: u.email,
    kind: "automation",
    category: "sport",
    resourceType: "automation",
    resourceId: key.split(":").slice(0, 2).join(":"),
    eventKey: `${key}:${u.id}`,
    locale,
    variables: { name: u.name, title: title[locale], message: message[locale], organization: club, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}${path}` },
  });
}
const proposedWords = {
  title: { fr: "Nouvelle désignation : {match}", nl: "Nieuwe aanduiding: {match}", en: "New appointment: {match}" },
  message: { fr: "Merci d'accepter ou de refuser dans votre espace arbitre.", nl: "Gelieve te aanvaarden of te weigeren in uw scheidsrechtersruimte.", en: "Please accept or decline in your referee space." },
};
const sub = (o: Record<Locale, string>, v: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, s.replace(/\{(\w+)\}/g, (_, x: string) => v[x] ?? "")])) as Record<Locale, string>;

async function designate(c: PoolClient, fed: string, by: string, t: Target, refereeId: string, role: string) {
  const m = await matchOf(c, fed, t);
  const ok = await c.query("SELECT 1 FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='referee' AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now())", [fed, refereeId]);
  if (!ok.rowCount) throw new AccessError("NOT_FOUND", 404);
  const tb = table(t);
  await c.query(
    `INSERT INTO ${tb.name}(${tb.col},federation_id,referee_id,role,assigned_by) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(${tb.col},referee_id) DO UPDATE SET role=EXCLUDED.role,status='proposed',assigned_by=EXCLUDED.assigned_by,assigned_at=now(),answered_at=NULL,reminded_at=NULL`,
    [t.id, fed, refereeId, role, by],
  );
  if (t.kind === "tournament") await mirrorTournamentReferee(c, t.id);
  await tell(c, fed, refereeId, `designation:${t.kind}:${t.id}:${Date.now()}`, sub(proposedWords.title, { match: m.label }), proposedWords.message, "/referee");
  await audit(c, fed, by, "referee.assign", t.id, { kind: t.kind, refereeId, role });
}

/** For the federation: what is to cover, who may, the claims and trainings to decide. For the referee: his own desk. */
export async function refereeingView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    const settings = (await x.c.query("SELECT referee_levels,referee_flat_cents,referee_km_rate_cents FROM organization WHERE id=$1", [x.fed])).rows[0] as { referee_levels: string[]; referee_flat_cents: number; referee_km_rate_cents: number };
    const designations = (
      await x.c.query(`SELECT d.kind,d.target_id,d.referee_id,u.name,d.role,d.status,d.answered_at FROM designation d JOIN "user" u ON u.id=d.referee_id WHERE d.federation_id=$1 AND d.status<>'withdrawn'`, [x.fed])
    ).rows as { kind: string; target_id: string; referee_id: string; name: string; role: string; status: string }[];
    if (x.manage) {
      const matches = (await x.c.query(`SELECT * FROM (${matchesSql}) x WHERE x.starts_at>=now()-interval '2 days' ORDER BY x.starts_at LIMIT 400`, [x.fed, officialKinds])).rows as MatchRow[];
      const referees = (
        await x.c.query(
          `SELECT u.id,u.name,COALESCE(rp.level,0) AS level,
                  (SELECT count(*)::int FROM designation d LEFT JOIN match m ON d.kind='match' AND m.id=d.target_id LEFT JOIN tournament_match tm ON d.kind='tournament' AND tm.id=d.target_id LEFT JOIN tournament_day td ON td.id=tm.day_id
                    WHERE d.referee_id=u.id AND d.federation_id=$1 AND d.status IN ('proposed','accepted') AND COALESCE((m.starts_at AT TIME ZONE 'Europe/Brussels')::date,td.day)>=$2::date) AS season,
                  COALESCE((SELECT array_agg(DISTINCT r2.organization_id) FROM role_assignment r2 JOIN organization o2 ON o2.id=r2.organization_id WHERE r2.user_id=u.id AND o2.kind='club' AND r2.revoked_at IS NULL),'{}') AS clubs,
                  COALESCE((SELECT array_agg(a.day::text) FROM referee_availability a WHERE a.federation_id=$1 AND a.user_id=u.id AND NOT a.available AND a.day>=CURRENT_DATE),'{}') AS unavailable
             FROM (SELECT DISTINCT r.user_id FROM role_assignment r WHERE r.organization_id=$1 AND r.role='referee' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now())) r
             JOIN "user" u ON u.id=r.user_id LEFT JOIN referee_profile rp ON rp.federation_id=$1 AND rp.user_id=u.id
            WHERE u.active ORDER BY u.name`,
          [x.fed, seasonStart()],
        )
      ).rows as { id: string; name: string; level: number; season: number; clubs: string[]; unavailable: string[] }[];
      // When each referee is already designated, for the « same time » warning.
      const busy = (
        await x.c.query(
          `SELECT d.referee_id,COALESCE(m.starts_at,(td.day+tm.kickoff) AT TIME ZONE 'Europe/Brussels') AS at FROM designation d LEFT JOIN match m ON d.kind='match' AND m.id=d.target_id
             LEFT JOIN tournament_match tm ON d.kind='tournament' AND tm.id=d.target_id LEFT JOIN tournament_day td ON td.id=tm.day_id
            WHERE d.federation_id=$1 AND d.status IN ('proposed','accepted')`,
          [x.fed],
        )
      ).rows as { referee_id: string; at: string }[];
      const trainings = (
        await x.c.query('SELECT t.id,t.title,t.done_on::text AS done_on,t.proof_filename,t.status,u.name FROM referee_training t JOIN "user" u ON u.id=t.user_id WHERE t.federation_id=$1 AND t.status=\'requested\' ORDER BY t.created_at', [x.fed])
      ).rows as { id: string; title: string; done_on: string; proof_filename: string | null; status: string; name: string }[];
      const expenses = (
        await x.c.query(
          `SELECT e.id,u.name,e.km::float AS km,e.amount_cents,e.note,e.status,e.reason,e.proof_filename,e.created_at FROM referee_expense e JOIN "user" u ON u.id=e.referee_id
            WHERE e.federation_id=$1 AND e.status IN ('submitted','approved') ORDER BY e.created_at`,
          [x.fed],
        )
      ).rows as { id: string; name: string; km: number; amount_cents: number; note: string; status: string; reason: string; proof_filename: string | null }[];
      return {
        organization_id: x.fed,
        year: Number(today().slice(0, 4)),
        me: x.userId,
        can: { manage: true, referee: x.role === "referee" },
        settings,
        matches: matches.map((m) => ({ ...m, designations: designations.filter((d) => d.kind === m.kind && d.target_id === m.id) })),
        referees: referees.map((r) => ({ ...r, busy: busy.filter((b) => b.referee_id === r.id).map((b) => new Date(b.at).toISOString()) })),
        trainings,
        expenses,
        mine: null,
      };
    }
    // The referee's desk (7).
    const mine = (
      await x.c.query(
        `SELECT d.kind,d.target_id AS id,d.role,d.status,x.label,x.starts_at,x.day,x.venue,x.status AS match_status,
                (d.kind='match' AND EXISTS (SELECT 1 FROM match_report r WHERE r.match_id=d.target_id)) AS reported,
                EXISTS (SELECT 1 FROM referee_expense e WHERE e.referee_id=d.referee_id AND e.status<>'refused' AND (e.match_id=d.target_id OR e.tournament_match_id=d.target_id)) AS claimed
           FROM designation d JOIN (${matchesSql}) x ON x.kind=d.kind AND x.id=d.target_id
          WHERE d.referee_id=$3 AND d.federation_id=$1 AND d.status IN ('proposed','accepted') ORDER BY x.starts_at`,
        [x.fed, officialKinds, x.userId],
      )
    ).rows as { kind: string; id: string; role: string; status: string; label: string; starts_at: string; day: string; venue: string; match_status: string; reported: boolean; claimed: boolean }[];
    const now = Date.now();
    const expenses = (
      await x.c.query("SELECT id,km::float AS km,amount_cents,status,reason,created_at FROM referee_expense WHERE referee_id=$1 AND federation_id=$2 ORDER BY created_at DESC LIMIT 50", [x.userId, x.fed])
    ).rows as { id: string; km: number; amount_cents: number; status: string; reason: string }[];
    const trainings = (await x.c.query("SELECT id,title,done_on::text AS done_on,status,note FROM referee_training WHERE user_id=$1 AND federation_id=$2 ORDER BY done_on DESC", [x.userId, x.fed])).rows as {
      id: string;
      title: string;
      done_on: string;
      status: string;
      note: string;
    }[];
    const answered = Number(
      (await x.c.query("SELECT count(*)::int AS n FROM referee_availability WHERE federation_id=$1 AND user_id=$2 AND day BETWEEN CURRENT_DATE AND CURRENT_DATE+30", [x.fed, x.userId])).rows[0].n,
    );
    // 4: the lineup (names and numbers only) to name the scorers and the cards.
    const toReport = [];
    for (const d of mine.filter((d) => d.status === "accepted" && d.kind === "match" && Date.parse(d.starts_at) <= now && !d.reported))
      toReport.push({
        ...d,
        lineup: (
          await x.c.query("SELECT mp.profile_id AS id,cp.full_name AS name,mp.jersey_number AS number FROM match_player mp JOIN club_person cp ON cp.id=mp.profile_id WHERE mp.match_id=$1 ORDER BY mp.jersey_number NULLS LAST,cp.full_name", [d.id])
        ).rows as { id: string; name: string; number: number | null }[],
      });
    const level = Number((await x.c.query("SELECT level FROM referee_profile WHERE federation_id=$1 AND user_id=$2", [x.fed, x.userId])).rows[0]?.level ?? 0);
    return {
      organization_id: x.fed,
      year: Number(today().slice(0, 4)),
      me: x.userId,
      can: { manage: false, referee: true },
      settings,
      matches: [],
      referees: [],
      trainings: [],
      expenses: [],
      mine: {
        level,
        levelName: settings.referee_levels[level] ?? "",
        proposals: mine.filter((d) => d.status === "proposed"),
        upcoming: mine.filter((d) => d.status === "accepted" && Date.parse(d.starts_at) > now).map((d) => ({ ...d, route: routeLinks(d.venue) })),
        toReport,
        toClaim: mine.filter((d) => d.status === "accepted" && Date.parse(d.starts_at) <= now && !d.claimed),
        expenses,
        trainings,
        availabilityMissing: Math.max(0, 30 - answered),
      },
    };
  });
}

export async function refereeingExecute(db: Pool, p: Principal, raw: z.input<typeof refereeingCommand>, expected: string) {
  const cmd: RefereeingCommand = refereeingCommand.parse(raw);
  if (cmd.action === "review") return reviewReport(db, p, cmd, expected);
  return scope(
    db,
    p,
    true,
    async (x) => {
      const need = () => {
        if (!x.manage) throw new AccessError("FORBIDDEN");
      };
      const referee = () => {
        if (x.role !== "referee") throw new AccessError("FORBIDDEN");
      };
      const bytes = (f: { mediaType: string; data: string } | null) => {
        if (!f) return null;
        const b = Buffer.from(f.data, "base64");
        const ok = b.length > 0 && b.length <= 5242880 && (f.mediaType === "application/pdf" ? b.subarray(0, 5).toString() === "%PDF-" : f.mediaType === "image/png" ? b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" : b[0] === 0xff && b[1] === 0xd8);
        if (!ok) throw new AccessError("INVALID_FILE", 400);
        return b;
      };
      switch (cmd.action) {
        case "designate":
          need();
          await designate(x.c, x.fed, x.userId, cmd.target, cmd.refereeId, cmd.role);
          return { id: cmd.target.id };
        case "designateDay": {
          need();
          // A whole tournament day: each of its matches, at once.
          const inDay = new Set((await x.c.query("SELECT id FROM tournament_match WHERE day_id=$1", [cmd.dayId])).rows.map((r) => r.id as string));
          for (const a of cmd.assignments) {
            if (!inDay.has(a.matchId)) throw new AccessError("NOT_FOUND", 404);
            await designate(x.c, x.fed, x.userId, { kind: "tournament", id: a.matchId }, a.refereeId, a.role);
          }
          return { id: cmd.dayId, count: cmd.assignments.length };
        }
        case "withdraw": {
          need();
          const tb = table(cmd.target);
          const r = await x.c.query(`UPDATE ${tb.name} SET status='withdrawn',answered_at=now() WHERE ${tb.col}=$1 AND referee_id=$2 AND federation_id=$3 AND status<>'withdrawn' RETURNING 1`, [cmd.target.id, cmd.refereeId, x.fed]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          if (cmd.target.kind === "tournament") await mirrorTournamentReferee(x.c, cmd.target.id);
          await audit(x.c, x.fed, x.userId, "referee.withdraw", cmd.target.id);
          return { id: cmd.target.id };
        }
        case "answer": {
          referee();
          const tb = table(cmd.target);
          const r = (
            await x.c.query(`UPDATE ${tb.name} SET status=$4,answered_at=now() WHERE ${tb.col}=$1 AND referee_id=$2 AND federation_id=$3 AND status IN ('proposed','accepted','declined') RETURNING role`, [
              cmd.target.id,
              x.userId,
              x.fed,
              cmd.accept ? "accepted" : "declined",
            ])
          ).rows[0] as { role: string } | undefined;
          if (!r) throw new AccessError("NOT_FOUND", 404);
          // A tournament's single « arbitre » field keeps following the main referee.
          if (cmd.target.kind === "tournament") await mirrorTournamentReferee(x.c, cmd.target.id);
          return { id: cmd.target.id };
        }
        case "level": {
          need();
          if (!(await x.c.query("SELECT 1 FROM role_assignment WHERE organization_id=$1 AND user_id=$2 AND role='referee'", [x.fed, cmd.userId])).rowCount) throw new AccessError("NOT_FOUND", 404);
          await x.c.query("INSERT INTO referee_profile(federation_id,user_id,level) VALUES($1,$2,$3) ON CONFLICT (federation_id,user_id) DO UPDATE SET level=EXCLUDED.level,updated_at=now()", [x.fed, cmd.userId, cmd.level]);
          return { id: cmd.userId };
        }
        case "settings":
          need();
          await x.c.query("UPDATE organization SET referee_levels=$2,referee_flat_cents=$3,referee_km_rate_cents=$4 WHERE id=$1", [x.fed, cmd.levels, cmd.flatCents, cmd.kmRateCents]);
          return { id: x.fed };
        case "training": {
          referee();
          const proof = bytes(cmd.proof);
          const id = (
            await x.c.query("INSERT INTO referee_training(federation_id,user_id,title,done_on,proof_filename,proof_type,proof) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              x.fed,
              x.userId,
              cmd.title,
              cmd.doneOn,
              cmd.proof?.filename ?? null,
              cmd.proof?.mediaType ?? null,
              proof,
            ])
          ).rows[0].id as string;
          return { id };
        }
        case "decideTraining": {
          need();
          const r = await x.c.query("UPDATE referee_training SET status=$3,note=$4,decided_by=$5,decided_at=now() WHERE id=$1 AND federation_id=$2 AND status='requested' RETURNING user_id", [
            cmd.id,
            x.fed,
            cmd.approve ? "approved" : "refused",
            cmd.note,
            x.userId,
          ]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "expense": {
          referee();
          const d = (await x.c.query("SELECT status FROM designation WHERE kind=$1 AND target_id=$2 AND referee_id=$3 AND federation_id=$4", [cmd.target.kind, cmd.target.id, x.userId, x.fed])).rows[0] as { status: string } | undefined;
          if (!d || d.status !== "accepted") throw new AccessError("NOT_ACCEPTED", 409);
          const m = await matchOf(x.c, x.fed, cmd.target);
          if (Date.parse(m.starts_at) > Date.now()) throw new AccessError("NOT_PLAYED_YET", 409);
          const s = (await x.c.query("SELECT referee_flat_cents,referee_km_rate_cents FROM organization WHERE id=$1", [x.fed])).rows[0] as { referee_flat_cents: number; referee_km_rate_cents: number };
          const proof = bytes(cmd.proof);
          const id = (
            await x.c.query(
              `INSERT INTO referee_expense(federation_id,referee_id,match_id,tournament_match_id,km,flat_cents,km_rate_cents,extra_cents,amount_cents,note,proof_filename,proof_type,proof)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
              [
                x.fed,
                x.userId,
                cmd.target.kind === "match" ? cmd.target.id : null,
                cmd.target.kind === "tournament" ? cmd.target.id : null,
                cmd.km,
                s.referee_flat_cents,
                s.referee_km_rate_cents,
                cmd.extraCents,
                expenseAmount(s.referee_flat_cents, s.referee_km_rate_cents, cmd.km, cmd.extraCents),
                cmd.note,
                cmd.proof?.filename ?? null,
                cmd.proof?.mediaType ?? null,
                proof,
              ],
            )
          ).rows[0].id as string;
          return { id };
        }
        case "decideExpense": {
          need();
          if (!cmd.approve && cmd.reason.length < 3) throw new AccessError("REASON_REQUIRED", 400);
          const r = await x.c.query("UPDATE referee_expense SET status=$3,reason=$4,decided_by=$5,decided_at=now() WHERE id=$1 AND federation_id=$2 AND status='submitted' RETURNING referee_id", [
            cmd.id,
            x.fed,
            cmd.approve ? "approved" : "refused",
            cmd.reason,
            x.userId,
          ]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "paid": {
          need();
          const r = await x.c.query("UPDATE referee_expense SET status='paid',paid_at=now() WHERE id=ANY($1::uuid[]) AND federation_id=$2 AND status='approved' RETURNING id", [cmd.ids, x.fed]);
          await audit(x.c, x.fed, x.userId, "referee.expenses_paid", x.fed, { count: r.rowCount });
          return { id: x.fed, count: r.rowCount };
        }
        case "report": {
          referee();
          const a = (
            await x.c.query("SELECT a.status,m.home,m.starts_at FROM referee_assignment a JOIN match m ON m.id=a.match_id WHERE a.match_id=$1 AND a.referee_id=$2 AND a.federation_id=$3", [cmd.matchId, x.userId, x.fed])
          ).rows[0] as { status: string; home: boolean; starts_at: string } | undefined;
          if (!a || a.status !== "accepted") throw new AccessError("NOT_ACCEPTED", 409);
          if (new Date(a.starts_at) > new Date()) throw new AccessError("NOT_PLAYED_YET", 409);
          // The players named come from the lineup: the server writes their names (the phone keeps only ids).
          const lineup = new Map(
            ((await x.c.query("SELECT mp.profile_id,cp.full_name FROM match_player mp JOIN club_person cp ON cp.id=mp.profile_id WHERE mp.match_id=$1", [cmd.matchId])).rows as { profile_id: string; full_name: string }[]).map((r) => [r.profile_id, r.full_name]),
          );
          const events = cmd.events.map((e) => {
            if (!e.profileId) return e;
            const name = lineup.get(e.profileId);
            if (!name) throw new AccessError("NOT_FOUND", 404);
            return { ...e, player: name };
          });
          const saved = await x.c.query(
            `INSERT INTO match_report(match_id,referee_id,home_score,away_score,incidents,events,reserves) VALUES($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT(match_id) DO UPDATE SET referee_id=EXCLUDED.referee_id,home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,incidents=EXCLUDED.incidents,events=EXCLUDED.events,reserves=EXCLUDED.reserves,submitted_at=now(),validated_at=NULL
             WHERE match_report.validated_at IS NULL RETURNING 1`,
            [cmd.matchId, x.userId, cmd.homeScore, cmd.awayScore, cmd.incidents, JSON.stringify(events), cmd.reserves],
          );
          // A validated report has fed the stats: it no longer changes (it would count twice).
          if (!saved.rowCount) throw new AccessError("REPORT_VALIDATED", 409);
          await x.c.query("DELETE FROM match_report_review WHERE match_id=$1", [cmd.matchId]);
          const ours = fromOurSide(a.home, cmd.homeScore, cmd.awayScore);
          await x.c.query("UPDATE match SET our_score=COALESCE(our_score,$2),their_score=COALESCE(their_score,$3),status='played',version=version+1 WHERE id=$1 AND status IN ('scheduled','played')", [
            cmd.matchId,
            ours.our,
            ours.their,
          ]);
          return { id: cmd.matchId };
        }
      }
      return { id: "" };
    },
    expected,
  );
}

/** 4: the stats take a validated report: goals and cards of the club's players named in it. */
async function validate(c: PoolClient, matchId: string) {
  const r = (await c.query("UPDATE match_report SET validated_at=now() WHERE match_id=$1 AND validated_at IS NULL RETURNING events", [matchId])).rows[0] as { events: { kind: string; side: string; profileId: string | null }[] } | undefined;
  if (!r) return;
  const m = (await c.query("SELECT home,organization_id FROM match WHERE id=$1", [matchId])).rows[0] as { home: boolean; organization_id: string };
  const ours = m.home ? "home" : "away";
  for (const e of r.events.filter((e) => e.side === ours && e.profileId)) {
    const set = e.kind === "goal" ? "goals=LEAST(goals+1,50)" : e.kind === "yellow" ? "yellow_cards=LEAST(yellow_cards+1,2)" : "red_card=true";
    await c.query(`UPDATE match_player SET ${set} WHERE match_id=$1 AND organization_id=$2 AND profile_id=$3`, [matchId, m.organization_id, e.profileId]);
  }
}

/** 4: the club's coach (or president) confirms or contests the report within 48 hours. */
async function reviewReport(db: Pool, p: Principal, cmd: Extract<RefereeingCommand, { action: "review" }>, expected: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club" || !["club_president", "coach"].includes(a.role)) throw new AccessError("FORBIDDEN");
    const r = (await c.query("SELECT r.submitted_at,m.organization_id,m.team_id FROM match_report r JOIN match m ON m.id=r.match_id WHERE r.match_id=$1 AND m.organization_id=$2", [cmd.matchId, a.organization_id])).rows[0] as
      | { submitted_at: string; organization_id: string; team_id: string }
      | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    if (a.role === "coach") {
      const coaches = await c.query(
        "SELECT 1 FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id JOIN person pe ON pe.id=cp.person_id WHERE m.team_id=$1 AND pe.user_id=$2 AND m.role='coach' AND NOT m.cancelled AND m.closed_at IS NULL",
        [r.team_id, p.userId],
      );
      if (!coaches.rowCount) throw new AccessError("FORBIDDEN");
    }
    if (!reviewOpen(r.submitted_at)) throw new AccessError("REVIEW_CLOSED", 409);
    await c.query(
      "INSERT INTO match_report_review(match_id,organization_id,user_id,decision,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT (match_id,organization_id) DO UPDATE SET user_id=EXCLUDED.user_id,decision=EXCLUDED.decision,comment=EXCLUDED.comment,created_at=now()",
      [cmd.matchId, a.organization_id, p.userId, cmd.decision, cmd.comment],
    );
    if (cmd.decision === "confirmed") await validate(c, cmd.matchId);
    else await c.query("UPDATE match_report SET validated_at=NULL WHERE match_id=$1", [cmd.matchId]);
    await audit(c, a.organization_id, p.userId, `report.${cmd.decision}`, cmd.matchId);
    await c.query("COMMIT");
    return { id: cmd.matchId };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** The report of a club match as the club sees it (for the review). */
export async function reportForClub(db: Pool, p: Principal, matchId: string) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("FORBIDDEN");
    const r = (
      await c.query(
        `SELECT r.home_score,r.away_score,r.events,r.incidents,r.reserves,r.submitted_at,r.validated_at,u.name AS referee,v.decision,v.comment
           FROM match_report r JOIN match m ON m.id=r.match_id JOIN "user" u ON u.id=r.referee_id LEFT JOIN match_report_review v ON v.match_id=r.match_id AND v.organization_id=m.organization_id
          WHERE r.match_id=$1 AND m.organization_id=$2`,
        [matchId, a.organization_id],
      )
    ).rows[0];
    return { organization_id: a.organization_id, report: r ?? null, open: r ? reviewOpen(r.submitted_at) : false, can: { review: ["club_president", "coach"].includes(a.role) } };
  } finally {
    c.release();
  }
}

/** 3: the referee's accepted designations, for his private calendar feed. */
export async function designationEvents(c: PoolClient, fed: string, userId: string): Promise<(IcsEvent & { id: string })[]> {
  const rows = (
    await c.query(
      `SELECT x.kind,x.id,x.label,x.starts_at,x.venue,d.answered_at FROM designation d JOIN (${matchesSql}) x ON x.kind=d.kind AND x.id=d.target_id
        WHERE d.referee_id=$3 AND d.federation_id=$1 AND d.status='accepted'`,
      [fed, officialKinds, userId],
    )
  ).rows as { kind: string; id: string; label: string; starts_at: string; venue: string; answered_at: string | null }[];
  return rows.map((r) => ({
    id: `designation-${r.kind}-${r.id}`,
    title: `Arbitrage : ${r.label}`,
    starts_at: new Date(r.starts_at),
    ends_at: new Date(Date.parse(r.starts_at) + 2 * 3600000),
    updated_at: new Date(r.answered_at ?? r.starts_at),
    version: 1,
    status: "scheduled",
    location: r.venue,
  }));
}

/** Once a day: one reminder for a proposal left 3 days unanswered, the eve's reminder with the place and the route, reports left 48 h without a contest validated. */
export async function refereeingTick(db: Pool) {
  const c = await db.connect();
  let sent = 0;
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    for (const tb of [table({ kind: "match", id: "" }), table({ kind: "tournament", id: "" })]) {
      const late = (await c.query(`UPDATE ${tb.name} SET reminded_at=now() WHERE status='proposed' AND reminded_at IS NULL AND assigned_at<now()-interval '3 days' RETURNING ${tb.col} AS target,referee_id,federation_id`)).rows as {
        target: string;
        referee_id: string;
        federation_id: string;
      }[];
      for (const l of late) {
        await tell(c, l.federation_id, l.referee_id, `designation:remind:${l.target}`, sub(proposedWords.title, { match: "" }), proposedWords.message, "/referee");
        sent++;
      }
    }
    const tomorrow: { federation_id: string; referee_id: string; kind: string; id: string; label: string; starts_at: string; venue: string }[] = [];
    for (const f of (await c.query("SELECT DISTINCT federation_id FROM designation WHERE status='accepted'")).rows as { federation_id: string }[])
      tomorrow.push(
        ...(
          await c.query(
            `SELECT d.federation_id,d.referee_id,x.kind,x.id,x.label,x.starts_at,x.venue FROM (${matchesSql}) x
               JOIN designation d ON d.kind=x.kind AND d.target_id=x.id AND d.federation_id=$1
              WHERE d.status='accepted' AND (x.starts_at AT TIME ZONE 'Europe/Brussels')::date=CURRENT_DATE+1`,
            [f.federation_id, officialKinds],
          )
        ).rows,
      );
    for (const t of tomorrow) {
      const at = new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(t.starts_at));
      const route = routeLinks(t.venue);
      const links = route ? ` Google Maps : ${route.google} · Waze : ${route.waze}` : "";
      await tell(
        c,
        t.federation_id,
        t.referee_id,
        `designation:eve:${t.kind}:${t.id}`,
        { fr: `Demain ${at} : ${t.label}`, nl: `Morgen ${at}: ${t.label}`, en: `Tomorrow ${at}: ${t.label}` },
        { fr: `${t.venue}.${links}`, nl: `${t.venue}.${links}`, en: `${t.venue}.${links}` },
        "/referee",
      );
      sent++;
    }
    // 48 hours without a contest: the report counts.
    for (const r of (await c.query("SELECT r.match_id FROM match_report r WHERE r.validated_at IS NULL AND r.submitted_at<now()-interval '48 hours' AND NOT EXISTS (SELECT 1 FROM match_report_review v WHERE v.match_id=r.match_id AND v.decision='contested')")).rows)
      await validate(c, r.match_id as string);
    await c.query("COMMIT");
    return sent;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** 37: the approved claims to pay (CSV for the bank transfer). */
export async function expensesCsv(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    if (!x.manage) throw new AccessError("FORBIDDEN");
    const rows = (
      await x.c.query('SELECT u.name,e.km::float AS km,e.amount_cents,e.note,e.created_at FROM referee_expense e JOIN "user" u ON u.id=e.referee_id WHERE e.federation_id=$1 AND e.status=\'approved\' ORDER BY u.name,e.created_at', [x.fed])
    ).rows as { name: string; km: number; amount_cents: number; note: string; created_at: Date }[];
    const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return ["Arbitre;Km;Montant (EUR);Note;Déclarée le", ...rows.map((r) => [r.name, String(r.km), (r.amount_cents / 100).toFixed(2), r.note, new Date(r.created_at).toISOString().slice(0, 10)].map(cell).join(";"))].join("\n");
  });
}

/** 37: a referee's yearly summary (PDF): his matches and claims of the year. */
export async function annualSummary(db: Pool, p: Principal, refereeId: string, year: number) {
  return scope(db, p, false, async (x) => {
    if (!x.manage && refereeId !== x.userId) throw new AccessError("NOT_FOUND", 404);
    const who = (await x.c.query('SELECT u.name,o.name AS fed FROM "user" u JOIN organization o ON o.id=$2 WHERE u.id=$1', [refereeId, x.fed])).rows[0] as { name: string; fed: string } | undefined;
    if (!who) throw new AccessError("NOT_FOUND", 404);
    const rows = (
      await x.c.query("SELECT km::float AS km,amount_cents,status,created_at FROM referee_expense WHERE federation_id=$1 AND referee_id=$2 AND extract(year FROM created_at)=$3 AND status IN ('approved','paid') ORDER BY created_at", [
        x.fed,
        refereeId,
        year,
      ])
    ).rows as { km: number; amount_cents: number; status: string; created_at: Date }[];
    const total = rows.reduce((a, r) => a + r.amount_cents, 0);
    const km = rows.reduce((a, r) => a + r.km, 0);
    const lines = [
      { text: who.fed, bold: true, size: 12 },
      { text: `Récapitulatif d'arbitrage ${year}`, bold: true, size: 16, gap: 16 },
      { text: who.name, size: 12, gap: 8 },
      ...rows.map((r) => ({ text: `${new Date(r.created_at).toISOString().slice(0, 10)} · ${r.km} km · ${(r.amount_cents / 100).toFixed(2)} EUR · ${r.status === "paid" ? "payé" : "à payer"}`, size: 10 })),
      { text: `Total : ${rows.length} note(s) · ${km} km · ${(total / 100).toFixed(2)} EUR`, bold: true, size: 11, gap: 12 },
    ];
    return { bytes: pdfDocument(lines, `Arbitrage ${year}`), filename: `arbitrage-${year}.pdf` };
  });
}

/** A training's or a claim's proof, for the federation's refereeing (or its author). */
export async function refereeProof(db: Pool, p: Principal, kind: "training" | "expense", id: string) {
  return scope(db, p, false, async (x) => {
    const r = (
      await x.c.query(
        kind === "training"
          ? "SELECT proof_filename AS filename,proof_type AS media_type,proof AS content,user_id AS owner FROM referee_training WHERE id=$1 AND federation_id=$2"
          : "SELECT proof_filename AS filename,proof_type AS media_type,proof AS content,referee_id AS owner FROM referee_expense WHERE id=$1 AND federation_id=$2",
        [id, x.fed],
      )
    ).rows[0] as { filename: string | null; media_type: string | null; content: Buffer | null; owner: string } | undefined;
    if (!r || !r.content || (!x.manage && r.owner !== x.userId)) throw new AccessError("NOT_FOUND", 404);
    return r as { filename: string; media_type: string; content: Buffer };
  });
}
