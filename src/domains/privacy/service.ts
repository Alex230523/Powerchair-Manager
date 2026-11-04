import type { Pool, PoolClient } from "pg";
import { mfaSatisfied } from "../../lib/security-policy";
import { audit, AccessError, type Principal } from "../access/service";
import {
  peopleScope,
  brusselsToday,
  type PeopleScope,
} from "../people/service";
import { seal, unseal } from "../notifications/crypto";
import {
  anonymousName,
  commandSchema,
  duplicatePairs,
  type Candidate,
  type Command,
} from "./schema";
export { commandSchema };

/** Privacy tools are for people managers with two-factor authentication. */
function allowed(s: PeopleScope) {
  if (!s.rights.includes("people.manage")) throw new AccessError("FORBIDDEN");
  if (!mfaSatisfied(!!s.user.twoFactorEnabled))
    throw new AccessError("MFA_REQUIRED");
}
async function log(
  c: PoolClient,
  org: string,
  actor: string,
  action: string,
  target: string | null,
  count = 1,
) {
  await c.query(
    "INSERT INTO privacy_log(organization_id,action,target_id,count,actor_id) VALUES($1,$2,$3,$4,$5)",
    [org, action, target, count, actor],
  );
}
async function settings(c: PoolClient, org: string) {
  return ((
    await c.query(
      "SELECT former_member_years,refused_application_months FROM privacy_setting WHERE organization_id=$1",
      [org],
    )
  ).rows[0] ?? { former_member_years: 5, refused_application_months: 12 }) as {
    former_member_years: number;
    refused_application_months: number;
  };
}

export async function privacyView(db: Pool, p: Principal) {
  return peopleScope(db, p, false, async (s) => {
    allowed(s);
    const c = s.client,
      org = s.context.organization_id;
    const people = (
      await c.query(
        `SELECT cp.id,cp.full_name,cp.birth_date::text,cp.email,(pe.user_id IS NOT NULL) AS has_account,cp.status
           FROM club_person cp JOIN person pe ON pe.id=cp.person_id
          WHERE cp.organization_id=$1 AND cp.merged_into IS NULL AND cp.anonymized_at IS NULL
          ORDER BY cp.full_name`,
        [org],
      )
    ).rows as Candidate[];
    const rules = await settings(c, org);
    // Former members: no current role, nothing active for longer than the retention.
    const former = (
      await c.query(
        `SELECT cp.id,cp.full_name,cp.status,
                GREATEST(cp.updated_at::date,COALESCE((SELECT max(COALESCE(m.ends_on,m.starts_on)) FROM team_membership m WHERE m.profile_id=cp.id),cp.joined_on)) AS last_activity
           FROM club_person cp
          WHERE cp.organization_id=$1 AND cp.merged_into IS NULL AND cp.anonymized_at IS NULL
            AND (cp.status<>'active' OR (cardinality(cp.directory_roles)>0 AND cp.directory_roles <@ cp.former_roles))
            AND NOT EXISTS (SELECT 1 FROM team_membership m WHERE m.profile_id=cp.id AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE))
            AND NOT EXISTS (SELECT 1 FROM person pe WHERE pe.id=cp.person_id AND pe.user_id IS NOT NULL)`,
        [org],
      )
    ).rows.filter(
      (r) =>
        String(r.last_activity).slice(0, 10) <=
        shiftYears(brusselsToday(), -rules.former_member_years),
    );
    const applications = (
      await c.query(
        "SELECT count(*)::int AS n FROM registration_application WHERE organization_id=$1 AND status IN ('refused','withdrawn') AND updated_at<now()-make_interval(months=>$2) AND subject_name NOT LIKE 'Candidature anonymisée%'",
        [org, rules.refused_application_months],
      )
    ).rows[0].n as number;
    const history = (
      await c.query(
        'SELECT l.action,l.count,l.created_at,u.name FROM privacy_log l JOIN "user" u ON u.id=l.actor_id WHERE l.organization_id=$1 ORDER BY l.created_at DESC LIMIT 20',
        [org],
      )
    ).rows;
    return {
      organization_id: org,
      people,
      duplicates: duplicatePairs(people),
      settings: rules,
      retention: { former, applications },
      history,
    };
  });
}
function shiftYears(day: string, years: number) {
  return `${Number(day.slice(0, 4)) + years}${day.slice(4)}`;
}

