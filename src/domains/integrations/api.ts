import type { Pool } from "pg";
import { timingSafeEqual } from "node:crypto";
import { keyHash, publicName } from "./public";
import { brusselsToday } from "../people/service";

/**
 * B6: the read API (v1). A key of the club (« pfm_<prefix>_<secret> »,
 * only its hash kept) with its scopes; revoked, it stops at once; 60
 * requests a minute per key. Only what a public page could show: teams,
 * matches with validated results, the club's tournaments, its open events.
 */
export const RATE_PER_MINUTE = 60;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export async function apiAuth(db: Pool, header: string | null, scope: string) {
  const m = /^Bearer (pfm_([a-z0-9]{8})_[A-Za-z0-9_-]{40,50})$/.exec(header ?? "");
  if (!m) throw new ApiError(401, "API_KEY_INVALID");
  // Security (07/11/2026): a key lives as long as the presidency that created it, like the club's
  // Claude keys; a president who leaves takes his keys with him, the next one creates his own.
  const k = (
    await db.query(
      `SELECT k.id,k.organization_id,k.key_hash,k.scopes,k.revoked_at,o.suspended_at,
         EXISTS(SELECT 1 FROM role_assignment r JOIN organization_membership m ON m.organization_id=r.organization_id AND m.user_id=r.user_id JOIN "user" u ON u.id=r.user_id WHERE r.organization_id=k.organization_id AND r.user_id=k.created_by AND r.role='club_president' AND r.revoked_at IS NULL AND r.valid_from<=now() AND (r.valid_until IS NULL OR r.valid_until>now()) AND m.active AND u.active) AS presides
         FROM api_key k JOIN organization o ON o.id=k.organization_id WHERE k.prefix=$1`,
      [m[2]],
    )
  ).rows[0];
  const given = Buffer.from(keyHash(m[1])),
    stored = Buffer.from(k?.key_hash ?? "".padEnd(64, "0"));
  if (!k || k.revoked_at || given.length !== stored.length || !timingSafeEqual(given, stored)) throw new ApiError(401, "API_KEY_INVALID");
  if (!k.presides) throw new ApiError(403, "KEY_ORPHANED");
  if (k.suspended_at) throw new ApiError(403, "ORG_SUSPENDED");
  if (!(k.scopes as string[]).includes(scope)) throw new ApiError(403, "SCOPE_MISSING");
  const count = (
    await db.query(
      "INSERT INTO api_rate(key_id,window_start,count) VALUES($1,date_trunc('minute',now()),1) ON CONFLICT (key_id,window_start) DO UPDATE SET count=api_rate.count+1 RETURNING count,60-extract(second FROM now())::int AS reset",
      [k.id],
    )
  ).rows[0];
  if (count.count > RATE_PER_MINUTE) throw new ApiError(429, "RATE_LIMITED", Math.max(1, count.reset));
  await db.query("UPDATE api_key SET last_used_at=now() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<now()-interval '1 minute')", [k.id]);
  // Old counters go: only the current minute matters.
  if (Math.random() < 0.02) await db.query("DELETE FROM api_rate WHERE window_start<now()-interval '1 hour'");
  return { organization: k.organization_id as string, remaining: Math.max(0, RATE_PER_MINUTE - count.count) };
}

