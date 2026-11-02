import type { Pool, PoolClient } from "pg";
import { assignOnAccept } from "../onboarding/service";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { setVisibility } from "../transfers/consent";
const brusselsDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
import { AccessError, audit } from "./service";
import { isAdmin, permissions, roleAllowed, type Permission, type Role } from "./policy";
import { saveCare } from "../trips/service";

/**
 * Wave 16 (I2): invitations tied to a person's file, and the guided
 * account creation (/[locale]/welcome/[token]).
 *
 * An invitation may name the club file (club_person) the new account takes
 * over, the team mentioned in the email, and, for a parent invited for a
 * minor player, the child's file. Accepting it (from « Mon espace » or at the
 * end of the guided creation) opens the mandate, links the account to the
 * file and, for a parent, records the family link.
 */
type Db = Pool | PoolClient;
const current = `r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active`;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  grants: Permission[];
  created_by: string;
  valid_until: string | null;
  valid_from: string;
  profile_id: string | null;
  team_id: string | null;
  guardian_of: string | null;
  greeting: string;
  disputed_at: string | null;
  issued_by_federation: string | null;
  succession: boolean;
  kind: "club" | "federation";
  /** Wave 17 (G1): what the outgoing president keeps, and the message of the handover. */
  outgoing_user_id: string | null;
  outgoing_role: "member" | "coach" | "none" | null;
  message: string;
};

/** An invitation created from a file (add a person, import, accepted registration, « Renvoyer »). */
export async function inviteProfile(
  c: PoolClient,
  org: string,
  actor: string,
  i: {
    email: string;
    role: Role;
    grants?: Permission[];
    profileId: string | null;
    teamId?: string | null;
    guardianOf?: string | null;
    greeting?: string;
    resentFrom?: string | null;
    /** Wave 16 (I3): sent by the club's federation (a president). */
    issuedByFederation?: string | null;
    succession?: boolean;
    /** Wave 17 (G1): the date the new president takes office (default: on acceptance). */
    effectiveFrom?: string | null;
    outgoing?: { userId: string; role: "member" | "coach" | "none" } | null;
    message?: string;
  },
) {
  const token = randomBytes(32).toString("hex");
  const id = (
    await c.query(
      `INSERT INTO invitation(organization_id,email,role,grants,token_hash,expires_at,created_by,valid_from,profile_id,team_id,guardian_of,greeting,resent_from,issued_by_federation,succession,outgoing_user_id,outgoing_role,message)
       VALUES($1,lower($2),$3,$11,$4,now()+interval '7 days',$5,GREATEST(now(),COALESCE($14::timestamptz,now())),$6,$7,$8,$9,$10,$12,$13,$15,$16,$17) RETURNING id`,
      [
        org,
        i.email,
        i.role,
        hashToken(token),
        actor,
        i.profileId,
        i.teamId ?? null,
        i.guardianOf ?? null,
        (i.greeting ?? "").slice(0, 120),
        i.resentFrom ?? null,
        i.grants ?? [],
        i.issuedByFederation ?? null,
        i.succession ?? false,
        i.effectiveFrom ?? null,
        i.outgoing?.userId ?? null,
        i.outgoing?.role ?? null,
        (i.message ?? "").slice(0, 1000),
      ],
    )
  ).rows[0].id as string;
  // The federation's journal keeps what its people did in a club.
  await audit(c, i.issuedByFederation ?? org, actor, "invitation.created", id);
  const { publishInvitation } = await import("../notifications/events");
  await publishInvitation(c, org, id, token);
  return { id, token };
}

/** The invitation behind a token, still usable; locked when asked. */
export async function liveInvitation(c: Db, token: string, lock: boolean) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return ((
    await c.query(
      `SELECT i.*,o.kind FROM invitation i JOIN organization o ON o.id=i.organization_id
        WHERE i.token_hash=$1 AND i.expires_at>now() AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND (i.valid_until IS NULL OR i.valid_until>now())${lock ? " FOR UPDATE OF i" : ""}`,
      [hashToken(token)],
    )
  ).rows[0] ?? null) as InvitationRow | null;
}

/**
 * Opens the mandate of an invitation for this account: the issuer must still
 * hold the rights it handed out, the role must fit the organisation. Then the
 * account takes over the club file and a parent gets the family link.
 */
