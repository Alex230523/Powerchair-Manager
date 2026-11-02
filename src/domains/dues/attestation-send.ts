import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { pdfImage } from "../../lib/pdf-image";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { publish } from "../notifications/queue";
import { brusselsToday } from "../people/service";
import { attestationsView, paidInFull } from "./attestation";
import { attestationPdf } from "./attestation-pdf";

/**
 * 9, part 2: the attestation as a signed PDF, its number, its sending (once
 * automatically when the season is paid in full, then « Renvoyer »), the
 * signature seen by the administrators only, and the mutuals' own forms.
 */
async function tx<T>(db: Pool, fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
type Rights = { org: string; admin: boolean; manage: boolean; read: boolean };
async function rights(c: PoolClient, p: Principal, expected?: string): Promise<Rights> {
  const a = await active(c, p);
  if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
  if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
  const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
  const r = permissions(a.role, a.grants) as readonly string[];
  return {
    org: a.organization_id,
    // The signature and the signatory: the presidency, those who manage the mandates.
    admin: mfa && (a.role === "club_president" || r.includes("mandates.manage")),
    manage: mfa && r.includes("dues.manage"),
    read: mfa && (r.includes("dues.manage") || r.includes("dues.read")),
  };
}

/** The attestation's number, given once per person and season (in the order of issue). */
async function numbered(c: PoolClient, org: string, profile: string, season: string) {
  await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [org]);
  const found = (await c.query("SELECT id,number,issued_at FROM dues_attestation WHERE organization_id=$1 AND profile_id=$2 AND season_id=$3", [org, profile, season])).rows[0];
  const row =
    found ??
    (
      await c.query(
        "INSERT INTO dues_attestation(organization_id,profile_id,season_id,number) VALUES($1,$2,$3,(SELECT COALESCE(max(number),0)+1 FROM dues_attestation WHERE organization_id=$1)) RETURNING id,number,issued_at",
        [org, profile, season],
      )
    ).rows[0];
  const year = new Date(row.issued_at).getUTCFullYear();
  return { id: row.id as string, number: `${year}-${String(row.number).padStart(4, "0")}` };
}

/** Builds the PDF of one person and season; refuses if not paid in full. */
async function build(c: PoolClient, org: string, profile: string, season: string, locale: Locale) {
  const club = (
    await c.query(
      "SELECT o.name,COALESCE(o.address,'') AS address,COALESCE(o.company_number,'') AS company_number,o.signatory,o.signatory_role,f.name AS federation FROM organization o LEFT JOIN organization f ON f.id=o.federation_id WHERE o.id=$1",
      [org],
    )
  ).rows[0];
  const s = (await c.query("SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE id=$1 AND organization_id=$2", [season, org])).rows[0];
  const person = (await c.query("SELECT full_name,birth_date::text AS birth_date FROM club_person WHERE id=$1 AND organization_id=$2", [profile, org])).rows[0];
  if (!s || !person) throw new AccessError("NOT_FOUND", 404);
  const dues = (await c.query("SELECT net_cents,status FROM dues_receivable WHERE organization_id=$1 AND profile_id=$2 AND season_id=$3", [org, profile, season])).rows as { net_cents: number; status: string }[];
  const paid = (
    await c.query(
      `SELECT COALESCE(sum(t.amount_cents),0)::int AS cents,max(t.occurred_on)::text AS last FROM finance_transaction t JOIN dues_receivable r ON r.id=t.receivable_id
        WHERE r.organization_id=$1 AND r.profile_id=$2 AND r.season_id=$3 AND t.cancelled_at IS NULL AND t.direction='in'`,
      [org, profile, season],
    )
  ).rows[0] as { cents: number; last: string | null };
  if (!paidInFull(dues, paid.cents)) throw new AccessError("NOT_PAID", 409);
  const shares = (
    await c.query("SELECT cp.full_name AS name,b.percent FROM billing_split b JOIN club_person cp ON cp.id=b.guardian_profile_id WHERE b.organization_id=$1 AND b.subject_profile_id=$2 ORDER BY cp.full_name", [org, profile])
  ).rows.map((r) => ({ name: r.name as string, percent: r.percent as number, cents: Math.round((paid.cents * r.percent) / 100) }));
  const n = await numbered(c, org, profile, season);
  const logo = (await c.query("SELECT media_type,content FROM organization_logo WHERE organization_id=$1", [org])).rows[0];
  const signature = (await c.query("SELECT content FROM organization_signature WHERE organization_id=$1", [org])).rows[0];
  const bytes = attestationPdf(
    locale,
    {
      number: n.number,
      club: { name: club.name, address: club.address, companyNumber: club.company_number, federation: club.federation, signatory: club.signatory, signatoryRole: club.signatory_role },
      person: { name: person.full_name, birthDate: person.birth_date },
      season: { name: s.name, from: s.starts_on, to: s.ends_on },
      paidCents: paid.cents,
      paidOn: paid.last,
      issuedOn: brusselsToday(),
      shares,
    },
    { logo: logo ? pdfImage(new Uint8Array(logo.content), logo.media_type) : null, signature: signature ? pdfImage(new Uint8Array(signature.content), "image/png") : null },
  );
  const slug = (person.full_name as string).normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return { attestationId: n.id, number: n.number, bytes, filename: `attestation-${n.number}-${slug || "membre"}.pdf` };
}

