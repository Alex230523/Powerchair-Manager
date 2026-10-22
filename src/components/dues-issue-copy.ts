/** A3: the issue wizard, the empty state and the automatic issue on acceptance. */
type Copy = {
  open: string;
  title: string;
  steps: [string, string, string];
  stepOf: string;
  next: string;
  back: string;
  cancel: string;
  planStep: string;
  existing: string;
  createPlan: string;
  noPlanYet: string;
  season: string;
  category: string;
  amount: string;
  maxInstallments: string;
  firstDue: string;
  second: string;
  following: string;
  whoStep: string;
  who: Record<"person" | "team" | "season" | "admitted", string>;
  person: string;
  team: string;
  noTeam: string;
  noAdmitted: string;
  installments: string;
  showPreview: string;
  cols: Record<"include" | "name" | "gross" | "discount" | "net" | "exempt", string>;
  covered: string;
  includeOf: string;
  exemptOf: string;
  reasonOf: string;
  reasonHelp: string;
  nobody: string;
  confirmStep: string;
  summary: string;
  total: string;
  notify: string;
  notifyHelp: string;
  issue: string;
  issued: string;
  emptySeason: string;
  autoTitle: string;
  autoIntro: string;
  autoNone: string;
  autoLabel: string;
  autoSave: string;
  errors: Record<string, string>;
  unavailable: string;
};

