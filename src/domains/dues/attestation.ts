import type { Pool } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { ownProfiles } from "../calendar/access";

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
      seasons.find((s) => s.starts_on <= new Date().toISOString().slice(0, 10)) ??
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
    await c.query("COMMIT");
    return {
      club,
      can: { all },
      seasons: seasons.map(({ id, name }) => ({ id, name })),
      season: season ?? null,
      issuedOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()),
      people: rows
        .filter((r) => all || mine.includes(r.profile_id) || !splits.some((x) => x.subject_profile_id === r.profile_id) || splits.some((x) => x.subject_profile_id === r.profile_id && mine.includes(x.guardian_profile_id)))
        .map((r) => ({
        profile_id: r.profile_id as string,
        full_name: r.full_name as string,
        birth_date: r.birth_date as string | null,
        paid_cents: r.paid_cents as number,
        last_paid_on: r.last_paid_on as string | null,
        eligible: paidInFull(r.dues, r.paid_cents),
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
