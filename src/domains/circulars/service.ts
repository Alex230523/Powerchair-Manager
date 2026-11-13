import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { mfaSatisfied } from "../../lib/security-policy";
import { isLocale, type Locale } from "../../lib/locale";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { fedCan } from "../access/policy";
import { publish } from "../notifications/queue";
import { circularAudiences } from "./schema";
import { brusselsDay } from "../../lib/today";

/**
 * 33: the federation's official circulars. Written by who holds the
 * « communication » competence, sent (now or at a date) to the presidents,
 * coaches, referees or every member of the affiliated clubs (all or chosen
 * ones); each recipient gets a notification and an email in his language,
 * reads it on the « Circulaires » page and, when asked, acknowledges it.
 * The federation follows the read rate, the unread by club, reminds them at
 * once and exports the list.
 */
const id = z.uuid();
export const circularCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: id.optional(),
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(1).max(20000),
    audiences: z.array(z.enum(circularAudiences)).min(1).max(4),
    clubs: z.array(id).max(500).default([]),
    ackRequired: z.boolean().default(false),
    sendAt: z.iso.datetime({ offset: true }).nullable().default(null),
  }),
  z.object({ action: z.literal("addFile"), id, filename: z.string().trim().min(1).max(200), mediaType: z.enum(["application/pdf", "image/png", "image/jpeg"]), data: z.string().max(7000000) }),
  z.object({ action: z.literal("removeFile"), id, fileId: id }),
  /** Now, or at its date (a scheduled circular leaves with the daily round). */
  z.object({ action: z.literal("send"), id }),
  z.object({ action: z.literal("delete"), id }),
  /** 8: one reminder to whoever has not read (or acknowledged) yet. */
  z.object({ action: z.literal("remind"), id }),
  /** 7: the recipient. */
  z.object({ action: z.literal("read"), id }),
  z.object({ action: z.literal("ack"), id }),
]);
export type CircularCommand = z.infer<typeof circularCommand>;

type Ctx = { c: PoolClient; org: string; kind: string; userId: string; fed: string | null; write: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const a = await active(c, p);
    if (expected && expected !== a.organization_id) throw new AccessError("CONTEXT_CHANGED", 409);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [a.organization_id]);
    const mfa = mfaSatisfied(!!(await account(c, p)).twoFactorEnabled);
    const federation = a.kind === "federation";
    const fed = federation ? a.organization_id : (((await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0]?.federation_id as string | null) ?? null);
    const out = await fn({ c, org: a.organization_id, kind: a.kind, userId: p.userId, fed, write: federation && mfa && fedCan(a.role, a.grants, "federation.communication") });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

type Row = { id: string; title: string; body: string; audiences: string[]; clubs: string[]; ack_required: boolean; send_at: string; status: string; sent_at: string | null; created_at: string };

/** The page: one's own circulars (received), and for the federation's communication, all of them with their follow-up. */
export async function circularsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    const mine = (
      await x.c.query(
        `SELECT c.id,c.title,c.ack_required,c.sent_at,f.name AS federation,r.read_at,r.acknowledged_at
           FROM circular_recipient r JOIN circular c ON c.id=r.circular_id JOIN organization f ON f.id=c.federation_id
          WHERE r.user_id=$1 AND c.federation_id=$2 ORDER BY c.sent_at DESC LIMIT 200`,
        [x.userId, x.fed],
      )
    ).rows as { id: string; title: string; ack_required: boolean; sent_at: string; federation: string; read_at: string | null; acknowledged_at: string | null }[];
    if (!x.write) return { organization_id: x.org, can: { write: false }, mine, circulars: [], clubs: [] };
    const circulars = (
      await x.c.query(
        `SELECT c.id,c.title,c.body,c.audiences,c.clubs,c.ack_required,c.send_at,c.status,c.sent_at,c.created_at,
                (SELECT count(*)::int FROM circular_recipient r WHERE r.circular_id=c.id) AS recipients,
                (SELECT count(*)::int FROM circular_recipient r WHERE r.circular_id=c.id AND r.read_at IS NOT NULL) AS read,
                (SELECT count(*)::int FROM circular_recipient r WHERE r.circular_id=c.id AND r.acknowledged_at IS NOT NULL) AS acknowledged,
                (SELECT COALESCE(json_agg(json_build_object('id',f.id,'filename',f.filename) ORDER BY f.created_at),'[]') FROM circular_file f WHERE f.circular_id=c.id) AS files
           FROM circular c WHERE c.federation_id=$1 ORDER BY c.created_at DESC LIMIT 200`,
        [x.org],
      )
    ).rows as (Row & { recipients: number; read: number; acknowledged: number; files: { id: string; filename: string }[] })[];
    const clubs = (await x.c.query("SELECT id,name FROM organization WHERE federation_id=$1 AND kind='club' ORDER BY name", [x.org])).rows as { id: string; name: string }[];
    return { organization_id: x.org, can: { write: true }, mine, circulars, clubs };
  });
}

