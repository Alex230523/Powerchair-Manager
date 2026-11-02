import type { Locale } from "@/lib/locale";

/** A5: the match sheet in three steps. */
export type JourneyCopy = {
  back: string;
  steps: { before: string; day: string; after: string };
  stepsLabel: string;
  loading: string;
  callUp: string;
  callUpIntro: string;
  convene: string;
  convened: string;
  answers: Record<"present" | "absent" | "uncertain" | "none", string>;
  noCallUp: string;
  lineup: string;
  lineupIntro: string;
  starter: string;
  number: string;
  saveLineup: string;
  lineupSaved: string;
  blocking: string;
  warning: string;
  problems: Record<"licence" | "chairBroken" | "documents" | "chairService" | "noChair" | "speedCheck", string>;
  notPresent: string;
  publish: string;
  unpublish: string;
  published: string;
  notPublished: string;
  trip: string;
  noTrip: string;
  planTrip: string;
  checklist: string;
  checklistIntro: string;
  items: Record<"chairs" | "batteries" | "balls" | "shirts" | "firstAid" | "transport", string>;
  responsible: string;
  nobody: string;
  sendChecklist: string;
  checklistSent: string;
  tasks: string;
  dayIntro: string;
  speedReminder: string;
  guideChair: string;
  guideGame: string;
  presences: string;
  minute: string;
  goal: string;
  goalOf: string;
  goalAgainst: string;
  yellowOf: string;
  redOf: string;
  subInOf: string;
  subOutOf: string;
  yellow: string;
  red: string;
  subIn: string;
  subOut: string;
  live: Record<"goal" | "goal_against" | "yellow" | "red" | "sub_in" | "sub_out", string>;
  undo: string;
  undoOf: string;
  offline: string;
  queued: string;
  synced: string;
  noLineup: string;
  afterIntro: string;
  ourScore: string;
  theirScore: string;
  validate: string;
  validated: string;
  validatedOn: string;
  sheet: string;
  announcement: string;
  announcementReady: string;
  referees: string;
  noReferee: string;
  result: string;
  yourCallUp: string;
  publishedLineup: string;
  lineupSoon: string;
  errors: Record<string, string>;
};

