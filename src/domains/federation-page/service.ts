import type { Pool } from "pg";
import { AccessError, active, type Principal } from "../access/service";
import { brusselsToday } from "../people/service";

/**
 * 12/11/2026: the « Fédération » page of a club. In one place: the
 * federation's circulars to this person, its tournaments, the transfers it
 * validated lately, the club's discipline (presidency and coaches), and one
 * card per affiliated club: its president, the year it was founded, its home
 * hall and, discreetly, its titles. Circulars and discipline left the side
 * menu; their full pages stay one click away.
 */
export type FederationClub = {
  id: string;
  name: string;
  city: string;
  founded_year: number | null;
  presidents: string[];
  home: string | null;
  titles: number;
  last_title: string | null;
  logo_version: string | null;
  mine: boolean;
};

export async function clubFederationView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const fedId = (await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id as string | null;
    if (!fedId) return { federation: null };
    const today = brusselsToday();
    const federation = (await c.query("SELECT id,name,city,country_code AS country,COALESCE(contact_email,'') AS contact_email FROM organization WHERE id=$1", [fedId])).rows[0] as {
      id: string;
      name: string;
      city: string | null;
      country: string;
      contact_email: string;
    };
    // The circulars this person received (the same rows as the circulars page).
    const circulars = (
      await c.query(
        `SELECT c.id,c.title,c.ack_required,c.sent_at,r.read_at,r.acknowledged_at
           FROM circular_recipient r JOIN circular c ON c.id=r.circular_id
          WHERE r.user_id=$1 AND c.federation_id=$2 ORDER BY c.sent_at DESC LIMIT 5`,
        [p.userId, fedId],
      )
    ).rows as { id: string; title: string; ack_required: boolean; sent_at: string; read_at: string | null; acknowledged_at: string | null }[];
    const unread = (await c.query("SELECT count(*)::int AS n FROM circular_recipient r JOIN circular c ON c.id=r.circular_id WHERE r.user_id=$1 AND c.federation_id=$2 AND r.read_at IS NULL", [p.userId, fedId])).rows[0].n as number;
    // The federation's tournaments still open, the next days first.
    const tournaments = (
      await c.query(
        `SELECT t.id,t.name,t.year,min(d.day) FILTER (WHERE d.day>=$2::date)::text AS next_day,max(d.day)::text AS last_day,count(d.id)::int AS days,
                (SELECT d2.venue FROM tournament_day d2 WHERE d2.tournament_id=t.id AND d2.day>=$2::date ORDER BY d2.day LIMIT 1) AS venue
           FROM tournament t LEFT JOIN tournament_day d ON d.tournament_id=t.id
          WHERE t.organization_id=$1 AND t.status='open'
          GROUP BY t.id ORDER BY min(d.day) FILTER (WHERE d.day>=$2::date) NULLS LAST,t.name LIMIT 6`,
        [fedId, today],
      )
    ).rows as { id: string; name: string; year: number; next_day: string | null; last_day: string | null; days: number; venue: string | null }[];
    // Transfers the federation completed in the last six months.
    const transfers = (
      await c.query(
        `SELECT o.id,COALESCE(cp.full_name,'') AS name,COALESCE(fr.name,'') AS from_club,tc.name AS to_club,o.completed_at,o.season
           FROM transfer_offer o JOIN organization tc ON tc.id=o.to_organization_id LEFT JOIN organization fr ON fr.id=o.from_organization_id
           LEFT JOIN club_person cp ON cp.id=o.source_profile_id
          WHERE o.federation_id=$1 AND o.completed_at IS NOT NULL AND o.completed_at>now()-interval '6 months'
          ORDER BY o.completed_at DESC LIMIT 8`,
        [fedId],
      )
    ).rows as { id: string; name: string; from_club: string; to_club: string; completed_at: string; season: string }[];
    // The club's discipline: its presidency and coaches only (as the discipline page).
    const seesDiscipline = a.role === "club_president" || a.role === "coach";
    const discipline = seesDiscipline
      ? ((
          await c.query(
            `SELECT (SELECT count(*)::int FROM discipline_sanction s WHERE s.organization_id=$1 AND s.status='confirmed' AND s.created_at>now()-interval '12 months') AS sanctions,
                    (SELECT count(*)::int FROM discipline_sanction s WHERE s.organization_id=$1 AND s.status='confirmed' AND s.appeal_until>=$2::date) AS appealable,
                    (SELECT COALESCE(sum(f.amount_cents),0)::int FROM discipline_fine f WHERE f.organization_id=$1 AND f.status='due') AS fines_due,
                    (SELECT count(*)::int FROM discipline_fine f WHERE f.organization_id=$1 AND f.status='due') AS fines`,
            [a.organization_id, today],
          )
        ).rows[0] as { sanctions: number; appealable: number; fines_due: number; fines: number })
      : null;
    const clubs = (
      await c.query(
        `SELECT o.id,o.name,COALESCE(o.city,'') AS city,o.founded_year,
                COALESCE((SELECT array_agg(DISTINCT u.name ORDER BY u.name) FROM role_assignment r JOIN "user" u ON u.id=r.user_id
                           WHERE r.organization_id=o.id AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())),'{}') AS presidents,
                (SELECT pl.name FROM calendar_place pl WHERE pl.organization_id=o.id AND pl.home AND NOT pl.archived ORDER BY pl.name LIMIT 1) AS home,
                (SELECT count(*)::int FROM award aw WHERE aw.organization_id=o.id AND aw.publishable AND aw.place=1 AND aw.kind<>'individual') AS titles,
                (SELECT aw.title||' '||extract(year FROM aw.awarded_on)::int FROM award aw WHERE aw.organization_id=o.id AND aw.publishable AND aw.place=1 AND aw.kind<>'individual' ORDER BY aw.awarded_on DESC LIMIT 1) AS last_title,
                extract(epoch FROM l.updated_at)::bigint::text AS logo_version,(o.id=$2) AS mine
           FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id
          WHERE o.federation_id=$1 AND o.kind='club' AND o.closed_at IS NULL
          ORDER BY (o.id=$2) DESC,lower(o.name) LIMIT 300`,
        [fedId, a.organization_id],
      )
    ).rows as FederationClub[];
    return {
      federation,
      circulars,
      unread,
      tournaments,
      transfers,
      discipline,
      clubs,
      can: { discipline: seesDiscipline },
    };
  } finally {
    c.release();
  }
}