export async function acceptInvitation(c: PoolClient, invite: InvitationRow, user: { id: string; email: string }) {
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) throw new AccessError("INVITATION_INVALID", 404);
  if (invite.disputed_at) throw new AccessError("INVITATION_DISPUTED", 409);
  // A revoked or demoted issuer cannot leave usable privileged invitations behind.
  if (invite.issued_by_federation) {
    // Sent by the club's federation: its president, still in office, of the federation the club belongs to.
    const fromFederation = await c.query(
      `SELECT 1 FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id
         JOIN organization club ON club.id=$3 AND club.federation_id=r.organization_id
        WHERE r.organization_id=$1 AND r.user_id=$2 AND r.role='federation_president' AND ${current}`,
      [invite.issued_by_federation, invite.created_by, invite.organization_id],
    );
    if (!fromFederation.rowCount || invite.role !== "club_president" || invite.grants.length) throw new AccessError("INVITATION_INVALID", 404);
  }
  const issuers = invite.issued_by_federation ? { rows: [{ role: "club_president" as Role, grants: [] as Permission[] }] } : await c.query(
    `SELECT r.role,r.grants FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND ${current}`,
    [invite.organization_id, invite.created_by],
  );
  if (
    !issuers.rows.some(
      (r) =>
        permissions(r.role, r.grants).includes("invitations.create") &&
        (!isAdmin(invite.role) || isAdmin(r.role)) &&
        invite.grants.every((g: Permission) => permissions(r.role, r.grants).includes(g)),
    )
  )
    throw new AccessError("INVITATION_INVALID", 404);
  if (!roleAllowed(invite.role, invite.kind)) throw new AccessError("INVALID_ROLE", 400);
  const membership = await c.query("SELECT active FROM organization_membership WHERE organization_id=$1 AND user_id=$2", [invite.organization_id, user.id]);
  if (membership.rowCount && !membership.rows[0].active) throw new AccessError("MEMBERSHIP_DISABLED");
  await c.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [invite.organization_id, user.id]);
  const mandate = (
    await c.query("INSERT INTO role_assignment(organization_id,user_id,role,grants,valid_until,created_by,valid_from) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
      invite.organization_id,
      user.id,
      invite.role,
      invite.grants,
      invite.valid_until,
      invite.created_by,
      invite.valid_from,
    ])
  ).rows[0].id as string;
  await c.query("UPDATE invitation SET accepted_at=now() WHERE id=$1", [invite.id]);
  if (invite.succession) await applySuccession(c, invite, mandate, user.id);
  if (invite.profile_id) await takeOverFile(c, invite.organization_id, invite.profile_id, user.id);
  if (invite.profile_id && invite.guardian_of) {
    // The club invited this parent for this child: a declared link becomes a verified one.
    const upgraded = await c.query(
      `UPDATE guardian_relationship SET kind='legal_verified',can_view=true,can_edit=true,verified_by=$4,
            authorization_note=CASE WHEN length(trim(authorization_note))>=5 THEN authorization_note ELSE 'Invitation du club' END
        WHERE organization_id=$1 AND guardian_profile_id=$2 AND subject_profile_id=$3 AND revoked_at IS NULL RETURNING id`,
      [invite.organization_id, invite.profile_id, invite.guardian_of, invite.created_by],
    );
    if (!upgraded.rowCount)
      await c.query(
        `INSERT INTO guardian_relationship(organization_id,guardian_profile_id,subject_profile_id,kind,can_view,can_edit,authorization_note,verified_by)
         VALUES($1,$2,$3,'legal_verified',true,true,'Invitation du club',$4)`,
        [invite.organization_id, invite.profile_id, invite.guardian_of, invite.created_by],
      );
  }
  // 7: the staff roles chosen with the invitation.
  const { rolesOnAccept } = await import("./staff-roles");
  await rolesOnAccept(c, invite.organization_id, invite.id, mandate, invite.created_by);
  await audit(c, invite.organization_id, user.id, "invitation.accepted", mandate);
  // Parcours d'accueil: the journeys written for this role start now.
  await assignOnAccept(c, invite.organization_id, user.id, invite.role, invite.created_by);
  return mandate;
}

