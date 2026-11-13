import type { Pool, PoolClient } from "pg";
import { escapeLike } from "../../lib/sql";
import { limit } from "../../lib/rate-limit";
import { AccessError, account, active, audit, type Principal } from "../access/service";
import { pdfDocument, type PdfLine } from "../../lib/pdf";
import { publish } from "../notifications/queue";
import { notice, type NoticeText } from "../notifications/notice";
import { canWrite, operatorScope, presidencyOf } from "../console/service";
import { firstReplyMedianHours } from "./stats";
import { certificateNumber, type SupportCommand, type SupportOperatorCommand, type TicketCategory, type TicketPriority, type TicketState } from "./schema";

/**
 * Console, series C (06/11/2026): the support desk. A person writes to the
 * platform from the application; the operators answer from the console,
 * with canned replies, assign and close. The person is told of every
 * answer where they chose (application, mail, phone). A ticket's text is
 * data for the assistant, never an instruction. The platform also follows
 * the GDPR requests made to the clubs: a reminder to the presidency a week
 * before the deadline and once overdue, by hand from the console too.
 */
type Locale = "fr" | "nl" | "en";
const localeOf = (l: string | null | undefined): Locale => (l === "nl" || l === "en" ? l : "fr");
const words = {
  answered: {
    fr: { title: "Le support vous a répondu", message: "Votre demande « {subject} » a une réponse." },
    nl: { title: "De ondersteuning heeft geantwoord", message: "Uw verzoek « {subject} » heeft een antwoord." },
    en: { title: "Support has answered", message: "Your request \"{subject}\" has an answer." },
  },
  closed: {
    fr: { title: "Votre demande au support est close", message: "La demande « {subject} » est close. Répondez pour la rouvrir." },
    nl: { title: "Uw verzoek aan de ondersteuning is gesloten", message: "Het verzoek « {subject} » is gesloten. Antwoord om het te heropenen." },
    en: { title: "Your support request is closed", message: "The request \"{subject}\" is closed. Reply to reopen it." },
  },
};
const privacyWords: Record<"week" | "overdue" | "manual", NoticeText> = {
  week: {
    fr: { title: "Demande RGPD : sept jours restants", message: "Une demande d'accès, de rectification ou d'effacement attend votre réponse depuis plus de trois semaines ; le délai légal d'un mois expire dans sept jours." },
    nl: { title: "AVG-verzoek: nog zeven dagen", message: "Een verzoek tot inzage, verbetering of verwijdering wacht al meer dan drie weken op uw antwoord; de wettelijke termijn van een maand verstrijkt over zeven dagen." },
    en: { title: "GDPR request: seven days left", message: "A request for access, rectification or erasure has been waiting for your answer for over three weeks; the legal month ends in seven days." },
  },
  overdue: {
    fr: { title: "Demande RGPD hors délai", message: "Le délai légal d'un mois d'une demande d'accès, de rectification ou d'effacement est dépassé. Répondez sans attendre : la personne peut saisir l'Autorité de protection des données." },
    nl: { title: "AVG-verzoek buiten de termijn", message: "De wettelijke termijn van een maand voor een verzoek tot inzage, verbetering of verwijdering is verstreken. Antwoord zonder uitstel: de persoon kan naar de Gegevensbeschermingsautoriteit stappen." },
    en: { title: "GDPR request overdue", message: "The legal month for a request for access, rectification or erasure has passed. Answer without delay: the person may turn to the Data Protection Authority." },
  },
  manual: {
    fr: { title: "Rappel de la plateforme : une demande RGPD attend", message: "L'exploitant de la plateforme vous rappelle une demande d'accès, de rectification ou d'effacement encore sans réponse. Le délai légal est d'un mois." },
    nl: { title: "Herinnering van het platform: een AVG-verzoek wacht", message: "De beheerder van het platform herinnert u aan een verzoek tot inzage, verbetering of verwijdering dat nog geen antwoord heeft. De wettelijke termijn is een maand." },
    en: { title: "Reminder from the platform: a GDPR request is waiting", message: "The platform's operator reminds you of a request for access, rectification or erasure still unanswered. The legal deadline is one month." },
  },
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export type Ticket = { id: string; organization_id: string | null; organization: string | null; category: TicketCategory; subject: string; state: TicketState; priority: TicketPriority; created_at: string; last_message_at: string; closed_at: string | null; first_reply_at: string | null; messages: number };
export type Message = { id: string; author: string; by_operator: boolean; text: string; created_at: string };
const ticketSql = `SELECT t.id,t.organization_id,o.name AS organization,t.category,t.subject,t.state,t.priority,t.created_at,t.last_message_at,t.closed_at,t.first_reply_at,
  (SELECT count(*)::int FROM support_message m WHERE m.ticket_id=t.id) AS messages FROM support_ticket t LEFT JOIN organization o ON o.id=t.organization_id`;
async function messagesOf(c: PoolClient, id: string) {
  return (await c.query('SELECT m.id,u.name AS author,m.by_operator,m.text,m.created_at FROM support_message m JOIN "user" u ON u.id=m.author_id WHERE m.ticket_id=$1 ORDER BY m.created_at', [id])).rows as Message[];
}

/* ------------------------------------------------------------ The person's side */
export async function supportView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    await account(c, p);
    const tickets = (await c.query(`${ticketSql} WHERE t.user_id=$1 ORDER BY t.last_message_at DESC LIMIT 50`, [p.userId])).rows as Ticket[];
    const threads: Record<string, Message[]> = {};
    for (const t of tickets) threads[t.id] = await messagesOf(c, t.id);
    let organization: string | null = null;
    try {
      organization = (await active(c, p)).organization_name;
    } catch {
      organization = null;
    }
    return { tickets, threads, organization };
  } finally {
    c.release();
  }
}
export async function supportExecute(db: Pool, p: Principal, command: SupportCommand) {
  // Security (07/11/2026): a ticket or a message reaches the operators by e-mail; counted per account.
  if (command.action === "open" || command.action === "reply") await limit(db, "user-support", p.userId);
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await account(c, p);
    if (command.action === "open") {
      // Twenty open tickets at most per person: a loop or a bot stops there.
      const open = (await c.query("SELECT count(*)::int AS n FROM support_ticket WHERE user_id=$1 AND state<>'closed'", [p.userId])).rows[0].n as number;
      if (open >= 20) throw new AccessError("TOO_MANY", 429);
      let org: string | null = null;
      try {
        org = (await active(c, p)).organization_id as string;
      } catch {
        org = null;
      }
      const id = (await c.query("INSERT INTO support_ticket(organization_id,user_id,category,subject) VALUES($1,$2,$3,$4) RETURNING id", [org, p.userId, command.category, command.subject])).rows[0].id as string;
      await c.query("INSERT INTO support_message(ticket_id,author_id,by_operator,text) VALUES($1,$2,false,$3)", [id, p.userId, command.text]);
      await c.query("COMMIT");
      return { ok: true as const, id };
    }
    const t = (await c.query("SELECT id,state FROM support_ticket WHERE id=$1 AND user_id=$2 FOR UPDATE", [command.id, p.userId])).rows[0] as { id: string; state: TicketState } | undefined;
    if (!t) throw new AccessError("NOT_FOUND", 404);
    if (command.action === "reply") {
      // A reply reopens a closed ticket; the operators are asked again.
      await c.query("INSERT INTO support_message(ticket_id,author_id,by_operator,text) VALUES($1,$2,false,$3)", [t.id, p.userId, command.text]);
      await c.query("UPDATE support_ticket SET state='open',closed_at=NULL,last_message_at=now() WHERE id=$1", [t.id]);
    } else {
      if (t.state === "closed") throw new AccessError("TICKET_STATE", 409);
      await c.query("UPDATE support_ticket SET state='closed',closed_at=now() WHERE id=$1", [t.id]);
    }
    await c.query("COMMIT");
    return { ok: true as const };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/* ------------------------------------------------------------ The console */
export type ConsoleTicket = Ticket & { requester: string; email: string; assigned: string | null; assigned_to: string | null };
const consoleTicketSql = `SELECT t.id,t.organization_id,o.name AS organization,t.category,t.subject,t.state,t.priority,t.created_at,t.last_message_at,t.closed_at,t.first_reply_at,t.assigned_to,
  u.name AS requester,u.email,a.name AS assigned,(SELECT count(*)::int FROM support_message m WHERE m.ticket_id=t.id) AS messages
  FROM support_ticket t JOIN "user" u ON u.id=t.user_id LEFT JOIN organization o ON o.id=t.organization_id LEFT JOIN "user" a ON a.id=t.assigned_to`;
export type Template = { id: string; name: string; text_fr: string; text_nl: string; text_en: string; created_at: string };
export async function consoleSupport(db: Pool, p: Principal, raw: { state?: string; q?: string } = {}) {
  return operatorScope(db, p, async (c, o) => {
    const state = (["open", "answered", "closed"] as string[]).includes(raw.state ?? "") ? raw.state : "";
    const q = (raw.q ?? "").trim().slice(0, 80);
    const where = "($1='' AND t.state<>'closed' OR t.state=$1) AND ($2='' OR t.subject ILIKE '%'||$2||'%' OR u.name ILIKE '%'||$2||'%' OR o.name ILIKE '%'||$2||'%')";
    const tickets = (await c.query(`${consoleTicketSql} WHERE ${where} ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,t.last_message_at DESC LIMIT 100`, [state || "", escapeLike(q)])).rows as ConsoleTicket[];
    const counts = Object.fromEntries(((await c.query("SELECT state,count(*)::int AS n FROM support_ticket GROUP BY state")).rows as { state: TicketState; n: number }[]).map((r) => [r.state, r.n])) as Partial<Record<TicketState, number>>;
    const templates = (await c.query("SELECT id,name,text_fr,text_nl,text_en,created_at FROM support_template WHERE archived_at IS NULL ORDER BY name")).rows as Template[];
    const privacy = (
      await c.query(
        `SELECT d.id,d.kind,d.status,d.due_on::text AS due_on,d.created_at,(d.due_on-CURRENT_DATE)::int AS days_left,o.id AS organization_id,o.name AS organization,
           (SELECT count(*)::int FROM data_request_notice n WHERE n.request_id=d.id) AS notices,(SELECT max(sent_at) FROM data_request_notice n WHERE n.request_id=d.id) AS last_notice
           FROM data_request d JOIN organization o ON o.id=d.organization_id WHERE d.status IN ('received','in_progress') ORDER BY d.due_on LIMIT 100`,
      )
    ).rows as { id: string; kind: string; status: string; due_on: string; created_at: string; days_left: number; organization_id: string; organization: string; notices: number; last_notice: string | null }[];
    const certificates = (await c.query("SELECT count(*)::int AS n FROM data_request WHERE certificate_number IS NOT NULL AND handled_at>now()-interval '30 days'")).rows[0].n as number;
    return { tickets, counts: { open: counts.open ?? 0, answered: counts.answered ?? 0, closed: counts.closed ?? 0 }, firstReplyHours: await firstReplyMedianHours(c), templates, privacy, certificates, canWrite: canWrite(o), me: o.userId };
  });
}
export async function consoleTicket(db: Pool, p: Principal, id: string) {
  return operatorScope(db, p, async (c, o) => {
    const t = (await c.query(`${consoleTicketSql} WHERE t.id=$1`, [id])).rows[0] as ConsoleTicket | undefined;
    if (!t) throw new AccessError("NOT_FOUND", 404);
    const log = (await c.query('SELECT a.kind,a.created_at,u.name AS operator FROM platform_action a JOIN "user" u ON u.id=a.operator_id WHERE a.payload->>\'ticketId\'=$1 ORDER BY a.created_at DESC LIMIT 30', [id])).rows as { kind: string; created_at: string; operator: string }[];
    return { ticket: t, messages: await messagesOf(c, id), log, canWrite: canWrite(o), me: o.userId };
  });
}
async function tellRequester(c: PoolClient, ticket: { id: string; organization_id: string | null; subject: string; user_id: string }, key: "answered" | "closed", messageId: string) {
  const u = (await c.query('SELECT u.id,u.email,u.name,pe.locale FROM "user" u LEFT JOIN person pe ON pe.user_id=u.id WHERE u.id=$1 AND u.active', [ticket.user_id])).rows[0] as { id: string; email: string; name: string; locale: string | null } | undefined;
  if (!u?.email) return 0;
  const locale = localeOf(u.locale);
  const org = ticket.organization_id ? ((await c.query("SELECT name FROM organization WHERE id=$1", [ticket.organization_id])).rows[0]?.name as string) : "";
  await publish(c, {
    organizationId: ticket.organization_id,
    userId: u.id,
    email: u.email,
    kind: "automation",
    category: "administrative",
    resourceType: "automation",
    resourceId: `support:${ticket.id}`,
    eventKey: `support:${ticket.id}:${messageId}`,
    locale,
    variables: { name: u.name, organization: org, url: `${process.env.BETTER_AUTH_URL ?? ""}/${locale}/support`, title: words[key][locale].title, message: fill(words[key][locale].message, { subject: ticket.subject }) },
  });
  return 1;
}
export async function supportOperatorExecute(db: Pool, p: Principal, command: SupportOperatorCommand) {
  return operatorScope(db, p, async (c, o) => {
    if (!canWrite(o)) throw new AccessError("FORBIDDEN");
    const journal = (kind: string, organization: string | null, payload: Record<string, unknown>, reason = "") =>
      c.query("INSERT INTO platform_action(operator_id,organization_id,kind,reason,payload) VALUES($1,$2,$3,$4,$5)", [o.userId, organization, kind, reason, JSON.stringify(payload)]);
    if (command.action === "template") {
      if (command.id) {
        const r = await c.query("UPDATE support_template SET name=$2,text_fr=$3,text_nl=$4,text_en=$5 WHERE id=$1 AND archived_at IS NULL RETURNING id", [command.id, command.name, command.fr, command.nl, command.en]);
        if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
        return { ok: true as const, id: command.id };
      }
      const id = (await c.query("INSERT INTO support_template(name,text_fr,text_nl,text_en,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id", [command.name, command.fr, command.nl, command.en, o.userId])).rows[0].id as string;
      return { ok: true as const, id };
    }
    if (command.action === "archiveTemplate") {
      const r = await c.query("UPDATE support_template SET archived_at=now() WHERE id=$1 AND archived_at IS NULL RETURNING id", [command.id]);
      if (!r.rowCount) throw new AccessError("NOT_FOUND", 404);
      return { ok: true as const };
    }
    if (command.action === "privacyRemind") {
      const d = (await c.query("SELECT d.id,d.organization_id,d.status FROM data_request d WHERE d.id=$1 FOR UPDATE", [command.requestId])).rows[0] as { id: string; organization_id: string; status: string } | undefined;
      if (!d) throw new AccessError("NOT_FOUND", 404);
      if (!["received", "in_progress"].includes(d.status)) throw new AccessError("REQUEST_STATE", 409);
      const recipients = await notice(c, d.organization_id, await presidencyOf(c, d.organization_id), privacyWords.manual, "/settings/journals#security", `privacy:${d.id}:manual:${Date.now()}`, "administrative");
      await c.query("INSERT INTO data_request_notice(request_id,step,operator_id,recipients) VALUES($1,'manual',$2,$3)", [d.id, o.userId, recipients]);
      await journal("privacy.remind", d.organization_id, { requestId: d.id, recipients });
      await audit(c, d.organization_id, o.userId, "platform.privacy_remind", d.id);
      return { ok: true as const, recipients };
    }
    const t = (await c.query("SELECT id,organization_id,subject,state,user_id,first_reply_at,assigned_to FROM support_ticket WHERE id=$1 FOR UPDATE", [command.id])).rows[0] as
      | { id: string; organization_id: string | null; subject: string; state: TicketState; user_id: string; first_reply_at: string | null; assigned_to: string | null }
      | undefined;
    if (!t) throw new AccessError("NOT_FOUND", 404);
    switch (command.action) {
      case "reply": {
        const m = (await c.query("INSERT INTO support_message(ticket_id,author_id,by_operator,text) VALUES($1,$2,true,$3) RETURNING id", [t.id, o.userId, command.text])).rows[0].id as string;
        await c.query("UPDATE support_ticket SET state=$2,closed_at=CASE WHEN $2='closed' THEN now() END,last_message_at=now(),first_reply_at=COALESCE(first_reply_at,now()),assigned_to=COALESCE(assigned_to,$3) WHERE id=$1", [t.id, command.close ? "closed" : "answered", o.userId]);
        const told = await tellRequester(c, t, command.close ? "closed" : "answered", m);
        await journal(command.close ? "ticket.close" : "ticket.reply", t.organization_id, { ticketId: t.id, told });
        return { ok: true as const, told };
      }
      case "assign":
        await c.query("UPDATE support_ticket SET assigned_to=$2 WHERE id=$1", [t.id, command.toMe ? o.userId : null]);
        await journal("ticket.assign", t.organization_id, { ticketId: t.id, toMe: command.toMe });
        return { ok: true as const };
      case "priority":
        await c.query("UPDATE support_ticket SET priority=$2 WHERE id=$1", [t.id, command.priority]);
        await journal("ticket.priority", t.organization_id, { ticketId: t.id, priority: command.priority });
        return { ok: true as const };
      case "close": {
        if (t.state === "closed") throw new AccessError("TICKET_STATE", 409);
        await c.query("UPDATE support_ticket SET state='closed',closed_at=now() WHERE id=$1", [t.id]);
        const told = await tellRequester(c, t, "closed", `close:${Date.now()}`);
        await journal("ticket.close", t.organization_id, { ticketId: t.id, told });
        return { ok: true as const, told };
      }
      case "reopen":
        if (t.state !== "closed") throw new AccessError("TICKET_STATE", 409);
        await c.query("UPDATE support_ticket SET state='open',closed_at=NULL WHERE id=$1", [t.id]);
        await journal("ticket.reopen", t.organization_id, { ticketId: t.id });
        return { ok: true as const };
    }
  });
}

/* ------------------------------------------------------------ The GDPR requests, followed by the platform */
/** Hourly: a week before the deadline and once overdue, the presidency is reminded (each once per request). */
export async function privacyTick(db: Pool) {
  const c = await db.connect();
  let sent = 0;
  try {
    const due = (
      await c.query(
        `SELECT d.id,d.organization_id,CASE WHEN d.due_on<CURRENT_DATE THEN 'overdue' ELSE 'week' END AS step FROM data_request d
           WHERE d.status IN ('received','in_progress') AND d.due_on<=CURRENT_DATE+7
             AND NOT EXISTS(SELECT 1 FROM data_request_notice n WHERE n.request_id=d.id AND n.step=CASE WHEN d.due_on<CURRENT_DATE THEN 'overdue' ELSE 'week' END) ORDER BY d.due_on`,
      )
    ).rows as { id: string; organization_id: string; step: "week" | "overdue" }[];
    for (const d of due) {
      await c.query("BEGIN");
      try {
        const recipients = await notice(c, d.organization_id, await presidencyOf(c, d.organization_id), privacyWords[d.step], "/settings/journals#security", `privacy:${d.id}:${d.step}`, "administrative");
        await c.query("INSERT INTO data_request_notice(request_id,step,recipients) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [d.id, d.step, recipients]);
        await c.query("COMMIT");
        sent++;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    c.release();
  }
  return sent;
}

/* ------------------------------------------------------------ The certificate of a request handled */
/** Called by the club when it answers (done or refused): the number, once. */
export async function numberCertificate(c: PoolClient, requestId: string) {
  const r = (await c.query("SELECT certificate_number,handled_at FROM data_request WHERE id=$1 FOR UPDATE", [requestId])).rows[0] as { certificate_number: string | null; handled_at: string | null } | undefined;
  if (!r || r.certificate_number) return r?.certificate_number ?? null;
  const year = Number((await c.query("SELECT EXTRACT(YEAR FROM now())::int AS y")).rows[0].y);
  await c.query("SELECT pg_advisory_xact_lock(hashtext('data_request_certificate'))");
  const seq = ((await c.query("SELECT count(*)::int AS n FROM data_request WHERE certificate_number LIKE $1", [`RGPD-${year}-%`])).rows[0].n as number) + 1;
  const number = certificateNumber(year, seq);
  await c.query("UPDATE data_request SET certificate_number=$2 WHERE id=$1", [requestId, number]);
  return number;
}
const kindWords: Record<string, string> = { access: "accès aux données", rectification: "rectification des données", erasure: "effacement des données" };
const statusWords: Record<string, string> = { done: "traitée", refused: "refusée" };
const frDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export function certificateLines(r: { certificate_number: string; kind: string; status: string; created_at: string; handled_at: string; due_on: string; response: string; organization: string; requester: string; handler: string }): PdfLine[] {
  return [
    { text: "Attestation de traitement d'une demande relative aux données personnelles", size: 15, bold: true, gap: 10 },
    { text: `Numéro : ${r.certificate_number}`, bold: true },
    { text: `Responsable du traitement : ${r.organization}`, gap: 8 },
    { text: `Demandeur : ${r.requester}` },
    { text: `Objet : ${kindWords[r.kind] ?? r.kind} (articles 15 à 17 du RGPD)` },
    { text: `Reçue le ${frDay(r.created_at.slice(0, 10))} ; délai légal au ${frDay(r.due_on)}` },
    { text: `${r.status === "refused" ? "Refusée" : "Traitée"} le ${frDay(r.handled_at.slice(0, 10))} par ${r.handler}`, gap: 8 },
    { text: "Réponse donnée :", bold: true },
    { text: r.response || "(sans texte)", gap: 10 },
    { text: `Cette attestation certifie que la demande a été ${statusWords[r.status] ?? r.status} dans l'application Powerchair Football Manager, qui en garde la trace dans le journal de l'organisation. Elle est délivrée à la personne et à la présidence.`, size: 9 },
  ];
}
/** The PDF, for the person who asked and for the presidency of the club that answered. */
export async function dataRequestCertificate(db: Pool, p: Principal, id: string) {
  const c = await db.connect();
  try {
    await account(c, p);
    const r = (
      await c.query(
        `SELECT d.id,d.certificate_number,d.kind,d.status,to_char(d.created_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD') AS created_at,to_char(d.handled_at AT TIME ZONE 'Europe/Brussels','YYYY-MM-DD') AS handled_at,d.due_on::text AS due_on,d.response,d.organization_id,d.requester_id,o.name AS organization,u.name AS requester,COALESCE(h.name,'la présidence') AS handler
           FROM data_request d JOIN organization o ON o.id=d.organization_id JOIN "user" u ON u.id=d.requester_id LEFT JOIN "user" h ON h.id=d.handled_by WHERE d.id=$1 AND d.certificate_number IS NOT NULL`,
        [id],
      )
    ).rows[0] as (Parameters<typeof certificateLines>[0] & { id: string; organization_id: string; requester_id: string }) | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    let allowed = r.requester_id === p.userId;
    if (!allowed) {
      try {
        const a = await active(c, p);
        allowed = a.organization_id === r.organization_id && a.role === "club_president";
      } catch {
        allowed = false;
      }
    }
    if (!allowed) throw new AccessError("NOT_FOUND", 404);
    return { number: r.certificate_number, pdf: pdfDocument(certificateLines(r), `Attestation ${r.certificate_number}`, { footer: [{ text: `Powerchair Football Manager · ${r.certificate_number}`, size: 8 }] }) };
  } finally {
    c.release();
  }
}
