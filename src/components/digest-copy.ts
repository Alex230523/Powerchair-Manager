import type { Locale } from "@/lib/locale";
import type { DigestSection } from "@/domains/digest/schema";

/** The weekly digest (wave 15, C7): its settings and the email itself. */
export type DigestCopy = {
  title: string;
  intro: string;
  enabled: string;
  day: string;
  time: string;
  clubDay: string;
  clubTime: string;
  sections: string;
  rightsHint: string;
  sectionNames: Record<DigestSection, string>;
  save: string;
  saved: string;
  next: string;
  off: string;
  preview: string;
  previewHint: string;
  previewSent: string;
  previewEmpty: string;
  clubTitle: string;
  clubDayLabel: string;
  clubTimeLabel: string;
  clubHint: string;
  clubSave: string;
  clubSaved: string;
  days: string[];
  noSection: string;
  mail: {
    subject: string;
    heading: string;
    hello: string;
    lead: string;
    headings: Record<DigestSection, string>;
    registrations: [string, string];
    documents: [string, string];
    dues: [string, string];
    readiness: string;
    deadlineKinds: Record<"grant" | "partner" | "accounts", string>;
    noResponsible: string;
    late: string;
    treasury: string;
    button: string;
    footer: string;
    stop: string;
    settings: string;
    preview: string;
  };
};

