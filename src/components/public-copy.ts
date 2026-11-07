import type { Locale } from "@/lib/locale";

/** B6: public pages, widgets, the public calendar, the read API and the webhooks. */
export const publicBlocks = ["identity", "teams", "next_matches", "results", "standings", "sponsors"] as const;
export const apiScopes = ["read:teams", "read:matches", "read:tournaments", "read:events"] as const;
type Copy = {
  title: string;
  intro: string;
  loading: string;
  unavailable: string;
  saved: string;
  save: string;
  tabs: Record<"page" | "widgets" | "consents" | "api" | "webhooks", string>;
  tabsLabel: string;
  enabled: string;
  enabledHint: string;
  slug: string;
  slugHint: string;
  introText: string;
  blocks: string;
  blockLabels: Record<(typeof publicBlocks)[number], string>;
  view: string;
  ics: string;
  icsHint: string;
  icsNone: string;
  icsCreate: string;
  icsRevoke: string;
  tournaments: string;
  tournamentsHint: string;
  noTournaments: string;
  sponsorsHint: string;
  widgets: string;
  widgetsHint: string;
  widgetKinds: Record<"next" | "results" | "standings" | "registration", string>;
  snippet: string;
  needsPage: string;
  consents: string;
  consentsHint: string;
  noMinors: string;
  consentLabel: string;
  keys: string;
  keysHint: string;
  keyName: string;
  scopes: string;
  scopeLabels: Record<(typeof apiScopes)[number], string>;
  createKey: string;
  newKey: string;
  newKeyHint: string;
  noKeys: string;
  revoke: string;
  revoked: string;
  lastUsed: string;
  never: string;
  docs: string;
  mcp: string;
  mcpHint: string;
  mcpScopes: Record<"club:read" | "calendar:read" | "dues:read", string>;
  mcpCreate: string;
  mcpKeyName: string;
  mcpNone: string;
  mcpHowTo: string;
  mcpTools: string;
  mcpBy: string;
  hooks: string;
  hooksHint: string;
  url: string;
  events: string;
  eventLabels: Record<"registration.validated" | "match.validated" | "document.expired" | "payment.reconciled", string>;
  createHook: string;
  newSecret: string;
  noHooks: string;
  remove: string;
  journal: string;
  noDeliveries: string;
  replay: string;
  states: Record<"pending" | "sent" | "failed", string>;
  page: {
    teams: string;
    nextMatches: string;
    results: string;
    standings: string;
    sponsors: string;
    noMatches: string;
    noResults: string;
    home: string;
    away: string;
    corrected: string;
    scorers: string;
    aPlayer: string;
    team: string;
    played: string;
    points: string;
    goals: string;
    calendar: string;
    poweredBy: string;
    notFound: string;
    days: string;
  };
  errors: Record<string, string>;
};

