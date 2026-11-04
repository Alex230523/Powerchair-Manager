import type { Locale } from "@/lib/locale";

/** « Fin de coach »: the departure card on the coach's file and its settings. */
type Copy = {
  title: string;
  intro: string;
  start: string;
  endsOn: string;
  reason: string;
  reasons: Record<"stopped" | "moved" | "unknown", string>;
  note: string;
  noteHelp: string;
  notifyCoach: string;
  confirmStart: string;
  cancelForm: string;
  started: string;
  saved: string;
  progress: string;
  endsAt: string;
  done: string;
  skipped: string;
  auto: string;
  late: string;
  blocking: string;
  replaceHelp: string;
  openTeam: string;
  to: string;
  choose: string;
  reassignTasks: string;
  reassignDuties: string;
  dutiesHelp: string;
  keysHelp: string;
  rightsEnd: string;
  notifySend: string;
  thanksSend: string;
  sent: string;
  skip: string;
  skipReason: string;
  skipSave: string;
  cancel: string;
  cancelled: string;
  closed: string;
  certificate: string;
  survey: { title: string; liked: string; change: string; back: string; send: string };
  exercises: { text: string; copy: string; keep: string };
  selfIntro: string;
  waiting: string;
  settings: { title: string; intro: string; keep: Record<"notify" | "thanks" | "survey" | "exercises", string>; save: string };
  errors: Record<string, string>;
};
export const offboardingCopy: Record<Locale, Copy> = {
  fr: {
    title: "Fin de coach",
    intro: "Préparez le départ : l'application liste ce qui le concerne (équipes, tâches, séances, clés, droits) et coche chaque étape quand elle est faite.",
    start: "Fin de coach",
    endsOn: "Date de fin",
    reason: "Raison",
    reasons: { stopped: "Il arrête", moved: "Il part dans un autre club", unknown: "Non précisée" },
    note: "Note interne",
    noteHelp: "Visible seulement par les responsables du club.",
    notifyCoach: "Prévenir le coach (il pourra répondre au questionnaire et choisir pour ses fiches)",
    confirmStart: "Préparer le départ",
    cancelForm: "Fermer",
    started: "Départ préparé.",
    saved: "Enregistré.",
    progress: "{done} étapes sur {total}",
    endsAt: "Fin prévue le {date}",
    done: "Fait",
    skipped: "Passé",
    auto: "Coché automatiquement",
    late: "En retard",
    blocking: "Bloquant",
    replaceHelp: "Ajoutez le nouveau coach dans l'équipe : l'étape se coche toute seule.",
    openTeam: "Ouvrir l'équipe",
    to: "Donner à",
    choose: "Choisir une personne",
    reassignTasks: "Réattribuer toutes ses tâches",
    reassignDuties: "Réattribuer séances et déplacements",
    dutiesHelp: "Seules les personnes avec un compte peuvent être responsables d'une séance.",
    keysHelp: "Marquez les clés rendues dans « Clés et badges » sur cette fiche.",
    rightsEnd: "Fixer la fin des droits à la date de fin",
    notifySend: "Envoyer le message à l'équipe et aux parents",
    thanksSend: "Envoyer le remerciement",
    sent: "Message envoyé à {n} personnes.",
    skip: "Passer cette étape",
    skipReason: "Pourquoi ?",
    skipSave: "Passer",
    cancel: "Annuler le départ",
    cancelled: "Départ annulé : le coach reste.",
    closed: "Départ clôturé.",
    certificate: "Attestation de bénévolat (PDF)",
    survey: { title: "Trois questions avant de partir", liked: "Ce que vous avez aimé", change: "Ce que le club devrait changer", back: "Reviendriez-vous ? Dans quel rôle ?", send: "Envoyer mes réponses" },
    exercises: { text: "Vos fiches exercices privées : les donner à la bibliothèque du club, ou les garder pour vous ?", copy: "Les donner au club", keep: "Les garder privées" },
    selfIntro: "Le club prépare votre départ. Voici ce qui reste à faire et ce qui vous concerne.",
    waiting: "À faire par le club",
    settings: {
      title: "Fin de coach",
      intro: "Les étapes facultatives gardées dans chaque départ. Le remplacement, les tâches, les clés, les droits et la clôture restent toujours.",
      keep: { notify: "Prévenir l'équipe et les parents", thanks: "Remercier et envoyer l'attestation", survey: "Questionnaire de départ", exercises: "Proposer de garder ses fiches exercices" },
      save: "Enregistrer",
    },
    errors: { DEPARTURE_CLOSED: "Ce départ est déjà clôturé.", INVALID_DATE: "La date de fin ne peut pas être passée.", NO_ACCOUNT: "Cette personne n'a pas de compte.", DUPLICATE: "Un départ est déjà en cours." },
  },
  nl: {
    title: "Einde coach",
    intro: "Bereid het vertrek voor: de toepassing toont wat hem aanbelangt (teams, taken, sessies, sleutels, rechten) en vinkt elke stap af zodra ze klaar is.",
    start: "Einde coach",
    endsOn: "Einddatum",
    reason: "Reden",
    reasons: { stopped: "Hij stopt", moved: "Hij gaat naar een andere club", unknown: "Niet opgegeven" },
    note: "Interne notitie",
    noteHelp: "Alleen zichtbaar voor de verantwoordelijken van de club.",
    notifyCoach: "De coach verwittigen (hij kan de vragenlijst invullen en kiezen voor zijn fiches)",
    confirmStart: "Het vertrek voorbereiden",
    cancelForm: "Sluiten",
    started: "Vertrek voorbereid.",
    saved: "Opgeslagen.",
    progress: "{done} van {total} stappen",
    endsAt: "Einde gepland op {date}",
    done: "Klaar",
    skipped: "Overgeslagen",
    auto: "Automatisch afgevinkt",
    late: "Te laat",
    blocking: "Blokkerend",
    replaceHelp: "Voeg de nieuwe coach toe aan het team: de stap vinkt zichzelf af.",
    openTeam: "Het team openen",
    to: "Geven aan",
    choose: "Een persoon kiezen",
    reassignTasks: "Al zijn taken opnieuw toewijzen",
    reassignDuties: "Sessies en verplaatsingen opnieuw toewijzen",
    dutiesHelp: "Alleen personen met een account kunnen verantwoordelijk zijn voor een sessie.",
    keysHelp: "Duid de teruggegeven sleutels aan in « Sleutels en badges » op deze fiche.",
    rightsEnd: "Het einde van de rechten op de einddatum zetten",
    notifySend: "Het bericht naar het team en de ouders sturen",
    thanksSend: "De bedanking sturen",
    sent: "Bericht verstuurd naar {n} personen.",
    skip: "Deze stap overslaan",
    skipReason: "Waarom?",
    skipSave: "Overslaan",
    cancel: "Het vertrek annuleren",
    cancelled: "Vertrek geannuleerd: de coach blijft.",
    closed: "Vertrek afgesloten.",
    certificate: "Vrijwilligersattest (pdf)",
    survey: { title: "Drie vragen voor u vertrekt", liked: "Wat u goed vond", change: "Wat de club zou moeten veranderen", back: "Zou u terugkomen? In welke rol?", send: "Mijn antwoorden sturen" },
    exercises: { text: "Uw privé-oefenfiches: aan de bibliotheek van de club geven, of voor uzelf houden?", copy: "Aan de club geven", keep: "Privé houden" },
    selfIntro: "De club bereidt uw vertrek voor. Dit blijft er te doen en dit gaat u aan.",
    waiting: "Te doen door de club",
    settings: {
      title: "Einde coach",
      intro: "De facultatieve stappen die in elk vertrek blijven. Vervanging, taken, sleutels, rechten en afsluiting blijven altijd.",
      keep: { notify: "Het team en de ouders verwittigen", thanks: "Bedanken en het attest sturen", survey: "Vertrekvragenlijst", exercises: "Voorstellen zijn oefenfiches te bewaren" },
      save: "Opslaan",
    },
    errors: { DEPARTURE_CLOSED: "Dit vertrek is al afgesloten.", INVALID_DATE: "De einddatum mag niet voorbij zijn.", NO_ACCOUNT: "Deze persoon heeft geen account.", DUPLICATE: "Er loopt al een vertrek." },
  },
  en: {
    title: "Coach leaving",
    intro: "Prepare the departure: the application lists what concerns him (teams, tasks, sessions, keys, rights) and ticks each step once it is done.",
    start: "Coach leaving",
    endsOn: "End date",
    reason: "Reason",
    reasons: { stopped: "He stops", moved: "He moves to another club", unknown: "Not given" },
    note: "Internal note",
    noteHelp: "Seen only by the club's managers.",
    notifyCoach: "Tell the coach (he may answer the questionnaire and choose for his sheets)",
    confirmStart: "Prepare the departure",
    cancelForm: "Close",
    started: "Departure prepared.",
    saved: "Saved.",
    progress: "{done} of {total} steps",
    endsAt: "Planned end on {date}",
    done: "Done",
    skipped: "Skipped",
    auto: "Ticked automatically",
    late: "Late",
    blocking: "Blocking",
    replaceHelp: "Add the new coach to the team: the step ticks by itself.",
    openTeam: "Open the team",
    to: "Give to",
    choose: "Choose a person",
    reassignTasks: "Reassign all his tasks",
    reassignDuties: "Reassign sessions and trips",
    dutiesHelp: "Only people with an account can be responsible for a session.",
    keysHelp: "Mark the returned keys in « Keys and badges » on this file.",
    rightsEnd: "Set the end of the rights to the end date",
    notifySend: "Send the message to the team and the parents",
    thanksSend: "Send the thanks",
    sent: "Message sent to {n} people.",
    skip: "Skip this step",
    skipReason: "Why?",
    skipSave: "Skip",
    cancel: "Cancel the departure",
    cancelled: "Departure cancelled: the coach stays.",
    closed: "Departure closed.",
    certificate: "Volunteering certificate (PDF)",
    survey: { title: "Three questions before you leave", liked: "What you liked", change: "What the club should change", back: "Would you come back? In which role?", send: "Send my answers" },
    exercises: { text: "Your private exercise sheets: give them to the club's library, or keep them to yourself?", copy: "Give them to the club", keep: "Keep them private" },
    selfIntro: "The club is preparing your departure. Here is what is left and what concerns you.",
    waiting: "For the club to do",
    settings: {
      title: "Coach leaving",
      intro: "The optional steps kept in each departure. Replacement, tasks, keys, rights and closing always stay.",
      keep: { notify: "Tell the team and the parents", thanks: "Thank and send the certificate", survey: "Leaving questionnaire", exercises: "Offer to keep his exercise sheets" },
      save: "Save",
    },
    errors: { DEPARTURE_CLOSED: "This departure is already closed.", INVALID_DATE: "The end date cannot be in the past.", NO_ACCOUNT: "This person has no account.", DUPLICATE: "A departure is already under way." },
  },
};