/** The PDF for whoever may see this attestation (the club's money, or the person and his family). */
export async function attestationFile(db: Pool, p: Principal, profile: string, season: string, locale: Locale) {
  const view = await attestationsView(db, p, season);
  const person = view.people.find((x) => x.profile_id === profile);
  if (!person || view.season?.id !== season) throw new AccessError("NOT_FOUND", 404);
  if (!person.eligible) throw new AccessError("NOT_PAID", 409);
  return tx(db, async (c) => build(c, (await active(c, p)).organization_id, profile, season, locale));
}

/** The adult player himself; for a minor (or a player without account), his representatives with an account. */
async function recipients(c: PoolClient, org: string, profile: string) {
  const self = (
    await c.query(
      `SELECT u.id,u.email,u.name,pe.locale FROM club_person cp JOIN person pe ON pe.id=cp.person_id JOIN "user" u ON u.id=pe.user_id AND u.active
        WHERE cp.id=$1 AND cp.organization_id=$2 AND (cp.birth_date IS NULL OR cp.birth_date<=CURRENT_DATE-interval '18 years')`,
      [profile, org],
    )
  ).rows;
  if (self.length) return self as { id: string; email: string; name: string; locale: string }[];
  return (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,pe.locale FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id AND u.active
        WHERE g.organization_id=$1 AND g.subject_profile_id=$2 AND g.can_view AND g.revoked_at IS NULL AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE)`,
      [org, profile],
    )
  ).rows as { id: string; email: string; name: string; locale: string }[];
}
const mail = {
  title: { fr: "Attestation pour la mutuelle", nl: "Attest voor het ziekenfonds", en: "Mutual insurance certificate" },
  message: {
    fr: "La cotisation de {name} pour la saison {season} est entièrement payée : l'attestation pour la mutuelle est jointe.",
    nl: "De bijdrage van {name} voor het seizoen {season} is volledig betaald: het attest voor het ziekenfonds zit in bijlage.",
    en: "{name}'s fee for the season {season} is paid in full: the mutual insurance certificate is attached.",
  },
};
async function sendTo(c: PoolClient, org: string, profile: string, season: string, kind: "auto" | "manual", by: string | null) {
  const people = await recipients(c, org, profile);
  const meta = (await c.query("SELECT o.name AS org,cp.full_name,s.name AS season FROM organization o,club_person cp,season s WHERE o.id=$1 AND cp.id=$2 AND s.id=$3", [org, profile, season])).rows[0];
  let sent = 0;
  for (const u of people) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    const pdf = await build(c, org, profile, season, locale);
    // Automatic: once per attestation and recipient (the unique index keeps it so).
    const row = (
      await c.query(
        `INSERT INTO dues_attestation_send(attestation_id,kind,recipient_user_id,sent_by) VALUES($1,$2,$3,$4) ${kind === "auto" ? "ON CONFLICT (attestation_id,recipient_user_id) WHERE kind='auto' DO NOTHING" : ""} RETURNING id`,
        [pdf.attestationId, kind, u.id, by],
      )
    ).rows[0];
    if (!row) continue;
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "administrative",
      resourceType: "automation",
      resourceId: `attestation:${pdf.attestationId}`,
      eventKey: `attestation:${row.id}`,
      locale,
      variables: {
        name: u.name,
        title: mail.title[locale],
        message: mail.message[locale].replace("{name}", meta.full_name).replace("{season}", meta.season),
        organization: meta.org,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/dues/attestations?season=${season}&profile=${profile}`,
      },
      attachments: [{ filename: pdf.filename, contentType: "application/pdf", base64: Buffer.from(pdf.bytes).toString("base64") }],
    });
    sent++;
  }
  return sent;
}