/**
 * Wave 17 (G1): the change of club president, whether the federation (I3)
 * or the outgoing president (Settings > Members) started it. One transaction
 * with the acceptance: the new mandate starts at the date of effect (or now),
 * every other president's mandate ends exactly then, so the club never has
 * two presidents nor none; the outgoing president keeps the role chosen;
 * the federation and both people are told.
 */
export async function applySuccession(c: PoolClient, invite: InvitationRow, mandate: string, newUser: string) {
  const at = (await c.query("SELECT GREATEST(now(),$1::timestamptz) AS at,GREATEST(now(),$1::timestamptz)<=now() AS now", [invite.valid_from])).rows[0] as { at: Date; now: boolean };
  await c.query("UPDATE role_assignment SET valid_from=$2 WHERE id=$1", [mandate, at.at]);
  const outgoing = (
    await c.query(
      `UPDATE role_assignment SET ${at.now ? "revoked_at=now()" : "valid_until=$3"} WHERE organization_id=$1 AND role='club_president' AND id<>$2 AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>$3) RETURNING user_id`,
      [invite.organization_id, mandate, at.at],
    )
  ).rows.map((r) => r.user_id as string);
  if (invite.outgoing_user_id && invite.outgoing_role && invite.outgoing_user_id !== newUser) {
    if (invite.outgoing_role === "coach")
      await c.query("INSERT INTO role_assignment(organization_id,user_id,role,grants,valid_from,created_by) VALUES($1,$2,'coach','{}',$3,$4)", [
        invite.organization_id,
        invite.outgoing_user_id,
        at.at,
        invite.created_by,
      ]);
    // « Aucun »: no role kept; at once, the account also leaves the club's members.
    if (invite.outgoing_role === "none" && at.now)
      await c.query("UPDATE organization_membership SET active=false WHERE organization_id=$1 AND user_id=$2", [invite.organization_id, invite.outgoing_user_id]);
  }
  await audit(c, invite.organization_id, newUser, "presidency.transferred", mandate, {
    from: outgoing,
    keeps: invite.outgoing_role,
    effective: at.at,
    byFederation: !!invite.issued_by_federation,
  });
  const fed = (await c.query("SELECT federation_id FROM organization WHERE id=$1", [invite.organization_id])).rows[0]?.federation_id as string | null;
  const told = (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,r.organization_id FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id
         LEFT JOIN role_assignment r ON r.user_id=u.id AND r.organization_id=$2 AND r.role='federation_president' AND r.revoked_at IS NULL
        WHERE u.id=ANY($1::text[]) OR r.id IS NOT NULL`,
      [[newUser, ...outgoing], fed],
    )
  ).rows as { id: string; email: string; name: string; locale: "fr" | "nl" | "en"; organization_id: string | null }[];
  const { publish } = await import("../notifications/queue");
  for (const u of told)
    await publish(c, {
      organizationId: u.organization_id ?? invite.organization_id,
      userId: u.id,
      email: u.email,
      kind: "access_changed",
      category: "security",
      resourceType: "membership",
      resourceId: mandate,
      eventKey: `presidency:${mandate}:${u.id}`,
      locale: (["fr", "nl", "en"].includes(u.locale) ? u.locale : "fr") as "fr" | "nl" | "en",
      variables: { name: u.name, organization: (await c.query("SELECT name FROM organization WHERE id=$1", [invite.organization_id])).rows[0].name, url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}/access` },
    });
}

/** The account's own person record now carries the club file (unless another account already does). */
async function takeOverFile(c: PoolClient, org: string, profileId: string, userId: string) {
  const file = (
    await c.query("SELECT cp.id,cp.person_id,p.user_id FROM club_person cp JOIN person p ON p.id=cp.person_id WHERE cp.id=$1 AND cp.organization_id=$2 FOR UPDATE OF cp", [profileId, org])
  ).rows[0] as { id: string; person_id: string; user_id: string | null } | undefined;
  if (!file || (file.user_id && file.user_id !== userId)) return;
  const own = (await c.query("SELECT id FROM person WHERE user_id=$1", [userId])).rows[0]?.id as string | undefined;
  if (!own || own === file.person_id) return;
  // The file's person may be shared with another club (transfer): then the account is linked there too.
  await c.query("UPDATE club_person SET person_id=$2,updated_at=now(),version=version+1 WHERE person_id=$1", [file.person_id, own]);
}

