import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { seal, unseal } from "../notifications/crypto";
import { publish } from "../notifications/queue";
import { typedXlsx } from "../../lib/xlsx";
import { openEventsCopy } from "../../components/open-events-copy";

/**
 * B9: open events. A calendar event (each date of a series) opened to the
 * public: registration by a link, without an account, with the event's own
 * questions, accessibility needs and two separate consents; places and a
 * registration window; a waiting list whose next person gets a freed place
 * for a set time; an optional fee paid by transfer with a structured
 * communication (reconciled by B1); check-in by QR code; reminders seven
 * days and one day before and an opinion survey after, through the mail
 * queue and its daily ceiling (B2); export, a message to all, a
 * cancellation that tells everyone; the organisation in the to-do.
 */
type Locale = "fr" | "nl" | "en";
type Db = Pool | PoolClient;
type Actor = Awaited<ReturnType<typeof active>> & { twoFactorEnabled: boolean };
type Scope = { c: PoolClient; p: Principal; a: Actor; org: string; orgName: string; manage: boolean };

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
export const questionSchema = z.object({ id: z.string().regex(/^q\d{1,2}$/), label: text(200).min(2), kind: z.enum(["text", "yesno"]), required: z.boolean() });
const settings = {
  description: text(4000).default(""),
  capacity: z.number().int().min(1).max(10000).nullable(),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  feeCents: z.number().int().min(0).max(100000000).default(0),
  questions: z.array(questionSchema).max(20).default([]),
  confirmHours: z.number().int().min(1).max(168).default(48),
  reminders: z.boolean().default(true),
  survey: z.boolean().default(true),
  surveyQuestions: z.array(questionSchema).max(10).default([]),
};
export const openEventCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), eventId: id, series: z.boolean().default(false), ...settings }),
  z.object({ action: z.literal("update"), id, expectedVersion: z.number().int().positive(), ...settings }),
  z.object({ action: z.literal("cancelEvent"), id, reason: text(500).default("") }),
  z.object({ action: z.literal("remove"), registrationId: id }),
  z.object({ action: z.literal("checkin"), registrationId: id.optional(), code: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/).optional() }),
  z.object({ action: z.literal("paid"), registrationId: id }),
  z.object({ action: z.literal("message"), id, subject: text(150).min(2), body: text(4000).min(2) }),
]);
export type OpenEventCommand = z.infer<typeof openEventCommand>;
const needsSchema = z.object({ wheelchair: z.boolean().default(false), helper: z.boolean().default(false), transport: z.boolean().default(false), diet: text(200).default("") });
export const publicCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    fullName: text(120).min(2),
    email: z.email().max(200),
    phone: text(40).default(""),
    needs: needsSchema.default({ wheelchair: false, helper: false, transport: false, diet: "" }),
    answers: z.record(z.string().regex(/^q\d{1,2}$/), z.union([text(1000), z.boolean()])).default({}),
    consentData: z.literal(true),
    consentImage: z.boolean().default(false),
    locale: z.enum(["fr", "nl", "en"]).default("fr"),
    /** A field people never see: filled, the request comes from a robot. */
    website: z.string().max(0).default(""),
  }),
  z.object({ action: z.literal("confirm"), registration: z.string().regex(/^[A-Za-z0-9_-]{30,64}$/) }),
  z.object({ action: z.literal("withdraw"), registration: z.string().regex(/^[A-Za-z0-9_-]{30,64}$/) }),
  z.object({ action: z.literal("feedback"), registration: z.string().regex(/^[A-Za-z0-9_-]{30,64}$/), rating: z.number().int().min(1).max(5), answers: z.record(z.string().regex(/^q\d{1,2}$/), z.union([text(1000), z.boolean()])).default({}) }),
]);
export type PublicCommand = z.infer<typeof publicCommand>;

