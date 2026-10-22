/** Wave 17 (J4): classification badges, classification days and the federation's view of the team players. */
type Copy = {
  classes: Record<"PF1" | "PF2" | "pending" | "not_classified", string>;
  title: string;
  intro: Record<"federation" | "classifier" | "club" | "none", string>;
  loading: string;
  none: string;
  newDay: string;
  day: string;
  deadline: string;
  sharedVenue: string;
  noSharedVenue: string;
  venue: string;
  venueHelp: string;
  notes: string;
  clubs: string;
  classifiers: string;
  noClassifier: string;
  create: string;
  created: string;
  status: Record<"open" | "published" | "cancelled", string>;
  dayOf: string;
  until: string;
  registrationClosed: string;
  registered: string;
  progress: string;
  ready: string;
  cols: Record<"player" | "club" | "born" | "current" | "presence" | "decision" | "comment" | "result", string>;
  presence: Record<"unmarked" | "present" | "absent", string>;
  decisions: Record<"PF1" | "PF2" | "review", string>;
  noDecision: string;
  save: string;
  saveFor: string;
  saved: string;
  publish: string;
  publishHint: string;
  published: string;
  cancelDay: string;
  cancelled: string;
  confirmCancel: string;
  back: string;
  choose: string;
  register: string;
  registeredDone: string;
  unregister: string;
  awaiting: string;
  absent: string;
  nobodyRegistered: string;
  allRegistered: string;
  texts: string;
  textsIntro: string;
  textLabel: string;
  saveTexts: string;
  languages: Record<"fr" | "nl" | "en", string>;
  errors: Record<string, string>;
  unavailable: string;
  teams: {
    club: string;
    allClubs: string;
    players: string;
    show: string;
    hide: string;
    name: string;
    classification: string;
    licence: string;
    age: string;
    noPlayer: string;
    sporting: string;
    licenceStatus: Record<"requested" | "active" | "suspended" | "none", string>;
  };
};

