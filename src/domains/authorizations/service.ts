import type { Pool, PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { account, AccessError, active, audit, type Principal } from "../access/service";
import { permissions } from "../access/policy";
import { mfaSatisfied } from "../../lib/security-policy";
import { storageAdapter } from "../../lib/storage-adapter";
import { seal } from "../notifications/crypto";
import { publish } from "../notifications/queue";
import { isLocale, type Locale } from "../../lib/locale";
import { templateText } from "../documents/schema";
import { authorizationCopy, authorizationDefaults, authorizationKinds, fillCopy, type AuthorizationKind } from "./authorization-copy";

/**
 * 28: parental authorizations signed online.
 * - The club writes its texts in Réglages › Documents (fr, nl, en), each a
 *   versioned document template marked with its kind, and says whether one
 *   signature covers the season or a single trip, and whether a trip asks
 *   for it by itself.
 * - When a minor joins a trip (travel, tournament, camp), each kind asked on
 *   trips becomes a request: a document of the minor (category « consent »,
 *   the trip's season) carrying the text in the parent's language, signed
 *   with the existing signature. The legal representatives receive it.
 * - The trip and its route sheet list what is signed and what is missing; a
 *   reminder leaves by itself after three days; a minor without his
 *   authorization is a warning, never a block.
 * - The image right's answer feeds the publication rules (a refusal hides
 *   the minor's name on the public pages and his prize in the Hall of fame).
 */
const kind = z.enum(authorizationKinds);
export const authorizationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    kind,
    validity: z.enum(["season", "event"]),
    onTrips: z.boolean(),
    texts: z.object({ fr: z.string().trim().max(10000), nl: z.string().trim().max(10000), en: z.string().trim().max(10000) }),
  }),
  /** A kind valid for the season, asked of every minor of the club at once (the general image right, say). */
  z.object({ action: z.literal("requestAll"), kind }),
  z.object({ action: z.literal("remind"), ids: z.array(z.uuid()).min(1).max(300) }),
  /** A representative says no (the image right above all); the club sees it. */
  z.object({ action: z.literal("refuse"), id: z.uuid() }),
]);
export type AuthorizationCommand = z.infer<typeof authorizationCommand>;

type Ctx = { c: PoolClient; org: string; userId: string; manage: boolean };
async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (x: Ctx) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query(write ? "BEGIN" : "BEGIN READ ONLY");
    const a = await active(c, p);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    if (write) await c.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [a.organization_id]);
    const user = await account(c, p);
    const rights = permissions(a.role, a.grants);
    const manage = mfaSatisfied(!!user.twoFactorEnabled) && rights.includes("documents.manage");
    const out = await fn({ c, org: a.organization_id, userId: p.userId, manage });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

type Setting = { kind: AuthorizationKind; validity: "season" | "event"; onTrips: boolean; texts: Record<Locale, string>; version: number };
/** The club's texts and choices, kind by kind (the defaults when nothing is saved). */
export async function authorizationSettings(c: PoolClient | Pool, org: string): Promise<Setting[]> {
  const saved = new Map(
    (await c.query("SELECT kind,validity,on_trips FROM authorization_setting WHERE organization_id=$1", [org])).rows.map((r) => [r.kind as AuthorizationKind, r]),
  );
  const texts = (
    await c.query(
      "SELECT DISTINCT ON(authorization_kind,locale) authorization_kind,locale,body,version FROM document_template WHERE organization_id=$1 AND authorization_kind IS NOT NULL ORDER BY authorization_kind,locale,version DESC",
      [org],
    )
  ).rows as { authorization_kind: AuthorizationKind; locale: Locale; body: string; version: number }[];
  return authorizationKinds.map((k) => {
    const s = saved.get(k);
    const mine = texts.filter((t) => t.authorization_kind === k);
    return {
      kind: k,
      validity: (s?.validity ?? authorizationDefaults[k].validity) as "season" | "event",
      onTrips: s ? !!s.on_trips : authorizationDefaults[k].onTrips,
      texts: { fr: mine.find((t) => t.locale === "fr")?.body ?? "", nl: mine.find((t) => t.locale === "nl")?.body ?? "", en: mine.find((t) => t.locale === "en")?.body ?? "" },
      version: Math.max(0, ...mine.map((t) => t.version)),
    };
  });
}