/** Everything the club holds about one person, as JSON (GDPR right of access). */
export async function privacyExport(db: Pool, p: Principal, profileId: string) {
  return peopleScope(db, p, false, async (s) => {
    allowed(s);
    const c = s.client,
      org = s.context.organization_id;
    const q = async (sql: string) =>
      (await c.query(sql, [profileId, org])).rows;
    const [person] = await q(
      "SELECT id,full_name,birth_date::text,email,phone,joined_on::text,status,directory_roles,former_roles,playing_position,jersey_number,created_at,updated_at FROM club_person WHERE id=$1 AND organization_id=$2",
    );
    if (!person) throw new AccessError("NOT_FOUND", 404);
    const [support] = await q(
      "SELECT support_needs,safety_notes,emergency_contact,confidential_ciphertext FROM player_support_profile WHERE profile_id=$1 AND organization_id=$2",
    );
    const sensitive = s.context.grants.includes("people.sensitive");
    const data = {
      exported_at: new Date().toISOString(),
      club: s.context.organization_name,
      person,
      teams: await q(
        "SELECT t.name AS team,m.role,m.position,m.starts_on::text,m.ends_on::text FROM team_membership m JOIN team t ON t.id=m.team_id WHERE m.profile_id=$1 AND m.organization_id=$2 ORDER BY m.starts_on",
      ),
      representatives: await q(
        "SELECT g.full_name AS guardian,r.kind,r.can_view,r.can_edit,r.starts_on::text,r.ends_on::text FROM guardian_relationship r JOIN club_person g ON g.id=r.guardian_profile_id WHERE r.subject_profile_id=$1 AND r.organization_id=$2",
      ),
      represents: await q(
        "SELECT sp.full_name AS person,r.kind,r.starts_on::text FROM guardian_relationship r JOIN club_person sp ON sp.id=r.subject_profile_id WHERE r.guardian_profile_id=$1 AND r.organization_id=$2",
      ),
      sport:
        (
          await q(
            "SELECT classification,classification_valid_until::text,control,sport_notes FROM player_sport_profile WHERE profile_id=$1 AND organization_id=$2",
          )
        )[0] ?? null,
      support: support
        ? {
            support_needs: support.support_needs,
            safety_notes: support.safety_notes,
            emergency_contact: support.emergency_contact,
            confidential:
              support.confidential_ciphertext && sensitive
                ? unseal(
                    support.confidential_ciphertext,
                    "player-health:" + profileId,
                  )
                : support.confidential_ciphertext
                  ? "(chiffré : habilitation données sensibles requise)"
                  : null,
          }
        : null,
      documents: await q(
        "SELECT name,category,status,expires_on::text,created_at FROM club_document WHERE profile_id=$1 AND organization_id=$2 ORDER BY created_at",
      ),
      attendance: await q(
        "SELECT e.title,e.kind,e.starts_at,i.response,i.actual FROM attendance_invitation i JOIN attendance_register r ON r.id=i.register_id JOIN calendar_event e ON e.id=r.event_id WHERE i.profile_id=$1 AND i.organization_id=$2 ORDER BY e.starts_at",
      ),
      dues: await q(
        "SELECT d.category,d.net_cents,d.status,d.created_at,(SELECT json_agg(json_build_object('due_on',i.due_on::text,'amount_cents',i.amount_cents) ORDER BY i.ordinal) FROM dues_installment i WHERE i.receivable_id=d.id) AS installments FROM dues_receivable d WHERE d.profile_id=$1 AND d.organization_id=$2",
      ),
      equipment: await q(
        "SELECT ch.name,a.is_primary,a.starts_on::text,a.ends_on::text FROM equipment_chair_assignment a JOIN equipment_chair ch ON ch.id=a.chair_id WHERE a.profile_id=$1 AND a.organization_id=$2",
      ),
      registrations: await q(
        "SELECT a.subject_name,a.status,a.answers,a.submitted_at,a.decided_at FROM registration_application a WHERE a.profile_id=$1 AND a.organization_id=$2",
      ),
      courses: await q(
        "SELECT k.title,q.status,q.completed_on::text,q.valid_until::text FROM training_request q JOIN training_course k ON k.id=q.course_id WHERE q.profile_id=$1 AND q.organization_id=$2",
      ),
      reminders: await q(
        "SELECT kind,sent_at FROM reminder_log WHERE profile_id=$1 AND organization_id=$2 ORDER BY sent_at",
      ),
    };
    await log(c, org, p.userId, "export", profileId);
    await audit(c, org, p.userId, "privacy.export", profileId);
    return data;
  });
}