/* ---------- Pure rules ---------- */
export function windowState(opensAt: Date | string, closesAt: Date | string, now = new Date()): "before" | "open" | "closed" {
  if (now < new Date(opensAt)) return "before";
  return now <= new Date(closesAt) ? "open" : "closed";
}
/** How many waiting people may be offered a place now. */
export function freePlaces(capacity: number | null, taken: number, waiting: number) {
  return capacity === null ? waiting : Math.max(0, Math.min(waiting, capacity - taken));
}
/** Every required question answered (a yes/no question needs a boolean). */
export function answersComplete(questions: z.infer<typeof questionSchema>[], answers: Record<string, string | boolean>) {
  return questions.every((q) => !q.required || (q.kind === "yesno" ? typeof answers[q.id] === "boolean" : typeof answers[q.id] === "string" && (answers[q.id] as string).trim() !== ""));
}
/** Only the answers to the event's own questions, of the right kind. */
export function keepAnswers(questions: z.infer<typeof questionSchema>[], answers: Record<string, string | boolean>) {
  return Object.fromEntries(questions.filter((q) => q.id in answers && (q.kind === "yesno" ? typeof answers[q.id] === "boolean" : typeof answers[q.id] === "string")).map((q) => [q.id, answers[q.id]]));
}
const hash = (token: string) => createHash("sha256").update("open-registration:" + token).digest("hex");
const newToken = () => randomBytes(30).toString("base64url");
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: Date | string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
const base = () => process.env.BETTER_AUTH_URL ?? "";

/* ---------- Mails to the registered people ---------- */
type Reg = { id: string; organization_id: string; email: string; full_name: string; locale: Locale; token_sealed: string; checkin_code: string };
type Ev = { id: string; token: string; title: string; starts_at: Date | string; org_name: string };
const linkOf = (r: Reg, e: Ev) => `${base()}/${r.locale}/evenement/${e.token}?r=${unseal<string>(r.token_sealed, "open-reg:" + r.id)}`;
async function mail(c: Db, r: Reg, e: Ev, key: string, title: string, message: string, url = linkOf(r, e)) {
  await publish(c, {
    organizationId: r.organization_id,
    userId: null,
    email: r.email,
    kind: "automation",
    category: "sport",
    resourceType: "open_event",
    resourceId: r.id,
    eventKey: key,
    locale: r.locale,
    variables: { name: r.full_name, organization: e.org_name, url, title, message },
  });
}
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
async function eventOf(c: Db, openEventId: string) {
  return (
    await c.query(
      "SELECT oe.*,e.title,e.starts_at,e.ends_at,o.name AS org_name FROM open_event oe JOIN calendar_event e ON e.id=oe.event_id AND e.organization_id=oe.organization_id JOIN organization o ON o.id=oe.organization_id WHERE oe.id=$1",
      [openEventId],
    )
  ).rows[0];
}

/**
 * A place freed (a withdrawal, an offer expired, more places): the next
 * people of the waiting list are offered it, each for the confirmation time.
 */
export async function promote(c: Db, openEventId: string) {
  const e = await eventOf(c, openEventId);
  if (!e || e.status !== "open" || new Date(e.starts_at) <= new Date()) return 0;
  const counts = (await c.query("SELECT count(*) FILTER (WHERE status IN ('confirmed','offered'))::int AS taken,count(*) FILTER (WHERE status='waiting')::int AS waiting FROM open_registration WHERE open_event_id=$1", [openEventId])).rows[0];
  const n = freePlaces(e.capacity, counts.taken, counts.waiting);
  if (!n) return 0;
  const next = (
    await c.query(
      "UPDATE open_registration SET status='offered',offered_until=now()+make_interval(hours=>$2) WHERE id IN (SELECT id FROM open_registration WHERE open_event_id=$1 AND status='waiting' ORDER BY created_at LIMIT $3 FOR UPDATE) RETURNING *",
      [openEventId, e.confirm_hours, n],
    )
  ).rows as (Reg & { offered_until: Date })[];
  for (const r of next) {
    const t = openEventsCopy[r.locale].mail;
    await mail(c, r, e, `open:offer:${r.id}:${new Date(r.offered_until).getTime()}`, fill(t.offerTitle, { event: e.title }), fill(t.offer, { event: e.title, date: when(r.locale, e.starts_at), until: when(r.locale, r.offered_until) }));
  }
  return next.length;
}