/** One circular: for a recipient (marked read) or the federation's communication (with the unread by club). */
export async function circularDetail(db: Pool, p: Principal, circularId: string) {
  return scope(db, p, true, async (x) => {
    const c = (await x.c.query("SELECT c.*,f.name AS federation FROM circular c JOIN organization f ON f.id=c.federation_id WHERE c.id=$1 AND c.federation_id=$2", [circularId, x.fed])).rows[0] as
      | (Row & { federation: string })
      | undefined;
    if (!c) throw new AccessError("NOT_FOUND", 404);
    const me = (await x.c.query("SELECT read_at,acknowledged_at FROM circular_recipient WHERE circular_id=$1 AND user_id=$2", [c.id, x.userId])).rows[0] as { read_at: string | null; acknowledged_at: string | null } | undefined;
    if (!me && !x.write) throw new AccessError("NOT_FOUND", 404);
    if (me && !me.read_at) await x.c.query("UPDATE circular_recipient SET read_at=now() WHERE circular_id=$1 AND user_id=$2", [c.id, x.userId]);
    const files = (await x.c.query("SELECT id,filename,media_type FROM circular_file WHERE circular_id=$1 ORDER BY created_at", [c.id])).rows as { id: string; filename: string; media_type: string }[];
    // 8: the follow-up, club by club (names only of who has not read).
    const followUp = x.write
      ? ((
          await x.c.query(
            `SELECT o.id,o.name,count(*)::int AS recipients,count(r.read_at)::int AS read,count(r.acknowledged_at)::int AS acknowledged,
                    COALESCE(json_agg(u.name ORDER BY u.name) FILTER (WHERE r.read_at IS NULL OR (c.ack_required AND r.acknowledged_at IS NULL)),'[]') AS waiting
               FROM circular_recipient r JOIN circular c ON c.id=r.circular_id JOIN organization o ON o.id=r.organization_id JOIN "user" u ON u.id=r.user_id
              WHERE r.circular_id=$1 GROUP BY o.id,o.name ORDER BY o.name`,
            [c.id],
          )
        ).rows as { id: string; name: string; recipients: number; read: number; acknowledged: number; waiting: string[] }[])
      : [];
    return {
      organization_id: x.org,
      can: { write: x.write },
      circular: { id: c.id, title: c.title, body: c.body, federation: c.federation, ack_required: c.ack_required, sent_at: c.sent_at, status: c.status, audiences: c.audiences },
      me: me ? { read: true, acknowledged: !!me.acknowledged_at } : null,
      files,
      followUp,
    };
  });
}

/** The people a circular reaches, each with the organization he gets it through. */
async function recipients(c: PoolClient, row: Row & { federation_id: string }) {
  const clubs = row.clubs.length
    ? row.clubs
    : ((await c.query("SELECT id FROM organization WHERE federation_id=$1 AND kind='club'", [row.federation_id])).rows.map((r) => r.id as string) as string[]);
  const roles = row.audiences.includes("members") ? ["club_president", "coach", "player", "guardian"] : [...(row.audiences.includes("presidents") ? ["club_president"] : []), ...(row.audiences.includes("coaches") ? ["coach"] : [])];
  const people = (
    await c.query(
      `SELECT DISTINCT ON (r.user_id) r.user_id,r.organization_id FROM role_assignment r JOIN organization o ON o.id=r.organization_id
        WHERE ((r.organization_id=ANY($1::uuid[]) AND o.federation_id=$4 AND r.role=ANY($2::text[])) OR ($3 AND r.organization_id=$4 AND r.role='referee'))
          AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now())
        ORDER BY r.user_id,r.organization_id`,
      [clubs, roles, row.audiences.includes("referees") || row.audiences.includes("members"), row.federation_id],
    )
  ).rows as { user_id: string; organization_id: string }[];
  return people;
}

