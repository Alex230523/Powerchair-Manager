import type { Locale } from "@/lib/locale";

/** 27 to 29: « Ma famille », the child switcher, the authorizations and the two homes (fr, nl, en). */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  error: string;
  show: string;
  all: string;
  none: string;
  noneText: string;
  upcoming: string;
  noEvent: string;
  states: Record<"none" | "present" | "absent" | "uncertain", string>;
  notInvited: string;
  answeredBy: string;
  present: string;
  absent: string;
  bothPresent: string;
  allPresent: string;
  bothAbsent: string;
  allAbsent: string;
  forChild: string;
  saved: string;
  switched: string;
  authorizations: string;
  noAuthorization: string;
  status: Record<"requested" | "signed" | "refused", string>;
  signedOn: string;
  refusedOn: string;
  forTrip: string;
  forSeason: string;
  readSign: string;
  refuse: string;
  refuseConfirm: string;
  documentText: string;
  close: string;
  dues: string;
  noDues: string;
  share: string;
  paidByMe: string;
  seeDues: string;
  shareLine: string;
  feedTitle: string;
  feedText: string;
  feedCreate: string;
  feedName: string;
  feedReady: string;
  feedActive: string;
  copy: string;
  copied: string;
  contactsTitle: string;
  contactsText: string;
  email: string;
  phone: string;
  address: string;
  save: string;
  settingsLinks: string;
  languageLink: string;
  notificationsLink: string;
  club: string;
  errors: Record<string, string>;
};
export const familyCopy: Record<Locale, Copy> = {
  fr: {
    title: "Ma famille",
    intro: "Les activités, les réponses, les autorisations et les cotisations de vos enfants, dans tous leurs clubs.",
    loading: "Chargement de votre famille…",
    error: "Votre famille n'a pas pu être chargée. Réessayez dans un instant.",
    show: "Afficher",
    all: "Tous",
    none: "Aucun enfant rattaché",
    noneText: "Quand le club vous relie à votre enfant, il apparaît ici avec ses activités.",
    upcoming: "Prochaines activités",
    noEvent: "Aucune activité dans les 60 prochains jours.",
    states: { none: "Pas encore répondu", present: "Présent", absent: "Absent", uncertain: "Peut-être" },
    notInvited: "Participe (pas de réponse demandée)",
    answeredBy: "Réponse de {name}",
    present: "Présent",
    absent: "Absent",
    bothPresent: "Présents tous les deux",
    allPresent: "Tous présents",
    bothAbsent: "Absents tous les deux",
    allAbsent: "Tous absents",
    forChild: "pour {name}",
    saved: "Réponse enregistrée.",
    switched: "Vous êtes maintenant dans {club}.",
    authorizations: "Autorisations",
    noAuthorization: "Aucune autorisation demandée pour le moment.",
    status: { requested: "À signer", signed: "Signée", refused: "Refusée" },
    signedOn: "Signée le {date} par {name}",
    refusedOn: "Refusée le {date} par {name}",
    forTrip: "Pour {trip}",
    forSeason: "Pour la saison",
    readSign: "Lire et signer",
    refuse: "Je refuse",
    refuseConfirm: "Confirmer le refus",
    documentText: "Texte de l'autorisation",
    close: "Fermer",
    dues: "Cotisations",
    noDues: "Aucune cotisation à payer.",
    share: "Votre part : {percent} %, soit {amount}",
    paidByMe: "Payé par vous : {amount}",
    seeDues: "Voir les cotisations",
    shareLine: "Part de {name} : {percent} %, soit {amount}",
    feedTitle: "Agenda familial",
    feedText: "Un seul lien pour votre agenda de téléphone : les activités de tous vos enfants, dans tous leurs clubs, chacune avec le prénom de l'enfant.",
    feedCreate: "Créer le lien de l'agenda familial",
    feedName: "Agenda familial",
    feedReady: "Copiez ce lien dans votre agenda (Google, Apple, Outlook). Il n'est affiché qu'une fois.",
    feedActive: "Un lien d'agenda familial est actif jusqu'au {date}. Vous pouvez le révoquer depuis l'Agenda.",
    copy: "Copier le lien",
    copied: "Lien copié.",
    contactsTitle: "Mes coordonnées",
    contactsText: "Chaque parent a ses propres coordonnées, sa langue et ses notifications ; les deux reçoivent les invitations aux activités.",
    email: "E-mail",
    phone: "Téléphone",
    address: "Adresse postale",
    save: "Enregistrer",
    settingsLinks: "Langue et notifications :",
    languageLink: "Mon compte",
    notificationsLink: "Mes notifications",
    club: "Club",
    errors: {
      RESPONSE_CLOSED: "Les réponses sont closes pour cette activité.",
      STALE_VERSION: "La réponse a changé entre-temps. La page est à jour, réessayez.",
      FORBIDDEN: "Vous ne pouvez pas faire cela pour cet enfant.",
      INVALID_TRANSITION: "Cette autorisation a déjà reçu une réponse.",
    },
  },
  nl: {
    title: "Mijn gezin",
    intro: "De activiteiten, antwoorden, toestemmingen en bijdragen van uw kinderen, in al hun clubs.",
    loading: "Uw gezin wordt geladen…",
    error: "Uw gezin kon niet worden geladen. Probeer het zo meteen opnieuw.",
    show: "Tonen",
    all: "Allen",
    none: "Geen kind gekoppeld",
    noneText: "Zodra de club u aan uw kind koppelt, verschijnt het hier met zijn activiteiten.",
    upcoming: "Volgende activiteiten",
    noEvent: "Geen activiteit in de komende 60 dagen.",
    states: { none: "Nog niet geantwoord", present: "Aanwezig", absent: "Afwezig", uncertain: "Misschien" },
    notInvited: "Neemt deel (geen antwoord gevraagd)",
    answeredBy: "Antwoord van {name}",
    present: "Aanwezig",
    absent: "Afwezig",
    bothPresent: "Allebei aanwezig",
    allPresent: "Allen aanwezig",
    bothAbsent: "Allebei afwezig",
    allAbsent: "Allen afwezig",
    forChild: "voor {name}",
    saved: "Antwoord opgeslagen.",
    switched: "U bent nu in {club}.",
    authorizations: "Toestemmingen",
    noAuthorization: "Momenteel geen toestemming gevraagd.",
    status: { requested: "Te ondertekenen", signed: "Ondertekend", refused: "Geweigerd" },
    signedOn: "Ondertekend op {date} door {name}",
    refusedOn: "Geweigerd op {date} door {name}",
    forTrip: "Voor {trip}",
    forSeason: "Voor het seizoen",
    readSign: "Lezen en ondertekenen",
    refuse: "Ik weiger",
    refuseConfirm: "Weigering bevestigen",
    documentText: "Tekst van de toestemming",
    close: "Sluiten",
    dues: "Bijdragen",
    noDues: "Geen bijdrage te betalen.",
    share: "Uw deel: {percent} %, of {amount}",
    paidByMe: "Door u betaald: {amount}",
    seeDues: "Bijdragen bekijken",
    shareLine: "Deel van {name}: {percent} %, of {amount}",
    feedTitle: "Gezinsagenda",
    feedText: "Eén link voor de agenda op uw telefoon: de activiteiten van al uw kinderen, in al hun clubs, telkens met de voornaam van het kind.",
    feedCreate: "Link voor de gezinsagenda maken",
    feedName: "Gezinsagenda",
    feedReady: "Kopieer deze link in uw agenda (Google, Apple, Outlook). Hij wordt maar één keer getoond.",
    feedActive: "Een link voor de gezinsagenda is actief tot {date}. U kunt hem intrekken in de Agenda.",
    copy: "Link kopiëren",
    copied: "Link gekopieerd.",
    contactsTitle: "Mijn gegevens",
    contactsText: "Elke ouder heeft eigen gegevens, taal en meldingen; beiden ontvangen de uitnodigingen voor activiteiten.",
    email: "E-mail",
    phone: "Telefoon",
    address: "Postadres",
    save: "Opslaan",
    settingsLinks: "Taal en meldingen:",
    languageLink: "Mijn account",
    notificationsLink: "Mijn meldingen",
    club: "Club",
    errors: {
      RESPONSE_CLOSED: "De antwoorden voor deze activiteit zijn afgesloten.",
      STALE_VERSION: "Het antwoord is intussen gewijzigd. De pagina is bijgewerkt, probeer opnieuw.",
      FORBIDDEN: "U kunt dat niet doen voor dit kind.",
      INVALID_TRANSITION: "Deze toestemming heeft al een antwoord gekregen.",
    },
  },
  en: {
    title: "My family",
    intro: "Your children's activities, answers, authorizations and dues, in all their clubs.",
    loading: "Loading your family…",
    error: "Your family could not be loaded. Try again in a moment.",
    show: "Show",
    all: "All",
    none: "No child linked",
    noneText: "When the club links you to your child, they appear here with their activities.",
    upcoming: "Next activities",
    noEvent: "No activity in the next 60 days.",
    states: { none: "Not answered yet", present: "Present", absent: "Absent", uncertain: "Maybe" },
    notInvited: "Takes part (no answer asked)",
    answeredBy: "Answer from {name}",
    present: "Present",
    absent: "Absent",
    bothPresent: "Both present",
    allPresent: "All present",
    bothAbsent: "Both absent",
    allAbsent: "All absent",
    forChild: "for {name}",
    saved: "Answer saved.",
    switched: "You are now in {club}.",
    authorizations: "Authorizations",
    noAuthorization: "No authorization asked for now.",
    status: { requested: "To sign", signed: "Signed", refused: "Refused" },
    signedOn: "Signed on {date} by {name}",
    refusedOn: "Refused on {date} by {name}",
    forTrip: "For {trip}",
    forSeason: "For the season",
    readSign: "Read and sign",
    refuse: "I refuse",
    refuseConfirm: "Confirm the refusal",
    documentText: "Text of the authorization",
    close: "Close",
    dues: "Dues",
    noDues: "No dues to pay.",
    share: "Your share: {percent} %, that is {amount}",
    paidByMe: "Paid by you: {amount}",
    seeDues: "See the dues",
    shareLine: "Share of {name}: {percent} %, that is {amount}",
    feedTitle: "Family calendar",
    feedText: "One link for your phone's calendar: the activities of all your children, in all their clubs, each with the child's first name.",
    feedCreate: "Create the family calendar link",
    feedName: "Family calendar",
    feedReady: "Copy this link into your calendar (Google, Apple, Outlook). It is shown only once.",
    feedActive: "A family calendar link is active until {date}. You can revoke it from the Calendar.",
    copy: "Copy the link",
    copied: "Link copied.",
    contactsTitle: "My contact details",
    contactsText: "Each parent has their own contact details, language and notifications; both receive the activity invitations.",
    email: "E-mail",
    phone: "Phone",
    address: "Postal address",
    save: "Save",
    settingsLinks: "Language and notifications:",
    languageLink: "My account",
    notificationsLink: "My notifications",
    club: "Club",
    errors: {
      RESPONSE_CLOSED: "Answers are closed for this activity.",
      STALE_VERSION: "The answer changed in the meantime. The page is up to date, try again.",
      FORBIDDEN: "You cannot do this for this child.",
      INVALID_TRANSITION: "This authorization already has an answer.",
    },
  },
};

