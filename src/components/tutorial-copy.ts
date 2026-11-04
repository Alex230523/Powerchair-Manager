import type { TutorialAudience } from "@/domains/tutorial/schema";

/**
 * Wave 17 (O1): the first-connection tour. Each step points at a part of the
 * screen (a CSS selector, highlighted when it is visible). Players and parents
 * get their own steps by adding them here.
 */
export type TutorialStep = { target: string; title: string; text: string };
type Copy = {
  label: string;
  step: string;
  skip: string;
  previous: string;
  next: string;
  finish: string;
  settingsTitle: string;
  settingsText: string;
  replay: string;
  steps: Partial<Record<TutorialAudience, TutorialStep[]>>;
};

const targets = {
  team: ".scope-bar",
  calendar: 'nav a[href$="/calendar"]',
  attendance: 'nav a[href$="/attendance"]',
  tasks: 'nav a[href$="/tasks"]',
  profile: ".profile-menu > summary",
  documents: 'nav a[href$="/documents"]',
  referee: 'nav a[href$="/referee"]',
};

export const tutorialCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    label: "Premiers pas",
    step: "Étape {n} sur {total}",
    skip: "Passer",
    previous: "Précédent",
    next: "Suivant",
    finish: "Terminer",
    settingsTitle: "Premiers pas",
    settingsText: "La visite guidée de la première connexion.",
    replay: "Revoir la visite guidée",
    steps: {
      coach: [
        { target: targets.team, title: "Votre équipe", text: "En haut de l'écran, choisissez la saison et l'équipe : toutes les pages suivent ce choix." },
        { target: targets.calendar, title: "Le calendrier", text: "Ouvrez « Calendrier » puis « Nouvel événement » et choisissez « Entraînement » pour créer une séance." },
        { target: targets.attendance, title: "L'appel des présences", text: "Dans « Présences », ouvrez la séance et cochez qui est là. Les joueurs ont pu répondre à l'avance." },
        { target: targets.tasks, title: "À faire", text: "Vos tâches, par type : transport, entraînement, documents. Cochez-les quand c'est fait." },
        { target: targets.profile, title: "Votre profil", text: "Depuis votre nom, ouvrez votre fiche : permis de conduire, formations et demande de validation." },
      ],
      player: [
        { target: targets.calendar, title: "Votre agenda", text: "Vos entraînements et matchs. Ouvrez une séance pour dire si vous serez là." },
        { target: targets.documents, title: "Vos documents", text: "Les documents que le club vous demande : déposez-les ici, le club les vérifie." },
        { target: targets.tasks, title: "À faire", text: "Ce que le club vous confie, avec la date. Cochez quand c'est fait." },
        { target: targets.profile, title: "Votre profil", text: "Depuis votre nom : votre fiche, votre photo, vos notifications et votre langue." },
      ],
      referee: [
        { target: targets.referee, title: "Vos désignations", text: "Les matchs qui vous sont confiés : acceptez-les ou refusez-les, et indiquez vos disponibilités." },
        { target: targets.calendar, title: "Votre agenda", text: "Toutes vos désignations au même endroit, à ajouter à votre agenda personnel." },
        { target: targets.tasks, title: "À faire", text: "Ce que la fédération vous confie : formations, rapports, étapes de votre accueil." },
        { target: targets.profile, title: "Votre profil", text: "Depuis votre nom : votre fiche, votre photo, vos notifications et votre langue." },
      ],
    },
  },
  nl: {
    label: "Eerste stappen",
    step: "Stap {n} van {total}",
    skip: "Overslaan",
    previous: "Vorige",
    next: "Volgende",
    finish: "Klaar",
    settingsTitle: "Eerste stappen",
    settingsText: "De rondleiding bij de eerste aanmelding.",
    replay: "De rondleiding opnieuw bekijken",
    steps: {
      coach: [
        { target: targets.team, title: "Uw team", text: "Kies bovenaan het seizoen en het team: alle pagina's volgen die keuze." },
        { target: targets.calendar, title: "De kalender", text: "Open « Kalender », dan « Nieuw evenement » en kies « Training » om een sessie aan te maken." },
        { target: targets.attendance, title: "De aanwezigheden", text: "Open in « Aanwezigheden » de sessie en vink aan wie er is. Spelers konden vooraf antwoorden." },
        { target: targets.tasks, title: "Te doen", text: "Uw taken per soort: vervoer, training, documenten. Vink ze aan wanneer ze gedaan zijn." },
        { target: targets.profile, title: "Uw profiel", text: "Open via uw naam uw fiche: rijbewijs, opleidingen en validatieaanvraag." },
      ],
      player: [
        { target: targets.calendar, title: "Uw agenda", text: "Uw trainingen en wedstrijden. Open een sessie om te laten weten of u er bent." },
        { target: targets.documents, title: "Uw documenten", text: "De documenten die de club vraagt: laad ze hier op, de club kijkt ze na." },
        { target: targets.tasks, title: "Te doen", text: "Wat de club u toevertrouwt, met de datum. Vink het aan wanneer het gedaan is." },
        { target: targets.profile, title: "Uw profiel", text: "Via uw naam: uw fiche, uw foto, uw meldingen en uw taal." },
      ],
      referee: [
        { target: targets.referee, title: "Uw aanduidingen", text: "De wedstrijden die u worden toevertrouwd: aanvaard of weiger ze, en geef uw beschikbaarheden op." },
        { target: targets.calendar, title: "Uw agenda", text: "Al uw aanduidingen op één plaats, toe te voegen aan uw eigen agenda." },
        { target: targets.tasks, title: "Te doen", text: "Wat de federatie u toevertrouwt: opleidingen, verslagen, stappen van uw onthaal." },
        { target: targets.profile, title: "Uw profiel", text: "Via uw naam: uw fiche, uw foto, uw meldingen en uw taal." },
      ],
    },
  },
  en: {
    label: "First steps",
    step: "Step {n} of {total}",
    skip: "Skip",
    previous: "Previous",
    next: "Next",
    finish: "Finish",
    settingsTitle: "First steps",
    settingsText: "The guided tour of the first connection.",
    replay: "Replay the guided tour",
    steps: {
      coach: [
        { target: targets.team, title: "Your team", text: "At the top of the screen, choose the season and the team: every page follows that choice." },
        { target: targets.calendar, title: "The calendar", text: "Open « Calendar », then « New event » and choose « Training » to create a session." },
        { target: targets.attendance, title: "Taking attendance", text: "In « Attendance », open the session and tick who is there. Players could answer beforehand." },
        { target: targets.tasks, title: "To do", text: "Your tasks, by type: transport, training, documents. Tick them once done." },
        { target: targets.profile, title: "Your profile", text: "From your name, open your file: driving licence, courses and validation request." },
      ],
      player: [
        { target: targets.calendar, title: "Your calendar", text: "Your training sessions and matches. Open a session to say whether you will be there." },
        { target: targets.documents, title: "Your documents", text: "The documents the club asks you for: upload them here, the club checks them." },
        { target: targets.tasks, title: "To do", text: "What the club gives you to do, with the date. Tick it once done." },
        { target: targets.profile, title: "Your profile", text: "From your name: your file, your photo, your notifications and your language." },
      ],
      referee: [
        { target: targets.referee, title: "Your appointments", text: "The matches given to you: accept or decline them, and give your availability." },
        { target: targets.calendar, title: "Your calendar", text: "All your appointments in one place, to add to your own calendar." },
        { target: targets.tasks, title: "To do", text: "What the federation gives you to do: training, reports, steps of your welcome." },
        { target: targets.profile, title: "Your profile", text: "From your name: your file, your photo, your notifications and your language." },
      ],
    },
  },
};
