import type { Locale } from "@/lib/locale";
import type { PlanStep } from "@/domains/seasons/plan-steps";

/** 16: « Préparer la saison suivante » (fr, nl, en). */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  error: string;
  noSeason: string;
  forbidden: string;
  ending: string;
  daysLeft: string;
  progress: string;
  steps: Record<PlanStep, { title: string; text: string }>;
  states: Record<"todo" | "done" | "skipped", string>;
  markDone: string;
  skip: string;
  reopen: string;
  save: string;
  saved: string;
  review: Record<"players" | "teams" | "events" | "duesOpen" | "expiredDocuments" | "chairsToService", string>;
  reportLink: string;
  name: string;
  startsOn: string;
  endsOn: string;
  copyTeam: string;
  leaving: string;
  former: string;
  formerLink: string;
  copyPlans: string;
  amountOf: string;
  issueOn: string;
  issueHint: string;
  noPlan: string;
  feeLine: string;
  noFee: string;
  reminderKinds: Record<"grant" | "partner" | "insurance", string>;
  noReminder: string;
  dueOn: string;
  launchOn: string;
  launchHint: string;
  subject: string;
  text: string;
  sendOn: string;
  sendHint: string;
  summaryIntro: string;
  summaryItems: Record<"season" | "players" | "plans" | "issue" | "check", string>;
  summaryOn: string;
  nothing: string;
  launch: string;
  launched: string;
  launchedOn: string;
  relaunchHint: string;
  scheduled: string;
  actionKinds: Record<"dues_issue" | "season_check" | "newsletter", string>;
  actionStates: Record<"scheduled" | "done" | "cancelled" | "failed", string>;
  cancel: string;
  cancelled: string;
  cardTitle: string;
  cardText: string;
  cardLink: string;
  settingsTitle: string;
  settingsText: string;
  errors: Record<string, string>;
};
const fr: Copy = {
  title: "Préparer la saison suivante",
  intro: "Tout ce qu'il faut faire une fois par an, dans l'ordre. Chaque étape peut être faite, ignorée ou reprise plus tard ; rien n'est créé avant « Lancer ».",
  loading: "Chargement de l'assistant…",
  error: "L'assistant n'a pas pu être chargé. Réessayez dans un instant.",
  noSeason: "Aucune saison en cours : créez d'abord une saison dans Réglages › Saisons et équipes.",
  forbidden: "Cet assistant est réservé à la présidence du club.",
  ending: "Saison qui se termine : {name} (fin le {date})",
  daysLeft: "{n} jour(s) avant la fin",
  progress: "{done} étape(s) sur {total} faites ou ignorées",
  steps: {
    review: { title: "Bilan de la saison", text: "Les chiffres clés de la saison qui se termine et ce qui reste à régler." },
    season: { title: "Nouvelle saison", text: "Nom, dates et équipes recopiées (le passage de saison habituel)." },
    players: { title: "Joueurs", text: "Les joueurs reconduits dans chaque équipe ; décochez les départs." },
    dues: { title: "Cotisations", text: "Les barèmes recopiés, leurs montants et la date d'émission automatique." },
    affiliations: { title: "Affiliations", text: "Les affiliations de la nouvelle période, avec une tâche chacune." },
    reminders: { title: "Rappels annuels", text: "Subsides à redemander, sponsors à renouveler, assurance : une tâche chacun." },
    check: { title: "Vérification des données", text: "La date à laquelle joueurs et parents relisent leurs informations." },
    communication: { title: "Email « Nouvelle saison »", text: "Le message aux joueurs, aux parents et aux coachs, envoyé à la date choisie." },
    summary: { title: "Récapitulatif et lancement", text: "Tout ce qui sera créé ou envoyé, avec les dates." },
  },
  states: { todo: "À faire", done: "Fait", skipped: "Ignoré" },
  markDone: "Marquer comme fait",
  skip: "Ignorer cette étape",
  reopen: "Reprendre cette étape",
  save: "Enregistrer",
  saved: "Étape enregistrée.",
  review: {
    players: "Joueurs",
    teams: "Équipes",
    events: "Activités",
    duesOpen: "Cotisations encore dues",
    expiredDocuments: "Documents expirés",
    chairsToService: "Fauteuils à réviser",
  },
  reportLink: "Ouvrir le rapport d'activité",
  name: "Nom de la saison",
  startsOn: "Début",
  endsOn: "Fin",
  copyTeam: "Recopier l'équipe {team}",
  leaving: "départ prévu",
  former: "{n} ancien(s) joueur(s) dans l'annuaire.",
  formerLink: "Voir les anciens joueurs",
  copyPlans: "Recopier les barèmes de cotisation",
  amountOf: "Montant {category} (€)",
  issueOn: "Émettre les cotisations le",
  issueHint: "Laissez vide pour les émettre vous-même plus tard.",
  noPlan: "Aucun barème cette saison.",
  feeLine: "{name} ({period}) : {amount}, à payer le {date}",
  noFee: "Aucune affiliation à prévoir.",
  reminderKinds: { grant: "Subside", partner: "Sponsor", insurance: "Assurance" },
  noReminder: "Aucun rappel annuel trouvé.",
  dueOn: "échéance le {date}",
  launchOn: "Lancer la vérification le",
  launchHint: "Laissez vide pour qu'elle s'ouvre d'elle-même au début de la saison.",
  subject: "Objet",
  text: "Message",
  sendOn: "Envoyer le",
  sendHint: "Le brouillon apparaît dans Communication ; vous pouvez l'annuler jusqu'à la date.",
  summaryIntro: "« Lancer » crée tout de suite la saison, ses équipes et les tâches ; le reste part à sa date. Relancer ne crée rien deux fois.",
  summaryItems: {
    season: "Saison {name} et {n} équipe(s)",
    players: "{n} joueur(s) reconduit(s)",
    plans: "{n} barème(s) recopié(s)",
    issue: "Émission des cotisations",
    check: "Vérification des données",
  },
  summaryOn: "le {date}",
  nothing: "Rien à créer : toutes les étapes sont ignorées.",
  launch: "Lancer",
  launched: "C'est lancé : {tasks} tâche(s) créée(s), {actions} envoi(s) programmé(s).",
  launchedOn: "Lancé le {date}.",
  relaunchHint: "Vous pouvez relancer après une modification : seul ce qui manque est créé.",
  scheduled: "Programmé",
  actionKinds: { dues_issue: "Émission des cotisations", season_check: "Vérification des données", newsletter: "Email « Nouvelle saison »" },
  actionStates: { scheduled: "Programmé", done: "Fait", cancelled: "Annulé", failed: "Échec" },
  cancel: "Annuler",
  cancelled: "Envoi annulé.",
  cardTitle: "La saison se termine dans {n} jour(s)",
  cardText: "Préparez la suivante en une fois : nouvelle saison, joueurs, cotisations, affiliations, rappels et email de rentrée.",
  cardLink: "Préparer la saison suivante",
  settingsTitle: "Préparer la saison suivante",
  settingsText: "L'assistant annuel : bilan, nouvelle saison, joueurs, cotisations, affiliations, rappels, vérification et email de rentrée.",
  errors: {
    STALE_VERSION: "L'assistant a changé entre-temps. La page est à jour, réessayez.",
    INVALID_DATE: "Vérifiez les dates : la nouvelle saison commence après l'actuelle et se termine après son début.",
    DUPLICATE: "Une saison porte déjà ce nom.",
    FORBIDDEN: "Cet assistant est réservé à la présidence du club.",
  },
};
const nl: Copy = {
  title: "Het volgende seizoen voorbereiden",
  intro: "Alles wat eens per jaar moet gebeuren, in de juiste volgorde. Elke stap kan worden afgewerkt, overgeslagen of later hervat; er wordt niets aangemaakt vóór « Starten ».",
  loading: "De assistent wordt geladen…",
  error: "De assistent kon niet worden geladen. Probeer het zo meteen opnieuw.",
  noSeason: "Geen lopend seizoen: maak eerst een seizoen aan in Instellingen › Seizoenen en teams.",
  forbidden: "Deze assistent is voorbehouden aan het voorzitterschap van de club.",
  ending: "Seizoen dat eindigt: {name} (einde op {date})",
  daysLeft: "nog {n} dag(en) tot het einde",
  progress: "{done} van {total} stappen afgewerkt of overgeslagen",
  steps: {
    review: { title: "Balans van het seizoen", text: "De kerncijfers van het seizoen dat eindigt en wat nog te regelen is." },
    season: { title: "Nieuw seizoen", text: "Naam, data en overgenomen teams (de gewone seizoensovergang)." },
    players: { title: "Spelers", text: "De spelers die in elk team blijven; vink wie vertrekt uit." },
    dues: { title: "Bijdragen", text: "De overgenomen tarieven, hun bedragen en de datum van automatische uitgifte." },
    affiliations: { title: "Aansluitingen", text: "De aansluitingen van de nieuwe periode, elk met een taak." },
    reminders: { title: "Jaarlijkse herinneringen", text: "Subsidies opnieuw aanvragen, sponsors vernieuwen, verzekering: telkens een taak." },
    check: { title: "Controle van de gegevens", text: "De datum waarop spelers en ouders hun gegevens nalezen." },
    communication: { title: "E-mail « Nieuw seizoen »", text: "Het bericht aan spelers, ouders en coaches, verstuurd op de gekozen datum." },
    summary: { title: "Overzicht en start", text: "Alles wat wordt aangemaakt of verstuurd, met de data." },
  },
  states: { todo: "Te doen", done: "Klaar", skipped: "Overgeslagen" },
  markDone: "Als klaar markeren",
  skip: "Deze stap overslaan",
  reopen: "Deze stap hervatten",
  save: "Opslaan",
  saved: "Stap opgeslagen.",
  review: {
    players: "Spelers",
    teams: "Teams",
    events: "Activiteiten",
    duesOpen: "Nog verschuldigde bijdragen",
    expiredDocuments: "Vervallen documenten",
    chairsToService: "Rolstoelen voor onderhoud",
  },
  reportLink: "Het activiteitenverslag openen",
  name: "Naam van het seizoen",
  startsOn: "Begin",
  endsOn: "Einde",
  copyTeam: "Team {team} overnemen",
  leaving: "vertrek gepland",
  former: "{n} oud-speler(s) in de ledenlijst.",
  formerLink: "Oud-spelers bekijken",
  copyPlans: "De tarieven van de bijdragen overnemen",
  amountOf: "Bedrag {category} (€)",
  issueOn: "De bijdragen uitgeven op",
  issueHint: "Laat leeg om ze later zelf uit te geven.",
  noPlan: "Geen tarief dit seizoen.",
  feeLine: "{name} ({period}): {amount}, te betalen op {date}",
  noFee: "Geen aansluiting te voorzien.",
  reminderKinds: { grant: "Subsidie", partner: "Sponsor", insurance: "Verzekering" },
  noReminder: "Geen jaarlijkse herinnering gevonden.",
  dueOn: "vervalt op {date}",
  launchOn: "De controle starten op",
  launchHint: "Laat leeg om ze vanzelf te openen bij het begin van het seizoen.",
  subject: "Onderwerp",
  text: "Bericht",
  sendOn: "Versturen op",
  sendHint: "Het ontwerp verschijnt in Communicatie; u kunt het tot de datum annuleren.",
  summaryIntro: "« Starten » maakt meteen het seizoen, de teams en de taken aan; de rest vertrekt op zijn datum. Opnieuw starten maakt niets dubbel.",
  summaryItems: {
    season: "Seizoen {name} en {n} team(s)",
    players: "{n} speler(s) overgenomen",
    plans: "{n} tarief/tarieven overgenomen",
    issue: "Uitgifte van de bijdragen",
    check: "Controle van de gegevens",
  },
  summaryOn: "op {date}",
  nothing: "Niets aan te maken: alle stappen zijn overgeslagen.",
  launch: "Starten",
  launched: "Gestart: {tasks} taak/taken aangemaakt, {actions} verzending(en) gepland.",
  launchedOn: "Gestart op {date}.",
  relaunchHint: "U kunt na een wijziging opnieuw starten: alleen wat ontbreekt wordt aangemaakt.",
  scheduled: "Gepland",
  actionKinds: { dues_issue: "Uitgifte van de bijdragen", season_check: "Controle van de gegevens", newsletter: "E-mail « Nieuw seizoen »" },
  actionStates: { scheduled: "Gepland", done: "Klaar", cancelled: "Geannuleerd", failed: "Mislukt" },
  cancel: "Annuleren",
  cancelled: "Verzending geannuleerd.",
  cardTitle: "Het seizoen eindigt over {n} dag(en)",
  cardText: "Bereid het volgende in één keer voor: nieuw seizoen, spelers, bijdragen, aansluitingen, herinneringen en startmail.",
  cardLink: "Het volgende seizoen voorbereiden",
  settingsTitle: "Het volgende seizoen voorbereiden",
  settingsText: "De jaarlijkse assistent: balans, nieuw seizoen, spelers, bijdragen, aansluitingen, herinneringen, controle en startmail.",
  errors: {
    STALE_VERSION: "De assistent is intussen gewijzigd. De pagina is bijgewerkt, probeer opnieuw.",
    INVALID_DATE: "Controleer de data: het nieuwe seizoen begint na het huidige en eindigt na zijn begin.",
    DUPLICATE: "Er bestaat al een seizoen met die naam.",
    FORBIDDEN: "Deze assistent is voorbehouden aan het voorzitterschap van de club.",
  },
};
const en: Copy = {
  title: "Prepare the next season",
  intro: "Everything to do once a year, in order. Each step can be done, skipped or resumed later; nothing is created before “Launch”.",
  loading: "Loading the assistant…",
  error: "The assistant could not be loaded. Try again in a moment.",
  noSeason: "No current season: create a season first in Settings › Seasons and teams.",
  forbidden: "This assistant is for the club's presidency.",
  ending: "Season ending: {name} (ends on {date})",
  daysLeft: "{n} day(s) before the end",
  progress: "{done} of {total} steps done or skipped",
  steps: {
    review: { title: "Season review", text: "The key figures of the ending season and what is left to settle." },
    season: { title: "New season", text: "Name, dates and copied teams (the usual season rollover)." },
    players: { title: "Players", text: "The players kept in each team; untick those leaving." },
    dues: { title: "Dues", text: "The copied rates, their amounts and the date of the automatic issue." },
    affiliations: { title: "Affiliations", text: "The affiliations of the new period, with a task each." },
    reminders: { title: "Yearly reminders", text: "Grants to request again, sponsors to renew, insurance: a task each." },
    check: { title: "Data check", text: "The date when players and parents read their details again." },
    communication: { title: "“New season” email", text: "The message to players, parents and coaches, sent on the chosen date." },
    summary: { title: "Summary and launch", text: "Everything that will be created or sent, with the dates." },
  },
  states: { todo: "To do", done: "Done", skipped: "Skipped" },
  markDone: "Mark as done",
  skip: "Skip this step",
  reopen: "Resume this step",
  save: "Save",
  saved: "Step saved.",
  review: {
    players: "Players",
    teams: "Teams",
    events: "Activities",
    duesOpen: "Dues still owed",
    expiredDocuments: "Expired documents",
    chairsToService: "Chairs to service",
  },
  reportLink: "Open the activity report",
  name: "Season name",
  startsOn: "Start",
  endsOn: "End",
  copyTeam: "Copy the team {team}",
  leaving: "leaving",
  former: "{n} former player(s) in the directory.",
  formerLink: "See the former players",
  copyPlans: "Copy the dues rates",
  amountOf: "Amount {category} (€)",
  issueOn: "Issue the dues on",
  issueHint: "Leave empty to issue them yourself later.",
  noPlan: "No rate this season.",
  feeLine: "{name} ({period}): {amount}, due on {date}",
  noFee: "No affiliation to plan.",
  reminderKinds: { grant: "Grant", partner: "Sponsor", insurance: "Insurance" },
  noReminder: "No yearly reminder found.",
  dueOn: "due on {date}",
  launchOn: "Launch the check on",
  launchHint: "Leave empty to let it open by itself when the season starts.",
  subject: "Subject",
  text: "Message",
  sendOn: "Send on",
  sendHint: "The draft appears in Communication; you can cancel it until the date.",
  summaryIntro: "“Launch” creates the season, its teams and the tasks at once; the rest leaves on its date. Launching again creates nothing twice.",
  summaryItems: {
    season: "Season {name} and {n} team(s)",
    players: "{n} player(s) kept",
    plans: "{n} rate(s) copied",
    issue: "Issue of the dues",
    check: "Data check",
  },
  summaryOn: "on {date}",
  nothing: "Nothing to create: every step is skipped.",
  launch: "Launch",
  launched: "Launched: {tasks} task(s) created, {actions} sending(s) scheduled.",
  launchedOn: "Launched on {date}.",
  relaunchHint: "You can launch again after a change: only what is missing is created.",
  scheduled: "Scheduled",
  actionKinds: { dues_issue: "Issue of the dues", season_check: "Data check", newsletter: "“New season” email" },
  actionStates: { scheduled: "Scheduled", done: "Done", cancelled: "Cancelled", failed: "Failed" },
  cancel: "Cancel",
  cancelled: "Sending cancelled.",
  cardTitle: "The season ends in {n} day(s)",
  cardText: "Prepare the next one at once: new season, players, dues, affiliations, reminders and welcome email.",
  cardLink: "Prepare the next season",
  settingsTitle: "Prepare the next season",
  settingsText: "The yearly assistant: review, new season, players, dues, affiliations, reminders, check and welcome email.",
  errors: {
    STALE_VERSION: "The assistant changed in the meantime. The page is up to date, try again.",
    INVALID_DATE: "Check the dates: the new season starts after the current one and ends after it starts.",
    DUPLICATE: "A season already has this name.",
    FORBIDDEN: "This assistant is for the club's presidency.",
  },
};
export const seasonPlanCopy: Record<Locale, Copy> = { fr, nl, en };
