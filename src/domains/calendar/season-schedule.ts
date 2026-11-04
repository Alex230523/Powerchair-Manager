import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mfaSatisfied } from "../../lib/security-policy";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { isLocale, type Locale } from "../../lib/locale";
import { audience, type Actor, type Event } from "./access";
import { calendarExecute } from "./service";
import { inviteForEvent } from "../attendance/service";
import { sendNewsletterNow } from "../communication/service";
import { planDates, schoolYearOf, type PlannedDate } from "./holidays";
import { scheduleMail } from "./season-schedule-copy";

/**
 * H9: the typical season in one go.
 * - Reference school holidays (fwb, vl) given with the application, set by a
 *   federation for its clubs, corrected by a club; Belgian public holidays
 *   computed. The club chooses its reference (Réglages › Activités).
 * - Closures of a place (summer, works) and of the club.
 * - « Planifier la saison »: per team a weekly slot (day, time, place, type,
 *   person in charge, first and last day); every date shown, the skipped ones
 *   with their reason and a way to keep them; one series per slot, never
 *   created twice.
 * - Effects: the invitations leave by themselves 14 days before each session
 *   when the type asks an answer; the « Calendrier de la saison » email to
 *   the families with the subscription link.
 */
const day = z.iso.date();
const community = z.enum(["fwb", "vl"]);
const time = z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/);
export const slotSchema = z.object({
  teamId: z.uuid(),
  weekday: z.number().int().min(1).max(7),
  startTime: time,
  endTime: time,
  placeId: z.uuid().nullable(),
  eventTypeId: z.uuid().nullable(),
  responsibleId: z.string().min(1).max(120),
  title: z.string().trim().min(2).max(160),
  from: day,
  to: day,
  reactivated: z.array(day).max(60).default([]),
});
export type Slot = z.infer<typeof slotSchema>;
export const scheduleCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reference"), communities: z.array(community).min(1).max(2) }),
  z.object({ action: z.literal("holiday"), community, schoolYear: z.string().regex(/^\d{4}-\d{4}$/), name: z.string().trim().min(2).max(120), startsOn: day, endsOn: day, overrides: z.uuid().nullable() }),
  z.object({ action: z.literal("hideHoliday"), id: z.uuid() }),
  z.object({ action: z.literal("removeHoliday"), id: z.uuid() }),
  z.object({ action: z.literal("closure"), placeId: z.uuid().nullable(), label: z.string().trim().min(2).max(120), startsOn: day, endsOn: day }),
  z.object({ action: z.literal("removeClosure"), id: z.uuid() }),
  z.object({ action: z.literal("preview"), seasonId: z.uuid(), slots: z.array(slotSchema).min(1).max(30) }),
  z.object({ action: z.literal("plan"), seasonId: z.uuid(), slots: z.array(slotSchema).min(1).max(30), email: z.boolean() }),
]);
export type ScheduleCommand = z.infer<typeof scheduleCommand>;

type Ctx = { c: PoolClient; org: string; kind: "club" | "federation"; federation: string | null; userId: string; orgName: string; locale: Locale };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query(write ? "BEGIN" : "BEGIN READ ONLY");
    const a = await active(c, p);
    const user = await account(c, p);
    const rights = permissions(a.role, a.grants);
    const allowed = a.role === "club_president" || a.role === "federation_president" || rights.includes("calendar.manage") || rights.includes("mandates.manage");
    if (!allowed || !mfaSatisfied(!!user.twoFactorEnabled)) throw new AccessError("FORBIDDEN");
    if (write) await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const org = (await c.query("SELECT federation_id FROM organization WHERE id=$1", [a.organization_id])).rows[0];
    const lang = (await c.query("SELECT locale FROM person WHERE user_id=$1", [p.userId])).rows[0]?.locale;
    const out = await fn({ c, org: a.organization_id, kind: a.kind, federation: org?.federation_id ?? null, userId: p.userId, orgName: a.organization_name, locale: isLocale(lang) ? lang : "fr" });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** The holidays that apply to a club: the reference, its federation's lines, its own, corrections applied. */
