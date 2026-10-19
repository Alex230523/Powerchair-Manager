import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  account,
  active,
  requirePermission,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import {
  fieldsSchema,
  applicationSchema,
  validateAnswers,
  fieldVisible,
  type Field,
  type Status,
} from "./schema";
import { publish } from "../notifications/queue";
const id = z.uuid();
const formSchema = z.object({
  action: z.literal("form"),
  id: id.optional(),
  expectedVersion: z.number().int().positive().optional(),
  seasonId: id,
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000),
  fields: fieldsSchema,
  published: z.boolean(),
  capacity: z.number().int().min(1).max(10000).nullable(),
});
export const commandSchema = z.discriminatedUnion("action", [
  formSchema,
  z.object({
    action: z.literal("draft"),
    ...applicationSchema.shape,
    website: z.string().max(100).default(""),
  }),
  z.object({
    action: z.literal("save"),
    id,
    expectedVersion: z.number().int().positive(),
    answers: applicationSchema.shape.answers,
    subjectName: applicationSchema.shape.subjectName.optional(),
    birthDate: applicationSchema.shape.birthDate.optional(),
    subjectKind: z.enum(["self", "represented"]).optional(),
  }),
  z.object({
    action: z.literal("submit"),
    id,
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("withdraw"),
    id,
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("decision"),
    id,
    expectedVersion: z.number().int().positive(),
    status: z.enum(["incomplete", "review", "accepted", "waiting", "refused"]),
    message: z.string().trim().max(3000),
    profileId: id.optional(),
    teamId: id.optional(),
    confirmDuplicate: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("note"),
    id,
    message: z.string().trim().min(2).max(3000),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
async function tx<T>(db: Pool, fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505")
      throw new AccessError("DUPLICATE", 409);
    throw e;
  } finally {
    c.release();
  }
}
async function manager(c: PoolClient, p: Principal, org?: string) {
  const initial = await active(c, p);
  await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
    initial.organization_id,
  ]);
  await c.query(
    "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
    [p.sessionId],
  );
  const context = await active(c, p);
  if (
    context.organization_id !== initial.organization_id ||
    (org && org !== context.organization_id)
  )
    throw new AccessError("CONTEXT_CHANGED", 409);
  if (context.kind !== "club") throw new AccessError("FORBIDDEN");
  const user = await account(c, p);
  requirePermission(
    context.role,
    context.grants,
    "registrations.manage",
    !!user.twoFactorEnabled,
  );
  return context;
}
async function identity(c: PoolClient, p: Principal) {
  const user = await account(c, p);
  return user;
}
async function application(
  c: PoolClient,
  p: Principal,
  applicationId: string,
  adminOrg?: string,
) {
  const row = (
    await c.query(
      "SELECT *,birth_date::text AS birth_date FROM registration_application WHERE id=$1 FOR UPDATE",
      [applicationId],
    )
  ).rows[0];
  if (
    !row ||
    (adminOrg
      ? row.organization_id !== adminOrg || !row.submitted_at
      : row.applicant_user_id !== p.userId)
  )
    throw new AccessError("NOT_FOUND", 404);
  return row;
}
async function details(
  c: PoolClient,
  row: Record<string, unknown>,
  internal: boolean,
) {
  const applicationId = row.id;
  return {
    ...row,
    birth_date: String(row.birth_date).slice(0, 10),
    history: (
      await c.query(
        'SELECT h.id,h.status,h.message,h.internal,h.created_at,u.name AS actor FROM registration_history h JOIN "user" u ON u.id=h.actor_id WHERE application_id=$1 AND ($2 OR NOT h.internal) ORDER BY h.created_at,h.id',
        [applicationId, internal],
      )
    ).rows,
    attachments: (
      await c.query(
        "SELECT id,field_key,filename,media_type FROM registration_attachment WHERE application_id=$1",
        [applicationId],
      )
    ).rows,
  };
}
const selectApps = `SELECT a.*,a.birth_date::text AS birth_date,o.name AS organization_name,u.email AS applicant_email,u.name AS applicant_name FROM registration_application a JOIN organization o ON o.id=a.organization_id JOIN "user" u ON u.id=a.applicant_user_id`;
export async function publicForm(db: Pool, formId: string) {
  id.parse(formId);
  const row = (
    await db.query(
      "SELECT f.id,f.title,f.description,f.fields,f.version,f.capacity,o.name AS organization_name,s.name AS season_name FROM registration_form f JOIN organization o ON o.id=f.organization_id JOIN season s ON s.id=f.season_id AND s.organization_id=f.organization_id WHERE f.id=$1 AND f.published AND NOT s.archived",
      [formId],
    )
  ).rows[0];
  if (!row) throw new AccessError("NOT_FOUND", 404);
  return row as {
    id: string;
    title: string;
    description: string;
    fields: Field[];
    version: number;
    capacity: number | null;
    organization_name: string;
    season_name: string;
  };
}
export async function registrationView(
  db: Pool,
  p: Principal,
  adminMode: boolean,
) {
  return tx(db, async (c) => {
    await identity(c, p);
    if (!adminMode) {
      const rows = (
        await c.query(
          selectApps +
            " WHERE a.applicant_user_id=$1 ORDER BY a.updated_at DESC LIMIT 100",
          [p.userId],
        )
      ).rows;
      return {
        applications: await Promise.all(rows.map((r) => details(c, r, false))),
      };
    }
    const context = await manager(c, p);
    const org = context.organization_id;
    const rows = (
      await c.query(
        selectApps +
          " WHERE a.organization_id=$1 AND a.submitted_at IS NOT NULL ORDER BY a.updated_at DESC LIMIT 200",
        [org],
      )
    ).rows;
    return {
      context,
      forms: (
        await c.query(
          "SELECT * FROM registration_form WHERE organization_id=$1 ORDER BY updated_at DESC",
          [org],
        )
      ).rows,
      seasons: (
        await c.query(
          "SELECT id,name FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC",
          [org],
        )
      ).rows,
      teams: (
        await c.query(
          "SELECT t.id,t.name,t.season_id FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived",
          [org],
        )
      ).rows,
      profiles: (
        await c.query(
          "SELECT id,full_name,birth_date::text AS birth_date,status FROM club_person WHERE organization_id=$1 ORDER BY full_name LIMIT 2000",
          [org],
        )
      ).rows,
      applications: await Promise.all(rows.map((r) => details(c, r, true))),
    };
  });
}
async function history(
  c: PoolClient,
  p: Principal,
  a: Record<string, unknown>,
  status: string,
  message = "",
  internal = false,
) {
  await c.query(
    "INSERT INTO registration_history(application_id,actor_id,status,message,internal) VALUES($1,$2,$3,$4,$5)",
    [a.id, p.userId, status, message, internal],
  );
  if (a.submitted_at)
    await audit(
      c,
      String(a.organization_id),
      p.userId,
      "registration." + status,
      String(a.id),
    );
}
async function notify(c: PoolClient, a: Record<string, unknown>) {
  const u = (
    await c.query(
      'SELECT u.id,u.email,u.name,o.name AS organization FROM "user" u JOIN organization o ON o.id=$2 WHERE u.id=$1 AND u.active',
      [a.applicant_user_id, a.organization_id],
    )
  ).rows[0];
  if (!u) return;
  await publish(c, {
    organizationId: String(a.organization_id),
    userId: u.id,
    email: u.email,
    kind: "registration_update",
    category: "security",
    resourceType: "registration",
    resourceId: String(a.id),
    eventKey: "registration:" + a.id + ":" + a.version,
    locale: a.locale as "fr" | "nl" | "en",
    variables: {
      name: u.name,
      organization: u.organization,
      url: process.env.BETTER_AUTH_URL + "/" + a.locale + "/registrations/mine",
    },
    inApp: false,
  });
}
export async function registrationExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expectedOrg?: string,
) {
  return tx(db, async (c) => {
    await identity(c, p);
    const adminMode = ["form", "decision", "note"].includes(input.action);
    const context = adminMode ? await manager(c, p, expectedOrg) : null;
    if (input.action === "form") {
      const season = (
        await c.query(
          "SELECT id FROM season WHERE id=$1 AND organization_id=$2 AND NOT archived",
          [input.seasonId, context!.organization_id],
        )
      ).rows[0];
      if (!season) throw new AccessError("NOT_FOUND", 404);
      let formId = input.id;
      if (formId) {
        const existing = (
          await c.query(
            "SELECT * FROM registration_form WHERE id=$1 AND organization_id=$2 FOR UPDATE",
            [formId, context!.organization_id],
          )
        ).rows[0];
        if (!existing) throw new AccessError("NOT_FOUND", 404);
        if (existing.version !== input.expectedVersion)
          throw new AccessError("STALE_VERSION", 409);
        if (existing.season_id !== input.seasonId)
          throw new AccessError("SEASON_IMMUTABLE", 409);
        await c.query(
          "UPDATE registration_form SET title=$2,description=$3,fields=$4,published=$5,capacity=$6,version=version+1,updated_at=now() WHERE id=$1",
          [
            formId,
            input.title,
            input.description,
            JSON.stringify(input.fields),
            input.published,
            input.capacity,
          ],
        );
      } else
        formId = (
          await c.query(
            "INSERT INTO registration_form(organization_id,season_id,title,description,fields,published,capacity) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [
              context!.organization_id,
              input.seasonId,
              input.title,
              input.description,
              JSON.stringify(input.fields),
              input.published,
              input.capacity,
            ],
          )
        ).rows[0].id;
      await audit(
        c,
        context!.organization_id,
        p.userId,
        "registration.form",
        formId!,
      );
      return { id: formId };
    }
    if (input.action === "draft") {
      if (input.website) throw new AccessError("INVALID_INPUT", 400);
      if (input.birthDate > today())
        throw new AccessError("INVALID_INPUT", 400);
      // Durable per-account throttling complements verified account and honeypot.
      const rate = (
        await c.query(
          "INSERT INTO registration_rate(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN registration_rate.window_started<now()-interval '1 hour' THEN 1 ELSE registration_rate.count+1 END,window_started=CASE WHEN registration_rate.window_started<now()-interval '1 hour' THEN now() ELSE registration_rate.window_started END RETURNING count",
          [p.userId],
        )
      ).rows[0];
      if (rate.count > 20) throw new AccessError("RATE_LIMITED", 429);
      const f = (
        await c.query(
          "SELECT f.* FROM registration_form f JOIN season s ON s.id=f.season_id WHERE f.id=$1 AND f.published AND NOT s.archived FOR SHARE OF f",
          [input.formId],
        )
      ).rows[0];
      if (!f) throw new AccessError("NOT_FOUND", 404);
      let prior = null;
      if (input.priorId) {
        prior = (
          await c.query(
            "SELECT *,birth_date::text AS birth_date FROM registration_application WHERE id=$1 AND applicant_user_id=$2 AND organization_id=$3 AND status='accepted' AND season_id<>$4",
            [input.priorId, p.userId, f.organization_id, f.season_id],
          )
        ).rows[0];
        if (
          !prior ||
          prior.subject_name !== input.subjectName ||
          prior.subject_kind !== input.subjectKind ||
          prior.birth_date !== input.birthDate
        )
          throw new AccessError("NOT_FOUND", 404);
      }
      const priorAnswers = prior?.answers ?? {};
      const values = Object.fromEntries(
        fieldsSchema
          .parse(f.fields)
          .filter(
            (field) =>
              field.type !== "consent" &&
              field.type !== "signature" &&
              field.type !== "file",
          )
          .filter((field) => priorAnswers[field.key] !== undefined)
          .map((field) => [field.key, priorAnswers[field.key]]),
      );
      const row = (
        await c.query(
          "INSERT INTO registration_application(organization_id,form_id,applicant_user_id,season_id,subject_name,birth_date,locale,answers,form_snapshot,prior_application_id,subject_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(form_id,applicant_user_id,subject_name,birth_date) DO NOTHING RETURNING *",
          [
            f.organization_id,
            f.id,
            p.userId,
            f.season_id,
            input.subjectName,
            input.birthDate,
            input.locale,
            JSON.stringify({ ...values, ...input.answers }),
            JSON.stringify({
              version: f.version,
              title: f.title,
              fields: f.fields,
            }),
            prior?.id ?? null,
            input.subjectKind,
          ],
        )
      ).rows[0];
      if (!row) {
        return {
          id: (
            await c.query(
              "SELECT id FROM registration_application WHERE form_id=$1 AND applicant_user_id=$2 AND subject_name=$3 AND birth_date=$4",
              [f.id, p.userId, input.subjectName, input.birthDate],
            )
          ).rows[0].id,
        };
      }
      await history(c, p, row, "draft");
      return { id: row.id };
    }
    // Lock organization first, matching all other administrative writers.
    const org = (
      await c.query(
        "SELECT organization_id FROM registration_application WHERE id=$1",
        [input.id],
      )
    ).rows[0]?.organization_id;
    if (!org) throw new AccessError("NOT_FOUND", 404);
    if (!adminMode)
      await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
        org,
      ]);
    const a = await application(c, p, input.id, context?.organization_id);
    if (input.action === "note") {
      await history(c, p, a, "note", input.message, true);
      return { id: a.id };
    }
    if (a.version !== input.expectedVersion)
      throw new AccessError("STALE_VERSION", 409);
    if (input.action === "save") {
      if (!["draft", "incomplete"].includes(a.status))
        throw new AccessError("INVALID_TRANSITION", 409);
      const name = input.subjectName ?? a.subject_name,
        birth = input.birthDate ?? a.birth_date,
        kind = input.subjectKind ?? a.subject_kind;
      if (birth > today()) throw new AccessError("INVALID_INPUT", 400);
      if (
        a.prior_application_id &&
        (name !== a.subject_name ||
          birth !== a.birth_date ||
          kind !== a.subject_kind)
      )
        throw new AccessError("IDENTITY_MISMATCH", 409);
      const keys = fieldsSchema.parse(a.form_snapshot.fields).map((f) => f.key);
      if (Object.keys(input.answers).some((k) => !keys.includes(k)))
        throw new AccessError("INVALID_INPUT", 400);
      await c.query(
        "UPDATE registration_application SET answers=$2,subject_name=$3,birth_date=$4,subject_kind=$5,version=version+1,updated_at=now() WHERE id=$1",
        [a.id, JSON.stringify(input.answers), name, birth, kind],
      );
      await history(c, p, a, "saved");
      return { id: a.id };
    }
    let status: Status;
    if (input.action === "submit") {
      if (!["draft", "incomplete"].includes(a.status))
        throw new AccessError("INVALID_TRANSITION", 409);
      const open = (
        await c.query(
          "SELECT f.published,s.archived FROM registration_form f JOIN season s ON s.id=f.season_id WHERE f.id=$1",
          [a.form_id],
        )
      ).rows[0];
      if (!open?.published || open.archived)
        throw new AccessError("FORM_CLOSED", 409);
      const files = (
        await c.query(
          "SELECT field_key FROM registration_attachment WHERE application_id=$1",
          [a.id],
        )
      ).rows.map((r) => r.field_key);
      let answers;
      try {
        answers = validateAnswers(
          fieldsSchema.parse(a.form_snapshot.fields),
          a.answers,
          files,
        );
      } catch {
        throw new AccessError("MISSING_FIELDS", 400);
      }
      const visibleFiles = fieldsSchema
        .parse(a.form_snapshot.fields)
        .filter((f) => f.type === "file" && fieldVisible(f, a.answers))
        .map((f) => f.key);
      await c.query(
        "DELETE FROM registration_attachment WHERE application_id=$1 AND NOT(field_key=ANY($2::text[]))",
        [a.id, visibleFiles],
      );
      await c.query(
        "UPDATE registration_application SET answers=$2,submitted_at=COALESCE(submitted_at,now()) WHERE id=$1",
        [a.id, JSON.stringify(answers)],
      );
      status = "submitted";
    } else if (input.action === "withdraw") {
      if (
        !["draft", "submitted", "incomplete", "review", "waiting"].includes(
          a.status,
        )
      )
        throw new AccessError("INVALID_TRANSITION", 409);
      status = "withdrawn";
    } else {
      if (!["submitted", "incomplete", "review", "waiting"].includes(a.status))
        throw new AccessError("INVALID_TRANSITION", 409);
      status = input.status;
      if (
        ["incomplete", "refused"].includes(status) &&
        input.message.length < 5
      )
        throw new AccessError("MESSAGE_REQUIRED", 400);
      if (status === "accepted") {
        const f = (
          await c.query(
            "SELECT f.*,s.archived FROM registration_form f JOIN season s ON s.id=f.season_id WHERE f.id=$1",
            [a.form_id],
          )
        ).rows[0];
        if (f.archived) throw new AccessError("FORM_CLOSED", 409);
        const count = (
          await c.query(
            "SELECT count(*)::integer AS count FROM registration_application WHERE form_id=$1 AND status='accepted'",
            [a.form_id],
          )
        ).rows[0].count;
        if (f.capacity !== null && count >= f.capacity)
          throw new AccessError("CAPACITY_REACHED", 409);
        let profileId = input.profileId;
        if (a.prior_application_id) {
          const prior = (
            await c.query(
              "SELECT profile_id FROM registration_application WHERE id=$1 AND organization_id=$2 AND applicant_user_id=$3 AND status='accepted'",
              [a.prior_application_id, org, a.applicant_user_id],
            )
          ).rows[0];
          if (
            !prior?.profile_id ||
            (profileId && profileId !== prior.profile_id)
          )
            throw new AccessError("IDENTITY_MISMATCH", 409);
          profileId = prior.profile_id;
        }
        let selfPerson: string | undefined;
        if (a.subject_kind === "self") {
          selfPerson = (
            await c.query("SELECT id FROM person WHERE user_id=$1", [
              a.applicant_user_id,
            ])
          ).rows[0]?.id;
          if (!selfPerson) throw new AccessError("IDENTITY_MISMATCH", 409);
          const ownProfile = (
            await c.query(
              "SELECT id FROM club_person WHERE organization_id=$1 AND person_id=$2",
              [org, selfPerson],
            )
          ).rows[0]?.id;
          if (ownProfile) {
            if (profileId && profileId !== ownProfile)
              throw new AccessError("IDENTITY_MISMATCH", 409);
            profileId = ownProfile;
          }
        }
        const matches = (
          await c.query(
            "SELECT id FROM club_person WHERE organization_id=$1 AND lower(trim(full_name))=lower(trim($2)) AND birth_date=$3",
            [org, a.subject_name, a.birth_date],
          )
        ).rows;
        if (profileId) {
          const profile = (
            await c.query(
              "SELECT *,birth_date::text AS birth_date FROM club_person WHERE id=$1 AND organization_id=$2 FOR UPDATE",
              [profileId, org],
            )
          ).rows[0];
          if (!profile) throw new AccessError("NOT_FOUND", 404);
          if (selfPerson && profile.person_id !== selfPerson)
            throw new AccessError("IDENTITY_MISMATCH", 409);
          if (profile.status === "transferred")
            throw new AccessError("TRANSFER_REQUIRED", 409);
          if (profile.birth_date !== a.birth_date)
            throw new AccessError("IDENTITY_MISMATCH", 409);
          if (
            profile.full_name.toLowerCase().trim() !==
              a.subject_name.toLowerCase().trim() &&
            !input.confirmDuplicate
          )
            throw new AccessError("CONFIRM_IDENTITY", 409);
        } else if (matches.length) throw new AccessError("MATCH_EXISTING", 409);
        else {
          const identity =
            selfPerson ??
            (await c.query("INSERT INTO person DEFAULT VALUES RETURNING id"))
              .rows[0].id;
          profileId = (
            await c.query(
              "INSERT INTO club_person(organization_id,person_id,full_name,birth_date) VALUES($1,$2,$3,$4) RETURNING id",
              [org, identity, a.subject_name, a.birth_date],
            )
          ).rows[0].id;
        }
        await c.query(
          "UPDATE club_person SET status='active',directory_roles=CASE WHEN 'player'=ANY(directory_roles) THEN directory_roles ELSE array_append(directory_roles,'player') END,former_roles=array_remove(former_roles,'player'),version=version+1,updated_at=now() WHERE id=$1",
          [profileId],
        );
        if (input.teamId) {
          const team = (
            await c.query(
              "SELECT * FROM team WHERE id=$1 AND organization_id=$2 AND season_id=$3 AND NOT archived",
              [input.teamId, org, a.season_id],
            )
          ).rows[0];
          if (!team) throw new AccessError("NOT_FOUND", 404);
          await c.query(
            "INSERT INTO team_membership(organization_id,team_id,profile_id,role,starts_on) VALUES($1,$2,$3,'player',GREATEST((SELECT starts_on FROM season WHERE id=$4),LEAST(CURRENT_DATE,(SELECT ends_on FROM season WHERE id=$4)))) ON CONFLICT(team_id,profile_id,role) WHERE ends_on IS NULL DO NOTHING",
            [org, team.id, profileId, a.season_id],
          );
        }
        await c.query(
          "UPDATE registration_application SET profile_id=$2 WHERE id=$1",
          [a.id, profileId],
        );
        await c.query(
          "INSERT INTO registration_followup(application_id,kind) VALUES($1,'documents'),($1,'dues') ON CONFLICT DO NOTHING",
          [a.id],
        );
      }
    }
    const updated = (
      await c.query(
        "UPDATE registration_application SET status=$2,version=version+1,updated_at=now(),decided_at=CASE WHEN $3 THEN now() ELSE decided_at END,decided_by=CASE WHEN $3 THEN $4 ELSE decided_by END WHERE id=$1 RETURNING *",
        [a.id, status, adminMode, p.userId],
      )
    ).rows[0];
    await history(
      c,
      p,
      updated,
      status,
      input.action === "decision" ? input.message : "",
    );
    if (updated.submitted_at) await notify(c, updated);
    return { id: a.id };
  });
}
export async function attachmentUpload(
  db: Pool,
  p: Principal,
  applicationId: string,
  key: string,
  expectedVersion: number,
  file: { name: string; type: string; bytes: Buffer },
) {
  id.parse(applicationId);
  return tx(db, async (c) => {
    await identity(c, p);
    const org = (
      await c.query(
        "SELECT organization_id FROM registration_application WHERE id=$1",
        [applicationId],
      )
    ).rows[0]?.organization_id;
    if (!org) throw new AccessError("NOT_FOUND", 404);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [org]);
    const a = await application(c, p, applicationId);
    if (a.version !== expectedVersion)
      throw new AccessError("STALE_VERSION", 409);
    if (!["draft", "incomplete"].includes(a.status))
      throw new AccessError("INVALID_TRANSITION", 409);
    if (
      !fieldsSchema
        .parse(a.form_snapshot.fields)
        .some((f) => f.key === key && f.type === "file")
    )
      throw new AccessError("INVALID_INPUT", 400);
    const b = file.bytes;
    const valid =
      (file.type === "application/pdf" &&
        b.subarray(0, 5).toString() === "%PDF-") ||
      (file.type === "image/png" &&
        b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
      (file.type === "image/jpeg" &&
        b[0] === 255 &&
        b[1] === 216 &&
        b[2] === 255);
    if (!valid || b.length > 2097152 || !b.length)
      throw new AccessError("INVALID_FILE", 400);
    await c.query(
      "INSERT INTO registration_attachment(application_id,field_key,filename,media_type,content) VALUES($1,$2,$3,$4,$5) ON CONFLICT(application_id,field_key) DO UPDATE SET filename=EXCLUDED.filename,media_type=EXCLUDED.media_type,content=EXCLUDED.content,created_at=now()",
      [
        a.id,
        key,
        file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120),
        file.type,
        b,
      ],
    );
    await c.query(
      "UPDATE registration_application SET version=version+1,updated_at=now() WHERE id=$1",
      [a.id],
    );
    await history(c, p, a, "attachment");
    return { id: a.id };
  });
}
export async function attachmentRead(
  db: Pool,
  p: Principal,
  attachmentId: string,
  adminOrg?: string,
) {
  id.parse(attachmentId);
  return tx(db, async (c) => {
    await identity(c, p);
    if (adminOrg) await manager(c, p, adminOrg);
    const file = (
      await c.query(
        "SELECT f.*,a.applicant_user_id,a.organization_id,a.submitted_at FROM registration_attachment f JOIN registration_application a ON a.id=f.application_id WHERE f.id=$1",
        [attachmentId],
      )
    ).rows[0];
    if (
      !file ||
      (adminOrg
        ? file.organization_id !== adminOrg || !file.submitted_at
        : file.applicant_user_id !== p.userId)
    )
      throw new AccessError("NOT_FOUND", 404);
    return file as { content: Buffer; filename: string; media_type: string };
  });
}
