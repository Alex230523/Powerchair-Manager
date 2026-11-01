import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { execute, type Principal } from "../../src/domains/access/service";
import { integrationCommand, integrationsExecute, integrationsView, publicClub, publicIcs, publicTournament } from "../../src/domains/integrations/public";
import { apiAuth, apiMatches } from "../../src/domains/integrations/api";
import { emitWebhook, verifySignature, webhookTick } from "../../src/domains/integrations/webhooks";
import { tournamentExecute } from "../../src/domains/tournaments/service";
import { tournamentCommand } from "../../src/domains/tournaments/schema";
import { sweepDocuments } from "../../src/domains/documents/service";

/**
 * B6: an anonymous visitor sees no private data; a minor's name stays
 * hidden without consent; a tournament's page shows validated results and
 * marks a correction; the public calendar is revocable; an API key with its
 * scopes, its rate limit and its revocation; a webhook signed, retried,
 * replayed with the same id, never sent twice for one event; two clubs apart.
 */
const schema = "b6public_" + randomUUID().replaceAll("-", ""),
  root = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
let clubA: string, clubB: string, president: Principal, presidentB: Principal, ana: string, zoe: string, tournament: string, tMatch: string;

async function actor(org: string, role: string, name: string) {
  const userId = randomUUID(),
    sessionId = randomUUID();
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)', [userId, name, userId + "@example.test"]);
  await db.query("INSERT INTO person(user_id) VALUES($1)", [userId]);
  await db.query('INSERT INTO session(id,"userId",token,"expiresAt") VALUES($1,$2,$3,now()+interval \'1 day\')', [sessionId, userId, randomUUID()]);
  await db.query("INSERT INTO organization_membership(organization_id,user_id) VALUES($1,$2)", [org, userId]);
  const mandateId = (await db.query("INSERT INTO role_assignment(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id", [org, userId, role])).rows[0].id;
  const p = { userId, sessionId };
  await execute(db, p, { action: "context", mandateId });
  return p;
}
const run = (p: Principal, cmd: Record<string, unknown>, org = clubA) => integrationsExecute(db, p, integrationCommand.parse(cmd), org) as Promise<Record<string, unknown>>;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("db/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.query(await readFile("db/migrations/" + f, "utf8"));
  clubA = (await db.query("INSERT INTO organization(name,kind,city) VALUES('Tigerstorm','club','Wavre') RETURNING id")).rows[0].id;
  clubB = (await db.query("INSERT INTO organization(name,kind) VALUES('Lions','club') RETURNING id")).rows[0].id;
  president = await actor(clubA, "club_president", "Présidente");
  presidentB = await actor(clubB, "club_president", "Président B");
  const season = (await db.query("INSERT INTO season(organization_id,name,starts_on,ends_on) VALUES($1,'2026-27',CURRENT_DATE-60,CURRENT_DATE+240) RETURNING id", [clubA])).rows[0].id;
  const team = (await db.query("INSERT INTO team(organization_id,season_id,name) VALUES($1,$2,'Aigles') RETURNING id", [clubA, season])).rows[0].id;
  const person = async (name: string, birth: string) => {
    const p = (await db.query("INSERT INTO person DEFAULT VALUES RETURNING id")).rows[0].id;
    return (await db.query("INSERT INTO club_person(organization_id,person_id,full_name,birth_date,email,directory_roles) VALUES($1,$2,$3,$4,$5,'{player}') RETURNING id", [clubA, p, name, birth, name.split(" ")[0].toLowerCase() + "@private.test"])).rows[0].id as string;
  };
  ana = await person("Ana Peeters", "2012-03-01");
  zoe = await person("Zoe Martin", "1995-05-05");
  // A validated result with two scorers, and a match to come.
  const played = (
    await db.query("INSERT INTO match(organization_id,team_id,opponent,home,kind,competition,starts_at,status,our_score,their_score,validated_at,created_by) VALUES($1,$2,'Lions',true,'league','D1',now()-interval '3 days','played',2,1,now(),$3) RETURNING id", [
      clubA,
      team,
      president.userId,
    ])
  ).rows[0].id;
  for (const pid of [ana, zoe]) await db.query("INSERT INTO match_player(organization_id,match_id,profile_id,goals) VALUES($1,$2,$3,1)", [clubA, played, pid]);
  await db.query("INSERT INTO match(organization_id,team_id,opponent,home,kind,competition,starts_at,created_by) VALUES($1,$2,'Ours',false,'league','D1',now()+interval '5 days',$3)", [clubA, team, president.userId]);
  // Sponsors: one in a public package, one not.
  const shown = (await db.query("INSERT INTO partner_package(organization_id,name,public_visible,created_by) VALUES($1,'Or',true,$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  const hidden = (await db.query("INSERT INTO partner_package(organization_id,name,created_by) VALUES($1,'Discret',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  await db.query("INSERT INTO partner(organization_id,name,kind,status,package_id,created_by) VALUES($1,'Boulangerie Dupont','sponsor','active',$2,$3),($1,'Mécène Anonyme','sponsor','active',$4,$3)", [clubA, shown, president.userId, hidden]);
  // A tournament of club A with club B.
  tournament = (await db.query("INSERT INTO tournament(organization_id,name,year,format,created_by) VALUES($1,'Coupe de Wavre',2026,'league',$2) RETURNING id", [clubA, president.userId])).rows[0].id;
  for (const org of [clubA, clubB]) await db.query("INSERT INTO tournament_club(tournament_id,organization_id,status) VALUES($1,$2,'accepted')", [tournament, org]);
  const d = (await db.query("INSERT INTO tournament_day(tournament_id,label,day,venue) VALUES($1,'Journée 1',CURRENT_DATE-1,'Wavre') RETURNING id", [tournament])).rows[0].id;
  tMatch = (await db.query("INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,home_organization_id,away_organization_id) VALUES($1,$2,'10:00','league',$3,$4) RETURNING id", [tournament, d, clubA, clubB])).rows[0].id;
  await db.query("INSERT INTO tournament_match(tournament_id,day_id,kickoff,stage,home_organization_id,away_organization_id) VALUES($1,$2,'14:00','league',$4,$3)", [tournament, d, clubA, clubB]);
});
afterAll(async () => {
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

it("publishes nothing until asked, then no private data and no minor's name", async () => {
  expect(await publicClub(db, "tigerstorm")).toBeNull();
  await run(president, { action: "page", enabled: true, slug: "tigerstorm", intro: "Club de powerchair football à Wavre.", blocks: ["identity", "teams", "next_matches", "results", "standings", "sponsors"] });
  const page = (await publicClub(db, "tigerstorm"))!;
  expect(page).toMatchObject({ name: "Tigerstorm", city: "Wavre", teams: [{ name: "Aigles" }], sponsors: ["Boulangerie Dupont"] });
  expect(page.next.map((m) => m.opponent)).toEqual(["Ours"]);
  expect(page.results[0]).toMatchObject({ our_score: 2, their_score: 1 });
  expect(page.results[0].scorers.map((s) => s.name).sort()).toEqual([null, "Zoe Martin"].sort());
  const json = JSON.stringify(page);
  for (const secret of ["@private.test", "2012-03-01", "1995-05-05", "Ana", "Mécène"]) expect(json).not.toContain(secret);
  // The consent recorded by the club shows the minor's name; withdrawn, it goes.
  await run(president, { action: "consent", profileId: ana, consent: true });
  expect(JSON.stringify(await publicClub(db, "tigerstorm"))).toContain("Ana Peeters");
  await run(president, { action: "consent", profileId: ana, consent: false });
  expect(JSON.stringify(await publicClub(db, "tigerstorm"))).not.toContain("Ana");
  // Another club cannot take the same address.
  await expect(run(presidentB, { action: "page", enabled: true, slug: "tigerstorm", intro: "", blocks: [] }, clubB)).rejects.toMatchObject({ code: "SLUG_TAKEN" });
  await run(president, { action: "page", enabled: false, slug: "tigerstorm", intro: "", blocks: ["teams"] });
  expect(await publicClub(db, "tigerstorm")).toBeNull();
  await run(president, { action: "page", enabled: true, slug: "tigerstorm", intro: "", blocks: ["teams", "results", "standings"] });
});

it("shows a tournament's validated results only, and marks a correction", async () => {
  expect(await publicTournament(db, tournament)).toBeNull();
  await run(president, { action: "tournament", id: tournament, public: true });
  const before = (await publicTournament(db, tournament))!;
  expect(before.matches.map((m) => m.score)).toEqual([null, null]);
  const version = () => db.query("SELECT version FROM tournament_match WHERE id=$1", [tMatch]).then((r) => r.rows[0].version as number);
  const result = async (home: number) =>
    tournamentExecute(
      db,
      president,
      tournamentCommand.parse({ action: "result", id: tournament, matchId: tMatch, version: await version(), homeScore: home, awayScore: 0, homeShootout: null, awayShootout: null, stats: [{ profileId: ana, goals: home, assists: 0, yellowCards: 0, redCard: false }], validate: true }),
      clubA,
    );
  await result(1);
  const after = (await publicTournament(db, tournament))!;
  expect(after.matches.find((m) => m.id === tMatch)).toMatchObject({ score: { home: 1, away: 0 }, corrected_at: null });
  expect(after.tables[0].rows[0]).toMatchObject({ name: "Tigerstorm", points: 3 });
  // The scorer is a minor without consent: not listed.
  expect(after.scorers).toEqual([]);
  await result(2);
  const fixed = (await publicTournament(db, tournament))!.matches.find((m) => m.id === tMatch)!;
  expect(fixed.score).toMatchObject({ home: 2 });
  expect(fixed.corrected_at).not.toBeNull();
  expect((await publicClub(db, "tigerstorm"))!.standings.map((s) => s.name)).toEqual(["Coupe de Wavre"]);
});

it("serves a public calendar that can be revoked", async () => {
  const { token } = (await run(president, { action: "ics", enabled: true })) as { token: string };
  const ics = (await publicIcs(db, token, "https://app.example.test"))!;
  expect(ics).toContain("SUMMARY:Aigles - Lions");
  expect(ics).toContain("SUMMARY:Ours - Aigles");
  expect(ics).not.toMatch(/Ana|Zoe|private/);
  await run(president, { action: "ics", enabled: false });
  expect(await publicIcs(db, token, "https://app.example.test")).toBeNull();
});

it("gives the API what its key allows, at its rate, until it is revoked", async () => {
  const { key, id } = (await run(president, { action: "createKey", name: "Site du club", scopes: ["read:matches"] })) as { key: string; id: string };
  expect((await integrationsView(db, president)).keys[0]).toMatchObject({ name: "Site du club", scopes: ["read:matches"] });
  expect(JSON.stringify(await integrationsView(db, president))).not.toContain(key.slice(13));
  const auth = await apiAuth(db, `Bearer ${key}`, "read:matches");
  expect(auth.organization).toBe(clubA);
  const matches = await apiMatches(db, auth.organization, null, null);
  expect(matches.find((m) => m.result)?.result).toMatchObject({ ours: 2, theirs: 1 });
  expect(matches.find((m) => !m.result)?.opponent).toBe("Ours");
  expect(JSON.stringify(matches)).not.toContain("Ana");
  await expect(apiAuth(db, `Bearer ${key}`, "read:teams")).rejects.toMatchObject({ status: 403 });
  await expect(apiAuth(db, `Bearer ${key.slice(0, -2)}xx`, "read:matches")).rejects.toMatchObject({ status: 401 });
  await expect(apiAuth(db, null, "read:matches")).rejects.toMatchObject({ status: 401 });
  // Sixty a minute, then 429.
  await db.query("UPDATE api_rate SET count=60 WHERE key_id=$1", [id]);
  await expect(apiAuth(db, `Bearer ${key}`, "read:matches")).rejects.toMatchObject({ status: 429 });
  await db.query("DELETE FROM api_rate WHERE key_id=$1", [id]);
  await run(president, { action: "revokeKey", id });
  await expect(apiAuth(db, `Bearer ${key}`, "read:matches")).rejects.toMatchObject({ status: 401 });
  await expect(run(presidentB, { action: "revokeKey", id }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("signs, retries and replays a webhook, never twice for one event", async () => {
  await expect(run(president, { action: "createHook", url: "https://localhost/hook", events: ["document.expired"] })).rejects.toMatchObject({ code: "UNSAFE_URL" });
  const { secret } = (await run(president, { action: "createHook", url: "https://hooks.example.org/pfm", events: ["document.expired", "payment.reconciled"] })) as { secret: string };
  // A real event: a document expires (twice through the sweep, one delivery).
  await db.query("INSERT INTO club_document(organization_id,season_id,name,category,status,expires_on,profile_id) SELECT $1,id,'Certificat','licence','valid',CURRENT_DATE-1,$2 FROM season WHERE organization_id=$1", [clubA, zoe]);
  await sweepDocuments(db);
  await sweepDocuments(db);
  await emitWebhook(db, clubA, "match.validated", "not-subscribed", {});
  const deliveries = (await db.query("SELECT id,event FROM webhook_delivery WHERE organization_id=$1", [clubA])).rows;
  expect(deliveries.map((d) => d.event)).toEqual(["document.expired"]);
  const received: { id: string; body: string; headers: Record<string, string> }[] = [];
  let answer = 500;
  const post = async (_url: string, body: string, headers: Record<string, string>) => {
    received.push({ id: headers["X-PFM-Delivery"], body, headers });
    return answer;
  };
  await webhookTick(db, post);
  expect((await db.query("SELECT state,attempts,last_status FROM webhook_delivery WHERE id=$1", [deliveries[0].id])).rows[0]).toEqual({ state: "pending", attempts: 1, last_status: 500 });
  await db.query("UPDATE webhook_delivery SET next_at=now() WHERE id=$1", [deliveries[0].id]);
  answer = 200;
  await webhookTick(db, post);
  expect((await db.query("SELECT state FROM webhook_delivery WHERE id=$1", [deliveries[0].id])).rows[0].state).toBe("sent");
  const last = received.at(-1)!;
  expect(verifySignature(secret, last.headers["X-PFM-Timestamp"], last.body, last.headers["X-PFM-Signature"])).toBe(true);
  expect(JSON.parse(last.body)).toMatchObject({ id: deliveries[0].id, event: "document.expired", data: { category: "licence" } });
  expect(last.body).not.toContain("Certificat");
  // Replayed twice: the same delivery id each time.
  for (let i = 0; i < 2; i++) {
    await run(president, { action: "replay", id: deliveries[0].id });
    await webhookTick(db, post);
  }
  expect(received.map((r) => r.id)).toEqual(Array(4).fill(deliveries[0].id));
  await expect(run(presidentB, { action: "replay", id: deliveries[0].id }, clubB)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await integrationsView(db, presidentB)).hooks).toEqual([]);
});
