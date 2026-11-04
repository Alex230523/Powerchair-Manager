/** Wave 16 (A): « À faire » in fixed squares, the club status, the presence badges. */
const fr = {
  upToDate: "À jour",
  /** The accessible name of a square: « Documents : à jour », « Documents : 3 ». */
  name: (title: string, count: number) => (count ? `${title} : ${count}` : `${title} : à jour`),
  also: "Aussi :",
  expiring: (n: number) => (n === 1 ? "1 document expire sous 30 jours" : `${n} documents expirent sous 30 jours`),
  titles: {
    documents: { title: "Documents", text: "Expirés ou manquants" },
    moneyTasks: { title: "Sponsors et subsides", text: "Conditions et étapes à faire" },
    clubStatus: { title: "Statut du club", text: "Obligations de l'année" },
  },
  statusProgress: (d: number, t: number) => `${d} sur ${t}`,
  statusEmpty: "Aucune obligation enregistrée : préparez la liste",
  statusDue: (date: string) => `pour le ${date}`,
  chairsService: (n: number) => (n === 1 ? "dont 1 en entretien" : `dont ${n} en entretien`),
  splitTitle: "Joueurs par classification",
  splitOther: "Pas encore classés",
  presence: (players: number, playersWord: string, coaches: number, coachesWord: string) => `Joueurs : ${players}, ${playersWord}. Coachs : ${coaches}, ${coachesWord}.`,
  playersCount: (n: number) => (n === 1 ? "1 joueur" : `${n} joueurs`),
  coachesCount: (n: number) => (n === 1 ? "1 coach" : `${n} coachs`),
};
type Copy = typeof fr;
const nl: Copy = {
  upToDate: "In orde",
  name: (title: string, count: number) => (count ? `${title}: ${count}` : `${title}: in orde`),
  also: "Ook:",
  expiring: (n: number) => (n === 1 ? "1 document verloopt binnen 30 dagen" : `${n} documenten verlopen binnen 30 dagen`),
  titles: {
    documents: { title: "Documenten", text: "Verlopen of ontbrekend" },
    moneyTasks: { title: "Sponsors en subsidies", text: "Voorwaarden en stappen te doen" },
    clubStatus: { title: "Statuut van de club", text: "Verplichtingen van het jaar" },
  },
  statusProgress: (d: number, t: number) => `${d} van ${t}`,
  statusEmpty: "Nog geen verplichtingen: bereid de lijst voor",
  statusDue: (date: string) => `tegen ${date}`,
  chairsService: (n: number) => (n === 1 ? "waarvan 1 in onderhoud" : `waarvan ${n} in onderhoud`),
  splitTitle: "Spelers per classificatie",
  splitOther: "Nog niet geclassificeerd",
  presence: (players: number, playersWord: string, coaches: number, coachesWord: string) => `Spelers: ${players}, ${playersWord}. Coaches: ${coaches}, ${coachesWord}.`,
  playersCount: (n: number) => (n === 1 ? "1 speler" : `${n} spelers`),
  coachesCount: (n: number) => (n === 1 ? "1 coach" : `${n} coaches`),
};
const en: Copy = {
  upToDate: "Up to date",
  name: (title: string, count: number) => (count ? `${title}: ${count}` : `${title}: up to date`),
  also: "Also:",
  expiring: (n: number) => (n === 1 ? "1 document expires within 30 days" : `${n} documents expire within 30 days`),
  titles: {
    documents: { title: "Documents", text: "Expired or missing" },
    moneyTasks: { title: "Sponsors and grants", text: "Conditions and steps to do" },
    clubStatus: { title: "Club status", text: "This year's obligations" },
  },
  statusProgress: (d: number, t: number) => `${d} of ${t}`,
  statusEmpty: "No obligation recorded yet: prepare the list",
  statusDue: (date: string) => `by ${date}`,
  chairsService: (n: number) => (n === 1 ? "1 of them in service" : `${n} of them in service`),
  splitTitle: "Players by classification",
  splitOther: "Not classified yet",
  presence: (players: number, playersWord: string, coaches: number, coachesWord: string) => `Players: ${players}, ${playersWord}. Coaches: ${coaches}, ${coachesWord}.`,
  playersCount: (n: number) => (n === 1 ? "1 player" : `${n} players`),
  coachesCount: (n: number) => (n === 1 ? "1 coach" : `${n} coaches`),
};
export const boardCopy = { fr, nl, en };
