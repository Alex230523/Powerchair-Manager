import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { fedCan } from "../access/policy";
import { publish } from "../notifications/queue";
import { autoEntry } from "../finance/auto";
import { appealOpen, defaultRule, disciplineCommand, nearThreshold, remainingOf, seasonOfDay, yellowTriggers, type Competition, type DisciplineCommand, type Rule } from "./schema";
import type { z } from "zod";

/**
 * 34: the federation's discipline. The cards of the validated reports and
 * results are counted under the rules of the match's season; a series of
 * yellows or a red proposes a sanction, the federation (or a delegate with
 * the discipline competence) confirms, modifies or cancels it. A suspended
 * player cannot be put on a team sheet until his team has played the
 * matches it covers. The club appeals within the delay and pays its fines.
 */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
type RuleRow = { id: string | null } & Rule;

async function ruleFor(c: PoolClient, fed: string, season: string): Promise<RuleRow> {
  const r = (
    await c.query(
      `SELECT id,yellow_threshold,yellow_matches,red_matches,kinds,reset,yellow_fine_cents,red_fine_cents,appeal_days FROM discipline_rule WHERE federation_id=$1 AND season=$2 ORDER BY version DESC LIMIT 1`,
      [fed, season],
    )
  ).rows[0];
  if (!r) return { id: null, ...defaultRule };
  return {
    id: r.id,
    yellowThreshold: r.yellow_threshold,
    yellowMatches: r.yellow_matches,
    redMatches: r.red_matches,
    kinds: r.kinds,
    reset: r.reset,
    yellowFineCents: r.yellow_fine_cents,
    redFineCents: r.red_fine_cents,
    appealDays: r.appeal_days,
  };
}

export type Card = { organizationId: string; profileId: string; kind: "yellow" | "red"; competition: Competition; matchId?: string; tournamentMatchId?: string; playedAt: Date | string; seq?: number };
/**
 * 2: the cards of a validated report or result. Each card is counted once
 * (a report validated again adds nothing); a red, or a yellow that completes
 * a series, proposes a sanction to the federation.
 */