/* ------------------------------------------------------- Guided creation */

export const welcomeCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dispute"), note: z.string().trim().max(500) }),
  z.object({
    action: z.literal("create"),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    birthDate: z.iso.date().nullable(),
    phone: z.string().trim().max(40),
    locale: z.enum(["fr", "nl", "en"]),
    password: z.string().min(12).max(128),
    privacy: z.literal(true),
    classification: z.enum(["PF1", "PF2", "pending"]).nullable(),
    chair: z.enum(["own", "club"]).nullable(),
    care: z.string().trim().max(1000),
    /** Wave 17 (J3): « Visible par les autres clubs de la fédération », off unless ticked. */
    transferVisible: z.boolean().default(false),
  }),
]);
export type WelcomeCommand = z.infer<typeof welcomeCommand>;

/** What the welcome page shows: who invites, as what, and what is already known. */
export async function welcomeView(db: Pool, token: string) {
  const invite = await liveInvitation(db, token, false);
  if (!invite) {
    const known = /^[a-f0-9]{64}$/.test(token) ? (await db.query("SELECT accepted_at IS NOT NULL AS used FROM invitation WHERE token_hash=$1", [hashToken(token)])).rows[0] : undefined;
    return { state: (known?.used ? "used" : "invalid") as "used" | "invalid" };
  }
  if (invite.disputed_at) return { state: "disputed" as const };
  const info = (
    await db.query(
      `SELECT o.name AS organization,t.name AS team,cp.full_name,cp.birth_date::text AS birth_date,cp.phone,child.full_name AS child
         FROM organization o LEFT JOIN team t ON t.id=$2 AND t.organization_id=o.id
         LEFT JOIN club_person cp ON cp.id=$3 AND cp.organization_id=o.id
         LEFT JOIN club_person child ON child.id=$4 AND child.organization_id=o.id
        WHERE o.id=$1`,
      [invite.organization_id, invite.team_id, invite.profile_id, invite.guardian_of],
    )
  ).rows[0] as { organization: string; team: string | null; full_name: string | null; birth_date: string | null; phone: string | null; child: string | null };
  const account = (
    await db.query(`SELECT u.id,EXISTS(SELECT 1 FROM account a WHERE a."userId"=u.id AND a."providerId"='credential') AS password FROM "user" u WHERE lower(u.email)=lower($1)`, [
      invite.email,
    ])
  ).rows[0] as { id: string; password: boolean } | undefined;
  const [firstName, ...rest] = (info.full_name ?? invite.greeting ?? "").trim().split(/\s+/);
  return {
    state: "valid" as const,
    organization: info.organization,
    role: invite.role,
    team: info.team,
    child: info.child,
    email: invite.email,
    greeting: invite.greeting || firstName || "",
    /** none: a new account; password: sign in to accept; passwordless: a registration link account that now gets a password. */
    existing: (!account ? "none" : account.password ? "password" : "passwordless") as "none" | "password" | "passwordless",
    prefill: { firstName: firstName ?? "", lastName: rest.join(" "), birthDate: invite.role === "player" ? (info.birth_date ?? null) : null, phone: info.phone ?? "" },
    /** Club information step (classification, chair, care): players and parents only. */
    sport: invite.role === "player" || invite.role === "guardian",
  };
}