/* ---------- The club's side ---------- */
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const initial = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [initial.organization_id]);
    const a = { ...(await active(c, p)), twoFactorEnabled: !!(await account(c, p)).twoFactorEnabled } as Actor;
    if (a.organization_id !== initial.organization_id || (expected && expected !== a.organization_id)) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    const manage = mfaSatisfied(a.twoFactorEnabled) && (a.role === "club_president" || permissions(a.role, a.grants).includes("calendar.manage"));
    if (!manage) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, p, a, org: a.organization_id, orgName: a.organization_name, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    const code = (e as { code?: string }).code;
    if (code === "23505") throw new AccessError("ALREADY_OPEN", 409);
    if (code === "23514") throw new AccessError("INVALID_INPUT", 400);
    throw e;
  } finally {
    c.release();
  }
}
async function openOf(s: Scope, openId: string, lock = false) {
  const e = (await s.c.query(`SELECT * FROM open_event WHERE id=$1 AND organization_id=$2${lock ? " FOR UPDATE" : ""}`, [openId, s.org])).rows[0];
  if (!e) throw new AccessError("NOT_FOUND", 404);
  return e;
}
async function registrationOf(s: Scope, registrationId: string) {
  const r = (await s.c.query("SELECT * FROM open_registration WHERE id=$1 AND organization_id=$2 FOR UPDATE", [registrationId, s.org])).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
}

export async function openEventsView(db: Pool, p: Principal, openId?: string) {
  return scope(db, p, false, async (s) => {
    const events = (
      await s.c.query(
        `SELECT oe.id,oe.token,oe.status,oe.capacity,oe.opens_at,oe.closes_at,oe.fee_cents,oe.version,e.title,e.starts_at,e.ends_at,
                count(r.id) FILTER (WHERE r.status='confirmed')::int AS confirmed,count(r.id) FILTER (WHERE r.status='waiting')::int AS waiting,
                count(r.id) FILTER (WHERE r.status='offered')::int AS offered,count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS present
           FROM open_event oe JOIN calendar_event e ON e.id=oe.event_id AND e.organization_id=oe.organization_id LEFT JOIN open_registration r ON r.open_event_id=oe.id
          WHERE oe.organization_id=$1 GROUP BY oe.id,e.title,e.starts_at,e.ends_at ORDER BY e.starts_at DESC LIMIT 200`,
        [s.org],
      )
    ).rows.map((e) => ({
      id: e.id as string,
      token: e.token as string,
      status: e.status as "open" | "cancelled",
      capacity: e.capacity as number | null,
      fee_cents: e.fee_cents as number,
      version: e.version as number,
      title: e.title as string,
      starts_at: e.starts_at as string,
      confirmed: e.confirmed as number,
      waiting: e.waiting as number,
      offered: e.offered as number,
      present: e.present as number,
      window: windowState(e.opens_at, e.closes_at),
    }));
    const candidates = (
      await s.c.query(
        "SELECT e.id,e.title,e.starts_at,e.series_id,(SELECT count(*)::int FROM calendar_event x WHERE x.series_id=e.series_id AND x.organization_id=e.organization_id AND x.status='scheduled' AND x.starts_at>now()) AS dates FROM calendar_event e WHERE e.organization_id=$1 AND e.status='scheduled' AND e.starts_at>now() AND NOT EXISTS (SELECT 1 FROM open_event oe WHERE oe.event_id=e.id) ORDER BY e.starts_at LIMIT 100",
        [s.org],
      )
    ).rows as { id: string; title: string; starts_at: string; series_id: string; dates: number }[];
    let detail = null;
    if (openId) {
      const oe = await openOf(s, openId);
      const registrations = (
        await s.c.query(
          "SELECT id,full_name,email,phone,needs,answers,consent_image,status,offered_until,payment_reference,paid_cents,paid_at,checked_in_at,created_at FROM open_registration WHERE open_event_id=$1 AND organization_id=$2 ORDER BY status='cancelled',status='waiting',created_at",
          [oe.id, s.org],
        )
      ).rows;
      const feedback = (await s.c.query("SELECT rating,answers FROM open_feedback WHERE open_event_id=$1 AND organization_id=$2", [oe.id, s.org])).rows as { rating: number; answers: Record<string, string | boolean> }[];
      detail = {
        id: oe.id as string,
        token: oe.token as string,
        status: oe.status as "open" | "cancelled",
        version: oe.version as number,
        fee_cents: oe.fee_cents as number,
        capacity: oe.capacity as number | null,
        questions: oe.questions as z.infer<typeof questionSchema>[],
        registrations: registrations as {
          id: string;
          full_name: string;
          email: string;
          phone: string;
          needs: Record<string, unknown>;
          answers: Record<string, string | boolean>;
          consent_image: boolean;
          status: "confirmed" | "waiting" | "offered" | "cancelled";
          offered_until: string | null;
          payment_reference: string | null;
          paid_cents: number;
          paid_at: string | null;
          checked_in_at: string | null;
          created_at: string;
        }[],
        opinions: {
          count: feedback.length as number,
          // Anonymous: the answers without who gave them, shuffled by their own order.
          answers: (oe.survey_questions as z.infer<typeof questionSchema>[]).map((q) => ({
            question: q.label,
            values: feedback
              .map((f) => f.answers[q.id])
              .filter((v) => v !== undefined && v !== "")
              .sort((a, b) => String(a).localeCompare(String(b))),
          })) as { question: string; values: (string | boolean)[] }[],
          average: (feedback.length ? Math.round((feedback.reduce((n, f) => n + f.rating, 0) / feedback.length) * 10) / 10 : null) as number | null,
        },
      };
    }
    return { organization_id: s.org, events, candidates, detail };
  });
}

