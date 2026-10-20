import type { Locale } from "../lib/locale";
export const equipmentCopy: Record<
  Locale,
  {
    title: string;
    intro: string;
    readOnly: string;
    add: string;
    search: string;
    status: string;
    all: string;
    current: string;
    empty: string;
    emptyOwn: string;
    manage: string;
    close: string;
    newChair: string;
    edit: string;
    name: string;
    brand: string;
    model: string;
    serial: string;
    ownership: string;
    speed: string;
    speedHint: string;
    overSpeed: string;
    battery: string;
    storage: string;
    acquired: string;
    lastService: string;
    nextService: string;
    notes: string;
    save: string;
    saved: string;
    players: string;
    noPlayers: string;
    others: string;
    primary: string;
    primaryHint: string;
    assign: string;
    player: string;
    from: string;
    unlink: string;
    past: string;
    since: string;
    until: string;
    loading: string;
    unavailable: string;
    summaryActive: string;
    summaryInUse: string;
    summaryAvailable: string;
    summaryService: string;
    service: Record<"ok" | "soon" | "due" | "unknown", string>;
    statuses: Record<
      "available" | "in_use" | "maintenance" | "retired",
      string
    >;
    ownerships: Record<"club" | "player" | "loan", string>;
    errors: Record<string, string>;
  }