export async function privacyExecute(
  db: Pool,
  p: Principal,
  command: Command,
  expected: string,
) {
  return peopleScope(db, p, true, async (s) => {
    allowed(s);
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    if (command.action === "settings") {
      await c.query(
        "INSERT INTO privacy_setting(organization_id,former_member_years,refused_application_months,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET former_member_years=EXCLUDED.former_member_years,refused_application_months=EXCLUDED.refused_application_months,updated_by=EXCLUDED.updated_by,updated_at=now()",
        [
          org,
          command.formerMemberYears,
          command.refusedApplicationMonths,
          p.userId,
        ],
      );
      await audit(c, org, p.userId, "privacy.settings", org);
      return { ok: true as const };
    }
    if (command.action === "purgeApplications") {
      const rules = await settings(c, org);
      const ids = (
        await c.query(
          "SELECT id FROM registration_application WHERE organization_id=$1 AND status IN ('refused','withdrawn') AND updated_at<now()-make_interval(months=>$2) AND subject_name NOT LIKE 'Candidature anonymisée%' FOR UPDATE",
          [org, rules.refused_application_months],
        )
      ).rows.map((r) => r.id as string);
      for (const id of ids) await anonymizeApplication(c, id);
      await log(c, org, p.userId, "purge_applications", null, ids.length);
      await audit(c, org, p.userId, "privacy.purge", org);
      return { ok: true as const, count: ids.length };
    }
    if (command.action === "anonymize") {
      const person = (
        await c.query(
          "SELECT cp.id,cp.full_name,cp.status,pe.user_id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND cp.organization_id=$2 AND cp.anonymized_at IS NULL FOR UPDATE OF cp",
          [command.id, org],
        )
      ).rows[0];
      if (!person) throw new AccessError("NOT_FOUND", 404);
      if (
        person.full_name.trim().toLowerCase() !==
        command.confirmName.toLowerCase()
      )
        throw new AccessError("CONFIRMATION_MISMATCH", 400);
      // A person with an account must first leave the club (membership closed).
      if (person.user_id) throw new AccessError("HAS_ACCOUNT", 409);
      await anonymize(s, command.id);
      await log(c, org, p.userId, "anonymize", command.id);
      await audit(c, org, p.userId, "privacy.anonymize", command.id);
      return { ok: true as const };
    }
    await merge(s, command.keepId, command.removeId);
    await log(c, org, p.userId, "merge", command.keepId);
    await audit(c, org, p.userId, "privacy.merge", command.keepId);
    return { ok: true as const };
  });
}

async function anonymizeApplication(c: PoolClient, id: string) {
  await c.query(
    "UPDATE registration_application SET subject_name='Candidature anonymisée '||left(id::text,8),answers='{}',confidential_answers=NULL,updated_at=now() WHERE id=$1",
    [id],
  );
  await c.query(
    "UPDATE registration_attachment SET filename='supprimé',content='\\x00' WHERE application_id=$1",
    [id],
  );
}

/**
 * Removes what identifies the person and keeps anonymous statistics
 * (attendance, team history, amounts). Irreversible.
 */