export async function openEventsExecute(db: Pool, p: Principal, cmd: OpenEventCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const org = s.org;
      switch (cmd.action) {
        case "open": {
          const first = (await s.c.query("SELECT id,series_id,title,starts_at FROM calendar_event WHERE id=$1 AND organization_id=$2 AND status='scheduled'", [cmd.eventId, org])).rows[0];
          if (!first) throw new AccessError("NOT_FOUND", 404);
          const dates = cmd.series
            ? (await s.c.query("SELECT id,title,starts_at FROM calendar_event WHERE series_id=$1 AND organization_id=$2 AND status='scheduled' AND starts_at>=$3 ORDER BY starts_at", [first.series_id, org, first.starts_at])).rows
            : [first];
          const ids: string[] = [];
          // Each date keeps the same window relative to its own start.
          const shiftOpen = Date.parse(cmd.opensAt) - new Date(first.starts_at).getTime(),
            shiftClose = Date.parse(cmd.closesAt) - new Date(first.starts_at).getTime();
          for (const d of dates) {
            const start = new Date(d.starts_at).getTime();
            const opens = new Date(start + shiftOpen),
              closes = new Date(start + shiftClose);
            if (closes <= opens || closes.getTime() > start) throw new AccessError("INVALID_WINDOW", 400);
            const oe = (
              await s.c.query(
                "INSERT INTO open_event(organization_id,event_id,token,description,capacity,opens_at,closes_at,fee_cents,questions,confirm_hours,reminders,survey,survey_questions,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
                [org, d.id, newToken(), cmd.description, cmd.capacity, opens, closes, cmd.feeCents, JSON.stringify(cmd.questions), cmd.confirmHours, cmd.reminders, cmd.survey, JSON.stringify(cmd.surveyQuestions), s.p.userId],
              )
            ).rows[0].id as string;
            ids.push(oe);
            // The organisation goes to the to-do, category « Événements ».
            const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.p.userId])).rows[0]?.locale ?? "fr") as Locale;
            await s.c.query(
              "INSERT INTO task(organization_id,kind,category,title,detail,due_on,event_id,origin,created_by,source_key,source_kind) VALUES($1,'other','events',$2,$3,($4::timestamptz AT TIME ZONE 'Europe/Brussels')::date-1,$5,'manual',$6,$7,'open_event') ON CONFLICT DO NOTHING",
              [org, fill(openEventsCopy[locale].mail.task, { event: d.title }).slice(0, 200), "", d.starts_at, d.id, s.p.userId, `open_event:${oe}`],
            );
          }
          await audit(s.c, org, s.p.userId, "open_event.opened", cmd.eventId, { dates: ids.length });
          return { id: ids[0], ids };
        }
        case "update": {
          const oe = await openOf(s, cmd.id, true);
          if (oe.version !== cmd.expectedVersion) throw new AccessError("VERSION_CONFLICT", 409);
          const ev = (await s.c.query("SELECT starts_at FROM calendar_event WHERE id=$1 AND organization_id=$2", [oe.event_id, org])).rows[0];
          if (Date.parse(cmd.closesAt) <= Date.parse(cmd.opensAt) || Date.parse(cmd.closesAt) > new Date(ev.starts_at).getTime()) throw new AccessError("INVALID_WINDOW", 400);
          await s.c.query(
            "UPDATE open_event SET description=$3,capacity=$4,opens_at=$5,closes_at=$6,fee_cents=$7,questions=$8,confirm_hours=$9,reminders=$10,survey=$11,survey_questions=$12,version=version+1 WHERE id=$1 AND organization_id=$2",
            [oe.id, org, cmd.description, cmd.capacity, cmd.opensAt, cmd.closesAt, cmd.feeCents, JSON.stringify(cmd.questions), cmd.confirmHours, cmd.reminders, cmd.survey, JSON.stringify(cmd.surveyQuestions)],
          );
          // More places: the waiting list moves.
          await promote(s.c, oe.id);
          return { id: oe.id };
        }
        case "cancelEvent": {
          const oe = await openOf(s, cmd.id, true);
          if (oe.status === "cancelled") return { id: oe.id };
          await s.c.query("UPDATE open_event SET status='cancelled',cancel_reason=$3,version=version+1 WHERE id=$1 AND organization_id=$2", [oe.id, org, cmd.reason]);
          const e = await eventOf(s.c, oe.id);
          // Everybody still registered or waiting is told.
          for (const r of (await s.c.query("SELECT * FROM open_registration WHERE open_event_id=$1 AND status<>'cancelled'", [oe.id])).rows as Reg[]) {
            const t = openEventsCopy[r.locale].mail;
            await mail(s.c, r, e, `open:cancelled:${r.id}`, fill(t.cancelledTitle, { event: e.title }), fill(t.cancelled, { event: e.title, date: when(r.locale, e.starts_at), reason: cmd.reason }));
          }
          await audit(s.c, org, s.p.userId, "open_event.cancelled", oe.id);
          return { id: oe.id };
        }
        case "remove": {
          const r = await registrationOf(s, cmd.registrationId);
          if (r.status !== "cancelled") {
            await s.c.query("UPDATE open_registration SET status='cancelled',cancelled_at=now() WHERE id=$1", [r.id]);
            await promote(s.c, r.open_event_id);
          }
          await audit(s.c, org, s.p.userId, "open_event.removed", r.open_event_id, { registration: r.id });
          return { id: r.id };
        }
        case "checkin": {
          const r = cmd.code
            ? (await s.c.query("SELECT r.*,e.title FROM open_registration r JOIN open_event oe ON oe.id=r.open_event_id JOIN calendar_event e ON e.id=oe.event_id WHERE r.checkin_code=$1 AND r.organization_id=$2 FOR UPDATE OF r", [cmd.code, org])).rows[0]
            : cmd.registrationId
              ? await registrationOf(s, cmd.registrationId)
              : null;
          if (!r || r.status === "cancelled") throw new AccessError("NOT_FOUND", 404);
          const already = !!r.checked_in_at;
          if (!already) await s.c.query("UPDATE open_registration SET checked_in_at=now(),checked_in_by=$2 WHERE id=$1", [r.id, s.p.userId]);
          return { id: r.id as string, name: r.full_name as string, already };
        }
        case "paid": {
          const r = await registrationOf(s, cmd.registrationId);
          const fee = (await s.c.query("SELECT fee_cents FROM open_event WHERE id=$1", [r.open_event_id])).rows[0].fee_cents as number;
          await s.c.query("UPDATE open_registration SET paid_cents=GREATEST(paid_cents,$2),paid_at=COALESCE(paid_at,now()) WHERE id=$1", [r.id, fee]);
          await audit(s.c, org, s.p.userId, "open_event.paid", r.open_event_id, { registration: r.id });
          return { id: r.id };
        }
        case "message": {
          const oe = await openOf(s, cmd.id);
          const e = await eventOf(s.c, oe.id);
          const stamp = Date.now();
          let n = 0;
          for (const r of (await s.c.query("SELECT * FROM open_registration WHERE open_event_id=$1 AND status<>'cancelled'", [oe.id])).rows as Reg[]) {
            await mail(s.c, r, e, `open:message:${r.id}:${stamp}`, cmd.subject, cmd.body);
            n++;
          }
          await audit(s.c, org, s.p.userId, "open_event.message", oe.id, { recipients: n });
          return { id: oe.id, sent: n };
        }
      }
    },
    expected,
  );
}