export async function recordCards(c: PoolClient, cards: Card[]) {
  let proposed = 0;
  for (const card of cards) {
    const fed = (await c.query("SELECT CASE WHEN kind='federation' THEN id ELSE federation_id END AS fed FROM organization WHERE id=$1", [card.organizationId])).rows[0]?.fed as string | null;
    if (!fed) continue;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(card.playedAt));
    const season = seasonOfDay(day);
    const inserted = (
      await c.query(
        `INSERT INTO discipline_card(federation_id,organization_id,profile_id,season,kind,competition,match_id,tournament_match_id,seq,played_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING RETURNING id`,
        [fed, card.organizationId, card.profileId, season, card.kind, card.competition, card.matchId ?? null, card.tournamentMatchId ?? null, card.seq ?? 1, card.playedAt],
      )
    ).rows[0]?.id as string | undefined;
    if (!inserted) continue;
    const rule = await ruleFor(c, fed, season);
    if (!rule.kinds.includes(card.competition)) continue;
    let cause: "red" | "yellows" | null = null;
    if (card.kind === "red") cause = "red";
    else {
      const count = Number(
        (
          await c.query(
            "SELECT count(*)::int AS n FROM discipline_card WHERE federation_id=$1 AND profile_id=$2 AND kind='yellow' AND competition=ANY($3::text[]) AND ($4='never' OR season=$5)",
            [fed, card.profileId, rule.kinds, rule.reset, season],
          )
        ).rows[0].n,
      );
      if (yellowTriggers(count, rule.yellowThreshold)) cause = "yellows";
    }
    if (!cause) continue;
    await c.query(
      `INSERT INTO discipline_sanction(federation_id,organization_id,profile_id,target,cause,card_id,season,rule_id,matches,kinds,fine_cents)
       VALUES($1,$2,$3,'player',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
      [fed, card.organizationId, card.profileId, cause, inserted, season, rule.id, cause === "red" ? rule.redMatches : rule.yellowMatches, rule.kinds, cause === "red" ? rule.redFineCents : rule.yellowFineCents],
    );
    proposed++;
  }
  return proposed;
}

type SanctionRow = {
  id: string;
  federation_id: string;
  organization_id: string;
  club: string;
  profile_id: string | null;
  name: string | null;
  target: "player" | "coach" | "club";
  cause: "yellows" | "red" | "manual";
  season: string;
  matches: number;
  kinds: string[];
  fine_cents: number;
  summary: string;
  status: "proposed" | "confirmed" | "cancelled";
  reason: string;
  decided_at: string | null;
  appeal_until: string | null;
  created_at: string;
  card_match: string | null;
};
const sanctionSql = `
  SELECT s.id,s.federation_id,s.organization_id,o.name AS club,s.profile_id,cp.full_name AS name,s.target,s.cause,s.season,s.matches,s.kinds,s.fine_cents,s.summary,s.status,s.reason,
         s.decided_at,s.appeal_until::text AS appeal_until,s.created_at,
         COALESCE(m.opponent,th.name||' vs '||ta.name) AS card_match
    FROM discipline_sanction s JOIN organization o ON o.id=s.organization_id LEFT JOIN club_person cp ON cp.id=s.profile_id
    LEFT JOIN discipline_card dc ON dc.id=s.card_id LEFT JOIN match m ON m.id=dc.match_id
    LEFT JOIN tournament_match tm ON tm.id=dc.tournament_match_id LEFT JOIN organization th ON th.id=tm.home_organization_id LEFT JOIN organization ta ON ta.id=tm.away_organization_id`;

/** 4: the matches of the team (club and tournament) played since the decision, in the competitions concerned. */
async function served(c: PoolClient, s: { organization_id: string; profile_id: string | null; kinds: string[]; decided_at: string | null }) {
  if (!s.decided_at) return 0;
  const r = await c.query(
    `SELECT (SELECT count(*)::int FROM match m WHERE m.organization_id=$1 AND m.status='played' AND m.kind=ANY($3::text[]) AND m.starts_at>$4
               AND ($2::uuid IS NULL OR m.team_id IN (SELECT tm.team_id FROM team_membership tm WHERE tm.organization_id=$1 AND tm.profile_id=$2 AND NOT tm.cancelled)))
          + (CASE WHEN 'tournament'=ANY($3::text[]) THEN (SELECT count(*)::int FROM tournament_match tm JOIN tournament_day d ON d.id=tm.day_id
               WHERE $1 IN (tm.home_organization_id,tm.away_organization_id) AND tm.status IN ('reported','validated') AND ((d.day+tm.kickoff) AT TIME ZONE 'Europe/Brussels')>$4) ELSE 0 END) AS n`,
    [s.organization_id, s.profile_id, s.kinds, s.decided_at],
  );
  return Number(r.rows[0].n);
}
async function withRemaining(c: PoolClient, rows: SanctionRow[]) {
  const out = [];
  for (const s of rows) {
    const done = s.status === "confirmed" ? await served(c, s) : 0;
    out.push({ ...s, served: done, remaining: s.status === "confirmed" ? remainingOf(s.matches, done) : s.status === "proposed" ? s.matches : 0 });
  }
  return out;
}

/** 4: the players of a club under a suspension still running, with its reason and what remains. */
export async function suspensionsFor(c: PoolClient, org: string, profileIds: string[]) {
  if (!profileIds.length) return new Map<string, { remaining: number; summary: string; cause: string }>();
  const rows = (await c.query(`${sanctionSql} WHERE s.organization_id=$1 AND s.profile_id=ANY($2::uuid[]) AND s.status='confirmed' AND s.matches>0`, [org, profileIds])).rows as SanctionRow[];
  const map = new Map<string, { remaining: number; summary: string; cause: string }>();
  for (const s of await withRemaining(c, rows)) {
    if (s.remaining <= 0 || !s.profile_id) continue;
    const prev = map.get(s.profile_id);
    map.set(s.profile_id, { remaining: (prev?.remaining ?? 0) + s.remaining, summary: s.summary, cause: s.cause });
  }
  return map;
}

async function tell(c: PoolClient, org: string, users: string[], key: string, title: Record<Locale, string>, message: Record<Locale, string>, path: string) {
  const list = (
    await c.query('SELECT u.id,u.email,u.name,COALESCE(pe.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=ANY($1::text[]) AND u.active', [[...new Set(users)]])
  ).rows as { id: string; email: string; name: string; locale: string }[];
  const name = (await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0]?.name as string;
  for (const u of list) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "sport",
      resourceType: "automation",
      resourceId: key.split(":").slice(0, 2).join(":"),
      eventKey: `${key}:${u.id}`,
      locale,
      variables: { name: u.name, title: title[locale], message: message[locale], organization: name, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}${path}` },
    });
  }
  return list.length;
}
/** 3: the club's presidency, the player (or his parents) and his coaches. */
async function concerned(c: PoolClient, org: string, profile: string | null) {
  const presidents = (await c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL", [org])).rows.map((r) => r.user_id as string);
  if (!profile) return presidents;
  const own = (await c.query("SELECT pe.user_id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND pe.user_id IS NOT NULL", [profile])).rows.map((r) => r.user_id as string);
  const parents = (
    await c.query(
      `SELECT pe.user_id FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id AND gp.organization_id=g.organization_id JOIN person pe ON pe.id=gp.person_id
        WHERE g.organization_id=$1 AND g.subject_profile_id=$2 AND g.can_view AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND pe.user_id IS NOT NULL`,
      [org, profile],
    )
  ).rows.map((r) => r.user_id as string);
  const coaches = (
    await c.query(
      `SELECT DISTINCT pe.user_id FROM team_membership p JOIN team_membership k ON k.team_id=p.team_id AND k.role='coach' AND NOT k.cancelled AND k.closed_at IS NULL
         JOIN club_person cp ON cp.id=k.profile_id JOIN person pe ON pe.id=cp.person_id
        WHERE p.organization_id=$1 AND p.profile_id=$2 AND NOT p.cancelled AND p.closed_at IS NULL AND pe.user_id IS NOT NULL`,
      [org, profile],
    )
  ).rows.map((r) => r.user_id as string);
  return [...presidents, ...own, ...parents, ...coaches];
}
const words = {
  decided: {
    title: { fr: "Décision disciplinaire : {who}", nl: "Tuchtbeslissing: {who}", en: "Disciplinary decision: {who}" },
    message: {
      fr: "{matches} match(s) de suspension{fine}. Recours possible jusqu'au {until} depuis la page Discipline du club.",
      nl: "{matches} wedstrijd(en) schorsing{fine}. Beroep mogelijk tot {until} via de pagina Tucht van de club.",
      en: "{matches} match(es) of suspension{fine}. Appeal possible until {until} from the club's Discipline page.",
    },
  },
  appeal: {
    accepted: { fr: "Recours accepté : la sanction est annulée.", nl: "Beroep aanvaard: de sanctie is geschrapt.", en: "Appeal accepted: the sanction is cancelled." },
    rejected: { fr: "Recours rejeté : la sanction est maintenue.", nl: "Beroep verworpen: de sanctie blijft.", en: "Appeal rejected: the sanction stands." },
    title: { fr: "Recours : {who}", nl: "Beroep: {who}", en: "Appeal: {who}" },
  },
};
const sub = (o: Record<Locale, string>, v: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, s.replace(/\{(\w+)\}/g, (_, x: string) => v[x] ?? "")])) as Record<Locale, string>;
const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",") + " EUR";