export const digestCopy: Record<Locale, DigestCopy> = {
  fr: {
    title: "Résumé hebdomadaire",
    intro: "Un court email chaque semaine avec ce qui vous attend : tâches, événements, dates à ne pas manquer. Rien ne part si la semaine est vide.",
    enabled: "Recevoir le résumé hebdomadaire",
    day: "Jour d’envoi",
    time: "Heure (heure de Bruxelles)",
    clubDay: "Jour du club ({day})",
    clubTime: "Heure du club ({time})",
    sections: "Rubriques à inclure",
    rightsHint: "Chaque rubrique ne montre que ce que vos droits vous permettent de voir, comme le tableau de bord.",
    sectionNames: {
      todos: "Tâches à traiter",
      events: "Événements des 7 prochains jours",
      registrations: "Nouvelles inscriptions",
      documents: "Documents qui expirent sous 30 jours",
      dues: "Cotisations en retard",
      readiness: "Séances avec effectif insuffisant",
      deadlines: "Dates des subsides, sponsors et comptes à 30 jours",
      tasks: "Conditions de sponsors et tâches de subsides à 7 jours",
      treasury: "Solde de trésorerie",
    },
    save: "Enregistrer mon résumé",
    saved: "Préférences du résumé enregistrées.",
    next: "Prochain envoi : {date} à {time}, s’il y a quelque chose à signaler.",
    off: "Le résumé est désactivé pour vous.",
    preview: "Recevoir un aperçu maintenant",
    previewHint: "L’aperçu part à votre adresse avec les chiffres d’aujourd’hui, même si le résumé est désactivé.",
    previewSent: "Aperçu préparé : il arrive dans quelques instants.",
    previewEmpty: "Rien à signaler aujourd’hui : aucun aperçu n’a été envoyé.",
    clubTitle: "Moment par défaut du club",
    clubDayLabel: "Jour par défaut du club",
    clubTimeLabel: "Heure par défaut du club",
    clubHint: "Pour les responsables qui n’ont pas choisi leur propre jour ou heure.",
    clubSave: "Enregistrer pour le club",
    clubSaved: "Moment du club enregistré.",
    days: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    noSection: "Cochez au moins une rubrique.",
    mail: {
      subject: "Votre semaine · {club}",
      heading: "Votre semaine",
      hello: "Bonjour {name},",
      lead: "Voici ce qui vous attend à {club}.",
      headings: {
        todos: "À traiter",
        events: "Les 7 prochains jours",
        registrations: "Inscriptions",
        documents: "Documents",
        dues: "Cotisations",
        readiness: "Effectif insuffisant",
        deadlines: "Dates à 30 jours",
        tasks: "Sponsors et subsides",
        treasury: "Trésorerie",
      },
      registrations: ["1 inscription à examiner", "{n} inscriptions à examiner"],
      documents: ["1 document expire dans les 30 jours", "{n} documents expirent dans les 30 jours"],
      dues: ["1 joueur en retard, {amount} à percevoir", "{n} joueurs en retard, {amount} à percevoir"],
      readiness: "{players} joueurs et {coaches} coachs présents",
      deadlineKinds: { grant: "Subside", partner: "Partenaire", accounts: "Comptes annuels" },
      noResponsible: "sans responsable",
      late: "en retard",
      treasury: "Solde actuel : {amount}",
      button: "Ouvrir le tableau de bord",
      footer: "Vous recevez ce résumé parce qu’il est activé dans vos réglages de {club}.",
      stop: "Ne plus recevoir ce résumé",
      settings: "Changer le jour, l’heure ou les rubriques",
      preview: "Aperçu demandé depuis vos réglages.",
    },
  },
  nl: {
    title: "Wekelijks overzicht",
    intro: "Elke week een korte e-mail met wat je te wachten staat: taken, activiteiten, data om niet te missen. Niets wordt verstuurd als de week leeg is.",
    enabled: "Het wekelijkse overzicht ontvangen",
    day: "Verzenddag",
    time: "Uur (Brusselse tijd)",
    clubDay: "Dag van de club ({day})",
    clubTime: "Uur van de club ({time})",
    sections: "Rubrieken",
    rightsHint: "Elke rubriek toont alleen wat je rechten je laten zien, zoals het dashboard.",
    sectionNames: {
      todos: "Te behandelen taken",
      events: "Activiteiten van de komende 7 dagen",
      registrations: "Nieuwe inschrijvingen",
      documents: "Documenten die binnen 30 dagen vervallen",
      dues: "Achterstallig lidgeld",
      readiness: "Sessies met te weinig deelnemers",
      deadlines: "Data van subsidies, sponsors en jaarrekening binnen 30 dagen",
      tasks: "Sponsorvoorwaarden en subsidietaken binnen 7 dagen",
      treasury: "Kassaldo",
    },
    save: "Mijn overzicht opslaan",
    saved: "Voorkeuren van het overzicht opgeslagen.",
    next: "Volgende verzending: {date} om {time}, als er iets te melden is.",
    off: "Het overzicht staat voor jou uit.",
    preview: "Nu een voorbeeld ontvangen",
    previewHint: "Het voorbeeld gaat naar je adres met de cijfers van vandaag, ook als het overzicht uit staat.",
    previewSent: "Voorbeeld voorbereid: het komt binnen enkele ogenblikken aan.",
    previewEmpty: "Vandaag niets te melden: er is geen voorbeeld verstuurd.",
    clubTitle: "Standaardmoment van de club",
    clubDayLabel: "Standaarddag van de club",
    clubTimeLabel: "Standaarduur van de club",
    clubHint: "Voor de verantwoordelijken die geen eigen dag of uur kozen.",
    clubSave: "Opslaan voor de club",
    clubSaved: "Moment van de club opgeslagen.",
    days: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
    noSection: "Vink minstens één rubriek aan.",
    mail: {
      subject: "Jouw week · {club}",
      heading: "Jouw week",
      hello: "Hallo {name},",
      lead: "Dit staat je te wachten bij {club}.",
      headings: {
        todos: "Te behandelen",
        events: "De komende 7 dagen",
        registrations: "Inschrijvingen",
        documents: "Documenten",
        dues: "Lidgeld",
        readiness: "Te weinig deelnemers",
        deadlines: "Data binnen 30 dagen",
        tasks: "Sponsors en subsidies",
        treasury: "Kas",
      },
      registrations: ["1 inschrijving te bekijken", "{n} inschrijvingen te bekijken"],
      documents: ["1 document vervalt binnen 30 dagen", "{n} documenten vervallen binnen 30 dagen"],
      dues: ["1 speler achterstallig, {amount} te innen", "{n} spelers achterstallig, {amount} te innen"],
      readiness: "{players} spelers en {coaches} coaches aanwezig",
      deadlineKinds: { grant: "Subsidie", partner: "Partner", accounts: "Jaarrekening" },
      noResponsible: "zonder verantwoordelijke",
      late: "te laat",
      treasury: "Huidig saldo: {amount}",
      button: "Het dashboard openen",
      footer: "Je ontvangt dit overzicht omdat het in je instellingen van {club} aan staat.",
      stop: "Dit overzicht niet meer ontvangen",
      settings: "Dag, uur of rubrieken wijzigen",
      preview: "Voorbeeld gevraagd vanuit je instellingen.",
    },
  },
  en: {
    title: "Weekly digest",
    intro: "A short email each week with what lies ahead: tasks, events, dates not to miss. Nothing is sent when the week is empty.",
    enabled: "Receive the weekly digest",
    day: "Sending day",
    time: "Time (Brussels time)",
    clubDay: "Club's day ({day})",
    clubTime: "Club's time ({time})",
    sections: "Sections to include",
    rightsHint: "Each section only shows what your rights let you see, like the dashboard.",
    sectionNames: {
      todos: "Tasks to handle",
      events: "Events of the next 7 days",
      registrations: "New registrations",
      documents: "Documents expiring within 30 days",
      dues: "Late membership fees",
      readiness: "Sessions short of people",
      deadlines: "Grant, sponsor and accounts dates within 30 days",
      tasks: "Sponsor conditions and grant tasks within 7 days",
      treasury: "Treasury balance",
    },
    save: "Save my digest",
    saved: "Digest preferences saved.",
    next: "Next sending: {date} at {time}, if there is anything to report.",
    off: "The digest is switched off for you.",
    preview: "Receive a preview now",
    previewHint: "The preview goes to your address with today's figures, even when the digest is switched off.",
    previewSent: "Preview prepared: it arrives in a few moments.",
    previewEmpty: "Nothing to report today: no preview was sent.",
    clubTitle: "Club's default moment",
    clubDayLabel: "Club's default day",
    clubTimeLabel: "Club's default time",
    clubHint: "For the managers who did not choose their own day or time.",
    clubSave: "Save for the club",
    clubSaved: "Club's moment saved.",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    noSection: "Tick at least one section.",
    mail: {
      subject: "Your week · {club}",
      heading: "Your week",
      hello: "Hello {name},",
      lead: "Here is what lies ahead at {club}.",
      headings: {
        todos: "To handle",
        events: "The next 7 days",
        registrations: "Registrations",
        documents: "Documents",
        dues: "Membership fees",
        readiness: "Short of people",
        deadlines: "Dates within 30 days",
        tasks: "Sponsors and grants",
        treasury: "Treasury",
      },
      registrations: ["1 registration to review", "{n} registrations to review"],
      documents: ["1 document expires within 30 days", "{n} documents expire within 30 days"],
      dues: ["1 player late, {amount} to collect", "{n} players late, {amount} to collect"],
      readiness: "{players} players and {coaches} coaches present",
      deadlineKinds: { grant: "Grant", partner: "Partner", accounts: "Annual accounts" },
      noResponsible: "no one in charge",
      late: "late",
      treasury: "Current balance: {amount}",
      button: "Open the dashboard",
      footer: "You receive this digest because it is switched on in your settings at {club}.",
      stop: "Stop receiving this digest",
      settings: "Change the day, time or sections",
      preview: "Preview asked from your settings.",
    },
  },
};