export const journeyCopy: Record<Locale, JourneyCopy> = {
  fr: {
    back: "Tous les matchs",
    steps: { before: "Avant", day: "Jour J", after: "Après" },
    stepsLabel: "Étapes du match",
    loading: "Chargement…",
    callUp: "Invitation",
    callUpIntro: "Les joueurs de l'équipe sont invités à la création du match, avec une réponse attendue la veille.",
    convene: "Inviter l'équipe",
    convened: "Équipe invitée.",
    answers: { present: "Présent", absent: "Absent", uncertain: "Incertain", none: "Sans réponse" },
    noCallUp: "Pas encore d'invitation pour ce match.",
    lineup: "Composition",
    lineupIntro: "Seuls les joueurs « présents » peuvent être alignés. Licence non valide ou fauteuil en panne : bloquant. Documents, révision ou fauteuil manquant : à vérifier.",
    starter: "Titulaire",
    number: "Numéro",
    saveLineup: "Enregistrer la composition",
    lineupSaved: "Composition enregistrée.",
    blocking: "Bloquant",
    warning: "À vérifier",
    problems: { licence: "pas de licence valide", chairBroken: "fauteuil en panne", documents: "documents à fournir", chairService: "révision dépassée", noChair: "pas de fauteuil attribué", speedCheck: "contrôle de vitesse à refaire" },
    notPresent: "n'a pas répondu « présent »",
    publish: "Publier la composition",
    unpublish: "Retirer la publication",
    published: "Composition publiée : joueurs et parents la voient.",
    notPublished: "Composition non publiée : seul le staff la voit.",
    trip: "Déplacement",
    noTrip: "Aucun déplacement relié à ce match.",
    planTrip: "Organiser le déplacement",
    checklist: "Checklist du jour",
    checklistIntro: "Envoyée dans la to-do, avec un responsable par ligne et le jour du match comme échéance.",
    items: { chairs: "Fauteuils chargés", batteries: "Batteries chargées", balls: "Ballons", shirts: "Maillots", firstAid: "Trousse de secours", transport: "Transport" },
    responsible: "Responsable",
    nobody: "Personne",
    sendChecklist: "Envoyer dans la to-do",
    checklistSent: "{n} tâche(s) ajoutée(s) à la to-do.",
    tasks: "Tâches du match",
    speedReminder: "Faites contrôler la vitesse de chaque fauteuil au moins 15 minutes avant le coup d'envoi.",
    guideChair: "Le fauteuil de match",
    guideGame: "Guide du jeu",
    dayIntro: "Un appui par fait de match. Sans réseau, chaque appui attend sur le téléphone et part dès que la connexion revient.",
    presences: "Présences constatées",
    minute: "Minute",
    goal: "But",
    goalOf: "But de {name}",
    goalAgainst: "But adverse",
    yellowOf: "Carton jaune pour {name}",
    redOf: "Carton rouge pour {name}",
    subInOf: "Entrée de {name}",
    subOutOf: "Sortie de {name}",
    yellow: "Jaune",
    red: "Rouge",
    subIn: "Entre",
    subOut: "Sort",
    live: { goal: "But", goal_against: "But adverse", yellow: "Carton jaune", red: "Carton rouge", sub_in: "Entrée", sub_out: "Sortie" },
    undo: "Annuler",
    undoOf: "Annuler : {what}",
    offline: "Hors connexion : {n} fait(s) en attente sur ce téléphone.",
    queued: "Enregistré sur le téléphone, envoyé dès le retour du réseau.",
    synced: "{n} fait(s) envoyé(s).",
    noLineup: "Composez l'équipe dans l'étape « Avant » pour noter les faits du match.",
    afterIntro: "Validez le résultat : les statistiques suivent les faits notés, l'annonce au club est préparée dans Communication.",
    ourScore: "Notre score",
    theirScore: "Score adverse",
    validate: "Valider le résultat",
    validated: "Résultat validé.",
    validatedOn: "Résultat validé le {date}.",
    sheet: "Feuille de match (PDF)",
    announcement: "Ouvrir le brouillon d'annonce",
    announcementReady: "Brouillon d'annonce prêt dans Communication.",
    referees: "Arbitres",
    noReferee: "Aucun arbitre désigné.",
    result: "Résultat",
    yourCallUp: "Votre invitation",
    publishedLineup: "Composition",
    lineupSoon: "La composition sera publiée par le coach.",
    errors: {
      NOT_PRESENT: "Ce joueur n'a pas répondu « présent » à l'invitation.",
      PLAYER_NOT_ELIGIBLE: "Un joueur a un problème bloquant (licence ou fauteuil).",
      NOT_IN_TEAM: "Ce joueur ne fait pas partie de l'équipe.",
      NOT_IN_LINEUP: "Ce joueur n'est pas dans la composition.",
      GOALS_EXCEED_SCORE: "Il y a plus de buts notés que le score.",
      STALE_VERSION: "Le match a changé entre-temps : rechargez la page.",
      INVALID_TRANSITION: "Le résultat est déjà validé.",
      DUPLICATE: "Ce match a déjà son invitation.",
    },
  },
  nl: {
    back: "Alle wedstrijden",
    steps: { before: "Voor", day: "Wedstrijddag", after: "Na" },
    stepsLabel: "Stappen van de wedstrijd",
    loading: "Laden…",
    callUp: "Uitnodiging",
    callUpIntro: "De spelers van het team worden uitgenodigd bij het aanmaken van de wedstrijd, met een antwoord tegen de dag ervoor.",
    convene: "Het team uitnodigen",
    convened: "Team uitgenodigd.",
    answers: { present: "Aanwezig", absent: "Afwezig", uncertain: "Onzeker", none: "Geen antwoord" },
    noCallUp: "Nog geen uitnodiging voor deze wedstrijd.",
    lineup: "Opstelling",
    lineupIntro: "Alleen spelers die « aanwezig » antwoordden, kunnen opgesteld worden. Geen geldige licentie of rolstoel defect: blokkerend. Documenten, nazicht of geen rolstoel: na te kijken.",
    starter: "Basis",
    number: "Nummer",
    saveLineup: "Opstelling opslaan",
    lineupSaved: "Opstelling opgeslagen.",
    blocking: "Blokkerend",
    warning: "Na te kijken",
    problems: { licence: "geen geldige licentie", chairBroken: "rolstoel defect", documents: "documenten te bezorgen", chairService: "nazicht verlopen", noChair: "geen rolstoel toegewezen", speedCheck: "snelheidscontrole opnieuw te doen" },
    notPresent: "antwoordde niet « aanwezig »",
    publish: "Opstelling publiceren",
    unpublish: "Publicatie intrekken",
    published: "Opstelling gepubliceerd: spelers en ouders zien ze.",
    notPublished: "Opstelling niet gepubliceerd: alleen de staf ziet ze.",
    trip: "Verplaatsing",
    noTrip: "Geen verplaatsing gekoppeld aan deze wedstrijd.",
    planTrip: "De verplaatsing regelen",
    checklist: "Checklist van de dag",
    checklistIntro: "Naar de to-do gestuurd, met een verantwoordelijke per lijn en de wedstrijddag als vervaldag.",
    items: { chairs: "Rolstoelen geladen", batteries: "Batterijen geladen", balls: "Ballen", shirts: "Truitjes", firstAid: "EHBO-koffer", transport: "Vervoer" },
    responsible: "Verantwoordelijke",
    nobody: "Niemand",
    sendChecklist: "Naar de to-do sturen",
    checklistSent: "{n} taak/taken aan de to-do toegevoegd.",
    tasks: "Taken van de wedstrijd",
    speedReminder: "Laat de snelheid van elke rolstoel minstens 15 minuten voor de aftrap controleren.",
    guideChair: "De wedstrijdrolstoel",
    guideGame: "Spelgids",
    dayIntro: "Eén tik per feit. Zonder netwerk wacht elke tik op de telefoon en vertrekt zodra de verbinding terug is.",
    presences: "Vastgestelde aanwezigheden",
    minute: "Minuut",
    goal: "Doelpunt",
    goalOf: "Doelpunt van {name}",
    goalAgainst: "Doelpunt tegenstander",
    yellowOf: "Gele kaart voor {name}",
    redOf: "Rode kaart voor {name}",
    subInOf: "{name} komt in",
    subOutOf: "{name} gaat uit",
    yellow: "Geel",
    red: "Rood",
    subIn: "In",
    subOut: "Uit",
    live: { goal: "Doelpunt", goal_against: "Doelpunt tegenstander", yellow: "Gele kaart", red: "Rode kaart", sub_in: "In", sub_out: "Uit" },
    undo: "Annuleren",
    undoOf: "Annuleren: {what}",
    offline: "Offline: {n} feit(en) wachten op deze telefoon.",
    queued: "Op de telefoon bewaard, verstuurd zodra het netwerk terug is.",
    synced: "{n} feit(en) verstuurd.",
    noLineup: "Stel het team op in de stap « Voor » om de feiten van de wedstrijd te noteren.",
    afterIntro: "Bevestig de uitslag: de statistieken volgen de genoteerde feiten, de aankondiging voor de club wordt in Communicatie klaargezet.",
    ourScore: "Onze score",
    theirScore: "Score tegenstander",
    validate: "Uitslag bevestigen",
    validated: "Uitslag bevestigd.",
    validatedOn: "Uitslag bevestigd op {date}.",
    sheet: "Wedstrijdblad (PDF)",
    announcement: "Het ontwerp van aankondiging openen",
    announcementReady: "Ontwerp van aankondiging klaar in Communicatie.",
    referees: "Scheidsrechters",
    noReferee: "Geen scheidsrechter aangeduid.",
    result: "Uitslag",
    yourCallUp: "Uw uitnodiging",
    publishedLineup: "Opstelling",
    lineupSoon: "De opstelling wordt door de coach gepubliceerd.",
    errors: {
      NOT_PRESENT: "Deze speler antwoordde niet « aanwezig » op de uitnodiging.",
      PLAYER_NOT_ELIGIBLE: "Een speler heeft een blokkerend probleem (licentie of rolstoel).",
      NOT_IN_TEAM: "Deze speler hoort niet bij het team.",
      NOT_IN_LINEUP: "Deze speler staat niet in de opstelling.",
      GOALS_EXCEED_SCORE: "Er zijn meer doelpunten genoteerd dan de score.",
      STALE_VERSION: "De wedstrijd is intussen gewijzigd: herlaad de pagina.",
      INVALID_TRANSITION: "De uitslag is al bevestigd.",
      DUPLICATE: "Deze wedstrijd heeft al zijn uitnodiging.",
    },
  },
  en: {
    back: "All matches",
    steps: { before: "Before", day: "Match day", after: "After" },
    stepsLabel: "Steps of the match",
    loading: "Loading…",
    callUp: "Invitation",
    callUpIntro: "The team's players are invited when the match is created, with an answer due the day before.",
    convene: "Invite the team",
    convened: "Team invited.",
    answers: { present: "Present", absent: "Absent", uncertain: "Unsure", none: "No answer" },
    noCallUp: "No invitation for this match yet.",
    lineup: "Line-up",
    lineupIntro: "Only players who answered « present » can be lined up. No valid licence or a broken chair: blocking. Documents, service or no chair: to check.",
    starter: "Starter",
    number: "Number",
    saveLineup: "Save the line-up",
    lineupSaved: "Line-up saved.",
    blocking: "Blocking",
    warning: "To check",
    problems: { licence: "no valid licence", chairBroken: "chair broken", documents: "documents to provide", chairService: "service overdue", noChair: "no chair assigned", speedCheck: "speed check to redo" },
    notPresent: "did not answer « present »",
    publish: "Publish the line-up",
    unpublish: "Withdraw the publication",
    published: "Line-up published: players and parents see it.",
    notPublished: "Line-up not published: only the staff sees it.",
    trip: "Trip",
    noTrip: "No trip linked to this match.",
    planTrip: "Organise the trip",
    checklist: "The day's checklist",
    checklistIntro: "Sent to the to-do, one person in charge per line, due on the match day.",
    items: { chairs: "Chairs loaded", batteries: "Batteries charged", balls: "Balls", shirts: "Shirts", firstAid: "First aid kit", transport: "Transport" },
    responsible: "In charge",
    nobody: "Nobody",
    sendChecklist: "Send to the to-do",
    checklistSent: "{n} task(s) added to the to-do.",
    tasks: "The match's tasks",
    speedReminder: "Have every chair's speed checked at least 15 minutes before kick-off.",
    guideChair: "The match chair",
    guideGame: "Game guide",
    dayIntro: "One tap per fact. Without network, each tap waits on the phone and leaves as soon as the connection is back.",
    presences: "Attendance taken",
    minute: "Minute",
    goal: "Goal",
    goalOf: "Goal by {name}",
    goalAgainst: "Goal against",
    yellowOf: "Yellow card for {name}",
    redOf: "Red card for {name}",
    subInOf: "{name} comes on",
    subOutOf: "{name} goes off",
    yellow: "Yellow",
    red: "Red",
    subIn: "On",
    subOut: "Off",
    live: { goal: "Goal", goal_against: "Goal against", yellow: "Yellow card", red: "Red card", sub_in: "On", sub_out: "Off" },
    undo: "Undo",
    undoOf: "Undo: {what}",
    offline: "Offline: {n} fact(s) waiting on this phone.",
    queued: "Kept on the phone, sent as soon as the network is back.",
    synced: "{n} fact(s) sent.",
    noLineup: "Line up the team in the « Before » step to note the match's facts.",
    afterIntro: "Confirm the result: the statistics follow the facts noted, the announcement to the club is drafted in Communication.",
    ourScore: "Our score",
    theirScore: "Their score",
    validate: "Confirm the result",
    validated: "Result confirmed.",
    validatedOn: "Result confirmed on {date}.",
    sheet: "Match sheet (PDF)",
    announcement: "Open the draft announcement",
    announcementReady: "Draft announcement ready in Communication.",
    referees: "Referees",
    noReferee: "No referee designated.",
    result: "Result",
    yourCallUp: "Your invitation",
    publishedLineup: "Line-up",
    lineupSoon: "The coach will publish the line-up.",
    errors: {
      NOT_PRESENT: "This player did not answer « present » to the invitation.",
      PLAYER_NOT_ELIGIBLE: "A player has a blocking problem (licence or chair).",
      NOT_IN_TEAM: "This player is not in the team.",
      NOT_IN_LINEUP: "This player is not in the line-up.",
      GOALS_EXCEED_SCORE: "More goals are noted than the score.",
      STALE_VERSION: "The match changed meanwhile: reload the page.",
      INVALID_TRANSITION: "The result is already confirmed.",
      DUPLICATE: "This match already has its invitation.",
    },
  },
};
