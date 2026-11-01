import type { RuleKey } from "@/domains/automations/catalog";

/** B7: the automations of the club, in Réglages › Notifications. */
type Copy = {
  title: string;
  intro: string;
  stopped: string;
  running: string;
  stop: string;
  resume: string;
  stopHint: string;
  rules: Record<RuleKey, { name: string; when: string }>;
  builtin: string;
  builtinHint: string;
  moduleOff: string;
  enabled: string;
  paused: string;
  delay: string;
  delayUnit: Partial<Record<RuleKey, string>>;
  recipients: string;
  recipientLabels: Record<"person" | "president" | "responsible", string>;
  actions: string;
  actionLabels: Record<"notify" | "email" | "task", string>;
  message: string;
  messageHint: string;
  subject: string;
  body: string;
  languages: Record<"fr" | "nl" | "en", string>;
  save: string;
  saveOf: string;
  saved: string;
  simulate: string;
  simulateHint: string;
  simulation: string;
  simulationEmpty: string;
  colRule: string;
  colAbout: string;
  colRecipient: string;
  colActions: string;
  colState: string;
  already: string;
  toDo: string;
  journal: string;
  journalEmpty: string;
  colWhen: string;
  colResult: string;
  results: Record<"sent" | "task" | "error" | "done", string>;
  everyone: string;
};

