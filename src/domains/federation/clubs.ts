import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { inviteProfile, resendInvitation } from "../access/invite";
import { seasonOf } from "../finance/schema";
import { brusselsToday } from "../people/service";

/**
 * Wave 16 (I3): the federation's own space. Its president creates the
 * affiliated clubs, invites their presidents (and a new president later,
 * without ever leaving a club without one), sees every club's teams for the
 * season and invites the referees. The federation reads only public identity
 * and headcounts of a club: never health, dues or finance data.
 */
type Scope = { c: PoolClient; fed: string; userId: string; manage: boolean };

async function federation<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    if (!["federation_president", "federation_worker"].includes(a.role)) throw new AccessError("FORBIDDEN");
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    await account(c, p);
    // Clubs and their presidents are the federation president's to handle.
    const manage = a.role === "federation_president";
    if (write && !manage) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, fed: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const text = (n: number) => z.string().trim().max(n);
const email = z.email().max(254);
const person = { firstName: text(60).min(1), lastName: text(60).min(1), email };
export const federationClubsCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createClub"),
    name: text(120).min(2),
    city: text(80),
    affiliationNumber: text(40),
    companyNumber: z.union([z.literal(""), z.string().regex(/^[01][0-9]{3}\.[0-9]{3}\.[0-9]{3}$/)]),
    legalForm: z.enum(["asbl", "de_facto"]).nullable(),
    contactEmail: z.union([z.literal(""), email]),
    president: z.object(person),
  }),
  z.object({ action: z.literal("invitePresident"), clubId: z.uuid(), ...person }),
  z.object({ action: z.literal("inviteReferee"), ...person }),
  z.object({ action: z.literal("resendInvitation"), id: z.uuid() }),
  z.object({ action: z.literal("cancelInvitation"), id: z.uuid() }),
]);
export type FederationClubsCommand = z.infer<typeof federationClubsCommand>;

const invitationStatus = `CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted' WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.disputed_at IS NOT NULL THEN 'disputed' WHEN i.expires_at<now() THEN 'expired' ELSE 'pending' END`;
export type InvitationState = "accepted" | "revoked" | "disputed" | "expired" | "pending";
const currentPresident = `r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())`;

/** Clubs and presidents: public identity, president and invitation, teams and licensed players this season. */
export async function federationClubsView(db: Pool, p: Principal) {
  return federation(db, p, false, async (s) => {
    const season = seasonOf(brusselsToday()).label;
    const clubs = (
      await s.c.query(
        `SELECT o.id,o.name,o.city,o.affiliation_number,o.legal_form,o.company_number,o.contact_email,
                (SELECT json_build_object('name',u.name,'email',u.email) FROM role_assignment r JOIN "user" u ON u.id=r.user_id
                  WHERE r.organization_id=o.id AND ${currentPresident} AND u.active ORDER BY r.created_at DESC LIMIT 1) AS president,
                (SELECT json_build_object('id',i.id,'email',i.email,'name',i.greeting,'succession',i.succession,'status',${invitationStatus},'note',i.disputed_note)
                   FROM invitation i WHERE i.organization_id=o.id AND i.role='club_president' AND i.issued_by_federation=$1 ORDER BY i.created_at DESC LIMIT 1) AS invitation,
                (SELECT count(*)::int FROM team t JOIN season se ON se.id=t.season_id
                  WHERE t.organization_id=o.id AND NOT t.archived AND NOT se.archived AND CURRENT_DATE BETWEEN se.starts_on AND se.ends_on) AS teams,
                (SELECT count(DISTINCT l.profile_id)::int FROM license l WHERE l.organization_id=o.id AND l.federation_id=$1 AND l.status='active' AND l.season=$2) AS licensed
           FROM organization o WHERE o.federation_id=$1 AND o.kind='club' ORDER BY lower(o.name)`,
        [s.fed, season],
      )
    ).rows as {
      id: string;
      name: string;
      city: string;
      affiliation_number: string;
      legal_form: "asbl" | "de_facto" | null;
      company_number: string;
      contact_email: string | null;
      president: { name: string; email: string } | null;
      invitation: { id: string; email: string; name: string; succession: boolean; status: InvitationState; note: string } | null;
      teams: number;
      licensed: number;
    }[];
    return {
      organization_id: s.fed,
      season,
      can: { manage: s.manage },
      clubs: clubs.map((c) => ({ ...c, status: (c.president ? "active" : "pending") as "active" | "pending" })),
    };
  });
}

/** Every affiliated club's teams this season, read only. */
export async function federationTeamsView(db: Pool, p: Principal) {
  return federation(db, p, false, async (s) => {
    const season = seasonOf(brusselsToday()).label;
    const live = `NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)`;
    const teams = (
      await s.c.query(
        `SELECT t.id,o.id AS club_id,o.name AS club,t.name,t.category,t.level,
                (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m WHERE m.team_id=t.id AND m.role='player' AND ${live}) AS players,
                (SELECT count(DISTINCT m.profile_id)::int FROM team_membership m JOIN license l ON l.profile_id=m.profile_id AND l.federation_id=$1 AND l.status='active' AND l.season=$2
                  WHERE m.team_id=t.id AND m.role='player' AND ${live}) AS licensed,
                COALESCE((SELECT string_agg(DISTINCT cp.full_name, ', ') FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id
                  WHERE m.team_id=t.id AND m.role='coach' AND ${live}),'') AS coaches
           FROM team t JOIN organization o ON o.id=t.organization_id JOIN season se ON se.id=t.season_id
          WHERE o.federation_id=$1 AND o.kind='club' AND NOT t.archived AND NOT se.archived AND CURRENT_DATE BETWEEN se.starts_on AND se.ends_on
          ORDER BY lower(o.name),lower(t.name)`,
        [s.fed, season],
      )
    ).rows as { id: string; club_id: string; club: string; name: string; category: string; level: string; players: number; licensed: number; coaches: string }[];
    return { organization_id: s.fed, season, teams };
  });
}

