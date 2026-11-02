import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import type { Locale } from "../../lib/locale";
import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { pdfImage } from "../../lib/pdf-image";
import { xlsx } from "../../lib/xlsx";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { allocationsOf } from "../finance/allocations";
import { brusselsToday } from "../people/service";
import { adjusted, ageBand, ageBands, ageOn, communeOf, defaultTaskHours, impactCommand, impactQuery, round, volunteerHours, type Adjustable } from "./impact-schema";

/**
 * H13: the impact report for a season, a calendar year or a grant's period,
 * computed from the data with no typing (beneficiaries, new players,
 * retention, sessions and supervised sport hours, matches, tournaments,
 * kilometres, coaches trained, volunteering). Never a name nor a health
 * datum; a missing datum is null, never 0. Adjustments are added with their
 * note, the computed figure stays visible.
 */
type Scope = { c: PoolClient; org: string; userId: string; manage: boolean; money: boolean };
async function scope<T>(db: Pool, p: Principal, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const r = permissions(a.role, a.grants) as readonly string[];
    if (!mfaSatisfied(!!(await account(c, p)).twoFactorEnabled) || !(r.includes("people.read") || r.includes("people.manage"))) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage: a.role === "club_president" || r.includes("people.manage"), money: r.includes("dues.manage") });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const one = async <T>(c: PoolClient, sql: string, params: unknown[]) => (await c.query(sql, params)).rows[0] as T;
const all = async <T>(c: PoolClient, sql: string, params: unknown[]) => (await c.query(sql, params)).rows as T[];

async function settingsOf(c: PoolClient, org: string) {
  const s = await one<{ task_hours: Record<string, number>; trip_hours: string; hourly_rate_cents: number | null } | undefined>(c, "SELECT task_hours,trip_hours,hourly_rate_cents FROM impact_setting WHERE organization_id=$1", [org]);
  return { taskHours: { ...defaultTaskHours, ...(s?.task_hours ?? {}) }, tripHours: s ? Number(s.trip_hours) : 4, hourlyRateCents: s?.hourly_rate_cents ?? null };
}