/** The registered people as a spreadsheet (the consents and needs included, the opinions not). */
export async function openEventExport(db: Pool, p: Principal, openId: string) {
  return scope(db, p, false, async (s) => {
    const oe = await openOf(s, openId);
    const locale = ((await s.c.query("SELECT locale FROM person WHERE user_id=$1", [s.p.userId])).rows[0]?.locale ?? "fr") as Locale;
    const t = openEventsCopy[locale];
    const rows = (await s.c.query("SELECT * FROM open_registration WHERE open_event_id=$1 AND organization_id=$2 ORDER BY status,created_at", [oe.id, s.org])).rows;
    const questions = oe.questions as z.infer<typeof questionSchema>[];
    const yes = (v: unknown) => (v === true ? t.public.yes : v === false ? t.public.no : String(v ?? ""));
    await audit(s.c, s.org, s.p.userId, "open_event.exported", oe.id);
    return typedXlsx(
      [
        { header: t.public.name, type: "text" },
        { header: t.public.email, type: "text" },
        { header: t.public.phone, type: "text" },
        { header: t.statuses.confirmed, type: "text" },
        { header: t.needLabels.wheelchair, type: "text" },
        { header: t.needLabels.helper, type: "text" },
        { header: t.needLabels.transport, type: "text" },
        { header: t.diet, type: "text" },
        { header: t.image, type: "text" },
        { header: t.paid, type: "money" },
        { header: t.checkedIn, type: "text" },
        ...questions.map((q) => ({ header: q.label, type: "text" as const })),
      ],
      rows.map((r) => [
        r.full_name,
        r.email,
        r.phone,
        t.statuses[r.status as keyof typeof t.statuses],
        yes(r.needs.wheelchair),
        yes(r.needs.helper),
        yes(r.needs.transport),
        r.needs.diet ?? "",
        yes(r.consent_image),
        r.paid_cents / 100,
        r.checked_in_at ? t.public.yes : "",
        ...questions.map((q) => yes(r.answers[q.id])),
      ]),
    );
  });
}