/** The federation's referees and the invitations sent to new ones. */
export async function federationRefereesView(db: Pool, p: Principal) {
  return federation(db, p, false, async (s) => {
    const referees = (
      await s.c.query(
        `SELECT u.id,u.name,u.email,
                (SELECT count(*)::int FROM referee_availability a WHERE a.federation_id=$1 AND a.user_id=u.id AND a.available AND a.day>=CURRENT_DATE) AS available_days
           FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id
          WHERE r.organization_id=$1 AND r.role='referee' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active
          GROUP BY u.id,u.name,u.email ORDER BY lower(u.name)`,
        [s.fed],
      )
    ).rows as { id: string; name: string; email: string; available_days: number }[];
    const invitations = (
      await s.c.query(
        `SELECT i.id,i.email,i.greeting AS name,${invitationStatus} AS status,i.disputed_note AS note,i.created_at
           FROM invitation i WHERE i.organization_id=$1 AND i.role='referee' AND i.accepted_at IS NULL AND i.revoked_at IS NULL
          ORDER BY i.created_at DESC LIMIT 100`,
        [s.fed],
      )
    ).rows as { id: string; email: string; name: string; status: InvitationState; note: string; created_at: string }[];
    return { organization_id: s.fed, can: { manage: s.manage }, referees, invitations };
  });
}

/** The invitation the federation may handle: a president's it sent, or a referee's into the federation. */
async function ownInvitation(s: Scope, id: string) {
  const row = (
    await s.c.query(
      `SELECT i.id,i.organization_id FROM invitation i
        WHERE i.id=$1 AND i.accepted_at IS NULL AND ((i.issued_by_federation=$2 AND i.role='club_president') OR (i.organization_id=$2 AND i.role='referee'))
        FOR UPDATE`,
      [id, s.fed],
    )
  ).rows[0] as { id: string; organization_id: string } | undefined;
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return row;
}

export async function federationClubsExecute(db: Pool, p: Principal, command: FederationClubsCommand, expected?: string) {
  return federation(
    db,
    p,
    true,
    async (s) => {
      const greeting = (i: { firstName: string; lastName: string }) => `${i.firstName} ${i.lastName}`.trim();
      if (command.action === "createClub") {
        const club = (
          await s.c.query(
            `INSERT INTO organization(name,kind,federation_id,city,affiliation_number,company_number,legal_form,contact_email)
             VALUES($1,'club',$2,$3,$4,$5,$6,$7) RETURNING id`,
            [command.name, s.fed, command.city, command.affiliationNumber, command.companyNumber, command.legalForm, command.contactEmail || null],
          ).catch((e: { code?: string }) => {
            if (e.code === "23505") throw new AccessError("AFFILIATION_TAKEN", 409);
            throw e;
          })
        ).rows[0].id as string;
        await audit(s.c, s.fed, s.userId, "federation.clubCreated", club);
        await inviteProfile(s.c, club, s.userId, {
          email: command.president.email,
          role: "club_president",
          profileId: null,
          greeting: greeting(command.president),
          issuedByFederation: s.fed,
        });
        return { ok: true as const, id: club };
      }
      if (command.action === "invitePresident") {
        const club = (await s.c.query("SELECT id FROM organization WHERE id=$1 AND federation_id=$2 AND kind='club' FOR UPDATE", [command.clubId, s.fed])).rows[0];
        if (!club) throw new AccessError("NOT_FOUND", 404);
        // One pending president invitation at a time: the earlier link stops.
        await s.c.query(
          "UPDATE invitation SET revoked_at=now() WHERE organization_id=$1 AND role='club_president' AND issued_by_federation=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
          [command.clubId, s.fed],
        );
        const sitting = (await s.c.query(`SELECT 1 FROM role_assignment r WHERE r.organization_id=$1 AND ${currentPresident}`, [command.clubId])).rowCount;
        await inviteProfile(s.c, command.clubId, s.userId, {
          email: command.email,
          role: "club_president",
          profileId: null,
          greeting: greeting(command),
          issuedByFederation: s.fed,
          succession: !!sitting,
        });
        await audit(s.c, s.fed, s.userId, sitting ? "federation.presidentChange" : "federation.presidentInvited", command.clubId);
        return { ok: true as const };
      }
      if (command.action === "inviteReferee") {
        await inviteProfile(s.c, s.fed, s.userId, { email: command.email, role: "referee", profileId: null, greeting: greeting(command) });
        return { ok: true as const };
      }
      const invitation = await ownInvitation(s, command.id);
      if (command.action === "resendInvitation") await resendInvitation(s.c, invitation.organization_id, s.userId, invitation.id);
      else {
        await s.c.query("UPDATE invitation SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1", [invitation.id]);
        await audit(s.c, s.fed, s.userId, "invitation.revoked", invitation.id);
      }
      return { ok: true as const };
    },
    expected,
  );
}