/** 2, 3 and 5: a sanction takes effect: the delay to appeal opens, the people are told, the fine is owed. */
async function apply(c: PoolClient, s: { id: string; federation_id: string; organization_id: string; profile_id: string | null; matches: number; fine_cents: number; season: string; name: string | null; club: string }, by: string) {
  const rule = await ruleFor(c, s.federation_id, s.season);
  const until = (await c.query("SELECT (CURRENT_DATE+$1::int)::text AS d", [rule.appealDays])).rows[0].d as string;
  await c.query("UPDATE discipline_sanction SET status='confirmed',decided_by=$2,decided_at=now(),appeal_until=$3 WHERE id=$1", [s.id, by, until]);
  if (s.fine_cents > 0) {
    const fine = (
      await c.query(
        "INSERT INTO discipline_fine(sanction_id,federation_id,organization_id,amount_cents,due_on) VALUES($1,$2,$3,$4,CURRENT_DATE+30) ON CONFLICT (sanction_id) DO UPDATE SET amount_cents=EXCLUDED.amount_cents,status='due' RETURNING id",
        [s.id, s.federation_id, s.organization_id, s.fine_cents],
      )
    ).rows[0].id as string;
    const president = (await c.query("SELECT user_id FROM role_assignment WHERE organization_id=$1 AND role='club_president' AND revoked_at IS NULL ORDER BY created_at LIMIT 1", [s.organization_id])).rows[0]?.user_id as string | undefined;
    await c.query(
      `INSERT INTO task(organization_id,kind,category,title,due_on,responsible_user_id,origin,created_by,source_key,source_kind,source_params,amount_cents)
       VALUES($1,'other','affiliation',$2,CURRENT_DATE+30,$3,'condition',$4,$5,'disciplineFine',$6,$7) ON CONFLICT DO NOTHING`,
      [s.organization_id, `Payer l'amende : ${s.name ?? s.club}`.slice(0, 200), president ?? null, by, `discipline:fine:${fine}`, JSON.stringify({ about: s.name ?? s.club }), s.fine_cents],
    );
  }
  const who = s.name ?? s.club;
  await tell(
    c,
    s.organization_id,
    await concerned(c, s.organization_id, s.profile_id),
    `discipline:${s.id}:decided`,
    sub(words.decided.title, { who }),
    sub(
      Object.fromEntries((["fr", "nl", "en"] as const).map((l) => [l, words.decided.message[l]])) as Record<Locale, string>,
      { matches: String(s.matches), fine: s.fine_cents ? ` · ${euros(s.fine_cents)}` : "", until },
    ),
    "/discipline",
  );
  return until;
}