async function anonymize(s: PeopleScope, id: string) {
  const c = s.client,
    org = s.context.organization_id;
  await c.query(
    "UPDATE club_person SET full_name=$3,birth_date=NULL,email=NULL,phone='',playing_position='',jersey_number=NULL,status='archived',anonymized_at=now(),version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2",
    [id, org, anonymousName(id)],
  );
  await c.query(
    "DELETE FROM player_support_profile WHERE profile_id=$1 AND organization_id=$2",
    [id, org],
  );
  await c.query(
    "UPDATE player_sport_profile SET sport_notes='',version=version+1 WHERE profile_id=$1 AND organization_id=$2",
    [id, org],
  );
  await c.query(
    "UPDATE guardian_relationship SET revoked_at=COALESCE(revoked_at,now()),authorization_note=CASE WHEN can_view THEN 'Anonymisation' ELSE '' END WHERE organization_id=$2 AND (guardian_profile_id=$1 OR subject_profile_id=$1)",
    [id, org],
  );
  // Stored files: the content is replaced, the trace of the document remains.
  const versions = (
    await c.query(
      "SELECT v.id FROM document_version v JOIN club_document d ON d.id=v.document_id WHERE d.profile_id=$1 AND d.organization_id=$2",
      [id, org],
    )
  ).rows.map((r) => r.id as string);
  for (const v of versions)
    await c.query(
      "UPDATE document_version SET filename='supprimé',content_ciphertext=$2 WHERE id=$1",
      [v, seal({ data: "" }, "document:" + v)],
    );
  await c.query(
    "UPDATE club_document SET status='archived',updated_at=now() WHERE profile_id=$1 AND organization_id=$2",
    [id, org],
  );
  for (const a of (
    await c.query(
      "SELECT id FROM registration_application WHERE profile_id=$1 AND organization_id=$2",
      [id, org],
    )
  ).rows)
    await anonymizeApplication(c, a.id);
}

/**
 * Merges a duplicate into the profile to keep: teams, families, documents,
 * attendance, dues, chairs, courses and registrations follow; empty fields of
 * the kept profile are completed. Conflicting rows stay on the duplicate,
 * which is archived and marked as merged.
 */