export async function clubHolidays(c: PoolClient | Pool, org: string, federation: string | null, communities: string[]) {
  const rows = (
    await c.query(
      `SELECT id,organization_id,community,school_year,name,starts_on::text AS starts_on,ends_on::text AS ends_on,source,overrides,hidden
         FROM school_holiday WHERE (organization_id IS NULL OR organization_id=$1 OR organization_id=$2) AND community=ANY($3::text[]) ORDER BY starts_on,name`,
      [org, federation, communities],
    )
  ).rows as { id: string; organization_id: string | null; community: string; school_year: string; name: string; starts_on: string; ends_on: string; source: string; overrides: string | null; hidden: boolean }[];
  const replaced = new Set(rows.map((r) => r.overrides).filter(Boolean) as string[]);
  return rows
    .filter((r) => !replaced.has(r.id) && !r.hidden)
    .map((r) => ({ ...r, origin: r.organization_id === null ? ("reference" as const) : r.organization_id === org ? ("club" as const) : ("federation" as const) }));
}

async function material(x: Ctx) {
  const ref = x.kind === "club" ? ((await x.c.query("SELECT holiday_reference FROM organization WHERE id=$1", [x.org])).rows[0]?.holiday_reference as string[]) : ["fwb", "vl"];
  const holidays = await clubHolidays(x.c, x.org, x.kind === "club" ? x.federation : null, ref);
  const closures = (
    await x.c.query(
      "SELECT k.id,k.place_id,p.name AS place,k.label,k.starts_on::text AS starts_on,k.ends_on::text AS ends_on FROM club_closure k LEFT JOIN calendar_place p ON p.id=k.place_id WHERE k.organization_id=$1 ORDER BY k.starts_on",
      [x.org],
    )
  ).rows as { id: string; place_id: string | null; place: string | null; label: string; starts_on: string; ends_on: string }[];
  return { reference: ref, holidays, closures };
}

/** The dates of each slot, with the skipped ones and their reason. */
function previewOf(m: Awaited<ReturnType<typeof material>>, slots: Slot[]) {
  return slots.map((s) => {
    const dates: PlannedDate[] = planDates({
      from: s.from,
      to: s.to,
      weekday: s.weekday,
      holidays: m.holidays,
      closures: m.closures.filter((k) => k.place_id === null || k.place_id === s.placeId),
      reactivated: s.reactivated,
    });
    return { teamId: s.teamId, weekday: s.weekday, startTime: s.startTime, dates };
  });
}

export async function scheduleView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    const m = await material(x);
    if (x.kind === "federation") return { kind: x.kind, organizationId: x.org, ...m, seasons: [], places: [], types: [], responsibles: [], slots: [] };
    const seasons = (
      await x.c.query("SELECT id,name,starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE organization_id=$1 AND NOT archived ORDER BY starts_on DESC", [x.org])
    ).rows as { id: string; name: string; starts_on: string; ends_on: string }[];
    const teams = (await x.c.query("SELECT id,name,season_id FROM team WHERE organization_id=$1 AND NOT archived ORDER BY name", [x.org])).rows as { id: string; name: string; season_id: string }[];
    return {
      kind: x.kind,
      organizationId: x.org,
      ...m,
      seasons: seasons.map((s) => ({ ...s, schoolYear: schoolYearOf(s.starts_on), teams: teams.filter((t) => t.season_id === s.id) })),
      places: (await x.c.query("SELECT id,name FROM calendar_place WHERE organization_id=$1 AND NOT archived ORDER BY name", [x.org])).rows as { id: string; name: string }[],
      types: (await x.c.query("SELECT id,name,family,ask_response FROM event_type WHERE organization_id=$1 AND NOT archived ORDER BY position,name", [x.org])).rows as {
        id: string;
        name: string;
        family: string;
        ask_response: boolean;
      }[],
      responsibles: (
        await x.c.query(
          'SELECT DISTINCT u.id,u.name FROM "user" u JOIN organization_membership m ON m.user_id=u.id JOIN role_assignment r ON r.user_id=u.id AND r.organization_id=m.organization_id WHERE m.organization_id=$1 AND u.active AND m.active AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND r.role IN (\'club_president\',\'coach\') ORDER BY u.name',
          [x.org],
        )
      ).rows as { id: string; name: string }[],
      slots: (
        await x.c.query(
          "SELECT sl.id,sl.season_id,sl.team_id,t.name AS team,sl.weekday,sl.start_time,sl.end_time,(SELECT count(*)::int FROM calendar_event e WHERE e.series_id=sl.series_id) AS sessions FROM season_slot sl JOIN team t ON t.id=sl.team_id WHERE sl.organization_id=$1 ORDER BY t.name,sl.weekday",
          [x.org],
        )
      ).rows,
    };
  });
}