export const automationsCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Automatisations",
    intro: "Les rappels que l'application envoie seule. Chacun s'active, se met en pause et se simule avant d'envoyer quoi que ce soit ; un même rappel ne part jamais deux fois.",
    stopped: "Tout est à l'arrêt : aucune automatisation n'envoie quoi que ce soit.",
    running: "Les automatisations actives tournent.",
    stop: "Tout arrêter maintenant",
    resume: "Reprendre les automatisations",
    stopHint: "L'arrêt est immédiat et vaut pour toutes les règles, y compris les rappels intégrés.",
    rules: {
      duesReminder: { name: "Relance de cotisation", when: "Avant une échéance puis en retard, selon les réglages des relances, à la personne et à sa famille." },
      documentExpiring: { name: "Pièce qui expire", when: "Quand un document valide expire dans le délai choisi." },
      registrationReview: { name: "Inscription à vérifier", when: "Quand une inscription attend une décision depuis le délai choisi." },
      callNoAnswer: { name: "Convocation sans réponse", when: "24 heures avant la limite de réponse d'un appel de présence, et l'alerte si le minimum n'est pas atteint." },
      licenceExpiring: { name: "Permis qui expire", when: "Une fois, 30 jours avant l'expiration du permis de conduire d'un coach." },
      chairService: { name: "Révision de fauteuil", when: "Quand la révision d'un fauteuil tombe dans le délai choisi." },
      grantDeadline: { name: "Ouverture et échéance de subside", when: "Le jour où l'appel ouvre, puis 30, 7 et 1 jours avant l'échéance, tant que le dossier n'est pas déposé." },
      sponsorRenewal: { name: "Renouvellement de sponsor", when: "Le jour de renouvellement prévu d'un sponsor." },
      sponsorQuiet: { name: "Sponsor sans contact", when: "Quand un sponsor actif n'a plus eu de contact depuis le délai choisi." },
      taskLate: { name: "Tâche en retard", when: "Quand une tâche de la to-do dépasse son échéance du délai choisi (jamais les tâches créées par une automatisation)." },
    },
    builtin: "Intégrée",
    builtinHint: "Rappel qui existait déjà : son texte se modifie dans Modèles de messages, son rythme ne change pas.",
    moduleOff: "Module désactivé",
    enabled: "Activée",
    paused: "En pause",
    delay: "Délai",
    delayUnit: {
      documentExpiring: "jours avant l'expiration",
      registrationReview: "jours d'attente",
      chairService: "jours avant la révision",
      sponsorQuiet: "jours sans contact",
      taskLate: "jours de retard",
    },
    recipients: "Destinataires",
    recipientLabels: { person: "La personne et sa famille", president: "La présidence", responsible: "Le responsable" },
    actions: "Actions",
    actionLabels: { notify: "Notification dans l'application", email: "Email", task: "Tâche dans la to-do" },
    message: "Message",
    messageHint: "Variables : {person}, {about}, {date}, {organization}. Laissez vide pour garder le texte proposé.",
    subject: "Objet",
    body: "Texte",
    languages: { fr: "Français", nl: "Néerlandais", en: "Anglais" },
    save: "Enregistrer",
    saveOf: "Enregistrer : {rule}",
    saved: "Automatisation enregistrée.",
    simulate: "Simuler aujourd'hui",
    simulateHint: "Liste qui recevrait quoi aujourd'hui, sans rien envoyer.",
    simulation: "Simulation du jour",
    simulationEmpty: "Aujourd'hui, aucune automatisation active n'enverrait rien.",
    colRule: "Règle",
    colAbout: "Objet",
    colRecipient: "Destinataire",
    colActions: "Actions",
    colState: "État",
    already: "Déjà fait",
    toDo: "Partirait",
    journal: "Journal d'exécution",
    journalEmpty: "Rien n'a encore été exécuté.",
    colWhen: "Quand",
    colResult: "Résultat",
    results: { sent: "Envoyé", task: "Tâche créée", error: "Erreur", done: "Exécuté" },
    everyone: "Tous",
  },
  nl: {
    title: "Automatiseringen",
    intro: "De herinneringen die de toepassing zelf stuurt. Elke regel wordt geactiveerd, gepauzeerd en gesimuleerd voor er iets vertrekt; eenzelfde herinnering vertrekt nooit twee keer.",
    stopped: "Alles staat stil: geen enkele automatisering stuurt nog iets.",
    running: "De actieve automatiseringen lopen.",
    stop: "Nu alles stoppen",
    resume: "De automatiseringen hervatten",
    stopHint: "De stop is onmiddellijk en geldt voor alle regels, ook de ingebouwde herinneringen.",
    rules: {
      duesReminder: { name: "Herinnering lidgeld", when: "Voor een vervaldag en daarna bij achterstand, volgens de instellingen van de herinneringen, aan de persoon en het gezin." },
      documentExpiring: { name: "Document dat vervalt", when: "Wanneer een geldig document binnen de gekozen termijn vervalt." },
      registrationReview: { name: "Inschrijving na te kijken", when: "Wanneer een inschrijving al de gekozen termijn op een beslissing wacht." },
      callNoAnswer: { name: "Oproep zonder antwoord", when: "24 uur voor de antwoordtermijn van een aanwezigheidsoproep, en de waarschuwing als het minimum niet gehaald wordt." },
      licenceExpiring: { name: "Rijbewijs dat vervalt", when: "Eén keer, 30 dagen voor het rijbewijs van een coach vervalt." },
      chairService: { name: "Nazicht van rolstoel", when: "Wanneer het nazicht van een rolstoel binnen de gekozen termijn valt." },
      grantDeadline: { name: "Opening en vervaldag van subsidie", when: "De dag dat de oproep opent, en 30, 7 en 1 dag voor de vervaldag, zolang het dossier niet ingediend is." },
      sponsorRenewal: { name: "Vernieuwing van sponsor", when: "Op de voorziene vernieuwingsdag van een sponsor." },
      sponsorQuiet: { name: "Sponsor zonder contact", when: "Wanneer een actieve sponsor sinds de gekozen termijn geen contact meer had." },
      taskLate: { name: "Taak te laat", when: "Wanneer een taak van de takenlijst de gekozen termijn over tijd is (nooit taken van een automatisering)." },
    },
    builtin: "Ingebouwd",
    builtinHint: "Herinnering die al bestond: de tekst wijzigt u in Berichtsjablonen, het ritme blijft hetzelfde.",
    moduleOff: "Module uitgeschakeld",
    enabled: "Actief",
    paused: "Gepauzeerd",
    delay: "Termijn",
    delayUnit: {
      documentExpiring: "dagen voor het vervallen",
      registrationReview: "dagen wachten",
      chairService: "dagen voor het nazicht",
      sponsorQuiet: "dagen zonder contact",
      taskLate: "dagen te laat",
    },
    recipients: "Ontvangers",
    recipientLabels: { person: "De persoon en het gezin", president: "Het voorzitterschap", responsible: "De verantwoordelijke" },
    actions: "Acties",
    actionLabels: { notify: "Melding in de toepassing", email: "E-mail", task: "Taak in de takenlijst" },
    message: "Bericht",
    messageHint: "Variabelen: {person}, {about}, {date}, {organization}. Laat leeg om de voorgestelde tekst te houden.",
    subject: "Onderwerp",
    body: "Tekst",
    languages: { fr: "Frans", nl: "Nederlands", en: "Engels" },
    save: "Opslaan",
    saveOf: "Opslaan: {rule}",
    saved: "Automatisering opgeslagen.",
    simulate: "Vandaag simuleren",
    simulateHint: "Toont wie vandaag wat zou krijgen, zonder iets te sturen.",
    simulation: "Simulatie van vandaag",
    simulationEmpty: "Vandaag zou geen enkele actieve automatisering iets sturen.",
    colRule: "Regel",
    colAbout: "Onderwerp",
    colRecipient: "Ontvanger",
    colActions: "Acties",
    colState: "Stand",
    already: "Al gedaan",
    toDo: "Zou vertrekken",
    journal: "Uitvoeringslogboek",
    journalEmpty: "Nog niets uitgevoerd.",
    colWhen: "Wanneer",
    colResult: "Resultaat",
    results: { sent: "Verstuurd", task: "Taak aangemaakt", error: "Fout", done: "Uitgevoerd" },
    everyone: "Iedereen",
  },
  en: {
    title: "Automations",
    intro: "The reminders the application sends by itself. Each one is switched on, paused and simulated before anything leaves; the same reminder never goes twice.",
    stopped: "Everything is stopped: no automation sends anything.",
    running: "The active automations are running.",
    stop: "Stop everything now",
    resume: "Resume the automations",
    stopHint: "The stop is immediate and covers every rule, built-in reminders included.",
    rules: {
      duesReminder: { name: "Membership fee reminder", when: "Before a due date, then when late, as set in the reminders, to the person and their family." },
      documentExpiring: { name: "Document that expires", when: "When a valid document expires within the chosen delay." },
      registrationReview: { name: "Registration to check", when: "When a registration has waited for a decision for the chosen delay." },
      callNoAnswer: { name: "Call without an answer", when: "24 hours before an attendance call's answer deadline, and the alert when the minimum is not reached." },
      licenceExpiring: { name: "Driving licence that expires", when: "Once, 30 days before a coach's driving licence expires." },
      chairService: { name: "Chair service", when: "When a chair's service falls within the chosen delay." },
      grantDeadline: { name: "Grant opening and deadline", when: "On the day the call opens, then 30, 7 and 1 days before the deadline, while the file is not filed." },
      sponsorRenewal: { name: "Sponsor renewal", when: "On a sponsor's planned renewal day." },
      sponsorQuiet: { name: "Sponsor without contact", when: "When an active sponsor has had no contact for the chosen delay." },
      taskLate: { name: "Late task", when: "When a to-do task is past its due date by the chosen delay (never the tasks an automation created)." },
    },
    builtin: "Built-in",
    builtinHint: "A reminder that already existed: edit its text in Message templates, its timing stays the same.",
    moduleOff: "Module switched off",
    enabled: "On",
    paused: "Paused",
    delay: "Delay",
    delayUnit: {
      documentExpiring: "days before it expires",
      registrationReview: "days waiting",
      chairService: "days before the service",
      sponsorQuiet: "days without contact",
      taskLate: "days late",
    },
    recipients: "Recipients",
    recipientLabels: { person: "The person and their family", president: "The presidency", responsible: "The person in charge" },
    actions: "Actions",
    actionLabels: { notify: "Notification in the application", email: "Email", task: "Task in the to-do" },
    message: "Message",
    messageHint: "Variables: {person}, {about}, {date}, {organization}. Leave empty to keep the proposed text.",
    subject: "Subject",
    body: "Text",
    languages: { fr: "French", nl: "Dutch", en: "English" },
    save: "Save",
    saveOf: "Save: {rule}",
    saved: "Automation saved.",
    simulate: "Simulate today",
    simulateHint: "Lists who would receive what today, without sending anything.",
    simulation: "Today's simulation",
    simulationEmpty: "Today, no active automation would send anything.",
    colRule: "Rule",
    colAbout: "About",
    colRecipient: "Recipient",
    colActions: "Actions",
    colState: "State",
    already: "Already done",
    toDo: "Would leave",
    journal: "Run log",
    journalEmpty: "Nothing has run yet.",
    colWhen: "When",
    colResult: "Result",
    results: { sent: "Sent", task: "Task created", error: "Error", done: "Ran" },
    everyone: "Everyone",
  },
};