export const duesIssueCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    open: "Émettre des cotisations",
    title: "Émettre des cotisations",
    steps: ["Barème", "Qui", "Confirmer"],
    stepOf: "Étape {n} sur 3 : {name}",
    next: "Suivant",
    back: "Retour",
    cancel: "Fermer",
    planStep: "Quel barème ?",
    existing: "{category} · {season} · {amount}",
    createPlan: "Créer un barème",
    noPlanYet: "Aucun barème pour l'instant : créez-le ici, il sera aussi dans Réglages › Argent.",
    season: "Saison",
    category: "Catégorie (par exemple « Joueur »)",
    amount: "Montant (€)",
    maxInstallments: "Nombre maximum de versements",
    firstDue: "Première échéance",
    second: "Réduction fratrie, 2e enfant (%)",
    following: "Réduction fratrie, 3e enfant et suivants (%)",
    whoStep: "Pour qui ?",
    who: { person: "Une personne", team: "Une équipe", season: "Tous les joueurs actifs de la saison", admitted: "Les nouveaux admis (inscriptions acceptées)" },
    person: "Personne",
    team: "Équipe",
    noTeam: "Aucune équipe pour la saison de ce barème.",
    noAdmitted: "Aucune admission n'attend sa cotisation.",
    installments: "Nombre de versements",
    showPreview: "Voir l'aperçu",
    cols: { include: "Émettre", name: "Nom", gross: "Montant", discount: "Réduction", net: "À payer", exempt: "Exonérer" },
    covered: "Déjà couverte",
    includeOf: "Émettre pour {name}",
    exemptOf: "Exonérer {name}",
    reasonOf: "Motif de l'exonération de {name}",
    reasonHelp: "Au moins 5 caractères.",
    nobody: "Personne à qui émettre.",
    confirmStep: "Vérifier et émettre",
    summary: "{n} cotisation(s) seront émises, {skipped} personne(s) laissée(s) de côté.",
    total: "Total à percevoir : {amount}",
    notify: "Envoyer un email à chaque famille (montant et échéancier)",
    notifyHelp: "Le joueur adulte et les parents qui ont un compte le reçoivent.",
    issue: "Émettre",
    issued: "{n} cotisation(s) émise(s).",
    emptySeason: "Aucune cotisation émise pour cette saison.",
    autoTitle: "Émission à l'acceptation d'une inscription",
    autoIntro: "Quand une inscription est acceptée, la cotisation de ce barème est émise toute seule (sauf si la personne en a déjà une).",
    autoNone: "Ne rien émettre automatiquement",
    autoLabel: "Barème émis automatiquement",
    autoSave: "Enregistrer",
    errors: {
      INVALID_INPUT: "Vérifiez les champs : un motif d'au moins 5 caractères pour chaque exonération.",
      NOT_FOUND: "Ce barème ou cette équipe n'existe plus.",
      DUPLICATE: "Une de ces personnes a déjà une cotisation de cette catégorie.",
    },
    unavailable: "Action impossible pour le moment.",
  },
  nl: {
    open: "Lidgelden aanmaken",
    title: "Lidgelden aanmaken",
    steps: ["Tarief", "Wie", "Bevestigen"],
    stepOf: "Stap {n} van 3: {name}",
    next: "Volgende",
    back: "Terug",
    cancel: "Sluiten",
    planStep: "Welk tarief?",
    existing: "{category} · {season} · {amount}",
    createPlan: "Een tarief aanmaken",
    noPlanYet: "Nog geen tarief: maak het hier aan, het staat ook in Instellingen › Geld.",
    season: "Seizoen",
    category: "Categorie (bijvoorbeeld « Speler »)",
    amount: "Bedrag (€)",
    maxInstallments: "Maximum aantal betalingen",
    firstDue: "Eerste vervaldag",
    second: "Gezinskorting, 2e kind (%)",
    following: "Gezinskorting, 3e kind en volgende (%)",
    whoStep: "Voor wie?",
    who: { person: "Eén persoon", team: "Een team", season: "Alle actieve spelers van het seizoen", admitted: "De nieuw toegelaten (aanvaarde inschrijvingen)" },
    person: "Persoon",
    team: "Team",
    noTeam: "Geen team voor het seizoen van dit tarief.",
    noAdmitted: "Geen toelating wacht op zijn lidgeld.",
    installments: "Aantal betalingen",
    showPreview: "Voorbeeld tonen",
    cols: { include: "Aanmaken", name: "Naam", gross: "Bedrag", discount: "Korting", net: "Te betalen", exempt: "Vrijstellen" },
    covered: "Al gedekt",
    includeOf: "Aanmaken voor {name}",
    exemptOf: "{name} vrijstellen",
    reasonOf: "Reden van de vrijstelling van {name}",
    reasonHelp: "Minstens 5 tekens.",
    nobody: "Niemand om voor aan te maken.",
    confirmStep: "Nakijken en aanmaken",
    summary: "{n} lidgeld(en) worden aangemaakt, {skipped} persoon/personen overgeslagen.",
    total: "Totaal te ontvangen: {amount}",
    notify: "Elk gezin een e-mail sturen (bedrag en betalingsplan)",
    notifyHelp: "De volwassen speler en de ouders met een account ontvangen hem.",
    issue: "Aanmaken",
    issued: "{n} lidgeld(en) aangemaakt.",
    emptySeason: "Nog geen lidgeld aangemaakt voor dit seizoen.",
    autoTitle: "Aanmaken bij aanvaarding van een inschrijving",
    autoIntro: "Wanneer een inschrijving aanvaard wordt, wordt het lidgeld van dit tarief vanzelf aangemaakt (behalve als de persoon er al een heeft).",
    autoNone: "Niets automatisch aanmaken",
    autoLabel: "Automatisch aangemaakt tarief",
    autoSave: "Opslaan",
    errors: {
      INVALID_INPUT: "Controleer de velden: een reden van minstens 5 tekens voor elke vrijstelling.",
      NOT_FOUND: "Dit tarief of dit team bestaat niet meer.",
      DUPLICATE: "Een van deze personen heeft al een lidgeld van deze categorie.",
    },
    unavailable: "Actie momenteel niet mogelijk.",
  },
  en: {
    open: "Issue membership fees",
    title: "Issue membership fees",
    steps: ["Rate", "Who", "Confirm"],
    stepOf: "Step {n} of 3: {name}",
    next: "Next",
    back: "Back",
    cancel: "Close",
    planStep: "Which rate?",
    existing: "{category} · {season} · {amount}",
    createPlan: "Create a rate",
    noPlanYet: "No rate yet: create it here, it will also be in Settings › Money.",
    season: "Season",
    category: "Category (for example « Player »)",
    amount: "Amount (€)",
    maxInstallments: "Maximum number of payments",
    firstDue: "First due date",
    second: "Sibling discount, 2nd child (%)",
    following: "Sibling discount, 3rd child and next (%)",
    whoStep: "For whom?",
    who: { person: "One person", team: "A team", season: "All active players of the season", admitted: "The newly admitted (accepted registrations)" },
    person: "Person",
    team: "Team",
    noTeam: "No team for this rate's season.",
    noAdmitted: "No admission is waiting for its fee.",
    installments: "Number of payments",
    showPreview: "Show the preview",
    cols: { include: "Issue", name: "Name", gross: "Amount", discount: "Discount", net: "To pay", exempt: "Exempt" },
    covered: "Already covered",
    includeOf: "Issue for {name}",
    exemptOf: "Exempt {name}",
    reasonOf: "Reason for exempting {name}",
    reasonHelp: "At least 5 characters.",
    nobody: "Nobody to issue for.",
    confirmStep: "Check and issue",
    summary: "{n} fee(s) will be issued, {skipped} person(s) left aside.",
    total: "Total to collect: {amount}",
    notify: "Send an email to each family (amount and schedule)",
    notifyHelp: "The adult player and the parents with an account receive it.",
    issue: "Issue",
    issued: "{n} fee(s) issued.",
    emptySeason: "No membership fee issued for this season yet.",
    autoTitle: "Issue when a registration is accepted",
    autoIntro: "When a registration is accepted, the fee of this rate is issued by itself (unless the person already has one).",
    autoNone: "Issue nothing automatically",
    autoLabel: "Rate issued automatically",
    autoSave: "Save",
    errors: {
      INVALID_INPUT: "Check the fields: a reason of at least 5 characters for each exemption.",
      NOT_FOUND: "This rate or this team no longer exists.",
      DUPLICATE: "One of these people already has a fee of this category.",
    },
    unavailable: "Action not possible right now.",
  },
};
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
