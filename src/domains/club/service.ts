import { formOpenSql } from "../registrations/open";
import { ensureStorage } from "../storage/service";
import type { Pool } from "pg";
import { z } from "zod";
import { validIban } from "../../lib/iban";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  requirePermission,
  AccessError,
  type Principal,
  refuseSupport,
} from "../access/service";
import { permissions } from "../access/policy";
import { palettes, tints } from "./appearance";
import { proposeObligations } from "./obligations";
import { today } from "../calendar/access";
import { notice } from "../notifications/notice";
import { presidencyOf } from "../console/service";

export const identitySchema = z.object({
  action: z.literal("identity"),
  name: z.string().trim().min(2).max(120),
  contactEmail: z.union([z.email().max(254), z.literal("")]),
  /** For official papers (mutual insurance attestations). Omitted: unchanged. */
  address: z.string().trim().max(300).optional(),
  companyNumber: z
    .union([z.literal(""), z.string().trim().regex(/^[01]\d{3}\.\d{3}\.\d{3}$/)])
    .optional(),
  signatory: z.string().trim().max(160).optional(),
  /** The club's bank account, printed on sponsorship agreements (wave 15). Omitted: unchanged. */
  iban: z
    .union([z.literal(""), z.string().transform((v) => v.replace(/\s+/g, "").toUpperCase()).refine(validIban)])
    .optional(),
  /** Club affiliation (in Belgium the BPCF). Omitted: unchanged. */
  federationId: z.uuid().nullable().optional(),
  /** Wave 16 (A): the club's legal form; the club status proposes its obligations from it. Omitted: unchanged. */
  legalForm: z.enum(["asbl", "de_facto", "other"]).nullable().optional(),
});
export const logoSchema = z.object({
  action: z.literal("logo"),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string().max(720000), // base64 of at most 512 KB
});
export const removeLogoSchema = z.object({ action: z.literal("removeLogo") });
/** The club's palette and background tint (prompt 2.9). */
export const appearanceSchema = z.object({ action: z.literal("appearance"), palette: z.enum(palettes), tint: z.enum(tints) });
export const commandSchema = z.discriminatedUnion("action", [
  identitySchema,
  logoSchema,
  removeLogoSchema,
  appearanceSchema,
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
        "SELECT o.id,o.name,o.kind,o.federation_id,o.federation_request_id,o.federation_requested_at,(SELECT f.name FROM organization f WHERE f.id=o.federation_request_id) AS federation_request_name,o.legal_form,COALESCE(o.contact_email,'') AS contact_email,o.address,o.company_number,o.signatory,o.iban,o.theme_palette,o.theme_tint,extract(epoch FROM l.updated_at)::bigint::text AS logo_version FROM organization o LEFT JOIN organization_logo l ON l.organization_id=o.id WHERE o.id=$1",
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
    const federations =
      a.kind === "club"
        ? (
            await c.query(
              "SELECT id,name FROM organization WHERE kind='federation' ORDER BY name",
            )
          ).rows
        : [];
    return {
      organization: org,
      federations: federations as { id: string; name: string }[],
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
      // Security (07/11/2026): a support access never changes where the money goes.
      if (input.iban != null && (await c.query("SELECT 1 FROM organization WHERE id=$1 AND COALESCE(iban,'') IS DISTINCT FROM $2", [a.organization_id, input.iban])).rowCount) await refuseSupport(c, a.id);
      await c.query(
        "UPDATE organization SET name=$2,contact_email=$3,address=COALESCE($4,address),company_number=COALESCE($5,company_number),signatory=COALESCE($6,signatory),iban=COALESCE($7,iban) WHERE id=$1",
        [
          a.organization_id,
          input.name,
          input.contactEmail || null,
          input.address ?? null,
          input.companyNumber ?? null,
          input.signatory ?? null,
          input.iban ?? null,
        ],
      );
      if (input.legalForm !== undefined && a.kind === "club") {
        const before = (await c.query("SELECT legal_form FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.legal_form ?? null;
        if (before !== input.legalForm) {
          await c.query("UPDATE organization SET legal_form=$2 WHERE id=$1", [a.organization_id, input.legalForm]);
          // A new form: its obligations are proposed for this year (nothing removed, all editable).
          if (input.legalForm) {
            const locale = ((await c.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale ?? "fr") as "fr" | "nl" | "en";
            await proposeObligations(c, a.organization_id, p.userId, Number(today().slice(0, 4)), locale);
          }
        }
      }
      if (input.federationId !== undefined) {
        if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
        // Security (06/11/2026): the club never attaches itself to a federation. Choosing one sends a
        // request the federation accepts or refuses; choosing none leaves (and withdraws a request).
        const now = (await c.query("SELECT federation_id,federation_request_id FROM organization WHERE id=$1", [a.organization_id])).rows[0] as { federation_id: string | null; federation_request_id: string | null };
        if (input.federationId === null) {
          if (now.federation_id || now.federation_request_id) {
            await c.query("UPDATE organization SET federation_id=NULL,federation_request_id=NULL,federation_requested_at=NULL,federation_requested_by=NULL WHERE id=$1", [a.organization_id]);
            if (now.federation_id) {
              await audit(c, a.organization_id, p.userId, "club.federation_left", now.federation_id);
              await audit(c, now.federation_id, p.userId, "federation.club_left", a.organization_id);
            }
          }
        } else if (input.federationId !== now.federation_id && input.federationId !== now.federation_request_id) {
          const fed = (await c.query("SELECT id,name FROM organization WHERE id=$1 AND kind='federation'", [input.federationId])).rows[0] as { id: string; name: string } | undefined;
          if (!fed) throw new AccessError("NOT_FOUND", 404);
          await c.query("UPDATE organization SET federation_request_id=$2,federation_requested_at=now(),federation_requested_by=$3 WHERE id=$1", [a.organization_id, fed.id, p.userId]);
          await audit(c, a.organization_id, p.userId, "club.federation_requested", fed.id);
          await audit(c, fed.id, p.userId, "federation.club_requested", a.organization_id);
          const clubName = (await c.query("SELECT name FROM organization WHERE id=$1", [a.organization_id])).rows[0].name as string;
          await notice(c, fed.id, await presidencyOf(c, fed.id), {
            fr: { title: "Demande d'affiliation", message: `Le club ${clubName} demande à rejoindre votre fédération. Acceptez ou refusez dans Clubs.` },
            nl: { title: "Aansluitingsaanvraag", message: `De club ${clubName} vraagt uw federatie te vervoegen. Aanvaard of weiger in Clubs.` },
            en: { title: "Affiliation request", message: `The club ${clubName} asks to join your federation. Accept or refuse in Clubs.` },
          }, "/federation/clubs", `affiliation_request:${a.organization_id}:${Date.now()}`, "administrative");
        }
      }
    } else if (input.action === "appearance") {
      if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
      await c.query("UPDATE organization SET theme_palette=$2,theme_tint=$3 WHERE id=$1", [a.organization_id, input.palette, input.tint]);
    } else if (input.action === "logo") {
      const bytes = Buffer.from(input.data, "base64");
      if (!validLogo(input.mediaType, bytes))
        throw new AccessError("INVALID_FILE", 400);
      const previous = Number((await c.query("SELECT size_bytes FROM organization_logo WHERE organization_id=$1", [a.organization_id])).rows[0]?.size_bytes ?? 0);
      await ensureStorage(c, a.organization_id, bytes.length, previous);
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
/** Logo shown on a published registration form, found through the form itself. */
export async function clubLogoForForm(db: Pool, formId: string) {
  z.uuid().parse(formId);
  return (
    await db.query(
      `SELECT l.media_type,l.content FROM registration_form f JOIN organization_logo l ON l.organization_id=f.organization_id WHERE f.id=$1 AND ${formOpenSql("f")}`,
      [formId],
    )
  ).rows[0] as { media_type: string; content: Buffer } | undefined;
}

