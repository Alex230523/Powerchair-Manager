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
  yearly: string;
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
  tabs: Record<"players" | "offers" | "rules" | "provinces" | "international", string>;
  bpcf2: {
    formatOf: string;
    formats: Record<"" | "academy" | "elite" | "elite_certified", string>;
    indemnity: string;
    forceMajeure: string;
    forceReason: string;
    forceBadge: string;
    kinds: Record<"consented" | "free" | "force_majeure", string>;
    proofAdd: string;
    proofOf: string;
    paymentConfirmed: string;
    paymentWaiting: string;
    confirmPayment: string;
    unconfirmPayment: string;
    intlIntro: string;
    intlPlayer: string;
    intlForeignClub: string;
    intlCountry: string;
    intlYears: string;
    intlNote: string;
    intlRecord: string;
    intlNone: string;
    intlPaid: string;
    intlToPay: string;
    intlMarkPaid: string;
    intlMarkUnpaid: string;
    intlRates: string;
    intlToFederation: string;
    intlOffPlatform: string;
    intlStatus: Record<"recorded" | "sent" | "accepted" | "refused", string>;
    intlCertificate: string;
    intlIncoming: string;
    intlIncomingIntro: string;
    intlIncomingNone: string;
    intlFrom: string;
    intlReceivingClub: string;
    intlReceivingUnknown: string;
    intlDecisionNote: string;
    intlAccept: string;
    intlRefuse: string;
    intlDecided: string;
    intlClassification: string;
  };
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
  rulesForm: Record<"from" | "to" | "addWindow" | "removeWindow" | "amountsAllowed" | "cap" | "max" | "validation" | "text" | "save" | "windowOf" | "consentedAnytime" | "maxPair" | "yearly", string>;
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
    yearly: "chaque année",
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
    tabs: { players: "Joueurs", offers: "Demandes de transfert", rules: "Règles", provinces: "Clubs", international: "Transferts internationaux" },
    bpcf2: {
      formatOf: "Format de formation : {name}",
      formats: { "": "Non précisé", academy: "Académie", elite: "Élite", elite_certified: "Élite, entraîneurs diplômés BPCF" },
      indemnity: "Indemnité de formation BPCF proposée : {amount} ({n} saison(s), format {format})",
      forceMajeure: "Cas de force majeure (déménagement, scolarité…) : la commission décide, même hors période",
      forceReason: "Raison de la force majeure",
      forceBadge: "Force majeure",
      kinds: { consented: "Consenti", free: "Libre", force_majeure: "Force majeure" },
      proofAdd: "Déposer la preuve de paiement",
      proofOf: "Preuve de paiement : {name}",
      paymentConfirmed: "Paiement confirmé par la fédération",
      paymentWaiting: "Paiement à confirmer : le joueur ne joue pas encore",
      confirmPayment: "Confirmer le paiement",
      unconfirmPayment: "Retirer la confirmation",
      intlIntro: "Un joueur formé en Belgique part vers un club étranger : la fédération l'enregistre, l'indemnité est calculée (500, 750 ou 1 000 € par année selon le format du club formateur, 250 € de dossier, 3 000 € au plus) et la fédération la reverse au club.",
      intlPlayer: "Joueur",
      intlForeignClub: "Club étranger",
      intlCountry: "Pays",
      intlYears: "Années de formation",
      intlNote: "Note (facultatif)",
      intlRecord: "Enregistrer le transfert international",
      intlNone: "Aucun transfert international.",
      intlPaid: "Payée",
      intlToPay: "À recevoir",
      intlMarkPaid: "Marquer reçue",
      intlMarkUnpaid: "Marquer à recevoir",
      intlRates: "Le format du club formateur doit être précisé dans l'onglet Clubs.",
      intlToFederation: "Fédération d'accueil",
      intlOffPlatform: "Hors plateforme (saisie libre)",
      intlStatus: { recorded: "Enregistré", sent: "Envoyé, en attente", accepted: "Accepté", refused: "Refusé" },
      intlCertificate: "Certificat {n}",
      intlIncoming: "Dossiers reçus de l'étranger",
      intlIncomingIntro: "Les fédérations de la plateforme vous envoient le dossier d'un joueur qui rejoint un de vos clubs : nom, classification, formation et indemnité, rien d'autre. Vous acceptez, en nommant le club d'accueil si vous le connaissez, ou vous refusez en expliquant.",
      intlIncomingNone: "Aucun dossier reçu.",
      intlFrom: "De {federation} ({country}), club {club}",
      intlReceivingClub: "Club d'accueil",
      intlReceivingUnknown: "Pas encore connu",
      intlDecisionNote: "Note pour la fédération d'origine (facultatif)",
      intlAccept: "Accepter le dossier",
      intlRefuse: "Refuser le dossier",
      intlDecided: "Décidé le {day}",
      intlClassification: "Classification",
    },
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
      yearly: "Les mêmes périodes chaque année (seuls le jour et le mois comptent)",
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
      FORMAT_REQUIRED: "Précisez d'abord le format de formation du club (onglet Clubs).",
      COUNTRY_REQUIRED: "Indiquez le pays, ou choisissez une fédération de la plateforme.",
      PROOF_REQUIRED: "Le club entrant doit d'abord déposer la preuve de paiement.",
      REASON_REQUIRED: "Expliquez la raison de la force majeure.",
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
    yearly: "elk jaar",
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
    tabs: { players: "Spelers", offers: "Transferaanvragen", rules: "Regels", provinces: "Clubs", international: "Internationale transfers" },
    bpcf2: {
      formatOf: "Opleidingsformaat: {name}",
      formats: { "": "Niet opgegeven", academy: "Academie", elite: "Elite", elite_certified: "Elite, door BPCF gediplomeerde trainers" },
      indemnity: "Voorgestelde BPCF-opleidingsvergoeding: {amount} ({n} seizoen(en), formaat {format})",
      forceMajeure: "Overmacht (verhuis, school…): de commissie beslist, ook buiten de periode",
      forceReason: "Reden van de overmacht",
      forceBadge: "Overmacht",
      kinds: { consented: "Met akkoord", free: "Vrij", force_majeure: "Overmacht" },
      proofAdd: "Betalingsbewijs neerleggen",
      proofOf: "Betalingsbewijs: {name}",
      paymentConfirmed: "Betaling bevestigd door de federatie",
      paymentWaiting: "Betaling te bevestigen: de speler speelt nog niet",
      confirmPayment: "Betaling bevestigen",
      unconfirmPayment: "Bevestiging intrekken",
      intlIntro: "Een in België opgeleide speler vertrekt naar een buitenlandse club: de federatie registreert het, de vergoeding wordt berekend (500, 750 of 1 000 € per jaar volgens het formaat van de opleidende club, 250 € dossierkosten, hoogstens 3 000 €) en de federatie stort ze door aan de club.",
      intlPlayer: "Speler",
      intlForeignClub: "Buitenlandse club",
      intlCountry: "Land",
      intlYears: "Opleidingsjaren",
      intlNote: "Opmerking (optioneel)",
      intlRecord: "Internationale transfer registreren",
      intlNone: "Geen internationale transfers.",
      intlPaid: "Betaald",
      intlToPay: "Te ontvangen",
      intlMarkPaid: "Als ontvangen markeren",
      intlMarkUnpaid: "Als te ontvangen markeren",
      intlRates: "Het formaat van de opleidende club moet in het tabblad Clubs opgegeven zijn.",
      intlToFederation: "Ontvangende federatie",
      intlOffPlatform: "Buiten het platform (vrije invoer)",
      intlStatus: { recorded: "Geregistreerd", sent: "Verzonden, in afwachting", accepted: "Aanvaard", refused: "Geweigerd" },
      intlCertificate: "Certificaat {n}",
      intlIncoming: "Dossiers ontvangen uit het buitenland",
      intlIncomingIntro: "De federaties van het platform sturen u het dossier van een speler die naar een van uw clubs komt: naam, classificatie, opleiding en vergoeding, niets anders. U aanvaardt, met de ontvangende club als u die kent, of u weigert met een uitleg.",
      intlIncomingNone: "Geen dossier ontvangen.",
      intlFrom: "Van {federation} ({country}), club {club}",
      intlReceivingClub: "Ontvangende club",
      intlReceivingUnknown: "Nog niet gekend",
      intlDecisionNote: "Nota voor de federatie van herkomst (facultatief)",
      intlAccept: "Dossier aanvaarden",
      intlRefuse: "Dossier weigeren",
      intlDecided: "Beslist op {day}",
      intlClassification: "Classificatie",
    },
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
      yearly: "Elk jaar dezelfde periodes (enkel dag en maand tellen)",
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
      FORMAT_REQUIRED: "Geef eerst het opleidingsformaat van de club op (tabblad Clubs).",
      COUNTRY_REQUIRED: "Geef het land op, of kies een federatie van het platform.",
      PROOF_REQUIRED: "De ontvangende club moet eerst het betalingsbewijs neerleggen.",
      REASON_REQUIRED: "Leg de reden van de overmacht uit.",
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
    yearly: "every year",
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
    tabs: { players: "Players", offers: "Transfer requests", rules: "Rules", provinces: "Clubs", international: "International transfers" },
    bpcf2: {
      formatOf: "Training format: {name}",
      formats: { "": "Not set", academy: "Academy", elite: "Elite", elite_certified: "Elite, BPCF-qualified coaches" },
      indemnity: "Suggested BPCF training compensation: {amount} ({n} season(s), {format} format)",
      forceMajeure: "Force majeure (moving, school…): the commission decides, even outside a period",
      forceReason: "Reason for the force majeure",
      forceBadge: "Force majeure",
      kinds: { consented: "Agreed", free: "Free", force_majeure: "Force majeure" },
      proofAdd: "File the proof of payment",
      proofOf: "Proof of payment: {name}",
      paymentConfirmed: "Payment confirmed by the federation",
      paymentWaiting: "Payment to confirm: the player does not play yet",
      confirmPayment: "Confirm the payment",
      unconfirmPayment: "Withdraw the confirmation",
      intlIntro: "A player trained in Belgium leaves for a club abroad: the federation records it, the compensation is computed (500, 750 or 1,000 € per year by the training club's format, 250 € file fee, 3,000 € at most) and the federation passes it on to the club.",
      intlPlayer: "Player",
      intlForeignClub: "Club abroad",
      intlCountry: "Country",
      intlYears: "Years of training",
      intlNote: "Note (optional)",
      intlRecord: "Record the international transfer",
      intlNone: "No international transfers.",
      intlPaid: "Paid",
      intlToPay: "To receive",
      intlMarkPaid: "Mark received",
      intlMarkUnpaid: "Mark to receive",
      intlRates: "The training club's format must be set in the Clubs tab.",
      intlToFederation: "Receiving federation",
      intlOffPlatform: "Off the platform (free entry)",
      intlStatus: { recorded: "Recorded", sent: "Sent, pending", accepted: "Accepted", refused: "Refused" },
      intlCertificate: "Certificate {n}",
      intlIncoming: "Dossiers received from abroad",
      intlIncomingIntro: "The federations of the platform send you the dossier of a player joining one of your clubs: name, classification, training and compensation, nothing else. You accept, naming the receiving club if you know it, or refuse with a note.",
      intlIncomingNone: "No dossier received.",
      intlFrom: "From {federation} ({country}), club {club}",
      intlReceivingClub: "Receiving club",
      intlReceivingUnknown: "Not known yet",
      intlDecisionNote: "Note for the federation of origin (optional)",
      intlAccept: "Accept the dossier",
      intlRefuse: "Refuse the dossier",
      intlDecided: "Decided on {day}",
      intlClassification: "Classification",
    },
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
      yearly: "The same periods every year (only the day and month count)",
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
      FORMAT_REQUIRED: "First set the club's training format (Clubs tab).",
      COUNTRY_REQUIRED: "Give the country, or choose a federation of the platform.",
      PROOF_REQUIRED: "The receiving club must first file the proof of payment.",
      REASON_REQUIRED: "Explain the reason for the force majeure.",
      CONSENT_REQUIRED: "The player, or a parent, must agree first.",
      DUPLICATE: "A request is already under way for this player, or they are already in this club.",
      NO_FEDERATION: "Your club is not affiliated to a federation.",
      INVALID_TRANSITION: "This request has already changed status.",
      NOT_FOUND: "Not found, or no longer visible.",
    },
  },
};
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
