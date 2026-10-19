import type { Pool } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  requirePermission,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";

export const identitySchema = z.object({
  action: z.literal("identity"),
  name: z.string().trim().min(2).max(120),
  contactEmail: z.union([z.email().max(254), z.literal("")]),
});
export const logoSchema = z.object({
  action: z.literal("logo"),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string().max(720000), // base64 of at most 512 KB
});
export const removeLogoSchema = z.object({ action: z.literal("removeLogo") });
export const commandSchema = z.discriminatedUnion("action", [
  identitySchema,
  logoSchema,
  removeLogoSchema,
]);
export type Command = z.infer<typeof commandSchema>;

/** Checks the file signature, not only the declared type. */
export function validLogo(type: string, b: Buffer) {
  if (!b.length || b.length > 524288) return false;
  if (type === "image/png")
    return b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (type === "image/jpeg")
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/webp")
    return (
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP"
    );
  return false;
}

/** Name, contact and logo of the active organisation; teams summary for clubs. */
export async function clubView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    const user = await account(c, p);
    const org = (
      await c.query(
        "SELECT o.id,o.name,o.kind,COALESCE(o.contact_email,'') AS contact_email,extract(epoch FROM l.updated_at)::bigint::text AS logo_version FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id WHERE o.id=$1",
        [a.organization_id],
      )
    ).rows[0];
    const teams =
      a.kind === "club"
        ? (
            await c.query(
              `SELECT t.id,t.name,t.category,t.level,s.name AS season,
                (SELECT count(*)::int FROM team_membership m WHERE m.team_id=t.id AND m.role='player' AND NOT m.cancelled AND m.closed_at IS NULL AND m.starts_on<=CURRENT_DATE AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)) AS players,
                (SELECT string_agg(DISTINCT cp.full_name, ', ') FROM team_membership m JOIN club_person cp ON cp.id=m.profile_id WHERE m.team_id=t.id AND m.role IN ('coach','assistant') AND NOT m.cancelled AND m.closed_at IS NULL AND (m.ends_on IS NULL OR m.ends_on>=CURRENT_DATE)) AS coaches
               FROM team t JOIN season s ON s.id=t.season_id WHERE t.organization_id=$1 AND NOT t.archived AND NOT s.archived ORDER BY s.starts_on DESC,t.name`,
              [a.organization_id],
            )
          ).rows
        : [];
    return {
      organization: org,
      canEdit:
        mfaSatisfied(!!user.twoFactorEnabled) &&
        permissions(a.role, a.grants).includes("mandates.manage"),
      teams,
    };
  } finally {
    c.release();
  }
}

export async function clubExecute(
  db: Pool,
  p: Principal,
  input: Command,
  expected: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
      a.organization_id,
    ]);
    if (a.organization_id !== expected)
      throw new AccessError("CONTEXT_CHANGED", 409);
    const user = await account(c, p);
    requirePermission(
      a.role,
      a.grants,
      "mandates.manage",
      mfaSatisfied(!!user.twoFactorEnabled),
    );
    if (input.action === "identity") {
      await c.query(
        "UPDATE organization SET name=$2,contact_email=$3 WHERE id=$1",
        [a.organization_id, input.name, input.contactEmail || null],
      );
    } else if (input.action === "logo") {
      const bytes = Buffer.from(input.data, "base64");
      if (!validLogo(input.mediaType, bytes))
        throw new AccessError("INVALID_FILE", 400);
      await c.query(
        "INSERT INTO organization_logo(organization_id,media_type,content,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET media_type=EXCLUDED.media_type,content=EXCLUDED.content,updated_by=EXCLUDED.updated_by,updated_at=now()",
        [a.organization_id, input.mediaType, bytes, p.userId],
      );
    } else {
      await c.query("DELETE FROM organization_logo WHERE organization_id=$1", [
        a.organization_id,
      ]);
    }
    await audit(
      c,
      a.organization_id,
      p.userId,
      "organization." + input.action,
      a.organization_id,
    );
    await c.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Logos are public identity (shown on public registration forms too). */
export async function clubLogo(db: Pool, organizationId: string) {
  z.uuid().parse(organizationId);
  return (
    await db.query(
      "SELECT media_type,content FROM organization_logo WHERE organization_id=$1",
      [organizationId],
    )
  ).rows[0] as { media_type: string; content: Buffer } | undefined;
}
