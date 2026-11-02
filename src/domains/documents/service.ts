import { cursorSchema, decodeCursor, PAGE_SIZE, pageOf } from "../../lib/cursor";
import { emitWebhook } from "../integrations/webhooks";
import { ensureStorage } from "../storage/service";
import { storageAdapter } from "../../lib/storage-adapter";
import { resolveScope, teamMembers } from "../scope/service";
import { mfaSatisfied } from "../../lib/security-policy";
import { Pool, type PoolClient } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { logSensitiveAccess } from "../club/governance";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { ageOn } from "../people/schema";
import { seal, unseal } from "../notifications/crypto";
import { publish } from "../notifications/queue";
import {
  docAccess,
  notificationAllowed,
  manages,
  day,
  type Actor,
  type Doc,
} from "./access";
import { commandSchema, validFile, templateText, type Command } from "./schema";
export { commandSchema };
type Scope = { c: PoolClient; p: Principal; a: Actor; name: string };
async function transaction<T>(db: Pool, fn: (c: PoolClient) => Promise<T>) {
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
async function scope<T>(
  db: Pool,
  p: Principal,
  fn: (s: Scope) => Promise<T>,
  expectedOrg?: string,
) {
  return transaction(db, async (c) => {
    const initial = await active(c, p);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      initial.organization_id,
    ]);
    await c.query(
      "SELECT session_id FROM active_context WHERE session_id=$1 FOR SHARE",
      [p.sessionId],
    );
    const context = await active(c, p),
      u = await account(c, p);
    if (
      initial.organization_id !== context.organization_id ||
      (expectedOrg && expectedOrg !== context.organization_id)
    )
      throw new AccessError("CONTEXT_CHANGED", 409);
    const s = {
      c,
      p,
      a: { ...context, twoFactorEnabled: !!u.twoFactorEnabled },
      name: context.organization_name,
    };
    await expireOrg(c, context.organization_id);
    return fn(s);
  });
}
function manage(s: Scope) {
  if (!manages(s.a))
    throw new AccessError(
      mfaSatisfied(!!s.a.twoFactorEnabled) ? "FORBIDDEN" : "MFA_REQUIRED",
    );
}
function health(s: Scope, sensitive: boolean) {
  if (sensitive && !s.a.grants.includes("documents.sensitive"))
    throw new AccessError("SENSITIVE_PERMISSION_REQUIRED");
}
async function record(s: Scope, id: string, write = false) {
  const org = (
    await s.c.query("SELECT organization_id FROM club_document WHERE id=$1", [
      id,
    ])
  ).rows[0]?.organization_id;
  if (!org) throw new AccessError("NOT_FOUND", 404);
  if (org !== s.a.organization_id)
    await s.c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      org,
    ]);
  const d = (
    await s.c.query(
      "SELECT *,expires_on::text AS expires_on FROM club_document WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0] as Doc;
  await expireOrg(s.c, d.organization_id);
  const refreshed = (
    await s.c.query(
      "SELECT *,expires_on::text AS expires_on FROM club_document WHERE id=$1",
      [id],
    )
  ).rows[0] as Doc;
  if (!(await docAccess(s.c, s.a, refreshed, write)))
    throw new AccessError("NOT_FOUND", 404);
  return refreshed;
}
async function log(
  c: PoolClient,
  d: Doc,
  actor: string | null,
  action: string,
  message = "",
) {
  await c.query(
    "INSERT INTO document_history(document_id,actor_id,action,message) VALUES($1,$2,$3,$4)",
    [d.id, actor, action, message],
  );
  if (actor)
    await audit(c, d.organization_id, actor, "document." + action, d.id);
}
async function task(c: PoolClient, id: string, kind: string, closed = false) {
  await c.query(
    "INSERT INTO document_task(document_id,kind,state,resolved_at) VALUES($1,$2,$3,CASE WHEN $3='closed' THEN now() ELSE NULL END) ON CONFLICT(document_id) DO UPDATE SET kind=$2,state=$3,resolved_at=CASE WHEN $3='closed' THEN now() ELSE NULL END",
    [id, kind, closed ? "closed" : "open"],
  );
}
async function notify(c: PoolClient, d: Doc, event: string) {
  const users = (
    await c.query(
      "SELECT DISTINCT u.id,u.name,u.email,COALESCE(p.locale,'fr') AS locale FROM \"user\" u JOIN role_assignment r ON r.user_id=u.id JOIN organization_membership m ON m.user_id=u.id AND m.organization_id=r.organization_id LEFT JOIN person p ON p.user_id=u.id WHERE r.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())",
      [d.organization_id],
    )
  ).rows;
  for (const u of users) {
    if (!(await notificationAllowed(c, u.id, d.id))) continue;
    await publish(c, {
      organizationId: d.organization_id,
      userId: u.id,
      email: u.email,
      kind: "document_update",
      category: "security",
      eventKey: "document:" + d.id + ":" + event,
      resourceType: "document",
      resourceId: d.id,
      locale: u.locale,
      variables: {
        name: u.name,
        organization: (
          await c.query("SELECT name FROM organization WHERE id=$1", [
            d.organization_id,
          ])
        ).rows[0].name,
        url: process.env.BETTER_AUTH_URL + "/" + u.locale + "/documents",
      },
    });
  }
}
async function expireOrg(c: PoolClient, org: string) {
  const expired = (
    await c.query(
      "UPDATE club_document SET status='expired',version=version+1,updated_at=now() WHERE organization_id=$1 AND status='valid' AND expires_on<CURRENT_DATE RETURNING *,expires_on::text AS expires_on",
      [org],
    )
  ).rows as Doc[];
  for (const d of expired) {
    await task(c, d.id, "expired");
    await log(c, d, null, "expired");
    await notify(c, d, "expired:" + d.version);
    // B6: the club's systems are told (the document's id and kind, never its content or name).
    await emitWebhook(c, org, "document.expired", `document:${d.id}:${d.version}`, { document_id: d.id, category: d.category, expires_on: d.expires_on });
  }
  return expired.length;
}
export async function sweepDocuments(db: Pool) {
  let count = 0;
  for (const org of (
    await db.query(
      "SELECT DISTINCT organization_id FROM club_document WHERE status='valid' AND expires_on<(now() AT TIME ZONE 'Europe/Brussels')::date",
    )
  ).rows)
    count += await transaction(db, async (c) => {
      await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
        org.organization_id,
      ]);
      return expireOrg(c, org.organization_id);
    });
  return count;
}
async function slot(
  s: Scope,
  values: {
    profileId?: string;
    seasonId: string;
    name: string;
    category: string;
    sensitive: boolean;
    ruleId?: string;
  },
  status = "requested",
) {
  if (
    !(
      await s.c.query(
        "SELECT id FROM season WHERE id=$1 AND organization_id=$2 AND NOT archived",
        [values.seasonId, s.a.organization_id],
      )
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
  if (
    values.profileId &&
    !(
      await s.c.query(
        "SELECT id FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'",
        [values.profileId, s.a.organization_id],
      )
    ).rowCount
  )
    throw new AccessError("NOT_FOUND", 404);
  const d = (
    await s.c.query(
      "INSERT INTO club_document(organization_id,profile_id,season_id,name,category,sensitive,rule_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(profile_id,rule_id) WHERE rule_id IS NOT NULL DO NOTHING RETURNING *,expires_on::text AS expires_on",
      [
        s.a.organization_id,
        values.profileId ?? null,
        values.seasonId,
        values.name,
        values.category,
        values.sensitive || values.category === "fitness",
        values.ruleId ?? null,
        status,
      ],
    )
  ).rows[0] as Doc | undefined;
  if (d) {
    await log(s.c, d, s.p.userId, "requested");
    await task(s.c, d.id, "missing");
    await notify(s.c, d, "requested");
  }
  return d;
}
export async function documentView(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}, cursor?: string) {
  // 13.3: the most recently changed first, a page at a time.
  const [afterAt, afterId] = decodeCursor(cursorSchema.parse(cursor), 2) ?? [null, null];
  return scope(db, p, async (s) => {
    // The top bar's team (wave 12): documents of its current members only.
    const chosen = (s.a as { kind?: string }).kind === "club" ? await resolveScope(s.c, { organization_id: s.a.organization_id, role: s.a.role, user_id: s.a.user_id, team_id: s.a.team_id }, raw) : { teamId: null };
    const members = chosen.teamId ? new Set(await teamMembers(s.c, s.a.organization_id, chosen.teamId)) : null;
    const rows = (
      await s.c.query(
        `SELECT d.*,d.updated_at::text AS cursor_at,d.expires_on::text AS expires_on,c.full_name AS owner_name,se.name AS season_name,o.name AS organization_name FROM club_document d JOIN organization o ON o.id=d.organization_id JOIN season se ON se.id=d.season_id LEFT JOIN club_person c ON c.id=d.profile_id WHERE (d.organization_id=$1 OR EXISTS(SELECT 1 FROM document_share sh WHERE sh.document_id=d.id AND sh.federation_id=$1 AND sh.revoked_at IS NULL)) AND ($2::timestamptz IS NULL OR (d.updated_at,d.id)<($2::timestamptz,$3::uuid)) ORDER BY d.updated_at DESC,d.id DESC LIMIT ${PAGE_SIZE + 1}`,
        [s.a.organization_id, afterAt, afterId],
      )
    ).rows;
    const page = pageOf(rows, PAGE_SIZE, (d) => [d.cursor_at, d.id]);
    const documents = [];
    for (const d of page.items) {
      if (members && d.profile_id && !members.has(d.profile_id)) continue;
      if (!(await docAccess(s.c, s.a, d))) continue;
      const foreign = d.organization_id !== s.a.organization_id;
      documents.push({
        ...d,
        canUpload:
          !foreign &&
          d.status !== "archived" &&
          (await docAccess(s.c, s.a, d, true)),
        canManage:
          !foreign &&
          manages(s.a) &&
          (!d.sensitive || s.a.grants.includes("documents.sensitive")),
        // Electronic signature: a template-generated text, signed by the person
        // or a representative allowed to act for them.
        canSign:
          !foreign &&
          d.status !== "archived" &&
          !!d.profile_id &&
          (await signable(s.c, d, s.p.userId)),
        signatures: foreign
          ? []
          : (
              await s.c.query(
                "SELECT signer_name,signed_at FROM document_signature WHERE document_id=$1 ORDER BY signed_at DESC",
                [d.id],
              )
            ).rows,
        versions: (
          await s.c.query(
            'SELECT v.id,v.sequence,v.filename,v.media_type,v.uploaded_at,v.verdict,v.expires_on::text AS expires_on,v.template_id,v.registration_attachment_id,u.name AS uploader,r.name AS reviewer FROM document_version v JOIN "user" u ON u.id=v.uploaded_by LEFT JOIN "user" r ON r.id=v.reviewed_by WHERE v.document_id=$1 AND ($2 OR v.id=$3) ORDER BY sequence DESC',
            [d.id, !foreign, d.current_version_id],
          )
        ).rows,
        history: foreign
          ? []
          : (
              await s.c.query(
                'SELECT h.*,u.name AS actor FROM document_history h LEFT JOIN "user" u ON u.id=h.actor_id WHERE document_id=$1 ORDER BY created_at,id',
                [d.id],
              )
            ).rows,
        shares:
          !foreign && manages(s.a)
            ? (
                await s.c.query(
                  "SELECT sh.id,sh.expires_on::text AS expires_on,sh.revoked_at,o.name FROM document_share sh JOIN organization o ON o.id=sh.federation_id WHERE document_id=$1 ORDER BY sh.created_at",
                  [d.id],
                )
              ).rows
            : [],
        task:
          (
            await s.c.query(
              "SELECT kind,state FROM document_task WHERE document_id=$1 AND state='open'",
              [d.id],
            )
          ).rows[0] ?? null,
      });
    }
    const admin = manages(s.a);
    return {
      context: {
        organization_id: s.a.organization_id,
        name: s.name,
        role: s.a.role,
      },
      manage: admin,
      sensitiveGrant: s.a.grants.includes("documents.sensitive"),
      mfa: mfaSatisfied(!!s.a.twoFactorEnabled),
      documents,
      next: page.next,
      profiles: admin
        ? (
            await s.c.query(
              "SELECT id,full_name FROM club_person WHERE organization_id=$1 AND status='active' ORDER BY full_name",
              [s.a.organization_id],
            )
          ).rows
        : [],
      seasons: (
        await s.c.query(
          "SELECT id,name FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC",
          [s.a.organization_id],
        )
      ).rows,
      rules: admin
        ? (
            await s.c.query(
              "SELECT * FROM document_rule WHERE organization_id=$1 ORDER BY name",
              [s.a.organization_id],
            )
          ).rows
        : [],
      templates: admin
        ? (
            await s.c.query(
              "SELECT DISTINCT ON(name,locale) id,name,locale,version,body FROM document_template WHERE organization_id=$1 ORDER BY name,locale,version DESC",
              [s.a.organization_id],
            )
          ).rows
        : [],
      federations: admin
        ? (
            await s.c.query(
              "SELECT id,name FROM organization WHERE kind='federation' ORDER BY name",
            )
          ).rows
        : [],
      followups: admin
        ? (
            await s.c.query(
              "SELECT a.id,c.full_name,se.name AS season_name FROM registration_followup f JOIN registration_application a ON a.id=f.application_id JOIN club_person c ON c.id=a.profile_id JOIN season se ON se.id=a.season_id WHERE a.organization_id=$1 AND f.kind='documents' AND f.state='awaiting_module'",
              [s.a.organization_id],
            )
          ).rows
        : [],
      imports: admin
        ? (
            await s.c.query(
              "SELECT f.id,f.filename,a.profile_id FROM registration_attachment f JOIN registration_application a ON a.id=f.application_id WHERE a.organization_id=$1 AND a.status='accepted'",
              [s.a.organization_id],
            )
          ).rows
        : [],
    };
  });
}
async function addVersion(
  s: Scope,
  d: Doc,
  file: { name: string; type: string; bytes: Buffer },
  source: { templateId?: string; attachmentId?: string } = {},
) {
  if (d.status === "archived") throw new AccessError("INVALID_TRANSITION", 409);
  const sha = createHash("sha256").update(file.bytes).digest("hex");
  if (
    d.current_version_id &&
    ["uploaded", "review", "valid"].includes(d.status) &&
    (
      await s.c.query("SELECT sha256 FROM document_version WHERE id=$1", [
        d.current_version_id,
      ])
    ).rows[0].sha256 === sha
  )
    return { id: d.id };
  const versionId = randomUUID(),
    sequence = (
      await s.c.query(
        "SELECT COALESCE(max(sequence),0)+1 AS next FROM document_version WHERE document_id=$1",
        [d.id],
      )
    ).rows[0].next;
  await s.c.query(
    "INSERT INTO document_version(id,document_id,sequence,filename,media_type,content_ciphertext,sha256,uploaded_by,template_id,registration_attachment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      versionId,
      d.id,
      sequence,
      file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120),
      file.type,
      // B2: the store chosen by STORAGE_DRIVER (PostgreSQL by default) keeps the sealed content.
      await storageAdapter().put("document:" + versionId, seal({ data: file.bytes.toString("base64") }, "document:" + versionId)),
      sha,
      s.p.userId,
      source.templateId ?? null,
      source.attachmentId ?? null,
    ],
  );
  const next = (
    await s.c.query(
      "UPDATE club_document SET current_version_id=$2,status='uploaded',expires_on=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING *,expires_on::text AS expires_on",
      [d.id, versionId],
    )
  ).rows[0];
  await task(s.c, d.id, "review");
  await log(s.c, next, s.p.userId, "uploaded");
  await notify(s.c, next, "uploaded:" + next.version);
  return { id: d.id };
}
export async function documentExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expectedOrg: string,
) {
  return scope(
    db,
    p,
    async (s) => {
      manage(s);
      if (input.action === "request") {
        health(s, input.sensitive || input.category === "fitness");
        return { id: (await slot(s, input))!.id };
      }
      if (input.action === "rule") {
        if (input.maxAge < input.minAge)
          throw new AccessError("INVALID_INPUT", 400);
        health(s, input.sensitive || input.category === "fitness");
        if (
          !(
            await s.c.query(
              "SELECT id FROM season WHERE id=$1 AND organization_id=$2 AND NOT archived",
              [input.seasonId, s.a.organization_id],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        if (input.id) {
          const previous = (
            await s.c.query(
              "SELECT * FROM document_rule WHERE id=$1 AND organization_id=$2 FOR UPDATE",
              [input.id, s.a.organization_id],
            )
          ).rows[0];
          if (!previous) throw new AccessError("NOT_FOUND", 404);
          health(s, previous.sensitive);
          if (previous.season_id !== input.seasonId)
            throw new AccessError("SEASON_IMMUTABLE", 409);
          if (previous.version !== input.expectedVersion)
            throw new AccessError("STALE_VERSION", 409);
          await s.c.query(
            "UPDATE document_rule SET name=$2,season_id=$3,category=$4,sensitive=$5,role=$6,min_age=$7,max_age=$8,active=$9,version=version+1 WHERE id=$1",
            [
              input.id,
              input.name,
              input.seasonId,
              input.category,
              input.sensitive || input.category === "fitness",
              input.role,
              input.minAge,
              input.maxAge,
              input.active,
            ],
          );
        } else
          input = {
            ...input,
            id: (
              await s.c.query(
                "INSERT INTO document_rule(organization_id,season_id,name,category,sensitive,role,min_age,max_age,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
                [
                  s.a.organization_id,
                  input.seasonId,
                  input.name,
                  input.category,
                  input.sensitive || input.category === "fitness",
                  input.role,
                  input.minAge,
                  input.maxAge,
                  input.active,
                ],
              )
            ).rows[0].id,
          };
        if (input.sensitive || input.category === "fitness")
          await s.c.query(
            "UPDATE club_document SET sensitive=true,version=version+1 WHERE rule_id=$1 AND NOT sensitive",
            [input.id],
          );
        await audit(
          s.c,
          s.a.organization_id,
          p.userId,
          "document.rule",
          input.id!,
        );
        return { id: input.id };
      }
      if (input.action === "plan") {
        const rules = (
          await s.c.query(
            "SELECT * FROM document_rule WHERE organization_id=$1 AND season_id=$2 AND active AND required",
            [s.a.organization_id, input.seasonId],
          )
        ).rows;
        if (!rules.length) throw new AccessError("RULES_REQUIRED", 409);
        for (const rule of rules) health(s, rule.sensitive);
        let count = 0;
        const profiles = (
          await s.c.query(
            "SELECT id,birth_date::text AS birth_date FROM club_person WHERE organization_id=$1 AND status='active'",
            [s.a.organization_id],
          )
        ).rows;
        for (const profile of profiles) {
          for (const rule of rules) {
            if ((rule.min_age > 0 || rule.max_age < 120) && !profile.birth_date)
              continue;
            const age = profile.birth_date
              ? ageOn(profile.birth_date, day())
              : null;
            if (age !== null && (age < rule.min_age || age > rule.max_age))
              continue;
            if (
              rule.role !== "any" &&
              !(
                await s.c.query(
                  "SELECT 1 FROM team_membership a JOIN team t ON t.id=a.team_id WHERE a.organization_id=$1 AND a.profile_id=$2 AND t.season_id=$3 AND a.role=$4 AND NOT a.cancelled AND a.closed_at IS NULL",
                  [s.a.organization_id, profile.id, input.seasonId, rule.role],
                )
              ).rowCount
            )
              continue;
            if (
              await slot(
                s,
                {
                  profileId: profile.id,
                  seasonId: input.seasonId,
                  name: rule.name,
                  category: rule.category,
                  sensitive: rule.sensitive,
                  ruleId: rule.id,
                },
                "missing",
              )
            )
              count++;
          }
        }
        await s.c.query(
          "UPDATE registration_followup f SET state='processed' FROM registration_application a WHERE a.id=f.application_id AND a.organization_id=$1 AND a.season_id=$2 AND a.status='accepted' AND f.kind='documents'",
          [s.a.organization_id, input.seasonId],
        );
        return { count };
      }
      if (input.action === "template") {
        try {
          templateText(input.body, {});
        } catch {
          throw new AccessError("INVALID_TEMPLATE", 400);
        }
        const current = (
          await s.c.query(
            "SELECT COALESCE(max(version),0) AS version FROM document_template WHERE organization_id=$1 AND name=$2 AND locale=$3",
            [s.a.organization_id, input.name, input.locale],
          )
        ).rows[0].version;
        if (current !== input.expectedVersion)
          throw new AccessError("STALE_VERSION", 409);
        const id = (
          await s.c.query(
            "INSERT INTO document_template(organization_id,name,locale,version,body,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              s.a.organization_id,
              input.name,
              input.locale,
              current + 1,
              input.body,
              p.userId,
            ],
          )
        ).rows[0].id;
        await audit(
          s.c,
          s.a.organization_id,
          p.userId,
          "document.template",
          id,
        );
        return { id };
      }
      if (input.action === "revoke") {
        const sh = (
          await s.c.query(
            "SELECT sh.*,d.organization_id FROM document_share sh JOIN club_document d ON d.id=sh.document_id WHERE sh.id=$1",
            [input.id],
          )
        ).rows[0];
        if (!sh || sh.organization_id !== s.a.organization_id)
          throw new AccessError("NOT_FOUND", 404);
        const d = await record(s, sh.document_id, true);
        await s.c.query(
          "UPDATE document_share SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1",
          [input.id],
        );
        await log(s.c, d, p.userId, "share.revoked");
        return { id: input.id };
      }
      const d = await record(s, input.id, true);
      health(s, d.sensitive);
      if (d.version !== input.expectedVersion)
        throw new AccessError("STALE_VERSION", 409);
      if (input.action === "review") {
        if (d.status === "archived")
          throw new AccessError("INVALID_TRANSITION", 409);
        if (
          ["valid", "review", "refused"].includes(input.status) &&
          !d.current_version_id
        )
          throw new AccessError("FILE_REQUIRED", 409);
        if (
          ["requested", "refused"].includes(input.status) &&
          input.message.length < 5
        )
          throw new AccessError("MESSAGE_REQUIRED", 400);
        if (
          input.status === "valid" &&
          input.expiresOn &&
          input.expiresOn < day()
        )
          throw new AccessError("INVALID_DATE", 400);
        await s.c.query(
          "UPDATE club_document SET status=$2,expires_on=$3,version=version+1,updated_at=now() WHERE id=$1",
          [
            d.id,
            input.status,
            input.status === "valid" ? input.expiresOn : null,
          ],
        );
        if (d.current_version_id)
          await s.c.query(
            "UPDATE document_version SET reviewed_by=$2,reviewed_at=now(),verdict=$3,expires_on=$4 WHERE id=$1",
            [
              d.current_version_id,
              p.userId,
              input.status,
              input.status === "valid" ? input.expiresOn : null,
            ],
          );
        await log(s.c, d, p.userId, input.status, input.message);
        await task(
          s.c,
          d.id,
          "missing",
          ["valid", "archived"].includes(input.status),
        );
        await notify(s.c, d, input.status + ":" + (d.version + 1));
        return { id: d.id };
      }
      if (input.action === "share") {
        if (
          d.status !== "valid" ||
          !d.current_version_id ||
          input.expiresOn < day() ||
          (d.expires_on && input.expiresOn > d.expires_on)
        )
          throw new AccessError("INVALID_TRANSITION", 409);
        if (
          !(
            await s.c.query(
              "SELECT 1 FROM organization WHERE id=$1 AND kind='federation'",
              [input.federationId],
            )
          ).rowCount
        )
          throw new AccessError("NOT_FOUND", 404);
        const sh = (
          await s.c.query(
            "INSERT INTO document_share(document_id,version_id,federation_id,expires_on,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(document_id,version_id,federation_id) WHERE revoked_at IS NULL DO UPDATE SET expires_on=EXCLUDED.expires_on RETURNING id",
            [
              d.id,
              d.current_version_id,
              input.federationId,
              input.expiresOn,
              p.userId,
            ],
          )
        ).rows[0];
        await log(s.c, d, p.userId, "shared");
        return { id: sh.id };
      }
      if (input.action === "generate") {
        const tpl = (
          await s.c.query(
            "SELECT * FROM document_template WHERE id=$1 AND organization_id=$2",
            [input.templateId, s.a.organization_id],
          )
        ).rows[0];
        if (!tpl) throw new AccessError("NOT_FOUND", 404);
        const owner = d.profile_id
          ? (
              await s.c.query("SELECT full_name FROM club_person WHERE id=$1", [
                d.profile_id,
              ])
            ).rows[0].full_name
          : s.name;
        const text = templateText(tpl.body, {
          name: owner,
          organization: s.name,
          season: (
            await s.c.query("SELECT name FROM season WHERE id=$1", [
              d.season_id,
            ])
          ).rows[0].name,
          date: day(),
        });
        return addVersion(
          s,
          d,
          {
            name: tpl.name + ".txt",
            type: "text/plain",
            bytes: Buffer.from(text),
          },
          { templateId: tpl.id },
        );
      }
      const f = (
        await s.c.query(
          "SELECT f.* FROM registration_attachment f JOIN registration_application a ON a.id=f.application_id WHERE f.id=$1 AND a.organization_id=$2 AND a.profile_id=$3 AND a.status='accepted'",
          [input.attachmentId, s.a.organization_id, d.profile_id],
        )
      ).rows[0];
      if (!f) throw new AccessError("NOT_FOUND", 404);
      await ensureStorage(s.c, s.a.organization_id, Math.ceil((f.content.length * 4) / 3));
      return addVersion(
        s,
        d,
        { name: f.filename, type: f.media_type, bytes: f.content },
        { attachmentId: f.id },
      );
    },
    expectedOrg,
  );
}
export async function documentUpload(
  db: Pool,
  p: Principal,
  id: string,
  expectedVersion: number,
  file: { name: string; type: string; bytes: Buffer },
  org: string,
) {
  z.uuid().parse(id);
  if (!validFile(file.type, file.bytes))
    throw new AccessError("INVALID_FILE", 400);
  return scope(
    db,
    p,
    async (s) => {
      const d = await record(s, id, true);
      if (d.version !== expectedVersion)
        throw new AccessError("STALE_VERSION", 409);
      // Stored encrypted in base64: about four thirds of the file.
      await ensureStorage(s.c, s.a.organization_id, Math.ceil((file.bytes.length * 4) / 3));
      return addVersion(s, d, file);
    },
    org,
  );
}
export async function documentDownload(
  db: Pool,
  p: Principal,
  versionId: string,
  org: string,
) {
  z.uuid().parse(versionId);
  return scope(
    db,
    p,
    async (s) => {
      const f = (
        await s.c.query("SELECT * FROM document_version WHERE id=$1", [
          versionId,
        ])
      ).rows[0];
      if (!f) throw new AccessError("NOT_FOUND", 404);
      const d = await record(s, f.document_id);
      if (
        d.organization_id !== s.a.organization_id &&
        d.current_version_id !== versionId
      )
        throw new AccessError("NOT_FOUND", 404);
      await log(s.c, d, p.userId, "downloaded");
      // Staff opening a health document also writes the health access journal.
      if (d.sensitive && s.a.grants.includes("documents.sensitive"))
        await logSensitiveAccess(
          s.c,
          d.organization_id,
          p.userId,
          d.profile_id ?? null,
          "sensitive_document",
          versionId,
        );
      const body = unseal<{ data: string }>(
        await storageAdapter().get("document:" + versionId, f.content_ciphertext),
        "document:" + versionId,
      );
      return { bytes: Buffer.from(body.data, "base64"), filename: f.filename };
    },
    org,
  );
}

/** The current version comes from a template and is not signed yet; the actor signs for the person. */
async function signable(c: Scope["c"], d: Doc, userId: string) {
  if (!d.current_version_id || !d.profile_id) return false;
  const source = (
    await c.query(
      "SELECT v.template_id,v.media_type,EXISTS(SELECT 1 FROM document_signature g WHERE g.source_version_id=v.id OR g.signed_version_id=v.id) AS signed FROM document_version v WHERE v.id=$1",
      [d.current_version_id],
    )
  ).rows[0];
  if (
    !source?.template_id ||
    source.media_type !== "text/plain" ||
    source.signed
  )
    return false;
  return !!(
    await c.query(
      `SELECT 1 FROM club_person cp JOIN person pe ON pe.id=cp.person_id WHERE cp.id=$1 AND pe.user_id=$2
       UNION ALL
       SELECT 1 FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id
        WHERE g.subject_profile_id=$1 AND pe.user_id=$2 AND g.can_edit AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)`,
      [d.profile_id, userId],
    )
  ).rowCount;
}

/**
 * Electronic signature: the signed text (template text, signer, time, SHA-256
 * of the text) becomes a new version for the club to review; the drawn
 * signature is kept beside it.
 */
export async function documentSign(
  db: Pool,
  p: Principal,
  id: string,
  input: {
    expectedVersion: number;
    signerName: string;
    signature: string;
    accept: boolean;
  },
  org: string,
) {
  z.uuid().parse(id);
  const name = z.string().trim().min(2).max(120).parse(input.signerName);
  if (input.accept !== true) throw new AccessError("CONSENT_REQUIRED", 400);
  const png = Buffer.from(
    z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
      .max(280000)
      .parse(input.signature)
      .split(",")[1],
    "base64",
  );
  if (
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    png.length > 204800
  )
    throw new AccessError("INVALID_FILE", 400);
  return scope(
    db,
    p,
    async (s) => {
      const d = await record(s, id, true);
      if (d.version !== input.expectedVersion)
        throw new AccessError("STALE_VERSION", 409);
      if (!(await signable(s.c, d, p.userId)))
        throw new AccessError("FORBIDDEN");
      const source = (
        await s.c.query("SELECT * FROM document_version WHERE id=$1", [
          d.current_version_id,
        ])
      ).rows[0];
      const text = Buffer.from(
        unseal<{ data: string }>(
          await storageAdapter().get("document:" + source.id, source.content_ciphertext),
          "document:" + source.id,
        ).data,
        "base64",
      ).toString("utf8");
      const sha = createHash("sha256").update(text).digest("hex");
      const account = (
        await s.c.query('SELECT email FROM "user" WHERE id=$1', [p.userId])
      ).rows[0];
      const when = new Intl.DateTimeFormat("fr-BE", {
        dateStyle: "long",
        timeStyle: "medium",
        timeZone: "Europe/Brussels",
      }).format(new Date());
      const signed = [
        text,
        "",
        "--------------------------------------------------------------",
        "Signature électronique",
        `Signé par : ${name} (compte ${account.email})`,
        `Le : ${when} (heure de Bruxelles)`,
        `Empreinte SHA-256 du texte signé : ${sha}`,
        "Mention : lu et approuvé.",
      ].join("\n");
      await addVersion(
        s,
        d,
        {
          name: source.filename.replace(/\.txt$/i, "") + "-signe.txt",
          type: "text/plain",
          bytes: Buffer.from(signed, "utf8"),
        },
        { templateId: source.template_id },
      );
      const after = (
        await s.c.query(
          "SELECT current_version_id FROM club_document WHERE id=$1",
          [d.id],
        )
      ).rows[0].current_version_id;
      await s.c.query(
        "INSERT INTO document_signature(organization_id,document_id,source_version_id,signed_version_id,signer_user_id,signer_name,text_sha256,signature_png) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [d.organization_id, d.id, source.id, after, p.userId, name, sha, png],
      );
      await log(s.c, d, p.userId, "signed");
      return { id: d.id };
    },
    org,
  );
}
