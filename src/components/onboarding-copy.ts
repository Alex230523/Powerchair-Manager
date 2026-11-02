import type { Locale } from "@/lib/locale";

/** Parcours d'accueil: the newcomer's card and the club's or federation's page, in fr, nl, en. */
type Copy = {
  welcome: string;
  progress: string;
  next: string;
  all: string;
  done: string;
  late: string;
  due: string;
  kinds: Record<"message" | "read" | "sign" | "profile" | "upload" | "training" | "task" | "meeting" | "tour", string>;
  doSelf: Record<"message" | "read" | "sign" | "training", string>;
  where: Record<"profile" | "upload" | "task" | "meeting" | "tour", string>;
  signName: string;
  signedAs: string;
  title: string;
  intro: string;
  templates: string;
  noTemplate: string;
  adopt: string;
  suggestions: Record<"coach" | "referee" | "family", string>;
  audiences: Record<"coach" | "player" | "guardian" | "referee" | "federation_worker", string>;
  triggers: Record<"invitation" | "manual", string>;
  edit: string;
  archive: string;
  restore: string;
  name: string;
  audience: string;
  trigger: string;
  steps: string;
  stepKind: string;
  stepTitle: string;
  stepDays: string;
  stepRequired: string;
  stepLink: string;
  stepOwner: string;
  noOwner: string;
  fields: Record<"phone" | "birth_date" | "licence" | "photo" | "availability", string>;
  addStep: string;
  removeStep: string;
  up: string;
  down: string;
  save: string;
  cancel: string;
  follow: string;
  noRun: string;
  runLine: string;
  statuses: Record<"active" | "done" | "cancelled", string>;
  remind: string;
  reminded: string;
  start: string;
  person: string;
  template: string;
  startSave: string;
  stopRun: string;
  markDone: string;
  markUndone: string;
  saved: string;
  errors: Record<string, string>;
};
const fr: Copy = {
  welcome: "Bienvenue : {name}",
  progress: "{done} étape(s) sur {total}",
  next: "Prochaine étape : {title}",
  all: "Toutes les étapes",
  done: "Fait",
  late: "En retard",
  due: "avant le {date}",
  kinds: { message: "Message", read: "À lire", sign: "À signer", profile: "Profil", upload: "Document", training: "Formation", task: "Tâche", meeting: "Rencontre", tour: "Visite guidée" },
  doSelf: { message: "J'ai lu", read: "J'ai lu", sign: "Signer", training: "Demande de validation envoyée" },
  where: {
    profile: "À compléter dans votre profil",
    upload: "À déposer dans Documents",
    task: "Dans votre to-do",
    meeting: "Dans votre to-do, à cocher par vous deux",
    tour: "Depuis Réglages › Mon compte › Premiers pas",
  },
  signName: "Votre nom complet",
  signedAs: "Signé par {name}",
  title: "Parcours d'accueil",
  intro: "Les étapes données à chaque nouveau venu selon son rôle. Un parcours ne donne aucun droit : il utilise ce que le rôle permet déjà.",
  templates: "Modèles",
  noTemplate: "Aucun modèle pour l'instant : partez d'un modèle proposé.",
  adopt: "Ajouter le modèle « {name} »",
  suggestions: { coach: "Nouveau coach", referee: "Nouvel arbitre", family: "Nouveau joueur et sa famille" },
  audiences: { coach: "Coachs", player: "Joueurs", guardian: "Parents", referee: "Arbitres", federation_worker: "Équipe fédérale" },
  triggers: { invitation: "À l'acceptation de l'invitation", manual: "Lancé à la main" },
  edit: "Modifier",
  archive: "Archiver",
  restore: "Réactiver",
  name: "Nom",
  audience: "Pour",
  trigger: "Démarre",
  steps: "Étapes",
  stepKind: "Type",
  stepTitle: "Intitulé",
  stepDays: "Jours après l'arrivée",
  stepRequired: "Obligatoire",
  stepLink: "Lien",
  stepOwner: "Avec",
  noOwner: "Personne",
  fields: { phone: "Téléphone", birth_date: "Date de naissance", licence: "Permis de conduire", photo: "Photo", availability: "Disponibilités (arbitre)" },
  addStep: "Ajouter une étape",
  removeStep: "Retirer l'étape",
  up: "Monter",
  down: "Descendre",
  save: "Enregistrer le modèle",
  cancel: "Annuler",
  follow: "Suivi",
  noRun: "Aucun parcours en cours.",
  runLine: "{person} · {name} · {progress}",
  statuses: { active: "En cours", done: "Terminé", cancelled: "Arrêté" },
  remind: "Relancer les retards",
  reminded: "{n} personne(s) relancée(s).",
  start: "Lancer un parcours",
  person: "Personne",
  template: "Modèle",
  startSave: "Lancer",
  stopRun: "Arrêter le parcours",
  markDone: "Marquer fait",
  markUndone: "Rouvrir",
  saved: "Enregistré.",
  errors: { AUTOMATIC_STEP: "Cette étape se coche seule quand elle est faite.", DUPLICATE: "Ce parcours est déjà en cours pour cette personne." },
};
const nl: Copy = {
  welcome: "Welkom: {name}",
  progress: "{done} stap(pen) van {total}",
  next: "Volgende stap: {title}",
  all: "Alle stappen",
  done: "Klaar",
  late: "Te laat",
  due: "vóór {date}",
  kinds: { message: "Bericht", read: "Te lezen", sign: "Te ondertekenen", profile: "Profiel", upload: "Document", training: "Opleiding", task: "Taak", meeting: "Ontmoeting", tour: "Rondleiding" },
  doSelf: { message: "Gelezen", read: "Gelezen", sign: "Ondertekenen", training: "Validatieaanvraag verstuurd" },
  where: {
    profile: "In uw profiel aan te vullen",
    upload: "Op te laden in Documenten",
    task: "In uw to-do",
    meeting: "In uw to-do, door u beiden af te vinken",
    tour: "Via Instellingen › Mijn account › Eerste stappen",
  },
  signName: "Uw volledige naam",
  signedAs: "Ondertekend door {name}",
  title: "Onthaaltrajecten",
  intro: "De stappen die elke nieuwkomer volgens zijn rol krijgt. Een traject geeft geen enkel recht: het gebruikt wat de rol al toelaat.",
  templates: "Modellen",
  noTemplate: "Nog geen model: vertrek van een voorgesteld model.",
  adopt: "Het model « {name} » toevoegen",
  suggestions: { coach: "Nieuwe coach", referee: "Nieuwe scheidsrechter", family: "Nieuwe speler en zijn gezin" },
  audiences: { coach: "Coaches", player: "Spelers", guardian: "Ouders", referee: "Scheidsrechters", federation_worker: "Federatieteam" },
  triggers: { invitation: "Bij het aanvaarden van de uitnodiging", manual: "Met de hand gestart" },
  edit: "Wijzigen",
  archive: "Archiveren",
  restore: "Opnieuw activeren",
  name: "Naam",
  audience: "Voor",
  trigger: "Start",
  steps: "Stappen",
  stepKind: "Soort",
  stepTitle: "Titel",
  stepDays: "Dagen na de aankomst",
  stepRequired: "Verplicht",
  stepLink: "Koppeling",
  stepOwner: "Met",
  noOwner: "Niemand",
  fields: { phone: "Telefoon", birth_date: "Geboortedatum", licence: "Rijbewijs", photo: "Foto", availability: "Beschikbaarheden (scheidsrechter)" },
  addStep: "Een stap toevoegen",
  removeStep: "De stap verwijderen",
  up: "Omhoog",
  down: "Omlaag",
  save: "Het model bewaren",
  cancel: "Annuleren",
  follow: "Opvolging",
  noRun: "Geen lopend traject.",
  runLine: "{person} · {name} · {progress}",
  statuses: { active: "Lopend", done: "Afgerond", cancelled: "Gestopt" },
  remind: "De achterstanden herinneren",
  reminded: "{n} persoon/personen herinnerd.",
  start: "Een traject starten",
  person: "Persoon",
  template: "Model",
  startSave: "Starten",
  stopRun: "Het traject stoppen",
  markDone: "Als klaar markeren",
  markUndone: "Heropenen",
  saved: "Bewaard.",
  errors: { AUTOMATIC_STEP: "Deze stap vinkt zichzelf af wanneer ze gedaan is.", DUPLICATE: "Dit traject loopt al voor deze persoon." },
};
const en: Copy = {
  welcome: "Welcome: {name}",
  progress: "{done} step(s) out of {total}",
  next: "Next step: {title}",
  all: "All the steps",
  done: "Done",
  late: "Late",
  due: "by {date}",
  kinds: { message: "Message", read: "To read", sign: "To sign", profile: "Profile", upload: "Document", training: "Training", task: "Task", meeting: "Meeting", tour: "Guided tour" },
  doSelf: { message: "I have read it", read: "I have read it", sign: "Sign", training: "Validation request sent" },
  where: {
    profile: "To complete in your profile",
    upload: "To upload in Documents",
    task: "In your to-do",
    meeting: "In your to-do, to tick by both of you",
    tour: "From Settings › My account › First steps",
  },
  signName: "Your full name",
  signedAs: "Signed by {name}",
  title: "Welcome journeys",
  intro: "The steps given to each newcomer according to their role. A journey gives no right: it uses what the role already allows.",
  templates: "Templates",
  noTemplate: "No template yet: start from a proposed one.",
  adopt: "Add the template « {name} »",
  suggestions: { coach: "New coach", referee: "New referee", family: "New player and family" },
  audiences: { coach: "Coaches", player: "Players", guardian: "Parents", referee: "Referees", federation_worker: "Federation staff" },
  triggers: { invitation: "When the invitation is accepted", manual: "Started by hand" },
  edit: "Edit",
  archive: "Archive",
  restore: "Restore",
  name: "Name",
  audience: "For",
  trigger: "Starts",
  steps: "Steps",
  stepKind: "Kind",
  stepTitle: "Title",
  stepDays: "Days after arrival",
  stepRequired: "Required",
  stepLink: "Link",
  stepOwner: "With",
  noOwner: "Nobody",
  fields: { phone: "Phone", birth_date: "Date of birth", licence: "Driving licence", photo: "Photo", availability: "Availability (referee)" },
  addStep: "Add a step",
  removeStep: "Remove the step",
  up: "Move up",
  down: "Move down",
  save: "Save the template",
  cancel: "Cancel",
  follow: "Follow-up",
  noRun: "No journey in progress.",
  runLine: "{person} · {name} · {progress}",
  statuses: { active: "In progress", done: "Finished", cancelled: "Stopped" },
  remind: "Remind those late",
  reminded: "{n} person(s) reminded.",
  start: "Start a journey",
  person: "Person",
  template: "Template",
  startSave: "Start",
  stopRun: "Stop the journey",
  markDone: "Mark done",
  markUndone: "Reopen",
  saved: "Saved.",
  errors: { AUTOMATIC_STEP: "This step ticks by itself when it is done.", DUPLICATE: "This journey is already in progress for this person." },
};
export const onboardingCopy: Record<Locale, Copy> = { fr, nl, en };