export async function scheduleExecute(db: Pool, p: Principal, cmd: ScheduleCommand) {
  if (cmd.action === "plan") return planSeason(db, p, cmd);
  return scope(db, p, cmd.action !== "preview", async (x) => {
    switch (cmd.action) {
      case "reference": {
        if (x.kind !== "club") throw new AccessError("CLUB_ONLY");
        await x.c.query("UPDATE organization SET holiday_reference=$2 WHERE id=$1", [x.org, [...new Set(cmd.communities)]]);
        await audit(x.c, x.org, x.userId, "calendar.holidayReference", x.org, { communities: cmd.communities });
        return { communities: cmd.communities };
      }
      case "holiday": {
        if (cmd.endsOn < cmd.startsOn) throw new AccessError("INVALID_DATE", 400);
        if (cmd.overrides && !(await clubHolidays(x.c, x.org, x.kind === "club" ? x.federation : null, ["fwb", "vl"])).some((h) => h.id === cmd.overrides)) throw new AccessError("NOT_FOUND", 404);
        const id = (
          await x.c.query(
            "INSERT INTO school_holiday(organization_id,community,school_year,name,starts_on,ends_on,source,overrides,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
            [x.org, cmd.community, cmd.schoolYear, cmd.name, cmd.startsOn, cmd.endsOn, x.orgName.slice(0, 300), cmd.overrides, x.userId],
          )
        ).rows[0].id as string;
        await audit(x.c, x.org, x.userId, "calendar.holiday", id);
        return { id };
      }
      case "hideHoliday": {
        const h = (await clubHolidays(x.c, x.org, x.kind === "club" ? x.federation : null, ["fwb", "vl"])).find((r) => r.id === cmd.id);
        if (!h) throw new AccessError("NOT_FOUND", 404);
        if (h.organization_id === x.org) {
          await x.c.query("DELETE FROM school_holiday WHERE id=$1 AND organization_id=$2", [cmd.id, x.org]);
          return { id: cmd.id };
        }
        const id = (
          await x.c.query(
            "INSERT INTO school_holiday(organization_id,community,school_year,name,starts_on,ends_on,overrides,hidden,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING id",
            [x.org, h.community, h.school_year, h.name, h.starts_on, h.ends_on, h.id, x.userId],
          )
        ).rows[0].id as string;
        await audit(x.c, x.org, x.userId, "calendar.holidayHidden", h.id);
        return { id };
      }
      case "removeHoliday": {
        const r = await x.c.query("DELETE FROM school_holiday WHERE id=$1 AND organization_id=$2 RETURNING id", [cmd.id, x.org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { id: cmd.id };
      }
      case "closure": {
        if (x.kind !== "club") throw new AccessError("CLUB_ONLY");
        if (cmd.endsOn < cmd.startsOn) throw new AccessError("INVALID_DATE", 400);
        if (cmd.placeId && !(await x.c.query("SELECT 1 FROM calendar_place WHERE id=$1 AND organization_id=$2", [cmd.placeId, x.org])).rowCount) throw new AccessError("NOT_FOUND", 404);
        const id = (
          await x.c.query("INSERT INTO club_closure(organization_id,place_id,label,starts_on,ends_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [
            x.org,
            cmd.placeId,
            cmd.label,
            cmd.startsOn,
            cmd.endsOn,
            x.userId,
          ])
        ).rows[0].id as string;
        return { id };
      }
      case "removeClosure": {
        const r = await x.c.query("DELETE FROM club_closure WHERE id=$1 AND organization_id=$2 RETURNING id", [cmd.id, x.org]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { id: cmd.id };
      }
      case "preview": {
        if (x.kind !== "club") throw new AccessError("CLUB_ONLY");
        await checkSlots(x, cmd.seasonId, cmd.slots);
        return { slots: previewOf(await material(x), cmd.slots) };
      }
    }
  });
}

async function checkSlots(x: Ctx, seasonId: string, slots: Slot[]) {
  const season = (await x.c.query("SELECT starts_on::text AS starts_on,ends_on::text AS ends_on FROM season WHERE id=$1 AND organization_id=$2", [seasonId, x.org])).rows[0];
  if (!season) throw new AccessError("NOT_FOUND", 404);
  for (const s of slots) {
    if (!(await x.c.query("SELECT 1 FROM team WHERE id=$1 AND organization_id=$2 AND season_id=$3", [s.teamId, x.org, seasonId])).rowCount) throw new AccessError("NOT_FOUND", 404);
    if (s.from > s.to || s.from < season.starts_on || s.to > season.ends_on || s.endTime <= s.startTime) throw new AccessError("INVALID_DATE", 400);
  }
  return season as { starts_on: string; ends_on: string };
}

/**
 * The season's series: one per slot, created by the usual « create » of the
 * calendar (its checks, its notices, its links) with the dates kept; a slot
 * already planned keeps its series, so planning again creates nothing twice.
 */
async function planSeason(db: Pool, p: Principal, cmd: Extract<ScheduleCommand, { action: "plan" }>) {
  const prepared = await scope(db, p, true, async (x) => {
    if (x.kind !== "club") throw new AccessError("CLUB_ONLY");
    await checkSlots(x, cmd.seasonId, cmd.slots);
    const preview = previewOf(await material(x), cmd.slots);
    const out = [];
    for (const [i, s] of cmd.slots.entries()) {
      const row = (
        await x.c.query(
          `INSERT INTO season_slot(organization_id,season_id,team_id,weekday,start_time,end_time,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (season_id,team_id,weekday,start_time) DO UPDATE SET end_time=season_slot.end_time RETURNING series_id`,
          [x.org, cmd.seasonId, s.teamId, s.weekday, s.startTime, s.endTime, x.userId],
        )
      ).rows[0].series_id as string;
      out.push({ slot: s, seriesId: row, dates: preview[i].dates.filter((d) => !d.skip).map((d) => d.date) });
    }
    return { org: x.org, orgName: x.orgName, locale: x.locale, slots: out };
  });
  const results: { teamId: string; weekday: number; created: boolean; sessions: number; error: string | null }[] = [];
  for (const s of prepared.slots) {
    if (!s.dates.length) {
      results.push({ teamId: s.slot.teamId, weekday: s.slot.weekday, created: false, sessions: 0, error: "NO_DATE" });
      continue;
    }
    if (s.dates.length > 52) {
      results.push({ teamId: s.slot.teamId, weekday: s.slot.weekday, created: false, sessions: 0, error: "TOO_MANY" });
      continue;
    }
    const existed = !!(await db.query("SELECT 1 FROM calendar_series WHERE id=$1", [s.seriesId])).rowCount;
    try {
      const type = s.slot.eventTypeId ? (await db.query("SELECT legacy_kind FROM event_type WHERE id=$1 AND organization_id=$2", [s.slot.eventTypeId, prepared.org])).rows[0] : null;
      await calendarExecute(
        db,
        p,
        {
          action: "create",
          title: s.slot.title,
          kind: type?.legacy_kind ?? "training",
          customType: "",
          timezone: "Europe/Brussels",
          localStart: `${s.dates[0]}T${s.slot.startTime}`,
          localEnd: `${s.dates[0]}T${s.slot.endTime}`,
          fold: "later",
          teamId: s.slot.teamId,
          placeId: s.slot.placeId,
          responsibleId: s.slot.responsibleId,
          visibility: "organization",
          equipment: "",
          instructions: "",
          participants: [],
          documents: [],
          eventTypeId: s.slot.eventTypeId,
          // The team is the event's group; the invitations leave by themselves before each session (seasonSlotInviteTick).
          invite: { ask: false, deadline: null, groups: [{ kind: "team", ref: s.slot.teamId }] },
          intervalDays: 7,
          occurrences: s.dates.length,
          requestId: s.seriesId,
          dates: s.dates,
        },
        prepared.org,
      );
      results.push({ teamId: s.slot.teamId, weekday: s.slot.weekday, created: !existed, sessions: s.dates.length, error: null });
    } catch (e) {
      results.push({ teamId: s.slot.teamId, weekday: s.slot.weekday, created: false, sessions: 0, error: e instanceof AccessError ? e.code : "UNAVAILABLE" });
    }
  }
  let recipients = 0;
  const made = results.filter((r) => r.created);
  if (cmd.email && made.length) recipients = await seasonEmail(db, p, prepared, made.map((r) => r.teamId));
  return { results, recipients };
}

/** The « Calendrier de la saison » email to the planned teams' players and families, with the subscription link. */
async function seasonEmail(db: Pool, p: Principal, prepared: { org: string; orgName: string; locale: Locale }, teams: string[]) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const t = scheduleMail[prepared.locale];
    const base = process.env.BETTER_AUTH_URL ?? "";
    const group = (
      await c.query("INSERT INTO recipient_group(organization_id,name,audiences,team_ids,created_by) VALUES($1,$2,ARRAY['players','guardians'],$3,$4) RETURNING id", [
        prepared.org,
        t.subject.slice(0, 80),
        [...new Set(teams)],
        p.userId,
      ])
    ).rows[0].id;
    const n = (
      await c.query("INSERT INTO newsletter(organization_id,subject,blocks,group_ids,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *", [
        prepared.org,
        t.subject,
        JSON.stringify([
          { type: "text", text: t.text },
          { type: "button", label: t.button, url: `${base}/${prepared.locale}/calendar?subscribe=1` },
        ]),
        [group],
        p.userId,
      ])
    ).rows[0];
    let sent = 0;
    try {
      sent = await sendNewsletterNow(c, prepared.org, prepared.orgName, p.userId, n);
    } catch (e) {
      // Nobody to write to yet: the draft stays in Communication.
      if (!(e instanceof AccessError)) throw e;
    }
    await audit(c, prepared.org, p.userId, "calendar.seasonEmail", n.id, { recipients: sent });
    await c.query("COMMIT");
    return sent;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Each day: the planned sessions starting within 14 days whose type asks an answer get their invitations. */
export async function seasonSlotInviteTick(db: Pool) {
  const due = (
    await db.query(
      `SELECT e.*,sl.created_by FROM calendar_event e JOIN season_slot sl ON sl.series_id=e.series_id JOIN event_type t ON t.id=e.event_type_id
        WHERE e.status='scheduled' AND t.ask_response AND e.starts_at>now()+interval '3 hours' AND e.starts_at<now()+interval '14 days'
          AND NOT EXISTS (SELECT 1 FROM attendance_register r WHERE r.event_id=e.id) ORDER BY e.starts_at LIMIT 200`,
    )
  ).rows as (Event & { created_by: string })[];
  let n = 0;
  for (const e of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const a = (
        await c.query('SELECT r.*,u."twoFactorEnabled" FROM role_assignment r JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.user_id=$2 AND r.revoked_at IS NULL ORDER BY r.valid_from LIMIT 1', [
          e.organization_id,
          e.created_by,
        ])
      ).rows[0] as Actor | undefined;
      const people = (await audience(c, e)).map((x) => x.id as string);
      if (a && people.length) {
        const deadline = new Date(new Date(e.starts_at).getTime() - 2 * 3600000);
        if (await inviteForEvent(c, { userId: e.created_by, sessionId: randomUUID() }, a, e, people, deadline)) n++;
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }
  }
  return n;
}
