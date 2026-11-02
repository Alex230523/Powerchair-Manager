import type { Locale } from "@/lib/locale";

/** 2: the to-do's new words (several people, meeting, templates on demand, year, amount) in fr, nl, en. */
type Copy = {
  myMeetings: string;
  assignees: string;
  assigneesHint: string;
  search: string;
  nobody: string;
  completion: string;
  completionAny: string;
  completionEach: string;
  progress: string;
  meeting: string;
  meetingStart: string;
  meetingEnd: string;
  place: string;
  link: string;
  linkOpen: string;
  amount: string;
  until: string;
  recurring: string;
  recurringFilter: string;
  fromTemplate: string;
  template: string;
  referenceDate: string;
  templateIntro: string;
  line: string;
  skipLine: string;
  createTasks: string;
  noTemplate: string;
  saveAsTemplate: string;
  templateName: string;
  year: string;
  yearTitle: string;
  yearIntro: string;
  yearPdf: string;
  yearEmpty: string;
  states: Record<"done" | "upcoming" | "late", string>;
  expenseTitle: string;
  expenseText: string;
  expenseDate: string;
  expenseLabel: string;
  expenseSave: string;
  expenseLater: string;
  expenseDone: string;
  affiliationTitle: string;
  affiliationText: string;
  affiliationSave: string;
  category: string;
  archive: string;
  restore: string;
  duplicate: string;
  copyOf: string;
  archived: string;
  errors: Record<string, string>;
};
export const todoMoreCopy: Record<Locale, Copy> = {
  fr: {
    myMeetings: "Mes rendez-vous (tâches)",
    assignees: "Responsables",
    assigneesHint: "Cochez une ou plusieurs personnes. Chacune est prévenue et reçoit les rappels.",
    search: "Chercher un membre",
    nobody: "Personne pour l'instant",
    completion: "La tâche est terminée",
    completionAny: "dès qu'une personne la coche",
    completionEach: "quand chacun a coché sa part",
    progress: "{done}/{total} faits",
    meeting: "A lieu le",
    meetingStart: "Début du rendez-vous",
    meetingEnd: "Fin du rendez-vous",
    place: "Lieu",
    link: "Lien web",
    linkOpen: "Ouvrir le lien",
    amount: "Montant prévu (€)",
    until: "Jusqu'au (facultatif)",
    recurring: "Récurrente",
    recurringFilter: "Récurrentes",
    fromTemplate: "Depuis un modèle",
    template: "Modèle",
    referenceDate: "Date de référence",
    templateIntro: "Chaque ligne devient une tâche, à faire N jours avant la date de référence. Ajustez les responsables avant de valider.",
    line: "{title}, à faire le {date}",
    skipLine: "Ne pas créer cette ligne",
    createTasks: "Créer les tâches",
    noTemplate: "Aucun modèle : créez-en dans Réglages › Activités.",
    saveAsTemplate: "Enregistrer comme modèle",
    templateName: "Nom du modèle",
    year: "Année",
    yearTitle: "L'année d'un coup d'œil",
    yearIntro: "Les douze prochains mois : tâches et répétitions, subsides, sponsors, comptes annuels, affiliations.",
    yearPdf: "Calendrier administratif (PDF)",
    yearEmpty: "Rien de prévu sur ces douze mois.",
    states: { done: "Fait", upcoming: "À venir", late: "En retard" },
    expenseTitle: "Enregistrer la dépense ?",
    expenseText: "Cette tâche a un montant prévu. La dépense est enregistrée une seule fois et liée à la tâche.",
    expenseDate: "Date",
    expenseLabel: "Libellé",
    expenseSave: "Enregistrer la dépense",
    expenseLater: "Plus tard",
    expenseDone: "Dépense enregistrée.",
    affiliationTitle: "Marquer l'affiliation en ordre ?",
    affiliationText: "La ligne d'affiliation est marquée en ordre à cette date, avec sa dépense : rien n'est écrit deux fois.",
    affiliationSave: "Marquer en ordre",
    category: "Catégorie",
    archive: "Archiver",
    restore: "Réactiver",
    duplicate: "Dupliquer",
    copyOf: "{name} (copie)",
    archived: "Archivé",
    errors: { ALREADY_RECORDED: "La dépense de cette tâche est déjà enregistrée.", ALREADY_PAID: "Cette affiliation est déjà en ordre.", INVALID_DATE: "Le rendez-vous doit finir après son début." },
  },
  nl: {
    myMeetings: "Mijn afspraken (taken)",
    assignees: "Verantwoordelijken",
    assigneesHint: "Vink één of meer personen aan. Elk wordt verwittigd en krijgt de herinneringen.",
    search: "Een lid zoeken",
    nobody: "Nog niemand",
    completion: "De taak is klaar",
    completionAny: "zodra één persoon ze afvinkt",
    completionEach: "als iedereen zijn deel afvinkte",
    progress: "{done}/{total} klaar",
    meeting: "Vindt plaats op",
    meetingStart: "Begin van de afspraak",
    meetingEnd: "Einde van de afspraak",
    place: "Locatie",
    link: "Weblink",
    linkOpen: "De link openen",
    amount: "Voorzien bedrag (€)",
    until: "Tot (facultatief)",
    recurring: "Terugkerend",
    recurringFilter: "Terugkerend",
    fromTemplate: "Vanuit een model",
    template: "Model",
    referenceDate: "Referentiedatum",
    templateIntro: "Elke regel wordt een taak, te doen N dagen vóór de referentiedatum. Pas de verantwoordelijken aan voor u bevestigt.",
    line: "{title}, te doen op {date}",
    skipLine: "Deze regel niet aanmaken",
    createTasks: "De taken aanmaken",
    noTemplate: "Geen model: maak er een in Instellingen › Activiteiten.",
    saveAsTemplate: "Als model bewaren",
    templateName: "Naam van het model",
    year: "Jaar",
    yearTitle: "Het jaar in één oogopslag",
    yearIntro: "De komende twaalf maanden: taken en herhalingen, subsidies, sponsors, jaarrekeningen, aansluitingen.",
    yearPdf: "Administratieve kalender (pdf)",
    yearEmpty: "Niets gepland in deze twaalf maanden.",
    states: { done: "Klaar", upcoming: "Komt eraan", late: "Te laat" },
    expenseTitle: "De uitgave boeken?",
    expenseText: "Deze taak heeft een voorzien bedrag. De uitgave wordt één keer geboekt en aan de taak gekoppeld.",
    expenseDate: "Datum",
    expenseLabel: "Omschrijving",
    expenseSave: "De uitgave boeken",
    expenseLater: "Later",
    expenseDone: "Uitgave geboekt.",
    affiliationTitle: "De aansluiting in orde zetten?",
    affiliationText: "De aansluitingsregel wordt op die datum in orde gezet, met haar uitgave: niets wordt dubbel geboekt.",
    affiliationSave: "In orde zetten",
    category: "Categorie",
    archive: "Archiveren",
    restore: "Opnieuw activeren",
    duplicate: "Dupliceren",
    copyOf: "{name} (kopie)",
    archived: "Gearchiveerd",
    errors: { ALREADY_RECORDED: "De uitgave van deze taak is al geboekt.", ALREADY_PAID: "Deze aansluiting is al in orde.", INVALID_DATE: "De afspraak moet na haar begin eindigen." },
  },
  en: {
    myMeetings: "My meetings (tasks)",
    assignees: "People in charge",
    assigneesHint: "Tick one or more people. Each one is told and gets the reminders.",
    search: "Find a member",
    nobody: "Nobody yet",
    completion: "The task is done",
    completionAny: "as soon as one person ticks it",
    completionEach: "when each one ticked his part",
    progress: "{done}/{total} done",
    meeting: "Takes place on",
    meetingStart: "Meeting start",
    meetingEnd: "Meeting end",
    place: "Place",
    link: "Web link",
    linkOpen: "Open the link",
    amount: "Planned amount (€)",
    until: "Until (optional)",
    recurring: "Recurring",
    recurringFilter: "Recurring",
    fromTemplate: "From a template",
    template: "Template",
    referenceDate: "Reference date",
    templateIntro: "Each line becomes a task, due N days before the reference date. Adjust the people in charge before confirming.",
    line: "{title}, due on {date}",
    skipLine: "Do not create this line",
    createTasks: "Create the tasks",
    noTemplate: "No template: create some in Settings › Activities.",
    saveAsTemplate: "Save as a template",
    templateName: "Template name",
    year: "Year",
    yearTitle: "The year at a glance",
    yearIntro: "The next twelve months: tasks and repetitions, grants, sponsors, annual accounts, affiliations.",
    yearPdf: "Administrative calendar (PDF)",
    yearEmpty: "Nothing planned over these twelve months.",
    states: { done: "Done", upcoming: "To come", late: "Late" },
    expenseTitle: "Record the expense?",
    expenseText: "This task has a planned amount. The expense is recorded once and linked to the task.",
    expenseDate: "Date",
    expenseLabel: "Label",
    expenseSave: "Record the expense",
    expenseLater: "Later",
    expenseDone: "Expense recorded.",
    affiliationTitle: "Mark the affiliation as settled?",
    affiliationText: "The affiliation line is marked as settled on that date, with its expense: nothing is written twice.",
    affiliationSave: "Mark as settled",
    category: "Category",
    archive: "Archive",
    restore: "Restore",
    duplicate: "Duplicate",
    copyOf: "{name} (copy)",
    archived: "Archived",
    errors: { ALREADY_RECORDED: "This task's expense is already recorded.", ALREADY_PAID: "This affiliation is already settled.", INVALID_DATE: "The meeting must end after it starts." },
  },
};