type Ctx = { c: PoolClient; org: string; kind: "federation" | "club"; role: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    let manage = false;
    if (a.kind === "federation") {
      manage = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled) && fedCan(a.role, a.grants, "federation.discipline");
      if (!manage) throw new AccessError("FORBIDDEN");
    } else if (a.kind !== "club" || !["club_president", "coach"].includes(a.role)) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, kind: a.kind as "federation" | "club", role: a.role, userId: p.userId, manage });
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

/** 6: the federation's desk, or the club's page. */
export async function disciplineView(db: Pool, p: Principal) {
  return scope(db, p, async (x) => {
    const day = today();
    const season = seasonOfDay(day);
    if (x.kind === "federation") {
      const rule = await ruleFor(x.c, x.org, season);
      const versions = (
        await x.c.query("SELECT season,version,created_at FROM discipline_rule WHERE federation_id=$1 ORDER BY season DESC,version DESC LIMIT 40", [x.org])
      ).rows as { season: string; version: number; created_at: string }[];
      const sanctions = await withRemaining(
        x.c,
        (await x.c.query(`${sanctionSql} WHERE s.federation_id=$1 AND (s.status='proposed' OR (s.status='confirmed' AND s.created_at>now()-interval '400 days')) ORDER BY s.created_at DESC LIMIT 300`, [x.org])).rows as SanctionRow[],
      );
      const yellows = (
        await x.c.query(
          `SELECT dc.profile_id,cp.full_name AS name,o.name AS club,count(*)::int AS n FROM discipline_card dc JOIN club_person cp ON cp.id=dc.profile_id JOIN organization o ON o.id=dc.organization_id
            WHERE dc.federation_id=$1 AND dc.kind='yellow' AND dc.competition=ANY($2::text[]) AND ($3='never' OR dc.season=$4) GROUP BY dc.profile_id,cp.full_name,o.name ORDER BY cp.full_name`,
          [x.org, rule.kinds, rule.reset, season],
        )
      ).rows as { profile_id: string; name: string; club: string; n: number }[];
      const appeals = (
        await x.c.query(
          `SELECT a.id,a.sanction_id,a.reason,a.file_name,a.created_at,o.name AS club,COALESCE(cp.full_name,o.name) AS who FROM discipline_appeal a JOIN discipline_sanction s ON s.id=a.sanction_id
             JOIN organization o ON o.id=s.organization_id LEFT JOIN club_person cp ON cp.id=s.profile_id WHERE s.federation_id=$1 AND a.status='open' ORDER BY a.created_at`,
          [x.org],
        )
      ).rows as { id: string; sanction_id: string; reason: string; file_name: string | null; club: string; who: string }[];
      const fines = (
        await x.c.query(
          "SELECT f.id,f.amount_cents,f.due_on::text AS due_on,f.status,f.paid_on::text AS paid_on,o.name AS club FROM discipline_fine f JOIN organization o ON o.id=f.organization_id WHERE f.federation_id=$1 AND f.status<>'cancelled' ORDER BY f.status,f.due_on LIMIT 200",
          [x.org],
        )
      ).rows as { id: string; amount_cents: number; due_on: string; status: string; paid_on: string | null; club: string }[];
      const clubs = (await x.c.query("SELECT id,name FROM organization WHERE federation_id=$1 AND kind='club' ORDER BY name", [x.org])).rows as { id: string; name: string }[];
      const people = (
        await x.c.query(
          `SELECT DISTINCT cp.id,cp.full_name AS name,cp.organization_id AS club_id,tm.role FROM team_membership tm JOIN club_person cp ON cp.id=tm.profile_id JOIN organization o ON o.id=cp.organization_id
            WHERE o.federation_id=$1 AND tm.role IN ('player','coach') AND NOT tm.cancelled AND tm.closed_at IS NULL AND cp.status='active' ORDER BY cp.full_name LIMIT 3000`,
          [x.org],
        )
      ).rows as { id: string; name: string; club_id: string; role: string }[];
      return {
        organization_id: x.org,
        kind: "federation" as const,
        today: day,
        season,
        rule,
        versions,
        proposed: sanctions.filter((s) => s.status === "proposed"),
        running: sanctions.filter((s) => s.status === "confirmed" && s.remaining > 0),
        decided: sanctions.filter((s) => s.status === "confirmed" && s.remaining === 0).slice(0, 50),
        near: yellows.filter((y) => nearThreshold(y.n, rule.yellowThreshold)),
        appeals,
        fines,
        clubs,
        people,
        can: { manage: true, appeal: false, pay: false },
      };
    }
    // The club: its sanctions, its appeals, its fines.
    const sanctions = await withRemaining(
      x.c,
      (await x.c.query(`${sanctionSql} WHERE s.organization_id=$1 AND s.status<>'proposed' ORDER BY s.created_at DESC LIMIT 200`, [x.org])).rows as SanctionRow[],
    );
    const appeals = (await x.c.query("SELECT sanction_id,status,decision FROM discipline_appeal WHERE organization_id=$1", [x.org])).rows as { sanction_id: string; status: string; decision: string }[];
    const fines = (
      await x.c.query("SELECT id,sanction_id,amount_cents,due_on::text AS due_on,status,paid_on::text AS paid_on FROM discipline_fine WHERE organization_id=$1 AND status<>'cancelled' ORDER BY status,due_on", [x.org])
    ).rows as { id: string; sanction_id: string; amount_cents: number; due_on: string; status: string; paid_on: string | null }[];
    const president = x.role === "club_president";
    return {
      organization_id: x.org,
      kind: "club" as const,
      today: day,
      season,
      sanctions: sanctions.map((s) => ({ ...s, appeal: appeals.find((a) => a.sanction_id === s.id) ?? null, canAppeal: president && s.status === "confirmed" && appealOpen(s.appeal_until, day) && !appeals.some((a) => a.sanction_id === s.id) })),
      fines,
      can: { manage: false, appeal: president, pay: president },
    };
  });
}

