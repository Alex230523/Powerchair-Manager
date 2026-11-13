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
/** 12/11/2026: a group of the board: a category (cat:sport) or a list of the club's own (list:<id>). */
export const groupKey = z.string().regex(/^(cat:[a-z_]{2,30}|list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
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
export const recurrences = ["none", "weekly", "monthly", "yearly"] as const;
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
  /** 2: several people in charge (club profiles, or federation accounts); the first is « the » responsible. */
  assignees: z.array(id).max(20).optional(),
  assigneeUserIds: z.array(z.string().min(1).max(200)).max(20).optional(),
  /** 2: done when one person ticks (« any ») or when each one ticked his part (« each »). */
  completion: z.enum(["any", "each"]).default("any"),
  /** 2: a meeting apart from the deadline (« a lieu le »), with its place. */
  meetingStartsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  meetingEndsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  placeId: id.nullable().default(null),
  sharedVenueId: id.nullable().default(null),
  freeLocation: z.string().trim().max(300).default(""),
  linkUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]).default(""),
  amountCents: z.number().int().min(0).max(100000000).nullable().default(null),
  recurrenceUntil: z.iso.date().nullable().default(null),
};

export const taskCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    /** O1 compatibility: a type; the category is what the page groups by. */
    kind: z.enum(ownKinds).optional(),
    category: z.enum(categories).optional(),
    ...fields,
    checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    /** 12/11/2026: a list of the club's own (its tasks keep the category « other »). */
    listId: id.nullable().default(null),
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
  z.object({
    action: z.literal("fromTemplate"),
    templateId: id,
    date: z.iso.date(),
    responsibleId: id.nullable().default(null),
    /** 2: the people of each line (its index), adjusted before validating; lines left out. */
    assignments: z.record(z.string().regex(/^\d{1,2}$/), z.array(id).max(20)).default({}),
    excluded: z.array(z.number().int().min(0).max(29)).max(30).default([]),
    ...links,
  }),
  /** 2: a task kept as a template (one line, due on the reference date). */
  z.object({ action: z.literal("saveAsTemplate"), id, name: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("archiveTemplate"), id, archived: z.boolean() }),
  z.object({ action: z.literal("duplicateTemplate"), id, name: z.string().trim().min(2).max(120) }),
  /** 2 and 7: the expense of a task with an amount, recorded once and linked to it. */
  z.object({ action: z.literal("expense"), id, occurredOn: z.iso.date(), amountCents: z.number().int().min(1).max(100000000), label: z.string().trim().min(2).max(160) }),
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
      .array(
        z.object({
          key: z.enum(yearKeys()),
          title: z.string().trim().min(2).max(200),
          dueOn: z.iso.date().nullable(),
          responsibleId: id.nullable().default(null),
          /** 35: in a federation, a person with an account. */
          responsibleUserId: z.string().min(1).max(200).nullable().default(null),
        }),
      )
      .min(1)
      .max(10),
  }),
  z.object({ action: z.literal("saveTemplate"), id: id.optional(), kind: z.enum(ownKinds), category: z.enum(categories).optional(), name: z.string().trim().min(2).max(120), items: z.array(item).min(1).max(30) }),
  z.object({ action: z.literal("deleteTemplate"), id }),
  /* 12/11/2026: the task board. */
  /** A ready-made list (presets.ts), due before a date, like a template. */
  z.object({
    action: z.literal("fromPreset"),
    preset: z.string().min(2).max(40),
    date: z.iso.date(),
    locale: z.enum(["fr", "nl", "en"]).default("fr"),
    assignments: z.record(z.string().regex(/^\d{1,2}$/), z.array(id).max(20)).default({}),
    excluded: z.array(z.number().int().min(0).max(29)).max(30).default([]),
    ...links,
  }),
  /** A ready-made list copied into the club's templates, to be changed. */
  z.object({ action: z.literal("copyPreset"), preset: z.string().min(2).max(40), locale: z.enum(["fr", "nl", "en"]).default("fr"), name: z.string().trim().min(2).max(120) }),
  /** The order of a group after a drag (a task dropped into another group moves there). */
  z.object({ action: z.literal("reorder"), group: groupKey, ids: z.array(id).min(1).max(500) }),
  /** The people in charge, from the task's row. */
  z.object({ action: z.literal("assign"), id, assignees: z.array(id).max(20).default([]), assigneeUserIds: z.array(z.string().min(1).max(200)).max(20).default([]) }),
  /** What to bring. */
  z.object({ action: z.literal("materials"), id, items: z.array(z.string().trim().min(1).max(120)).max(30) }),
  /** The club's own categories. */
  z.object({ action: z.literal("saveList"), id: id.nullable().default(null), name: z.string().trim().min(2).max(80) }),
  z.object({ action: z.literal("deleteList"), id }),
  z.object({ action: z.literal("groupOrder"), order: z.array(groupKey).max(100) }),
]);
export type TaskCommand = z.infer<typeof taskCommand>;

