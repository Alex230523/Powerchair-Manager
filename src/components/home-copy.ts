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
  chooseProfile: string;
  todo: string;
  allClear: string;
  figures: string;
  agenda: string;
  agendaEmpty: string;
  openCalendar: string;
  shortcuts: string;
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
        text: "Entraînements, convocations, réponses et pointage le jour même.",
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
    responseNeeded: "Réponse attendue",
    cancelled: "Annulé",
    loading: "Chargement du tableau de bord…",
    error: "Le tableau de bord est momentanément indisponible.",
    retry: "Réessayer",
    open: "Ouvrir",
    todos: {
      documentsExpired: {
        title: "Documents expirés",
        text: "À renouveler auprès des membres",
      },
      registersToClose: {
        title: "Registres à clôturer",
        text: "Événements terminés, présences à finaliser",
      },
      myAttendance: {
        title: "Présences à confirmer",
        text: "Convocations qui attendent votre réponse",
      },
      myDocuments: {
        title: "Documents à fournir",
        text: "Pièces manquantes, refusées ou expirées",
      },
      myApplications: {
        title: "Dossiers à compléter",
        text: "Le club attend des compléments",
      },
      registrationsReview: {
        title: "Inscriptions à examiner",
        text: "Dossiers soumis ou en cours d’examen",
      },
      documentsReview: {
        title: "Documents à vérifier",
        text: "Dépôts en attente de validation",
      },
      registrationFollowups: {
        title: "Admissions à finaliser",
        text: "Documents ou cotisation à créer",
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
      duesNext30: {
        label: "Échéances à 30 jours",
        hint: "Montant prévu, paiements suivis au lot bancaire",
      },
      myNextDue: { label: "Ma prochaine échéance" },
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
        text: "Trainingen, oproepingen, antwoorden en registratie op de dag zelf.",
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
    responseNeeded: "Antwoord verwacht",
    cancelled: "Geannuleerd",
    loading: "Dashboard wordt geladen…",
    error: "Het dashboard is tijdelijk niet beschikbaar.",
    retry: "Opnieuw proberen",
    open: "Openen",
    todos: {
      documentsExpired: {
        title: "Verlopen documenten",
        text: "Te vernieuwen bij de leden",
      },
      registersToClose: {
        title: "Registers af te sluiten",
        text: "Afgelopen activiteiten, aanwezigheid af te ronden",
      },
      myAttendance: {
        title: "Aanwezigheid te bevestigen",
        text: "Oproepingen wachten op je antwoord",
      },
      myDocuments: {
        title: "Documenten aan te leveren",
        text: "Ontbrekende, geweigerde of verlopen stukken",
      },
      myApplications: {
        title: "Dossiers aan te vullen",
        text: "De club wacht op aanvullingen",
      },
      registrationsReview: {
        title: "Inschrijvingen te beoordelen",
        text: "Ingediende of lopende dossiers",
      },
      documentsReview: {
        title: "Documenten te controleren",
        text: "Uploads wachten op validatie",
      },
      registrationFollowups: {
        title: "Toelatingen af te ronden",
        text: "Documenten of bijdrage aan te maken",
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
      duesNext30: {
        label: "Vervaldagen binnen 30 dagen",
        hint: "Gepland bedrag, betalingen volgen in de bankfase",
      },
      myNextDue: { label: "Mijn volgende vervaldag" },
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
        text: "Training sessions, call-ups, answers and same-day check-in.",
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
    responseNeeded: "Answer needed",
    cancelled: "Cancelled",
    loading: "Loading the dashboard…",
    error: "The dashboard is temporarily unavailable.",
    retry: "Try again",
    open: "Open",
    todos: {
      documentsExpired: {
        title: "Expired documents",
        text: "To be renewed with members",
      },
      registersToClose: {
        title: "Registers to close",
        text: "Finished events, attendance to finalise",
      },
      myAttendance: {
        title: "Attendance to confirm",
        text: "Call-ups waiting for your answer",
      },
      myDocuments: {
        title: "Documents to provide",
        text: "Missing, refused or expired pieces",
      },
      myApplications: {
        title: "Applications to complete",
        text: "The club is waiting for more information",
      },
      registrationsReview: {
        title: "Registrations to review",
        text: "Submitted or under review",
      },
      documentsReview: {
        title: "Documents to check",
        text: "Uploads waiting for validation",
      },
      registrationFollowups: {
        title: "Admissions to finalise",
        text: "Documents or dues to create",
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
      duesNext30: {
        label: "Due within 30 days",
        hint: "Scheduled amount, payments tracked with the bank module",
      },
      myNextDue: { label: "My next instalment" },
    },
  },
};
