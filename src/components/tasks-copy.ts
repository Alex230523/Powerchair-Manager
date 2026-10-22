import type { TaskKind } from "@/domains/tasks/schema";

/** Wave 17 (O1): the club's tasks, by type. */
type Copy = {
  title: string;
  intro: string;
  todo: string;
  mineTab: string;
  type: string;
  all: string;
  kinds: Record<TaskKind, string>;
  status: string;
  pending: string;
  done: string;
  mine: string;
  dueOn: string;
  noDate: string;
  late: string;
  responsible: string;
  nobody: string;
  about: string;
  tick: string;
  untick: string;
  none: string;
  noneMine: string;
  add: string;
  fromTemplate: string;
  taskTitle: string;
  detail: string;
  due: string;
  kind: string;
  template: string;
  date: string;
  dateHint: string;
  me: string;
  save: string;
  cancel: string;
  saved: string;
  remove: string;
  removeOf: string;
  templates: string;
  templatesIntro: string;
  suggested: string;
  addSuggested: string;
  templateName: string;
  items: string;
  itemsHint: string;
  edit: string;
  editTemplate: string;
  deleteTemplate: string;
  newTemplate: string;
  daysBefore: string;
};

export const tasksCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Tâches",
    intro: "Ce qu'il y a à faire, par type : jamais mélangé, chaque groupe trié par échéance.",
    todo: "À faire",
    mineTab: "Mes tâches",
    type: "Type",
    all: "Tous",
    kinds: {
      transport: "Transport",
      training: "Entraînement",
      documents: "Documents",
      sponsor: "Sponsors",
      grant: "Subsides",
      obligation: "Obligations",
      equipment: "Matériel",
      other: "Autres",
    },
    status: "Statut",
    pending: "À faire",
    done: "Faites",
    mine: "Mes tâches seulement",
    dueOn: "Pour le",
    noDate: "Sans date",
    late: "En retard",
    responsible: "Responsable",
    nobody: "Personne",
    about: "À propos de",
    tick: "Marquer comme faite : {title}",
    untick: "Remettre à faire : {title}",
    none: "Aucune tâche ici.",
    noneMine: "Rien à faire pour vous en ce moment.",
    add: "Nouvelle tâche",
    fromTemplate: "Depuis un modèle",
    taskTitle: "Tâche",
    detail: "Détail (facultatif)",
    due: "Échéance (facultative)",
    kind: "Type",
    template: "Modèle",
    date: "Date de l'événement",
    dateHint: "Chaque tâche est due le nombre de jours prévu avant cette date.",
    me: "Moi",
    save: "Enregistrer",
    cancel: "Annuler",
    saved: "Enregistré.",
    remove: "Supprimer",
    removeOf: "Supprimer la tâche : {title}",
    templates: "Modèles de tâches",
    templatesIntro: "Des listes prêtes à l'emploi par type, par exemple pour organiser un transport ou préparer un entraînement.",
    suggested: "Modèles proposés",
    addSuggested: "Ajouter « {name} »",
    templateName: "Nom du modèle",
    items: "Tâches du modèle",
    itemsHint: "Une tâche par ligne, avec le nombre de jours avant la date : « Réserver la camionnette | 14 ».",
    edit: "Modifier",
    editTemplate: "Modifier le modèle {name}",
    deleteTemplate: "Supprimer le modèle {name}",
    newTemplate: "Nouveau modèle",
    daysBefore: "{n} j. avant",
  },
  nl: {
    title: "Taken",
    intro: "Wat er te doen is, per soort: nooit door elkaar, elke groep gesorteerd op vervaldatum.",
    todo: "Te doen",
    mineTab: "Mijn taken",
    type: "Soort",
    all: "Alle",
    kinds: {
      transport: "Vervoer",
      training: "Training",
      documents: "Documenten",
      sponsor: "Sponsors",
      grant: "Subsidies",
      obligation: "Verplichtingen",
      equipment: "Materiaal",
      other: "Andere",
    },
    status: "Status",
    pending: "Te doen",
    done: "Gedaan",
    mine: "Enkel mijn taken",
    dueOn: "Tegen",
    noDate: "Zonder datum",
    late: "Te laat",
    responsible: "Verantwoordelijke",
    nobody: "Niemand",
    about: "Over",
    tick: "Als gedaan markeren: {title}",
    untick: "Opnieuw te doen: {title}",
    none: "Hier geen taken.",
    noneMine: "Voorlopig niets voor u te doen.",
    add: "Nieuwe taak",
    fromTemplate: "Vanuit een model",
    taskTitle: "Taak",
    detail: "Detail (optioneel)",
    due: "Vervaldatum (optioneel)",
    kind: "Soort",
    template: "Model",
    date: "Datum van het evenement",
    dateHint: "Elke taak vervalt het voorziene aantal dagen voor die datum.",
    me: "Ikzelf",
    save: "Opslaan",
    cancel: "Annuleren",
    saved: "Opgeslagen.",
    remove: "Verwijderen",
    removeOf: "De taak verwijderen: {title}",
    templates: "Taakmodellen",
    templatesIntro: "Kant-en-klare lijsten per soort, bijvoorbeeld om vervoer te regelen of een training voor te bereiden.",
    suggested: "Voorgestelde modellen",
    addSuggested: "« {name} » toevoegen",
    templateName: "Naam van het model",
    items: "Taken van het model",
    itemsHint: "Eén taak per regel, met het aantal dagen voor de datum: « De bestelwagen reserveren | 14 ».",
    edit: "Wijzigen",
    editTemplate: "Het model {name} wijzigen",
    deleteTemplate: "Het model {name} verwijderen",
    newTemplate: "Nieuw model",
    daysBefore: "{n} d. vooraf",
  },
  en: {
    title: "Tasks",
    intro: "What there is to do, by type: never mixed, each group sorted by due date.",
    todo: "To do",
    mineTab: "My tasks",
    type: "Type",
    all: "All",
    kinds: {
      transport: "Transport",
      training: "Training",
      documents: "Documents",
      sponsor: "Sponsors",
      grant: "Grants",
      obligation: "Obligations",
      equipment: "Equipment",
      other: "Other",
    },
    status: "Status",
    pending: "To do",
    done: "Done",
    mine: "My tasks only",
    dueOn: "By",
    noDate: "No date",
    late: "Late",
    responsible: "In charge",
    nobody: "Nobody",
    about: "About",
    tick: "Mark as done: {title}",
    untick: "Back to do: {title}",
    none: "No task here.",
    noneMine: "Nothing for you to do right now.",
    add: "New task",
    fromTemplate: "From a template",
    taskTitle: "Task",
    detail: "Detail (optional)",
    due: "Due date (optional)",
    kind: "Type",
    template: "Template",
    date: "Date of the event",
    dateHint: "Each task is due the planned number of days before that date.",
    me: "Me",
    save: "Save",
    cancel: "Cancel",
    saved: "Saved.",
    remove: "Delete",
    removeOf: "Delete the task: {title}",
    templates: "Task templates",
    templatesIntro: "Ready-made lists by type, for example to organise a transport or prepare a training.",
    suggested: "Suggested templates",
    addSuggested: "Add « {name} »",
    templateName: "Template name",
    items: "Tasks of the template",
    itemsHint: "One task per line, with the number of days before the date: « Book the van | 14 ».",
    edit: "Edit",
    editTemplate: "Edit the template {name}",
    deleteTemplate: "Delete the template {name}",
    newTemplate: "New template",
    daysBefore: "{n} d. before",
  },
};
