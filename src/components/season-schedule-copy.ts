import type { Locale } from "@/lib/locale";
import type { PublicHolidayKey } from "@/domains/calendar/holidays";

/** H9: « Planifier la saison », holidays of reference and closures (fr, nl, en). */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  error: string;
  forbidden: string;
  referenceTitle: string;
  referenceText: string;
  communities: Record<"fwb" | "vl", string>;
  saveReference: string;
  holidaysTitle: string;
  origin: Record<"reference" | "federation" | "club", string>;
  hide: string;
  addHoliday: string;
  holidayName: string;
  community: string;
  schoolYear: string;
  from: string;
  to: string;
  replaces: string;
  replacesNone: string;
  closuresTitle: string;
  closuresText: string;
  closurePlace: string;
  closureClub: string;
  closureLabel: string;
  addClosure: string;
  remove: string;
  noClosure: string;
  planTitle: string;
  planText: string;
  season: string;
  team: string;
  weekday: string;
  weekdays: string[];
  start: string;
  end: string;
  place: string;
  noPlace: string;
  type: string;
  noType: string;
  responsible: string;
  sessionTitle: string;
  defaultTitle: string;
  addSlot: string;
  removeSlot: string;
  preview: string;
  kept: string;
  skipped: string;
  reactivate: string;
  reactivated: string;
  publicHolidays: Record<PublicHolidayKey, string>;
  closed: string;
  email: string;
  emailHint: string;
  create: string;
  created: string;
  existing: string;
  failed: string;
  errors: Record<string, string>;
  planned: string;
  sessions: string;
  noPlanned: string;
  seriesHint: string;
  open: string;
  settingsText: string;
};
const fr: Copy = {
  title: "Planifier la saison",
  intro: "Les entraînements de toute la saison en une fois : congés scolaires, jours fériés et fermetures retirés d'office, chaque date sautée expliquée.",
  loading: "Chargement du planificateur…",
  error: "Le planificateur n'a pas pu être chargé. Réessayez dans un instant.",
  forbidden: "Réservé à qui gère le calendrier du club.",
  referenceTitle: "Congés scolaires de référence",
  referenceText: "La Fédération Wallonie-Bruxelles et la Flandre n'ont plus les mêmes vacances. Un club mixte peut suivre les deux.",
  communities: { fwb: "Fédération Wallonie-Bruxelles", vl: "Communauté flamande" },
  saveReference: "Enregistrer la référence",
  holidaysTitle: "Congés de l'année scolaire",
  origin: { reference: "Calendrier officiel", federation: "Fédération", club: "Correction du club" },
  hide: "Retirer",
  addHoliday: "Ajouter ou corriger un congé",
  holidayName: "Nom du congé",
  community: "Communauté",
  schoolYear: "Année scolaire",
  from: "Du",
  to: "Au",
  replaces: "Remplace",
  replacesNone: "Rien (nouveau congé)",
  closuresTitle: "Fermetures",
  closuresText: "Les périodes où un lieu est fermé (été, travaux) ou où le club fait une pause.",
  closurePlace: "Lieu",
  closureClub: "Tout le club",
  closureLabel: "Motif",
  addClosure: "Ajouter la fermeture",
  remove: "Supprimer",
  noClosure: "Aucune fermeture.",
  planTitle: "Créneaux de la saison",
  planText: "Un créneau par équipe et par jour : chaque date de la saison est proposée, sauf les congés, jours fériés et fermetures, que vous pouvez réactiver une à une.",
  season: "Saison",
  team: "Équipe",
  weekday: "Jour",
  weekdays: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
  start: "Début",
  end: "Fin",
  place: "Lieu",
  noPlace: "Aucun lieu",
  type: "Type d'activité",
  noType: "Entraînement",
  responsible: "Responsable",
  sessionTitle: "Titre des séances",
  defaultTitle: "Entraînement",
  addSlot: "Ajouter un créneau",
  removeSlot: "Retirer ce créneau",
  preview: "Voir les dates",
  kept: "{n} séance(s)",
  skipped: "{n} date(s) sautée(s)",
  reactivate: "Réactiver",
  reactivated: "réactivée",
  publicHolidays: {
    newYear: "Nouvel An",
    easterMonday: "Lundi de Pâques",
    labourDay: "Fête du Travail",
    ascension: "Ascension",
    whitMonday: "Lundi de Pentecôte",
    nationalDay: "Fête nationale",
    assumption: "Assomption",
    allSaints: "Toussaint",
    armistice: "Armistice",
    christmas: "Noël",
  },
  closed: "Fermé : {label}",
  email: "Envoyer l'email « Calendrier de la saison » aux familles des équipes",
  emailHint: "Avec le lien pour ajouter les séances à l'agenda du téléphone.",
  create: "Créer les séances",
  created: "{n} créneau(x) créé(s).",
  existing: "déjà planifié, rien de recréé",
  failed: "non créé : {reason}",
  errors: {
    INVALID_DATE: "Vérifiez les dates : dans la saison, et la fin après le début.",
    PLACE_CONFLICT: "Le lieu est déjà occupé à l'une de ces dates.",
    NO_DATE: "aucune date à créer",
    TOO_MANY: "plus de 52 séances : coupez la période en deux",
    SEASON_RANGE: "en dehors de la saison de l'équipe",
  },
  planned: "Déjà planifié",
  sessions: "{n} séance(s)",
  noPlanned: "Aucun créneau planifié.",
  seriesHint: "Pour changer toutes les séances futures d'un créneau (salle perdue, nouvel horaire), ouvrez une séance dans l'Agenda et choisissez « Occurrences standard suivantes » : les personnes concernées sont prévenues.",
  open: "Planifier la saison",
  settingsText: "Les congés scolaires de référence (Wallonie-Bruxelles, Flandre ou les deux), les fermetures et le planificateur de saison.",
};
const nl: Copy = {
  title: "Het seizoen plannen",
  intro: "De trainingen van het hele seizoen in één keer: schoolvakanties, feestdagen en sluitingen meteen weggelaten, elke overgeslagen datum uitgelegd.",
  loading: "De planner wordt geladen…",
  error: "De planner kon niet worden geladen. Probeer het zo meteen opnieuw.",
  forbidden: "Voorbehouden aan wie de kalender van de club beheert.",
  referenceTitle: "Schoolvakanties als referentie",
  referenceText: "De Federatie Wallonië-Brussel en Vlaanderen hebben niet meer dezelfde vakanties. Een gemengde club kan beide volgen.",
  communities: { fwb: "Federatie Wallonië-Brussel", vl: "Vlaamse Gemeenschap" },
  saveReference: "Referentie opslaan",
  holidaysTitle: "Vakanties van het schooljaar",
  origin: { reference: "Officiële kalender", federation: "Federatie", club: "Correctie van de club" },
  hide: "Weglaten",
  addHoliday: "Een vakantie toevoegen of verbeteren",
  holidayName: "Naam van de vakantie",
  community: "Gemeenschap",
  schoolYear: "Schooljaar",
  from: "Van",
  to: "Tot",
  replaces: "Vervangt",
  replacesNone: "Niets (nieuwe vakantie)",
  closuresTitle: "Sluitingen",
  closuresText: "De periodes waarin een locatie gesloten is (zomer, werken) of de club pauzeert.",
  closurePlace: "Locatie",
  closureClub: "De hele club",
  closureLabel: "Reden",
  addClosure: "Sluiting toevoegen",
  remove: "Verwijderen",
  noClosure: "Geen sluiting.",
  planTitle: "Tijdsloten van het seizoen",
  planText: "Eén tijdslot per team en per dag: elke datum van het seizoen wordt voorgesteld, behalve vakanties, feestdagen en sluitingen, die u één voor één kunt heractiveren.",
  season: "Seizoen",
  team: "Team",
  weekday: "Dag",
  weekdays: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
  start: "Begin",
  end: "Einde",
  place: "Locatie",
  noPlace: "Geen locatie",
  type: "Soort activiteit",
  noType: "Training",
  responsible: "Verantwoordelijke",
  sessionTitle: "Titel van de sessies",
  defaultTitle: "Training",
  addSlot: "Een tijdslot toevoegen",
  removeSlot: "Dit tijdslot weghalen",
  preview: "De data bekijken",
  kept: "{n} sessie(s)",
  skipped: "{n} datum/data overgeslagen",
  reactivate: "Heractiveren",
  reactivated: "geheractiveerd",
  publicHolidays: {
    newYear: "Nieuwjaar",
    easterMonday: "Paasmaandag",
    labourDay: "Dag van de Arbeid",
    ascension: "Hemelvaart",
    whitMonday: "Pinkstermaandag",
    nationalDay: "Nationale feestdag",
    assumption: "Onze-Lieve-Vrouw-Hemelvaart",
    allSaints: "Allerheiligen",
    armistice: "Wapenstilstand",
    christmas: "Kerstmis",
  },
  closed: "Gesloten: {label}",
  email: "De e-mail « Kalender van het seizoen » naar de gezinnen van de teams sturen",
  emailHint: "Met de link om de sessies aan de agenda van de telefoon toe te voegen.",
  create: "De sessies aanmaken",
  created: "{n} tijdslot(en) aangemaakt.",
  existing: "al gepland, niets opnieuw aangemaakt",
  failed: "niet aangemaakt: {reason}",
  errors: {
    INVALID_DATE: "Controleer de data: binnen het seizoen, en het einde na het begin.",
    PLACE_CONFLICT: "De locatie is op een van die data al bezet.",
    NO_DATE: "geen datum om aan te maken",
    TOO_MANY: "meer dan 52 sessies: splits de periode in twee",
    SEASON_RANGE: "buiten het seizoen van het team",
  },
  planned: "Al gepland",
  sessions: "{n} sessie(s)",
  noPlanned: "Nog geen tijdslot gepland.",
  seriesHint: "Om alle toekomstige sessies van een tijdslot te wijzigen (zaal kwijt, nieuw uur), opent u een sessie in de Agenda en kiest u « Volgende gewone gebeurtenissen »: de betrokkenen worden verwittigd.",
  open: "Het seizoen plannen",
  settingsText: "De schoolvakanties als referentie (Wallonië-Brussel, Vlaanderen of beide), de sluitingen en de seizoensplanner.",
};
const en: Copy = {
  title: "Plan the season",
  intro: "The whole season's trainings at once: school holidays, public holidays and closures left out, each skipped date explained.",
  loading: "Loading the planner…",
  error: "The planner could not be loaded. Try again in a moment.",
  forbidden: "For those who manage the club's calendar.",
  referenceTitle: "School holidays of reference",
  referenceText: "The Wallonia-Brussels Federation and Flanders no longer have the same holidays. A mixed club can follow both.",
  communities: { fwb: "Wallonia-Brussels Federation", vl: "Flemish Community" },
  saveReference: "Save the reference",
  holidaysTitle: "Holidays of the school year",
  origin: { reference: "Official calendar", federation: "Federation", club: "Club's correction" },
  hide: "Remove",
  addHoliday: "Add or correct a holiday",
  holidayName: "Holiday name",
  community: "Community",
  schoolYear: "School year",
  from: "From",
  to: "To",
  replaces: "Replaces",
  replacesNone: "Nothing (new holiday)",
  closuresTitle: "Closures",
  closuresText: "The periods when a place is closed (summer, works) or the club takes a break.",
  closurePlace: "Place",
  closureClub: "The whole club",
  closureLabel: "Reason",
  addClosure: "Add the closure",
  remove: "Remove",
  noClosure: "No closure.",
  planTitle: "The season's slots",
  planText: "One slot per team and per day: every date of the season is proposed, except holidays, public holidays and closures, which you can bring back one by one.",
  season: "Season",
  team: "Team",
  weekday: "Day",
  weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  start: "Start",
  end: "End",
  place: "Place",
  noPlace: "No place",
  type: "Activity type",
  noType: "Training",
  responsible: "Person in charge",
  sessionTitle: "Sessions' title",
  defaultTitle: "Training",
  addSlot: "Add a slot",
  removeSlot: "Remove this slot",
  preview: "See the dates",
  kept: "{n} session(s)",
  skipped: "{n} date(s) skipped",
  reactivate: "Bring back",
  reactivated: "brought back",
  publicHolidays: {
    newYear: "New Year's Day",
    easterMonday: "Easter Monday",
    labourDay: "Labour Day",
    ascension: "Ascension Day",
    whitMonday: "Whit Monday",
    nationalDay: "National Day",
    assumption: "Assumption",
    allSaints: "All Saints' Day",
    armistice: "Armistice Day",
    christmas: "Christmas",
  },
  closed: "Closed: {label}",
  email: "Send the “Season calendar” email to the teams' families",
  emailHint: "With the link to add the sessions to the phone's calendar.",
  create: "Create the sessions",
  created: "{n} slot(s) created.",
  existing: "already planned, nothing created again",
  failed: "not created: {reason}",
  errors: {
    INVALID_DATE: "Check the dates: within the season, and the end after the start.",
    PLACE_CONFLICT: "The place is already taken on one of these dates.",
    NO_DATE: "no date to create",
    TOO_MANY: "more than 52 sessions: split the period in two",
    SEASON_RANGE: "outside the team's season",
  },
  planned: "Already planned",
  sessions: "{n} session(s)",
  noPlanned: "No slot planned yet.",
  seriesHint: "To change every future session of a slot (hall lost, new time), open a session in the Calendar and choose “Following standard occurrences”: the people concerned are told.",
  open: "Plan the season",
  settingsText: "The school holidays of reference (Wallonia-Brussels, Flanders or both), the closures and the season planner.",
};
export const seasonScheduleCopy: Record<Locale, Copy> = { fr, nl, en };