/** « Envoyer » or « Renvoyer » from the club's list. */
export async function attestationSend(db: Pool, p: Principal, profile: string, season: string, expected: string) {
  return tx(db, async (c) => {
    const r = await rights(c, p, expected);
    if (!r.manage) throw new AccessError("FORBIDDEN");
    const sent = await sendTo(c, r.org, profile, season, "manual", p.userId);
    await audit(c, r.org, p.userId, "attestation.sent", profile, { season, sent });
    return { sent };
  });
}

/** The automatic sending: the clubs that switched it on, the current season, once paid in full. */
export async function attestationTick(db: Pool) {
  const today = brusselsToday();
  const work = (
    await db.query(
      `SELECT DISTINCT d.organization_id,d.profile_id,d.season_id FROM dues_receivable d JOIN organization o ON o.id=d.organization_id AND o.attestation_auto JOIN season s ON s.id=d.season_id
        WHERE s.starts_on<=$1::date AND s.ends_on>=$1::date AND d.status<>'cancelled'
          AND NOT EXISTS (SELECT 1 FROM dues_attestation a JOIN dues_attestation_send x ON x.attestation_id=a.id AND x.kind='auto' WHERE a.organization_id=d.organization_id AND a.profile_id=d.profile_id AND a.season_id=d.season_id)`,
      [today],
    )
  ).rows as { organization_id: string; profile_id: string; season_id: string }[];
  let sent = 0;
  for (const w of work)
    sent += await tx(db, async (c) => {
      const dues = (await c.query("SELECT net_cents,status FROM dues_receivable WHERE organization_id=$1 AND profile_id=$2 AND season_id=$3", [w.organization_id, w.profile_id, w.season_id])).rows;
      const paid = (
        await c.query(
          "SELECT COALESCE(sum(t.amount_cents),0)::int AS n FROM finance_transaction t JOIN dues_receivable r ON r.id=t.receivable_id WHERE r.organization_id=$1 AND r.profile_id=$2 AND r.season_id=$3 AND t.cancelled_at IS NULL AND t.direction='in'",
          [w.organization_id, w.profile_id, w.season_id],
        )
      ).rows[0].n as number;
      return paidInFull(dues, paid) ? sendTo(c, w.organization_id, w.profile_id, w.season_id, "auto", null) : 0;
    });
  return sent;
}

