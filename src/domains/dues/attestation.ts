import type { Pool } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { ownProfiles } from "../calendar/access";
import { brusselsDay } from "../../lib/today";

/**
 * Attestations for the mutual insurance funds: in Belgium they refund part of
 * a sports club membership. One attestation per person and season, once the
 * season's dues are fully paid. Managers of money see the whole club; a
 * player or a family sees their own.
 */
export function paidInFull(
  dues: { net_cents: number; status: string }[],
  paidCents: number,
) {
  const owed = dues
    .filter((d) => d.status !== "cancelled")
    .reduce((n, d) => n + d.net_cents, 0);
  return owed > 0 && paidCents >= owed;
}

export async function attestationsView(db: Pool, p: Principal, seasonId?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const user = await account(c, p);
    const mfa = mfaSatisfied(!!user.twoFactorEnabled);
    const rights = permissions(a.role, a.grants);
    const all = mfa && (rights.includes("dues.manage") || rights.includes("dues.read"));
    const send = mfa && rights.includes("dues.manage");
    const own = await ownProfiles(c, { ...a, twoFactorEnabled: !!user.twoFactorEnabled });
    const org = a.organization_id;
    const club = (
      await c.query(
        "SELECT o.name,o.address,o.company_number,o.signatory,f.name AS federation FROM organization o LEFT JOIN organization f ON f.id=o.federation_id WHERE o.id=$1",
        [org],
      )
    ).rows[0];
    const seasons = (
      await c.query(
        "SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE organization_id=$1 ORDER BY starts_on DESC",
        [org],
      )
    ).rows as { id: string; name: string; starts_on: string; ends_on: string }[];
    const season =
      seasons.find((s) => s.id === seasonId) ??
      seasons.find((s) => s.starts_on <= brusselsDay()) ??
      seasons[0];
    const rows = season
      ? (
          await c.query(
            `SELECT cp.id AS profile_id,cp.full_name,cp.birth_date::text AS birth_date,
                    json_agg(json_build_object('net_cents',d.net_cents,'status',d.status)) AS dues,
                    COALESCE((SELECT sum(t.amount_cents) FROM finance_transaction t JOIN dues_receivable r ON r.id=t.receivable_id
                               WHERE r.profile_id=cp.id AND r.season_id=$2 AND t.cancelled_at IS NULL AND t.direction='in'),0)::int AS paid_cents,
                    (SELECT max(t.occurred_on)::text FROM finance_transaction t JOIN dues_receivable r ON r.id=t.receivable_id
                      WHERE r.profile_id=cp.id AND r.season_id=$2 AND t.cancelled_at IS NULL AND t.direction='in') AS last_paid_on
               FROM dues_receivable d JOIN club_person cp ON cp.id=d.profile_id
              WHERE d.organization_id=$1 AND d.season_id=$2 AND ($3 OR d.profile_id=ANY($4::uuid[]))
              GROUP BY cp.id ORDER BY cp.full_name`,
            [org, season.id, all, [...own]],
          )
        ).rows
      : [];
    // 29: two homes. A representative receives the attestation of a child when the club's split names him (his share), or when there is no split.
    const mine = all
      ? []
      : (await c.query("SELECT cp.id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.organization_id=$1 AND pe.user_id=$2", [org, p.userId])).rows.map((r) => r.id as string);
    const splits = (
      await c.query(
        "SELECT b.subject_profile_id,b.guardian_profile_id,b.percent,cp.full_name FROM billing_split b JOIN club_person cp ON cp.id=b.guardian_profile_id WHERE b.organization_id=$1 AND b.subject_profile_id=ANY($2::uuid[])",
        [org, rows.map((r) => r.profile_id)],
      )
    ).rows as { subject_profile_id: string; guardian_profile_id: string; percent: number; full_name: string }[];
    // 9: what was sent, and the mutuals' own forms of the people in view.
    const ids = rows.map((r) => r.profile_id as string);
    const sends = season
      ? ((
          await c.query(
            `SELECT a.profile_id,a.number,extract(year FROM a.issued_at)::int AS year,max(x.sent_at) AS last_sent,count(x.id)::int AS sends
               FROM dues_attestation a LEFT JOIN dues_attestation_send x ON x.attestation_id=a.id
              WHERE a.organization_id=$1 AND a.season_id=$2 AND a.profile_id=ANY($3::uuid[]) GROUP BY a.id`,
            [org, season.id, ids],
          )
        ).rows as { profile_id: string; number: number; year: number; last_sent: string | null; sends: number }[])
      : [];
    const forms = season
      ? ((
          await c.query(
            "SELECT f.id,f.profile_id,cp.full_name,f.blank_name,f.filled_name,f.created_at,f.done_at FROM mutual_form f JOIN club_person cp ON cp.id=f.profile_id WHERE f.organization_id=$1 AND f.season_id=$2 AND f.profile_id=ANY($3::uuid[]) ORDER BY f.done_at IS NOT NULL,f.created_at",
            [org, season.id, ids],
          )
        ).rows as { id: string; profile_id: string; full_name: string; blank_name: string; filled_name: string | null; created_at: string; done_at: string | null }[])
      : [];
    const visible = (r: { profile_id: string }) => all || mine.includes(r.profile_id) || !splits.some((x) => x.subject_profile_id === r.profile_id) || splits.some((x) => x.subject_profile_id === r.profile_id && mine.includes(x.guardian_profile_id));
    await c.query("COMMIT");
    return {
      organization_id: org,
      club,
      can: { all, send },
      forms: forms.filter(visible),
      seasons: seasons.map(({ id, name }) => ({ id, name })),
      season: season ?? null,
      issuedOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()),
      people: rows
        .filter(visible)
        .map((r) => ({
        profile_id: r.profile_id as string,
        full_name: r.full_name as string,
        birth_date: r.birth_date as string | null,
        paid_cents: r.paid_cents as number,
        last_paid_on: r.last_paid_on as string | null,
        eligible: paidInFull(r.dues, r.paid_cents),
        /** 9: its number and its sendings. */
        sent: ((x) => (x ? { number: `${x.year}-${String(x.number).padStart(4, "0")}`, last: x.last_sent, count: x.sends } : null))(sends.find((x) => x.profile_id === r.profile_id)),
        /** 29: the shares of the payment, one attestation part per representative. */
        shares: splits
          .filter((x) => x.subject_profile_id === r.profile_id && (all || mine.includes(x.guardian_profile_id)))
          .map((x) => ({ name: x.full_name, percent: x.percent, cents: Math.round((r.paid_cents * x.percent) / 100) })),
      })),
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
