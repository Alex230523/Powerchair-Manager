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
export const taskCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(ownKinds),
    title: z.string().trim().min(2).max(200),
    detail: z.string().trim().max(2000).default(""),
    dueOn: z.iso.date().nullable().default(null),
    responsibleId: id.nullable().default(null),
    ...links,
  }),
  /** The tasks of a template, due so many days before a date (a match, a training). */
  z.object({ action: z.literal("fromTemplate"), templateId: id, date: z.iso.date(), responsibleId: id.nullable().default(null), ...links }),
  z.object({ action: z.literal("done"), id, done: z.boolean() }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("saveTemplate"), id: id.optional(), kind: z.enum(ownKinds), name: z.string().trim().min(2).max(120), items: z.array(item).min(1).max(30) }),
  z.object({ action: z.literal("deleteTemplate"), id }),
]);
export type TaskCommand = z.infer<typeof taskCommand>;

/** Due date of a template's item: so many days before the date. */
export function dueBefore(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Tasks grouped by type in the platform's order, each group sorted by due date (no date last), then title. */
export function groupTasks<T extends { kind: TaskKind; due_on: string | null; title: string }>(tasks: T[]) {
  return taskKinds
    .map((kind) => ({
      kind,
      tasks: tasks
        .filter((t) => t.kind === kind)
        .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.title.localeCompare(b.title)),
    }))
    .filter((g) => g.tasks.length > 0);
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