/** The figures of a period. */
export async function impactFigures(c: PoolClient, org: string, from: string, to: string) {
  const settings = await settingsOf(c, org);
  const range = [org, from, to];
  // Beneficiaries: the players on a team during the period (aggregated here, never returned one by one).
  const players = await all<{ id: string; birth_date: string | null; postal_address: string; first: string }>(
    c,
    `SELECT cp.id,cp.birth_date::text,cp.postal_address,(SELECT min(x.starts_on) FROM team_membership x WHERE x.profile_id=cp.id AND x.role='player' AND NOT x.cancelled)::text AS first
       FROM club_person cp WHERE cp.organization_id=$1 AND cp.anonymized_at IS NULL AND EXISTS (
         SELECT 1 FROM team_membership m WHERE m.profile_id=cp.id AND m.organization_id=$1 AND m.role='player' AND NOT m.cancelled AND m.starts_on<=$3::date AND (m.ends_on IS NULL OR m.ends_on>=$2::date))`,
    range,
  );
  const byAge = Object.fromEntries(ageBands.map((b) => [b, 0])) as Record<(typeof ageBands)[number], number>;
  const communes = new Map<string, number>();
  let unknownCommune = 0;
  for (const p of players) {
    byAge[ageBand(ageOn(p.birth_date, from))]++;
    const commune = communeOf(p.postal_address);
    if (commune) communes.set(commune, (communes.get(commune) ?? 0) + 1);
    else unknownCommune++;
  }
  const fresh = players.filter((p) => p.first && p.first >= from && p.first <= to).length;
  // Retention: the players of the year before the period still there.
  const before = await all<{ id: string }>(
    c,
    `SELECT DISTINCT m.profile_id AS id FROM team_membership m WHERE m.organization_id=$1 AND m.role='player' AND NOT m.cancelled AND m.starts_on<=($2::date-1) AND (m.ends_on IS NULL OR m.ends_on>=($2::date-365))`,
    [org, from],
  );
  const ids = new Set(players.map((p) => p.id));
  const kept = before.filter((b) => ids.has(b.id)).length;
  // Sessions held (cancelled ones out), and supervised sport hours: duration × players seen present.
  const sessions = await one<{ n: number; hours: number; recorded: number; sport: number }>(
    c,
    `SELECT count(*)::int AS n,COALESCE(sum(extract(epoch FROM e.ends_at-e.starts_at))/3600,0)::float AS hours,
            count(*) FILTER (WHERE r.closed_at IS NOT NULL)::int AS recorded,
            COALESCE(sum(extract(epoch FROM e.ends_at-e.starts_at)/3600*(SELECT count(*) FROM attendance_invitation i WHERE i.register_id=r.id AND i.withdrawn_at IS NULL AND i.actual IN ('present','late','early'))) FILTER (WHERE r.closed_at IS NOT NULL),0)::float AS sport
       FROM calendar_event e LEFT JOIN attendance_register r ON r.event_id=e.id
      WHERE e.organization_id=$1 AND e.kind='training' AND e.status='scheduled' AND e.starts_at>=$2::date AND e.starts_at<($3::date+1) AND e.starts_at<now()`,
    range,
  );
  const matches = (await one<{ n: number }>(c, "SELECT count(*)::int AS n FROM match WHERE organization_id=$1 AND status='played' AND starts_at>=$2::date AND starts_at<($3::date+1)", range)).n;
  const tournaments = (await one<{ n: number }>(c, "SELECT count(*)::int AS n FROM trip WHERE organization_id=$1 AND kind='tournament' AND status<>'cancelled' AND starts_on BETWEEN $2 AND $3", range)).n;
  const km = await one<{ n: number | null; known: number }>(
    c,
    "SELECT sum(v.distance_km)::int AS n,count(v.distance_km)::int AS known FROM trip_vehicle v JOIN trip t ON t.id=v.trip_id WHERE t.organization_id=$1 AND t.status<>'cancelled' AND t.starts_on BETWEEN $2 AND $3",
    range,
  );
  const trained = (await one<{ n: number }>(c, "SELECT count(DISTINCT profile_id)::int AS n FROM training_request WHERE organization_id=$1 AND status='approved' AND completed_on BETWEEN $2 AND $3", range)).n;
  // Volunteering: tasks done, the staff of trainings and played matches, the drivers.
  const tasks = await all<{ category: string; n: number }>(c, "SELECT category,count(*)::int AS n FROM task WHERE organization_id=$1 AND status='done' AND done_on BETWEEN $2 AND $3 GROUP BY category", range);
  const supervision = (
    await one<{ h: number }>(
      c,
      `SELECT COALESCE(sum(x.hours*x.staff),0)::float AS h FROM (
         SELECT extract(epoch FROM e.ends_at-e.starts_at)/3600 AS hours,
                (SELECT count(*) FROM team_membership m WHERE m.team_id=e.team_id AND m.role IN ('coach','assistant','volunteer') AND NOT m.cancelled AND m.starts_on<=e.starts_at::date AND (m.ends_on IS NULL OR m.ends_on>=e.starts_at::date)) AS staff
           FROM calendar_event e WHERE e.organization_id=$1 AND e.kind='training' AND e.status='scheduled' AND e.starts_at>=$2::date AND e.starts_at<($3::date+1) AND e.starts_at<now()
         UNION ALL
         SELECT 2,(SELECT count(*) FROM team_membership m WHERE m.team_id=mt.team_id AND m.role IN ('coach','assistant','volunteer') AND NOT m.cancelled AND m.starts_on<=mt.starts_at::date AND (m.ends_on IS NULL OR m.ends_on>=mt.starts_at::date))
           FROM match mt WHERE mt.organization_id=$1 AND mt.status='played' AND mt.starts_at>=$2::date AND mt.starts_at<($3::date+1)) x`,
      range,
    )
  ).h;
  const drivers = (
    await one<{ h: number }>(
      c,
      `SELECT COALESCE(sum(COALESCE(extract(epoch FROM t.return_at-t.departure_at)/3600,$4::float)),0)::float AS h FROM trip_vehicle v JOIN trip t ON t.id=v.trip_id
        WHERE t.organization_id=$1 AND t.status<>'cancelled' AND t.starts_on BETWEEN $2 AND $3 AND v.driver_profile_id IS NOT NULL`,
      [...range, settings.tripHours],
    )
  ).h;
  const volunteer = volunteerHours(tasks, settings.taskHours, supervision, drivers);
  const adjustments = await all<{ id: string; indicator: Adjustable; delta: number; note: string; created_at: string }>(
    c,
    "SELECT id,indicator,delta::float AS delta,note,created_at FROM impact_adjustment WHERE organization_id=$1 AND period_from>=$2::date AND period_to<=$3::date ORDER BY created_at",
    range,
  );
  const adj = (k: Adjustable, v: number | null) => ({ computed: v, value: adjusted(v, adjustments.filter((a) => a.indicator === k)) });
  return {
    from,
    to,
    settings,
    beneficiaries: adj("beneficiaries", players.length),
    byAge,
    // Communes with their count; the address itself never leaves.
    communes: [...communes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n })),
    unknownCommune,
    /** Sex is not recorded in the application: no figure. */
    bySex: null,
    newPlayers: fresh,
    /** H1 (where the new players come from) is not recorded yet. */
    origin: null,
    retention: before.length ? { kept, of: before.length, rate: Math.round((kept * 100) / before.length) } : null,
    sessions: adj("sessions", sessions.n),
    sessionHours: round(sessions.hours),
    // No attendance recorded at all: unknown, not zero.
    sportHours: adj("sportHours", sessions.recorded ? round(sessions.sport) : null),
    sessionsRecorded: sessions.recorded,
    matches,
    tournaments,
    kilometres: adj("kilometres", km.known ? km.n : null),
    coachesTrained: trained,
    volunteer: { ...volunteer, ...adj("volunteerHours", volunteer.total), byCategory: tasks },
    valuationCents: settings.hourlyRateCents === null ? null : Math.round((adjusted(volunteer.total, adjustments.filter((a) => a.indicator === "volunteerHours")) ?? 0) * settings.hourlyRateCents),
    adjustments,
  };
}
export type ImpactFigures = Awaited<ReturnType<typeof impactFigures>>;

