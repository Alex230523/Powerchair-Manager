import type { Locale } from "../../lib/locale";

/** « Fin de coach »: what the server writes (steps, tasks, emails, attestation) in fr, nl, en. */
type Words = {
  steps: Record<"replace" | "tasks" | "duties" | "keys" | "exercises" | "rights" | "notify" | "thanks" | "survey" | "close", string>;
  task: string;
  toCoachTitle: string;
  toCoachText: string;
  teamTitle: string;
  teamText: string;
  thanksTitle: string;
  thanksText: string;
  alertTitle: string;
  alertText: string;
  attestation: { title: string; body: string; hours: string; signed: string };
};
export const offboardingWords: Record<Locale, Words> = {
  fr: {
    steps: {
      replace: "Choisir un remplaçant : {team}",
      tasks: "Réattribuer ses tâches ouvertes",
      duties: "Réattribuer ses responsabilités à venir (séances, déplacements)",
      keys: "Récupérer les clés et badges",
      exercises: "Garder ses fiches exercices (avec son accord)",
      rights: "Fixer la fin de ses droits",
      notify: "Prévenir l'équipe et les parents",
      thanks: "Remercier et envoyer l'attestation de bénévolat",
      survey: "Questionnaire de départ (facultatif)",
      close: "Clôturer le départ",
    },
    task: "Fin de coach ({name}) : {step}",
    toCoachTitle: "Votre départ du club le {date}",
    toCoachText: "Le club prépare votre départ. Vous pouvez répondre à trois questions et choisir ce que deviennent vos fiches exercices privées.",
    teamTitle: "Départ d'un coach : {name}",
    teamText: "{name} quitte son rôle de coach le {date}. Merci pour tout ce qu'il a apporté à l'équipe. Le club vous présentera bientôt la suite.",
    thanksTitle: "Merci, {name}",
    thanksText: "Le club vous remercie pour votre engagement comme coach. Votre attestation de bénévolat est disponible sur votre fiche.",
    alertTitle: "Départ de {name} : des étapes restent ouvertes",
    alertText: "Ses droits ont été retirés à la date prévue. Restent : {steps}.",
    attestation: {
      title: "Attestation de bénévolat",
      body: "Le club {club} atteste que {name} a exercé bénévolement la fonction de coach du {from} au {to}.",
      hours: "Heures d'activité encadrées sur les douze derniers mois : {hours} heures ({sessions} séances).",
      signed: "Établie le {date} pour servir et valoir ce que de droit.",
    },
  },
  nl: {
    steps: {
      replace: "Een vervanger kiezen: {team}",
      tasks: "Zijn open taken opnieuw toewijzen",
      duties: "Zijn komende verantwoordelijkheden opnieuw toewijzen (sessies, verplaatsingen)",
      keys: "Sleutels en badges terugkrijgen",
      exercises: "Zijn oefenfiches bewaren (met zijn akkoord)",
      rights: "Het einde van zijn rechten vastleggen",
      notify: "Het team en de ouders verwittigen",
      thanks: "Bedanken en het vrijwilligersattest versturen",
      survey: "Vertrekvragenlijst (facultatief)",
      close: "Het vertrek afsluiten",
    },
    task: "Einde coach ({name}): {step}",
    toCoachTitle: "Uw vertrek uit de club op {date}",
    toCoachText: "De club bereidt uw vertrek voor. U kunt drie vragen beantwoorden en kiezen wat er met uw privé-oefenfiches gebeurt.",
    teamTitle: "Vertrek van een coach: {name}",
    teamText: "{name} stopt als coach op {date}. Bedankt voor alles wat hij het team heeft gebracht. De club stelt u binnenkort de opvolging voor.",
    thanksTitle: "Bedankt, {name}",
    thanksText: "De club bedankt u voor uw inzet als coach. Uw vrijwilligersattest staat op uw fiche.",
    alertTitle: "Vertrek van {name}: er staan nog stappen open",
    alertText: "Zijn rechten zijn op de voorziene datum ingetrokken. Blijven open: {steps}.",
    attestation: {
      title: "Vrijwilligersattest",
      body: "De club {club} verklaart dat {name} van {from} tot {to} vrijwillig de functie van coach heeft uitgeoefend.",
      hours: "Begeleide activiteitsuren in de laatste twaalf maanden: {hours} uur ({sessions} sessies).",
      signed: "Opgemaakt op {date} om te dienen waar nodig.",
    },
  },
  en: {
    steps: {
      replace: "Choose a replacement: {team}",
      tasks: "Reassign his open tasks",
      duties: "Reassign his coming duties (sessions, trips)",
      keys: "Get the keys and badges back",
      exercises: "Keep his exercise sheets (with his consent)",
      rights: "Set the end of his rights",
      notify: "Tell the team and the parents",
      thanks: "Thank him and send the volunteering certificate",
      survey: "Leaving questionnaire (optional)",
      close: "Close the departure",
    },
    task: "Coach leaving ({name}): {step}",
    toCoachTitle: "Your departure from the club on {date}",
    toCoachText: "The club is preparing your departure. You may answer three questions and choose what happens to your private exercise sheets.",
    teamTitle: "A coach is leaving: {name}",
    teamText: "{name} stops coaching on {date}. Thank you for everything he brought to the team. The club will soon present what comes next.",
    thanksTitle: "Thank you, {name}",
    thanksText: "The club thanks you for your commitment as a coach. Your volunteering certificate is on your file.",
    alertTitle: "{name}'s departure: steps are still open",
    alertText: "His rights were withdrawn on the planned date. Still open: {steps}.",
    attestation: {
      title: "Volunteering certificate",
      body: "The club {club} certifies that {name} acted as a volunteer coach from {from} to {to}.",
      hours: "Supervised activity hours over the last twelve months: {hours} hours ({sessions} sessions).",
      signed: "Issued on {date} for all intents and purposes.",
    },
  },
};
export const fillWords = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