/* ---------- The public side (no account) ---------- */
async function publicEventOf(c: Db, token: string) {
  const e = (
    await c.query(
      `SELECT oe.*,e.title,e.starts_at,e.ends_at,o.name AS org_name,COALESCE(pl.name,sv.name,e.free_location,'') AS place,
              (SELECT count(*)::int FROM open_registration r WHERE r.open_event_id=oe.id AND r.status IN ('confirmed','offered')) AS taken
         FROM open_event oe JOIN calendar_event e ON e.id=oe.event_id AND e.organization_id=oe.organization_id JOIN organization o ON o.id=oe.organization_id
         LEFT JOIN calendar_place pl ON pl.id=e.place_id AND pl.organization_id=e.organization_id LEFT JOIN shared_venue sv ON sv.id=e.shared_venue_id
        WHERE oe.token=$1`,
      [token],
    )
  ).rows[0];
  if (!e) throw new AccessError("NOT_FOUND", 404);
  return e;
}
async function registrationByToken(c: Db, e: { id: string }, raw: string) {
  const r = (await c.query("SELECT * FROM open_registration WHERE token_hash=$1 AND open_event_id=$2", [hash(raw), e.id])).rows[0];
  if (!r) throw new AccessError("NOT_FOUND", 404);
  return r;
}
/** The club's account for dues (B1), to pay a fee by transfer. */
async function payee(c: Db, org: string) {
  return (await c.query("SELECT iban,bic,holder FROM bank_account WHERE organization_id=$1 AND for_dues AND NOT archived LIMIT 1", [org])).rows[0] as { iban: string; bic: string; holder: string } | undefined;
}

export async function publicEvent(db: Pool, token: string, registration?: string) {
  const e = await publicEventOf(db, token);
  const now = new Date();
  const r = registration ? await registrationByToken(db, e, registration).catch(() => null) : null;
  const ended = new Date(e.ends_at) < now;
  return {
    club: e.org_name as string,
    title: e.title as string,
    starts_at: e.starts_at as string,
    ends_at: e.ends_at as string,
    place: e.place as string,
    description: e.description as string,
    status: e.status as "open" | "cancelled",
    started: new Date(e.starts_at) <= now,
    window: windowState(e.opens_at, e.closes_at, now),
    opens_at: e.opens_at as string,
    left: e.capacity === null ? null : Math.max(0, e.capacity - e.taken),
    fee_cents: e.fee_cents as number,
    questions: e.questions as z.infer<typeof questionSchema>[],
    survey_questions: e.survey_questions as z.infer<typeof questionSchema>[],
    registration: r
      ? {
          full_name: r.full_name as string,
          status: r.status as "confirmed" | "waiting" | "offered" | "cancelled",
          offered_until: r.offered_until as string | null,
          checkin: r.status === "confirmed" ? `${base()}/fr/events/checkin/${r.checkin_code}` : null,
          payment: e.fee_cents > 0 && r.status === "confirmed" && r.payment_reference ? { cents: e.fee_cents as number, reference: r.payment_reference as string, paid: r.paid_cents >= e.fee_cents, account: (await payee(db, e.organization_id)) ?? null } : null,
          survey: e.survey && ended && r.status === "confirmed" && !(await db.query("SELECT 1 FROM open_feedback WHERE registration_id=$1", [r.id])).rowCount,
          answered: !!(await db.query("SELECT 1 FROM open_feedback WHERE registration_id=$1", [r.id])).rowCount,
        }
      : null,
  };
}

