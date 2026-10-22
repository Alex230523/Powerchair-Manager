import { z } from "zod";

/**
 * Wave 11: the club's contact book, grant applications (subsides) and
 * partners (sponsors, donors, patrons, foundations). Grants and partners are
 * money matters (dues.read to see, dues.manage to change); the contact book
 * is open to the staff and edited by those who manage people or mails.
 */
const text = (n: number) => z.string().trim().max(n);
const day = z.iso.date().nullable().optional();
const cents = z.number().int().min(0).max(100000000);

export const contactTags = [
  "sponsor",
  "donor",
  "public",
  "federation",
  "venue",
  "press",
  "supplier",
  "medical",
  "volunteer",
  "other",
] as const;
export type ContactTag = (typeof contactTags)[number];
/** The contact book's commands live in crm/schema (A4). */

export const grantStatuses = ["idea", "submitted", "granted", "refused", "paid", "closed"] as const;
export type GrantStatus = (typeof grantStatuses)[number];
export const partnerKinds = ["sponsor", "donor", "patron", "foundation"] as const;
export const partnerStatuses = ["prospect", "active", "ended"] as const;

const newContact = z.object({
  fullName: text(120).min(2),
  organizationName: text(160),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: text(40),
});
/** A condition (offer) of a package: "Logo on the jerseys", "3 posts", due some days after signing. */
const packageCondition = z.object({
  id: z.uuid().optional(),
  title: text(160).min(2),
  description: text(1000),
  quantity: text(80),
  offsetDays: z.number().int().min(0).max(730).nullable(),
});
/** A proof is a web link (or a file, uploaded on its own route). */
const proofUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]);
export type TaskStatus = "todo" | "doing" | "done";

export const fundingCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    id: z.uuid().optional(),
    seasonId: z.uuid().nullable().optional(),
    funder: text(160).min(2),
    program: text(160),
    purpose: text(2000),
    requestedCents: cents,
    grantedCents: cents.nullable().optional(),
    status: z.enum(grantStatuses),
    deadlineOn: day,
    submittedOn: day,
    decisionOn: day,
    paidOn: day,
    reportDueOn: day,
    contactId: z.uuid().nullable().optional(),
    notes: text(4000),
    /** Wave 15 (C2): the funder chosen in the list (otherwise found or created from its name). Absent fields keep their value. */
    funderId: z.uuid().nullable().optional(),
    programUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]).optional(),
    conditions: text(4000).optional(),
    explanation: text(4000).optional(),
    endsOn: day,
    recheckOn: day,
    /** A2: the date the call opens and the start of the period covered. */
    opensOn: day,
    startsOn: day,
  }),
  z.object({ action: z.literal("deleteGrant"), id: z.uuid() }),
  /** A2: money received for a grant, one line per instalment. */
  z.object({ action: z.literal("grantPayment"), grantId: z.uuid(), receivedOn: z.iso.date(), amountCents: cents.refine((n) => n > 0), note: text(200) }),
  z.object({ action: z.literal("deleteGrantPayment"), id: z.uuid() }),
  z.object({
    action: z.literal("funder"),
    id: z.uuid(),
    name: text(160).min(2),
    website: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(300)]),
    email: z.union([z.literal(""), z.email().max(200)]),
    phone: text(40),
    address: text(300),
    notes: text(2000),
    contactId: z.uuid().nullable(),
  }),
  /** The usual check-list of a grant file, added to its tasks (titles in the user's language). */
  z.object({ action: z.literal("grantChecklist"), grantId: z.uuid(), locale: z.enum(["fr", "nl", "en"]) }),
  /** Next year's application: same funder, programme, texts and check-list (unticked, one year later). */
  z.object({ action: z.literal("nextYear"), grantId: z.uuid() }),
  /** Equipment financed by the grant, with its purchase value. */
  z.object({
    action: z.literal("grantChairs"),
    grantId: z.uuid(),
    chairs: z.array(z.object({ id: z.uuid(), purchaseValueCents: cents.nullable() })).max(100),
  }),
  z.object({
    action: z.literal("partner"),
    id: z.uuid().optional(),
    name: text(160).min(2),
    kind: z.enum(partnerKinds),
    status: z.enum(partnerStatuses),
    amountCents: cents,
    inKind: text(400),
    counterpart: text(400),
    startsOn: day,
    endsOn: day,
    nextActionOn: day,
    nextAction: text(200),
    contactId: z.uuid().nullable().optional(),
    notes: text(4000),
    /** Wave 15 (C1): the package chosen, with its dates. Absent fields keep their value. */
    packageId: z.uuid().nullable().optional(),
    signedOn: day,
    paymentDueOn: day,
    paidOn: day,
    renewalOn: day,
    /** A new contact written in the same window (contact book rights needed). */
    newContact: newContact.optional(),
    /** Write the payment in the ledger (sponsor income) when it is marked as received. */
    recordPayment: z.boolean().optional(),
    /** A2: the person of the club in charge, and the last contact. Absent keeps the value. */
    responsibleId: z.uuid().nullable().optional(),
    lastContactOn: day,
  }),
  /** A2: « Contact pris aujourd'hui ». */
  z.object({ action: z.literal("partnerContacted"), id: z.uuid() }),
  z.object({ action: z.literal("deletePartner"), id: z.uuid() }),
  z.object({
    action: z.literal("package"),
    id: z.uuid().optional(),
    seasonId: z.uuid().nullable(),
    name: text(120).min(2),
    amountCents: cents,
    description: text(2000),
    places: z.number().int().min(1).max(1000).nullable(),
    featured: z.boolean(),
    conditions: z.array(packageCondition).max(30),
  }),
  z.object({ action: z.literal("archivePackage"), id: z.uuid(), archived: z.boolean() }),
  z.object({ action: z.literal("duplicatePackage"), id: z.uuid(), seasonId: z.uuid().nullable() }),
  z.object({ action: z.literal("importPackages"), seasonId: z.uuid().nullable(), locale: z.enum(["fr", "nl", "en"]) }),
  z.object({
    action: z.literal("task"),
    id: z.uuid().optional(),
    partnerId: z.uuid().optional(),
    grantId: z.uuid().optional(),
    title: text(200).min(2),
    detail: text(2000),
    dueOn: day,
    responsibleId: z.uuid().nullable().optional(),
    proofUrl: proofUrl.optional(),
  }),
  z.object({ action: z.literal("taskDone"), id: z.uuid(), done: z.boolean(), doneOn: day }),
  z.object({ action: z.literal("deleteTask"), id: z.uuid() }),
  z.object({ action: z.literal("removeProof"), id: z.uuid() }),
  z.object({ action: z.literal("partnerReport"), partnerId: z.uuid(), public: z.boolean() }),
]);
export type FundingCommand = z.infer<typeof fundingCommand>;