export async function disciplineExecute(db: Pool, p: Principal, raw: z.input<typeof disciplineCommand>, expected: string) {
  const cmd: DisciplineCommand = disciplineCommand.parse(raw);
  return scope(
    db,
    p,
    async (x) => {
      const fed = () => {
        if (x.kind !== "federation") throw new AccessError("FORBIDDEN");
      };
      const sanction = async (id: string, where: string) => {
        const s = (await x.c.query(`${sanctionSql} WHERE s.id=$1 AND ${where} FOR UPDATE OF s`, [id, x.org])).rows[0] as SanctionRow | undefined;
        if (!s) throw new AccessError("NOT_FOUND", 404);
        return s;
      };
      switch (cmd.action) {
        case "rules": {
          fed();
          const v = Number((await x.c.query("SELECT COALESCE(max(version),0)+1 AS v FROM discipline_rule WHERE federation_id=$1 AND season=$2", [x.org, cmd.season])).rows[0].v);
          const r = await x.c.query(
            `INSERT INTO discipline_rule(federation_id,season,version,yellow_threshold,yellow_matches,red_matches,kinds,reset,yellow_fine_cents,red_fine_cents,appeal_days,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
            [x.org, cmd.season, v, cmd.yellowThreshold, cmd.yellowMatches, cmd.redMatches, [...new Set(cmd.kinds)], cmd.reset, cmd.yellowFineCents, cmd.redFineCents, cmd.appealDays, x.userId],
          );
          await audit(x.c, x.org, x.userId, "discipline.rules", r.rows[0].id, { season: cmd.season, version: v });
          return { id: r.rows[0].id as string, version: v };
        }
        case "decide": {
          fed();
          const s = await sanction(cmd.id, "s.federation_id=$2 AND s.status='proposed'");
          if (cmd.decision !== "confirm" && !cmd.reason) throw new AccessError("REASON_REQUIRED", 400);
          if (cmd.decision === "cancel") {
            await x.c.query("UPDATE discipline_sanction SET status='cancelled',reason=$2,decided_by=$3,decided_at=now() WHERE id=$1", [s.id, cmd.reason, x.userId]);
            await audit(x.c, x.org, x.userId, "discipline.cancel", s.id);
            return { id: s.id };
          }
          const matches = cmd.decision === "modify" ? (cmd.matches ?? s.matches) : s.matches;
          const fine = cmd.decision === "modify" ? (cmd.fineCents ?? s.fine_cents) : s.fine_cents;
          await x.c.query("UPDATE discipline_sanction SET matches=$2,fine_cents=$3,reason=$4 WHERE id=$1", [s.id, matches, fine, cmd.reason]);
          const until = await apply(x.c, { ...s, matches, fine_cents: fine }, x.userId);
          await audit(x.c, x.org, x.userId, `discipline.${cmd.decision}`, s.id, { matches, fine });
          return { id: s.id, appealUntil: until };
        }
        case "manual": {
          fed();
          const club = (await x.c.query("SELECT name FROM organization WHERE id=$1 AND federation_id=$2 AND kind='club'", [cmd.clubId, x.org])).rows[0];
          if (!club) throw new AccessError("NOT_FOUND", 404);
          if ((cmd.target === "club") !== (cmd.profileId === null)) throw new AccessError("INVALID_INPUT", 400);
          let name: string | null = null;
          if (cmd.profileId) {
            const r = (await x.c.query("SELECT full_name FROM club_person WHERE id=$1 AND organization_id=$2", [cmd.profileId, cmd.clubId])).rows[0];
            if (!r) throw new AccessError("NOT_FOUND", 404);
            name = r.full_name;
          }
          const season = seasonOfDay(today());
          const rule = await ruleFor(x.c, x.org, season);
          const id = (
            await x.c.query(
              `INSERT INTO discipline_sanction(federation_id,organization_id,profile_id,target,cause,season,rule_id,matches,kinds,fine_cents,summary)
               VALUES($1,$2,$3,$4,'manual',$5,$6,$7,$8,$9,$10) RETURNING id`,
              [x.org, cmd.clubId, cmd.profileId, cmd.target, season, rule.id, cmd.matches, rule.kinds, cmd.fineCents, cmd.summary],
            )
          ).rows[0].id as string;
          const until = await apply(x.c, { id, federation_id: x.org, organization_id: cmd.clubId, profile_id: cmd.profileId, matches: cmd.matches, fine_cents: cmd.fineCents, season, name, club: club.name }, x.userId);
          await audit(x.c, x.org, x.userId, "discipline.manual", id, { target: cmd.target });
          return { id, appealUntil: until };
        }
        case "decideAppeal": {
          fed();
          const a = (
            await x.c.query(
              "SELECT a.id,a.sanction_id FROM discipline_appeal a JOIN discipline_sanction s ON s.id=a.sanction_id WHERE a.id=$1 AND s.federation_id=$2 AND a.status='open' FOR UPDATE OF a",
              [cmd.id, x.org],
            )
          ).rows[0] as { id: string; sanction_id: string } | undefined;
          if (!a) throw new AccessError("NOT_FOUND", 404);
          if (!cmd.accept && !cmd.decision) throw new AccessError("REASON_REQUIRED", 400);
          await x.c.query("UPDATE discipline_appeal SET status=$2,decision=$3,decided_by=$4,decided_at=now() WHERE id=$1", [a.id, cmd.accept ? "accepted" : "rejected", cmd.decision, x.userId]);
          const s = await sanction(a.sanction_id, "s.federation_id=$2");
          if (cmd.accept) {
            await x.c.query("UPDATE discipline_sanction SET status='cancelled',reason=$2 WHERE id=$1", [s.id, `Recours accepté. ${cmd.decision}`.trim()]);
            const f = (await x.c.query("UPDATE discipline_fine SET status='cancelled' WHERE sanction_id=$1 AND status='due' RETURNING id", [s.id])).rows[0];
            if (f) await x.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key=$2 AND status<>'done'", [s.organization_id, `discipline:fine:${f.id}`]);
          }
          const who = s.name ?? s.club;
          await tell(x.c, s.organization_id, await concerned(x.c, s.organization_id, s.profile_id), `discipline:${s.id}:appeal`, sub(words.appeal.title, { who }), cmd.accept ? words.appeal.accepted : words.appeal.rejected, "/discipline");
          await audit(x.c, x.org, x.userId, cmd.accept ? "discipline.appealAccepted" : "discipline.appealRejected", s.id);
          return { id: a.id };
        }
        case "appeal": {
          if (x.kind !== "club" || x.role !== "club_president") throw new AccessError("FORBIDDEN");
          const s = await sanction(cmd.sanctionId, "s.organization_id=$2 AND s.status='confirmed'");
          if (!appealOpen(s.appeal_until, today())) throw new AccessError("APPEAL_CLOSED", 409);
          let bytes: Buffer | null = null;
          if (cmd.file) {
            bytes = Buffer.from(cmd.file.data, "base64");
            const ok =
              bytes.length > 0 &&
              bytes.length <= 5242880 &&
              (cmd.file.mediaType === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : cmd.file.mediaType === "image/png" ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" : bytes[0] === 0xff && bytes[1] === 0xd8);
            if (!ok) throw new AccessError("INVALID_FILE", 400);
          }
          const id = (
            await x.c.query("INSERT INTO discipline_appeal(sanction_id,organization_id,user_id,reason,file_name,file_type,file) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
              s.id,
              x.org,
              x.userId,
              cmd.reason,
              cmd.file?.filename ?? null,
              cmd.file?.mediaType ?? null,
              bytes,
            ])
          ).rows[0].id as string;
          await audit(x.c, x.org, x.userId, "discipline.appeal", s.id);
          return { id };
        }
        case "payFine": {
          if (x.kind !== "club" || x.role !== "club_president") throw new AccessError("FORBIDDEN");
          const f = (
            await x.c.query(
              `UPDATE discipline_fine f SET status='paid',paid_on=$3,marked_by=$4 FROM discipline_sanction s, organization fo, organization co
                WHERE f.id=$1 AND f.organization_id=$2 AND f.status='due' AND s.id=f.sanction_id AND fo.id=f.federation_id AND co.id=f.organization_id
                RETURNING f.id,f.federation_id,f.amount_cents,fo.name AS federation,co.name AS club,(SELECT full_name FROM club_person WHERE id=s.profile_id) AS who`,
              [cmd.id, x.org, cmd.paidOn, x.userId],
            )
          ).rows[0] as { id: string; federation_id: string; amount_cents: number; federation: string; club: string; who: string | null } | undefined;
          if (!f) throw new AccessError("NOT_FOUND", 404);
          // 35: the club's expense and the federation's income, each in its own books.
          const about = f.who ?? f.club;
          const entry = { source: "fine" as const, ref: f.id, category: "competition" as const, amountCents: f.amount_cents, occurredOn: cmd.paidOn, by: x.userId };
          await autoEntry(x.c, { ...entry, org: x.org, direction: "out", label: `Amende disciplinaire · ${about}`, counterparty: f.federation });
          await autoEntry(x.c, { ...entry, org: f.federation_id, direction: "in", label: `Amende disciplinaire · ${f.club}`, counterparty: f.club });
          await x.c.query("UPDATE task SET status='done',done_on=CURRENT_DATE,auto_closed=true,updated_at=now() WHERE organization_id=$1 AND source_key=$2 AND status<>'done'", [x.org, `discipline:fine:${cmd.id}`]);
          await audit(x.c, x.org, x.userId, "discipline.finePaid", cmd.id);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}

/** 6: a player's disciplinary history, for his club (presidency, coaches) and his federation only. */
export async function disciplineHistory(db: Pool, p: Principal, profileId: string) {
  return scope(db, p, async (x) => {
    const where = x.kind === "federation" ? "s.profile_id=$1 AND s.federation_id=$2" : "s.profile_id=$1 AND s.organization_id=$2";
    const sanctions = await withRemaining(x.c, (await x.c.query(`${sanctionSql} WHERE ${where} AND s.status<>'proposed' ORDER BY s.created_at DESC`, [profileId, x.org])).rows as SanctionRow[]);
    const cards = (
      await x.c.query(
        `SELECT dc.season,dc.kind,count(*)::int AS n FROM discipline_card dc WHERE dc.profile_id=$1 AND ${x.kind === "federation" ? "dc.federation_id" : "dc.organization_id"}=$2 GROUP BY dc.season,dc.kind ORDER BY dc.season DESC`,
        [profileId, x.org],
      )
    ).rows as { season: string; kind: string; n: number }[];
    return { sanctions, cards };
  });
}

/** The proof joined to an appeal: the club that appealed and its federation. */
export async function appealFile(db: Pool, p: Principal, id: string) {
  return scope(db, p, async (x) => {
    const r = (
      await x.c.query(
        `SELECT a.file_name AS filename,a.file_type AS media_type,a.file AS content FROM discipline_appeal a JOIN discipline_sanction s ON s.id=a.sanction_id
          WHERE a.id=$1 AND ${x.kind === "federation" ? "s.federation_id" : "s.organization_id"}=$2 AND a.file IS NOT NULL`,
        [id, x.org],
      )
    ).rows[0] as { filename: string; media_type: string; content: Buffer } | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return r;
  });
}
