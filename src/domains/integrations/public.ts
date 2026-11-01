import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { account, active, audit, AccessError, type Principal } from "../access/service";
import { mfaSatisfied } from "../../lib/security-policy";
import { seal } from "../notifications/crypto";
import { ageOn } from "../people/schema";
import { brusselsToday } from "../people/service";
import { clubRows, matchRows, result } from "../tournaments/service";
import { podium, readRules, standings, type ClubRef } from "../tournaments/schema";
import { escapeIcs, foldLine } from "../calendar/ics";
import { acceptableUrl, webhookEvents } from "./webhooks";
import { apiScopes, publicBlocks } from "../../components/public-copy";

/**
 * B6: what a club shows to everyone, when it chooses to. Its page (the
 * blocks it picks), its tournaments' pages, widgets for its website, a
 * public calendar feed; and for its own systems a read API with keys and
 * signed webhooks. Only validated results; a minor's name never without
 * the explicit consent recorded by the club; no other personal data.
 */
type Actor = Awaited<ReturnType<typeof active>> & { twoFactorEnabled: boolean };
type Scope = { c: PoolClient; p: Principal; a: Actor; org: string };
type Db = Pool | PoolClient;

/** A person's name on a public page: an adult's, or a minor's with the consent; else nothing. Pure. */
export function publicName(fullName: string, birthDate: string | null, consent: boolean, today: string) {
  const adult = !!birthDate && ageOn(birthDate, today) >= 18;
  return adult || consent ? fullName : null;
}
export const slugOf = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export const integrationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("page"),
    enabled: z.boolean(),
    slug: z.string().regex(/^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$/),
    intro: z.string().trim().max(2000).default(""),
    blocks: z.array(z.enum(publicBlocks)).max(publicBlocks.length),
  }),
  z.object({ action: z.literal("ics"), enabled: z.boolean() }),
  z.object({ action: z.literal("tournament"), id: z.uuid(), public: z.boolean() }),
  z.object({ action: z.literal("consent"), profileId: z.uuid(), consent: z.boolean() }),
  z.object({ action: z.literal("createKey"), name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(apiScopes)).min(1) }),
  z.object({ action: z.literal("revokeKey"), id: z.uuid() }),
  z.object({ action: z.literal("createHook"), url: z.url().max(500), events: z.array(z.enum(webhookEvents)).min(1) }),
  z.object({ action: z.literal("removeHook"), id: z.uuid() }),
  z.object({ action: z.literal("replay"), id: z.uuid() }),
]);
export type IntegrationCommand = z.infer<typeof integrationCommand>;