> = {
  fr: {
    title: "Matériel",
    intro:
      "Fauteuils de sport du club et des joueurs : révisions, vitesse, batteries et joueurs qui les utilisent.",
    readOnly:
      "Vous voyez les fauteuils liés à votre profil. Leur gestion est réservée aux responsables du matériel.",
    add: "Ajouter un fauteuil",
    search: "Rechercher",
    status: "État",
    all: "Tous",
    current: "Hors fauteuils retirés",
    empty: "Aucun fauteuil ne correspond à ces filtres.",
    emptyOwn: "Aucun fauteuil n’est lié à votre profil pour l’instant.",
    manage: "Gérer",
    close: "Fermer",
    newChair: "Nouveau fauteuil",
    edit: "Fiche du fauteuil",
    name: "Nom ou numéro",
    brand: "Marque",
    model: "Modèle",
    serial: "Numéro de série",
    ownership: "Propriété",
    speed: "Vitesse maximale (km/h)",
    speedHint: "Limite en match (règles FIPFA) : 10 km/h.",
    overSpeed: "Au-dessus de 10 km/h",
    battery: "Batteries",
    storage: "Lieu de rangement",
    acquired: "Date d’acquisition",
    lastService: "Dernière révision",
    nextService: "Prochaine révision",
    notes: "Remarques (réglages, protections, accessoires)",
    save: "Enregistrer",
    saved: "Enregistré.",
    players: "Joueurs",
    noPlayers: "Aucun joueur lié.",
    others: "autre(s) joueur(s)",
    primary: "Fauteuil principal",
    primaryHint: "Fauteuil habituel du joueur en match",
    assign: "Lier ce joueur",
    player: "Joueur",
    from: "À partir du",
    unlink: "Retirer",
    past: "Utilisateurs précédents",
    since: "depuis le",
    until: "jusqu’au",
    loading: "Chargement…",
    unavailable: "Le matériel est indisponible pour ce profil.",
    summaryActive: "Fauteuils",
    summaryInUse: "En service",
    summaryAvailable: "Disponibles",
    summaryService: "Révision à prévoir",
    service: {
      ok: "Révision à jour",
      soon: "Révision sous 14 jours",
      due: "Révision à faire",
      unknown: "Révision non planifiée",
    },
    statuses: {
      available: "Disponible",
      in_use: "En service",
      maintenance: "En maintenance",
      retired: "Retiré",
    },
    ownerships: { club: "Club", player: "Joueur", loan: "Prêt" },
    errors: {
      STALE_VERSION:
        "Ce fauteuil a été modifié entre-temps. Actualisez puis recommencez.",
      DUPLICATE: "Ce nom ou ce lien existe déjà.",
      INVALID_TRANSITION: "Un fauteuil retiré ne peut plus être attribué.",
      INVALID_DATE: "Vérifiez l’ordre des dates.",
      CLUB_ONLY: "Le matériel se gère dans le profil d’un club.",
    },
  },
  nl: {
    title: "Materiaal",
    intro:
      "Sportrolstoelen van de club en de spelers: onderhoud, snelheid, batterijen en wie ze gebruikt.",
    readOnly:
      "U ziet de rolstoelen die aan uw profiel gekoppeld zijn. Beheer is voorbehouden aan de materiaalverantwoordelijken.",
    add: "Rolstoel toevoegen",
    search: "Zoeken",
    status: "Status",
    all: "Alle",
    current: "Zonder rolstoelen buiten gebruik",
    empty: "Geen rolstoel voldoet aan deze filters.",
    emptyOwn: "Er is nog geen rolstoel aan uw profiel gekoppeld.",
    manage: "Beheren",
    close: "Sluiten",
    newChair: "Nieuwe rolstoel",
    edit: "Fiche van de rolstoel",
    name: "Naam of nummer",
    brand: "Merk",
    model: "Model",
    serial: "Serienummer",
    ownership: "Eigendom",
    speed: "Maximale snelheid (km/u)",
    speedHint: "Limiet in wedstrijden (FIPFA-regels): 10 km/u.",
    overSpeed: "Boven 10 km/u",
    battery: "Batterijen",
    storage: "Opbergplaats",
    acquired: "Aankoopdatum",
    lastService: "Laatste onderhoud",
    nextService: "Volgend onderhoud",
    notes: "Opmerkingen (afstelling, beschermingen, accessoires)",
    save: "Opslaan",
    saved: "Opgeslagen.",
    players: "Spelers",
    noPlayers: "Geen gekoppelde speler.",
    others: "andere speler(s)",
    primary: "Hoofdrolstoel",
    primaryHint: "Gebruikelijke wedstrijdrolstoel van de speler",
    assign: "Speler koppelen",
    player: "Speler",
    from: "Vanaf",
    unlink: "Ontkoppelen",
    past: "Vorige gebruikers",
    since: "sinds",
    until: "tot",
    loading: "Laden…",
    unavailable: "Materiaal is niet beschikbaar voor dit profiel.",
    summaryActive: "Rolstoelen",
    summaryInUse: "In gebruik",
    summaryAvailable: "Beschikbaar",
    summaryService: "Onderhoud te plannen",
    service: {
      ok: "Onderhoud in orde",
      soon: "Onderhoud binnen 14 dagen",
      due: "Onderhoud nodig",
      unknown: "Onderhoud niet gepland",
    },
    statuses: {
      available: "Beschikbaar",
      in_use: "In gebruik",
      maintenance: "In onderhoud",
      retired: "Buiten gebruik",
    },
    ownerships: { club: "Club", player: "Speler", loan: "Lening" },
    errors: {
      STALE_VERSION:
        "Deze rolstoel werd intussen gewijzigd. Vernieuw en probeer opnieuw.",
      DUPLICATE: "Deze naam of koppeling bestaat al.",
      INVALID_TRANSITION:
        "Een rolstoel buiten gebruik kan niet meer worden toegewezen.",
      INVALID_DATE: "Controleer de volgorde van de datums.",
      CLUB_ONLY: "Materiaal wordt beheerd in een clubprofiel.",
    },
  },
  en: {
    title: "Equipment",
    intro:
      "Club and player sport powerchairs: servicing, speed, batteries and the players who use them.",
    readOnly:
      "You see the chairs linked to your profile. Managing them is reserved for equipment managers.",
    add: "Add a chair",
    search: "Search",
    status: "Status",
    all: "All",
    current: "Excluding retired chairs",
    empty: "No chair matches these filters.",
    emptyOwn: "No chair is linked to your profile yet.",
    manage: "Manage",
    close: "Close",
    newChair: "New chair",
    edit: "Chair record",
    name: "Name or number",
    brand: "Make",
    model: "Model",
    serial: "Serial number",
    ownership: "Ownership",
    speed: "Maximum speed (km/h)",
    speedHint: "Match limit (FIPFA laws): 10 km/h.",
    overSpeed: "Above 10 km/h",
    battery: "Batteries",
    storage: "Storage place",
    acquired: "Acquired on",
    lastService: "Last service",
    nextService: "Next service",
    notes: "Notes (settings, guards, accessories)",
    save: "Save",
    saved: "Saved.",
    players: "Players",
    noPlayers: "No linked player.",
    others: "other player(s)",
    primary: "Main chair",
    primaryHint: "The player's usual match chair",
    assign: "Link this player",
    player: "Player",
    from: "From",
    unlink: "Remove",
    past: "Previous users",
    since: "since",
    until: "until",
    loading: "Loading…",
    unavailable: "Equipment is unavailable for this profile.",
    summaryActive: "Chairs",
    summaryInUse: "In use",
    summaryAvailable: "Available",
    summaryService: "Service to plan",
    service: {
      ok: "Service up to date",
      soon: "Service within 14 days",
      due: "Service needed",
      unknown: "No service planned",
    },
    statuses: {
      available: "Available",
      in_use: "In use",
      maintenance: "In maintenance",
      retired: "Retired",
    },
    ownerships: { club: "Club", player: "Player", loan: "Loan" },
    errors: {
      STALE_VERSION:
        "This chair was changed in the meantime. Refresh and try again.",
      DUPLICATE: "This name or link already exists.",
      INVALID_TRANSITION: "A retired chair can no longer be assigned.",
      INVALID_DATE: "Check the order of the dates.",
      CLUB_ONLY: "Equipment is managed in a club profile.",
    },
  },
};