export const publicCopy: Record<Locale, Copy> = {
  fr: {
    title: "Page publique et intégrations",
    intro: "La vitrine du club pour les sponsors, les pouvoirs subsidiants et les familles, des widgets pour son site, une API en lecture et des webhooks.",
    loading: "Chargement…",
    unavailable: "Cette page n'est pas disponible pour le moment.",
    saved: "Enregistré.",
    save: "Enregistrer",
    tabs: { page: "Page publique", widgets: "Widgets", consents: "Noms publiés", api: "API", webhooks: "Webhooks" },
    tabsLabel: "Sections des intégrations",
    enabled: "Publier la page du club",
    enabledHint: "Rien n'est public tant que cette case n'est pas cochée. Seuls les résultats validés apparaissent.",
    slug: "Adresse de la page",
    slugHint: "Lettres minuscules, chiffres et tirets, par exemple « mon-club ».",
    introText: "Présentation",
    blocks: "Blocs affichés",
    blockLabels: { identity: "Présentation du club", teams: "Équipes", next_matches: "Prochains matchs", results: "Résultats validés", standings: "Classements des tournois", sponsors: "Sponsors" },
    view: "Voir la page publique",
    ics: "Calendrier public (ICS)",
    icsHint: "Matchs et événements ouverts, sans aucune donnée personnelle. Distinct du calendrier privé ; révocable à tout moment.",
    icsNone: "Pas de calendrier public.",
    icsCreate: "Créer le lien du calendrier",
    icsRevoke: "Révoquer le lien",
    tournaments: "Tournois publiés",
    tournamentsHint: "Calendrier, résultats validés et classements, sur une page publique par tournoi.",
    noTournaments: "Aucun tournoi organisé par le club.",
    sponsorsHint: "Les sponsors apparaissent si leur formule le prévoit (Finances › Sponsors › Formules).",
    widgets: "Widgets à intégrer",
    widgetsHint: "Copiez l'extrait dans le site du club. Les widgets suivent les couleurs du club et la langue choisie.",
    widgetKinds: { next: "Prochain match", results: "Derniers résultats", standings: "Classement", registration: "Inscription" },
    snippet: "Extrait de code",
    needsPage: "Publiez d'abord la page du club.",
    consents: "Noms des joueurs mineurs",
    consentsHint: "Un joueur mineur n'apparaît jamais par son nom (ni sa photo) sur les pages publiques sans le consentement explicite de ses parents. Cochez seulement après l'avoir reçu.",
    noMinors: "Aucun joueur mineur.",
    consentLabel: "Consentement reçu pour publier le nom de {name}",
    keys: "Clés d'API",
    keysHint: "Lecture seule, limitée à 60 demandes par minute et aux droits choisis. La clé n'est montrée qu'une fois. Elle s'arrête quand vous quittez la présidence : le prochain président crée les siennes.",
    keyName: "Nom de la clé",
    scopes: "Droits",
    scopeLabels: { "read:teams": "Équipes", "read:matches": "Matchs", "read:tournaments": "Tournois", "read:events": "Événements ouverts" },
    createKey: "Créer une clé",
    newKey: "Nouvelle clé",
    newKeyHint: "Copiez-la maintenant : elle ne sera plus affichée.",
    noKeys: "Aucune clé.",
    revoke: "Révoquer",
    revoked: "Révoquée",
    lastUsed: "Dernier usage : {date}",
    never: "jamais utilisée",
    docs: "Documentation (OpenAPI)",
    mcp: "Connecteur pour votre assistant (MCP)",
    mcpHint: "Branchez votre propre Claude (ou un autre assistant MCP) sur votre club, en lecture seule : équipes, matchs, calendrier et, si vous le choisissez, les cotisations nommément. La clé vaut tant que vous présidez ; elle est montrée une fois ; dix clés actives au plus.",
    mcpScopes: { "club:read": "Le club : équipes, matchs, tournois, chiffres", "calendar:read": "Le calendrier (sans les participants)", "dues:read": "Les cotisations, membre par membre" },
    mcpCreate: "Créer la clé du connecteur",
    mcpKeyName: "Nom du connecteur",
    mcpNone: "Aucun connecteur.",
    mcpHowTo: "Dans Claude (Réglages, Connecteurs, Ajouter un connecteur distant), donnez l'adresse ci-dessous et la clé comme jeton d'accès (Bearer).",
    mcpTools: "Outils : vue du club, équipes, matchs, tournois, calendrier, cotisations.",
    mcpBy: "créée par {name}",
    hooks: "Webhooks",
    hooksHint: "Chaque envoi est signé (en-tête X-PFM-Signature, HMAC SHA-256 de « horodatage.corps »), répété en cas d'échec, et garde son identifiant s'il est rejoué.",
    url: "Adresse HTTPS",
    events: "Événements",
    eventLabels: { "registration.validated": "Inscription validée", "match.validated": "Résultat validé", "document.expired": "Document expiré", "payment.reconciled": "Paiement rapproché" },
    createHook: "Ajouter le webhook",
    newSecret: "Secret de signature, montré une seule fois :",
    noHooks: "Aucun webhook.",
    remove: "Supprimer",
    journal: "Journal des envois",
    noDeliveries: "Aucun envoi.",
    replay: "Rejouer",
    states: { pending: "En attente", sent: "Envoyé", failed: "Échec" },
    page: {
      teams: "Nos équipes",
      nextMatches: "Prochains matchs",
      results: "Derniers résultats",
      standings: "Classements",
      sponsors: "Ils nous soutiennent",
      noMatches: "Pas de match prévu.",
      noResults: "Pas encore de résultat.",
      home: "à domicile",
      away: "à l'extérieur",
      corrected: "Résultat corrigé le {date}",
      scorers: "Buteurs",
      aPlayer: "un joueur",
      team: "Équipe",
      played: "J",
      points: "Pts",
      goals: "Buts",
      calendar: "Ajouter à mon agenda",
      poweredBy: "Avec Powerchair Football Manager",
      notFound: "Cette page n'existe pas ou n'est pas publiée.",
      days: "Journées",
    },
    errors: { SLUG_TAKEN: "Cette adresse est déjà prise.", UNSAFE_URL: "Adresse refusée : HTTPS public seulement.", API_KEY_INVALID: "Clé d'API absente, invalide ou révoquée." },
  },
  nl: {
    title: "Openbare pagina en koppelingen",
    intro: "Het uithangbord van de club voor sponsors, subsidiegevers en families, widgets voor zijn website, een lees-API en webhooks.",
    loading: "Laden…",
    unavailable: "Deze pagina is momenteel niet beschikbaar.",
    saved: "Opgeslagen.",
    save: "Opslaan",
    tabs: { page: "Openbare pagina", widgets: "Widgets", consents: "Gepubliceerde namen", api: "API", webhooks: "Webhooks" },
    tabsLabel: "Onderdelen van de koppelingen",
    enabled: "De clubpagina publiceren",
    enabledHint: "Niets is openbaar zolang dit vakje niet is aangevinkt. Enkel gevalideerde uitslagen verschijnen.",
    slug: "Adres van de pagina",
    slugHint: "Kleine letters, cijfers en streepjes, bijvoorbeeld « mijn-club ».",
    introText: "Voorstelling",
    blocks: "Getoonde blokken",
    blockLabels: { identity: "Voorstelling van de club", teams: "Ploegen", next_matches: "Volgende wedstrijden", results: "Gevalideerde uitslagen", standings: "Tornooiklassementen", sponsors: "Sponsors" },
    view: "De openbare pagina bekijken",
    ics: "Openbare kalender (ICS)",
    icsHint: "Wedstrijden en open evenementen, zonder enig persoonsgegeven. Los van de privékalender; op elk moment in te trekken.",
    icsNone: "Geen openbare kalender.",
    icsCreate: "De kalenderlink aanmaken",
    icsRevoke: "De link intrekken",
    tournaments: "Gepubliceerde tornooien",
    tournamentsHint: "Kalender, gevalideerde uitslagen en klassementen, op een openbare pagina per tornooi.",
    noTournaments: "Geen tornooi georganiseerd door de club.",
    sponsorsHint: "Sponsors verschijnen als hun formule het voorziet (Financiën › Sponsors › Formules).",
    widgets: "In te bouwen widgets",
    widgetsHint: "Kopieer het fragment in de website van de club. De widgets volgen de kleuren van de club en de gekozen taal.",
    widgetKinds: { next: "Volgende wedstrijd", results: "Laatste uitslagen", standings: "Klassement", registration: "Inschrijving" },
    snippet: "Codefragment",
    needsPage: "Publiceer eerst de clubpagina.",
    consents: "Namen van minderjarige spelers",
    consentsHint: "Een minderjarige speler verschijnt nooit met zijn naam (noch foto) op openbare pagina's zonder uitdrukkelijke toestemming van zijn ouders. Vink pas aan na ontvangst.",
    noMinors: "Geen minderjarige speler.",
    consentLabel: "Toestemming ontvangen om de naam van {name} te publiceren",
    keys: "API-sleutels",
    keysHint: "Enkel lezen, beperkt tot 60 verzoeken per minuut en tot de gekozen rechten. De sleutel wordt maar één keer getoond. Hij stopt wanneer u het voorzitterschap verlaat: de volgende voorzitter maakt zijn eigen sleutels aan.",
    keyName: "Naam van de sleutel",
    scopes: "Rechten",
    scopeLabels: { "read:teams": "Ploegen", "read:matches": "Wedstrijden", "read:tournaments": "Tornooien", "read:events": "Open evenementen" },
    createKey: "Sleutel aanmaken",
    newKey: "Nieuwe sleutel",
    newKeyHint: "Kopieer ze nu: ze wordt niet meer getoond.",
    noKeys: "Geen sleutels.",
    revoke: "Intrekken",
    revoked: "Ingetrokken",
    lastUsed: "Laatst gebruikt: {date}",
    never: "nooit gebruikt",
    docs: "Documentatie (OpenAPI)",
    mcp: "Connector voor uw assistent (MCP)",
    mcpHint: "Koppel uw eigen Claude (of een andere MCP-assistent) aan uw club, alleen-lezen: ploegen, wedstrijden, kalender en, als u dat kiest, de lidgelden op naam. De sleutel geldt zolang u voorzitter bent; ze wordt één keer getoond; hoogstens tien actieve sleutels.",
    mcpScopes: { "club:read": "De club: ploegen, wedstrijden, tornooien, cijfers", "calendar:read": "De kalender (zonder deelnemers)", "dues:read": "De lidgelden, lid per lid" },
    mcpCreate: "De sleutel van de connector aanmaken",
    mcpKeyName: "Naam van de connector",
    mcpNone: "Geen connector.",
    mcpHowTo: "In Claude (Instellingen, Connectors, Externe connector toevoegen) geeft u het adres hieronder en de sleutel als toegangstoken (Bearer).",
    mcpTools: "Tools: cluboverzicht, ploegen, wedstrijden, tornooien, kalender, lidgelden.",
    mcpBy: "aangemaakt door {name}",
    hooks: "Webhooks",
    hooksHint: "Elke verzending is ondertekend (header X-PFM-Signature, HMAC SHA-256 van « tijdstempel.inhoud »), wordt herhaald bij mislukking en behoudt haar id als ze opnieuw wordt verstuurd.",
    url: "HTTPS-adres",
    events: "Gebeurtenissen",
    eventLabels: { "registration.validated": "Inschrijving gevalideerd", "match.validated": "Uitslag gevalideerd", "document.expired": "Document vervallen", "payment.reconciled": "Betaling afgestemd" },
    createHook: "Webhook toevoegen",
    newSecret: "Ondertekeningsgeheim, één keer getoond:",
    noHooks: "Geen webhooks.",
    remove: "Verwijderen",
    journal: "Verzendlogboek",
    noDeliveries: "Geen verzendingen.",
    replay: "Opnieuw versturen",
    states: { pending: "Wachtend", sent: "Verstuurd", failed: "Mislukt" },
    page: {
      teams: "Onze ploegen",
      nextMatches: "Volgende wedstrijden",
      results: "Laatste uitslagen",
      standings: "Klassementen",
      sponsors: "Zij steunen ons",
      noMatches: "Geen wedstrijd gepland.",
      noResults: "Nog geen uitslag.",
      home: "thuis",
      away: "uit",
      corrected: "Uitslag verbeterd op {date}",
      scorers: "Doelpuntenmakers",
      aPlayer: "een speler",
      team: "Ploeg",
      played: "G",
      points: "Ptn",
      goals: "Doelpunten",
      calendar: "Aan mijn agenda toevoegen",
      poweredBy: "Met Powerchair Football Manager",
      notFound: "Deze pagina bestaat niet of is niet gepubliceerd.",
      days: "Speeldagen",
    },
    errors: { SLUG_TAKEN: "Dit adres is al in gebruik.", UNSAFE_URL: "Adres geweigerd: enkel openbare HTTPS.", API_KEY_INVALID: "API-sleutel ontbreekt, is ongeldig of ingetrokken." },
  },
  en: {
    title: "Public page and integrations",
    intro: "The club's showcase for sponsors, funders and families, widgets for its website, a read API and webhooks.",
    loading: "Loading…",
    unavailable: "This page is not available right now.",
    saved: "Saved.",
    save: "Save",
    tabs: { page: "Public page", widgets: "Widgets", consents: "Published names", api: "API", webhooks: "Webhooks" },
    tabsLabel: "Integration sections",
    enabled: "Publish the club's page",
    enabledHint: "Nothing is public until this box is ticked. Only validated results appear.",
    slug: "Page address",
    slugHint: "Lower-case letters, digits and hyphens, for instance « my-club ».",
    introText: "Presentation",
    blocks: "Blocks shown",
    blockLabels: { identity: "Club presentation", teams: "Teams", next_matches: "Next matches", results: "Validated results", standings: "Tournament standings", sponsors: "Sponsors" },
    view: "View the public page",
    ics: "Public calendar (ICS)",
    icsHint: "Matches and open events, without any personal data. Separate from the private calendar; revocable at any time.",
    icsNone: "No public calendar.",
    icsCreate: "Create the calendar link",
    icsRevoke: "Revoke the link",
    tournaments: "Published tournaments",
    tournamentsHint: "Calendar, validated results and standings, on a public page per tournament.",
    noTournaments: "No tournament organised by the club.",
    sponsorsHint: "Sponsors appear when their package says so (Finances › Sponsors › Packages).",
    widgets: "Widgets to embed",
    widgetsHint: "Copy the snippet into the club's website. The widgets follow the club's colours and the chosen language.",
    widgetKinds: { next: "Next match", results: "Latest results", standings: "Standings", registration: "Registration" },
    snippet: "Code snippet",
    needsPage: "Publish the club's page first.",
    consents: "Names of minor players",
    consentsHint: "A minor player never appears by name (nor photo) on public pages without their parents' explicit consent. Tick only once received.",
    noMinors: "No minor player.",
    consentLabel: "Consent received to publish the name of {name}",
    keys: "API keys",
    keysHint: "Read only, limited to 60 requests per minute and to the rights chosen. The key is shown once. It stops when you leave the presidency: the next president creates their own.",
    keyName: "Key name",
    scopes: "Rights",
    scopeLabels: { "read:teams": "Teams", "read:matches": "Matches", "read:tournaments": "Tournaments", "read:events": "Open events" },
    createKey: "Create a key",
    newKey: "New key",
    newKeyHint: "Copy it now: it will not be shown again.",
    noKeys: "No keys.",
    revoke: "Revoke",
    revoked: "Revoked",
    lastUsed: "Last used: {date}",
    never: "never used",
    docs: "Documentation (OpenAPI)",
    mcp: "Connector for your assistant (MCP)",
    mcpHint: "Plug your own Claude (or another MCP assistant) on your club, read only: teams, matches, calendar and, if you choose so, the dues by name. The key lasts while you preside; it is shown once; ten active keys at most.",
    mcpScopes: { "club:read": "The club: teams, matches, tournaments, figures", "calendar:read": "The calendar (without participants)", "dues:read": "The dues, member by member" },
    mcpCreate: "Create the connector's key",
    mcpKeyName: "Connector name",
    mcpNone: "No connector.",
    mcpHowTo: "In Claude (Settings, Connectors, Add remote connector), give the address below and the key as the access token (Bearer).",
    mcpTools: "Tools: club overview, teams, matches, tournaments, calendar, dues.",
    mcpBy: "created by {name}",
    hooks: "Webhooks",
    hooksHint: "Each delivery is signed (header X-PFM-Signature, HMAC SHA-256 of « timestamp.body »), retried on failure, and keeps its id when replayed.",
    url: "HTTPS address",
    events: "Events",
    eventLabels: { "registration.validated": "Registration validated", "match.validated": "Result validated", "document.expired": "Document expired", "payment.reconciled": "Payment reconciled" },
    createHook: "Add the webhook",
    newSecret: "Signing secret, shown once:",
    noHooks: "No webhooks.",
    remove: "Delete",
    journal: "Delivery log",
    noDeliveries: "No deliveries.",
    replay: "Replay",
    states: { pending: "Pending", sent: "Sent", failed: "Failed" },
    page: {
      teams: "Our teams",
      nextMatches: "Next matches",
      results: "Latest results",
      standings: "Standings",
      sponsors: "They support us",
      noMatches: "No match planned.",
      noResults: "No result yet.",
      home: "at home",
      away: "away",
      corrected: "Result corrected on {date}",
      scorers: "Scorers",
      aPlayer: "a player",
      team: "Team",
      played: "P",
      points: "Pts",
      goals: "Goals",
      calendar: "Add to my calendar",
      poweredBy: "With Powerchair Football Manager",
      notFound: "This page does not exist or is not published.",
      days: "Match days",
    },
    errors: { SLUG_TAKEN: "This address is already taken.", UNSAFE_URL: "Address refused: public HTTPS only.", API_KEY_INVALID: "API key missing, invalid or revoked." },
  },
};
