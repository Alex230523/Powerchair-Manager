import { z } from "zod";

/**
 * Wave 17 (O1): one task list for the whole club. A task has a type and is
 * about something (an event, a match, a trip, an obligation, a chair, a
 * sponsor, a grant). Lists are shown by type, never mixed, each sorted by
 * date.
 */
export const taskKinds = ["transport", "training", "documents", "sponsor", "grant", "obligation", "equipment", "other"] as const;
export type TaskKind = (typeof taskKinds)[number];
/** Sponsors and grants are created from their files (wave 15); the others here. */
export const ownKinds = ["transport", "training", "documents", "obligation", "equipment", "other"] as const;
export type OwnKind = (typeof ownKinds)[number];

export type TemplateItem = { title: string; detail: string; daysBefore: number };
const item = z.object({ title: z.string().trim().min(2).max(200), detail: z.string().trim().max(2000).default(""), daysBefore: z.number().int().min(0).max(365) });
const id = z.uuid();
const links = {
  eventId: id.nullable().default(null),
  matchId: id.nullable().default(null),
  tripId: id.nullable().default(null),
  obligationId: id.nullable().default(null),
  chairId: id.nullable().default(null),
};

/* A1: the organisation's central to-do. */
/** Club categories, in this order on the page. */
export const clubCategories = ["affiliation", "admin", "grants", "sponsors", "fundraising", "equipment", "sport", "events", "other"] as const;
/** Federation categories, in this order. */
export const federationCategories = ["fed_affiliations", "fed_licences", "fed_competitions", "fed_admin", "fed_finance", "fed_other"] as const;
export const categories = [...clubCategories, ...federationCategories] as const;
export type Category = (typeof categories)[number];
/** Money matters: shown to the people with the money rights (and to whoever is in charge). */
export const moneyCategories: readonly Category[] = ["grants", "sponsors", "fundraising", "fed_finance"];
export const statuses = ["todo", "doing", "done"] as const;
export type Status = (typeof statuses)[number];
export const recurrences = ["none", "monthly", "yearly"] as const;
export type Recurrence = (typeof recurrences)[number];
const fields = {
  title: z.string().trim().min(2).max(200),
  detail: z.string().trim().max(2000).default(""),
  dueOn: z.iso.date().nullable().default(null),
  responsibleId: id.nullable().default(null),
  /** Federation tasks: an account of the federation. */
  responsibleUserId: z.string().min(1).max(200).nullable().default(null),
  priority: z.enum(["normal", "high"]).default("normal"),
  recurrence: z.enum(recurrences).default("none"),
  teamId: id.nullable().default(null),
};

export const taskCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    /** O1 compatibility: a type; the category is what the page groups by. */
    kind: z.enum(ownKinds).optional(),
    category: z.enum(categories).optional(),
    ...fields,
    checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    ...links,
  }),
  z.object({
    action: z.literal("update"),
    id,
    category: z.enum(categories),
    ...fields,
  }),
  z.object({ action: z.literal("status"), id, status: z.enum(statuses) }),
  /** The tasks of a template, due so many days before a date (a match, a training). */
  z.object({ action: z.literal("fromTemplate"), templateId: id, date: z.iso.date(), responsibleId: id.nullable().default(null), ...links }),
  z.object({ action: z.literal("done"), id, done: z.boolean() }),
  z.object({ action: z.literal("check"), id, index: z.number().int().min(0).max(49), done: z.boolean() }),
  z.object({ action: z.literal("addItem"), id, text: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("comment"), id, body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("delete"), id }),
  /** « Année administrative de l'ASBL », checked and changed by the club first. */
  z.object({
    action: z.literal("applyYear"),
    year: z.number().int().min(2000).max(2100),
    items: z
      .array(z.object({ key: z.enum(yearKeys()), title: z.string().trim().min(2).max(200), dueOn: z.iso.date().nullable(), responsibleId: id.nullable().default(null) }))
      .min(1)
      .max(10),
  }),
  z.object({ action: z.literal("saveTemplate"), id: id.optional(), kind: z.enum(ownKinds), name: z.string().trim().min(2).max(120), items: z.array(item).min(1).max(30) }),
  z.object({ action: z.literal("deleteTemplate"), id }),
]);
export type TaskCommand = z.infer<typeof taskCommand>;

function yearKeys() {
  return ["assembly", "filing", "ubo", "tax", "insurance", "affiliation"] as const;
}
export type YearKey = ReturnType<typeof yearKeys>[number];
export const yearItems = yearKeys();
/** The category of an O1 type, when a task is created by type. */
export function categoryOf(kind: TaskKind): Category {
  return ({ sponsor: "sponsors", grant: "grants", obligation: "admin", documents: "admin", equipment: "equipment", training: "sport", transport: "events", other: "other" } as const)[kind];
}
/** The type stored with a category (the database keeps both). */
export function kindOf(category: Category): OwnKind {
  return category === "equipment" ? "equipment" : category === "events" ? "transport" : category === "sport" ? "training" : category === "admin" ? "documents" : "other";
}
/** The next occurrence of a recurring task. */
export function nextDue(due: string, recurrence: Recurrence) {
  if (recurrence === "none") return null;
  const [y, m, d] = due.split("-").map(Number);
  const months = recurrence === "monthly" ? 1 : 12;
  const end = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, end))).toISOString().slice(0, 10);
}
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/**
 * The yearly duties of a Belgian ASBL for the financial year that ended
 * before `year` (start « MM-DD »): the general assembly within six months
 * of the closing, filing within thirty days, the UBO register confirmed in
 * the month after, the legal entities tax return and the insurance and
 * affiliation renewals (dates for the club to fill in).
 */