export const classificationCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    classes: { PF1: "PF1", PF2: "PF2", pending: "En attente", not_classified: "Non définie" },
    title: "Journées de classification",
    intro: {
      federation: "Créez une journée, invitez les clubs, puis pointez les présents et décidez PF1, PF2 ou À revoir. Rien ne change pour les joueurs avant la publication.",
      classifier: "Les journées où vous êtes classificateur : pointez les présents et décidez. La fédération publie les résultats.",
      club: "Les journées organisées par votre fédération : inscrivez vos joueurs avant la date limite. Les résultats apparaissent une fois publiés.",
      none: "Votre club n'est rattaché à aucune fédération.",
    },
    loading: "Chargement…",
    none: "Aucune journée de classification pour le moment.",
    newDay: "Nouvelle journée de classification",
    day: "Date de la journée",
    deadline: "Inscriptions jusqu'au",
    sharedVenue: "Lieu partagé",
    noSharedVenue: "Aucun : préciser le lieu ci-dessous",
    venue: "Lieu (adresse ou précision)",
    venueHelp: "Obligatoire si aucun lieu partagé n'est choisi.",
    notes: "Informations pour les clubs (facultatif)",
    clubs: "Clubs invités",
    classifiers: "Classificateurs",
    noClassifier: "Aucun arbitre ni membre de la fédération à désigner.",
    create: "Créer la journée",
    created: "Journée créée, les présidents des clubs invités sont prévenus.",
    status: { open: "Ouverte", published: "Publiée", cancelled: "Annulée" },
    dayOf: "Journée du {day}",
    until: "Inscriptions jusqu'au {day}",
    registrationClosed: "Inscriptions clôturées",
    registered: "{n} joueur(s) inscrit(s)",
    progress: "{unmarked} à pointer · {undecided} présent(s) sans décision",
    ready: "Tout est pointé et décidé : la journée peut être publiée.",
    cols: { player: "Joueur", club: "Club", born: "Né en", current: "Classification actuelle", presence: "Présence", decision: "Décision", comment: "Commentaire", result: "Résultat" },
    presence: { unmarked: "Non pointé", present: "Présent", absent: "Absent" },
    decisions: { PF1: "PF1", PF2: "PF2", review: "À revoir" },
    noDecision: "À décider",
    save: "Enregistrer",
    saveFor: "Enregistrer : {name}",
    saved: "Enregistré.",
    publish: "Publier les résultats",
    publishHint: "La publication met à jour le profil sportif de chaque joueur décidé et prévient le président du club, les coachs de l'équipe et le joueur ou ses parents.",
    published: "Résultats publiés.",
    cancelDay: "Annuler la journée",
    cancelled: "Journée annulée, les clubs sont prévenus.",
    confirmCancel: "Annuler la journée du {day} ? Les clubs invités seront prévenus.",
    back: "Garder la journée",
    choose: "Joueurs à inscrire",
    register: "Inscrire ({n})",
    registeredDone: "Joueur(s) inscrit(s).",
    unregister: "Désinscrire",
    awaiting: "Résultat après publication",
    absent: "Absent",
    nobodyRegistered: "Aucun joueur inscrit.",
    allRegistered: "Tous vos joueurs sont inscrits.",
    texts: "Textes PF1 et PF2",
    textsIntro: "Affichés au survol ou au focus de chaque badge de classification, dans la langue du lecteur.",
    textLabel: "{class} en {language}",
    saveTexts: "Enregistrer les textes",
    languages: { fr: "français", nl: "néerlandais", en: "anglais" },
    errors: {
      CLASSIFICATION_DATES: "La date limite va d'aujourd'hui au jour de la journée.",
      CLASSIFICATION_CLOSED: "Les inscriptions ou la journée sont clôturées.",
      CLASSIFICATION_INCOMPLETE: "Pointez chaque inscrit et décidez pour chaque présent avant de publier.",
      INVALID_INPUT: "Vérifiez les champs : un lieu est obligatoire.",
      NO_FEDERATION: "Votre club n'est rattaché à aucune fédération.",
    },
    unavailable: "Action impossible pour le moment.",
    teams: {
      club: "Club",
      allClubs: "Tous les clubs",
      players: "Joueurs",
      show: "Voir les joueurs : {team}",
      hide: "Masquer les joueurs : {team}",
      name: "Nom",
      classification: "Classification",
      licence: "Licence",
      age: "Catégorie d'âge",
      noPlayer: "Aucun joueur dans cette équipe.",
      sporting: "Informations sportives uniquement : ni coordonnées, ni santé, ni cotisations.",
      licenceStatus: { requested: "Demandée", active: "Active", suspended: "Suspendue", none: "Aucune" },
    },
  },
  nl: {
    classes: { PF1: "PF1", PF2: "PF2", pending: "In afwachting", not_classified: "Niet bepaald" },
    title: "Classificatiedagen",
    intro: {
      federation: "Maak een dag aan, nodig de clubs uit, registreer daarna de aanwezigen en beslis PF1, PF2 of Te herzien. Voor de spelers verandert niets vóór de publicatie.",
      classifier: "De dagen waarop u classificeerder bent: registreer de aanwezigen en beslis. De federatie publiceert de resultaten.",
      club: "De dagen van uw federatie: schrijf uw spelers in vóór de uiterste datum. De resultaten verschijnen na publicatie.",
      none: "Uw club is bij geen enkele federatie aangesloten.",
    },
    loading: "Laden…",
    none: "Nog geen classificatiedag.",
    newDay: "Nieuwe classificatiedag",
    day: "Datum van de dag",
    deadline: "Inschrijven tot",
    sharedVenue: "Gedeelde locatie",
    noSharedVenue: "Geen: vermeld de locatie hieronder",
    venue: "Locatie (adres of verduidelijking)",
    venueHelp: "Verplicht als geen gedeelde locatie gekozen is.",
    notes: "Informatie voor de clubs (optioneel)",
    clubs: "Uitgenodigde clubs",
    classifiers: "Classificeerders",
    noClassifier: "Geen scheidsrechter of federatielid om aan te duiden.",
    create: "Dag aanmaken",
    created: "Dag aangemaakt, de voorzitters van de uitgenodigde clubs zijn verwittigd.",
    status: { open: "Open", published: "Gepubliceerd", cancelled: "Geannuleerd" },
    dayOf: "Dag van {day}",
    until: "Inschrijven tot {day}",
    registrationClosed: "Inschrijvingen afgesloten",
    registered: "{n} speler(s) ingeschreven",
    progress: "{unmarked} te registreren · {undecided} aanwezige(n) zonder beslissing",
    ready: "Alles is geregistreerd en beslist: de dag kan gepubliceerd worden.",
    cols: { player: "Speler", club: "Club", born: "Geboren in", current: "Huidige classificatie", presence: "Aanwezigheid", decision: "Beslissing", comment: "Opmerking", result: "Resultaat" },
    presence: { unmarked: "Niet geregistreerd", present: "Aanwezig", absent: "Afwezig" },
    decisions: { PF1: "PF1", PF2: "PF2", review: "Te herzien" },
    noDecision: "Te beslissen",
    save: "Opslaan",
    saveFor: "Opslaan: {name}",
    saved: "Opgeslagen.",
    publish: "Resultaten publiceren",
    publishHint: "De publicatie werkt het sportprofiel van elke beoordeelde speler bij en verwittigt de clubvoorzitter, de coaches van het team en de speler of zijn ouders.",
    published: "Resultaten gepubliceerd.",
    cancelDay: "Dag annuleren",
    cancelled: "Dag geannuleerd, de clubs zijn verwittigd.",
    confirmCancel: "De dag van {day} annuleren? De uitgenodigde clubs worden verwittigd.",
    back: "Dag behouden",
    choose: "In te schrijven spelers",
    register: "Inschrijven ({n})",
    registeredDone: "Speler(s) ingeschreven.",
    unregister: "Uitschrijven",
    awaiting: "Resultaat na publicatie",
    absent: "Afwezig",
    nobodyRegistered: "Geen speler ingeschreven.",
    allRegistered: "Al uw spelers zijn ingeschreven.",
    texts: "Teksten PF1 en PF2",
    textsIntro: "Getoond bij hover of focus op elke classificatiebadge, in de taal van de lezer.",
    textLabel: "{class} in het {language}",
    saveTexts: "Teksten opslaan",
    languages: { fr: "Frans", nl: "Nederlands", en: "Engels" },
    errors: {
      CLASSIFICATION_DATES: "De uiterste datum ligt tussen vandaag en de dag zelf.",
      CLASSIFICATION_CLOSED: "De inschrijvingen of de dag zijn afgesloten.",
      CLASSIFICATION_INCOMPLETE: "Registreer elke ingeschrevene en beslis voor elke aanwezige vóór de publicatie.",
      INVALID_INPUT: "Controleer de velden: een locatie is verplicht.",
      NO_FEDERATION: "Uw club is bij geen enkele federatie aangesloten.",
    },
    unavailable: "Actie momenteel niet mogelijk.",
    teams: {
      club: "Club",
      allClubs: "Alle clubs",
      players: "Spelers",
      show: "Spelers tonen: {team}",
      hide: "Spelers verbergen: {team}",
      name: "Naam",
      classification: "Classificatie",
      licence: "Licentie",
      age: "Leeftijdscategorie",
      noPlayer: "Geen speler in dit team.",
      sporting: "Enkel sportieve informatie: geen contactgegevens, gezondheid of bijdragen.",
      licenceStatus: { requested: "Aangevraagd", active: "Actief", suspended: "Geschorst", none: "Geen" },
    },
  },
  en: {
    classes: { PF1: "PF1", PF2: "PF2", pending: "Pending", not_classified: "Not defined" },
    title: "Classification days",
    intro: {
      federation: "Create a day, invite the clubs, then mark who came and decide PF1, PF2 or To review. Nothing changes for the players before publication.",
      classifier: "The days where you are a classifier: mark who came and decide. The federation publishes the results.",
      club: "The days organised by your federation: register your players before the deadline. Results appear once published.",
      none: "Your club is not affiliated to a federation.",
    },
    loading: "Loading…",
    none: "No classification day yet.",
    newDay: "New classification day",
    day: "Date of the day",
    deadline: "Registration until",
    sharedVenue: "Shared venue",
    noSharedVenue: "None: give the place below",
    venue: "Place (address or detail)",
    venueHelp: "Required when no shared venue is chosen.",
    notes: "Information for the clubs (optional)",
    clubs: "Invited clubs",
    classifiers: "Classifiers",
    noClassifier: "No referee or federation member to name.",
    create: "Create the day",
    created: "Day created, the presidents of the invited clubs are told.",
    status: { open: "Open", published: "Published", cancelled: "Cancelled" },
    dayOf: "Day of {day}",
    until: "Registration until {day}",
    registrationClosed: "Registration closed",
    registered: "{n} player(s) registered",
    progress: "{unmarked} to mark · {undecided} present without decision",
    ready: "Everything is marked and decided: the day can be published.",
    cols: { player: "Player", club: "Club", born: "Born in", current: "Current classification", presence: "Attendance", decision: "Decision", comment: "Comment", result: "Result" },
    presence: { unmarked: "Not marked", present: "Present", absent: "Absent" },
    decisions: { PF1: "PF1", PF2: "PF2", review: "To review" },
    noDecision: "To decide",
    save: "Save",
    saveFor: "Save: {name}",
    saved: "Saved.",
    publish: "Publish the results",
    publishHint: "Publishing updates the sport profile of each decided player and tells the club president, the team's coaches and the player or the parents.",
    published: "Results published.",
    cancelDay: "Cancel the day",
    cancelled: "Day cancelled, the clubs are told.",
    confirmCancel: "Cancel the day of {day}? The invited clubs will be told.",
    back: "Keep the day",
    choose: "Players to register",
    register: "Register ({n})",
    registeredDone: "Player(s) registered.",
    unregister: "Unregister",
    awaiting: "Result after publication",
    absent: "Absent",
    nobodyRegistered: "No player registered.",
    allRegistered: "All your players are registered.",
    texts: "PF1 and PF2 texts",
    textsIntro: "Shown on hover or focus of every classification badge, in the reader's language.",
    textLabel: "{class} in {language}",
    saveTexts: "Save the texts",
    languages: { fr: "French", nl: "Dutch", en: "English" },
    errors: {
      CLASSIFICATION_DATES: "The deadline runs from today up to the day itself.",
      CLASSIFICATION_CLOSED: "Registration or the day is closed.",
      CLASSIFICATION_INCOMPLETE: "Mark every registered player and decide for each one present before publishing.",
      INVALID_INPUT: "Check the fields: a place is required.",
      NO_FEDERATION: "Your club is not affiliated to a federation.",
    },
    unavailable: "Action not possible right now.",
    teams: {
      club: "Club",
      allClubs: "All clubs",
      players: "Players",
      show: "Show the players: {team}",
      hide: "Hide the players: {team}",
      name: "Name",
      classification: "Classification",
      licence: "Licence",
      age: "Age category",
      noPlayer: "No player in this team.",
      sporting: "Sporting information only: no contact details, health or dues.",
      licenceStatus: { requested: "Requested", active: "Active", suspended: "Suspended", none: "None" },
    },
  },
};
