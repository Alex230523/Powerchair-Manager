/** Wave 17 (J3): the transfer market. */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  unavailable: string;
  rulesTitle: string;
  open: string;
  closed: string;
  windows: string;
  allYear: string;
  amounts: string;
  noAmounts: string;
  cap: string;
  noCap: string;
  maxPerClub: string;
  maxPerPair: string;
  consentedAnytime: string;
  consentedOnly: string;
  bpcf: Record<"apply" | "hint" | "text", string>;
  validation: string;
  noValidation: string;
  mineTitle: string;
  mineIntro: string;
  visible: string;
  visibleOf: string;
  onlyThem: string;
  minor: string;
  consentTitle: string;
  consentAsk: string;
  give: string;
  refuseConsent: string;
  tabsLabel: string;
  tabs: Record<"players" | "offers" | "rules" | "provinces", string>;
  search: string;
  club: string;
  allClubs: string;
  noClub: string;
  classification: string;
  allClasses: string;
  province: string;
  allProvinces: string;
  age: string;
  allAges: string;
  count: string;
  noPlayers: string;
  cols: Record<"name" | "club" | "province" | "classification" | "age" | "seasons", string>;
  openSheet: string;
  sheetStats: string;
  statCols: Record<"season" | "club" | "matches" | "minutes" | "goals" | "assists", string>;
  noStats: string;
  sheetClubs: string;
  sheetPrizes: string;
  noPrizes: string;
  place: string;
  close: string;
  request: string;
  requestOf: string;
  season: string;
  amount: string;
  amountCap: string;
  message: string;
  send: string;
  sent: string;
  ownPlayer: string;
  offerCols: Record<"player" | "move" | "season" | "amount" | "status" | "consent" | "actions", string>;
  noOffers: string;
  status: Record<"sent" | "discussing" | "accepted" | "refused" | "withdrawn" | "validated", string>;
  consent: Record<"pending" | "given" | "refused", string>;
  withdraw: string;
  accept: string;
  refuse: string;
  validate: string;
  refuseValidation: string;
  note: string;
  conversation: string;
  conversationOf: string;
  noMessages: string;
  write: string;
  post: string;
  threadsTitle: string;
  threadsIntro: string;
  rulesForm: Record<"from" | "to" | "addWindow" | "removeWindow" | "amountsAllowed" | "cap" | "max" | "validation" | "text" | "save" | "windowOf" | "consentedAnytime" | "maxPair", string>;
  provinceOf: string;
  provinces: Record<string, string>;
  saved: string;
  errors: Record<string, string>;
};

const provincesFr = {
  "": "Non renseignée",
  antwerp: "Anvers",
  flemish_brabant: "Brabant flamand",
  walloon_brabant: "Brabant wallon",
  west_flanders: "Flandre occidentale",
  east_flanders: "Flandre orientale",
  hainaut: "Hainaut",
  liege: "Liège",
  limburg: "Limbourg",
  luxembourg: "Luxembourg",
  namur: "Namur",
  brussels: "Bruxelles-Capitale",
};