export function yearTemplate(fiscalStart: string, year: number): { key: YearKey; category: Category; dueOn: string | null }[] {
  const closing = new Date(Date.UTC(year, Number(fiscalStart.slice(0, 2)) - 1, Number(fiscalStart.slice(3, 5))));
  closing.setUTCDate(closing.getUTCDate() - 1);
  // The last closing before or in `year`.
  const to = closing.toISOString().slice(0, 10);
  const assembly = (() => {
    const d = new Date(to + "T12:00:00Z");
    const month = d.getUTCMonth() + 6;
    const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10);
  })();
  return [
    { key: "assembly", category: "admin", dueOn: assembly },
    { key: "filing", category: "admin", dueOn: addDays(assembly, 30) },
    { key: "ubo", category: "admin", dueOn: addDays(assembly, 30) },
    { key: "tax", category: "admin", dueOn: null },
    { key: "insurance", category: "admin", dueOn: null },
    { key: "affiliation", category: "affiliation", dueOn: null },
  ];
}
/** Late: open with a due date before today. */
export const isLate = (t: { status: string; due_on: string | null }, today: string) => t.status !== "done" && !!t.due_on && t.due_on < today;
/** Due within the next seven days (today included). */
export const thisWeek = (t: { status: string; due_on: string | null }, today: string) => t.status !== "done" && !!t.due_on && t.due_on >= today && t.due_on <= addDays(today, 6);

/** Due date of a template's item: so many days before the date. */
export function dueBefore(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Tasks grouped by category in the page's order, each group sorted by priority, due date (no date last), then title. */
export function groupTasks<T extends { category: Category; due_on: string | null; title: string; priority?: string }>(tasks: T[], federation = false) {
  return (federation ? federationCategories : clubCategories)
    .map((category) => ({
      category: category as Category,
      tasks: tasks
        .filter((t) => t.category === category)
        .sort(
          (a, b) =>
            (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || Number(b.priority === "high") - Number(a.priority === "high") || a.title.localeCompare(b.title),
        ),
    }));
}

/** Proposed to every club (Settings > Activities), changed or added as wished. */
export const suggestedTemplates: Record<"fr" | "nl" | "en", { key: string; kind: OwnKind; name: string; items: TemplateItem[] }[]> = {
  fr: [
    {
      key: "transport",
      kind: "transport",
      name: "Transport vers un match",
      items: [
        { title: "Réserver la camionnette", detail: "", daysBefore: 14 },
        { title: "Trouver un conducteur avec le bon permis", detail: "", daysBefore: 10 },
        { title: "Confirmer les places fauteuil", detail: "", daysBefore: 7 },
        { title: "Prévoir les chargeurs", detail: "", daysBefore: 2 },
        { title: "Communiquer l'heure de départ", detail: "", daysBefore: 2 },
      ],
    },
    {
      key: "training",
      kind: "training",
      name: "Préparer un entraînement",
      items: [
        { title: "Choisir les fiches exercices", detail: "", daysBefore: 3 },
        { title: "Confirmer la salle", detail: "", daysBefore: 2 },
        { title: "Vérifier le matériel", detail: "", daysBefore: 1 },
      ],
    },
  ],
  nl: [
    {
      key: "transport",
      kind: "transport",
      name: "Vervoer naar een wedstrijd",
      items: [
        { title: "De bestelwagen reserveren", detail: "", daysBefore: 14 },
        { title: "Een chauffeur met het juiste rijbewijs vinden", detail: "", daysBefore: 10 },
        { title: "De rolstoelplaatsen bevestigen", detail: "", daysBefore: 7 },
        { title: "De laders voorzien", detail: "", daysBefore: 2 },
        { title: "Het vertrekuur doorgeven", detail: "", daysBefore: 2 },
      ],
    },
    {
      key: "training",
      kind: "training",
      name: "Een training voorbereiden",
      items: [
        { title: "De oefenfiches kiezen", detail: "", daysBefore: 3 },
        { title: "De zaal bevestigen", detail: "", daysBefore: 2 },
        { title: "Het materiaal nakijken", detail: "", daysBefore: 1 },
      ],
    },
  ],
  en: [
    {
      key: "transport",
      kind: "transport",
      name: "Transport to a match",
      items: [
        { title: "Book the van", detail: "", daysBefore: 14 },
        { title: "Find a driver with the right licence", detail: "", daysBefore: 10 },
        { title: "Confirm the wheelchair places", detail: "", daysBefore: 7 },
        { title: "Pack the chargers", detail: "", daysBefore: 2 },
        { title: "Share the departure time", detail: "", daysBefore: 2 },
      ],
    },
    {
      key: "training",
      kind: "training",
      name: "Prepare a training",
      items: [
        { title: "Choose the exercise sheets", detail: "", daysBefore: 3 },
        { title: "Confirm the hall", detail: "", daysBefore: 2 },
        { title: "Check the equipment", detail: "", daysBefore: 1 },
      ],
    },
  ],
};
