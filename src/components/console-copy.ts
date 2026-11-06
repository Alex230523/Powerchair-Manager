import type { Locale } from "@/lib/locale";

/** Console, step 1 (05/11/2026): the platform operator's console. */
type Copy = {
  title: string;
  badge: string;
  intro: string;
  backToApp: string;
  denied: string;
  cancel: string;
  tabs: Record<"home" | "organizations" | "billing" | "supervision" | "operators", string>;
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
    billing: string;
    invoicedMonth: string;
    paidMonth: string;
    open: string;
    late: string;
    subscriptions: string;
  };
  byCountry: string;
  todo: string;
  todoNone: string;
  todoKeys: Record<"noPresident" | "inactive60" | "seasonEnding" | "dataRequestsLate" | "terminations" | "apiKeysIdle" | "noDpa" | "suspended" | "invoicesLate", string>;
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
    suspended: string;
    suspendedSince: string;
    suspend: string;
    suspendReason: string;
    suspendConfirm: string;
    suspendDone: string;
    reinstate: string;
    reinstateDone: string;
    subscription: string;
    subscriptionNone: string;
    subscribe: string;
    plan: string;
    startedOn: string;
    note: string;
    subscribed: string;
    unsubscribe: string;
    unsubscribed: string;
    invoicesOf: string;
  };
  billing: {
    intro: string;
    readOnly: string;
    figures: { mrr: string; invoicedMonth: string; paidMonth: string; open: string; late: string };
    plans: string;
    plansNone: string;
    planAdd: string;
    planEdit: string;
    code: string;
    name: string;
    amount: string;
    period: string;
    periods: Record<"month" | "year", string>;
    basis: string;
    bases: Record<"organization" | "player", string>;
    active: string;
    inactive: string;
    subscribers: string;
    save: string;
    saved: string;
    subscriptions: string;
    subscriptionsNone: string;
    invoiceFor: string;
    periodFrom: string;
    periodTo: string;
    dueDays: string;
    createInvoice: string;
    invoiceCreated: string;
    lastInvoiced: string;
    neverInvoiced: string;
    ended: string;
    invoices: string;
    invoicesNone: string;
    filterState: string;
    allStates: string;
    states: Record<"draft" | "sent" | "paid" | "cancelled", string>;
    late: string;
    columns: { number: string; organization: string; label: string; amount: string; issued: string; due: string; state: string; reminders: string };
    send: string;
    sent: string;
    paid: string;
    paidOn: string;
    markPaid: string;
    markedPaid: string;
    cancel: string;
    cancelled: string;
    remind: string;
    reminded: string;
    reminderSteps: string;
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
  mcp: {
    title: string;
    intro: string;
    endpoint: string;
    howTo: string;
    keys: string;
    keysNone: string;
    name: string;
    scopes: string;
    scopeNames: Record<"console:read" | "billing:read" | "billing:write" | "support:write", string>;
    create: string;
    created: string;
    secretOnce: string;
    copy: string;
    copied: string;
    revoke: string;
    revoked: string;
    revokedBadge: string;
    calls: string;
    lastUsed: string;
    never: string;
    tools: string;
  };
};
const fr: Copy = {
  title: "Console de la plateforme",
  badge: "Console",
  intro: "Comptages et états de toutes les organisations, santé du service, support et conformité. Aucune donnée personnelle de joueur : la console lit des chiffres, et chaque intervention est journalisée.",
  backToApp: "Retour à l'application",
  denied: "Cette console est réservée aux exploitants de la plateforme.",
  cancel: "Annuler",
  tabs: { home: "Tableau de bord", organizations: "Organisations", billing: "Facturation", supervision: "Supervision", operators: "Opérateurs" },
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
    billing: "Facturation",
    invoicedMonth: "facturé ce mois",
    paidMonth: "encaissé ce mois",
    open: "à encaisser",
    late: "en retard",
    subscriptions: "abonnements en cours",
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
    suspended: "Organisations suspendues",
    invoicesLate: "Factures en retard",
  },
  more: "et {n} de plus",
  recentActions: "Dernières interventions",
  recentNone: "Aucune intervention pour l'instant.",
  actionKinds: {
    note: "Note interne",
    "operator.add": "Opérateur ajouté",
    "operator.revoke": "Opérateur retiré",
    suspend: "Suspension",
    reinstate: "Réactivation",
    "billing.plan": "Formule enregistrée",
    "billing.subscribe": "Abonnement ouvert",
    "billing.unsubscribe": "Abonnement terminé",
    "billing.invoice": "Facture créée",
    "billing.send": "Facture envoyée",
    "billing.paid": "Paiement enregistré",
    "billing.cancel": "Facture annulée",
    "billing.remind": "Rappel envoyé",
  },
  billingSoon: "Les paiements sont enregistrés à la main depuis l'onglet Facturation ; aucun prestataire de paiement n'est branché.",
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
    suspended: "Suspendue",
    suspendedSince: "Suspendue depuis le {day} : {reason}",
    suspend: "Suspendre (lecture seule)",
    suspendReason: "Raison, lue par les membres de l'organisation",
    suspendConfirm: "Suspendre l'organisation ? Ses membres passent en lecture seule et lisent la raison en haut de chaque page. L'intervention est inscrite dans leur journal.",
    suspendDone: "Organisation suspendue.",
    reinstate: "Réactiver",
    reinstateDone: "Organisation réactivée.",
    subscription: "Abonnement",
    subscriptionNone: "Aucun abonnement en cours.",
    subscribe: "Ouvrir un abonnement",
    plan: "Formule",
    startedOn: "Depuis le",
    note: "Note (facultatif)",
    subscribed: "Abonnement ouvert.",
    unsubscribe: "Terminer aujourd'hui",
    unsubscribed: "Abonnement terminé.",
    invoicesOf: "Voir ses factures",
  },
  billing: {
    intro: "Formules, abonnements, factures et rappels de la plateforme. Les paiements sont enregistrés à la main (virement avec le numéro de facture) ; les rappels partent aux présidents, à la main ou par paliers (3, 10 et 20 jours après l'échéance).",
    readOnly: "Lecture seule : les rôles Finance et Propriétaire tiennent la facturation.",
    figures: { mrr: "revenu mensuel récurrent", invoicedMonth: "facturé ce mois", paidMonth: "encaissé ce mois", open: "à encaisser", late: "en retard" },
    plans: "Formules",
    plansNone: "Aucune formule. Créez-en une pour abonner une organisation.",
    planAdd: "Nouvelle formule",
    planEdit: "Modifier",
    code: "Code",
    name: "Nom",
    amount: "Montant (euros)",
    period: "Période",
    periods: { month: "Mensuelle", year: "Annuelle" },
    basis: "Base",
    bases: { organization: "Par organisation", player: "Par joueur actif" },
    active: "Proposée",
    inactive: "Retirée",
    subscribers: "{n} abonné(s)",
    save: "Enregistrer la formule",
    saved: "Formule enregistrée.",
    subscriptions: "Abonnements",
    subscriptionsNone: "Aucun abonnement. Ouvrez-en un depuis la fiche d'une organisation.",
    invoiceFor: "Facturer une période",
    periodFrom: "Du",
    periodTo: "Au",
    dueDays: "Échéance (jours)",
    createInvoice: "Créer la facture",
    invoiceCreated: "Facture créée (brouillon).",
    lastInvoiced: "facturé jusqu'au {day}",
    neverInvoiced: "jamais facturé",
    ended: "terminé le {day}",
    invoices: "Factures",
    invoicesNone: "Aucune facture.",
    filterState: "État",
    allStates: "Tous les états",
    states: { draft: "Brouillon", sent: "Envoyée", paid: "Payée", cancelled: "Annulée" },
    late: "En retard",
    columns: { number: "Numéro", organization: "Organisation", label: "Objet", amount: "Montant", issued: "Émise", due: "Échéance", state: "État", reminders: "Rappels" },
    send: "Envoyer",
    sent: "Facture envoyée aux présidents.",
    paid: "Payée le",
    paidOn: "Date du paiement",
    markPaid: "Marquer payée",
    markedPaid: "Paiement enregistré.",
    cancel: "Annuler",
    cancelled: "Facture annulée.",
    remind: "Envoyer un rappel",
    reminded: "Rappel envoyé.",
    reminderSteps: "Rappels automatiques : courtois à J+3, ferme à J+10, préavis de lecture seule à J+20.",
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
  mcp: {
    title: "Brancher votre assistant (MCP)",
    intro: "La console expose un serveur MCP : votre Claude (bureau ou Claude Code) lit les chiffres, liste les factures en retard, prépare les rappels, et vous confirmez chaque action. Une clé par usage, avec les seules portées utiles ; chaque écriture est journalisée à votre nom.",
    endpoint: "Adresse du serveur : {url}",
    howTo: "Dans Claude, ajoutez un connecteur distant avec cette adresse et la clé en jeton Bearer. Les outils proposés dépendent des portées de la clé.",
    keys: "Vos clés",
    keysNone: "Aucune clé.",
    name: "Nom de la clé (par exemple : Claude sur mon portable)",
    scopes: "Portées",
    scopeNames: { "console:read": "Lire les chiffres, les organisations et la supervision", "billing:read": "Lire la facturation", "billing:write": "Envoyer un rappel, enregistrer un paiement", "support:write": "Ajouter une note interne" },
    create: "Créer la clé",
    created: "Clé créée.",
    secretOnce: "Copiez cette clé maintenant : elle ne sera plus affichée.",
    copy: "Copier la clé",
    copied: "Clé copiée.",
    revoke: "Révoquer",
    revoked: "Clé révoquée.",
    revokedBadge: "Révoquée",
    calls: "{n} appel(s)",
    lastUsed: "dernier appel {day}",
    never: "jamais utilisée",
    tools: "Outils : vue d'ensemble, organisations, fiche, supervision, facturation, factures, rappel, paiement, note.",
  },
};
const nl: Copy = {
  title: "Console van het platform",
  badge: "Console",
  intro: "Tellingen en toestanden van alle organisaties, gezondheid van de dienst, support en conformiteit. Geen persoonsgegevens van spelers: de console leest cijfers, en elke tussenkomst wordt gelogd.",
  backToApp: "Terug naar de toepassing",
  denied: "Deze console is voorbehouden aan de beheerders van het platform.",
  cancel: "Annuleren",
  tabs: { home: "Dashboard", organizations: "Organisaties", billing: "Facturatie", supervision: "Toezicht", operators: "Beheerders" },
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
    billing: "Facturatie",
    invoicedMonth: "gefactureerd deze maand",
    paidMonth: "geïnd deze maand",
    open: "te innen",
    late: "te laat",
    subscriptions: "lopende abonnementen",
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
    suspended: "Geschorste organisaties",
    invoicesLate: "Facturen te laat",
  },
  more: "en {n} meer",
  recentActions: "Laatste tussenkomsten",
  recentNone: "Nog geen tussenkomst.",
  actionKinds: {
    note: "Interne nota",
    "operator.add": "Beheerder toegevoegd",
    "operator.revoke": "Beheerder verwijderd",
    suspend: "Schorsing",
    reinstate: "Heractivering",
    "billing.plan": "Formule opgeslagen",
    "billing.subscribe": "Abonnement geopend",
    "billing.unsubscribe": "Abonnement beëindigd",
    "billing.invoice": "Factuur aangemaakt",
    "billing.send": "Factuur verzonden",
    "billing.paid": "Betaling geregistreerd",
    "billing.cancel": "Factuur geannuleerd",
    "billing.remind": "Herinnering verzonden",
  },
  billingSoon: "Betalingen worden met de hand geregistreerd in het tabblad Facturatie; er is geen betaaldienst gekoppeld.",
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
    suspended: "Geschorst",
    suspendedSince: "Geschorst sinds {day}: {reason}",
    suspend: "Schorsen (alleen lezen)",
    suspendReason: "Reden, gelezen door de leden van de organisatie",
    suspendConfirm: "De organisatie schorsen? Haar leden gaan naar alleen-lezen en lezen de reden bovenaan elke pagina. De tussenkomst komt in hun logboek.",
    suspendDone: "Organisatie geschorst.",
    reinstate: "Heractiveren",
    reinstateDone: "Organisatie geheractiveerd.",
    subscription: "Abonnement",
    subscriptionNone: "Geen lopend abonnement.",
    subscribe: "Een abonnement openen",
    plan: "Formule",
    startedOn: "Sinds",
    note: "Nota (facultatief)",
    subscribed: "Abonnement geopend.",
    unsubscribe: "Vandaag beëindigen",
    unsubscribed: "Abonnement beëindigd.",
    invoicesOf: "Haar facturen bekijken",
  },
  billing: {
    intro: "Formules, abonnementen, facturen en herinneringen van het platform. Betalingen worden met de hand geregistreerd (overschrijving met het factuurnummer); herinneringen gaan naar de voorzitters, met de hand of in stappen (3, 10 en 20 dagen na de vervaldag).",
    readOnly: "Alleen lezen: de rollen Financiën en Eigenaar houden de facturatie bij.",
    figures: { mrr: "maandelijks terugkerende omzet", invoicedMonth: "gefactureerd deze maand", paidMonth: "geïnd deze maand", open: "te innen", late: "te laat" },
    plans: "Formules",
    plansNone: "Geen formule. Maak er een om een organisatie te abonneren.",
    planAdd: "Nieuwe formule",
    planEdit: "Wijzigen",
    code: "Code",
    name: "Naam",
    amount: "Bedrag (euro)",
    period: "Periode",
    periods: { month: "Maandelijks", year: "Jaarlijks" },
    basis: "Basis",
    bases: { organization: "Per organisatie", player: "Per actieve speler" },
    active: "Aangeboden",
    inactive: "Ingetrokken",
    subscribers: "{n} abonnee(s)",
    save: "Formule opslaan",
    saved: "Formule opgeslagen.",
    subscriptions: "Abonnementen",
    subscriptionsNone: "Geen abonnement. Open er een vanuit de fiche van een organisatie.",
    invoiceFor: "Een periode factureren",
    periodFrom: "Van",
    periodTo: "Tot",
    dueDays: "Vervaldag (dagen)",
    createInvoice: "Factuur aanmaken",
    invoiceCreated: "Factuur aangemaakt (ontwerp).",
    lastInvoiced: "gefactureerd tot {day}",
    neverInvoiced: "nooit gefactureerd",
    ended: "beëindigd op {day}",
    invoices: "Facturen",
    invoicesNone: "Geen factuur.",
    filterState: "Toestand",
    allStates: "Alle toestanden",
    states: { draft: "Ontwerp", sent: "Verzonden", paid: "Betaald", cancelled: "Geannuleerd" },
    late: "Te laat",
    columns: { number: "Nummer", organization: "Organisatie", label: "Omschrijving", amount: "Bedrag", issued: "Uitgereikt", due: "Vervaldag", state: "Toestand", reminders: "Herinneringen" },
    send: "Verzenden",
    sent: "Factuur verzonden naar de voorzitters.",
    paid: "Betaald op",
    paidOn: "Datum van betaling",
    markPaid: "Als betaald markeren",
    markedPaid: "Betaling geregistreerd.",
    cancel: "Annuleren",
    cancelled: "Factuur geannuleerd.",
    remind: "Een herinnering sturen",
    reminded: "Herinnering verzonden.",
    reminderSteps: "Automatische herinneringen: vriendelijk op D+3, kordaat op D+10, vooraankondiging alleen-lezen op D+20.",
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
  mcp: {
    title: "Uw assistent koppelen (MCP)",
    intro: "De console biedt een MCP-server: uw Claude (desktop of Claude Code) leest de cijfers, lijst de te late facturen op, bereidt de herinneringen voor, en u bevestigt elke actie. Eén sleutel per gebruik, met enkel de nuttige rechten; elke schrijfactie wordt op uw naam gelogd.",
    endpoint: "Adres van de server: {url}",
    howTo: "Voeg in Claude een externe connector toe met dit adres en de sleutel als Bearer-token. De aangeboden tools hangen af van de rechten van de sleutel.",
    keys: "Uw sleutels",
    keysNone: "Geen sleutel.",
    name: "Naam van de sleutel (bijvoorbeeld: Claude op mijn laptop)",
    scopes: "Rechten",
    scopeNames: { "console:read": "Cijfers, organisaties en toezicht lezen", "billing:read": "Facturatie lezen", "billing:write": "Een herinnering sturen, een betaling registreren", "support:write": "Een interne nota toevoegen" },
    create: "Sleutel aanmaken",
    created: "Sleutel aangemaakt.",
    secretOnce: "Kopieer deze sleutel nu: ze wordt niet meer getoond.",
    copy: "Sleutel kopiëren",
    copied: "Sleutel gekopieerd.",
    revoke: "Intrekken",
    revoked: "Sleutel ingetrokken.",
    revokedBadge: "Ingetrokken",
    calls: "{n} oproep(en)",
    lastUsed: "laatste oproep {day}",
    never: "nooit gebruikt",
    tools: "Tools: overzicht, organisaties, fiche, toezicht, facturatie, facturen, herinnering, betaling, nota.",
  },
};
const en: Copy = {
  title: "Platform console",
  badge: "Console",
  intro: "Counts and states of every organisation, health of the service, support and compliance. No player's personal data: the console reads figures, and every intervention is journaled.",
  backToApp: "Back to the application",
  denied: "This console is for the platform's operators.",
  cancel: "Cancel",
  tabs: { home: "Dashboard", organizations: "Organisations", billing: "Billing", supervision: "Supervision", operators: "Operators" },
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
    billing: "Billing",
    invoicedMonth: "invoiced this month",
    paidMonth: "collected this month",
    open: "to collect",
    late: "late",
    subscriptions: "running subscriptions",
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
    suspended: "Suspended organisations",
    invoicesLate: "Invoices late",
  },
  more: "and {n} more",
  recentActions: "Latest interventions",
  recentNone: "No intervention yet.",
  actionKinds: {
    note: "Internal note",
    "operator.add": "Operator added",
    "operator.revoke": "Operator revoked",
    suspend: "Suspension",
    reinstate: "Reinstatement",
    "billing.plan": "Plan saved",
    "billing.subscribe": "Subscription opened",
    "billing.unsubscribe": "Subscription ended",
    "billing.invoice": "Invoice created",
    "billing.send": "Invoice sent",
    "billing.paid": "Payment recorded",
    "billing.cancel": "Invoice cancelled",
    "billing.remind": "Reminder sent",
  },
  billingSoon: "Payments are recorded by hand in the Billing tab; no payment provider is connected.",
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
    suspended: "Suspended",
    suspendedSince: "Suspended since {day}: {reason}",
    suspend: "Suspend (read only)",
    suspendReason: "Reason, read by the organisation's members",
    suspendConfirm: "Suspend the organisation? Its members become read only and read the reason at the top of every page. The intervention is written in their journal.",
    suspendDone: "Organisation suspended.",
    reinstate: "Reinstate",
    reinstateDone: "Organisation reinstated.",
    subscription: "Subscription",
    subscriptionNone: "No running subscription.",
    subscribe: "Open a subscription",
    plan: "Plan",
    startedOn: "Since",
    note: "Note (optional)",
    subscribed: "Subscription opened.",
    unsubscribe: "End today",
    unsubscribed: "Subscription ended.",
    invoicesOf: "See its invoices",
  },
  billing: {
    intro: "Plans, subscriptions, invoices and reminders of the platform. Payments are recorded by hand (transfer with the invoice number); reminders go to the presidents, by hand or by steps (3, 10 and 20 days after the due date).",
    readOnly: "Read only: the Finance and Owner roles keep the billing.",
    figures: { mrr: "monthly recurring revenue", invoicedMonth: "invoiced this month", paidMonth: "collected this month", open: "to collect", late: "late" },
    plans: "Plans",
    plansNone: "No plan. Create one to subscribe an organisation.",
    planAdd: "New plan",
    planEdit: "Edit",
    code: "Code",
    name: "Name",
    amount: "Amount (euros)",
    period: "Period",
    periods: { month: "Monthly", year: "Yearly" },
    basis: "Basis",
    bases: { organization: "Per organisation", player: "Per active player" },
    active: "Offered",
    inactive: "Withdrawn",
    subscribers: "{n} subscriber(s)",
    save: "Save the plan",
    saved: "Plan saved.",
    subscriptions: "Subscriptions",
    subscriptionsNone: "No subscription. Open one from an organisation's sheet.",
    invoiceFor: "Invoice a period",
    periodFrom: "From",
    periodTo: "To",
    dueDays: "Due (days)",
    createInvoice: "Create the invoice",
    invoiceCreated: "Invoice created (draft).",
    lastInvoiced: "invoiced up to {day}",
    neverInvoiced: "never invoiced",
    ended: "ended on {day}",
    invoices: "Invoices",
    invoicesNone: "No invoice.",
    filterState: "State",
    allStates: "All states",
    states: { draft: "Draft", sent: "Sent", paid: "Paid", cancelled: "Cancelled" },
    late: "Late",
    columns: { number: "Number", organization: "Organisation", label: "Subject", amount: "Amount", issued: "Issued", due: "Due", state: "State", reminders: "Reminders" },
    send: "Send",
    sent: "Invoice sent to the presidents.",
    paid: "Paid on",
    paidOn: "Date of payment",
    markPaid: "Mark paid",
    markedPaid: "Payment recorded.",
    cancel: "Cancel",
    cancelled: "Invoice cancelled.",
    remind: "Send a reminder",
    reminded: "Reminder sent.",
    reminderSteps: "Automatic reminders: courteous at D+3, firm at D+10, read-only notice at D+20.",
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
  mcp: {
    title: "Connect your assistant (MCP)",
    intro: "The console exposes an MCP server: your Claude (desktop or Claude Code) reads the figures, lists the late invoices, prepares the reminders, and you confirm each action. One key per use, with the useful scopes only; every write is journaled in your name.",
    endpoint: "Server address: {url}",
    howTo: "In Claude, add a remote connector with this address and the key as Bearer token. The tools offered depend on the key's scopes.",
    keys: "Your keys",
    keysNone: "No key.",
    name: "Name of the key (for example: Claude on my laptop)",
    scopes: "Scopes",
    scopeNames: { "console:read": "Read figures, organisations and supervision", "billing:read": "Read billing", "billing:write": "Send a reminder, record a payment", "support:write": "Add an internal note" },
    create: "Create the key",
    created: "Key created.",
    secretOnce: "Copy this key now: it will not be shown again.",
    copy: "Copy the key",
    copied: "Key copied.",
    revoke: "Revoke",
    revoked: "Key revoked.",
    revokedBadge: "Revoked",
    calls: "{n} call(s)",
    lastUsed: "last call {day}",
    never: "never used",
    tools: "Tools: overview, organisations, sheet, supervision, billing, invoices, reminder, payment, note.",
  },
};
export const consoleCopy: Record<Locale, Copy> = { fr, nl, en };