/* ---------- Settings: signatory, signature, automatic sending ---------- */
export const settingsCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("signatory"), signatory: z.string().trim().max(160), signatoryRole: z.string().trim().max(80) }),
  /** A transparent PNG (uploaded or drawn), as a data URL; null removes it. */
  z.object({ action: z.literal("signature"), png: z.string().max(720000).nullable() }),
  z.object({ action: z.literal("auto"), on: z.boolean() }),
]);
export async function attestationSettings(db: Pool, p: Principal) {
  return tx(db, async (c) => {
    const r = await rights(c, p);
    if (!r.admin && !r.manage) throw new AccessError("FORBIDDEN");
    const o = (await c.query("SELECT signatory,signatory_role,attestation_auto FROM organization WHERE id=$1", [r.org])).rows[0];
    const sig = r.admin ? (await c.query("SELECT content FROM organization_signature WHERE organization_id=$1", [r.org])).rows[0] : null;
    return {
      organization_id: r.org,
      can: { admin: r.admin, money: r.manage },
      signatory: r.admin ? (o.signatory as string) : "",
      signatoryRole: r.admin ? (o.signatory_role as string) : "",
      // Seen by the administrators only.
      signature: sig ? `data:image/png;base64,${Buffer.from(sig.content).toString("base64")}` : null,
      auto: o.attestation_auto as boolean,
    };
  });
}
export async function attestationSettingsExecute(db: Pool, p: Principal, raw: unknown, expected: string) {
  const cmd = settingsCommand.parse(raw);
  return tx(db, async (c) => {
    const r = await rights(c, p, expected);
    if (cmd.action === "auto") {
      if (!r.manage && !r.admin) throw new AccessError("FORBIDDEN");
      await c.query("UPDATE organization SET attestation_auto=$2 WHERE id=$1", [r.org, cmd.on]);
      await audit(c, r.org, p.userId, "attestation.auto", r.org, { on: cmd.on });
      return { ok: true };
    }
    if (!r.admin) throw new AccessError("FORBIDDEN");
    if (cmd.action === "signatory") {
      await c.query("UPDATE organization SET signatory=$2,signatory_role=$3 WHERE id=$1", [r.org, cmd.signatory, cmd.signatoryRole]);
      return { ok: true };
    }
    if (!cmd.png) {
      await c.query("DELETE FROM organization_signature WHERE organization_id=$1", [r.org]);
      await audit(c, r.org, p.userId, "attestation.signature", r.org, { removed: true });
      return { ok: true };
    }
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(cmd.png);
    if (!m) throw new AccessError("INVALID_FILE", 400);
    const bytes = Buffer.from(m[1], "base64");
    if (bytes.length > 524288 || !pdfImage(new Uint8Array(bytes), "image/png")) throw new AccessError("INVALID_FILE", 400);
    await c.query(
      "INSERT INTO organization_signature(organization_id,content,updated_by) VALUES($1,$2,$3) ON CONFLICT (organization_id) DO UPDATE SET content=EXCLUDED.content,updated_by=EXCLUDED.updated_by,updated_at=now()",
      [r.org, bytes, p.userId],
    );
    await audit(c, r.org, p.userId, "attestation.signature", r.org);
    return { ok: true };
  });
}