export async function apiTeams(db: Pool, org: string) {
  return (
    await db.query(
      "SELECT t.id,t.name,t.category,s.name AS season FROM team t JOIN season s ON s.id=t.season_id AND s.organization_id=t.organization_id WHERE t.organization_id=$1 AND NOT t.archived AND s.ends_on>=CURRENT_DATE-365 ORDER BY s.starts_on DESC,t.name",
      [org],
    )
  ).rows as { id: string; name: string; category: string | null; season: string }[];
}
export async function apiMatches(db: Pool, org: string, from: string | null, to: string | null) {
  const today = brusselsToday();
  const rows = (
    await db.query(
      `SELECT m.id,m.team_id,t.name AS team,m.opponent,m.home,m.kind,m.competition,m.starts_at,m.venue,m.status,m.validated_at,m.our_score,m.their_score
         FROM match m JOIN team t ON t.id=m.team_id AND t.organization_id=m.organization_id
        WHERE m.organization_id=$1 AND m.starts_at>=COALESCE($2::date,CURRENT_DATE-90) AND m.starts_at<COALESCE($3::date,CURRENT_DATE+365)+1 ORDER BY m.starts_at LIMIT 500`,
      [org, from, to],
    )
  ).rows;
  const out = [];
  for (const m of rows) {
    const validated = !!m.validated_at && m.our_score !== null;
    const scorers = validated
      ? (await db.query("SELECT c.full_name,c.birth_date::text AS birth_date,c.public_name_consent,mp.goals FROM match_player mp JOIN club_person c ON c.id=mp.profile_id WHERE mp.match_id=$1 AND mp.goals>0 ORDER BY mp.goals DESC", [m.id])).rows.map((r) => ({
          name: publicName(r.full_name, r.birth_date, r.public_name_consent, today),
          goals: r.goals as number,
        }))
      : [];
    out.push({
      id: m.id as string,
      team: { id: m.team_id as string, name: m.team as string },
      opponent: m.opponent as string,
      home: m.home as boolean,
      kind: m.kind as string,
      competition: m.competition as string,
      starts_at: new Date(m.starts_at).toISOString(),
      venue: m.venue as string,
      status: m.status as string,
      // Only a validated result is given.
      result: validated ? { ours: m.our_score as number, theirs: m.their_score as number, validated_at: new Date(m.validated_at).toISOString(), scorers } : null,
    });
  }
  return out;
}
export async function apiTournaments(db: Pool, org: string) {
  return (
    await db.query(
      `SELECT t.id,t.name,t.year,t.format,t.status,t.public_page,(t.organization_id=$1) AS organiser
         FROM tournament t WHERE t.organization_id=$1 OR EXISTS (SELECT 1 FROM tournament_club tc WHERE tc.tournament_id=t.id AND tc.organization_id=$1 AND tc.status='accepted') ORDER BY t.year DESC,t.name LIMIT 200`,
      [org],
    )
  ).rows as { id: string; name: string; year: number; format: string; status: string; public_page: boolean; organiser: boolean }[];
}
export async function apiEvents(db: Pool, org: string, baseUrl: string) {
  return (
    await db.query(
      `SELECT oe.id,oe.token,oe.status,oe.capacity,oe.fee_cents,oe.opens_at,oe.closes_at,e.title,e.starts_at,e.ends_at,
              (SELECT count(*)::int FROM open_registration r WHERE r.open_event_id=oe.id AND r.status IN ('confirmed','offered')) AS taken
         FROM open_event oe JOIN calendar_event e ON e.id=oe.event_id AND e.organization_id=oe.organization_id WHERE oe.organization_id=$1 AND e.ends_at>now()-interval '30 days' ORDER BY e.starts_at LIMIT 200`,
      [org],
    )
  ).rows.map((e) => ({
    id: e.id as string,
    title: e.title as string,
    status: e.status as string,
    starts_at: new Date(e.starts_at).toISOString(),
    ends_at: new Date(e.ends_at).toISOString(),
    registration: { opens_at: new Date(e.opens_at).toISOString(), closes_at: new Date(e.closes_at).toISOString(), url: `${baseUrl}/fr/evenement/${e.token}` },
    places_left: e.capacity === null ? null : Math.max(0, e.capacity - e.taken),
    fee_cents: e.fee_cents as number,
  }));
}

/** The OpenAPI 3.1 description of v1. */
export function openApi(baseUrl: string) {
  const list = (ref: string) => ({ type: "object", properties: { data: { type: "array", items: { $ref: `#/components/schemas/${ref}` } } } });
  const op = (summary: string, scope: string, ref: string, params: object[] = []) => ({
    get: {
      summary,
      security: [{ key: [scope] }],
      parameters: params,
      responses: {
        "200": { description: "OK", headers: { "X-RateLimit-Remaining": { schema: { type: "integer" } } }, content: { "application/json": { schema: list(ref) } } },
        "401": { description: "Key missing, invalid or revoked" },
        "403": { description: "Scope missing" },
        "429": { description: "More than 60 requests in the minute", headers: { "Retry-After": { schema: { type: "integer" } } } },
      },
    },
  });
  return {
    openapi: "3.1.0",
    info: { title: "Powerchair Football Manager API", version: "1.0.0", description: "Read-only. Authorization: Bearer pfm_<prefix>_<secret>. 60 requests per minute and per key. Only validated results; a minor's name only with the club's recorded consent." },
    servers: [{ url: `${baseUrl}/api/v1` }],
    components: {
      securitySchemes: { key: { type: "http", scheme: "bearer" } },
      schemas: {
        Team: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, category: { type: ["string", "null"] }, season: { type: "string" } } },
        Match: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            team: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
            opponent: { type: "string" },
            home: { type: "boolean" },
            kind: { type: "string" },
            competition: { type: "string" },
            starts_at: { type: "string", format: "date-time" },
            venue: { type: "string" },
            status: { type: "string" },
            result: {
              type: ["object", "null"],
              properties: { ours: { type: "integer" }, theirs: { type: "integer" }, validated_at: { type: "string", format: "date-time" }, scorers: { type: "array", items: { type: "object", properties: { name: { type: ["string", "null"] }, goals: { type: "integer" } } } } },
            },
          },
        },
        Tournament: { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, year: { type: "integer" }, format: { type: "string" }, status: { type: "string" }, public_page: { type: "boolean" }, organiser: { type: "boolean" } } },
        Event: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            status: { type: "string" },
            starts_at: { type: "string", format: "date-time" },
            ends_at: { type: "string", format: "date-time" },
            registration: { type: "object", properties: { opens_at: { type: "string" }, closes_at: { type: "string" }, url: { type: "string" } } },
            places_left: { type: ["integer", "null"] },
            fee_cents: { type: "integer" },
          },
        },
      },
    },
    paths: {
      "/teams": op("The club's teams", "read:teams", "Team"),
      "/matches": op("The club's matches, with validated results only", "read:matches", "Match", [
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ]),
      "/tournaments": op("Tournaments the club organises or plays", "read:tournaments", "Tournament"),
      "/events": op("The club's open events", "read:events", "Event"),
    },
  };
}
