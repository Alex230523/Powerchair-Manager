import type { Locale } from "@/lib/locale";

/** Console, step 1 (05/11/2026): the platform operator's console. */
type Copy = {
  title: string;
  badge: string;
  intro: string;
  backToApp: string;
  denied: string;
  cancel: string;
  tabs: Record<"home" | "organizations" | "billing" | "support" | "supervision" | "operators" | "assistant", string>;
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
    ticketsOpen: string;
    ticketsWaiting24: string;
    firstReplyHours: string;
    firstReplyNone: string;
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
  delta30: string;
  trends: string;
  trendsNone: string;
  month: string;
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
    borrow: string;
    borrowIntro: string;
    borrowReason: string;
    borrowMinutes: string;
    borrowConfirm: string;
    borrowDone: string;
    borrowOpen: string;
    borrowGo: string;
    borrowEnd: string;
    borrowEnded: string;
    borrows: string;
    borrowsNone: string;
    borrowLine: string;
    borrowActive: string;
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
    mollieOn: string;
    mollieTest: string;
    mollieOff: string;
    ubl: string;
    paidVia: Record<"manual" | "mollie", string>;
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
  supportDesk: {
    intro: string;
    readOnly: string;
    counts: string;
    firstReply: string;
    firstReplyNone: string;
    filter: string;
    all: string;
    search: string;
    columns: { subject: string; from: string; state: string; priority: string; last: string; assigned: string };
    states: Record<"open" | "answered" | "closed", string>;
    categories: Record<"question" | "billing" | "bug" | "data" | "other", string>;
    priorities: Record<"low" | "normal" | "high", string>;
    none: string;
    open: string;
    back: string;
    thread: string;
    operator: string;
    reply: string;
    template: string;
    noTemplate: string;
    send: string;
    sendClose: string;
    assignMe: string;
    unassign: string;
    close: string;
    reopen: string;
    told: string;
    log: string;
    logKinds: Record<string, string>;
    templates: string;
    templatesIntro: string;
    templateName: string;
    templateFr: string;
    templateNl: string;
    templateEn: string;
    saveTemplate: string;
    archiveTemplate: string;
    templatesNone: string;
    privacy: string;
    privacyIntro: string;
    privacyNone: string;
    daysLeft: string;
    dueToday: string;
    overdue: string;
    remind: string;
    reminded: string;
    notices: string;
    certificates: string;
  };
  assistant: {
    intro: string;
    off: string;
    model: string;
    usage: string;
    toolsRead: string;
    toolsWrite: string;
    placeholder: string;
    send: string;
    thinking: string;
    you: string;
    assistant: string;
    pending: string;
    pendingIntro: string;
    approve: string;
    refuse: string;
    clear: string;
    examples: string;
    exampleList: string[];
  };
  alerts: {
    title: string;
    intro: string;
    email: string;
    hour: string;
    rules: string;
    ruleNames: Record<"jobsLate" | "mailsOverdue" | "dataRequestsLate" | "invoicesFinalReminder" | "noPresident" | "suspended" | "feedbackNew" | "terminations" | "ticketsWaiting", string>;
    save: string;
    saved: string;
    now: string;
    nowNone: string;
    last: string;
    lastNone: string;
  };
  reports: {
    title: string;
    intro: string;
    none: string;
    download: string;
    generate: string;
    generated: string;
    monthOf: string;
    line: string;
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
  tabs: { home: "Tableau de bord", organizations: "Organisations", billing: "Facturation", support: "Support", supervision: "Supervision", operators: "Opérateurs", assistant: "Assistant" },
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
    ticketsOpen: "tickets en attente de réponse",
    ticketsWaiting24: "sans réponse depuis plus de 24 h",
    firstReplyHours: "h avant la première réponse (médiane sur 30 jours)",
    firstReplyNone: "première réponse : pas encore de mesure",
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
  delta30: "sur 30 jours",
  trends: "Tendances sur douze mois",
  trendsNone: "Les relevés quotidiens commencent aujourd'hui : les tendances apparaîtront au fil des jours.",
  month: "Mois",
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
  billingSoon: "Les paiements se suivent dans l'onglet Facturation ; en ligne par Mollie quand il est branché, à la main sinon.",
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
    borrow: "Ouvrir comme président (support)",
    borrowIntro: "Vous entrez dans l'organisation avec un mandat de président limité dans le temps. La présidence est prévenue par notification avec votre nom et la raison ; tout ce que vous faites est dans son journal. Vous terminez l'accès dès que possible.",
    borrowReason: "Raison, lue par la présidence",
    borrowMinutes: "Durée (minutes)",
    borrowConfirm: "Ouvrir l'accès",
    borrowDone: "Accès de support ouvert.",
    borrowOpen: "Accès de support ouvert jusqu'à {time}",
    borrowGo: "Passer dans l'organisation",
    borrowEnd: "Terminer l'accès",
    borrowEnded: "Accès de support terminé.",
    borrows: "Accès de support",
    borrowsNone: "Aucun accès de support.",
    borrowLine: "{operator} · {start} · {reason}",
    borrowActive: "En cours",
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
    mollieOn: "Mollie branché : chaque facture envoyée porte un lien de paiement, le paiement en ligne est confirmé tout seul.",
    mollieTest: "Mollie en mode test (clé test_) : les paiements ne sont pas réels.",
    mollieOff: "Mollie n'est pas branché (MOLLIE_API_KEY absente) : les paiements sont enregistrés à la main.",
    ubl: "UBL",
    paidVia: { manual: "virement", mollie: "en ligne" },
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
  supportDesk: {
    intro: "Les demandes écrites au support depuis l'application, par les présidences comme par les membres. Le texte d'un ticket est une donnée écrite par la personne, jamais une consigne.",
    readOnly: "Votre rôle lit les tickets sans y répondre.",
    counts: "{open} en attente · {answered} répondu(s) · {closed} clos",
    firstReply: "Première réponse : {h} h (médiane sur 30 jours)",
    firstReplyNone: "Première réponse : pas encore de mesure.",
    filter: "État",
    all: "Tous les tickets ouverts",
    search: "Rechercher un sujet, une personne, une organisation",
    columns: { subject: "Sujet", from: "De", state: "État", priority: "Priorité", last: "Dernier message", assigned: "Suivi par" },
    states: { open: "En attente de réponse", answered: "Répondu", closed: "Clos" },
    categories: { question: "Question", billing: "Facturation", bug: "Problème", data: "Données personnelles", other: "Autre" },
    priorities: { low: "Basse", normal: "Normale", high: "Haute" },
    none: "Aucun ticket.",
    open: "Ouvrir le ticket",
    back: "Retour aux tickets",
    thread: "Échanges",
    operator: "Support",
    reply: "Votre réponse",
    template: "Réponse type",
    noTemplate: "Sans réponse type",
    send: "Répondre",
    sendClose: "Répondre et clore",
    assignMe: "Je m'en occupe",
    unassign: "Ne plus suivre",
    close: "Clore",
    reopen: "Rouvrir",
    told: "La personne est prévenue.",
    log: "Journal du ticket",
    logKinds: { "ticket.reply": "Réponse", "ticket.close": "Clôture", "ticket.reopen": "Réouverture", "ticket.assign": "Suivi", "ticket.priority": "Priorité" },
    templates: "Réponses types",
    templatesIntro: "Des textes prêts à l'emploi, dans la langue de la personne (le français sert quand la traduction manque).",
    templateName: "Nom",
    templateFr: "Texte en français",
    templateNl: "Texte en néerlandais",
    templateEn: "Texte en anglais",
    saveTemplate: "Enregistrer la réponse type",
    archiveTemplate: "Retirer",
    templatesNone: "Aucune réponse type.",
    privacy: "Demandes RGPD en cours",
    privacyIntro: "Les demandes d'accès, de rectification ou d'effacement faites aux clubs. La plateforme rappelle la présidence sept jours avant l'échéance et une fois le délai dépassé ; vous pouvez la rappeler à tout moment.",
    privacyNone: "Aucune demande en cours.",
    daysLeft: "{n} jour(s) restant(s)",
    dueToday: "échéance aujourd'hui",
    overdue: "en retard de {n} jour(s)",
    remind: "Rappeler la présidence",
    reminded: "La présidence est rappelée.",
    notices: "{n} rappel(s), dernier le {day}",
    certificates: "{n} attestation(s) délivrée(s) sur 30 jours pour des demandes traitées.",
  },
  assistant: {
    intro: "Posez une question à l'assistant : il lit les chiffres de la console avec les mêmes outils que votre clé MCP, en votre nom. Une action d'écriture (rappel, paiement, note) vous est proposée et attend votre confirmation. La conversation reste dans votre navigateur.",
    off: "L'assistant n'est pas configuré sur ce serveur : ajoutez ANTHROPIC_API_KEY (et au besoin PFM_ASSISTANT_MODEL) dans la configuration.",
    model: "Modèle : {model}",
    usage: "Aujourd'hui : {calls} échange(s), {tokens} jetons · ce mois : {month} jetons",
    toolsRead: "Lecture : {tools}",
    toolsWrite: "Écriture, sur confirmation : {tools}",
    placeholder: "Par exemple : quelles factures sont en retard de plus de dix jours ?",
    send: "Envoyer",
    thinking: "L'assistant lit les chiffres…",
    you: "Vous",
    assistant: "Assistant",
    pending: "Action proposée",
    pendingIntro: "L'assistant veut lancer {name} avec ces paramètres. Rien n'est fait tant que vous ne confirmez pas.",
    approve: "Confirmer l'action",
    refuse: "Refuser",
    clear: "Nouvelle conversation",
    examples: "Exemples",
    exampleList: ["Quelles organisations n'ont pas de président actif ?", "Quelles factures sont en retard, et depuis combien de jours ?", "Résume la santé du service aujourd'hui.", "Prépare un rappel pour la facture la plus en retard."],
  },
  alerts: {
    title: "Mes alertes",
    intro: "Un e-mail par jour, au plus, quand quelque chose demande votre attention : vous choisissez les règles et l'heure à partir de laquelle il peut partir.",
    email: "Recevoir l'alerte quotidienne par e-mail",
    hour: "À partir de (heure, Bruxelles)",
    rules: "Règles",
    ruleNames: { jobsLate: "Tâches de fond en retard", mailsOverdue: "E-mails en attente depuis plus de 30 minutes", dataRequestsLate: "Demandes RGPD hors délai", invoicesFinalReminder: "Factures au dernier rappel", noPresident: "Organisations sans président actif", suspended: "Organisations suspendues", feedbackNew: "Signalements reçus depuis 24 heures", terminations: "Fermetures programmées sous 30 jours", ticketsWaiting: "Tickets de support sans réponse depuis 24 heures" },
    save: "Enregistrer mes alertes",
    saved: "Alertes enregistrées.",
    now: "Ce que l'alerte contiendrait maintenant",
    nowNone: "Rien à signaler pour l'instant.",
    last: "Dernière alerte envoyée le {day}",
    lastNone: "Aucune alerte envoyée pour l'instant.",
  },
  reports: {
    title: "Rapports mensuels",
    intro: "Le premier du mois, un rapport d'exploitation du mois écoulé est généré en PDF (clients, personnes, revenus, support, conformité, exploitation) et archivé ici. Le propriétaire ou la finance peuvent en régénérer un.",
    none: "Aucun rapport pour l'instant : il faut un mois de relevés.",
    download: "Télécharger le PDF",
    generate: "Générer le rapport de {month}",
    generated: "Rapport généré.",
    monthOf: "Rapport de {month}",
    line: "{clubs} clubs · {players} joueurs · facturé {invoiced} · encaissé {collected} · {interventions} intervention(s)",
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
  tabs: { home: "Dashboard", organizations: "Organisaties", billing: "Facturatie", support: "Ondersteuning", supervision: "Toezicht", operators: "Beheerders", assistant: "Assistent" },
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
    ticketsOpen: "tickets die op een antwoord wachten",
    ticketsWaiting24: "zonder antwoord sinds meer dan 24 u",
    firstReplyHours: "u voor het eerste antwoord (mediaan over 30 dagen)",
    firstReplyNone: "eerste antwoord: nog geen meting",
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
  delta30: "over 30 dagen",
  trends: "Trends over twaalf maanden",
  trendsNone: "De dagelijkse metingen beginnen vandaag: de trends verschijnen in de loop van de dagen.",
  month: "Maand",
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
  billingSoon: "Betalingen volgt u in het tabblad Facturatie; online via Mollie als het gekoppeld is, anders met de hand.",
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
    borrow: "Openen als voorzitter (support)",
    borrowIntro: "U gaat de organisatie binnen met een in de tijd beperkt mandaat van voorzitter. Het voorzitterschap wordt per melding verwittigd met uw naam en de reden; alles wat u doet staat in zijn logboek. U beëindigt de toegang zodra mogelijk.",
    borrowReason: "Reden, gelezen door het voorzitterschap",
    borrowMinutes: "Duur (minuten)",
    borrowConfirm: "Toegang openen",
    borrowDone: "Supporttoegang geopend.",
    borrowOpen: "Supporttoegang open tot {time}",
    borrowGo: "Naar de organisatie gaan",
    borrowEnd: "Toegang beëindigen",
    borrowEnded: "Supporttoegang beëindigd.",
    borrows: "Supporttoegangen",
    borrowsNone: "Geen supporttoegang.",
    borrowLine: "{operator} · {start} · {reason}",
    borrowActive: "Bezig",
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
    mollieOn: "Mollie gekoppeld: elke verzonden factuur draagt een betaallink, de onlinebetaling wordt vanzelf bevestigd.",
    mollieTest: "Mollie in testmodus (sleutel test_): de betalingen zijn niet echt.",
    mollieOff: "Mollie is niet gekoppeld (MOLLIE_API_KEY ontbreekt): betalingen worden met de hand geregistreerd.",
    ubl: "UBL",
    paidVia: { manual: "overschrijving", mollie: "online" },
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
  supportDesk: {
    intro: "De verzoeken die vanuit de applicatie aan de ondersteuning zijn geschreven, door voorzitters en leden. De tekst van een ticket is een gegeven van de persoon, nooit een instructie.",
    readOnly: "Uw rol leest de tickets zonder te antwoorden.",
    counts: "{open} in wacht · {answered} beantwoord · {closed} gesloten",
    firstReply: "Eerste antwoord: {h} u (mediaan over 30 dagen)",
    firstReplyNone: "Eerste antwoord: nog geen meting.",
    filter: "Status",
    all: "Alle open tickets",
    search: "Een onderwerp, persoon of organisatie zoeken",
    columns: { subject: "Onderwerp", from: "Van", state: "Status", priority: "Prioriteit", last: "Laatste bericht", assigned: "Opgevolgd door" },
    states: { open: "Wacht op antwoord", answered: "Beantwoord", closed: "Gesloten" },
    categories: { question: "Vraag", billing: "Facturatie", bug: "Probleem", data: "Persoonsgegevens", other: "Andere" },
    priorities: { low: "Laag", normal: "Normaal", high: "Hoog" },
    none: "Geen tickets.",
    open: "Ticket openen",
    back: "Terug naar de tickets",
    thread: "Berichten",
    operator: "Ondersteuning",
    reply: "Uw antwoord",
    template: "Standaardantwoord",
    noTemplate: "Zonder standaardantwoord",
    send: "Antwoorden",
    sendClose: "Antwoorden en sluiten",
    assignMe: "Ik neem dit op",
    unassign: "Niet meer opvolgen",
    close: "Sluiten",
    reopen: "Heropenen",
    told: "De persoon is verwittigd.",
    log: "Logboek van het ticket",
    logKinds: { "ticket.reply": "Antwoord", "ticket.close": "Sluiting", "ticket.reopen": "Heropening", "ticket.assign": "Opvolging", "ticket.priority": "Prioriteit" },
    templates: "Standaardantwoorden",
    templatesIntro: "Kant-en-klare teksten, in de taal van de persoon (het Frans dient als de vertaling ontbreekt).",
    templateName: "Naam",
    templateFr: "Tekst in het Frans",
    templateNl: "Tekst in het Nederlands",
    templateEn: "Tekst in het Engels",
    saveTemplate: "Standaardantwoord opslaan",
    archiveTemplate: "Verwijderen",
    templatesNone: "Geen standaardantwoorden.",
    privacy: "Lopende AVG-verzoeken",
    privacyIntro: "De verzoeken tot inzage, verbetering of verwijdering aan de clubs. Het platform herinnert de voorzitter zeven dagen voor de vervaldag en zodra de termijn verstreken is; u kunt op elk moment herinneren.",
    privacyNone: "Geen lopend verzoek.",
    daysLeft: "nog {n} dag(en)",
    dueToday: "vervalt vandaag",
    overdue: "{n} dag(en) te laat",
    remind: "De voorzitter herinneren",
    reminded: "De voorzitter is herinnerd.",
    notices: "{n} herinnering(en), laatste op {day}",
    certificates: "{n} attest(en) afgeleverd over 30 dagen voor afgehandelde verzoeken.",
  },
  assistant: {
    intro: "Stel de assistent een vraag: hij leest de cijfers van de console met dezelfde tools als uw MCP-sleutel, in uw naam. Een schrijfactie (herinnering, betaling, nota) wordt voorgesteld en wacht op uw bevestiging. Het gesprek blijft in uw browser.",
    off: "De assistent is niet geconfigureerd op deze server: voeg ANTHROPIC_API_KEY (en zo nodig PFM_ASSISTANT_MODEL) toe aan de configuratie.",
    model: "Model: {model}",
    usage: "Vandaag: {calls} uitwisseling(en), {tokens} tokens · deze maand: {month} tokens",
    toolsRead: "Lezen: {tools}",
    toolsWrite: "Schrijven, na bevestiging: {tools}",
    placeholder: "Bijvoorbeeld: welke facturen zijn meer dan tien dagen te laat?",
    send: "Verzenden",
    thinking: "De assistent leest de cijfers…",
    you: "U",
    assistant: "Assistent",
    pending: "Voorgestelde actie",
    pendingIntro: "De assistent wil {name} uitvoeren met deze parameters. Er gebeurt niets zolang u niet bevestigt.",
    approve: "Actie bevestigen",
    refuse: "Weigeren",
    clear: "Nieuw gesprek",
    examples: "Voorbeelden",
    exampleList: ["Welke organisaties hebben geen actieve voorzitter?", "Welke facturen zijn te laat, en sinds hoeveel dagen?", "Vat de gezondheid van de dienst vandaag samen.", "Bereid een herinnering voor de meest achterstallige factuur voor."],
  },
  alerts: {
    title: "Mijn meldingen",
    intro: "Hoogstens één e-mail per dag, wanneer iets uw aandacht vraagt: u kiest de regels en het uur vanaf wanneer hij mag vertrekken.",
    email: "De dagelijkse melding per e-mail ontvangen",
    hour: "Vanaf (uur, Brussel)",
    rules: "Regels",
    ruleNames: { jobsLate: "Achtergrondtaken te laat", mailsOverdue: "E-mails al meer dan 30 minuten in wacht", dataRequestsLate: "AVG-verzoeken buiten termijn", invoicesFinalReminder: "Facturen bij de laatste herinnering", noPresident: "Organisaties zonder actieve voorzitter", suspended: "Geschorste organisaties", feedbackNew: "Meldingen ontvangen sinds 24 uur", terminations: "Sluitingen gepland binnen 30 dagen", ticketsWaiting: "Supporttickets zonder antwoord sinds 24 uur" },
    save: "Mijn meldingen opslaan",
    saved: "Meldingen opgeslagen.",
    now: "Wat de melding nu zou bevatten",
    nowNone: "Momenteel niets te melden.",
    last: "Laatste melding verzonden op {day}",
    lastNone: "Nog geen melding verzonden.",
  },
  reports: {
    title: "Maandrapporten",
    intro: "Op de eerste van de maand wordt een exploitatierapport van de voorbije maand als PDF aangemaakt (klanten, personen, inkomsten, support, conformiteit, exploitatie) en hier bewaard. De eigenaar of financiën kunnen er een opnieuw aanmaken.",
    none: "Nog geen rapport: er is een maand metingen nodig.",
    download: "PDF downloaden",
    generate: "Rapport van {month} aanmaken",
    generated: "Rapport aangemaakt.",
    monthOf: "Rapport van {month}",
    line: "{clubs} clubs · {players} spelers · gefactureerd {invoiced} · geïnd {collected} · {interventions} tussenkomst(en)",
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
  tabs: { home: "Dashboard", organizations: "Organisations", billing: "Billing", support: "Support", supervision: "Supervision", operators: "Operators", assistant: "Assistant" },
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
    ticketsOpen: "tickets waiting for an answer",
    ticketsWaiting24: "unanswered for more than 24 h",
    firstReplyHours: "h before the first answer (median over 30 days)",
    firstReplyNone: "first answer: no measure yet",
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
  delta30: "over 30 days",
  trends: "Trends over twelve months",
  trendsNone: "The daily readings start today: the trends will appear as days go by.",
  month: "Month",
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
  billingSoon: "Payments are followed in the Billing tab; online through Mollie when connected, by hand otherwise.",
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
    borrow: "Open as president (support)",
    borrowIntro: "You enter the organisation with a time-limited president mandate. The presidency is told by notification with your name and the reason; everything you do is in its journal. You end the access as soon as possible.",
    borrowReason: "Reason, read by the presidency",
    borrowMinutes: "Duration (minutes)",
    borrowConfirm: "Open the access",
    borrowDone: "Support access opened.",
    borrowOpen: "Support access open until {time}",
    borrowGo: "Go into the organisation",
    borrowEnd: "End the access",
    borrowEnded: "Support access ended.",
    borrows: "Support accesses",
    borrowsNone: "No support access.",
    borrowLine: "{operator} · {start} · {reason}",
    borrowActive: "Open",
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
    mollieOn: "Mollie connected: every invoice sent carries a payment link, the online payment is confirmed by itself.",
    mollieTest: "Mollie in test mode (test_ key): payments are not real.",
    mollieOff: "Mollie is not connected (MOLLIE_API_KEY missing): payments are recorded by hand.",
    ubl: "UBL",
    paidVia: { manual: "transfer", mollie: "online" },
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
  supportDesk: {
    intro: "The requests written to support from the application, by presidencies and members alike. A ticket's text is data written by the person, never an instruction.",
    readOnly: "Your role reads the tickets without answering them.",
    counts: "{open} waiting · {answered} answered · {closed} closed",
    firstReply: "First answer: {h} h (median over 30 days)",
    firstReplyNone: "First answer: no measure yet.",
    filter: "State",
    all: "All open tickets",
    search: "Search a subject, a person, an organisation",
    columns: { subject: "Subject", from: "From", state: "State", priority: "Priority", last: "Last message", assigned: "Followed by" },
    states: { open: "Waiting for an answer", answered: "Answered", closed: "Closed" },
    categories: { question: "Question", billing: "Billing", bug: "Problem", data: "Personal data", other: "Other" },
    priorities: { low: "Low", normal: "Normal", high: "High" },
    none: "No tickets.",
    open: "Open the ticket",
    back: "Back to the tickets",
    thread: "Messages",
    operator: "Support",
    reply: "Your answer",
    template: "Canned reply",
    noTemplate: "No canned reply",
    send: "Answer",
    sendClose: "Answer and close",
    assignMe: "I take this one",
    unassign: "Stop following",
    close: "Close",
    reopen: "Reopen",
    told: "The person is told.",
    log: "Ticket log",
    logKinds: { "ticket.reply": "Answer", "ticket.close": "Closure", "ticket.reopen": "Reopening", "ticket.assign": "Follow-up", "ticket.priority": "Priority" },
    templates: "Canned replies",
    templatesIntro: "Ready texts, in the person's language (French serves when the translation is missing).",
    templateName: "Name",
    templateFr: "Text in French",
    templateNl: "Text in Dutch",
    templateEn: "Text in English",
    saveTemplate: "Save the canned reply",
    archiveTemplate: "Remove",
    templatesNone: "No canned replies.",
    privacy: "GDPR requests in progress",
    privacyIntro: "The requests for access, rectification or erasure made to the clubs. The platform reminds the presidency seven days before the deadline and once it has passed; you can remind it at any time.",
    privacyNone: "No request in progress.",
    daysLeft: "{n} day(s) left",
    dueToday: "due today",
    overdue: "{n} day(s) overdue",
    remind: "Remind the presidency",
    reminded: "The presidency is reminded.",
    notices: "{n} reminder(s), last on {day}",
    certificates: "{n} certificate(s) issued over 30 days for requests handled.",
  },
  assistant: {
    intro: "Ask the assistant: it reads the console's figures with the same tools as your MCP key, in your name. A write action (reminder, payment, note) is proposed and waits for your confirmation. The conversation stays in your browser.",
    off: "The assistant is not configured on this server: add ANTHROPIC_API_KEY (and PFM_ASSISTANT_MODEL if needed) to the configuration.",
    model: "Model: {model}",
    usage: "Today: {calls} exchange(s), {tokens} tokens · this month: {month} tokens",
    toolsRead: "Read: {tools}",
    toolsWrite: "Write, on confirmation: {tools}",
    placeholder: "For example: which invoices are more than ten days late?",
    send: "Send",
    thinking: "The assistant reads the figures…",
    you: "You",
    assistant: "Assistant",
    pending: "Proposed action",
    pendingIntro: "The assistant wants to run {name} with these parameters. Nothing happens until you confirm.",
    approve: "Confirm the action",
    refuse: "Refuse",
    clear: "New conversation",
    examples: "Examples",
    exampleList: ["Which organisations have no active president?", "Which invoices are late, and for how many days?", "Summarise the health of the service today.", "Prepare a reminder for the most overdue invoice."],
  },
  alerts: {
    title: "My alerts",
    intro: "One e-mail a day at most, when something needs your attention: you choose the rules and the hour from which it may leave.",
    email: "Receive the daily alert by e-mail",
    hour: "From (hour, Brussels)",
    rules: "Rules",
    ruleNames: { jobsLate: "Background tasks late", mailsOverdue: "E-mails waiting for more than 30 minutes", dataRequestsLate: "GDPR requests past their deadline", invoicesFinalReminder: "Invoices at the final reminder", noPresident: "Organisations without an active president", suspended: "Suspended organisations", feedbackNew: "Reports received in the last 24 hours", terminations: "Closures scheduled within 30 days", ticketsWaiting: "Support tickets unanswered for 24 hours" },
    save: "Save my alerts",
    saved: "Alerts saved.",
    now: "What the alert would hold now",
    nowNone: "Nothing to report for now.",
    last: "Last alert sent on {day}",
    lastNone: "No alert sent yet.",
  },
  reports: {
    title: "Monthly reports",
    intro: "On the first of the month, an operations report of the past month is generated as a PDF (clients, people, revenue, support, compliance, operations) and archived here. The owner or finance can generate one again.",
    none: "No report yet: a month of readings is needed.",
    download: "Download the PDF",
    generate: "Generate the report of {month}",
    generated: "Report generated.",
    monthOf: "Report of {month}",
    line: "{clubs} clubs · {players} players · invoiced {invoiced} · collected {collected} · {interventions} intervention(s)",
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