async function merge(s: PeopleScope, keepId: string, removeId: string) {
  const c = s.client,
    org = s.context.organization_id;
  if (keepId === removeId) throw new AccessError("INVALID_INPUT", 400);
  const rows = (
    await c.query(
      "SELECT cp.*,cp.birth_date::text AS birth_date,cp.joined_on::text AS joined_on,pe.user_id FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=ANY($1) AND cp.organization_id=$2 AND cp.merged_into IS NULL AND cp.anonymized_at IS NULL ORDER BY cp.id FOR UPDATE OF cp",
      [[keepId, removeId], org],
    )
  ).rows;
  const keep = rows.find((r) => r.id === keepId),
    remove = rows.find((r) => r.id === removeId);
  if (!keep || !remove) throw new AccessError("NOT_FOUND", 404);
  if (keep.user_id && remove.user_id)
    throw new AccessError("TWO_ACCOUNTS", 409);
  if (
    keep.birth_date &&
    remove.birth_date &&
    keep.birth_date !== remove.birth_date
  )
    throw new AccessError("DIFFERENT_BIRTH_DATES", 409);
  const pending = await c.query(
    "SELECT 1 FROM person_transfer WHERE source_profile_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()",
    [removeId],
  );
  if (pending.rowCount) throw new AccessError("TRANSFER_PENDING", 409);
  const conflict = await c.query(
    "SELECT 1 FROM dues_receivable a JOIN dues_receivable b ON b.season_id=a.season_id AND lower(trim(b.category))=lower(trim(a.category)) WHERE a.profile_id=$1 AND b.profile_id=$2 AND a.status='open' AND b.status='open'",
    [keepId, removeId],
  );
  if (conflict.rowCount) throw new AccessError("DUES_CONFLICT", 409);

  // The account follows the person: the kept profile takes the duplicate's login.
  if (remove.user_id && !keep.user_id) {
    const spare = (
      await c.query("INSERT INTO person DEFAULT VALUES RETURNING id")
    ).rows[0].id;
    await c.query("UPDATE club_person SET person_id=$2 WHERE id=$1", [
      removeId,
      spare,
    ]);
    await c.query("UPDATE club_person SET person_id=$2 WHERE id=$1", [
      keepId,
      remove.person_id,
    ]);
  }
  const roles = [
    ...new Set([...keep.directory_roles, ...remove.directory_roles]),
  ];
  await c.query(
    `UPDATE club_person SET birth_date=COALESCE(birth_date,$3::date),email=COALESCE(NULLIF(email,''),$4),phone=CASE WHEN phone='' THEN $5 ELSE phone END,
            playing_position=CASE WHEN playing_position='' THEN $6 ELSE playing_position END,jersey_number=COALESCE(jersey_number,$7),
            joined_on=LEAST(joined_on,$8::date),directory_roles=$9,version=version+1,updated_at=now()
      WHERE id=$1 AND organization_id=$2`,
    [
      keepId,
      org,
      remove.birth_date,
      remove.email,
      remove.phone,
      remove.playing_position,
      remove.jersey_number,
      remove.joined_on,
      roles,
    ],
  );
  const move = async (sql: string) => c.query(sql, [keepId, removeId, org]);
  await move(
    "UPDATE team_membership m SET profile_id=$1 WHERE m.profile_id=$2 AND m.organization_id=$3 AND NOT EXISTS (SELECT 1 FROM team_membership k WHERE k.profile_id=$1 AND k.team_id=m.team_id AND k.role=m.role AND daterange(k.starts_on,COALESCE(k.ends_on,'infinity'::date),'[]') && daterange(m.starts_on,COALESCE(m.ends_on,'infinity'::date),'[]'))",
  );
  await move(
    "UPDATE guardian_relationship SET guardian_profile_id=$1 WHERE guardian_profile_id=$2 AND organization_id=$3 AND subject_profile_id<>$1",
  );
  await move(
    "UPDATE guardian_relationship SET subject_profile_id=$1 WHERE subject_profile_id=$2 AND organization_id=$3 AND guardian_profile_id<>$1",
  );
  await move(
    "UPDATE club_document d SET profile_id=$1 WHERE d.profile_id=$2 AND d.organization_id=$3 AND (d.rule_id IS NULL OR NOT EXISTS (SELECT 1 FROM club_document k WHERE k.profile_id=$1 AND k.rule_id=d.rule_id))",
  );
  await move(
    "UPDATE calendar_participant cp SET profile_id=$1 WHERE cp.profile_id=$2 AND cp.organization_id=$3 AND NOT EXISTS (SELECT 1 FROM calendar_participant k WHERE k.profile_id=$1 AND k.event_id=cp.event_id)",
  );
  await move(
    "UPDATE attendance_invitation i SET profile_id=$1 WHERE i.profile_id=$2 AND i.organization_id=$3 AND NOT EXISTS (SELECT 1 FROM attendance_invitation k WHERE k.profile_id=$1 AND k.register_id=i.register_id)",
  );
  await move(
    "UPDATE dues_receivable SET profile_id=$1 WHERE profile_id=$2 AND organization_id=$3",
  );
  await move(
    "UPDATE equipment_chair_assignment a SET profile_id=$1 WHERE a.profile_id=$2 AND a.organization_id=$3 AND (a.ends_on IS NOT NULL OR NOT EXISTS (SELECT 1 FROM equipment_chair_assignment k WHERE k.profile_id=$1 AND k.chair_id=a.chair_id AND k.ends_on IS NULL))",
  );
  await move(
    "UPDATE registration_application a SET profile_id=$1 WHERE a.profile_id=$2 AND a.organization_id=$3 AND NOT (a.status='accepted' AND EXISTS (SELECT 1 FROM registration_application k WHERE k.profile_id=$1 AND k.season_id=a.season_id AND k.status='accepted'))",
  );
  await move(
    "UPDATE training_request q SET profile_id=$1 WHERE q.profile_id=$2 AND q.organization_id=$3 AND NOT (q.status='requested' AND EXISTS (SELECT 1 FROM training_request k WHERE k.profile_id=$1 AND k.course_id=q.course_id AND k.status='requested'))",
  );
  await move(
    "UPDATE reminder_log SET profile_id=$1 WHERE profile_id=$2 AND organization_id=$3",
  );
  await move(
    "UPDATE player_sport_profile SET profile_id=$1 WHERE profile_id=$2 AND organization_id=$3 AND NOT EXISTS (SELECT 1 FROM player_sport_profile k WHERE k.profile_id=$1)",
  );
  // Confidential notes are bound to the profile id: they are re-encrypted for the kept one.
  const support = (
    await c.query(
      "SELECT * FROM player_support_profile WHERE profile_id=$2 AND organization_id=$3 AND NOT EXISTS (SELECT 1 FROM player_support_profile k WHERE k.profile_id=$1)",
      [keepId, removeId, org],
    )
  ).rows[0];
  if (support) {
    const resealed = support.confidential_ciphertext
      ? seal(
          unseal(support.confidential_ciphertext, "player-health:" + removeId),
          "player-health:" + keepId,
        )
      : null;
    await c.query(
      "UPDATE player_support_profile SET profile_id=$1,confidential_ciphertext=$4 WHERE profile_id=$2 AND organization_id=$3",
      [keepId, removeId, org, resealed],
    );
  }
  await c.query(
    "UPDATE club_person SET status='archived',merged_into=$1,directory_roles='{}',version=version+1,updated_at=now() WHERE id=$2 AND organization_id=$3",
    [keepId, removeId, org],
  );
}

