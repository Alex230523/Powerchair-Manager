import type { Pool, PoolClient } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError, audit, type Principal } from "../access/service";
import { inviteProfile } from "../access/invite";
import { canWrite, operatorScope } from "../console/service";
import { claimDiscount } from "../billing/service";
import { discountCode } from "../billing/schema";
import { brusselsToday } from "../people/service";
import { createTransport, type Transport } from "../notifications/transport";
import { escapeHtml } from "../../lib/html";
import { logEvent } from "../../lib/log";

/**
 * 12/11/2026: a club can use the platform without a federation. Its future
 * president fills in « Créer mon club » (no account yet), confirms his
 * address by the link he receives, and the platform's team reads the request
 * in the console: accepted, the club is created without a federation and its
 * president invited (30 days of trial, then 99 € a year, lowered by a
 * discount code when one was given); refused, he is told why. The answer to
 * the form is always the same: nobody learns from it whether an address is
 * known.
 */
export const openCountries = ["BE", "NL", "FR", "GB", "US"] as const;
export const trialDays = 30;
export const independentPlan = "club-independant";
const locales = ["fr", "nl", "en"] as const;
type Locale = (typeof locales)[number];

export const clubRequestSchema = z.object({
  clubName: z.string().trim().min(2).max(120),
  countryCode: z.enum(openCountries),
  city: z.string().trim().max(120).default(""),
  presidentName: z.string().trim().min(2).max(120),
  presidentEmail: z.email().max(254),
  message: z.string().trim().max(1000).default(""),
  discountCode: z.union([z.literal(""), discountCode]).default(""),
  locale: z.enum(locales).default("fr"),
  acceptTerms: z.literal(true),
  website: z.string().max(0).optional(), // honeypot
});
export type ClubRequestInput = z.infer<typeof clubRequestSchema>;
export const clubConfirmSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const clubRequestCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), id: z.uuid() }),
  z.object({ action: z.literal("refuse"), id: z.uuid(), reason: z.string().trim().min(3).max(500) }),
]);
export type ClubRequestCommand = z.infer<typeof clubRequestCommand>;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
type Env = Record<string, string | undefined>;
const base = (env: Env) => (env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");

/** The e-mails of this journey, in the requester's language. */
export const mails = {
  confirm: (l: Locale, club: string, url: string) =>
    ({
      fr: { subject: "Confirmez la demande de votre club", text: `Bonjour,\n\nVous avez demandé à ouvrir « ${club} » sur Powerchair Football Manager, sans fédération. Confirmez votre adresse pour envoyer la demande à l'équipe de la plateforme (lien valable 7 jours) :\n${url}\n\nSi vous n'avez rien demandé, ignorez ce message.` },
      nl: { subject: "Bevestig de aanvraag van uw club", text: `Hallo,\n\nU vroeg om « ${club} » te openen op Powerchair Football Manager, zonder federatie. Bevestig uw adres om de aanvraag naar het team van het platform te sturen (link 7 dagen geldig):\n${url}\n\nHeeft u niets gevraagd? Negeer dan dit bericht.` },
      en: { subject: "Confirm your club's request", text: `Hello,\n\nYou asked to open "${club}" on Powerchair Football Manager, without a federation. Confirm your address to send the request to the platform's team (link valid for 7 days):\n${url}\n\nIf you did not ask for anything, ignore this message.` },
    })[l],
  refused: (l: Locale, club: string, reason: string) =>
    ({
      fr: { subject: "Votre demande de club", text: `Bonjour,\n\nL'équipe de la plateforme n'a pas pu accepter « ${club} ». Sa réponse :\n${reason}\n\nVous pouvez répondre à ce message pour en parler.` },
      nl: { subject: "Uw aanvraag voor een club", text: `Hallo,\n\nHet team van het platform kon « ${club} » niet aanvaarden. Het antwoord:\n${reason}\n\nU kunt op dit bericht antwoorden om erover te praten.` },
      en: { subject: "Your club request", text: `Hello,\n\nThe platform's team could not accept "${club}". Its answer:\n${reason}\n\nYou can reply to this message to talk about it.` },
    })[l],
  operators: (club: string, country: string, url: string) => ({
    subject: `Nouvelle demande de club : ${club}`,
    text: `Une demande de club sans fédération attend votre décision : « ${club} » (${country}).\n\nConsole, onglet Organisations : ${url}`,
  }),
};

async function mail(transport: Transport, email: string, url: string, m: { subject: string; text: string }) {
  try {
    await transport.send(randomUUID(), { email, url, subject: m.subject, text: m.text, html: `<p>${escapeHtml(m.text).replace(/\n/g, "<br>")}</p>` });
    return true;
  } catch (e) {
    // The request is kept; the operator sees it in the console. Never the address in the logs.
    logEvent("error", "club_request.mail_failed", { code: e instanceof Error ? e.message.slice(0, 80) : "unknown" });
    return false;
  }
}
const transportOf = (env: Env) => createTransport(env, env.MAIL_ALLOW_EXTERNAL === "true");

/** The public form: a request, waiting for the address's confirmation. Same answer whatever happens. */
export async function requestClub(db: Pool, input: ClubRequestInput, env: Env = process.env, transport?: Transport) {
  if (input.website) return { ok: true as const };
  const email = input.presidentEmail.toLowerCase();
  const token = randomBytes(32).toString("hex");
  const c = await db.connect();
  let send = false;
  try {
    await c.query("BEGIN");
    const open = (await c.query("SELECT id,state,created_at>now()-interval '10 minutes' AS recent FROM club_request WHERE president_email=$1 AND state IN ('unconfirmed','pending') FOR UPDATE", [email])).rows[0] as { id: string; state: string; recent: boolean } | undefined;
    // Already waiting for the team, or a link sent minutes ago: nothing more is sent (the answer stays the same).
    if (open?.state === "pending" || open?.recent) {
      await c.query("COMMIT");
      return { ok: true as const };
    }
    const values = [input.clubName, input.countryCode, input.city, input.presidentName, email, input.message, input.discountCode, input.locale, hash(token)];
    if (open)
      await c.query("UPDATE club_request SET club_name=$1,country_code=$2,city=$3,president_name=$4,message=$6,discount_code=$7,locale=$8,token_hash=$9,created_at=now() WHERE id=$10 AND president_email=$5", [...values, open.id]);
    else await c.query("INSERT INTO club_request(club_name,country_code,city,president_name,president_email,message,discount_code,locale,token_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", values);
    await c.query("COMMIT");
    send = true;
  } catch (e) {
    await c.query("ROLLBACK");
    // The same address sent twice at once: one request is kept, the answer stays the same.
    if ((e as { code?: string }).code === "23505") return { ok: true as const };
    throw e;
  } finally {
    c.release();
  }
  if (send) {
    const url = `${base(env)}/${input.locale}/join/club?confirm=${token}`;
    await mail(transport ?? transportOf(env), email, url, mails.confirm(input.locale, input.clubName, url));
  }
  return { ok: true as const };
}

/** The link of the e-mail: the request goes to the platform's team. */
export async function confirmClub(db: Pool, token: string, env: Env = process.env, transport?: Transport) {
  const r = (
    await db.query(
      `UPDATE club_request SET state='pending',confirmed_at=now()
        WHERE token_hash=$1 AND state='unconfirmed' AND created_at>now()-interval '7 days'
        RETURNING club_name,country_code`,
      [hash(token)],
    )
  ).rows[0] as { club_name: string; country_code: string } | undefined;
  if (!r) {
    // Clicked twice: still waiting, or already decided. Same answer as the first time.
    const known = (await db.query("SELECT state FROM club_request WHERE token_hash=$1", [hash(token)])).rows[0] as { state: string } | undefined;
    if (known && known.state !== "unconfirmed") return { ok: true as const, state: "pending" as const };
    throw new AccessError("LINK_EXPIRED", 410);
  }
  // The team is told (owners and support, still in office).
  const to = (await db.query(`SELECT u.email FROM platform_operator po JOIN "user" u ON u.id=po.user_id WHERE po.revoked_at IS NULL AND po.role IN ('owner','support')`)).rows.map((x) => x.email as string);
  const t = transport ?? transportOf(env);
  for (const email of to) await mail(t, email, `${base(env)}/fr/console`, mails.operators(r.club_name, r.country_code, `${base(env)}/fr/console`));
  return { ok: true as const, state: "pending" as const };
}

export type ClubRequest = {
  id: string;
  club_name: string;
  country_code: string;
  city: string;
  president_name: string;
  president_email: string;
  message: string;
  discount_code: string;
  discount_usable: boolean;
  locale: Locale;
  state: "pending" | "approved" | "refused";
  confirmed_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_reason: string;
  organization_id: string | null;
};

/** The console's list: the requests waiting first, then the last decisions. */
export async function clubRequestsView(db: Pool, p: Principal) {
  return operatorScope(db, p, async (c, o) => {
    const rows = (
      await c.query(
        `SELECT r.id,r.club_name,r.country_code,r.city,r.president_name,r.president_email,r.message,r.discount_code,r.locale,r.state,r.confirmed_at,r.decided_at,u.name AS decided_by_name,r.decision_reason,r.organization_id,
                (r.discount_code<>'' AND EXISTS (SELECT 1 FROM billing_discount d WHERE d.code=r.discount_code AND d.active AND (d.valid_until IS NULL OR d.valid_until>=CURRENT_DATE) AND (d.max_uses IS NULL OR d.uses<d.max_uses))) AS discount_usable
           FROM club_request r LEFT JOIN "user" u ON u.id=r.decided_by
          WHERE r.state<>'unconfirmed' AND (r.state='pending' OR r.decided_at>now()-interval '90 days')
          ORDER BY (r.state='pending') DESC,COALESCE(r.decided_at,r.confirmed_at) DESC LIMIT 200`,
      )
    ).rows as ClubRequest[];
    return { requests: rows, canDecide: canWrite(o), trialDays, countries: openCountries };
  });
}

/** Accepts (the club, its president's invitation, the trial) or refuses (with the reason, sent to the requester). */
export async function clubRequestExecute(db: Pool, p: Principal, command: ClubRequestCommand, env: Env = process.env, transport?: Transport) {
  let refusal: { email: string; locale: Locale; club: string; reason: string } | null = null;
  const out = await operatorScope(db, p, async (c, o) => {
    if (!canWrite(o)) throw new AccessError("FORBIDDEN");
    const r = (await c.query("SELECT * FROM club_request WHERE id=$1 FOR UPDATE", [command.id])).rows[0] as (ClubRequest & { state: string }) | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    if (r.state !== "pending") throw new AccessError("REQUEST_DECIDED", 409);
    const log = (organizationId: string | null, kind: string, payload: Record<string, unknown>, reason = "") =>
      c.query("INSERT INTO platform_action(operator_id,organization_id,kind,reason,payload) VALUES($1,$2,$3,$4,$5)", [o.userId, organizationId, kind, reason, JSON.stringify(payload)]);
    if (command.action === "refuse") {
      await c.query("UPDATE club_request SET state='refused',decided_by=$2,decided_at=now(),decision_reason=$3 WHERE id=$1", [r.id, o.userId, command.reason]);
      await log(null, "club_request.refused", { id: r.id, club: r.club_name }, command.reason);
      refusal = { email: r.president_email, locale: r.locale, club: r.club_name, reason: command.reason };
      return { ok: true as const };
    }
    const club = (
      await c.query(
        // Without a federation; 21: it waits for its president's acceptance of the processing agreement.
        `INSERT INTO organization(name,kind,federation_id,city,country_code,contact_email,dpa_required) VALUES($1,'club',NULL,$2,$3,$4,true) RETURNING id`,
        [r.club_name, r.city, r.country_code, r.president_email],
      )
    ).rows[0].id as string;
    const today = brusselsToday();
    const plan = (await c.query("SELECT id FROM billing_plan WHERE code=$1", [independentPlan])).rows[0]?.id as string | undefined;
    if (!plan) throw new AccessError("PLAN_MISSING", 409);
    const trialEnds = (await c.query("SELECT ($1::date + $2::int)::text AS d", [today, trialDays])).rows[0].d as string;
    const subscription = (
      await c.query("INSERT INTO billing_subscription(organization_id,plan_id,started_on,note,created_by,trial_ends_on,auto_invoice) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id", [
        club,
        plan,
        today,
        "Club sans fédération",
        o.userId,
        trialEnds,
      ])
    ).rows[0].id as string;
    // The code of the request: applied when still usable, otherwise the club starts without it (the president can add one later).
    let discount: "none" | "applied" | "invalid" = "none";
    if (r.discount_code) {
      await c.query("SAVEPOINT discount");
      try {
        const d = await claimDiscount(c, r.discount_code);
        await c.query("UPDATE billing_subscription SET discount_id=$2,discount_cycles_left=$3 WHERE id=$1", [subscription, d.id, d.cycles]);
        await c.query("RELEASE SAVEPOINT discount");
        discount = "applied";
      } catch (e) {
        if (!(e instanceof AccessError)) throw e;
        await c.query("ROLLBACK TO SAVEPOINT discount");
        discount = "invalid";
      }
    }
    await inviteProfile(c, club, o.userId, { email: r.president_email, role: "club_president", profileId: null, greeting: r.president_name, issuedByPlatform: true });
    await c.query("UPDATE club_request SET state='approved',decided_by=$2,decided_at=now(),organization_id=$3 WHERE id=$1", [r.id, o.userId, club]);
    await log(club, "club_request.approved", { id: r.id, club: r.club_name, country: r.country_code, subscription, trialEnds, discount });
    await audit(c, club, o.userId, "club.created_by_platform", r.id, { trialEnds, discount });
    return { ok: true as const, organizationId: club, trialEnds, discount };
  });
  if (refusal) {
    const f = refusal as { email: string; locale: Locale; club: string; reason: string };
    await mail(transport ?? transportOf(env), f.email, base(env), mails.refused(f.locale, f.club, f.reason));
  }
  return out;
}

/** Daily: the requests never confirmed go after 7 days, the refused ones after a year (their personal data with them). */
export async function clubRequestTick(db: Pool | PoolClient) {
  const r = await db.query("DELETE FROM club_request WHERE (state='unconfirmed' AND created_at<now()-interval '7 days') OR (state='refused' AND decided_at<now()-interval '12 months')");
  return r.rowCount ?? 0;
}
