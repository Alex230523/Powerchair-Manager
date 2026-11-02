import type { Pool } from "pg";
import { AccessError, active, type Principal } from "../access/service";
import { publish } from "../notifications/queue";
import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { isLocale, type Locale } from "../../lib/locale";
import { archiveCopy } from "./archive-copy";

/**
 * 24: the internal messaging is retired. Its tables stay 14 days after the
 * club is told, so the presidency can keep its exchanges as a PDF; a later
 * migration drops them, with this module.
 */
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/** The club's exchanges as a PDF, for its president only. */
export async function messagingArchive(db: Pool, p: Principal, locale: Locale) {
  const c = await db.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const a = await active(c, p);
    if (a.kind !== "club" || a.role !== "club_president") throw new AccessError("FORBIDDEN");
    const t = archiveCopy[locale];
    const club = (await c.query("SELECT name FROM organization WHERE id=$1", [a.organization_id])).rows[0].name as string;
    const rows = (
      await c.query(
        `SELECT th.id,th.subject,m.created_at,m.body,m.hidden_at,u.name AS sender
           FROM message_thread th LEFT JOIN internal_message m ON m.thread_id=th.id AND m.organization_id=th.organization_id LEFT JOIN "user" u ON u.id=m.sender_id
          WHERE th.organization_id=$1 ORDER BY th.created_at,th.id,m.created_at,m.id`,
        [a.organization_id],
      )
    ).rows as { id: string; subject: string; created_at: Date | null; body: string | null; hidden_at: Date | null; sender: string | null }[];
    await c.query("COMMIT");
    const when = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "nl" ? "nl-BE" : "fr-BE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" });
    const lines: PdfLine[] = [{ text: fill(t.pdfTitle, { club }), size: 16, bold: true }];
    let thread = "";
    for (const r of rows) {
      if (r.id !== thread) {
        thread = r.id;
        lines.push({ text: fill(t.thread, { subject: r.subject }), bold: true, size: 12, gap: 14 });
      }
      if (r.created_at) lines.push({ text: `${when.format(r.created_at)} · ${r.sender ?? ""}`, size: 9, gap: 6 }, { text: r.hidden_at ? t.hidden : (r.body ?? ""), indent: 12 });
    }
    if (!rows.length) lines.push({ text: t.none, gap: 12 });
    return { bytes: pdfDocument(lines, fill(t.pdfTitle, { club })), filename: `messagerie-${club.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf` };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Once per club that has exchanges: the presidents are told, with the date
 * after which they go and the link to the PDF. Idempotent.
 */
export async function messagingRetirementTick(db: Pool) {
  const base = process.env.BETTER_AUTH_URL ?? "";
  const clubs = (
    await db.query(
      `INSERT INTO messaging_retirement(organization_id,delete_after)
       SELECT DISTINCT th.organization_id,CURRENT_DATE+14 FROM message_thread th
        WHERE NOT EXISTS (SELECT 1 FROM messaging_retirement r WHERE r.organization_id=th.organization_id)
       ON CONFLICT DO NOTHING RETURNING organization_id,delete_after::text AS delete_after`,
    )
  ).rows as { organization_id: string; delete_after: string }[];
  let sent = 0;
  for (const club of clubs) {
    const presidents = (
      await db.query(
        `SELECT u.id,u.name,u.email,COALESCE(pe.locale,'fr') AS locale,o.name AS club FROM role_assignment r JOIN "user" u ON u.id=r.user_id JOIN organization o ON o.id=r.organization_id
           JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id LEFT JOIN person pe ON pe.user_id=u.id
          WHERE r.organization_id=$1 AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active`,
        [club.organization_id],
      )
    ).rows as { id: string; name: string; email: string; locale: string; club: string }[];
    for (const p of presidents) {
      const locale: Locale = isLocale(p.locale) ? p.locale : "fr";
      const t = archiveCopy[locale];
      const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "nl" ? "nl-BE" : "fr-BE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(club.delete_after + "T12:00:00Z"));
      await publish(db, {
        organizationId: club.organization_id,
        userId: p.id,
        email: p.email,
        kind: "automation",
        category: "administrative",
        resourceType: "automation",
        resourceId: `messaging-retirement:${club.organization_id}`,
        eventKey: `messaging-retirement:${club.organization_id}:${p.id}`,
        locale,
        variables: { name: p.name, title: t.title, message: fill(t.message, { date }), organization: p.club, url: `${base}/api/messaging-archive?locale=${locale}` },
      });
      sent++;
    }
  }
  return sent;
}