async function grantOf(c: PoolClient, org: string, grantId: string | undefined) {
  if (!grantId) return null;
  const g = await one<{ id: string; funder: string; program: string; purpose: string; starts_on: string | null; ends_on: string | null } | undefined>(
    c,
    "SELECT id,funder,program,purpose,starts_on::text,ends_on::text FROM grant_application WHERE id=$1 AND organization_id=$2",
    [grantId, org],
  );
  if (!g) throw new AccessError("NOT_FOUND", 404);
  // 9: the reserved funds of the grant, and what was spent of them.
  const reserved = (await allocationsOf(c, org)).filter((a) => a.grant_id === g.id).map((a) => ({ label: a.label, amount: a.amount_cents, spent: a.state.spent, remaining: a.state.remaining }));
  return { ...g, reserved };
}

export async function impactView(db: Pool, p: Principal, raw: { from?: string; to?: string; grant?: string }) {
  return scope(db, p, async (s) => {
    const seasons0 = await all<{ starts_on: string; ends_on: string }>(s.c, "SELECT starts_on::text,ends_on::text FROM season WHERE organization_id=$1 ORDER BY starts_on DESC", [s.org]);
    // No period asked: the season of today, or the calendar year.
    const today = brusselsToday();
    const current = seasons0.find((x) => x.starts_on <= today && x.ends_on >= today);
    const q = impactQuery.parse(raw.from && raw.to ? raw : { ...raw, from: current?.starts_on ?? `${today.slice(0, 4)}-01-01`, to: current?.ends_on ?? `${today.slice(0, 4)}-12-31` });
    const seasons = await all<{ id: string; name: string; starts_on: string; ends_on: string }>(s.c, "SELECT id,name,starts_on::text,ends_on::text FROM season WHERE organization_id=$1 ORDER BY starts_on DESC", [s.org]);
    const grants = s.money ? await all<{ id: string; funder: string }>(s.c, "SELECT id,funder FROM grant_application WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100", [s.org]) : [];
    return { organization_id: s.org, can: { manage: s.manage, attach: s.money }, seasons, grants, grant: await grantOf(s.c, s.org, q.grant), figures: await impactFigures(s.c, s.org, q.from, q.to) };
  });
}