/** The season a day falls in (else the latest one). */
async function seasonOn(c: PoolClient, org: string, day: string) {
  return ((
    await c.query(
      "SELECT id,name FROM season WHERE organization_id=$1 ORDER BY ($2::date BETWEEN starts_on AND ends_on) DESC,starts_on DESC LIMIT 1",
      [org, day],
    )
  ).rows[0] ?? null) as { id: string; name: string } | null;
}

/** The legal representatives who may sign for a minor (an account, a verified or declared link that may act). */
async function signers(c: PoolClient, org: string, profileId: string) {
  return (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(pe.locale,'fr') AS locale,o.name AS club
         FROM guardian_relationship g JOIN club_person gp ON gp.id=g.guardian_profile_id JOIN person pe ON pe.id=gp.person_id JOIN "user" u ON u.id=pe.user_id
         JOIN organization o ON o.id=g.organization_id
        WHERE g.organization_id=$1 AND g.subject_profile_id=$2 AND g.can_edit AND g.revoked_at IS NULL AND g.starts_on<=CURRENT_DATE AND (g.ends_on IS NULL OR g.ends_on>=CURRENT_DATE) AND u.active
        ORDER BY u.name`,
      [org, profileId],
    )
  ).rows as { id: string; email: string; name: string; locale: string; club: string }[];
}

async function notifySigners(c: PoolClient, org: string, requestId: string, k: AuthorizationKind, profileId: string, name: string, reminder: boolean) {
  const base = process.env.BETTER_AUTH_URL ?? "";
  const day = new Date().toISOString().slice(0, 10);
  for (const u of await signers(c, org, profileId)) {
    const locale: Locale = isLocale(u.locale) ? u.locale : "fr";
    const t = authorizationCopy[locale];
    const v = { kind: t.kinds[k], name };
    await publish(c, {
      organizationId: org,
      userId: u.id,
      email: u.email,
      kind: "automation",
      category: "administrative",
      resourceType: "automation",
      resourceId: `authorization:${requestId}`,
      eventKey: `authorization:${requestId}:${u.id}:${reminder ? "reminder:" + day : "request"}`,
      locale,
      variables: {
        name: u.name,
        title: fillCopy(reminder ? t.reminderTitle : t.requestTitle, v),
        message: fillCopy(reminder ? t.reminderText : t.requestText, v),
        organization: u.club,
        url: `${base}/${locale}/family`,
      },
    });
  }
}

/**
 * One request: the minor's document from the club's text, in the language of
 * his first representative (French, Dutch or English as written), then the
 * representatives are told. Nothing when the club has no text for the kind,
 * or when the same authorization is already asked (season or trip).
 */
export async function issueAuthorization(
  c: PoolClient,
  org: string,
  userId: string,
  input: { kind: AuthorizationKind; profileId: string; seasonId: string; trip: { id: string; title: string; starts_on: string; ends_on: string } | null },
) {
  const exists = (
    await c.query(
      "SELECT id FROM authorization_request WHERE profile_id=$1 AND kind=$2 AND status<>'cancelled' AND (CASE WHEN $4::uuid IS NULL THEN trip_id IS NULL AND season_id=$3 ELSE trip_id=$4 END)",
      [input.profileId, input.kind, input.seasonId, input.trip?.id ?? null],
    )
  ).rows[0];
  if (exists) return null;
  const person = (await c.query("SELECT full_name FROM club_person WHERE id=$1 AND organization_id=$2", [input.profileId, org])).rows[0];
  if (!person) throw new AccessError("NOT_FOUND", 404);
  const first = (await signers(c, org, input.profileId))[0];
  const wanted = first && isLocale(first.locale) ? first.locale : "fr";
  const templates = (
    await c.query(
      "SELECT DISTINCT ON(locale) id,locale,name,body FROM document_template WHERE organization_id=$1 AND authorization_kind=$2 AND length(trim(body))>0 ORDER BY locale,version DESC",
      [org, input.kind],
    )
  ).rows as { id: string; locale: Locale; name: string; body: string }[];
  const tpl = templates.find((t) => t.locale === wanted) ?? templates.find((t) => t.locale === "fr") ?? templates[0];
  if (!tpl) return null;
  const t = authorizationCopy[tpl.locale];
  const season = (await c.query("SELECT name FROM season WHERE id=$1", [input.seasonId])).rows[0];
  const club = (await c.query("SELECT name FROM organization WHERE id=$1", [org])).rows[0];
  const today = new Intl.DateTimeFormat("fr-BE", { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date());
  const body = templateText(tpl.body, { name: person.full_name, organization: club.name, season: season.name, date: today });
  const text = input.trip ? `${fillCopy(t.forTrip, { trip: input.trip.title, from: input.trip.starts_on, to: input.trip.ends_on })}\n\n${body}` : body;
  const docName = fillCopy(t.documentName, { kind: t.kinds[input.kind], name: input.trip ? input.trip.title : season.name }).slice(0, 160);
  const docId = (
    await c.query(
      "INSERT INTO club_document(organization_id,profile_id,season_id,name,category,sensitive,status) VALUES($1,$2,$3,$4,'consent',false,'requested') RETURNING id",
      [org, input.profileId, input.seasonId, docName],
    )
  ).rows[0].id as string;
  const versionId = randomUUID();
  const bytes = Buffer.from(text, "utf8");
  await c.query(
    "INSERT INTO document_version(id,document_id,sequence,filename,media_type,content_ciphertext,sha256,uploaded_by,template_id) VALUES($1,$2,1,$3,'text/plain',$4,$5,$6,$7)",
    [
      versionId,
      docId,
      (docName.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 110) || "autorisation") + ".txt",
      await storageAdapter().put("document:" + versionId, seal({ data: bytes.toString("base64") }, "document:" + versionId)),
      createHash("sha256").update(bytes).digest("hex"),
      userId,
      tpl.id,
    ],
  );
  await c.query("UPDATE club_document SET current_version_id=$2 WHERE id=$1", [docId, versionId]);
  await c.query("INSERT INTO document_history(document_id,actor_id,action,message) VALUES($1,$2,'requested',$3)", [docId, userId, "authorization:" + input.kind]);
  const id = (
    await c.query(
      "INSERT INTO authorization_request(organization_id,kind,profile_id,season_id,trip_id,document_id,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [org, input.kind, input.profileId, input.seasonId, input.trip?.id ?? null, docId, userId],
    )
  ).rows[0].id as string;
  await notifySigners(c, org, id, input.kind, input.profileId, person.full_name, false);
  return id;
}

/** A trip's minors (players under 18 on the first day) get the authorizations the club asks on trips. */
export async function requestForTrip(c: PoolClient, org: string, userId: string, tripId: string) {
  const trip = (
    await c.query("SELECT id,title,starts_on::text AS starts_on,ends_on::text AS ends_on FROM trip WHERE id=$1 AND organization_id=$2 AND status<>'cancelled'", [tripId, org])
  ).rows[0] as { id: string; title: string; starts_on: string; ends_on: string } | undefined;
  if (!trip) return 0;
  const season = await seasonOn(c, org, trip.starts_on);
  if (!season) return 0;
  const kinds = (await authorizationSettings(c, org)).filter((s) => s.onTrips && (s.texts.fr || s.texts.nl || s.texts.en));
  if (!kinds.length) return 0;
  const minors = (
    await c.query(
      `SELECT tp.profile_id FROM trip_participant tp JOIN club_person cp ON cp.id=tp.profile_id
        WHERE tp.trip_id=$1 AND tp.role='player' AND tp.status<>'declined' AND cp.birth_date>$2::date-interval '18 years'`,
      [tripId, trip.starts_on],
    )
  ).rows.map((r) => r.profile_id as string);
  let n = 0;
  for (const profileId of minors)
    for (const s of kinds)
      if (await issueAuthorization(c, org, userId, { kind: s.kind, profileId, seasonId: season.id, trip: s.validity === "event" ? trip : null })) n++;
  return n;
}

/** A participant who leaves the trip (or declines): what was asked for this trip only is withdrawn. */
export async function cancelForTrip(c: PoolClient, tripId: string, profileId: string) {
  await c.query("UPDATE authorization_request SET status='cancelled' WHERE trip_id=$1 AND profile_id=$2 AND status='requested'", [tripId, profileId]);
}

/** What the trip needs and has: for each travelling minor, each kind asked on trips. */
export async function tripAuthorizations(c: PoolClient, org: string, tripId: string) {
  const trip = (await c.query("SELECT starts_on::text AS starts_on FROM trip WHERE id=$1 AND organization_id=$2", [tripId, org])).rows[0];
  if (!trip) return { kinds: [], people: [], missing: 0 };
  const season = await seasonOn(c, org, trip.starts_on);
  const kinds = (await authorizationSettings(c, org)).filter((s) => s.onTrips && (s.texts.fr || s.texts.nl || s.texts.en)).map((s) => ({ kind: s.kind, validity: s.validity }));
  const minors = (
    await c.query(
      `SELECT cp.id,cp.full_name FROM trip_participant tp JOIN club_person cp ON cp.id=tp.profile_id
        WHERE tp.trip_id=$1 AND tp.role='player' AND tp.status<>'declined' AND cp.birth_date>$2::date-interval '18 years' ORDER BY cp.full_name`,
      [tripId, trip.starts_on],
    )
  ).rows as { id: string; full_name: string }[];
  const rows = minors.length
    ? ((
        await c.query(
          `SELECT id,kind,profile_id,status,trip_id,requested_at,reminded_at,answered_at FROM authorization_request
            WHERE organization_id=$1 AND profile_id=ANY($2::uuid[]) AND status<>'cancelled' AND (trip_id=$3 OR (trip_id IS NULL AND season_id=$4))`,
          [org, minors.map((m) => m.id), tripId, season?.id ?? null],
        )
      ).rows as { id: string; kind: AuthorizationKind; profile_id: string; status: string; trip_id: string | null; requested_at: Date; reminded_at: Date | null; answered_at: Date | null }[])
    : [];
  const people = minors.map((m) => ({
    id: m.id,
    name: m.full_name,
    items: kinds.map((k) => {
      const r = rows.find((x) => x.profile_id === m.id && x.kind === k.kind && (k.validity === "event" ? x.trip_id === tripId : x.trip_id === null));
      return { kind: k.kind, requestId: r?.id ?? null, status: (r?.status ?? "none") as "none" | "requested" | "signed" | "refused", remindedAt: r?.reminded_at ?? null };
    }),
  }));
  return { kinds: kinds.map((k) => k.kind), people, missing: people.reduce((n, p) => n + p.items.filter((i) => i.status !== "signed").length, 0) };
}

/** After a signature (documents): the request is answered; a signed image right allows the name in public. */
export async function authorizationSigned(c: PoolClient, documentId: string, userId: string) {
  const r = (
    await c.query(
      "UPDATE authorization_request SET status='signed',answered_at=now(),answered_by=$2 WHERE document_id=$1 AND status IN ('requested','refused') RETURNING kind,profile_id,organization_id",
      [documentId, userId],
    )
  ).rows[0] as { kind: AuthorizationKind; profile_id: string; organization_id: string } | undefined;
  if (r?.kind === "image")
    await c.query("UPDATE club_person SET public_name_consent=true,public_name_consent_at=now() WHERE id=$1 AND organization_id=$2", [r.profile_id, r.organization_id]);
}

/** May this account sign (or refuse) for the minor: a current link that may act. */
async function speaksFor(c: PoolClient, org: string, profileId: string, userId: string) {
  return (await signers(c, org, profileId)).some((u) => u.id === userId);
}

export async function authorizationsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (x) => {
    if (!x.manage) throw new AccessError("FORBIDDEN");
    const settings = await authorizationSettings(x.c, x.org);
    const counts = (
      await x.c.query("SELECT kind,status,count(*)::int AS n FROM authorization_request WHERE organization_id=$1 AND status<>'cancelled' GROUP BY kind,status", [x.org])
    ).rows as { kind: AuthorizationKind; status: string; n: number }[];
    return {
      organizationId: x.org,
      kinds: settings.map((s) => ({
        ...s,
        requested: counts.find((r) => r.kind === s.kind && r.status === "requested")?.n ?? 0,
        signed: counts.find((r) => r.kind === s.kind && r.status === "signed")?.n ?? 0,
        refused: counts.find((r) => r.kind === s.kind && r.status === "refused")?.n ?? 0,
      })),
    };
  });
}

export async function authorizationsExecute(db: Pool, p: Principal, cmd: AuthorizationCommand) {
  return scope(db, p, true, async (x) => {
    if (cmd.action === "refuse") {
      const r = (
        await x.c.query("SELECT id,kind,profile_id,document_id,status FROM authorization_request WHERE id=$1 AND organization_id=$2 FOR UPDATE", [cmd.id, x.org])
      ).rows[0];
      if (!r) throw new AccessError("NOT_FOUND", 404);
      if (!(await speaksFor(x.c, x.org, r.profile_id, x.userId))) throw new AccessError("FORBIDDEN");
      if (r.status !== "requested") throw new AccessError("INVALID_TRANSITION", 409);
      await x.c.query("UPDATE authorization_request SET status='refused',answered_at=now(),answered_by=$2 WHERE id=$1", [r.id, x.userId]);
      if (r.document_id) {
        await x.c.query("UPDATE club_document SET status='refused',version=version+1,updated_at=now() WHERE id=$1", [r.document_id]);
        await x.c.query("INSERT INTO document_history(document_id,actor_id,action,message) VALUES($1,$2,'refused','authorization refused by the representative')", [r.document_id, x.userId]);
      }
      // A refused image right hides the minor's name on the public pages.
      if (r.kind === "image")
        await x.c.query("UPDATE club_person SET public_name_consent=false,public_name_consent_at=NULL WHERE id=$1 AND organization_id=$2", [r.profile_id, x.org]);
      await audit(x.c, x.org, x.userId, "authorization.refused", r.id);
      return { id: r.id };
    }
    if (!x.manage) throw new AccessError("FORBIDDEN");
    if (cmd.action === "save") {
      const current = (await authorizationSettings(x.c, x.org)).find((s) => s.kind === cmd.kind)!;
      const names = Object.fromEntries((["fr", "nl", "en"] as const).map((l) => [l, authorizationCopy[l].kinds[cmd.kind]]));
      for (const l of ["fr", "nl", "en"] as const) {
        if (cmd.texts[l] === current.texts[l]) continue;
        if (cmd.texts[l]) {
          try {
            templateText(cmd.texts[l], {});
          } catch {
            throw new AccessError("INVALID_TEMPLATE", 400);
          }
          if (cmd.texts[l].length < 20) throw new AccessError("TEXT_TOO_SHORT", 400);
        }
        const version =
          (await x.c.query("SELECT COALESCE(max(version),0)+1 AS v FROM document_template WHERE organization_id=$1 AND name=$2 AND locale=$3", [x.org, names[l], l])).rows[0].v;
        await x.c.query("INSERT INTO document_template(organization_id,name,locale,version,body,created_by,authorization_kind) VALUES($1,$2,$3,$4,$5,$6,$7)", [
          x.org,
          names[l],
          l,
          version,
          cmd.texts[l],
          x.userId,
          cmd.kind,
        ]);
      }
      await x.c.query(
        `INSERT INTO authorization_setting(organization_id,kind,validity,on_trips,updated_by) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (organization_id,kind) DO UPDATE SET validity=EXCLUDED.validity,on_trips=EXCLUDED.on_trips,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [x.org, cmd.kind, cmd.validity, cmd.onTrips, x.userId],
      );
      await audit(x.c, x.org, x.userId, "authorization.template", cmd.kind);
      return { kind: cmd.kind };
    }
    if (cmd.action === "requestAll") {
      const s = (await authorizationSettings(x.c, x.org)).find((k) => k.kind === cmd.kind)!;
      if (s.validity !== "season") throw new AccessError("SEASON_ONLY", 409);
      if (!(s.texts.fr || s.texts.nl || s.texts.en)) throw new AccessError("NO_TEXT", 409);
      const season = await seasonOn(x.c, x.org, new Date().toISOString().slice(0, 10));
      if (!season) throw new AccessError("NO_SEASON", 409);
      const minors = (
        await x.c.query(
          `SELECT cp.id FROM club_person cp WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles) AND cp.birth_date>CURRENT_DATE-interval '18 years'
            AND EXISTS(SELECT 1 FROM guardian_relationship g WHERE g.subject_profile_id=cp.id AND g.revoked_at IS NULL) ORDER BY cp.full_name LIMIT 500`,
          [x.org],
        )
      ).rows.map((r) => r.id as string);
      let sent = 0;
      for (const profileId of minors) if (await issueAuthorization(x.c, x.org, x.userId, { kind: cmd.kind, profileId, seasonId: season.id, trip: null })) sent++;
      await audit(x.c, x.org, x.userId, "authorization.requestAll", cmd.kind);
      return { sent };
    }
    // remind
    const rows = (
      await x.c.query(
        "SELECT r.id,r.kind,r.profile_id,cp.full_name FROM authorization_request r JOIN club_person cp ON cp.id=r.profile_id WHERE r.id=ANY($1::uuid[]) AND r.organization_id=$2 AND r.status='requested'",
        [cmd.ids, x.org],
      )
    ).rows as { id: string; kind: AuthorizationKind; profile_id: string; full_name: string }[];
    for (const r of rows) {
      await notifySigners(x.c, x.org, r.id, r.kind, r.profile_id, r.full_name, true);
      await x.c.query("UPDATE authorization_request SET reminded_at=now() WHERE id=$1", [r.id]);
    }
    return { sent: rows.length };
  });
}

/** Each day: a request unanswered for three days is recalled, then every three days while it is useful. */
export async function authorizationTick(db: Pool) {
  const due = (
    await db.query(
      `SELECT r.id,r.organization_id,r.kind,r.profile_id,cp.full_name FROM authorization_request r JOIN club_person cp ON cp.id=r.profile_id LEFT JOIN trip t ON t.id=r.trip_id
        WHERE r.status='requested' AND r.requested_at<now()-interval '3 days' AND (r.reminded_at IS NULL OR r.reminded_at<now()-interval '3 days')
          AND (r.trip_id IS NULL OR (t.status<>'cancelled' AND t.ends_on>=CURRENT_DATE)) ORDER BY r.requested_at LIMIT 500`,
    )
  ).rows as { id: string; organization_id: string; kind: AuthorizationKind; profile_id: string; full_name: string }[];
  let n = 0;
  for (const r of due) {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const still = await c.query("UPDATE authorization_request SET reminded_at=now() WHERE id=$1 AND status='requested' RETURNING id", [r.id]);
      if (still.rowCount) {
        await notifySigners(c, r.organization_id, r.id, r.kind, r.profile_id, r.full_name, true);
        n++;
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }
  return n;
}