export async function publicExecute(db: Pool, token: string, cmd: PublicCommand) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const e = await publicEventOf(c, token);
    // One registration at a time per event: the places are counted under this lock.
    await c.query("SELECT id FROM open_event WHERE id=$1 FOR UPDATE", [e.id]);
    const out = await (async () => {
      if (cmd.action === "register") {
        if (e.status !== "open") throw new AccessError("EVENT_CANCELLED", 409);
        if (windowState(e.opens_at, e.closes_at) !== "open") throw new AccessError("WINDOW_CLOSED", 409);
        if (!answersComplete(e.questions, cmd.answers)) throw new AccessError("ANSWER_REQUIRED", 400);
        const taken = (await c.query("SELECT count(*)::int AS n FROM open_registration WHERE open_event_id=$1 AND status IN ('confirmed','offered')", [e.id])).rows[0].n as number;
        const waitingBefore = (await c.query("SELECT count(*)::int AS n FROM open_registration WHERE open_event_id=$1 AND status='waiting'", [e.id])).rows[0].n as number;
        // Nobody passes the waiting list: a free place goes to a newcomer only when nobody waits.
        const status = (e.capacity === null || taken < e.capacity) && waitingBefore === 0 ? "confirmed" : "waiting";
        const raw = newToken(),
          code = randomBytes(24).toString("base64url");
        const regId = (
          await c.query(
            `INSERT INTO open_registration(organization_id,open_event_id,token_hash,token_sealed,checkin_code,full_name,email,phone,needs,answers,consent_data,consent_image,status,locale,payment_reference)
             VALUES($1,$2,$3,'-',$4,$5,$6,$7,$8,$9,true,$10,$11,$12,CASE WHEN $13::int>0 THEN payment_reference() END) RETURNING id`,
            [e.organization_id, e.id, hash(raw), code, cmd.fullName, cmd.email.toLowerCase(), cmd.phone, JSON.stringify(cmd.needs), JSON.stringify(keepAnswers(e.questions, cmd.answers)), cmd.consentImage, status, cmd.locale, e.fee_cents],
          ).catch((err: { code?: string }) => {
            if (err.code === "23505") throw new AccessError("ALREADY_REGISTERED", 409);
            throw err;
          })
        ).rows[0].id as string;
        await c.query("UPDATE open_registration SET token_sealed=$2 WHERE id=$1", [regId, seal(raw, "open-reg:" + regId)]);
        const r = (await c.query("SELECT * FROM open_registration WHERE id=$1", [regId])).rows[0] as Reg;
        const t = openEventsCopy[cmd.locale].mail;
        await mail(
          c,
          r,
          e,
          `open:${status}:${regId}`,
          fill(status === "confirmed" ? t.confirmedTitle : t.waitingTitle, { event: e.title }),
          fill(status === "confirmed" ? t.confirmed : t.waiting, { event: e.title, date: when(cmd.locale, e.starts_at) }),
        );
        return { status, registration: raw };
      }
      const r = await registrationByToken(c, e, cmd.registration);
      if (cmd.action === "confirm") {
        if (r.status === "confirmed") return { status: "confirmed" };
        if (r.status !== "offered" || new Date(r.offered_until) < new Date()) throw new AccessError("OFFER_EXPIRED", 409);
        await c.query("UPDATE open_registration SET status='confirmed',offered_until=NULL WHERE id=$1", [r.id]);
        const t = openEventsCopy[r.locale as Locale].mail;
        await mail(c, r, e, `open:confirmed:${r.id}`, fill(t.confirmedTitle, { event: e.title }), fill(t.confirmed, { event: e.title, date: when(r.locale, e.starts_at) }));
        return { status: "confirmed" };
      }
      if (cmd.action === "withdraw") {
        if (new Date(e.starts_at) <= new Date()) throw new AccessError("WINDOW_CLOSED", 409);
        if (r.status !== "cancelled") {
          await c.query("UPDATE open_registration SET status='cancelled',cancelled_at=now(),offered_until=NULL WHERE id=$1", [r.id]);
          await promote(c, e.id);
        }
        return { status: "cancelled" };
      }
      // The opinion: after the event, once, from a confirmed registration.
      if (!e.survey || new Date(e.ends_at) > new Date() || r.status !== "confirmed") throw new AccessError("SURVEY_CLOSED", 409);
      await c.query("INSERT INTO open_feedback(organization_id,open_event_id,registration_id,rating,answers) VALUES($1,$2,$3,$4,$5) ON CONFLICT (registration_id) DO NOTHING", [
        e.organization_id,
        e.id,
        r.id,
        cmd.rating,
        JSON.stringify(keepAnswers(e.survey_questions, cmd.answers)),
      ]);
      return { status: "answered" };
    })();
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}

