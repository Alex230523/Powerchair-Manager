import type { Category, YearKey } from "@/domains/tasks/schema";

/** A1: the central to-do of the club or the federation. */
type Copy = {
  title: string;
  intro: string;
  categories: Record<Category, string>;
  statuses: Record<"todo" | "doing" | "done", string>;
  filters: string;
  views: Record<"all" | "mine" | "late" | "week", string>;
  responsible: string;
  everyone: string;
  showDone: string;
  openCount: string;
  lateCount: string;
  quickAdd: string;
  quickLabel: string;
  add: string;
  newTask: string;
  open: string;
  openOf: string;
  detailsOf: string;
  priority: string;
  priorities: Record<"normal" | "high", string>;
  recurrence: string;
  recurrences: Record<"none" | "weekly" | "monthly" | "yearly", string>;
  status: string;
  statusOf: string;
  tickOf: string;
  untickOf: string;
  checklist: string;
  checklistHelp: string;
  addItem: string;
  itemOf: string;
  comments: string;
  comment: string;
  post: string;
  noComment: string;
  edit: string;
  save: string;
  cancel: string;
  category: string;
  taskTitle: string;
  detail: string;
  due: string;
  noDate: string;
  nobody: string;
  team: string;
  noTeam: string;
  auto: string;
  autoClosed: string;
  remove: string;
  removeOf: string;
  sources: Record<string, string>;
  yearOpen: string;
  yearTitle: string;
  yearIntro: string;
  yearLabel: string;
  yearItems: Record<YearKey, string>;
  yearApply: string;
  yearApplied: string;
  empty: string;
  emptyMine: string;
  saved: string;
  unavailable: string;
  linked: string;
  showAll: string;
};