/** 7: the circular leaves: one line per recipient, a notification and an email in his language. */
async function dispatch(c: PoolClient, circularId: string) {
  const row = (await c.query("SELECT * FROM circular WHERE id=$1 FOR UPDATE", [circularId])).rows[0] as (Row & { federation_id: string }) | undefined;
  if (!row || row.status === "sent") return 0;
  const people = await recipients(c, row);
  const fedName = (await c.query("SELECT name FROM organization WHERE id=$1", [row.federation_id])).rows[0]?.name as string;
  for (const r of people) {
    const inserted = await c.query("INSERT INTO circular_recipient(circular_id,user_id,organization_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [row.id, r.user_id, r.organization_id]);
    if (!inserted.rowCount) continue;
    await tell(c, row, r, fedName, "sent");
  }
  await c.query("UPDATE circular SET status='sent',sent_at=now() WHERE id=$1", [row.id]);
  return people.length;
}
const words = {
  fr: { sent: "Circulaire : {title}", remind: "Rappel : circulaire « {title} »", ack: "Merci de confirmer votre lecture.", read: "Une nouvelle circulaire de la fédération." },
  nl: { sent: "Omzendbrief: {title}", remind: "Herinnering: omzendbrief « {title} »", ack: "Gelieve uw lezing te bevestigen.", read: "Een nieuwe omzendbrief van de federatie." },
  en: { sent: "Circular: {title}", remind: "Reminder: circular « {title} »", ack: "Please confirm you have read it.", read: "A new circular from the federation." },
};
async function tell(c: PoolClient, row: Row, r: { user_id: string; organization_id: string }, fedName: string, why: "sent" | "remind") {
  const u = (await c.query('SELECT u.id,u.email,u.name,COALESCE(pe.locale,\'fr\') AS locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1 AND u.active', [r.user_id])).rows[0] as
    | { id: string; email: string; name: string; locale: string }
    | undefined;
  if (!u) return;
  const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
  const w = words[locale];
  await publish(c, {
    organizationId: r.organization_id,
    userId: u.id,
    email: u.email,
    kind: "automation",
    category: "administrative",
    resourceType: "automation",
    resourceId: `circular:${row.id}`,
    eventKey: `circular:${row.id}:${why}:${why === "remind" ? brusselsDay() : ""}:${u.id}`,
    locale,
    variables: { name: u.name, title: w[why].replace("{title}", row.title), message: row.ack_required ? w.ack : w.read, organization: fedName, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/circulars/${row.id}` },
  });
}

export async function circularExecute(db: Pool, p: Principal, raw: z.input<typeof circularCommand>, expected: string) {
  const cmd: CircularCommand = circularCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (x) => {
      if (cmd.action === "read" || cmd.action === "ack") {
        const r = await x.c.query(
          `UPDATE circular_recipient SET read_at=COALESCE(read_at,now())${cmd.action === "ack" ? ",acknowledged_at=COALESCE(acknowledged_at,now())" : ""}
            WHERE circular_id=$1 AND user_id=$2 AND EXISTS (SELECT 1 FROM circular c WHERE c.id=$1 AND c.federation_id=$3) RETURNING circular_id`,
          [cmd.id, x.userId, x.fed],
        );
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { id: cmd.id };
      }
      if (!x.write) throw new AccessError("FORBIDDEN");
      const own = async (circularId: string, draftOnly = false) => {
        const r = (await x.c.query("SELECT * FROM circular WHERE id=$1 AND federation_id=$2 FOR UPDATE", [circularId, x.org])).rows[0] as (Row & { federation_id: string }) | undefined;
        if (!r) throw new AccessError("NOT_FOUND", 404);
        if (draftOnly && r.status === "sent") throw new AccessError("ALREADY_SENT", 409);
        return r;
      };
      switch (cmd.action) {
        case "save": {
          // Clubs chosen: affiliated to this federation only.
          if (cmd.clubs.length) {
            const n = (await x.c.query("SELECT count(*)::int AS n FROM organization WHERE id=ANY($1::uuid[]) AND federation_id=$2 AND kind='club'", [cmd.clubs, x.org])).rows[0].n as number;
            if (n !== new Set(cmd.clubs).size) throw new AccessError("NOT_FOUND", 404);
          }
          const values = [cmd.title, cmd.body, cmd.audiences, [...new Set(cmd.clubs)], cmd.ackRequired, cmd.sendAt ?? new Date().toISOString()];
          if (cmd.id) {
            await own(cmd.id, true);
            await x.c.query("UPDATE circular SET title=$2,body=$3,audiences=$4,clubs=$5,ack_required=$6,send_at=$7,status='draft' WHERE id=$1", [cmd.id, ...values]);
            return { id: cmd.id };
          }
          const id = (await x.c.query("INSERT INTO circular(federation_id,title,body,audiences,clubs,ack_required,send_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [x.org, ...values, x.userId])).rows[0].id as string;
          return { id };
        }
        case "addFile": {
          await own(cmd.id, true);
          const bytes = Buffer.from(cmd.data, "base64");
          const ok =
            bytes.length > 0 &&
            bytes.length <= 5242880 &&
            (cmd.mediaType === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : cmd.mediaType === "image/png" ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" : bytes[0] === 0xff && bytes[1] === 0xd8);
          if (!ok) throw new AccessError("INVALID_FILE", 400);
          const id = (await x.c.query("INSERT INTO circular_file(circular_id,filename,media_type,content) VALUES($1,$2,$3,$4) RETURNING id", [cmd.id, cmd.filename, cmd.mediaType, bytes])).rows[0].id as string;
          return { id };
        }
        case "removeFile": {
          await own(cmd.id, true);
          if (!(await x.c.query("DELETE FROM circular_file WHERE id=$1 AND circular_id=$2", [cmd.fileId, cmd.id])).rowCount) throw new AccessError("NOT_FOUND", 404);
          return { id: cmd.id };
        }
        case "delete": {
          await own(cmd.id, true);
          await x.c.query("DELETE FROM circular WHERE id=$1", [cmd.id]);
          return { id: cmd.id };
        }
        case "send": {
          const r = await own(cmd.id, true);
          if (new Date(r.send_at) > new Date()) {
            await x.c.query("UPDATE circular SET status='scheduled' WHERE id=$1", [r.id]);
            await audit(x.c, x.org, x.userId, "circular.scheduled", r.id);
            return { id: r.id, sent: 0, scheduled: true };
          }
          const sent = await dispatch(x.c, r.id);
          await audit(x.c, x.org, x.userId, "circular.sent", r.id, { recipients: sent });
          return { id: r.id, sent };
        }
        case "remind": {
          const r = await own(cmd.id);
          if (r.status !== "sent") throw new AccessError("NOT_SENT", 409);
          const waiting = (
            await x.c.query(
              "SELECT user_id,organization_id FROM circular_recipient WHERE circular_id=$1 AND (read_at IS NULL OR ($2 AND acknowledged_at IS NULL)) AND (reminded_at IS NULL OR reminded_at<now()-interval '1 day')",
              [r.id, r.ack_required],
            )
          ).rows as { user_id: string; organization_id: string }[];
          const fedName = (await x.c.query("SELECT name FROM organization WHERE id=$1", [x.org])).rows[0]?.name as string;
          for (const w of waiting) {
            await tell(x.c, r, w, fedName, "remind");
            await x.c.query("UPDATE circular_recipient SET reminded_at=now() WHERE circular_id=$1 AND user_id=$2", [r.id, w.user_id]);
          }
          await audit(x.c, x.org, x.userId, "circular.reminded", r.id, { count: waiting.length });
          return { id: r.id, sent: waiting.length };
        }
      }
    },
    expected,
  );
}

/** An attachment, for a recipient of the circular or the federation's communication. */
export async function circularFile(db: Pool, p: Principal, fileId: string) {
  return scope(db, p, false, async (x) => {
    const f = (
      await x.c.query("SELECT f.filename,f.media_type,f.content,c.id AS circular_id FROM circular_file f JOIN circular c ON c.id=f.circular_id WHERE f.id=$1 AND c.federation_id=$2", [fileId, x.fed])
    ).rows[0] as { filename: string; media_type: string; content: Buffer; circular_id: string } | undefined;
    if (!f) throw new AccessError("NOT_FOUND", 404);
    if (!x.write && !(await x.c.query("SELECT 1 FROM circular_recipient WHERE circular_id=$1 AND user_id=$2", [f.circular_id, x.userId])).rowCount) throw new AccessError("NOT_FOUND", 404);
    return f;
  });
}

/** 8: the export of a circular's follow-up (CSV): club, person, read, acknowledged. */
export async function circularExport(db: Pool, p: Principal, circularId: string) {
  return scope(db, p, false, async (x) => {
    if (!x.write) throw new AccessError("FORBIDDEN");
    const rows = (
      await x.c.query(
        `SELECT o.name AS club,u.name AS person,r.read_at,r.acknowledged_at FROM circular_recipient r JOIN circular c ON c.id=r.circular_id AND c.federation_id=$2
           JOIN organization o ON o.id=r.organization_id JOIN "user" u ON u.id=r.user_id WHERE r.circular_id=$1 ORDER BY o.name,u.name`,
        [circularId, x.org],
      )
    ).rows as { club: string; person: string; read_at: Date | null; acknowledged_at: Date | null }[];
    const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "");
    return ["Club;Personne;Lu le;Accusé le", ...rows.map((r) => [r.club, r.person, day(r.read_at), day(r.acknowledged_at)].map(cell).join(";"))].join("\n");
  });
}

/** Once a day: the circulars whose date came leave. */
export async function circularsTick(db: Pool) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const due = (await c.query("SELECT id FROM circular WHERE status='scheduled' AND send_at<=now() ORDER BY send_at LIMIT 50")).rows.map((r) => r.id as string);
    for (const id of due) await dispatch(c, id);
    await c.query("COMMIT");
    return due.length;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
