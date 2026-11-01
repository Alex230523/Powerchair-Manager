import type { PoolClient } from "pg";
import { AccessError } from "../access/service";

/**
 * Wave 17 (F1): what a decision on an application changed, so that
 * « Annuler » puts everything back during the undo window. The email to the
 * applicant and the invitation wait for the end of that window
 * (`available_at`), so an undone decision sends nothing.
 */
export type DecisionUndo = {
  /** The decided status, to check nothing changed since. */
  status: string;
  before: { status: string; decided_at: string | null; decided_by: string | null; profile_id: string | null };
  profile: {
    id: string;
    /** Created by the decision: removed on undo (with its person, when created too). */
    created: boolean;
    person: string | null;
    snapshot: { status: string; directory_roles: string[]; former_roles: string[]; email: string | null; phone: string; jersey_number: number | null } | null;
  } | null;
  membership: string | null;
  sport: { created: boolean; before: { control: string; jersey_size: string; sport_notes: string } | null; history: string[] } | null;
  support: { created: boolean; before: { emergency_contact: string; confidential_ciphertext: string | null } | null } | null;
  followups: string[];
  /** A3: the fee issued by itself on acceptance; cancelled on undo while unpaid. */
  dues?: string | null;
  invitations: string[];
  /** The parent's file created for the invitation. */
  parent: string | null;
  mails: string[];
  notifications: string[];
};

/** One step that another record may now depend on: tried, and replaced by the fallback when it cannot be done. */
async function attempt(c: PoolClient, sql: string, values: unknown[], fallback?: [string, unknown[]]) {
  await c.query("SAVEPOINT undo_step");
  try {
    await c.query(sql, values);
    await c.query("RELEASE SAVEPOINT undo_step");
  } catch {
    await c.query("ROLLBACK TO SAVEPOINT undo_step");
    if (fallback) await c.query(fallback[0], fallback[1]);
  }
}

export async function revertDecision(c: PoolClient, org: string, userId: string, application: string, p: DecisionUndo) {
  const row = (await c.query("SELECT status FROM registration_application WHERE id=$1 AND organization_id=$2 FOR UPDATE", [application, org])).rows[0];
  if (!row) throw new AccessError("NOT_FOUND", 404);
  // Decided again since: the undo would erase that newer decision.
  if (row.status !== p.status) throw new AccessError("STALE_VERSION", 409);
  if (p.mails.length) await c.query("UPDATE mail_job SET state='cancelled',completed_at=now() WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND state='pending'", [p.mails, org]);
  if (p.notifications.length) await c.query("DELETE FROM app_notification WHERE id=ANY($1::uuid[]) AND organization_id=$2", [p.notifications, org]);
  if (p.invitations.length) await c.query("DELETE FROM invitation WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND accepted_at IS NULL", [p.invitations, org]);
  if (p.parent) await attempt(c, "DELETE FROM club_person WHERE id=$1 AND organization_id=$2", [p.parent, org]);
  if (p.dues)
    await c.query(
      "UPDATE dues_receivable SET status='cancelled',cancelled_at=now(),version=version+1 WHERE id=$1 AND organization_id=$2 AND status='open' AND NOT EXISTS (SELECT 1 FROM finance_transaction t WHERE t.receivable_id=$1 AND t.cancelled_at IS NULL)",
      [p.dues, org],
    );
  if (p.followups.length) await c.query("DELETE FROM registration_followup WHERE application_id=$1 AND kind=ANY($2::text[])", [application, p.followups]);
  if (p.membership)
    await attempt(c, "DELETE FROM team_membership WHERE id=$1 AND organization_id=$2", [p.membership, org], [
      "UPDATE team_membership SET cancelled=true,closed_at=now() WHERE id=$1 AND organization_id=$2",
      [p.membership, org],
    ]);
  // B6: the webhook announcing the validation has not left yet; it goes.
  await c.query("DELETE FROM webhook_delivery WHERE organization_id=$1 AND event='registration.validated' AND state='pending' AND event_key LIKE $2", [org, `registration:${application}:%`]);
  await c.query(
    "UPDATE registration_application SET status=$3,decided_at=$4,decided_by=$5,profile_id=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
    [application, org, p.before.status, p.before.decided_at, p.before.decided_by, p.before.profile_id],
  );
  const profile = p.profile;
  if (profile) {
    if (p.sport) {
      if (p.sport.created) {
        if (p.sport.history.length) await c.query("DELETE FROM classification_history WHERE id=ANY($1::uuid[]) AND organization_id=$2", [p.sport.history, org]);
        await c.query("DELETE FROM player_sport_profile WHERE profile_id=$1 AND organization_id=$2", [profile.id, org]);
      } else if (p.sport.before)
        await c.query("UPDATE player_sport_profile SET control=$3,jersey_size=$4,sport_notes=$5 WHERE profile_id=$1 AND organization_id=$2", [
          profile.id,
          org,
          p.sport.before.control,
          p.sport.before.jersey_size,
          p.sport.before.sport_notes,
        ]);
    }
    if (p.support) {
      if (p.support.created) await c.query("DELETE FROM player_support_profile WHERE profile_id=$1 AND organization_id=$2", [profile.id, org]);
      else if (p.support.before)
        await c.query("UPDATE player_support_profile SET emergency_contact=$3,confidential_ciphertext=$4,updated_by=$5,updated_at=now() WHERE profile_id=$1 AND organization_id=$2", [
          profile.id,
          org,
          p.support.before.emergency_contact,
          p.support.before.confidential_ciphertext,
          userId,
        ]);
    }
    if (profile.created) {
      // A file someone else started to use meanwhile stays, set aside.
      await attempt(c, "DELETE FROM club_person WHERE id=$1 AND organization_id=$2", [profile.id, org], [
        "UPDATE club_person SET status='archived',directory_roles=array_remove(directory_roles,'player'),version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
        [profile.id, org],
      ]);
      if (profile.person) await attempt(c, "DELETE FROM person WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM club_person WHERE person_id=$1)", [profile.person]);
    } else if (profile.snapshot) {
      const s = profile.snapshot;
      await c.query(
        "UPDATE club_person SET status=$3,directory_roles=$4,former_roles=$5,email=$6,phone=$7,jersey_number=$8,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
        [profile.id, org, s.status, s.directory_roles, s.former_roles, s.email, s.phone, s.jersey_number],
      );
    }
  }
  await c.query("INSERT INTO registration_history(application_id,actor_id,status,message,internal) VALUES($1,$2,'undone','',false)", [application, userId]);
}