/* ---------- Background ---------- */
/**
 * Every few minutes: expired offers go to the next person; seven days and
 * one day before, the reminders; after the event, the opinion survey. All
 * through the mail queue (its daily ceiling applies).
 */
export async function openEventTick(db: Pool) {
  let n = 0;
  // 1. Offers not confirmed in time.
  const expired = (await db.query("UPDATE open_registration SET status='cancelled',cancelled_at=now(),offered_until=NULL WHERE status='offered' AND offered_until<now() RETURNING open_event_id")).rows;
  for (const id of new Set(expired.map((r) => r.open_event_id as string))) n += await promote(db, id);
  // 2. Reminders.
  for (const [col, from, to, key] of [
    ["reminded_7", "6 days", "7 days", "reminder7"],
    ["reminded_1", "0 days", "1 day", "reminder1"],
  ] as const) {
    const due = (
      await db.query(
        `SELECT r.*,oe.token,e.title,e.starts_at,o.name AS org_name FROM open_registration r JOIN open_event oe ON oe.id=r.open_event_id AND oe.organization_id=r.organization_id JOIN calendar_event e ON e.id=oe.event_id JOIN organization o ON o.id=oe.organization_id
          WHERE r.status='confirmed' AND NOT r.${col} AND oe.status='open' AND oe.reminders AND e.status='scheduled' AND e.starts_at BETWEEN now()+interval '${from}' AND now()+interval '${to}'`,
      )
    ).rows;
    for (const r of due) {
      const t = openEventsCopy[r.locale as Locale].mail;
      await mail(db, r, { id: r.open_event_id, token: r.token, title: r.title, starts_at: r.starts_at, org_name: r.org_name }, `open:${key}:${r.id}`, fill(t.reminderTitle, { event: r.title }), fill(t[key], { event: r.title, date: when(r.locale, r.starts_at) }));
      await db.query(`UPDATE open_registration SET ${col}=true WHERE id=$1`, [r.id]);
      n++;
    }
  }
  // 3. The opinion survey, within three days after the end.
  const done = (
    await db.query(
      `SELECT r.*,oe.token,e.title,e.starts_at,o.name AS org_name FROM open_registration r JOIN open_event oe ON oe.id=r.open_event_id AND oe.organization_id=r.organization_id JOIN calendar_event e ON e.id=oe.event_id JOIN organization o ON o.id=oe.organization_id
        WHERE r.status='confirmed' AND NOT r.survey_sent AND oe.status='open' AND oe.survey AND e.ends_at BETWEEN now()-interval '3 days' AND now()`,
    )
  ).rows;
  for (const r of done) {
    const t = openEventsCopy[r.locale as Locale].mail;
    await mail(db, r, { id: r.open_event_id, token: r.token, title: r.title, starts_at: r.starts_at, org_name: r.org_name }, `open:survey:${r.id}`, fill(t.surveyTitle, { event: r.title }), fill(t.survey, { event: r.title }));
    await db.query("UPDATE open_registration SET survey_sent=true WHERE id=$1", [r.id]);
    n++;
  }
  return n;
}
