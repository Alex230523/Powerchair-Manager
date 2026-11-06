import type { Locale } from "@/lib/locale";

/** Console, step 1 (05/11/2026): the platform operator's console. */
type Copy = {
  title: string;
  badge: string;
  intro: string;
  backToApp: string;
  denied: string;
  tabs: Record<"home" | "organizations" | "supervision" | "operators", string>;
  roles: Record<"owner" | "support" | "finance" | "readonly", string>;
  signedAs: string;
  generated: string;
  tiles: {
    organizations: string;
    organizationsHint: string;
    clubs: string;
    federations: string;
    newThisMonth: string;
    people: string;
    accounts: string;
    players: string;
    coaches: string;
    referees: string;
    licences: string;
    activity: string;
    active7: string;
    active30: string;
    matches30: string;
    mails7: string;
    storage: string;
    health: string;
    jobsLate: string;
    jobsOk: string;
    mailsOverdue: string;
    mailsFailed: string;
    lastMigration: string;
    noMigration: string;
    support: string;
    feedbackOpen: string;
    feedbackWeek: string;
    dataRequestsOpen: string;
    dataRequestsLate: string;
    compliance: string;
    noPresident: string;
    noDpa: string;
    minorsWithoutGuardian: string;
    terminationsPending: string;
  };
  byCountry: string;
  todo: string;
  todoNone: string;
  todoKeys: Record<"noPresident" | "inactive60" | "seasonEnding" | "dataRequestsLate" | "terminations" | "apiKeysIdle" | "noDpa", string>;
  more: string;
  recentActions: string;
  recentNone: string;
  actionKinds: Record<string, string>;
  billingSoon: string;
  organizations: {
    search: string;
    kind: string;
    allKinds: string;
    club: string;
    federation: string;
    country: string;
    allCountries: string;
    columns: { name: string; country: string; federation: string; members: string; players: string; presidents: string; lastActivity: string; created: string };
    none: string;
    never: string;
    count: string;
  };
  organization: {
    back: string;
    facts: string;
    members: string;
    players: string;
    coaches: string;
    teams: string;
    clubs: string;
    created: string;
    lastActivity: string;
    actions30: string;
    storage: string;
    disabledModules: string;
    dpa: string;
    dpaNone: string;
    dataRequestsOpen: string;
    termination: string;
    apiKeys: string;
    officers: string;
    officersNone: string;
    officerRoles: Record<string, string>;
    notes: string;
    notesNone: string;
    noteAdd: string;
    noteSave: string;
    noteSaved: string;
    interventions: string;
    interventionsNone: string;
    readOnly: string;
  };
  supervision: {
    jobs: string;
    jobColumns: { job: string; every: string; lastRun: string; lastOk: string; state: string };
    late: string;
    ok: string;
    never: string;
    minutes: string;
    mails: string;
    mailsNone: string;
    storage: string;
    storageNone: string;
    files: string;
    migrations: string;
    migrationsNone: string;
    feedback: string;
    feedbackNone: string;
    feedbackKinds: Record<string, string>;
    feedbackStates: Record<string, string>;
    issue: string;
    dataRequests: string;
    dataRequestsNone: string;
    dataRequestKinds: Record<string, string>;
    dataRequestStates: Record<string, string>;
    dueOn: string;
  };
  operators: {
    intro: string;
    fromEnvironment: string;
    columns: { name: string; email: string; role: string; since: string };
    none: string;
    add: string;
    email: string;
    role: string;
    save: string;
    saved: string;
    revoke: string;
    revoked: string;
    revokedBadge: string;
    ownerOnly: string;
  };
};
const fr: Copy = {
  title: "Console de la plateforme",
  badge: "Console",
  intro: "Comptages et états de toutes les organisations, santé du service, support et conformité. Aucune donnée personnelle de joueur : la console lit des chiffres, et chaque intervention est journalisée.",
  backToApp: "Retour à l'application",
  denied: "Cette console est réservée aux exploitants de la plateforme.",
  tabs: { home: "Tableau de bord", organizations: "Organisations", supervision: "Supervision", operators: "Opérateurs" },
  roles: { owner: "Propriétaire", support: "Support", finance: "Finance", readonly: "Lecture seule" },
  signedAs: "{name} · {role}",
  generated: "Chiffres au {time}",
  tiles: {
    organizations: "Organisations",
    organizationsHint: "Clubs et fédérations sur la plateforme",
    clubs: "clubs",
    federations: "fédérations",
    newThisMonth: "nouvelles ce mois",
    people: "Personnes",
    accounts: "comptes actifs",
    players: "joueurs actifs",
    coaches: "coachs",
    referees: "arbitres",
    licences: "licences actives",
    activity: "Activité",
    active7: "actifs sur 7 jours",
    active30: "actifs sur 30 jours",
    matches30: "matchs joués sur 30 jours",
    mails7: "e-mails partis sur 7 jours",
    storage: "stockage",
    health: "Santé",
    jobsLate: "tâches en retard",
    jobsOk: "tâches planifiées à l'heure",
    mailsOverdue: "e-mails en attente depuis plus de 30 minutes",
    mailsFailed: "e-mails échoués sur 7 jours",
    lastMigration: "Dernière migration : {name}",
    noMigration: "Migrations : non suivies dans cette base",
    support: "Support",
    feedbackOpen: "signalements ouverts",
    feedbackWeek: "reçus cette semaine",
    dataRequestsOpen: "demandes RGPD en cours",
    dataRequestsLate: "en retard sur le délai de 30 jours",
    compliance: "Conformité",
    noPresident: "organisations sans président actif",
    noDpa: "clubs sans accord de traitement signé",
    minorsWithoutGuardian: "mineurs sans tuteur rattaché",
    terminationsPending: "fermetures programmées",
  },
  byCountry: "Par pays",
  todo: "À faire aujourd'hui",
  todoNone: "Rien à signaler.",
  todoKeys: {
    noPresident: "Sans président actif",
    inactive60: "Clubs sans activité depuis 60 jours",
    seasonEnding: "Saison qui se termine sous 30 jours sans suivante",
    dataRequestsLate: "Demandes RGPD hors délai",
    terminations: "Fermetures programmées",
    apiKeysIdle: "Clés d'API inutilisées depuis 90 jours",
    noDpa: "Clubs sans accord de traitement",
  },
  more: "et {n} de plus",
  recentActions: "Dernières interventions",
  recentNone: "Aucune intervention pour l'instant.",
  actionKinds: { note: "Note interne", "operator.add": "Opérateur ajouté", "operator.revoke": "Opérateur retiré" },
  billingSoon: "La facturation des abonnements et les relances viendront dans une étape suivante : rien n'est encore facturé depuis la console.",
  organizations: {
    search: "Rechercher une organisation",
    kind: "Type",
    allKinds: "Clubs et fédérations",
    club: "Club",
    federation: "Fédération",
    country: "Pays",
    allCountries: "Tous les pays",
    columns: { name: "Organisation", country: "Pays", federation: "Fédération", members: "Membres", players: "Joueurs", presidents: "Présidents", lastActivity: "Dernière activité", created: "Créée le" },
    none: "Aucune organisation ne correspond.",
    never: "jamais",
    count: "{n} organisation(s)",
  },
  organization: {
    back: "Toutes les organisations",
    facts: "En chiffres",
    members: "Membres actifs",
    players: "Joueurs actifs",
    coaches: "Coachs",
    teams: "Équipes",
    clubs: "Clubs affiliés",
    created: "Créée le",
    lastActivity: "Dernière activité",
    actions30: "Actions sur 30 jours",
    storage: "Stockage",
    disabledModules: "Modules désactivés",
    dpa: "Accord de traitement signé le",
    dpaNone: "Accord de traitement : non signé",
    dataRequestsOpen: "Demandes RGPD en cours",
    termination: "Fermeture programmée le",
    apiKeys: "Clés d'API actives",
    officers: "Responsables",
    officersNone: "Aucun responsable actif.",
    officerRoles: { club_president: "Président", federation_president: "Président de fédération", federation_worker: "Délégué" },
    notes: "Notes internes",
    notesNone: "Aucune note.",
    noteAdd: "Nouvelle note (jamais visible par l'organisation)",
    noteSave: "Ajouter la note",
    noteSaved: "Note ajoutée.",
    interventions: "Interventions",
    interventionsNone: "Aucune intervention.",
    readOnly: "Lecture seule : les rôles Support et Propriétaire écrivent.",
  },
  supervision: {
    jobs: "Tâches planifiées",
    jobColumns: { job: "Tâche", every: "Cadence", lastRun: "Dernière exécution", lastOk: "Dernier succès", state: "État" },
    late: "En retard",
    ok: "À l'heure",
    never: "jamais",
    minutes: "toutes les {n} min",
    mails: "E-mails sur 7 jours",
    mailsNone: "Aucun e-mail sur 7 jours.",
    storage: "Stockage par organisation",
    storageNone: "Aucun fichier.",
    files: "{n} fichier(s)",
    migrations: "Dernières migrations",
    migrationsNone: "Migrations non suivies dans cette base.",
    feedback: "Signalements ouverts",
    feedbackNone: "Aucun signalement ouvert.",
    feedbackKinds: { bug: "Problème", idea: "Idée", text: "Texte" },
    feedbackStates: { received: "Reçu", in_progress: "En cours", fixed: "Corrigé" },
    issue: "ticket #{n}",
    dataRequests: "Demandes RGPD en cours",
    dataRequestsNone: "Aucune demande en cours.",
    dataRequestKinds: { access: "Accès", rectification: "Rectification", erasure: "Effacement" },
    dataRequestStates: { received: "Reçue", in_progress: "En cours", done: "Traitée", refused: "Refusée" },
    dueOn: "échéance {day}",
  },
  operators: {
    intro: "Les opérateurs n'ont aucun mandat dans un club. Le propriétaire ajoute un compte existant par son e-mail et choisit son rôle.",
    fromEnvironment: "{n} adresse(s) propriétaire(s) définie(s) dans la configuration du serveur.",
    columns: { name: "Nom", email: "E-mail", role: "Rôle", since: "Depuis" },
    none: "Aucun opérateur enregistré.",
    add: "Ajouter un opérateur",
    email: "E-mail du compte",
    role: "Rôle",
    save: "Ajouter",
    saved: "Opérateur ajouté.",
    revoke: "Retirer",
    revoked: "Opérateur retiré.",
    revokedBadge: "Retiré",
    ownerOnly: "Seul le propriétaire gère les opérateurs.",
  },
};
const nl: Copy = {
  title: "Console van het platform",
  badge: "Console",
  intro: "Tellingen en toestanden van alle organisaties, gezondheid van de dienst, support en conformiteit. Geen persoonsgegevens van spelers: de console leest cijfers, en elke tussenkomst wordt gelogd.",
  backToApp: "Terug naar de toepassing",
  denied: "Deze console is voorbehouden aan de beheerders van het platform.",
  tabs: { home: "Dashboard", organizations: "Organisaties", supervision: "Toezicht", operators: "Beheerders" },
  roles: { owner: "Eigenaar", support: "Support", finance: "Financiën", readonly: "Alleen lezen" },
  signedAs: "{name} · {role}",
  generated: "Cijfers om {time}",
  tiles: {
    organizations: "Organisaties",
    organizationsHint: "Clubs en federaties op het platform",
    clubs: "clubs",
    federations: "federaties",
    newThisMonth: "nieuw deze maand",
    people: "Personen",
    accounts: "actieve accounts",
    players: "actieve spelers",
    coaches: "trainers",
    referees: "scheidsrechters",
    licences: "actieve licenties",
    activity: "Activiteit",
    active7: "actief in 7 dagen",
    active30: "actief in 30 dagen",
    matches30: "gespeelde wedstrijden in 30 dagen",
    mails7: "verzonden e-mails in 7 dagen",
    storage: "opslag",
    health: "Gezondheid",
    jobsLate: "taken te laat",
    jobsOk: "geplande taken op tijd",
    mailsOverdue: "e-mails al meer dan 30 minuten in wacht",
    mailsFailed: "mislukte e-mails in 7 dagen",
    lastMigration: "Laatste migratie: {name}",
    noMigration: "Migraties: niet gevolgd in deze databank",
    support: "Support",
    feedbackOpen: "open meldingen",
    feedbackWeek: "ontvangen deze week",
    dataRequestsOpen: "lopende AVG-verzoeken",
    dataRequestsLate: "voorbij de termijn van 30 dagen",
    compliance: "Conformiteit",
    noPresident: "organisaties zonder actieve voorzitter",
    noDpa: "clubs zonder getekende verwerkersovereenkomst",
    minorsWithoutGuardian: "minderjarigen zonder gekoppelde voogd",
    terminationsPending: "geplande sluitingen",
  },
  byCountry: "Per land",
  todo: "Vandaag te doen",
  todoNone: "Niets te melden.",
  todoKeys: {
    noPresident: "Zonder actieve voorzitter",
    inactive60: "Clubs zonder activiteit sinds 60 dagen",
    seasonEnding: "Seizoen dat binnen 30 dagen eindigt zonder volgend",
    dataRequestsLate: "AVG-verzoeken buiten termijn",
    terminations: "Geplande sluitingen",
    apiKeysIdle: "API-sleutels ongebruikt sinds 90 dagen",
    noDpa: "Clubs zonder verwerkersovereenkomst",
  },
  more: "en {n} meer",
  recentActions: "Laatste tussenkomsten",
  recentNone: "Nog geen tussenkomst.",
  actionKinds: { note: "Interne nota", "operator.add": "Beheerder toegevoegd", "operator.revoke": "Beheerder verwijderd" },
  billingSoon: "De facturatie van abonnementen en de herinneringen komen in een volgende stap: er wordt nog niets gefactureerd vanuit de console.",
  organizations: {
    search: "Een organisatie zoeken",
    kind: "Type",
    allKinds: "Clubs en federaties",
    club: "Club",
    federation: "Federatie",
    country: "Land",
    allCountries: "Alle landen",
    columns: { name: "Organisatie", country: "Land", federation: "Federatie", members: "Leden", players: "Spelers", presidents: "Voorzitters", lastActivity: "Laatste activiteit", created: "Aangemaakt op" },
    none: "Geen organisatie komt overeen.",
    never: "nooit",
    count: "{n} organisatie(s)",
  },
  organization: {
    back: "Alle organisaties",
    facts: "In cijfers",
    members: "Actieve leden",
    players: "Actieve spelers",
    coaches: "Trainers",
    teams: "Ploegen",
    clubs: "Aangesloten clubs",
    created: "Aangemaakt op",
    lastActivity: "Laatste activiteit",
    actions30: "Acties in 30 dagen",
    storage: "Opslag",
    disabledModules: "Uitgeschakelde modules",
    dpa: "Verwerkersovereenkomst getekend op",
    dpaNone: "Verwerkersovereenkomst: niet getekend",
    dataRequestsOpen: "Lopende AVG-verzoeken",
    termination: "Sluiting gepland op",
    apiKeys: "Actieve API-sleutels",
    officers: "Verantwoordelijken",
    officersNone: "Geen actieve verantwoordelijke.",
    officerRoles: { club_president: "Voorzitter", federation_president: "Federatievoorzitter", federation_worker: "Afgevaardigde" },
    notes: "Interne nota's",
    notesNone: "Geen nota.",
    noteAdd: "Nieuwe nota (nooit zichtbaar voor de organisatie)",
    noteSave: "Nota toevoegen",
    noteSaved: "Nota toegevoegd.",
    interventions: "Tussenkomsten",
    interventionsNone: "Geen tussenkomst.",
    readOnly: "Alleen lezen: de rollen Support en Eigenaar schrijven.",
  },
  supervision: {
    jobs: "Geplande taken",
    jobColumns: { job: "Taak", every: "Ritme", lastRun: "Laatste uitvoering", lastOk: "Laatste succes", state: "Toestand" },
    late: "Te laat",
    ok: "Op tijd",
    never: "nooit",
    minutes: "elke {n} min",
    mails: "E-mails in 7 dagen",
    mailsNone: "Geen e-mail in 7 dagen.",
    storage: "Opslag per organisatie",
    storageNone: "Geen bestand.",
    files: "{n} bestand(en)",
    migrations: "Laatste migraties",
    migrationsNone: "Migraties niet gevolgd in deze databank.",
    feedback: "Open meldingen",
    feedbackNone: "Geen open melding.",
    feedbackKinds: { bug: "Probleem", idea: "Idee", text: "Tekst" },
    feedbackStates: { received: "Ontvangen", in_progress: "Bezig", fixed: "Opgelost" },
    issue: "ticket #{n}",
    dataRequests: "Lopende AVG-verzoeken",
    dataRequestsNone: "Geen lopend verzoek.",
    dataRequestKinds: { access: "Inzage", rectification: "Verbetering", erasure: "Wissing" },
    dataRequestStates: { received: "Ontvangen", in_progress: "Bezig", done: "Afgehandeld", refused: "Geweigerd" },
    dueOn: "termijn {day}",
  },
  operators: {
    intro: "Beheerders hebben geen mandaat in een club. De eigenaar voegt een bestaand account toe via zijn e-mail en kiest zijn rol.",
    fromEnvironment: "{n} eigenaarsadres(sen) vastgelegd in de serverconfiguratie.",
    columns: { name: "Naam", email: "E-mail", role: "Rol", since: "Sinds" },
    none: "Geen beheerder geregistreerd.",
    add: "Een beheerder toevoegen",
    email: "E-mail van het account",
    role: "Rol",
    save: "Toevoegen",
    saved: "Beheerder toegevoegd.",
    revoke: "Verwijderen",
    revoked: "Beheerder verwijderd.",
    revokedBadge: "Verwijderd",
    ownerOnly: "Alleen de eigenaar beheert de beheerders.",
  },
};
const en: Copy = {
  title: "Platform console",
  badge: "Console",
  intro: "Counts and states of every organisation, health of the service, support and compliance. No player's personal data: the console reads figures, and every intervention is journaled.",
  backToApp: "Back to the application",
  denied: "This console is for the platform's operators.",
  tabs: { home: "Dashboard", organizations: "Organisations", supervision: "Supervision", operators: "Operators" },
  roles: { owner: "Owner", support: "Support", finance: "Finance", readonly: "Read only" },
  signedAs: "{name} · {role}",
  generated: "Figures at {time}",
  tiles: {
    organizations: "Organisations",
    organizationsHint: "Clubs and federations on the platform",
    clubs: "clubs",
    federations: "federations",
    newThisMonth: "new this month",
    people: "People",
    accounts: "active accounts",
    players: "active players",
    coaches: "coaches",
    referees: "referees",
    licences: "active licences",
    activity: "Activity",
    active7: "active over 7 days",
    active30: "active over 30 days",
    matches30: "matches played over 30 days",
    mails7: "e-mails sent over 7 days",
    storage: "storage",
    health: "Health",
    jobsLate: "tasks late",
    jobsOk: "scheduled tasks on time",
    mailsOverdue: "e-mails waiting for more than 30 minutes",
    mailsFailed: "e-mails failed over 7 days",
    lastMigration: "Last migration: {name}",
    noMigration: "Migrations: not tracked in this database",
    support: "Support",
    feedbackOpen: "open reports",
    feedbackWeek: "received this week",
    dataRequestsOpen: "GDPR requests in progress",
    dataRequestsLate: "past the 30-day deadline",
    compliance: "Compliance",
    noPresident: "organisations without an active president",
    noDpa: "clubs without a signed processing agreement",
    minorsWithoutGuardian: "minors without a linked guardian",
    terminationsPending: "closures scheduled",
  },
  byCountry: "By country",
  todo: "To do today",
  todoNone: "Nothing to report.",
  todoKeys: {
    noPresident: "Without an active president",
    inactive60: "Clubs without activity for 60 days",
    seasonEnding: "Season ending within 30 days without a next one",
    dataRequestsLate: "GDPR requests past their deadline",
    terminations: "Closures scheduled",
    apiKeysIdle: "API keys unused for 90 days",
    noDpa: "Clubs without a processing agreement",
  },
  more: "and {n} more",
  recentActions: "Latest interventions",
  recentNone: "No intervention yet.",
  actionKinds: { note: "Internal note", "operator.add": "Operator added", "operator.revoke": "Operator revoked" },
  billingSoon: "Subscription billing and reminders come in a later step: nothing is billed from the console yet.",
  organizations: {
    search: "Search an organisation",
    kind: "Kind",
    allKinds: "Clubs and federations",
    club: "Club",
    federation: "Federation",
    country: "Country",
    allCountries: "All countries",
    columns: { name: "Organisation", country: "Country", federation: "Federation", members: "Members", players: "Players", presidents: "Presidents", lastActivity: "Last activity", created: "Created on" },
    none: "No organisation matches.",
    never: "never",
    count: "{n} organisation(s)",
  },
  organization: {
    back: "All organisations",
    facts: "In figures",
    members: "Active members",
    players: "Active players",
    coaches: "Coaches",
    teams: "Teams",
    clubs: "Affiliated clubs",
    created: "Created on",
    lastActivity: "Last activity",
    actions30: "Actions over 30 days",
    storage: "Storage",
    disabledModules: "Disabled modules",
    dpa: "Processing agreement signed on",
    dpaNone: "Processing agreement: not signed",
    dataRequestsOpen: "GDPR requests in progress",
    termination: "Closure scheduled on",
    apiKeys: "Active API keys",
    officers: "Officers",
    officersNone: "No active officer.",
    officerRoles: { club_president: "President", federation_president: "Federation president", federation_worker: "Delegate" },
    notes: "Internal notes",
    notesNone: "No note.",
    noteAdd: "New note (never shown to the organisation)",
    noteSave: "Add the note",
    noteSaved: "Note added.",
    interventions: "Interventions",
    interventionsNone: "No intervention.",
    readOnly: "Read only: the Support and Owner roles write.",
  },
  supervision: {
    jobs: "Scheduled tasks",
    jobColumns: { job: "Task", every: "Cadence", lastRun: "Last run", lastOk: "Last success", state: "State" },
    late: "Late",
    ok: "On time",
    never: "never",
    minutes: "every {n} min",
    mails: "E-mails over 7 days",
    mailsNone: "No e-mail over 7 days.",
    storage: "Storage by organisation",
    storageNone: "No file.",
    files: "{n} file(s)",
    migrations: "Latest migrations",
    migrationsNone: "Migrations not tracked in this database.",
    feedback: "Open reports",
    feedbackNone: "No open report.",
    feedbackKinds: { bug: "Problem", idea: "Idea", text: "Text" },
    feedbackStates: { received: "Received", in_progress: "In progress", fixed: "Fixed" },
    issue: "ticket #{n}",
    dataRequests: "GDPR requests in progress",
    dataRequestsNone: "No request in progress.",
    dataRequestKinds: { access: "Access", rectification: "Rectification", erasure: "Erasure" },
    dataRequestStates: { received: "Received", in_progress: "In progress", done: "Done", refused: "Refused" },
    dueOn: "due {day}",
  },
  operators: {
    intro: "Operators hold no mandate in a club. The owner adds an existing account by its e-mail and chooses its role.",
    fromEnvironment: "{n} owner address(es) set in the server configuration.",
    columns: { name: "Name", email: "E-mail", role: "Role", since: "Since" },
    none: "No operator recorded.",
    add: "Add an operator",
    email: "E-mail of the account",
    role: "Role",
    save: "Add",
    saved: "Operator added.",
    revoke: "Revoke",
    revoked: "Operator revoked.",
    revokedBadge: "Revoked",
    ownerOnly: "Only the owner manages the operators.",
  },
};
export const consoleCopy: Record<Locale, Copy> = { fr, nl, en };