export const transfersCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Bourse aux transferts",
    intro: "Les joueurs des clubs de la fédération qui ont choisi d'être visibles, avec leurs informations sportives seulement.",
    loading: "Chargement…",
    unavailable: "Action impossible pour le moment.",
    rulesTitle: "Règles de la fédération",
    open: "Transferts ouverts",
    closed: "Transferts fermés",
    windows: "Périodes d'ouverture",
    allYear: "Toute l'année",
    amounts: "Montant autorisé",
    noAmounts: "Aucun montant",
    cap: "jusqu'à {amount}",
    noCap: "sans plafond",
    maxPerClub: "Au plus {n} transfert(s) par club et par saison",
    maxPerPair: "Au plus {n} transfert(s) d'un club vers un même club par saison",
    consentedAnytime: "Transfert consenti (tous d'accord) possible toute la saison ; sinon, départ libre pendant une période, validé par la fédération",
    consentedOnly: "Hors période : transferts consentis uniquement",
    bpcf: {
      apply: "Reprendre le règlement BPCF 2025",
      hint: "Remplit les périodes de la saison (1er juillet au 31 août, 20 décembre au 10 janvier), le plafond de 500 €, un transfert par saison d'un club vers un autre et le texte ; vérifiez puis enregistrez.",
      text: "Règlement BPCF 2025, art. 1/12. La saison va du 1er septembre au 30 juin. Transfert consenti (club sortant, club entrant et joueur ou parents d'accord) : toute la saison. Transfert libre ou litigieux (le club sortant refuse) : pendant la période principale, du 1er juillet au 31 août (période secondaire du 20 décembre au 10 janvier). Cas de force majeure : commission BPCF d'urgence. Chaque transfert est validé par la commission BPCF. Indemnité de formation (transfert national) : 50 € par année (académie), 125 € (élite), 250 € (élite avec entraîneurs diplômés BPCF), 500 € au plus par joueur ; la preuve de paiement est fournie à BPCF. Pas plus d'un transfert par an d'une structure vers une autre.",
    },
    validation: "Validation par la fédération",
    noValidation: "Sans validation de la fédération",
    mineTitle: "Ma visibilité",
    mineIntro: "Décochée par défaut. Seul le joueur adulte, ou un parent pour un mineur, peut la cocher ; le club ne peut pas le faire à sa place. Le retrait est immédiat.",
    visible: "Visible par les autres clubs de la fédération",
    visibleOf: "Visible par les autres clubs de la fédération : {name}",
    onlyThem: "Seul le joueur adulte, ou un parent pour un mineur, peut décider.",
    minor: "mineur",
    consentTitle: "Demandes de transfert à approuver",
    consentAsk: "{club} demande le transfert de {name} pour la saison {season}. Votre accord est nécessaire avant toute acceptation.",
    give: "Donner mon accord",
    refuseConsent: "Refuser",
    tabsLabel: "Sections de la bourse",
    tabs: { players: "Joueurs", offers: "Demandes de transfert", rules: "Règles", provinces: "Provinces des clubs" },
    search: "Rechercher un joueur",
    club: "Club",
    allClubs: "Tous les clubs",
    noClub: "Sans club",
    classification: "Classification",
    allClasses: "Toutes",
    province: "Province",
    allProvinces: "Toutes",
    age: "Catégorie d'âge",
    allAges: "Toutes",
    count: "{n} joueur(s)",
    noPlayers: "Aucun joueur visible pour le moment.",
    cols: { name: "Joueur", club: "Club et équipe", province: "Province", classification: "Classification", age: "Catégorie d'âge", seasons: "Saisons jouées" },
    openSheet: "Fiche sportive de {name}",
    sheetStats: "Statistiques par saison",
    statCols: { season: "Saison", club: "Club", matches: "Matchs", minutes: "Minutes", goals: "Buts", assists: "Passes" },
    noStats: "Aucun match enregistré.",
    sheetClubs: "Historique des clubs",
    sheetPrizes: "Tournois et places obtenues",
    noPrizes: "Aucune place enregistrée.",
    place: "{n}e place",
    close: "Fermer",
    request: "Demander un transfert",
    requestOf: "Demander le transfert de {name}",
    season: "Saison visée",
    amount: "Montant proposé en euros (facultatif)",
    amountCap: "Plafond : {amount}",
    message: "Message",
    send: "Envoyer la demande",
    sent: "Demande envoyée. Le club, et le joueur ou ses parents, sont prévenus.",
    ownPlayer: "Joueur de votre club",
    offerCols: { player: "Joueur", move: "De → vers", season: "Saison", amount: "Montant", status: "Statut", consent: "Accord du joueur", actions: "Suite" },
    noOffers: "Aucune demande de transfert.",
    status: { sent: "Envoyée", discussing: "En discussion", accepted: "Acceptée", refused: "Refusée", withdrawn: "Retirée", validated: "Validée par la fédération" },
    consent: { pending: "En attente", given: "Donné", refused: "Refusé" },
    withdraw: "Retirer",
    accept: "Accepter",
    refuse: "Refuser",
    validate: "Valider le transfert",
    refuseValidation: "Refuser",
    note: "Note (facultative)",
    conversation: "Conversation ({n})",
    conversationOf: "Conversation entre {from} et {to}",
    noMessages: "Pas encore de message.",
    write: "Votre message",
    post: "Envoyer",
    threadsTitle: "Conversations entre clubs",
    threadsIntro: "Les échanges sur les demandes de transfert, visibles des présidents et des personnes qui gèrent les joueurs des deux clubs.",
    rulesForm: {
      from: "Du",
      to: "Au",
      addWindow: "Ajouter une période",
      removeWindow: "Retirer la période",
      amountsAllowed: "Montant autorisé dans les demandes",
      cap: "Plafond en euros (facultatif)",
      max: "Transferts au plus par club et par saison (facultatif)",
      validation: "Validation obligatoire par la fédération",
      text: "Texte des règles, affiché en tête de la bourse",
      save: "Enregistrer les règles",
      windowOf: "Période {n}",
      consentedAnytime: "Transfert consenti possible toute la saison (hors période : départ libre validé par la fédération pendant une période)",
      maxPair: "Transferts au plus d'un club vers un même club par saison (facultatif)",
    },
    provinceOf: "Province : {name}",
    provinces: provincesFr,
    saved: "Enregistré.",
    errors: {
      MARKET_CLOSED: "Les transferts sont fermés en ce moment.",
      AMOUNT_NOT_ALLOWED: "Ce montant n'est pas autorisé par les règles de la fédération.",
      OWN_PLAYER: "Ce joueur est déjà dans votre club.",
      TRANSFER_LIMIT: "Le nombre maximum de transferts pour cette saison est atteint.",
      TRANSFER_PAIR_LIMIT: "Un transfert entre ces deux clubs a déjà eu lieu cette saison.",
      CONSENT_REQUIRED: "Le joueur, ou un parent, doit d'abord donner son accord.",
      DUPLICATE: "Une demande est déjà en cours pour ce joueur, ou il est déjà dans ce club.",
      NO_FEDERATION: "Votre club n'est rattaché à aucune fédération.",
      INVALID_TRANSITION: "Cette demande a déjà changé de statut.",
      NOT_FOUND: "Introuvable, ou plus visible.",
    },
  },
  nl: {
    title: "Transferbeurs",
    intro: "De spelers van de clubs van de federatie die zichtbaar willen zijn, met enkel hun sportieve gegevens.",
    loading: "Laden…",
    unavailable: "Actie momenteel niet mogelijk.",
    rulesTitle: "Regels van de federatie",
    open: "Transfers open",
    closed: "Transfers gesloten",
    windows: "Openingsperiodes",
    allYear: "Het hele jaar",
    amounts: "Bedrag toegestaan",
    noAmounts: "Geen bedrag",
    cap: "tot {amount}",
    noCap: "zonder plafond",
    maxPerClub: "Hoogstens {n} transfer(s) per club en per seizoen",
    maxPerPair: "Hoogstens {n} transfer(s) van een club naar dezelfde club per seizoen",
    consentedAnytime: "Transfer met akkoord van iedereen het hele seizoen mogelijk; anders vrij vertrek tijdens een periode, gevalideerd door de federatie",
    consentedOnly: "Buiten de periode: enkel transfers met akkoord",
    bpcf: {
      apply: "Het BPCF-reglement 2025 overnemen",
      hint: "Vult de periodes van het seizoen in (1 juli tot 31 augustus, 20 december tot 10 januari), het plafond van 500 €, één transfer per seizoen van een club naar een andere en de tekst; controleer en sla op.",
      text: "BPCF-reglement 2025, art. 1/12. Het seizoen loopt van 1 september tot 30 juni. Transfer met akkoord (vertrekkende club, ontvangende club en speler of ouders): het hele seizoen. Vrije of betwiste transfer (de vertrekkende club weigert): tijdens de hoofdperiode, van 1 juli tot 31 augustus (tweede periode van 20 december tot 10 januari). Overmacht: dringende BPCF-commissie. Elke transfer wordt gevalideerd door de BPCF-commissie. Opleidingsvergoeding (nationale transfer): 50 € per jaar (academie), 125 € (elite), 250 € (elite met door BPCF gediplomeerde trainers), hoogstens 500 € per speler; het betalingsbewijs wordt aan BPCF bezorgd. Niet meer dan één transfer per jaar van een structuur naar een andere.",
    },
    validation: "Validatie door de federatie",
    noValidation: "Zonder validatie door de federatie",
    mineTitle: "Mijn zichtbaarheid",
    mineIntro: "Standaard uitgevinkt. Enkel de volwassen speler, of een ouder voor een minderjarige, kan het aanvinken; de club kan het niet in hun plaats doen. Intrekken werkt meteen.",
    visible: "Zichtbaar voor de andere clubs van de federatie",
    visibleOf: "Zichtbaar voor de andere clubs van de federatie: {name}",
    onlyThem: "Enkel de volwassen speler, of een ouder voor een minderjarige, kan beslissen.",
    minor: "minderjarig",
    consentTitle: "Transferaanvragen om goed te keuren",
    consentAsk: "{club} vraagt de transfer van {name} voor het seizoen {season}. Uw akkoord is nodig vóór elke aanvaarding.",
    give: "Mijn akkoord geven",
    refuseConsent: "Weigeren",
    tabsLabel: "Onderdelen van de beurs",
    tabs: { players: "Spelers", offers: "Transferaanvragen", rules: "Regels", provinces: "Provincies van de clubs" },
    search: "Een speler zoeken",
    club: "Club",
    allClubs: "Alle clubs",
    noClub: "Zonder club",
    classification: "Classificatie",
    allClasses: "Alle",
    province: "Provincie",
    allProvinces: "Alle",
    age: "Leeftijdscategorie",
    allAges: "Alle",
    count: "{n} speler(s)",
    noPlayers: "Momenteel geen zichtbare speler.",
    cols: { name: "Speler", club: "Club en team", province: "Provincie", classification: "Classificatie", age: "Leeftijdscategorie", seasons: "Gespeelde seizoenen" },
    openSheet: "Sportfiche van {name}",
    sheetStats: "Statistieken per seizoen",
    statCols: { season: "Seizoen", club: "Club", matches: "Wedstrijden", minutes: "Minuten", goals: "Doelpunten", assists: "Assists" },
    noStats: "Geen wedstrijd geregistreerd.",
    sheetClubs: "Geschiedenis van de clubs",
    sheetPrizes: "Toernooien en behaalde plaatsen",
    noPrizes: "Geen plaats geregistreerd.",
    place: "{n}e plaats",
    close: "Sluiten",
    request: "Een transfer vragen",
    requestOf: "De transfer van {name} vragen",
    season: "Beoogd seizoen",
    amount: "Voorgesteld bedrag in euro (optioneel)",
    amountCap: "Plafond: {amount}",
    message: "Bericht",
    send: "Aanvraag versturen",
    sent: "Aanvraag verstuurd. De club, en de speler of zijn ouders, zijn verwittigd.",
    ownPlayer: "Speler van uw club",
    offerCols: { player: "Speler", move: "Van → naar", season: "Seizoen", amount: "Bedrag", status: "Status", consent: "Akkoord van de speler", actions: "Vervolg" },
    noOffers: "Geen transferaanvraag.",
    status: { sent: "Verstuurd", discussing: "In bespreking", accepted: "Aanvaard", refused: "Geweigerd", withdrawn: "Ingetrokken", validated: "Gevalideerd door de federatie" },
    consent: { pending: "In afwachting", given: "Gegeven", refused: "Geweigerd" },
    withdraw: "Intrekken",
    accept: "Aanvaarden",
    refuse: "Weigeren",
    validate: "De transfer valideren",
    refuseValidation: "Weigeren",
    note: "Notitie (optioneel)",
    conversation: "Gesprek ({n})",
    conversationOf: "Gesprek tussen {from} en {to}",
    noMessages: "Nog geen bericht.",
    write: "Uw bericht",
    post: "Versturen",
    threadsTitle: "Gesprekken tussen clubs",
    threadsIntro: "De berichten over de transferaanvragen, zichtbaar voor de voorzitters en de personen die de spelers van beide clubs beheren.",
    rulesForm: {
      from: "Van",
      to: "Tot",
      addWindow: "Periode toevoegen",
      removeWindow: "Periode verwijderen",
      amountsAllowed: "Bedrag toegestaan in de aanvragen",
      cap: "Plafond in euro (optioneel)",
      max: "Hoogstens transfers per club en per seizoen (optioneel)",
      validation: "Verplichte validatie door de federatie",
      text: "Tekst van de regels, bovenaan de beurs",
      save: "De regels opslaan",
      windowOf: "Periode {n}",
      consentedAnytime: "Transfer met akkoord het hele seizoen mogelijk (buiten de periode: vrij vertrek gevalideerd door de federatie tijdens een periode)",
      maxPair: "Hoogstens transfers van een club naar dezelfde club per seizoen (optioneel)",
    },
    provinceOf: "Provincie: {name}",
    provinces: {
      "": "Niet ingevuld",
      antwerp: "Antwerpen",
      flemish_brabant: "Vlaams-Brabant",
      walloon_brabant: "Waals-Brabant",
      west_flanders: "West-Vlaanderen",
      east_flanders: "Oost-Vlaanderen",
      hainaut: "Henegouwen",
      liege: "Luik",
      limburg: "Limburg",
      luxembourg: "Luxemburg",
      namur: "Namen",
      brussels: "Brussel-Hoofdstad",
    },
    saved: "Opgeslagen.",
    errors: {
      MARKET_CLOSED: "De transfers zijn momenteel gesloten.",
      AMOUNT_NOT_ALLOWED: "Dit bedrag is niet toegestaan door de regels van de federatie.",
      OWN_PLAYER: "Deze speler zit al in uw club.",
      TRANSFER_LIMIT: "Het maximum aantal transfers voor dit seizoen is bereikt.",
      TRANSFER_PAIR_LIMIT: "Er was dit seizoen al een transfer tussen deze twee clubs.",
      CONSENT_REQUIRED: "De speler, of een ouder, moet eerst akkoord gaan.",
      DUPLICATE: "Er loopt al een aanvraag voor deze speler, of hij zit al in deze club.",
      NO_FEDERATION: "Uw club is bij geen enkele federatie aangesloten.",
      INVALID_TRANSITION: "Deze aanvraag veranderde al van status.",
      NOT_FOUND: "Niet gevonden, of niet meer zichtbaar.",
    },
  },
  en: {
    title: "Transfer market",
    intro: "The players of the federation's clubs who chose to be seen, with their sporting information only.",
    loading: "Loading…",
    unavailable: "Action not possible right now.",
    rulesTitle: "Rules of the federation",
    open: "Transfers open",
    closed: "Transfers closed",
    windows: "Opening periods",
    allYear: "All year",
    amounts: "Amount allowed",
    noAmounts: "No amount",
    cap: "up to {amount}",
    noCap: "no cap",
    maxPerClub: "At most {n} transfer(s) per club and per season",
    maxPerPair: "At most {n} transfer(s) from one club to the same club per season",
    consentedAnytime: "A transfer everyone agrees to is possible all season; otherwise, a free leave during a period, validated by the federation",
    consentedOnly: "Outside a period: agreed transfers only",
    bpcf: {
      apply: "Use the BPCF 2025 rules",
      hint: "Fills in the season's periods (1 July to 31 August, 20 December to 10 January), the 500 € cap, one transfer per season from one club to another and the text; check, then save.",
      text: "BPCF rules 2025, art. 1/12. The season runs from 1 September to 30 June. Agreed transfer (leaving club, receiving club and player or parents agree): all season. Free or disputed transfer (the leaving club refuses): during the main period, 1 July to 31 August (second period 20 December to 10 January). Force majeure: urgent BPCF commission. Every transfer is validated by the BPCF commission. Training compensation (national transfer): 50 € per year (academy), 125 € (elite), 250 € (elite with BPCF-qualified coaches), at most 500 € per player; proof of payment goes to BPCF. No more than one transfer a year from one structure to another.",
    },
    validation: "Validation by the federation",
    noValidation: "Without validation by the federation",
    mineTitle: "My visibility",
    mineIntro: "Unticked by default. Only the adult player, or a parent for a minor, can tick it; the club cannot do it for them. Withdrawing is immediate.",
    visible: "Visible to the other clubs of the federation",
    visibleOf: "Visible to the other clubs of the federation: {name}",
    onlyThem: "Only the adult player, or a parent for a minor, can decide.",
    minor: "minor",
    consentTitle: "Transfer requests to approve",
    consentAsk: "{club} asks for the transfer of {name} for the season {season}. Your agreement is needed before any acceptance.",
    give: "Give my agreement",
    refuseConsent: "Refuse",
    tabsLabel: "Sections of the market",
    tabs: { players: "Players", offers: "Transfer requests", rules: "Rules", provinces: "Provinces of the clubs" },
    search: "Search a player",
    club: "Club",
    allClubs: "All clubs",
    noClub: "Without club",
    classification: "Classification",
    allClasses: "All",
    province: "Province",
    allProvinces: "All",
    age: "Age category",
    allAges: "All",
    count: "{n} player(s)",
    noPlayers: "No visible player right now.",
    cols: { name: "Player", club: "Club and team", province: "Province", classification: "Classification", age: "Age category", seasons: "Seasons played" },
    openSheet: "Sporting sheet of {name}",
    sheetStats: "Statistics per season",
    statCols: { season: "Season", club: "Club", matches: "Matches", minutes: "Minutes", goals: "Goals", assists: "Assists" },
    noStats: "No match recorded.",
    sheetClubs: "History of the clubs",
    sheetPrizes: "Tournaments and places",
    noPrizes: "No place recorded.",
    place: "place {n}",
    close: "Close",
    request: "Ask for a transfer",
    requestOf: "Ask for the transfer of {name}",
    season: "Season",
    amount: "Amount offered in euros (optional)",
    amountCap: "Cap: {amount}",
    message: "Message",
    send: "Send the request",
    sent: "Request sent. The club, and the player or the parents, are told.",
    ownPlayer: "Player of your club",
    offerCols: { player: "Player", move: "From → to", season: "Season", amount: "Amount", status: "Status", consent: "Player's agreement", actions: "Next" },
    noOffers: "No transfer request.",
    status: { sent: "Sent", discussing: "In discussion", accepted: "Accepted", refused: "Refused", withdrawn: "Withdrawn", validated: "Validated by the federation" },
    consent: { pending: "Pending", given: "Given", refused: "Refused" },
    withdraw: "Withdraw",
    accept: "Accept",
    refuse: "Refuse",
    validate: "Validate the transfer",
    refuseValidation: "Refuse",
    note: "Note (optional)",
    conversation: "Conversation ({n})",
    conversationOf: "Conversation between {from} and {to}",
    noMessages: "No message yet.",
    write: "Your message",
    post: "Send",
    threadsTitle: "Conversations between clubs",
    threadsIntro: "The exchanges about transfer requests, seen by the presidents and the people who manage the players of both clubs.",
    rulesForm: {
      from: "From",
      to: "To",
      addWindow: "Add a period",
      removeWindow: "Remove the period",
      amountsAllowed: "Amount allowed in the requests",
      cap: "Cap in euros (optional)",
      max: "Transfers at most per club and per season (optional)",
      validation: "Validation by the federation required",
      text: "Text of the rules, shown at the top of the market",
      save: "Save the rules",
      windowOf: "Period {n}",
      consentedAnytime: "Agreed transfer possible all season (outside a period: free leave validated by the federation during a period)",
      maxPair: "Transfers at most from one club to the same club per season (optional)",
    },
    provinceOf: "Province: {name}",
    provinces: {
      "": "Not given",
      antwerp: "Antwerp",
      flemish_brabant: "Flemish Brabant",
      walloon_brabant: "Walloon Brabant",
      west_flanders: "West Flanders",
      east_flanders: "East Flanders",
      hainaut: "Hainaut",
      liege: "Liège",
      limburg: "Limburg",
      luxembourg: "Luxembourg",
      namur: "Namur",
      brussels: "Brussels-Capital",
    },
    saved: "Saved.",
    errors: {
      MARKET_CLOSED: "Transfers are closed right now.",
      AMOUNT_NOT_ALLOWED: "This amount is not allowed by the federation's rules.",
      OWN_PLAYER: "This player is already in your club.",
      TRANSFER_LIMIT: "The maximum number of transfers for this season is reached.",
      TRANSFER_PAIR_LIMIT: "A transfer between these two clubs already took place this season.",
      CONSENT_REQUIRED: "The player, or a parent, must agree first.",
      DUPLICATE: "A request is already under way for this player, or they are already in this club.",
      NO_FEDERATION: "Your club is not affiliated to a federation.",
      INVALID_TRANSITION: "This request has already changed status.",
      NOT_FOUND: "Not found, or no longer visible.",
    },
  },
};
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