/** « Ce n'est pas mon rôle »: the invitation waits, the person who invited is told. */
export async function welcomeDispute(db: Pool, token: string, note: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const invite = await liveInvitation(c, token, true);
    if (!invite) throw new AccessError("INVITATION_INVALID", 404);
    await c.query("UPDATE invitation SET disputed_at=now(),disputed_note=$2 WHERE id=$1", [invite.id, note]);
    await audit(c, invite.organization_id, invite.created_by, "invitation.disputed", invite.id, { note });
    await c.query("COMMIT");
    return { ok: true as const };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/**
 * After the account exists (created by Better Auth on the server): accepts
 * the invitation and records what the person gave. Sensitive answers go to
 * their own sealed tables (care instructions), never in a generic field.
 */
export async function welcomeComplete(db: Pool, token: string, userId: string, input: Omit<Extract<WelcomeCommand, { action: "create" }>, "transferVisible"> & { transferVisible?: boolean }) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const preliminary = /^[a-f0-9]{64}$/.test(token) ? (await c.query("SELECT organization_id FROM invitation WHERE token_hash=$1", [hashToken(token)])).rows[0] : undefined;
    if (!preliminary) throw new AccessError("INVITATION_INVALID", 404);
    // Lock order: organization then invitation, as everywhere else.
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [preliminary.organization_id]);
    const invite = await liveInvitation(c, token, true);
    if (!invite) throw new AccessError("INVITATION_INVALID", 404);
    const user = (await c.query('SELECT id,email FROM "user" WHERE id=$1', [userId])).rows[0] as { id: string; email: string };
    const fullName = `${input.firstName} ${input.lastName}`.trim();
    // The link reached this mailbox: the address is verified.
    await c.query('UPDATE "user" SET name=$2,"emailVerified"=true WHERE id=$1', [userId, fullName]);
    await c.query("UPDATE person SET locale=$2 WHERE user_id=$1", [userId, input.locale]);
    await acceptInvitation(c, invite, user);
    const org = invite.organization_id;
    if (invite.profile_id) {
      await c.query(
        "UPDATE club_person SET full_name=$3,phone=$4,birth_date=COALESCE($5,birth_date),email=COALESCE(email,lower($6)),updated_at=now(),version=version+1 WHERE id=$1 AND organization_id=$2",
        [invite.profile_id, org, fullName, input.phone, invite.role === "player" ? input.birthDate : null, invite.email],
      );
      // The player's own file, or the child's for a parent.
      const player = invite.role === "player" ? invite.profile_id : invite.role === "guardian" ? invite.guardian_of : null;
      if (player && input.classification)
        await c.query(
          `INSERT INTO player_sport_profile(profile_id,organization_id,classification,updated_by) VALUES($1,$2,$3,$4)
           ON CONFLICT(profile_id) DO UPDATE SET classification=EXCLUDED.classification,updated_by=EXCLUDED.updated_by,updated_at=now(),version=player_sport_profile.version+1`,
          [player, org, input.classification, userId],
        );
      if (player && input.chair === "own" && !(await c.query("SELECT 1 FROM equipment_chair_assignment WHERE profile_id=$1 AND ends_on IS NULL", [player])).rowCount) {
        const chair = (await c.query("INSERT INTO equipment_chair(organization_id,name,ownership,status) VALUES($1,$2,'player','in_use') RETURNING id", [org, "Fauteuil personnel"])).rows[0].id;
        await c.query("INSERT INTO equipment_chair_assignment(organization_id,chair_id,profile_id,is_primary,starts_on,created_by) VALUES($1,$2,$3,true,CURRENT_DATE,$4)", [org, chair, player, userId]);
      }
      if (player && input.care) await saveCare(c, org, userId, player, { moment: "as_needed", time: "", title: "Consignes données à l’inscription", details: input.care, active: true });
      // Only the adult player, or a parent for a minor: setVisibility checks it.
      if (player && input.transferVisible) {
        const person = (await c.query("SELECT person_id FROM club_person WHERE id=$1", [player])).rows[0]?.person_id as string | undefined;
        if (person) await setVisibility(c, userId, person, true, brusselsDay());
      }
    }
    await c.query("COMMIT");
    return { organizationId: org };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** « Renvoyer »: a new link for the same person and role, the old one stops working. */
export async function resendInvitation(c: PoolClient, org: string, actor: string, id: string) {
  const old = (
    await c.query("SELECT * FROM invitation WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL FOR UPDATE", [id, org])
  ).rows[0] as (InvitationRow & { revoked_at: string | null }) | undefined;
  if (!old) throw new AccessError("NOT_FOUND", 404);
  await c.query("UPDATE invitation SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1", [id]);
  return inviteProfile(c, org, actor, {
    email: old.email,
    role: old.role,
    grants: old.grants,
    profileId: old.profile_id,
    teamId: old.team_id,
    guardianOf: old.guardian_of,
    greeting: old.greeting,
    resentFrom: old.id,
    issuedByFederation: old.issued_by_federation,
    succession: old.succession,
    effectiveFrom: old.valid_from,
    outgoing: old.outgoing_user_id && old.outgoing_role ? { userId: old.outgoing_user_id, role: old.outgoing_role } : null,
    message: old.message,
  });
}