/** 28: the club's side (Réglages › Documents, the trip). */
type SettingsCopy = {
  title: string;
  intro: string;
  validity: string;
  season: string;
  event: string;
  onTrips: string;
  onTripsHint: string;
  text: string;
  textHint: string;
  languages: Record<Locale, string>;
  save: string;
  saved: string;
  requestAll: string;
  requestAllHint: string;
  requested: string;
  counts: string;
  tripTitle: string;
  tripIntro: string;
  tripNone: string;
  tripMissing: string;
  remind: string;
  reminded: string;
  person: string;
  splitTitle: string;
  splitIntro: string;
  splitDefault: string;
  splitPercent: string;
  splitTotal: string;
  splitSave: string;
  splitReset: string;
  splitSaved: string;
  payer: string;
  payerNone: string;
  paidBy: string;
  yourShare: string;
  errors: Record<string, string>;
};
export const authorizationSettingsCopy: Record<Locale, SettingsCopy> = {
  fr: {
    title: "Autorisations parentales",
    intro: "Les textes que les parents signent en ligne. Une autorisation demandée sur les déplacements part d'elle-même quand un mineur est inscrit à un déplacement, un tournoi ou un stage.",
    validity: "Une signature vaut pour",
    season: "la saison",
    event: "un seul déplacement ou événement",
    onTrips: "Demander sur chaque déplacement",
    onTripsHint: "Pour les mineurs inscrits, dès leur ajout au déplacement.",
    text: "Texte ({language})",
    textHint: "Champs possibles : {name}, {organization}, {season}, {date}. Laissez vide une langue que vous n'utilisez pas.",
    languages: { fr: "français", nl: "néerlandais", en: "anglais" },
    save: "Enregistrer",
    saved: "Autorisation enregistrée.",
    requestAll: "Demander à toutes les familles",
    requestAllHint: "Envoie la demande pour chaque joueur mineur de la saison qui n'a pas encore cette autorisation.",
    requested: "{n} demande(s) envoyée(s).",
    counts: "{signed} signée(s), {requested} en attente, {refused} refusée(s)",
    tripTitle: "Autorisations des mineurs",
    tripIntro: "Signées en ligne par les parents. Un mineur sans autorisation peut partir : c'est un avertissement, pas un blocage.",
    tripNone: "Aucune autorisation demandée sur les déplacements (Réglages › Documents).",
    tripMissing: "{n} autorisation(s) manquante(s) pour ce déplacement.",
    remind: "Relancer les parents",
    reminded: "{n} relance(s) envoyée(s).",
    person: "Joueur",
    splitTitle: "Cotisations et attestations",
    splitIntro: "Qui reçoit les cotisations et les attestations de mutuelle de cet enfant : un parent, l'autre, ou les deux avec une répartition.",
    splitDefault: "Sans répartition, chaque parent reçoit tout.",
    splitPercent: "Part de {name} (%)",
    splitTotal: "Total : {n} % (doit faire 100 %)",
    splitSave: "Enregistrer la répartition",
    splitReset: "Revenir à « chaque parent reçoit tout »",
    splitSaved: "Répartition enregistrée.",
    payer: "Payé par",
    payerNone: "Non précisé",
    paidBy: "payé par {name}",
    yourShare: "Votre part : {percent} %",
    errors: {
      SPLIT_TOTAL: "Le total des parts doit faire 100 %.",
      TEXT_TOO_SHORT: "Le texte est trop court.",
      INVALID_TEMPLATE: "Le texte contient un champ inconnu entre accolades.",
      NO_TEXT: "Écrivez d'abord le texte de l'autorisation.",
      SEASON_ONLY: "Seule une autorisation valable pour la saison peut être demandée à toutes les familles.",
      NO_SEASON: "Créez d'abord la saison en cours.",
    },
  },
  nl: {
    title: "Ouderlijke toestemmingen",
    intro: "De teksten die ouders online ondertekenen. Een toestemming gevraagd bij verplaatsingen vertrekt vanzelf zodra een minderjarige ingeschreven wordt voor een verplaatsing, toernooi of stage.",
    validity: "Een handtekening geldt voor",
    season: "het seizoen",
    event: "één verplaatsing of activiteit",
    onTrips: "Bij elke verplaatsing vragen",
    onTripsHint: "Voor de ingeschreven minderjarigen, zodra ze aan de verplaatsing worden toegevoegd.",
    text: "Tekst ({language})",
    textHint: "Mogelijke velden: {name}, {organization}, {season}, {date}. Laat een taal die u niet gebruikt leeg.",
    languages: { fr: "Frans", nl: "Nederlands", en: "Engels" },
    save: "Opslaan",
    saved: "Toestemming opgeslagen.",
    requestAll: "Aan alle gezinnen vragen",
    requestAllHint: "Stuurt de vraag voor elke minderjarige speler van het seizoen die deze toestemming nog niet heeft.",
    requested: "{n} vraag/vragen verstuurd.",
    counts: "{signed} ondertekend, {requested} wachtend, {refused} geweigerd",
    tripTitle: "Toestemmingen van de minderjarigen",
    tripIntro: "Online ondertekend door de ouders. Een minderjarige zonder toestemming mag vertrekken: het is een waarschuwing, geen blokkering.",
    tripNone: "Geen toestemming gevraagd bij verplaatsingen (Instellingen › Documenten).",
    tripMissing: "{n} ontbrekende toestemming(en) voor deze verplaatsing.",
    remind: "Ouders herinneren",
    reminded: "{n} herinnering(en) verstuurd.",
    person: "Speler",
    splitTitle: "Bijdragen en attesten",
    splitIntro: "Wie de bijdragen en de attesten voor het ziekenfonds van dit kind ontvangt: de ene ouder, de andere, of beiden met een verdeling.",
    splitDefault: "Zonder verdeling ontvangt elke ouder alles.",
    splitPercent: "Deel van {name} (%)",
    splitTotal: "Totaal: {n} % (moet 100 % zijn)",
    splitSave: "Verdeling opslaan",
    splitReset: "Terug naar « elke ouder ontvangt alles »",
    splitSaved: "Verdeling opgeslagen.",
    payer: "Betaald door",
    payerNone: "Niet vermeld",
    paidBy: "betaald door {name}",
    yourShare: "Uw deel: {percent} %",
    errors: {
      SPLIT_TOTAL: "Het totaal van de delen moet 100 % zijn.",
      TEXT_TOO_SHORT: "De tekst is te kort.",
      INVALID_TEMPLATE: "De tekst bevat een onbekend veld tussen accolades.",
      NO_TEXT: "Schrijf eerst de tekst van de toestemming.",
      SEASON_ONLY: "Alleen een toestemming voor het seizoen kan aan alle gezinnen worden gevraagd.",
      NO_SEASON: "Maak eerst het lopende seizoen aan.",
    },
  },
  en: {
    title: "Parental authorizations",
    intro: "The texts parents sign online. An authorization asked on trips leaves by itself when a minor joins a trip, a tournament or a camp.",
    validity: "One signature covers",
    season: "the season",
    event: "a single trip or event",
    onTrips: "Ask on every trip",
    onTripsHint: "For the minors taking part, as soon as they are added to the trip.",
    text: "Text ({language})",
    textHint: "Possible fields: {name}, {organization}, {season}, {date}. Leave empty a language you do not use.",
    languages: { fr: "French", nl: "Dutch", en: "English" },
    save: "Save",
    saved: "Authorization saved.",
    requestAll: "Ask every family",
    requestAllHint: "Sends the request for each minor player of the season who does not have this authorization yet.",
    requested: "{n} request(s) sent.",
    counts: "{signed} signed, {requested} waiting, {refused} refused",
    tripTitle: "Minors' authorizations",
    tripIntro: "Signed online by the parents. A minor without an authorization may still leave: it is a warning, not a block.",
    tripNone: "No authorization asked on trips (Settings › Documents).",
    tripMissing: "{n} authorization(s) missing for this trip.",
    remind: "Remind the parents",
    reminded: "{n} reminder(s) sent.",
    person: "Player",
    splitTitle: "Dues and attestations",
    splitIntro: "Who receives this child's dues and mutual insurance attestations: one parent, the other, or both with a split.",
    splitDefault: "Without a split, each parent receives everything.",
    splitPercent: "Share of {name} (%)",
    splitTotal: "Total: {n} % (must be 100 %)",
    splitSave: "Save the split",
    splitReset: "Back to “each parent receives everything”",
    splitSaved: "Split saved.",
    payer: "Paid by",
    payerNone: "Not given",
    paidBy: "paid by {name}",
    yourShare: "Your share: {percent} %",
    errors: {
      SPLIT_TOTAL: "The shares must add up to 100 %.",
      TEXT_TOO_SHORT: "The text is too short.",
      INVALID_TEMPLATE: "The text has an unknown field between braces.",
      NO_TEXT: "Write the authorization's text first.",
      SEASON_ONLY: "Only an authorization valid for the season can be asked of every family.",
      NO_SEASON: "Create the current season first.",
    },
  },
};