export async function impactExecute(db: Pool, p: Principal, raw: unknown, expected: string) {
  const cmd = impactCommand.parse(raw);
  return scope(
    db,
    p,
    async (s) => {
      if (cmd.action === "attach") {
        if (!s.money) throw new AccessError("FORBIDDEN");
        const bytes = await pdfOf(s, cmd.locale, cmd.from, cmd.to, cmd.grantId);
        const id = (
          await s.c.query("INSERT INTO grant_attachment(organization_id,grant_id,filename,media_type,content,period_from,period_to,created_by) VALUES($1,$2,$3,'application/pdf',$4,$5,$6,$7) RETURNING id", [
            s.org,
            cmd.grantId,
            `rapport-impact-${cmd.from}-${cmd.to}.pdf`,
            Buffer.from(bytes),
            cmd.from,
            cmd.to,
            s.userId,
          ])
        ).rows[0].id as string;
        await audit(s.c, s.org, s.userId, "grant.impactReport", cmd.grantId, { attachment: id });
        return { id };
      }
      if (!s.manage) throw new AccessError("FORBIDDEN");
      if (cmd.action === "settings") {
        await s.c.query(
          "INSERT INTO impact_setting(organization_id,task_hours,trip_hours,hourly_rate_cents,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT (organization_id) DO UPDATE SET task_hours=EXCLUDED.task_hours,trip_hours=EXCLUDED.trip_hours,hourly_rate_cents=EXCLUDED.hourly_rate_cents,updated_by=EXCLUDED.updated_by,updated_at=now()",
          [s.org, JSON.stringify(cmd.taskHours), cmd.tripHours, cmd.hourlyRateCents, s.userId],
        );
        return { ok: true };
      }
      if (cmd.action === "removeAdjustment") {
        const r = await s.c.query("DELETE FROM impact_adjustment WHERE id=$1 AND organization_id=$2", [cmd.id, s.org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { ok: true };
      }
      if (cmd.to < cmd.from) throw new AccessError("INVALID_INPUT", 400);
      const id = (
        await s.c.query("INSERT INTO impact_adjustment(organization_id,period_from,period_to,indicator,delta,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [s.org, cmd.from, cmd.to, cmd.indicator, cmd.delta, cmd.note, s.userId])
      ).rows[0].id as string;
      await audit(s.c, s.org, s.userId, "impact.adjusted", id, { indicator: cmd.indicator, delta: cmd.delta });
      return { id };
    },
    expected,
  );
}

/* ---------- Exports: PDF with the club's logo, Excel with the method in annex ---------- */
const words = {
  fr: {
    title: "Rapport d'impact",
    period: "Période du {from} au {to}",
    grant: "Subside : {funder}{program}",
    purpose: "Objet : {v}",
    beneficiaries: "Bénéficiaires (joueurs actifs)",
    newPlayers: "Nouveaux joueurs",
    retention: "Rétention d'une saison à l'autre",
    sessions: "Séances organisées",
    sportHours: "Heures de sport encadrées",
    matches: "Matchs joués",
    tournaments: "Tournois",
    kilometres: "Kilomètres parcourus en déplacement",
    coachesTrained: "Coachs formés",
    volunteerHours: "Heures de bénévolat",
    valuation: "Valorisation du bénévolat",
    byAge: "Par âge",
    communes: "Par commune de domicile",
    unknown: "non renseigné",
    noData: "donnée absente",
    sex: "Par sexe : non relevé par le club",
    origin: "Provenance des nouveaux joueurs : non relevée",
    reserved: "Fonds réservés du subside",
    reservedLine: "{label} : prévu {amount}, dépensé {spent}, reste {remaining}",
    adjustment: "Ajustement : {indicator} {delta} ({note})",
    method: "Méthode de calcul",
    ages: { under12: "moins de 12 ans", "12to17": "12 à 17 ans", "18to29": "18 à 29 ans", "30to49": "30 à 49 ans", "50plus": "50 ans et plus", unknown: "âge non renseigné" },
    definitions: {
      beneficiaries: "Personnes inscrites comme joueur dans une équipe à un moment de la période. Aucun nom, aucune donnée de santé.",
      newPlayers: "Joueurs dont la première inscription dans une équipe tombe dans la période.",
      retention: "Part des joueurs de l'année précédant la période encore inscrits pendant la période.",
      sessions: "Entraînements tenus dans la période, séances annulées exclues.",
      sportHours: "Durée de chaque entraînement multipliée par le nombre de joueurs relevés présents. Sans aucune présence relevée : donnée absente.",
      kilometres: "Somme des distances indiquées pour les véhicules des déplacements de la période.",
      volunteerHours: "Tâches terminées × durée réglée par type, encadrement des entraînements et matchs (staff de l'équipe × durée, 2 h par match), chauffeurs (durée du déplacement).",
    },
    made: "Établi le {d} à partir des données de l'application ; chaque chiffre peut être recalculé.",
  },
  nl: {
    title: "Impactverslag",
    period: "Periode van {from} tot {to}",
    grant: "Subsidie: {funder}{program}",
    purpose: "Doel: {v}",
    beneficiaries: "Begunstigden (actieve spelers)",
    newPlayers: "Nieuwe spelers",
    retention: "Behoud van seizoen tot seizoen",
    sessions: "Georganiseerde trainingen",
    sportHours: "Begeleide sporturen",
    matches: "Gespeelde wedstrijden",
    tournaments: "Toernooien",
    kilometres: "Afgelegde kilometers bij verplaatsingen",
    coachesTrained: "Opgeleide coaches",
    volunteerHours: "Uren vrijwilligerswerk",
    valuation: "Waarde van het vrijwilligerswerk",
    byAge: "Per leeftijd",
    communes: "Per woonplaats",
    unknown: "niet ingevuld",
    noData: "geen gegevens",
    sex: "Per geslacht: niet bijgehouden door de club",
    origin: "Herkomst van de nieuwe spelers: niet bijgehouden",
    reserved: "Bestemde fondsen van de subsidie",
    reservedLine: "{label}: voorzien {amount}, uitgegeven {spent}, saldo {remaining}",
    adjustment: "Aanpassing: {indicator} {delta} ({note})",
    method: "Berekeningsmethode",
    ages: { under12: "jonger dan 12", "12to17": "12 tot 17 jaar", "18to29": "18 tot 29 jaar", "30to49": "30 tot 49 jaar", "50plus": "50 jaar en ouder", unknown: "leeftijd onbekend" },
    definitions: {
      beneficiaries: "Personen die tijdens de periode als speler in een ploeg ingeschreven waren. Geen namen, geen gezondheidsgegevens.",
      newPlayers: "Spelers wier eerste inschrijving in een ploeg in de periode valt.",
      retention: "Deel van de spelers van het jaar vóór de periode dat in de periode nog ingeschreven is.",
      sessions: "Trainingen gehouden in de periode, geannuleerde niet meegeteld.",
      sportHours: "Duur van elke training maal het aantal aanwezige spelers. Zonder enige aanwezigheidsregistratie: geen gegevens.",
      kilometres: "Som van de afstanden van de voertuigen van de verplaatsingen in de periode.",
      volunteerHours: "Afgewerkte taken × ingestelde duur per soort, begeleiding van trainingen en wedstrijden (staf van de ploeg × duur, 2 u per wedstrijd), chauffeurs (duur van de verplaatsing).",
    },
    made: "Opgesteld op {d} op basis van de gegevens van de toepassing; elk cijfer kan herberekend worden.",
  },
  en: {
    title: "Impact report",
    period: "Period from {from} to {to}",
    grant: "Grant: {funder}{program}",
    purpose: "Purpose: {v}",
    beneficiaries: "Beneficiaries (active players)",
    newPlayers: "New players",
    retention: "Retention from one season to the next",
    sessions: "Sessions held",
    sportHours: "Supervised sport hours",
    matches: "Matches played",
    tournaments: "Tournaments",
    kilometres: "Kilometres travelled",
    coachesTrained: "Coaches trained",
    volunteerHours: "Volunteering hours",
    valuation: "Value of the volunteering",
    byAge: "By age",
    communes: "By home municipality",
    unknown: "not filled in",
    noData: "no data",
    sex: "By sex: not recorded by the club",
    origin: "Where new players come from: not recorded",
    reserved: "The grant's reserved funds",
    reservedLine: "{label}: planned {amount}, spent {spent}, left {remaining}",
    adjustment: "Adjustment: {indicator} {delta} ({note})",
    method: "Calculation method",
    ages: { under12: "under 12", "12to17": "12 to 17", "18to29": "18 to 29", "30to49": "30 to 49", "50plus": "50 and over", unknown: "age unknown" },
    definitions: {
      beneficiaries: "People registered as a player on a team at some point of the period. No name, no health data.",
      newPlayers: "Players whose first registration on a team falls in the period.",
      retention: "Share of the players of the year before the period still registered during it.",
      sessions: "Trainings held in the period, cancelled sessions left out.",
      sportHours: "Length of each training times the number of players recorded present. With no attendance recorded at all: no data.",
      kilometres: "Sum of the distances given for the vehicles of the period's trips.",
      volunteerHours: "Tasks done × the hours set per type, supervision of trainings and matches (team staff × length, 2 h per match), drivers (trip length).",
    },
    made: "Drawn up on {d} from the application's data; every figure can be computed again.",
  },
};
export const impactWords = words;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** The figures as label/value pairs, shared by the PDF and the spreadsheet. */
function pairs(locale: Locale, f: ImpactFigures) {
  const w = words[locale];
  const n = (v: number | null) => (v === null ? w.noData : new Intl.NumberFormat(tag(locale)).format(v));
  const money = (c: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(c / 100).replace(/[  ]/g, " ");
  return [
    [w.beneficiaries, n(f.beneficiaries.value)],
    [w.newPlayers, n(f.newPlayers)],
    [w.retention, f.retention ? `${f.retention.rate} % (${f.retention.kept}/${f.retention.of})` : w.noData],
    [w.sessions, n(f.sessions.value)],
    [w.sportHours, n(f.sportHours.value)],
    [w.matches, n(f.matches)],
    [w.tournaments, n(f.tournaments)],
    [w.kilometres, n(f.kilometres.value)],
    [w.coachesTrained, n(f.coachesTrained)],
    [w.volunteerHours, n(f.volunteer.value)],
    ...(f.valuationCents !== null ? [[w.valuation, money(f.valuationCents)]] : []),
  ] as [string, string][];
}
async function pdfOf(s: Scope, locale: Locale, from: string, to: string, grantId?: string) {
  const f = await impactFigures(s.c, s.org, from, to);
  const g = await grantOf(s.c, s.org, grantId);
  const w = words[locale];
  const day = (x: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(x + "T12:00:00Z"));
  const money = (c: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(c / 100).replace(/[  ]/g, " ");
  const club = await one<{ name: string; address: string | null; company_number: string | null }>(s.c, "SELECT name,address,company_number FROM organization WHERE id=$1", [s.org]);
  const logo = await one<{ media_type: string; content: Buffer } | undefined>(s.c, "SELECT media_type,content FROM organization_logo WHERE organization_id=$1", [s.org]);
  const image = logo ? pdfImage(new Uint8Array(logo.content), logo.media_type) : null;
  const lines: PdfLine[] = [
    ...(image ? [{ text: "", image: "logo", height: 48 }] : []),
    { text: club.name, bold: true, size: 12, gap: image ? 6 : 0 },
    { text: w.title, bold: true, size: 16, gap: 12 },
    { text: fill(w.period, { from: day(from), to: day(to) }), gap: 4 },
    ...(g ? [{ text: fill(w.grant, { funder: g.funder, program: g.program ? ` (${g.program})` : "" }) }, ...(g.purpose ? [{ text: fill(w.purpose, { v: g.purpose }), size: 10 }] : [])] : []),
    ...pairs(locale, f).map(([k, v], i) => ({ text: `${k} : ${v}`, gap: i ? 2 : 12 })),
    { text: w.byAge, bold: true, gap: 12 },
    ...Object.entries(f.byAge).map(([k, v]) => ({ text: `${w.ages[k as keyof typeof w.ages]} : ${v}`, size: 10, indent: 14 })),
    { text: w.communes, bold: true, gap: 8 },
    ...f.communes.slice(0, 15).map((c) => ({ text: `${c.name} : ${c.n}`, size: 10, indent: 14 })),
    ...(f.unknownCommune ? [{ text: `${w.unknown} : ${f.unknownCommune}`, size: 10, indent: 14 }] : []),
    { text: w.sex, size: 10, gap: 6 },
    { text: w.origin, size: 10 },
    ...(g?.reserved.length ? [{ text: w.reserved, bold: true, gap: 10 }, ...g.reserved.map((r) => ({ text: fill(w.reservedLine, { label: r.label, amount: money(r.amount), spent: money(r.spent), remaining: money(r.remaining) }), size: 10, indent: 14 }))] : []),
    ...f.adjustments.map((a, i) => ({ text: fill(w.adjustment, { indicator: (w as Record<string, unknown>)[a.indicator] as string, delta: (a.delta > 0 ? "+" : "") + a.delta, note: a.note }), size: 9, gap: i ? 0 : 8 })),
    { text: w.method, bold: true, gap: 14 },
    ...Object.entries(w.definitions).map(([k, v]) => ({ text: `${(w as Record<string, unknown>)[k] as string} : ${v}`, size: 9 })),
    { text: fill(w.made, { d: day(new Date().toISOString().slice(0, 10)) }), size: 8, gap: 10 },
  ];
  return pdfDocument(lines, `${w.title} ${from} ${to}`, {
    images: image ? { logo: image } : {},
    footer: [{ text: club.name, bold: true, size: 8 }, ...(club.address ? [{ text: club.address, size: 8 }] : []), ...(club.company_number ? [{ text: `BCE ${club.company_number}`, size: 8 }] : [])],
  });
}
export async function impactPdf(db: Pool, p: Principal, locale: Locale, raw: { from?: string; to?: string; grant?: string }) {
  const q = impactQuery.parse(raw);
  return scope(db, p, (s) => pdfOf(s, locale, q.from, q.to, q.grant));
}
export async function impactXlsx(db: Pool, p: Principal, locale: Locale, raw: { from?: string; to?: string }) {
  const q = impactQuery.parse(raw);
  return scope(db, p, async (s) => {
    const f = await impactFigures(s.c, s.org, q.from, q.to);
    const w = words[locale];
    const rows: unknown[][] = [[w.title, `${q.from} / ${q.to}`], ...pairs(locale, f), [], [w.byAge], ...Object.entries(f.byAge).map(([k, v]) => [w.ages[k as keyof typeof w.ages], v]), [], [w.communes], ...f.communes.map((c) => [c.name, c.n])];
    if (f.unknownCommune) rows.push([w.unknown, f.unknownCommune]);
    rows.push([], [w.method], ...Object.entries(w.definitions).map(([k, v]) => [(w as Record<string, unknown>)[k] as string, v]));
    return xlsx(rows, w.title.slice(0, 31));
  });
}
/** A report filed with a grant (its PDF), for the money managers. */
export async function grantAttachment(db: Pool, p: Principal, id: string) {
  return scope(db, p, async (s) => {
    if (!s.money) throw new AccessError("FORBIDDEN");
    const r = await one<{ filename: string; content: Buffer } | undefined>(s.c, "SELECT filename,content FROM grant_attachment WHERE id=$1 AND organization_id=$2", [id, s.org]);
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return { filename: r.filename, bytes: new Uint8Array(r.content) };
  });
}