/**
 * 12: « Mes données », for everyone: what the platform holds on me (my
 * account, my preferences, my profiles in each club and the representations
 * I hold), as a JSON file. Never another person's data, never the health
 * data (a club exports those on request, with its own right).
 */
export async function myDataExport(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const user = (await c.query('SELECT id,name,email,"createdAt" AS created_at FROM "user" WHERE id=$1', [p.userId])).rows[0];
    if (!user) throw new AccessError("UNAUTHENTICATED", 401);
    const person = (await c.query("SELECT id,locale,notifications_enabled FROM person WHERE user_id=$1", [p.userId])).rows[0] ?? null;
    const profiles = person
      ? (
          await c.query(
            `SELECT o.name AS organization,cp.full_name,cp.birth_date::text AS birth_date,cp.email,cp.phone,cp.joined_on::text AS joined_on,cp.status,cp.directory_roles,cp.playing_position,cp.jersey_number,cp.public_name_consent,cp.public_name_consent_at
               FROM club_person cp JOIN organization o ON o.id=cp.organization_id WHERE cp.person_id=$1 ORDER BY o.name`,
            [person.id],
          )
        ).rows
      : [];
    const representations = person
      ? (
          await c.query(
            `SELECT o.name AS organization,s.full_name AS represented,g.kind,g.can_view,g.can_edit,g.starts_on::text AS starts_on,g.ends_on::text AS ends_on
               FROM guardian_relationship g JOIN club_person me ON me.id=g.guardian_profile_id JOIN club_person s ON s.id=g.subject_profile_id JOIN organization o ON o.id=g.organization_id
              WHERE me.person_id=$1 AND g.revoked_at IS NULL ORDER BY o.name,s.full_name`,
            [person.id],
          )
        ).rows
      : [];
    const mandates = (
      await c.query(
        "SELECT o.name AS organization,r.role,r.valid_from,r.valid_until,r.revoked_at FROM role_assignment r JOIN organization o ON o.id=r.organization_id WHERE r.user_id=$1 ORDER BY o.name,r.valid_from",
        [p.userId],
      )
    ).rows;
    const preferences = (
      await c.query("SELECT o.name AS organization,n.category,n.email_enabled,n.in_app_enabled FROM notification_preference n JOIN organization o ON o.id=n.organization_id WHERE n.user_id=$1 ORDER BY o.name,n.category", [p.userId])
    ).rows;
    await c.query("COMMIT");
    return {
      exportedAt: new Date().toISOString(),
      account: { name: user.name, email: user.email, createdAt: user.created_at },
      preferences: { locale: person?.locale ?? null, notifications: person?.notifications_enabled ?? null, byCategory: preferences },
      profiles,
      representations,
      mandates,
    };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