async function scope<T>(db: Pool, p: Principal, write: boolean, fn: (s: Scope) => Promise<T>, expected?: string) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const initial = await active(c, p);
    await c.query(`SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [initial.organization_id]);
    const a = { ...(await active(c, p)), twoFactorEnabled: !!(await account(c, p)).twoFactorEnabled } as Actor;
    if (a.organization_id !== initial.organization_id || (expected && expected !== a.organization_id)) throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "club") throw new AccessError("CLUB_ONLY");
    // The club's showcase and its integrations are the presidency's.
    if (!(mfaSatisfied(a.twoFactorEnabled) && a.role === "club_president")) throw new AccessError("FORBIDDEN");
    const out = await fn({ c, p, a, org: a.organization_id });
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw new AccessError("SLUG_TAKEN", 409);
    throw e;
  } finally {
    c.release();
  }
}

export async function integrationsView(db: Pool, p: Principal) {
  return scope(db, p, false, async (s) => {
    const o = (await s.c.query("SELECT name,public_enabled,public_slug,public_blocks,public_intro,public_ics_token FROM organization WHERE id=$1", [s.org])).rows[0];
    const today = brusselsToday();
    const minors = (
      await s.c.query("SELECT id,full_name,birth_date::text AS birth_date,public_name_consent FROM club_person WHERE organization_id=$1 AND status='active' AND 'player'=ANY(directory_roles) ORDER BY full_name", [s.org])
    ).rows.filter((r) => !r.birth_date || ageOn(r.birth_date, today) < 18) as { id: string; full_name: string; public_name_consent: boolean }[];
    return {
      organization_id: s.org,
      page: {
        enabled: o.public_enabled as boolean,
        slug: (o.public_slug as string | null) ?? slugOf(o.name),
        saved: !!o.public_slug,
        blocks: o.public_blocks as string[],
        intro: o.public_intro as string,
        ics: o.public_ics_token as string | null,
      },
      tournaments: (await s.c.query("SELECT id,name,year,public_page FROM tournament WHERE organization_id=$1 ORDER BY year DESC,name", [s.org])).rows as { id: string; name: string; year: number; public_page: boolean }[],
      minors: minors.map((m) => ({ id: m.id, full_name: m.full_name, consent: m.public_name_consent })),
      registrationForms: (await s.c.query("SELECT id,title FROM registration_form WHERE organization_id=$1 AND published AND NOT archived ORDER BY title", [s.org])).rows as { id: string; title: string }[],
      keys: (await s.c.query("SELECT id,name,prefix,scopes,created_at,last_used_at,revoked_at FROM api_key WHERE organization_id=$1 ORDER BY revoked_at IS NOT NULL,created_at DESC", [s.org])).rows as {
        id: string;
        name: string;
        prefix: string;
        scopes: string[];
        created_at: string;
        last_used_at: string | null;
        revoked_at: string | null;
      }[],
      hooks: (await s.c.query("SELECT id,url,events,active,created_at FROM webhook WHERE organization_id=$1 ORDER BY created_at", [s.org])).rows as { id: string; url: string; events: string[]; active: boolean; created_at: string }[],
      deliveries: (
        await s.c.query(
          "SELECT d.id,d.webhook_id,d.event,d.state,d.attempts,d.last_status,d.last_error,d.created_at,d.delivered_at FROM webhook_delivery d WHERE d.organization_id=$1 ORDER BY d.created_at DESC LIMIT 50",
          [s.org],
        )
      ).rows as { id: string; webhook_id: string; event: string; state: "pending" | "sent" | "failed"; attempts: number; last_status: number | null; last_error: string; created_at: string; delivered_at: string | null }[],
    };
  });
}

export async function integrationsExecute(db: Pool, p: Principal, cmd: IntegrationCommand, expected: string) {
  return scope(
    db,
    p,
    true,
    async (s) => {
      const org = s.org;
      switch (cmd.action) {
        case "page":
          await s.c.query("UPDATE organization SET public_enabled=$2,public_slug=$3,public_intro=$4,public_blocks=$5 WHERE id=$1", [org, cmd.enabled, cmd.slug, cmd.intro, cmd.blocks]);
          await audit(s.c, org, s.p.userId, "public.page", org, { enabled: cmd.enabled, slug: cmd.slug });
          return { id: org };
        case "ics": {
          const token = cmd.enabled ? randomBytes(30).toString("base64url") : null;
          await s.c.query("UPDATE organization SET public_ics_token=$2 WHERE id=$1", [org, token]);
          await audit(s.c, org, s.p.userId, cmd.enabled ? "public.ics.created" : "public.ics.revoked", org);
          return { id: org, token };
        }
        case "tournament": {
          const r = await s.c.query("UPDATE tournament SET public_page=$3 WHERE id=$1 AND organization_id=$2", [cmd.id, org, cmd.public]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, org, s.p.userId, "public.tournament", cmd.id, { public: cmd.public });
          return { id: cmd.id };
        }
        case "consent": {
          const r = await s.c.query("UPDATE club_person SET public_name_consent=$3,public_name_consent_at=CASE WHEN $3 THEN now() END WHERE id=$1 AND organization_id=$2", [cmd.profileId, org, cmd.consent]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, org, s.p.userId, cmd.consent ? "public.consent.given" : "public.consent.withdrawn", cmd.profileId);
          return { id: cmd.profileId };
        }
        case "createKey": {
          const prefix = randomBytes(8).toString("hex").slice(0, 8);
          const secret = randomBytes(32).toString("base64url");
          const key = `pfm_${prefix}_${secret}`;
          const id = (
            await s.c.query("INSERT INTO api_key(organization_id,name,prefix,key_hash,scopes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [org, cmd.name, prefix, keyHash(key), [...new Set(cmd.scopes)], s.p.userId])
          ).rows[0].id as string;
          await audit(s.c, org, s.p.userId, "api.key.created", id, { scopes: cmd.scopes });
          // Shown once: only its hash is kept.
          return { id, key };
        }
        case "revokeKey": {
          const r = await s.c.query("UPDATE api_key SET revoked_at=now(),revoked_by=$3 WHERE id=$1 AND organization_id=$2 AND revoked_at IS NULL", [cmd.id, org, s.p.userId]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, org, s.p.userId, "api.key.revoked", cmd.id);
          return { id: cmd.id };
        }
        case "createHook": {
          if (!acceptableUrl(cmd.url)) throw new AccessError("UNSAFE_URL", 400);
          const secret = "whsec_" + randomBytes(32).toString("base64url");
          const id = (await s.c.query("INSERT INTO webhook(organization_id,url,secret_sealed,events,created_by) VALUES($1,$2,'-',$3,$4) RETURNING id", [org, cmd.url, [...new Set(cmd.events)], s.p.userId])).rows[0].id as string;
          await s.c.query("UPDATE webhook SET secret_sealed=$2 WHERE id=$1", [id, seal(secret, "webhook:" + id)]);
          await audit(s.c, org, s.p.userId, "webhook.created", id, { events: cmd.events });
          return { id, secret };
        }
        case "removeHook": {
          const r = await s.c.query("DELETE FROM webhook WHERE id=$1 AND organization_id=$2", [cmd.id, org]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, org, s.p.userId, "webhook.removed", cmd.id);
          return { id: cmd.id };
        }
        case "replay": {
          // The same delivery again, with the same id: the receiver recognises it.
          const r = await s.c.query("UPDATE webhook_delivery SET state='pending',attempts=0,next_at=now(),last_error='' WHERE id=$1 AND organization_id=$2", [cmd.id, org]);
          if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
          await audit(s.c, org, s.p.userId, "webhook.replayed", cmd.id);
          return { id: cmd.id };
        }
      }
    },
    expected,
  );
}
export const keyHash = (key: string) => createHash("sha256").update("pfm-api:" + key).digest("hex");

/* ---------- Public reading (no account) ---------- */
/** Names of scorers on public pages, by the rule above (the consent belongs to the player's own club). */
async function scorersOf(c: Db, rows: { profile_id: string; goals: number }[], today: string) {
  if (!rows.length) return [];
  const people = new Map(
    (await c.query("SELECT id,full_name,birth_date::text AS birth_date,public_name_consent FROM club_person WHERE id=ANY($1::uuid[])", [rows.map((r) => r.profile_id)])).rows.map((r) => [r.id as string, r]),
  );
  return rows.map((r) => {
    const p = people.get(r.profile_id);
    return { name: p ? publicName(p.full_name, p.birth_date, p.public_name_consent, today) : null, goals: r.goals };
  });
}
async function tournamentTables(c: Db, t: { id: string; format: string; rules: unknown }) {
  const clubs = await clubRows(c, [t.id]);
  const accepted: ClubRef[] = clubs.filter((x) => x.status === "accepted").map(({ id, name, group }) => ({ id, name, group }));
  const matches = await matchRows(c, [t.id]);
  const results = matches.map(result);
  const rules = readRules(t.rules);
  const groups = [...new Set(accepted.map((x) => x.group).filter(Boolean))].sort();
  const tables =
    t.format === "knockout" ? [] : t.format === "groups_knockout" && groups.length ? groups.map((g) => ({ group: g, rows: standings(accepted, results, rules, g) })) : [{ group: "", rows: standings(accepted, results, rules) }];
  const names = new Map(clubs.map((x) => [x.id, x.name]));
  return { clubs, matches, names, tables, podium: podium(t.format as never, accepted, results, rules).map((x) => ({ rank: x.rank, name: names.get(x.club) ?? "" })) };
}

export async function publicClub(db: Pool, slug: string) {
  const o = (await db.query("SELECT id,name,city,public_blocks,public_intro,public_ics_token,EXISTS(SELECT 1 FROM organization_logo l WHERE l.organization_id=organization.id) AS logo FROM organization WHERE public_slug=$1 AND public_enabled AND kind='club'", [slug])).rows[0];
  if (!o) return null;
  const org = o.id as string,
    blocks = new Set(o.public_blocks as string[]),
    today = brusselsToday();
  const teams = blocks.has("teams")
    ? ((await db.query("SELECT t.name,t.category FROM team t JOIN season s ON s.id=t.season_id AND s.organization_id=t.organization_id WHERE t.organization_id=$1 AND NOT t.archived AND s.starts_on<=CURRENT_DATE AND s.ends_on>=CURRENT_DATE ORDER BY t.name", [org])).rows as { name: string; category: string | null }[])
    : [];
  const next = blocks.has("next_matches")
    ? ((
        await db.query(
          "SELECT m.id,t.name AS team,m.opponent,m.home,m.competition,m.starts_at,m.venue FROM match m JOIN team t ON t.id=m.team_id AND t.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.status NOT IN ('cancelled','played') AND m.starts_at>now() ORDER BY m.starts_at LIMIT 8",
          [org],
        )
      ).rows as { id: string; team: string; opponent: string; home: boolean; competition: string; starts_at: string; venue: string }[])
    : [];
  const results = [];
  if (blocks.has("results"))
    for (const m of (
      await db.query(
        "SELECT m.id,t.name AS team,m.opponent,m.home,m.competition,m.starts_at,m.our_score,m.their_score FROM match m JOIN team t ON t.id=m.team_id AND t.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.validated_at IS NOT NULL AND m.our_score IS NOT NULL ORDER BY m.starts_at DESC LIMIT 8",
        [org],
      )
    ).rows) {
      const goals = (await db.query("SELECT profile_id,goals FROM match_player WHERE match_id=$1 AND goals>0 ORDER BY goals DESC", [m.id])).rows as { profile_id: string; goals: number }[];
      results.push({
        id: m.id as string,
        team: m.team as string,
        opponent: m.opponent as string,
        home: m.home as boolean,
        competition: m.competition as string,
        starts_at: m.starts_at as string,
        our_score: m.our_score as number,
        their_score: m.their_score as number,
        scorers: await scorersOf(db, goals, today),
      });
    }
  const standingsBlock = [];
  if (blocks.has("standings"))
    for (const t of (
      await db.query(
        "SELECT t.id,t.name,t.year,t.format,t.rules FROM tournament t WHERE t.public_page AND (t.organization_id=$1 OR EXISTS (SELECT 1 FROM tournament_club tc WHERE tc.tournament_id=t.id AND tc.organization_id=$1 AND tc.status='accepted')) ORDER BY t.year DESC,t.name LIMIT 5",
        [org],
      )
    ).rows) {
      const x = await tournamentTables(db, t);
      standingsBlock.push({ id: t.id as string, name: t.name as string, year: t.year as number, tables: x.tables });
    }
  const sponsors = blocks.has("sponsors")
    ? ((await db.query("SELECT pa.name FROM partner pa JOIN partner_package pk ON pk.id=pa.package_id AND pk.organization_id=pa.organization_id WHERE pa.organization_id=$1 AND pa.status='active' AND pk.public_visible ORDER BY pk.position,pa.name", [org])).rows as { name: string }[])
    : [];
  return {
    name: o.name as string,
    city: (o.city as string | null) ?? "",
    intro: blocks.has("identity") ? (o.public_intro as string) : "",
    logo: !!o.logo,
    blocks: [...blocks],
    ics: !!o.public_ics_token,
    teams,
    next,
    results,
    standings: standingsBlock,
    sponsors: sponsors.map((x) => x.name),
  };
}

export async function publicTournament(db: Pool, id: string) {
  const t = (await db.query("SELECT t.id,t.name,t.year,t.format,t.rules,t.description,t.status,o.name AS owner FROM tournament t JOIN organization o ON o.id=t.organization_id WHERE t.id=$1 AND t.public_page", [id])).rows[0];
  if (!t) return null;
  const today = brusselsToday();
  const x = await tournamentTables(db, t);
  const days = (await db.query("SELECT d.id,d.label,d.day::text AS day,d.venue FROM tournament_day d WHERE d.tournament_id=$1 ORDER BY d.day", [t.id])).rows as { id: string; label: string; day: string; venue: string }[];
  const corrected = new Map(((await db.query("SELECT id,corrected_at FROM tournament_match WHERE tournament_id=$1 AND corrected_at IS NOT NULL", [t.id])).rows as { id: string; corrected_at: string }[]).map((r) => [r.id, r.corrected_at]));
  // Scores: validated only; the rest is the calendar.
  const matches = x.matches
    .filter((m) => m.status !== "cancelled")
    .map((m) => ({
      id: m.id,
      day: m.day,
      kickoff: m.kickoff,
      home: x.names.get(m.home_organization_id) ?? "",
      away: x.names.get(m.away_organization_id) ?? "",
      score: m.status === "validated" ? { home: m.home_score, away: m.away_score, homeShootout: m.home_shootout, awayShootout: m.away_shootout } : null,
      corrected_at: m.status === "validated" ? (corrected.get(m.id) ?? null) : null,
    }));
  const validated = x.matches.filter((m) => m.status === "validated").map((m) => m.id);
  const goals = validated.length
    ? ((await db.query("SELECT profile_id,sum(goals)::int AS goals FROM tournament_stat WHERE match_id=ANY($1::uuid[]) AND goals>0 GROUP BY profile_id ORDER BY 2 DESC LIMIT 20", [validated])).rows as { profile_id: string; goals: number }[])
    : [];
  return {
    name: t.name as string,
    year: t.year as number,
    owner: t.owner as string,
    description: t.description as string,
    status: t.status as string,
    days,
    matches,
    tables: x.tables,
    podium: x.podium,
    scorers: (await scorersOf(db, goals, today)).filter((s) => s.name !== null) as { name: string; goals: number }[],
  };
}

/** The club's public calendar (matches and open events), without any personal data. */
export async function publicIcs(db: Pool, token: string, baseUrl: string) {
  const o = (await db.query("SELECT id,name,public_slug,public_enabled FROM organization WHERE public_ics_token=$1", [token])).rows[0];
  if (!o) return null;
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Powerchair Football Manager//Public//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + escapeIcs(o.name)];
  const matches = (
    await db.query(
      "SELECT m.id,m.version,t.name AS team,m.opponent,m.home,m.starts_at,m.venue,m.status,m.created_at FROM match m JOIN team t ON t.id=m.team_id AND t.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.starts_at>now()-interval '60 days' ORDER BY m.starts_at LIMIT 500",
      [o.id],
    )
  ).rows;
  for (const m of matches) {
    const start = new Date(m.starts_at);
    lines.push(
      "BEGIN:VEVENT",
      `UID:match-${m.id}@pfm`,
      "DTSTAMP:" + stamp(new Date(m.created_at)),
      "DTSTART:" + stamp(start),
      "DTEND:" + stamp(new Date(start.getTime() + 2 * 3600000)),
      "SEQUENCE:" + m.version,
      "STATUS:" + (m.status === "cancelled" ? "CANCELLED" : "CONFIRMED"),
      "SUMMARY:" + escapeIcs(m.home ? `${m.team} - ${m.opponent}` : `${m.opponent} - ${m.team}`),
      "LOCATION:" + escapeIcs(m.venue ?? ""),
      "END:VEVENT",
    );
  }
  const events = (
    await db.query(
      "SELECT oe.token,oe.version,oe.status,e.id,e.title,e.starts_at,e.ends_at FROM open_event oe JOIN calendar_event e ON e.id=oe.event_id AND e.organization_id=oe.organization_id WHERE oe.organization_id=$1 AND e.starts_at>now()-interval '60 days' ORDER BY e.starts_at LIMIT 200",
      [o.id],
    )
  ).rows;
  for (const e of events)
    lines.push(
      "BEGIN:VEVENT",
      `UID:open-${e.id}@pfm`,
      "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(new Date(e.starts_at)),
      "DTEND:" + stamp(new Date(e.ends_at)),
      "SEQUENCE:" + e.version,
      "STATUS:" + (e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"),
      "SUMMARY:" + escapeIcs(e.title),
      "URL:" + `${baseUrl}/fr/evenement/${e.token}`,
      "END:VEVENT",
    );
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** The club's logo on its public page. */
export async function publicLogo(db: Pool, slug: string) {
  return (await db.query("SELECT l.media_type,l.content FROM organization_logo l JOIN organization o ON o.id=l.organization_id WHERE o.public_slug=$1 AND o.public_enabled", [slug])).rows[0] as { media_type: string; content: Buffer } | undefined;
}