/* ---------- A mutual's own form ---------- */
const types = ["application/pdf", "image/png", "image/jpeg"] as const;
const file = z.object({ name: z.string().trim().min(1).max(200), type: z.enum(types), base64: z.string().min(4).max(7000000) });
export const mutualCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upload"), profileId: z.uuid(), seasonId: z.uuid(), file }),
  z.object({ action: z.literal("fill"), id: z.uuid(), file }),
]);
const bytesOf = (f: z.infer<typeof file>) => {
  const b = Buffer.from(f.base64, "base64");
  if (!b.length || b.length > 5242880) throw new AccessError("INVALID_FILE", 400);
  const magic = f.type === "application/pdf" ? b.subarray(0, 4).toString("latin1") === "%PDF" : f.type === "image/png" ? b[0] === 0x89 && b[1] === 0x50 : b[0] === 0xff && b[1] === 0xd8;
  if (!magic) throw new AccessError("INVALID_FILE", 400);
  return b;
};
export async function mutualExecute(db: Pool, p: Principal, raw: unknown, expected: string) {
  const cmd = mutualCommand.parse(raw);
  if (cmd.action === "upload") {
    // The member (or his family) drops the blank form of a person he may see.
    const view = await attestationsView(db, p, cmd.seasonId);
    if (!view.people.some((x) => x.profile_id === cmd.profileId) || view.season?.id !== cmd.seasonId) throw new AccessError("NOT_FOUND", 404);
    return tx(db, async (c) => {
      const a = await active(c, p);
      if (a.organization_id !== expected) throw new AccessError("CONTEXT_CHANGED", 409);
      const id = (
        await c.query("INSERT INTO mutual_form(organization_id,profile_id,season_id,blank_name,blank_type,blank,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [
          a.organization_id,
          cmd.profileId,
          cmd.seasonId,
          cmd.file.name,
          cmd.file.type,
          bytesOf(cmd.file),
          p.userId,
        ])
      ).rows[0].id as string;
      return { id };
    });
  }
  return tx(db, async (c) => {
    const r = await rights(c, p, expected);
    if (!r.manage) throw new AccessError("FORBIDDEN");
    const f = (
      await c.query("UPDATE mutual_form SET filled_name=$3,filled_type=$4,filled=$5,done_by=$6,done_at=now() WHERE id=$1 AND organization_id=$2 RETURNING profile_id,season_id", [
        cmd.id,
        r.org,
        cmd.file.name,
        cmd.file.type,
        bytesOf(cmd.file),
        p.userId,
      ])
    ).rows[0];
    if (!f) throw new AccessError("NOT_FOUND", 404);
    // The member is told; the filled form waits for him on the attestations page.
    const meta = (await c.query("SELECT o.name AS org,cp.full_name FROM organization o,club_person cp WHERE o.id=$1 AND cp.id=$2", [r.org, f.profile_id])).rows[0];
    for (const u of await recipients(c, r.org, f.profile_id)) {
      const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
      await publish(c, {
        organizationId: r.org,
        userId: u.id,
        email: u.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: `mutual:${cmd.id}`,
        eventKey: `mutual:${cmd.id}:${u.id}`,
        locale,
        variables: {
          name: u.name,
          title: { fr: "Formulaire de mutuelle complété", nl: "Formulier van het ziekenfonds ingevuld", en: "Mutual insurance form completed" }[locale],
          message: { fr: "Le club a complété et signé le formulaire de mutuelle de {name}.", nl: "De club heeft het ziekenfondsformulier van {name} ingevuld en ondertekend.", en: "The club completed and signed {name}'s mutual insurance form." }[locale].replace("{name}", meta.full_name),
          organization: meta.org,
          url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/dues/attestations?season=${f.season_id}`,
        },
      });
    }
    await audit(c, r.org, p.userId, "mutual.filled", cmd.id);
    return { id: cmd.id };
  });
}
/** A form's file (blank or filled), for the club's money or the person's own. */
export async function mutualFile(db: Pool, p: Principal, id: string, which: "blank" | "filled") {
  const row = await tx(db, async (c) => {
    const a = await active(c, p);
    return (await c.query("SELECT profile_id,season_id,blank_name,blank_type,blank,filled_name,filled_type,filled FROM mutual_form WHERE id=$1 AND organization_id=$2", [id, a.organization_id])).rows[0];
  });
  if (!row) throw new AccessError("NOT_FOUND", 404);
  const view = await attestationsView(db, p, row.season_id);
  if (!view.people.some((x) => x.profile_id === row.profile_id)) throw new AccessError("NOT_FOUND", 404);
  if (which === "filled" && !row.filled) throw new AccessError("NOT_FOUND", 404);
  return which === "blank" ? { name: row.blank_name as string, type: row.blank_type as string, bytes: new Uint8Array(row.blank) } : { name: row.filled_name as string, type: row.filled_type as string, bytes: new Uint8Array(row.filled) };
}