/** What a grant row needs next, for the list and the home agenda. */
export function grantNext(g: {
  status: GrantStatus;
  deadline_on: string | null;
  report_due_on: string | null;
}): { kind: "deadline" | "report"; date: string } | null {
  if (g.status === "idea" && g.deadline_on) return { kind: "deadline", date: g.deadline_on };
  if ((g.status === "granted" || g.status === "paid") && g.report_due_on)
    return { kind: "report", date: g.report_due_on };
  return null;
}
/** The next date of a partner: a planned step, or the end of the agreement. */
export function partnerNext(p: {
  status: string;
  ends_on: string | null;
  next_action_on: string | null;
}): { kind: "action" | "renewal"; date: string } | null {
  if (p.status === "ended") return null;
  if (p.next_action_on) return { kind: "action", date: p.next_action_on };
  if (p.status === "active" && p.ends_on) return { kind: "renewal", date: p.ends_on };
  return null;
}

/**
 * Tasks a package creates when a partner chooses it (wave 15, C1): one per
 * condition, due a number of days after the signing date when both are known.
 */
export function conditionTasks(
  conditions: { id: string; title: string; description: string; quantity: string; offset_days: number | null; position: number }[],
  signedOn: string | null,
) {
  return conditions.map((c) => ({
    condition_id: c.id,
    title: c.quantity ? `${c.title} · ${c.quantity}` : c.title,
    detail: c.description,
    due_on: signedOn && c.offset_days !== null ? addDays(signedOn, c.offset_days) : null,
    position: c.position,
  }));
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Payment state of a partner, for the table badge. */
export function paymentState(p: { paid_on: string | null; payment_due_on: string | null }, today: string) {
  if (p.paid_on) return { kind: "paid" as const, date: p.paid_on };
  if (p.payment_due_on) return { kind: p.payment_due_on < today ? ("late" as const) : ("expected" as const), date: p.payment_due_on };
  return null;
}
/** Proposed renewal date: 60 days before the end of the season (31 May for a 1 July to 30 June season). */
export function proposedRenewal(seasonEndsOn: string) {
  return addDays(seasonEndsOn, -60);
}
/** The example packages a club may import and change (texts in the club's language). */
export const examplePackages = {
  fr: [
    { name: "Supporter", amountCents: 70000, featured: false, places: null, description: "Une visibilité simple pour soutenir le club.", conditions: [
      { title: "Logo sur le site du club", quantity: "", offsetDays: 30 },
      { title: "Remerciement sur les réseaux sociaux", quantity: "1 publication", offsetDays: 30 },
    ] },
    { name: "Coéquipier", amountCents: 100000, featured: true, places: null, description: "Notre conseil : la formule la plus choisie.", conditions: [
      { title: "Logo sur le site du club", quantity: "", offsetDays: 30 },
      { title: "Publications sur les réseaux sociaux", quantity: "3 publications", offsetDays: 90 },
      { title: "Bâche à la salle lors des matchs à domicile", quantity: "", offsetDays: 60 },
      { title: "Invitation au tournoi du club", quantity: "2 places", offsetDays: null },
    ] },
    { name: "Capitaine", amountCents: 200000, featured: false, places: 2, description: "Partenaire principal, places limitées.", conditions: [
      { title: "Logo sur les maillots", quantity: "", offsetDays: 60 },
      { title: "Logo sur le site du club", quantity: "", offsetDays: 30 },
      { title: "Publications sur les réseaux sociaux", quantity: "6 publications", offsetDays: 180 },
      { title: "Bâche à la salle lors des matchs à domicile", quantity: "", offsetDays: 60 },
      { title: "Invitation au tournoi du club", quantity: "4 places", offsetDays: null },
    ] },
  ],
  nl: [
    { name: "Supporter", amountCents: 70000, featured: false, places: null, description: "Eenvoudige zichtbaarheid om de club te steunen.", conditions: [
      { title: "Logo op de website van de club", quantity: "", offsetDays: 30 },
      { title: "Bedankje op sociale media", quantity: "1 bericht", offsetDays: 30 },
    ] },
    { name: "Ploegmaat", amountCents: 100000, featured: true, places: null, description: "Onze aanrader: de meest gekozen formule.", conditions: [
      { title: "Logo op de website van de club", quantity: "", offsetDays: 30 },
      { title: "Berichten op sociale media", quantity: "3 berichten", offsetDays: 90 },
      { title: "Spandoek in de zaal bij thuiswedstrijden", quantity: "", offsetDays: 60 },
      { title: "Uitnodiging voor het clubtoernooi", quantity: "2 plaatsen", offsetDays: null },
    ] },
    { name: "Kapitein", amountCents: 200000, featured: false, places: 2, description: "Hoofdpartner, beperkte plaatsen.", conditions: [
      { title: "Logo op de truitjes", quantity: "", offsetDays: 60 },
      { title: "Logo op de website van de club", quantity: "", offsetDays: 30 },
      { title: "Berichten op sociale media", quantity: "6 berichten", offsetDays: 180 },
      { title: "Spandoek in de zaal bij thuiswedstrijden", quantity: "", offsetDays: 60 },
      { title: "Uitnodiging voor het clubtoernooi", quantity: "4 plaatsen", offsetDays: null },
    ] },
  ],
  en: [
    { name: "Supporter", amountCents: 70000, featured: false, places: null, description: "Simple visibility to support the club.", conditions: [
      { title: "Logo on the club website", quantity: "", offsetDays: 30 },
      { title: "Thank-you on social media", quantity: "1 post", offsetDays: 30 },
    ] },
    { name: "Teammate", amountCents: 100000, featured: true, places: null, description: "Our advice: the most chosen package.", conditions: [
      { title: "Logo on the club website", quantity: "", offsetDays: 30 },
      { title: "Posts on social media", quantity: "3 posts", offsetDays: 90 },
      { title: "Banner in the hall at home matches", quantity: "", offsetDays: 60 },
      { title: "Invitation to the club tournament", quantity: "2 seats", offsetDays: null },
    ] },
    { name: "Captain", amountCents: 200000, featured: false, places: 2, description: "Main partner, limited places.", conditions: [
      { title: "Logo on the jerseys", quantity: "", offsetDays: 60 },
      { title: "Logo on the club website", quantity: "", offsetDays: 30 },
      { title: "Posts on social media", quantity: "6 posts", offsetDays: 180 },
      { title: "Banner in the hall at home matches", quantity: "", offsetDays: 60 },
      { title: "Invitation to the club tournament", quantity: "4 seats", offsetDays: null },
    ] },
  ],
} as const;

/** The usual steps of a grant file (wave 15, C2), editable once added. */
export const grantChecklist = {
  fr: ["Lire l’appel et ses conditions", "Réunir les statuts et les derniers comptes", "Rédiger le dossier", "Faire signer le dossier", "Déposer le dossier", "Suivre la décision", "Récolter les factures", "Rendre le justificatif"],
  nl: ["De oproep en de voorwaarden lezen", "De statuten en de laatste rekeningen verzamelen", "Het dossier schrijven", "Het dossier laten ondertekenen", "Het dossier indienen", "De beslissing opvolgen", "De facturen verzamelen", "De verantwoording indienen"],
  en: ["Read the call and its conditions", "Gather the statutes and the latest accounts", "Write the file", "Have the file signed", "File the application", "Follow the decision", "Collect the invoices", "Hand in the report"],
} as const;
/** State of a grant's deadline: warning within 14 days, danger once passed while not filed. */
export function deadlineTone(g: { status: string; deadline_on: string | null }, today: string): "danger" | "warning" | null {
  if (!g.deadline_on || g.status !== "idea") return null;
  if (g.deadline_on < today) return "danger";
  return g.deadline_on <= addDays(today, 14) ? "warning" : null;
}
/** The same day one year later (29 February becomes 28 February), for next year's application. */
export function nextYearDate(d: string | null) {
  if (!d) return null;
  const year = Number(d.slice(0, 4)) + 1;
  const md = d.slice(5) === "02-29" ? "02-28" : d.slice(5);
  return `${year}-${md}`;
}