export const todoCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Tâches",
    intro: "Tout ce qu'il y a à faire, par catégorie : ce que vous ajoutez et ce que l'application crée toute seule.",
    categories: {
      affiliation: "Affiliation et fédération",
      admin: "Administratif et légal",
      grants: "Subsides",
      sponsors: "Sponsors",
      fundraising: "Collecte de fonds",
      equipment: "Matériel",
      sport: "Sport (licences, inscriptions aux tournois)",
      events: "Événements",
      other: "Autre",
      fed_affiliations: "Affiliations des clubs",
      fed_licences: "Licences",
      fed_competitions: "Compétitions et arbitrage",
      fed_admin: "Administratif et légal",
      fed_finance: "Finances",
      fed_other: "Autre",
    },
    statuses: { todo: "À faire", doing: "En cours", done: "Fait" },
    filters: "Filtrer les tâches",
    views: { all: "Toutes", mine: "Mes tâches", late: "En retard", week: "Cette semaine" },
    responsible: "Responsable",
    everyone: "Tout le monde",
    showDone: "Afficher les tâches faites",
    openCount: "{n} ouverte(s)",
    lateCount: "{n} en retard",
    quickAdd: "Ajouter une tâche dans {category}",
    quickLabel: "Nouvelle tâche dans {category}",
    add: "Ajouter",
    newTask: "Nouvelle tâche",
    open: "Ouvrir",
    openOf: "Ouvrir : {about}",
    detailsOf: "Détails de la tâche : {title}",
    priority: "Priorité",
    priorities: { normal: "Normale", high: "Haute" },
    recurrence: "Répétition",
    recurrences: { none: "Une fois", weekly: "Chaque semaine", monthly: "Chaque mois", yearly: "Chaque année" },
    status: "Statut",
    statusOf: "Statut de la tâche : {title}",
    tickOf: "Marquer comme faite : {title}",
    untickOf: "Rouvrir : {title}",
    checklist: "Sous-tâches",
    checklistHelp: "Une par ligne.",
    addItem: "Ajouter une sous-tâche",
    itemOf: "Sous-tâche : {item}",
    comments: "Commentaires",
    comment: "Votre commentaire",
    post: "Publier",
    noComment: "Aucun commentaire.",
    edit: "Modifier",
    save: "Enregistrer",
    cancel: "Annuler",
    category: "Catégorie",
    taskTitle: "Titre",
    detail: "Détail",
    due: "Échéance",
    noDate: "Sans date",
    nobody: "Personne",
    team: "Équipe",
    noTeam: "Aucune",
    auto: "Créée par l'application",
    autoClosed: "Fermée par l'application : la cause est réglée",
    remove: "Supprimer",
    removeOf: "Supprimer la tâche : {title}",
    sources: {
      grantDeadline: "Déposer le dossier de subside : {about}",
      affiliationDue: "Payer l'affiliation : {about}",
      venueRequest: "Demander la réservation : {about}",
      venueRemind: "Relancer la salle : {about}",
      venuePay: "Payer la facture de salle : {about}",
      venueNotify: "Prévenir la salle : {about}",
      grantOpening: "L'appel est ouvert, préparer le dossier : {about}",
      partnerRenewal: "Renouveler le sponsoring : {about}",
      partnerContact: "Reprendre contact avec le sponsor : {about}",
      grantReport: "Envoyer le rapport justificatif : {about}",
      chairService: "Réviser le fauteuil {about}",
      documentExpiry: "Renouveler le document : {about}",
      potDeadline: "Clôturer la cagnotte {about}",
      accountsAssembly: "Approuver les comptes {about} en assemblée générale",
      accountsFiling: "Déposer les comptes annuels {about}",
      match_chairs: "Charger les fauteuils : {about}",
      match_batteries: "Charger les batteries : {about}",
      match_balls: "Prendre les ballons : {about}",
      match_shirts: "Prendre les maillots : {about}",
      match_firstAid: "Prendre la trousse de secours : {about}",
      match_transport: "Organiser le transport : {about}",
    },
    yearOpen: "Année administrative de l'ASBL",
    yearTitle: "Année administrative de l'ASBL",
    yearIntro: "Les obligations de chaque année. Vérifiez chaque ligne, changez-la si besoin, puis appliquez : les tâches reviennent chaque année quand elles sont faites.",
    yearLabel: "Année de l'assemblée générale",
    yearItems: {
      assembly: "Assemblée générale et approbation des comptes",
      filing: "Dépôt des comptes annuels",
      ubo: "Confirmation annuelle du registre UBO",
      tax: "Déclaration à l'impôt des personnes morales",
      insurance: "Renouvellement des assurances",
      affiliation: "Renouvellement de l'affiliation fédérale",
    },
    yearApply: "Appliquer",
    yearApplied: "Tâches de l'année ajoutées.",
    empty: "Rien à faire ici.",
    emptyMine: "Aucune tâche ne vous est attribuée.",
    saved: "Enregistré.",
    unavailable: "Action impossible pour le moment.",
    linked: "Tâches liées à : {about}",
    showAll: "Voir toutes les tâches",
  },
  nl: {
    title: "Taken",
    intro: "Alles wat er te doen is, per categorie: wat u toevoegt en wat de toepassing zelf aanmaakt.",
    categories: {
      affiliation: "Aansluiting en federatie",
      admin: "Administratief en wettelijk",
      grants: "Subsidies",
      sponsors: "Sponsors",
      fundraising: "Fondsenwerving",
      equipment: "Materiaal",
      sport: "Sport (licenties, inschrijvingen voor toernooien)",
      events: "Evenementen",
      other: "Andere",
      fed_affiliations: "Aansluitingen van de clubs",
      fed_licences: "Licenties",
      fed_competitions: "Competities en scheidsrechters",
      fed_admin: "Administratief en wettelijk",
      fed_finance: "Financiën",
      fed_other: "Andere",
    },
    statuses: { todo: "Te doen", doing: "Bezig", done: "Gedaan" },
    filters: "Taken filteren",
    views: { all: "Alle", mine: "Mijn taken", late: "Te laat", week: "Deze week" },
    responsible: "Verantwoordelijke",
    everyone: "Iedereen",
    showDone: "Gedane taken tonen",
    openCount: "{n} open",
    lateCount: "{n} te laat",
    quickAdd: "Een taak toevoegen in {category}",
    quickLabel: "Nieuwe taak in {category}",
    add: "Toevoegen",
    newTask: "Nieuwe taak",
    open: "Openen",
    openOf: "Openen: {about}",
    detailsOf: "Details van de taak: {title}",
    priority: "Prioriteit",
    priorities: { normal: "Normaal", high: "Hoog" },
    recurrence: "Herhaling",
    recurrences: { none: "Eén keer", weekly: "Elke week", monthly: "Elke maand", yearly: "Elk jaar" },
    status: "Status",
    statusOf: "Status van de taak: {title}",
    tickOf: "Als gedaan markeren: {title}",
    untickOf: "Heropenen: {title}",
    checklist: "Deeltaken",
    checklistHelp: "Eén per regel.",
    addItem: "Een deeltaak toevoegen",
    itemOf: "Deeltaak: {item}",
    comments: "Opmerkingen",
    comment: "Uw opmerking",
    post: "Plaatsen",
    noComment: "Geen opmerking.",
    edit: "Wijzigen",
    save: "Opslaan",
    cancel: "Annuleren",
    category: "Categorie",
    taskTitle: "Titel",
    detail: "Detail",
    due: "Vervaldag",
    noDate: "Zonder datum",
    nobody: "Niemand",
    team: "Team",
    noTeam: "Geen",
    auto: "Aangemaakt door de toepassing",
    autoClosed: "Gesloten door de toepassing: de oorzaak is opgelost",
    remove: "Verwijderen",
    removeOf: "De taak verwijderen: {title}",
    sources: {
      grantDeadline: "Het subsidiedossier indienen: {about}",
      affiliationDue: "De aansluiting betalen: {about}",
      venueRequest: "De reservatie aanvragen: {about}",
      venueRemind: "De zaal opnieuw contacteren: {about}",
      venuePay: "De zaalfactuur betalen: {about}",
      venueNotify: "De zaal verwittigen: {about}",
      grantOpening: "De oproep is open, het dossier voorbereiden: {about}",
      partnerRenewal: "De sponsoring vernieuwen: {about}",
      partnerContact: "Opnieuw contact opnemen met de sponsor: {about}",
      grantReport: "Het verantwoordingsverslag sturen: {about}",
      chairService: "De rolstoel {about} laten nakijken",
      documentExpiry: "Het document vernieuwen: {about}",
      potDeadline: "De pot {about} afsluiten",
      accountsAssembly: "De rekeningen {about} goedkeuren op de algemene vergadering",
      accountsFiling: "De jaarrekening {about} neerleggen",
      match_chairs: "De rolstoelen laden: {about}",
      match_batteries: "De batterijen laden: {about}",
      match_balls: "De ballen meenemen: {about}",
      match_shirts: "De truitjes meenemen: {about}",
      match_firstAid: "De EHBO-koffer meenemen: {about}",
      match_transport: "Het vervoer regelen: {about}",
    },
    yearOpen: "Administratief jaar van de vzw",
    yearTitle: "Administratief jaar van de vzw",
    yearIntro: "De verplichtingen van elk jaar. Controleer elke regel, wijzig ze indien nodig en pas toe: de taken komen elk jaar terug zodra ze gedaan zijn.",
    yearLabel: "Jaar van de algemene vergadering",
    yearItems: {
      assembly: "Algemene vergadering en goedkeuring van de rekeningen",
      filing: "Neerlegging van de jaarrekening",
      ubo: "Jaarlijkse bevestiging van het UBO-register",
      tax: "Aangifte in de rechtspersonenbelasting",
      insurance: "Vernieuwing van de verzekeringen",
      affiliation: "Vernieuwing van de aansluiting bij de federatie",
    },
    yearApply: "Toepassen",
    yearApplied: "Taken van het jaar toegevoegd.",
    empty: "Hier is niets te doen.",
    emptyMine: "Er is u geen taak toegewezen.",
    saved: "Opgeslagen.",
    unavailable: "Actie momenteel niet mogelijk.",
    linked: "Taken gekoppeld aan: {about}",
    showAll: "Alle taken bekijken",
  },
  en: {
    title: "Tasks",
    intro: "Everything there is to do, by category: what you add and what the application creates by itself.",
    categories: {
      affiliation: "Affiliation and federation",
      admin: "Administrative and legal",
      grants: "Grants",
      sponsors: "Sponsors",
      fundraising: "Fundraising",
      equipment: "Equipment",
      sport: "Sport (licences, tournament entries)",
      events: "Events",
      other: "Other",
      fed_affiliations: "Club affiliations",
      fed_licences: "Licences",
      fed_competitions: "Competitions and refereeing",
      fed_admin: "Administrative and legal",
      fed_finance: "Finances",
      fed_other: "Other",
    },
    statuses: { todo: "To do", doing: "In progress", done: "Done" },
    filters: "Filter the tasks",
    views: { all: "All", mine: "My tasks", late: "Late", week: "This week" },
    responsible: "Person in charge",
    everyone: "Everyone",
    showDone: "Show the tasks done",
    openCount: "{n} open",
    lateCount: "{n} late",
    quickAdd: "Add a task in {category}",
    quickLabel: "New task in {category}",
    add: "Add",
    newTask: "New task",
    open: "Open",
    openOf: "Open: {about}",
    detailsOf: "Details of the task: {title}",
    priority: "Priority",
    priorities: { normal: "Normal", high: "High" },
    recurrence: "Repeat",
    recurrences: { none: "Once", weekly: "Every week", monthly: "Every month", yearly: "Every year" },
    status: "Status",
    statusOf: "Status of the task: {title}",
    tickOf: "Mark as done: {title}",
    untickOf: "Reopen: {title}",
    checklist: "Sub-tasks",
    checklistHelp: "One per line.",
    addItem: "Add a sub-task",
    itemOf: "Sub-task: {item}",
    comments: "Comments",
    comment: "Your comment",
    post: "Post",
    noComment: "No comment.",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    category: "Category",
    taskTitle: "Title",
    detail: "Detail",
    due: "Due date",
    noDate: "No date",
    nobody: "Nobody",
    team: "Team",
    noTeam: "None",
    auto: "Created by the application",
    autoClosed: "Closed by the application: the cause is resolved",
    remove: "Delete",
    removeOf: "Delete the task: {title}",
    sources: {
      grantDeadline: "File the grant application: {about}",
      affiliationDue: "Pay the affiliation: {about}",
      venueRequest: "Request the booking: {about}",
      venueRemind: "Follow up with the hall: {about}",
      venuePay: "Pay the hall's invoice: {about}",
      venueNotify: "Tell the hall: {about}",
      grantOpening: "The call is open, prepare the application: {about}",
      partnerRenewal: "Renew the sponsorship: {about}",
      partnerContact: "Get back in touch with the sponsor: {about}",
      grantReport: "Send the grant report: {about}",
      chairService: "Service the chair {about}",
      documentExpiry: "Renew the document: {about}",
      potDeadline: "Close the pot {about}",
      accountsAssembly: "Approve the accounts {about} in the general assembly",
      accountsFiling: "File the annual accounts {about}",
      match_chairs: "Load the chairs: {about}",
      match_batteries: "Charge the batteries: {about}",
      match_balls: "Bring the balls: {about}",
      match_shirts: "Bring the shirts: {about}",
      match_firstAid: "Bring the first aid kit: {about}",
      match_transport: "Organise the transport: {about}",
    },
    yearOpen: "The non-profit's administrative year",
    yearTitle: "The non-profit's administrative year",
    yearIntro: "The duties of every year. Check each line, change it if needed, then apply: the tasks come back every year once done.",
    yearLabel: "Year of the general assembly",
    yearItems: {
      assembly: "General assembly and approval of the accounts",
      filing: "Filing of the annual accounts",
      ubo: "Yearly confirmation of the UBO register",
      tax: "Legal entities tax return",
      insurance: "Renewal of the insurance policies",
      affiliation: "Renewal of the federation affiliation",
    },
    yearApply: "Apply",
    yearApplied: "Tasks of the year added.",
    empty: "Nothing to do here.",
    emptyMine: "No task is given to you.",
    saved: "Saved.",
    unavailable: "Action not possible right now.",
    linked: "Tasks linked to: {about}",
    showAll: "See all the tasks",
  },
};
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
