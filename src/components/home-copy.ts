import type { Locale } from "@/lib/locale";
import type { MetricKey, TodoKey } from "@/domains/dashboard/summary";
type HomeCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  cta: string;
  features: { title: string; text: string }[];
  greeting: string;
  noContext: string;
  /** Signed in, no club yet (the dashboard answers CONTEXT_REQUIRED). */
  noClub: string;
  noClubLink: string;
  /** 24: an old link to the messaging. */
  messagingRemoved: string;
  /** 12: the president's shortcut. */
  clubSettings: string;
  chooseProfile: string;
  todo: string;
  allClear: string;
  figures: string;
  agenda: string;
  agendaEmpty: string;
  openCalendar: string;
  shortcuts: string;
  present: string;
  players: string;
  coaches: string;
  readiness: Record<"ok" | "warn" | "low", string>;
  /** One word next to the presence badge: the colour never carries the meaning alone. */
  readinessWord: Record<"ok" | "warn" | "low", string>;
  season: string;
  create: string;
  createEvent: string;
  createPlayer: string;
  createOperation: string;
  createMail: string;
  listView: string;
  weekView: string;
  viewLabel: string;
  previousWeek: string;
  nextWeek: string;
  thisWeek: string;
  weekOf: string;
  weekEmpty: string;
  weekError: string;
  allFigures: string;
  fewerFigures: string;
  financeTitle: string;
  treasury: string;
  income: string;
  expenses: string;
  duesCollected: string;
  dueSoon: string;
  noDues: string;
  playersLate: string;
  seeFinances: string;
  seeDues: string;
  deadlines: Record<"documents" | "dues" | "fundraising" | "trip" | "grant" | "partner" | "accounts", string>;
  responseNeeded: string;
  cancelled: string;
  loading: string;
  error: string;
  retry: string;
  open: string;
  todos: Record<TodoKey, { title: string; text: string }>;
  metrics: Record<MetricKey, { label: string; hint?: string }>;
};
export const homeCopy: Record<Locale, HomeCopy> = {
  fr: {
    eyebrow: "Powerchair Football",
    title: "Le club au complet, sur un seul terrain.",
    intro:
      "Joueurs, familles, inscriptions, documents, calendrier, présences et cotisations : chaque club reste autonome, chaque personne ne voit que ce qui la concerne.",
    cta: "Accéder à mon espace",
    features: [
      {
        title: "Joueurs et familles",
        text: "Fiches sportives, représentants autorisés et archives, sans exposer les données sensibles.",
      },
      {
        title: "Calendrier et présences",
        text: "Entraînements, invitations, réponses et pointage le jour même.",
      },
      {
        title: "Inscriptions et documents",
        text: "Formulaires publics, dossiers, pièces à valider et échéances suivies.",
      },
      {
        title: "Cotisations",
        text: "Barèmes, créances et échéanciers, clairs pour le club comme pour les familles.",
      },
    ],
    greeting: "Bonjour",
    noContext:
      "Choisissez un profil pour afficher le tableau de bord de votre club.",
    chooseProfile: "Choisir un profil",
    todo: "À faire",
    allClear: "Rien d’urgent. Tout est à jour pour votre profil.",
    figures: "Chiffres clés",
    agenda: "Prochains événements",
    agendaEmpty: "Aucun événement visible dans les 14 prochains jours.",
    openCalendar: "Ouvrir le calendrier",
    shortcuts: "Accès rapides",
    present: "présents",
    players: "joueurs",
    coaches: "coachs",
    readiness: { ok: "Effectif suffisant", warn: "Effectif tendu", low: "Effectif insuffisant" },
    readinessWord: { ok: "Suffisant", warn: "Tendu", low: "Insuffisant" },
    season: "Saison",
    create: "Créer",
    createEvent: "Événement",
    createPlayer: "Joueur",
    createOperation: "Opération financière",
    createMail: "Mail",
    listView: "Liste",
    weekView: "Semaine",
    viewLabel: "Affichage des événements",
    previousWeek: "Semaine précédente",
    nextWeek: "Semaine suivante",
    thisWeek: "Aujourd'hui",
    weekOf: "Semaine du {day}",
    weekEmpty: "Aucun événement cette semaine.",
    weekError: "La semaine n'a pas pu être chargée.",
    allFigures: "Tous les chiffres",
    fewerFigures: "Moins de chiffres",
    financeTitle: "Situation financière",
    treasury: "Trésorerie",
    income: "Recettes de la saison",
    expenses: "Dépenses de la saison",
    duesCollected: "Cotisations encaissées",
    dueSoon: "Échéances à 30 jours",
    noDues: "Aucune cotisation émise cette saison.",
    playersLate: "{n} joueurs en retard",
    seeFinances: "Voir les finances",
    seeDues: "Voir les cotisations",
    deadlines: {
      documents: "Documents à renouveler",
      dues: "Échéance de cotisation",
      fundraising: "Échéance de cagnotte",
      trip: "Départ en déplacement",
      grant: "Subside : dossier ou justificatif",
      partner: "Partenaire : relance ou renouvellement",
      accounts: "Statut du club : comptes ou obligation",
    },
    responseNeeded: "Réponse attendue",
    cancelled: "Annulé",
    loading: "Chargement du tableau de bord…",
    error: "Le tableau de bord est momentanément indisponible.",
    retry: "Réessayer",
    noClub: "Vous êtes connecté, mais votre compte n'est encore relié à aucun club.",
    noClubLink: "Choisir mon club ou mon profil",
    clubSettings: "Réglages du club",
    messagingRemoved: "La messagerie a été retirée. Les nouvelles du club arrivent par la Communication du club et les notifications.",
    open: "Ouvrir",
    todos: {
      documentsExpired: {
        title: "Documents expirés",
        text: "À renouveler auprès des membres",
      },
      registersToClose: {
        title: "Présences à remplir",
        text: "Séances terminées dont le pointage n'est pas fait",
      },
      myAttendance: {
        title: "Présences à confirmer",
        text: "Invitations qui attendent votre réponse",
      },
      myDocuments: {
        title: "Documents à fournir",
        text: "Pièces manquantes, refusées ou expirées",
      },
      myApplications: {
        title: "Dossiers à compléter",
        text: "Le club attend des compléments",
      },
      myTasks: {
        title: "Mes tâches",
        text: "À faire dans les 14 jours, ou en retard",
      },
      registrationsReview: {
        title: "Inscriptions à examiner",
        text: "Dossiers soumis ou en cours d’examen",
      },
      duesLate: {
        title: "Cotisations en retard",
        text: "Joueurs avec une échéance dépassée",
      },
      sponsorTasks: {
        title: "Conditions de sponsor à livrer",
        text: "À faire dans les 14 jours ou en retard",
      },
      grantTasks: {
        title: "Tâches de subsides",
        text: "Étapes de dossier à faire dans les 14 jours ou en retard",
      },
      documentsReview: {
        title: "Documents à vérifier",
        text: "Dépôts en attente de validation",
      },
      registrationFollowups: {
        title: "Admissions à finaliser",
        text: "Documents ou cotisation à créer",
      },
      exerciseOffers: {
        title: "Fiches d'exercice reçues",
        text: "Un autre club vous propose des fiches : acceptez ou refusez",
      },
      courseRequests: {
        title: "Demandes de formation",
        text: "Des clubs attendent votre décision pour un coach",
      },
      coursesExpiring: {
        title: "Formations à renouveler",
        text: "Formations de coachs qui expirent sous 60 jours",
      },
      equipmentService: {
        title: "Fauteuils à réviser",
        text: "En maintenance ou révision sous 14 jours",
      },
      documentsMissing: {
        title: "Documents manquants",
        text: "Demandés, non déposés ou refusés",
      },
      teamsOverCapacity: {
        title: "Équipes au-delà de leurs places",
        text: "Plus de joueurs que de places : revoyez les places ou les affectations",
      },
      minorsWithoutGuardian: {
        title: "Joueurs mineurs sans responsable",
        text: "Ajoutez un parent ou un responsable légal à leur fiche",
      },
      documentsExpiring: {
        title: "Expirent sous 30 jours",
        text: "À anticiper",
      },
    },
    metrics: {
      activeMembers: { label: "Membres actifs" },
      activePlayers: { label: "Joueurs actifs" },
      activeTeams: { label: "Équipes" },
      upcomingEvents: { label: "Événements", hint: "14 prochains jours" },
      pendingResponses: {
        label: "Réponses en attente",
        hint: "Événements des 7 prochains jours",
      },
      waitingList: { label: "Liste d’attente" },
      acceptedRecently: { label: "Acceptées", hint: "14 derniers jours" },
      treasury: { label: "Trésorerie", hint: "Solde du grand livre" },
      available: { label: "Disponible", hint: "Trésorerie moins les fonds réservés" },
      forecastLow: { label: "Trésorerie prévue sous le seuil", hint: "Dans les 3 prochains mois : voir les prévisions" },
      duesNext30: {
        label: "Échéances à 30 jours",
        hint: "Montant prévu, paiements suivis au lot bancaire",
      },
      myNextDue: { label: "Ma prochaine échéance" },
      seasonPlayers: { label: "Joueurs", hint: "Toutes équipes de la saison" },
      seasonTeams: { label: "Équipes" },
      seasonCoaches: { label: "Coachs", hint: "Coachs et assistants" },
      chairs: { label: "Fauteuils", hint: "Fauteuils du club" },
      trainingsDone: { label: "Entraînements faits", hint: "Cette saison" },
      matchesPlayed: { label: "Matchs joués" },
    },
  },
  nl: {
    eyebrow: "Powerchair Football",
    title: "De hele club, op één terrein.",
    intro:
      "Spelers, gezinnen, inschrijvingen, documenten, kalender, aanwezigheid en bijdragen: elke club blijft zelfstandig, iedereen ziet alleen wat hem aangaat.",
    cta: "Naar mijn werkruimte",
    features: [
      {
        title: "Spelers en gezinnen",
        text: "Sportfiches, bevoegde vertegenwoordigers en archief, zonder gevoelige gegevens bloot te geven.",
      },
      {
        title: "Kalender en aanwezigheid",
        text: "Trainingen, uitnodigingen, antwoorden en registratie op de dag zelf.",
      },
      {
        title: "Inschrijvingen en documenten",
        text: "Openbare formulieren, dossiers, te valideren stukken en opgevolgde vervaldagen.",
      },
      {
        title: "Bijdragen",
        text: "Tarieven, vorderingen en afbetalingsplannen, duidelijk voor club en gezin.",
      },
    ],
    greeting: "Hallo",
    noContext: "Kies een profiel om het dashboard van je club te tonen.",
    chooseProfile: "Kies een profiel",
    todo: "Te doen",
    allClear: "Niets dringends. Alles is bijgewerkt voor jouw profiel.",
    figures: "Kerncijfers",
    agenda: "Volgende activiteiten",
    agendaEmpty: "Geen zichtbare activiteiten in de komende 14 dagen.",
    openCalendar: "Kalender openen",
    shortcuts: "Snelkoppelingen",
    present: "aanwezig",
    players: "spelers",
    coaches: "coaches",
    readiness: { ok: "Voldoende volk", warn: "Krap", low: "Te weinig volk" },
    readinessWord: { ok: "Voldoende", warn: "Krap", low: "Onvoldoende" },
    season: "Seizoen",
    create: "Aanmaken",
    createEvent: "Evenement",
    createPlayer: "Speler",
    createOperation: "Financiële verrichting",
    createMail: "Mail",
    listView: "Lijst",
    weekView: "Week",
    viewLabel: "Weergave van de evenementen",
    previousWeek: "Vorige week",
    nextWeek: "Volgende week",
    thisWeek: "Vandaag",
    weekOf: "Week van {day}",
    weekEmpty: "Geen evenement deze week.",
    weekError: "De week kon niet geladen worden.",
    allFigures: "Alle cijfers",
    fewerFigures: "Minder cijfers",
    financeTitle: "Financiële toestand",
    treasury: "Kas",
    income: "Inkomsten van het seizoen",
    expenses: "Uitgaven van het seizoen",
    duesCollected: "Geïnde bijdragen",
    dueSoon: "Vervaldagen binnen 30 dagen",
    noDues: "Geen bijdrage uitgegeven dit seizoen.",
    playersLate: "{n} spelers achter",
    seeFinances: "Financiën bekijken",
    seeDues: "Bijdragen bekijken",
    deadlines: {
      documents: "Documenten te vernieuwen",
      dues: "Vervaldag lidgeld",
      fundraising: "Einddatum pot",
      trip: "Vertrek verplaatsing",
      grant: "Subsidie: dossier of verantwoording",
      partner: "Partner: opvolging of verlenging",
      accounts: "Statuut van de club: rekeningen of verplichting",
    },
    responseNeeded: "Antwoord verwacht",
    cancelled: "Geannuleerd",
    loading: "Dashboard wordt geladen…",
    error: "Het dashboard is tijdelijk niet beschikbaar.",
    retry: "Opnieuw proberen",
    noClub: "U bent aangemeld, maar uw account is nog aan geen enkele club gekoppeld.",
    noClubLink: "Mijn club of profiel kiezen",
    clubSettings: "Clubinstellingen",
    messagingRemoved: "De berichtendienst is verwijderd. Het clubnieuws komt via de clubcommunicatie en de meldingen.",
    open: "Openen",
    todos: {
      documentsExpired: {
        title: "Verlopen documenten",
        text: "Te vernieuwen bij de leden",
      },
      registersToClose: {
        title: "Aanwezigheden in te vullen",
        text: "Afgelopen sessies waarvan de aanwezigheid niet is genoteerd",
      },
      myAttendance: {
        title: "Aanwezigheid te bevestigen",
        text: "Uitnodigingen wachten op je antwoord",
      },
      myDocuments: {
        title: "Documenten aan te leveren",
        text: "Ontbrekende, geweigerde of verlopen stukken",
      },
      myApplications: {
        title: "Dossiers aan te vullen",
        text: "De club wacht op aanvullingen",
      },
      myTasks: {
        title: "Mijn taken",
        text: "Te doen binnen 14 dagen, of te laat",
      },
      registrationsReview: {
        title: "Inschrijvingen te beoordelen",
        text: "Ingediende of lopende dossiers",
      },
      duesLate: {
        title: "Achterstallige bijdragen",
        text: "Spelers met een vervallen termijn",
      },
      sponsorTasks: {
        title: "Sponsorvoorwaarden te leveren",
        text: "Binnen 14 dagen te doen of te laat",
      },
      grantTasks: {
        title: "Subsidietaken",
        text: "Dossierstappen binnen 14 dagen of te laat",
      },
      documentsReview: {
        title: "Documenten te controleren",
        text: "Uploads wachten op validatie",
      },
      registrationFollowups: {
        title: "Toelatingen af te ronden",
        text: "Documenten of bijdrage aan te maken",
      },
      exerciseOffers: {
        title: "Ontvangen oefenfiches",
        text: "Een andere club stelt fiches voor: aanvaarden of weigeren",
      },
      courseRequests: {
        title: "Opleidingsaanvragen",
        text: "Clubs wachten op uw beslissing voor een coach",
      },
      coursesExpiring: {
        title: "Te vernieuwen opleidingen",
        text: "Coachopleidingen die binnen 60 dagen vervallen",
      },
      equipmentService: {
        title: "Rolstoelen voor onderhoud",
        text: "In onderhoud of onderhoud binnen 14 dagen",
      },
      documentsMissing: {
        title: "Ontbrekende documenten",
        text: "Gevraagd, niet geüpload of geweigerd",
      },
      teamsOverCapacity: {
        title: "Teams boven hun plaatsen",
        text: "Meer spelers dan plaatsen: herzie de plaatsen of de toewijzingen",
      },
      minorsWithoutGuardian: {
        title: "Minderjarige spelers zonder verantwoordelijke",
        text: "Voeg een ouder of wettelijke vertegenwoordiger toe aan hun fiche",
      },
      documentsExpiring: {
        title: "Verlopen binnen 30 dagen",
        text: "Tijdig opvolgen",
      },
    },
    metrics: {
      activeMembers: { label: "Actieve leden" },
      activePlayers: { label: "Actieve spelers" },
      activeTeams: { label: "Teams" },
      upcomingEvents: { label: "Activiteiten", hint: "Komende 14 dagen" },
      pendingResponses: {
        label: "Openstaande antwoorden",
        hint: "Activiteiten van de komende 7 dagen",
      },
      waitingList: { label: "Wachtlijst" },
      acceptedRecently: { label: "Aanvaard", hint: "Laatste 14 dagen" },
      treasury: { label: "Kas", hint: "Saldo van het grootboek" },
      available: { label: "Beschikbaar", hint: "Kas min de bestemde fondsen" },
      forecastLow: { label: "Verwachte kas onder de drempel", hint: "In de komende 3 maanden: zie de prognose" },
      duesNext30: {
        label: "Vervaldagen binnen 30 dagen",
        hint: "Gepland bedrag, betalingen volgen in de bankfase",
      },
      myNextDue: { label: "Mijn volgende vervaldag" },
      seasonPlayers: { label: "Spelers", hint: "Alle teams van het seizoen" },
      seasonTeams: { label: "Teams" },
      seasonCoaches: { label: "Coaches", hint: "Coaches en assistenten" },
      chairs: { label: "Rolstoelen", hint: "Rolstoelen van de club" },
      trainingsDone: { label: "Gegeven trainingen", hint: "Dit seizoen" },
      matchesPlayed: { label: "Gespeelde wedstrijden" },
    },
  },
  en: {
    eyebrow: "Powerchair Football",
    title: "Your whole club, on one pitch.",
    intro:
      "Players, families, registrations, documents, calendar, attendance and dues: every club stays independent and everyone sees only what concerns them.",
    cta: "Open my space",
    features: [
      {
        title: "Players and families",
        text: "Sporting profiles, authorised representatives and archives, without exposing sensitive data.",
      },
      {
        title: "Calendar and attendance",
        text: "Training sessions, invitations, answers and same-day check-in.",
      },
      {
        title: "Registrations and documents",
        text: "Public forms, applications, pieces to validate and tracked expiry dates.",
      },
      {
        title: "Dues",
        text: "Rates, receivables and instalment plans, clear for the club and families.",
      },
    ],
    greeting: "Hello",
    noContext: "Choose a profile to show your club dashboard.",
    chooseProfile: "Choose a profile",
    todo: "To do",
    allClear: "Nothing urgent. Everything is up to date for your profile.",
    figures: "Key figures",
    agenda: "Upcoming events",
    agendaEmpty: "No visible events in the next 14 days.",
    openCalendar: "Open the calendar",
    shortcuts: "Shortcuts",
    present: "present",
    players: "players",
    coaches: "coaches",
    readiness: { ok: "Enough people", warn: "Tight", low: "Not enough people" },
    readinessWord: { ok: "Enough", warn: "Tight", low: "Not enough" },
    season: "Season",
    create: "Create",
    createEvent: "Event",
    createPlayer: "Player",
    createOperation: "Financial operation",
    createMail: "Mail",
    listView: "List",
    weekView: "Week",
    viewLabel: "Events display",
    previousWeek: "Previous week",
    nextWeek: "Next week",
    thisWeek: "Today",
    weekOf: "Week of {day}",
    weekEmpty: "No event this week.",
    weekError: "The week could not be loaded.",
    allFigures: "All figures",
    fewerFigures: "Fewer figures",
    financeTitle: "Financial situation",
    treasury: "Treasury",
    income: "Season income",
    expenses: "Season expenses",
    duesCollected: "Dues collected",
    dueSoon: "Due within 30 days",
    noDues: "No dues issued this season.",
    playersLate: "{n} players late",
    seeFinances: "See the finances",
    seeDues: "See the dues",
    deadlines: {
      documents: "Documents to renew",
      dues: "Dues instalment due",
      fundraising: "Pot deadline",
      trip: "Trip departure",
      grant: "Grant: application or report",
      partner: "Partner: follow-up or renewal",
      accounts: "Club status: accounts or obligation",
    },
    responseNeeded: "Answer needed",
    cancelled: "Cancelled",
    loading: "Loading the dashboard…",
    error: "The dashboard is temporarily unavailable.",
    retry: "Try again",
    noClub: "You are signed in, but your account is not linked to any club yet.",
    noClubLink: "Choose my club or profile",
    clubSettings: "Club settings",
    messagingRemoved: "The messaging has been removed. Club news arrives through the club communication and the notifications.",
    open: "Open",
    todos: {
      documentsExpired: {
        title: "Expired documents",
        text: "To be renewed with members",
      },
      registersToClose: {
        title: "Attendance to fill in",
        text: "Finished sessions whose attendance is not recorded",
      },
      myAttendance: {
        title: "Attendance to confirm",
        text: "Invitations waiting for your answer",
      },
      myDocuments: {
        title: "Documents to provide",
        text: "Missing, refused or expired pieces",
      },
      myApplications: {
        title: "Applications to complete",
        text: "The club is waiting for more information",
      },
      myTasks: {
        title: "My tasks",
        text: "Due within 14 days, or late",
      },
      registrationsReview: {
        title: "Registrations to review",
        text: "Submitted or under review",
      },
      duesLate: {
        title: "Late dues",
        text: "Players with an overdue instalment",
      },
      sponsorTasks: {
        title: "Sponsor conditions to deliver",
        text: "Due within 14 days or late",
      },
      grantTasks: {
        title: "Grant tasks",
        text: "File steps due within 14 days or overdue",
      },
      documentsReview: {
        title: "Documents to check",
        text: "Uploads waiting for validation",
      },
      registrationFollowups: {
        title: "Admissions to finalise",
        text: "Documents or dues to create",
      },
      exerciseOffers: {
        title: "Exercise sheets received",
        text: "Another club offers you sheets: accept or decline",
      },
      courseRequests: {
        title: "Course requests",
        text: "Clubs are waiting for your decision on a coach",
      },
      coursesExpiring: {
        title: "Courses to renew",
        text: "Coach courses expiring within 60 days",
      },
      equipmentService: {
        title: "Chairs to service",
        text: "In maintenance or due within 14 days",
      },
      documentsMissing: {
        title: "Missing documents",
        text: "Requested, not uploaded or refused",
      },
      teamsOverCapacity: {
        title: "Teams over their places",
        text: "More players than places: review the places or the assignments",
      },
      minorsWithoutGuardian: {
        title: "Minor players without a guardian",
        text: "Add a parent or legal guardian to their record",
      },
      documentsExpiring: {
        title: "Expiring within 30 days",
        text: "Plan ahead",
      },
    },
    metrics: {
      activeMembers: { label: "Active members" },
      activePlayers: { label: "Active players" },
      activeTeams: { label: "Teams" },
      upcomingEvents: { label: "Events", hint: "Next 14 days" },
      pendingResponses: {
        label: "Pending answers",
        hint: "Events in the next 7 days",
      },
      waitingList: { label: "Waiting list" },
      acceptedRecently: { label: "Accepted", hint: "Last 14 days" },
      treasury: { label: "Treasury", hint: "Ledger balance" },
      available: { label: "Available", hint: "Cash minus the reserved funds" },
      forecastLow: { label: "Forecast cash under the threshold", hint: "In the next 3 months: see the forecast" },
      duesNext30: {
        label: "Due within 30 days",
        hint: "Scheduled amount, payments tracked with the bank module",
      },
      myNextDue: { label: "My next instalment" },
      seasonPlayers: { label: "Players", hint: "Every team of the season" },
      seasonTeams: { label: "Teams" },
      seasonCoaches: { label: "Coaches", hint: "Coaches and assistants" },
      chairs: { label: "Wheelchairs", hint: "The club's wheelchairs" },
      trainingsDone: { label: "Trainings held", hint: "This season" },
      matchesPlayed: { label: "Matches played" },
    },
  },
};