function yearKeys() {
  return ["assembly", "filing", "ubo", "tax", "insurance", "affiliation", "affiliationsOpen", "competitionCalendar", "classificationDays"] as const;
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
  if (recurrence === "weekly") return addDays(due, 7);
  const [y, m, d] = due.split("-").map(Number);
  const months = recurrence === "monthly" ? 1 : 12;
  const end = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, end))).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/**
 * The yearly duties of a Belgian ASBL for the financial year that ended
 * before `year` (start « MM-DD »): the general assembly within six months
 * of the closing, filing within thirty days, the UBO register confirmed in
 * the month after, the legal entities tax return and the insurance and
 * affiliation renewals (dates for the club to fill in).
 */
export function yearTemplate(fiscalStart: string, year: number, federation = false): { key: YearKey; category: Category; dueOn: string | null }[] {
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
  // 35: the federation's own year: the same ASBL steps, then its season's deadlines (dates to adjust).
  if (federation)
    return [
      { key: "assembly", category: "fed_admin", dueOn: assembly },
      { key: "filing", category: "fed_admin", dueOn: addDays(assembly, 30) },
      { key: "ubo", category: "fed_admin", dueOn: addDays(assembly, 30) },
      { key: "tax", category: "fed_finance", dueOn: null },
      { key: "insurance", category: "fed_admin", dueOn: null },
      { key: "affiliationsOpen", category: "fed_affiliations", dueOn: `${year}-06-01` },
      { key: "competitionCalendar", category: "fed_competitions", dueOn: `${year}-07-15` },
      { key: "classificationDays", category: "fed_competitions", dueOn: `${year}-09-01` },
    ];
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
    {
      key: "tournament",
      kind: "other",
      name: "Organiser un tournoi",
      items: [
        { title: "Réserver la salle", detail: "", daysBefore: 90 },
        { title: "Inviter les équipes", detail: "", daysBefore: 60 },
        { title: "Prévoir les arbitres", detail: "", daysBefore: 30 },
        { title: "Organiser la buvette et le repas", detail: "", daysBefore: 14 },
        { title: "Imprimer le programme", detail: "", daysBefore: 3 },
      ],
    },
    {
      key: "season",
      kind: "other",
      name: "Préparer une saison",
      items: [
        { title: "Fixer les créneaux d'entraînement", detail: "", daysBefore: 45 },
        { title: "Mettre à jour les barèmes de cotisation", detail: "", daysBefore: 30 },
        { title: "Renouveler les affiliations", detail: "", daysBefore: 30 },
        { title: "Envoyer l'email de rentrée", detail: "", daysBefore: 7 },
      ],
    },
    {
      key: "recruit",
      kind: "other",
      name: "Accueillir une nouvelle recrue",
      items: [
        { title: "Proposer une séance d'essai", detail: "", daysBefore: 14 },
        { title: "Vérifier le fauteuil et le matériel", detail: "", daysBefore: 7 },
        { title: "Créer la fiche et inviter la famille", detail: "", daysBefore: 3 },
        { title: "Présenter l'équipe et le coach", detail: "", daysBefore: 0 },
      ],
    },
    {
      key: "grant",
      kind: "other",
      name: "Dossier de subside",
      items: [
        { title: "Rassembler les statuts et les comptes", detail: "", daysBefore: 45 },
        { title: "Écrire le projet et le budget", detail: "", daysBefore: 30 },
        { title: "Faire signer le dossier", detail: "", daysBefore: 10 },
        { title: "Envoyer le dossier", detail: "", daysBefore: 0 },
      ],
    },
    {
      key: "dinner",
      kind: "other",
      name: "Souper du club",
      items: [
        { title: "Réserver la salle et le traiteur", detail: "", daysBefore: 60 },
        { title: "Annoncer le souper", detail: "", daysBefore: 30 },
        { title: "Clore les inscriptions", detail: "", daysBefore: 10 },
        { title: "Préparer la salle", detail: "", daysBefore: 1 },
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
    {
      key: "tournament",
      kind: "other",
      name: "Een toernooi organiseren",
      items: [
        { title: "De zaal reserveren", detail: "", daysBefore: 90 },
        { title: "De teams uitnodigen", detail: "", daysBefore: 60 },
        { title: "Scheidsrechters voorzien", detail: "", daysBefore: 30 },
        { title: "De bar en de maaltijd regelen", detail: "", daysBefore: 14 },
        { title: "Het programma drukken", detail: "", daysBefore: 3 },
      ],
    },
    {
      key: "season",
      kind: "other",
      name: "Een seizoen voorbereiden",
      items: [
        { title: "De trainingsuren vastleggen", detail: "", daysBefore: 45 },
        { title: "De tarieven van de bijdragen bijwerken", detail: "", daysBefore: 30 },
        { title: "De aansluitingen vernieuwen", detail: "", daysBefore: 30 },
        { title: "De startmail versturen", detail: "", daysBefore: 7 },
      ],
    },
    {
      key: "recruit",
      kind: "other",
      name: "Een nieuwe speler verwelkomen",
      items: [
        { title: "Een proeftraining voorstellen", detail: "", daysBefore: 14 },
        { title: "De rolstoel en het materiaal nakijken", detail: "", daysBefore: 7 },
        { title: "De fiche aanmaken en het gezin uitnodigen", detail: "", daysBefore: 3 },
        { title: "Het team en de coach voorstellen", detail: "", daysBefore: 0 },
      ],
    },
    {
      key: "grant",
      kind: "other",
      name: "Subsidiedossier",
      items: [
        { title: "Statuten en rekeningen verzamelen", detail: "", daysBefore: 45 },
        { title: "Het project en de begroting schrijven", detail: "", daysBefore: 30 },
        { title: "Het dossier laten ondertekenen", detail: "", daysBefore: 10 },
        { title: "Het dossier versturen", detail: "", daysBefore: 0 },
      ],
    },
    {
      key: "dinner",
      kind: "other",
      name: "Clubetentje",
      items: [
        { title: "De zaal en de traiteur reserveren", detail: "", daysBefore: 60 },
        { title: "Het etentje aankondigen", detail: "", daysBefore: 30 },
        { title: "De inschrijvingen afsluiten", detail: "", daysBefore: 10 },
        { title: "De zaal klaarzetten", detail: "", daysBefore: 1 },
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
    {
      key: "tournament",
      kind: "other",
      name: "Organise a tournament",
      items: [
        { title: "Book the hall", detail: "", daysBefore: 90 },
        { title: "Invite the teams", detail: "", daysBefore: 60 },
        { title: "Find the referees", detail: "", daysBefore: 30 },
        { title: "Arrange the bar and the meal", detail: "", daysBefore: 14 },
        { title: "Print the programme", detail: "", daysBefore: 3 },
      ],
    },
    {
      key: "season",
      kind: "other",
      name: "Prepare a season",
      items: [
        { title: "Set the training slots", detail: "", daysBefore: 45 },
        { title: "Update the dues rates", detail: "", daysBefore: 30 },
        { title: "Renew the affiliations", detail: "", daysBefore: 30 },
        { title: "Send the season email", detail: "", daysBefore: 7 },
      ],
    },
    {
      key: "recruit",
      kind: "other",
      name: "Welcome a new player",
      items: [
        { title: "Offer a trial session", detail: "", daysBefore: 14 },
        { title: "Check the chair and the equipment", detail: "", daysBefore: 7 },
        { title: "Create the file and invite the family", detail: "", daysBefore: 3 },
        { title: "Introduce the team and the coach", detail: "", daysBefore: 0 },
      ],
    },
    {
      key: "grant",
      kind: "other",
      name: "Grant file",
      items: [
        { title: "Gather the statutes and the accounts", detail: "", daysBefore: 45 },
        { title: "Write the project and the budget", detail: "", daysBefore: 30 },
        { title: "Have the file signed", detail: "", daysBefore: 10 },
        { title: "Send the file", detail: "", daysBefore: 0 },
      ],
    },
    {
      key: "dinner",
      kind: "other",
      name: "Club dinner",
      items: [
        { title: "Book the hall and the caterer", detail: "", daysBefore: 60 },
        { title: "Announce the dinner", detail: "", daysBefore: 30 },
        { title: "Close the registrations", detail: "", daysBefore: 10 },
        { title: "Set up the hall", detail: "", daysBefore: 1 },
      ],
    },
  ],
};

/**
 * 2 (5): a repetition in words, in the reader's language: « Chaque année le
 * 30 juin », « Chaque semaine le mercredi », « Chaque mois le 15 ». Pure.
 */
export function recurrenceText(locale: "fr" | "nl" | "en", recurrence: Recurrence, due: string | null, until: string | null = null) {
  if (recurrence === "none" || !due) return "";
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  const d = new Date(due + "T12:00:00Z");
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...o, timeZone: "UTC" }).format(d);
  const words = {
    fr: { weekly: `Chaque semaine le ${f({ weekday: "long" })}`, monthly: `Chaque mois le ${d.getUTCDate()}`, yearly: `Chaque année le ${f({ day: "numeric", month: "long" })}`, until: " jusqu'au " },
    nl: { weekly: `Elke week op ${f({ weekday: "long" })}`, monthly: `Elke maand op de ${d.getUTCDate()}e`, yearly: `Elk jaar op ${f({ day: "numeric", month: "long" })}`, until: " tot " },
    en: { weekly: `Every week on ${f({ weekday: "long" })}`, monthly: `Every month on the ${d.getUTCDate()}`, yearly: `Every year on ${f({ day: "numeric", month: "long" })}`, until: " until " },
  }[locale];
  const end = until ? words.until + new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(until + "T12:00:00Z")) : "";
  return words[recurrence] + end;
}
/** 2: a task for several people in « each » mode is done when every one ticked: « 3/5 ». Pure. */
export function progressOf(assignees: { done_on: string | null }[]) {
  return { done: assignees.filter((a) => !!a.done_on).length, total: assignees.length };
}
