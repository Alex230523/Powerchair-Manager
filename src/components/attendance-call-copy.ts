/** Wave 17 (J2): the roll call, one session at a time, and the statistics per player. */
type Copy = {
  tabs: string;
  call: string;
  season: string;
  stats: string;
  allPresent: string;
  allDone: string;
  session: string;
  older: string;
  newer: string;
  average: string;
  noAverage: string;
  answered: Record<"present" | "absent" | "uncertain" | "none", string>;
  segments: Record<"present" | "absent" | "excused" | "unchecked", string>;
  markOf: string;
  moreOf: string;
  late: string;
  early: string;
  close: string;
  closeHint: string;
  closed: string;
  correction: string;
  reason: string;
  confirm: string;
  cancel: string;
  saved: string;
  noSession: string;
  noInvited: string;
  loading: string;
  sortBy: string;
  byRate: string;
  byName: string;
  training: string;
  matches: string;
  excused: string;
  averageLabel: string;
  period: string;
  noStats: string;
};

export const callCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    tabs: "Vues des présences",
    call: "Appel",
    season: "Saison",
    stats: "Statistiques",
    allPresent: "Tout présent",
    allDone: "{n} personne(s) pointée(s) présente(s).",
    session: "Séance",
    older: "Séances plus anciennes",
    newer: "Séances plus récentes",
    average: "Moyenne {n} %",
    noAverage: "Pas encore de moyenne",
    answered: { present: "A répondu : présent", absent: "A répondu : absent", uncertain: "A répondu : incertain", none: "Pas de réponse" },
    segments: { present: "Présent", absent: "Absent", excused: "Excusé", unchecked: "Non pointé" },
    markOf: "Présence de {name}",
    moreOf: "Autres choix pour {name}",
    late: "En retard",
    early: "Parti plus tôt",
    close: "Clôturer l'appel",
    closeHint: "Chaque clic est enregistré. Clôturez quand tout le monde est pointé.",
    closed: "Appel clôturé : une correction demande un motif et reste tracée.",
    correction: "Corriger après clôture : {name}",
    reason: "Motif de la correction",
    confirm: "Enregistrer la correction",
    cancel: "Annuler",
    saved: "Enregistré.",
    noSession: "Aucune séance commencée à pointer pour cette équipe sur la saison.",
    noInvited: "Personne n'est invité à cette séance.",
    loading: "Chargement…",
    sortBy: "Trier par",
    byRate: "Pourcentage",
    byName: "Nom",
    training: "Entraînements : {a} / {c}",
    matches: "Matchs : {a} / {c}",
    excused: "Excusé(s) : {n}",
    averageLabel: "Présence moyenne",
    period: "Saison {name}, appels clôturés.",
    noStats: "Aucun appel clôturé sur cette saison.",
  },
  nl: {
    tabs: "Weergaven van de aanwezigheden",
    call: "Afroepen",
    season: "Seizoen",
    stats: "Statistieken",
    allPresent: "Iedereen aanwezig",
    allDone: "{n} persoon/personen als aanwezig geregistreerd.",
    session: "Sessie",
    older: "Oudere sessies",
    newer: "Recentere sessies",
    average: "Gemiddeld {n} %",
    noAverage: "Nog geen gemiddelde",
    answered: { present: "Antwoordde: aanwezig", absent: "Antwoordde: afwezig", uncertain: "Antwoordde: onzeker", none: "Geen antwoord" },
    segments: { present: "Aanwezig", absent: "Afwezig", excused: "Verontschuldigd", unchecked: "Niet geregistreerd" },
    markOf: "Aanwezigheid van {name}",
    moreOf: "Andere keuzes voor {name}",
    late: "Te laat",
    early: "Vroeger vertrokken",
    close: "Afroepen afsluiten",
    closeHint: "Elke klik wordt opgeslagen. Sluit af zodra iedereen geregistreerd is.",
    closed: "Afroepen afgesloten: een correctie vraagt een reden en blijft bewaard.",
    correction: "Corrigeren na afsluiting: {name}",
    reason: "Reden van de correctie",
    confirm: "Correctie opslaan",
    cancel: "Annuleren",
    saved: "Opgeslagen.",
    noSession: "Geen begonnen sessie om af te roepen voor dit team in dit seizoen.",
    noInvited: "Niemand is uitgenodigd voor deze sessie.",
    loading: "Laden…",
    sortBy: "Sorteren op",
    byRate: "Percentage",
    byName: "Naam",
    training: "Trainingen: {a} / {c}",
    matches: "Wedstrijden: {a} / {c}",
    excused: "Verontschuldigd: {n}",
    averageLabel: "Gemiddelde aanwezigheid",
    period: "Seizoen {name}, afgesloten registers.",
    noStats: "Nog geen afgesloten register in dit seizoen.",
  },
  en: {
    tabs: "Attendance views",
    call: "Roll call",
    season: "Season",
    stats: "Statistics",
    allPresent: "All present",
    allDone: "{n} person(s) marked present.",
    session: "Session",
    older: "Older sessions",
    newer: "More recent sessions",
    average: "Average {n} %",
    noAverage: "No average yet",
    answered: { present: "Answered: present", absent: "Answered: absent", uncertain: "Answered: uncertain", none: "No answer" },
    segments: { present: "Present", absent: "Absent", excused: "Excused", unchecked: "Not marked" },
    markOf: "Attendance of {name}",
    moreOf: "More choices for {name}",
    late: "Late",
    early: "Left early",
    close: "Close the roll call",
    closeHint: "Each click is saved. Close once everyone is marked.",
    closed: "Roll call closed: a correction needs a reason and is kept.",
    correction: "Correct after closing: {name}",
    reason: "Reason for the correction",
    confirm: "Save the correction",
    cancel: "Cancel",
    saved: "Saved.",
    noSession: "No started session to call for this team this season.",
    noInvited: "Nobody is invited to this session.",
    loading: "Loading…",
    sortBy: "Sort by",
    byRate: "Percentage",
    byName: "Name",
    training: "Trainings: {a} / {c}",
    matches: "Matches: {a} / {c}",
    excused: "Excused: {n}",
    averageLabel: "Average attendance",
    period: "Season {name}, closed registers.",
    noStats: "No closed register this season yet.",
  },
};
