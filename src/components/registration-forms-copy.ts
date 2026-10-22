import type { PlatformTemplate } from "@/domains/registrations/templates";

/** Wave 17 (F1): the forms list, templates, sharing and the one-click decisions. */
type Copy = {
  forms: string;
  name: string;
  created: string;
  season: string;
  applications: string;
  status: string;
  actions: string;
  open: string;
  closed: string;
  archived: string;
  opensOn: string;
  closedSince: string;
  preview: string;
  previewOf: string;
  reuse: string;
  reuseOf: string;
  share: string;
  shareOf: string;
  more: string;
  archive: string;
  restore: string;
  saveTemplate: string;
  showArchived: string;
  select: string;
  empty: string;
  archivedDone: string;
  restoredDone: string;
  newForm: string;
  newFormIntro: string;
  fromScratch: string;
  fromScratchHint: string;
  fromTemplate: string;
  platformTemplates: string;
  clubTemplates: string;
  noClubTemplates: string;
  templateNames: Record<PlatformTemplate, string>;
  templateHints: Record<PlatformTemplate, string>;
  questionsCount: string;
  use: string;
  useOf: string;
  deleteTemplate: string;
  templateName: string;
  templateSaved: string;
  templateDeleted: string;
  saveTemplateTitle: string;
  saveTemplateHint: string;
  fromTemplateNotice: string;
  editing: string;
  newEditing: string;
  reusing: string;
  savedClosed: string;
  question: string;
  removeQuestion: string;
  questionRemoved: string;
  moveUp: string;
  moveDown: string;
  drag: string;
  moved: string;
  untitled: string;
  shareTitle: string;
  publicSwitch: string;
  publicHint: string;
  opens: string;
  closes: string;
  datesInvalid: string;
  saveOpening: string;
  openSaved: string;
  closeSaved: string;
  notOpenYet: string;
  ways: string;
  tabLink: string;
  tabSite: string;
  tabSocial: string;
  link: string;
  linkHint: string;
  qrLabel: string;
  downloadQr: string;
  siteHint: string;
  iframe: string;
  popup: string;
  button: string;
  socialHint: string;
  announcement: string;
  announcementText: string;
  facebook: string;
  whatsapp: string;
  email: string;
  emailSubject: string;
  copy: string;
  copyWhat: string;
  copied: string;
  copyFailed: string;
  openTab: string;
  newTab: string;
  accept: string;
  refuse: string;
  acceptOf: string;
  refuseOf: string;
  moreOf: string;
  waiting: string;
  complement: string;
  decision: string;
  accepted: string;
  refused: string;
  waited: string;
  completed: string;
  chooseTeam: string;
  chooseTeamHint: string;
  noTeam: string;
  freePlaces: string;
  onePlace: string;
  full: string;
  noLimit: string;
  confirmAccept: string;
  teamFullTitle: string;
  teamFullText: string;
  acceptAnyway: string;
  toWaiting: string;
  cancel: string;
  refuseTitle: string;
  reason: string;
  reasonHint: string;
  confirmRefuse: string;
  complementTitle: string;
  complementText: string;
  complementHint: string;
  send: string;
  identity: string;
  admission: string;
  change: string;
  mailDelay: string;
};

export const formsCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    forms: "Formulaires",
    name: "Nom",
    created: "Créé en",
    season: "Saison",
    applications: "Dossiers reçus",
    status: "Statut",
    actions: "Actions",
    open: "Ouvert au public",
    closed: "Fermé",
    archived: "Archivé",
    opensOn: "Ouvre le {date}",
    closedSince: "Fermé depuis le {date}",
    preview: "Aperçu",
    previewOf: "Aperçu de {form}",
    reuse: "Réutiliser",
    reuseOf: "Réutiliser {form} pour une nouvelle saison",
    share: "Partager",
    shareOf: "Partager {form}",
    more: "Plus d'actions pour {form}",
    archive: "Archiver",
    restore: "Désarchiver",
    saveTemplate: "Enregistrer comme modèle",
    showArchived: "Afficher les formulaires archivés",
    select: "Afficher les questions de {form}",
    empty: "Aucun formulaire. Créez le premier avec « Nouveau formulaire ».",
    archivedDone: "Formulaire archivé",
    restoredDone: "Formulaire désarchivé",
    newForm: "Nouveau formulaire",
    newFormIntro: "Comment voulez-vous commencer ?",
    fromScratch: "Partir de zéro",
    fromScratchHint: "Un formulaire vide : vous ajoutez vos propres questions.",
    fromTemplate: "Partir d'un modèle",
    platformTemplates: "Modèles de la plateforme",
    clubTemplates: "Modèles du club",
    noClubTemplates: "Aucun modèle du club pour l'instant. Dans la liste des formulaires, ouvrez « … » puis « Enregistrer comme modèle ».",
    templateNames: { player: "Inscription d'un joueur", renewal: "Réinscription", camp: "Inscription à un stage" },
    templateHints: {
      player: "Coordonnées, contact d'urgence, santé (confidentielle), maillot, joystick, cotisation et consentements.",
      renewal: "Pour les joueurs déjà au club : coordonnées à vérifier, changements, cotisation.",
      camp: "Niveau, fauteuil personnel ou prêt, joystick, repas, consentements.",
    },
    questionsCount: "{n} questions",
    use: "Utiliser",
    useOf: "Utiliser le modèle {name}",
    deleteTemplate: "Supprimer le modèle {name}",
    templateName: "Nom du modèle",
    templateSaved: "Modèle enregistré",
    templateDeleted: "Modèle supprimé",
    saveTemplateTitle: "Enregistrer {form} comme modèle",
    saveTemplateHint: "Le modèle reprend la présentation, les questions et la capacité. Il sert ensuite pour « Partir d'un modèle ».",
    fromTemplateNotice: "Modèle « {name} » chargé : adaptez les textes, enregistrez, puis ouvrez le formulaire au public depuis « Partager ».",
    editing: "Questions de {form}",
    newEditing: "Nouveau formulaire",
    reusing: "Réutiliser {form}",
    savedClosed: "Formulaire enregistré. Il reste fermé au public tant que vous ne l'ouvrez pas depuis « Partager ».",
    question: "Question {n}",
    removeQuestion: "Retirer la question {n} : {label}",
    questionRemoved: "Question retirée",
    moveUp: "Monter la question {n}",
    moveDown: "Descendre la question {n}",
    drag: "Déplacer la question {n} : glisser, ou flèches haut et bas",
    moved: "Question déplacée en position {n}.",
    untitled: "sans titre",
    shareTitle: "Partager {form}",
    publicSwitch: "Ouvert au public",
    publicHint: "Quand il est ouvert, toute personne qui a le lien peut déposer une candidature.",
    opens: "Ouverture le (facultatif)",
    closes: "Fermeture le (facultatif)",
    datesInvalid: "La date de fermeture doit suivre la date d'ouverture.",
    saveOpening: "Enregistrer",
    openSaved: "Formulaire ouvert au public",
    closeSaved: "Formulaire fermé au public",
    notOpenYet: "Le formulaire est fermé : le lien affiche « indisponible » tant qu'il n'est pas ouvert.",
    ways: "Façons de partager",
    tabLink: "Lien",
    tabSite: "Site web",
    tabSocial: "Réseaux sociaux",
    link: "Adresse publique",
    linkHint: "Copiez l'adresse dans un email ou un message. Le QR code s'imprime sur une affiche ou un flyer.",
    qrLabel: "QR code du formulaire {form}",
    downloadQr: "Télécharger le QR code (PNG)",
    siteHint: "Collez ce code dans votre site (WordPress : bloc HTML personnalisé ; Wix : élément Intégrer un code).",
    iframe: "Code du formulaire intégré",
    popup: "Ou un bouton qui ouvre le formulaire dans une fenêtre",
    button: "S'inscrire",
    socialHint: "Copiez ce texte d'annonce, ou partagez directement. Aucun compte n'est connecté : le réseau s'ouvre dans un nouvel onglet.",
    announcement: "Texte d'annonce",
    announcementText: "Les inscriptions de {club} sont ouvertes ! Remplissez le formulaire « {form} » : {url}",
    facebook: "Partager sur Facebook",
    whatsapp: "Partager sur WhatsApp",
    email: "Envoyer par email",
    emailSubject: "Inscriptions {club}",
    copy: "Copier",
    copyWhat: "Copier : {what}",
    copied: "Copié dans le presse-papiers.",
    copyFailed: "Copie impossible : sélectionnez le texte et copiez-le à la main.",
    openTab: "Ouvrir le formulaire public",
    newTab: "(nouvel onglet)",
    accept: "Accepter",
    refuse: "Refuser",
    acceptOf: "Accepter le dossier de {name}",
    refuseOf: "Refuser le dossier de {name}",
    moreOf: "Autres décisions pour le dossier de {name}",
    waiting: "Liste d'attente",
    complement: "Demander un complément",
    decision: "Décision",
    accepted: "Dossier accepté",
    refused: "Dossier refusé",
    waited: "Dossier mis en liste d'attente",
    completed: "Complément demandé",
    chooseTeam: "Dans quelle équipe accepter {name} ?",
    chooseTeamHint: "Le joueur rejoint l'équipe choisie pour la saison du formulaire.",
    noTeam: "Sans équipe pour l'instant",
    freePlaces: "{n} places libres",
    onePlace: "1 place libre",
    full: "Complète",
    noLimit: "Places non limitées",
    confirmAccept: "Accepter le dossier",
    teamFullTitle: "{team} est complète",
    teamFullText: "Vous pouvez accepter quand même, ou mettre le dossier en liste d'attente.",
    acceptAnyway: "Accepter quand même",
    toWaiting: "Mettre en liste d'attente",
    cancel: "Annuler",
    refuseTitle: "Refuser le dossier de {name}",
    reason: "Motif (facultatif)",
    reasonHint: "S'il est rempli, le motif est envoyé au candidat.",
    confirmRefuse: "Refuser le dossier",
    complementTitle: "Demander un complément à {name}",
    complementText: "Ce qui manque au dossier",
    complementHint: "Envoyé au candidat, qui complète puis soumet à nouveau.",
    send: "Envoyer la demande",
    identity: "Ce dossier ressemble à une fiche existante : choisissez-la dans « Options d'admission », puis acceptez.",
    admission: "Options d'admission",
    change: "Changer la décision",
    mailDelay: "L'email au candidat part dans deux minutes, sauf si vous annulez.",
  },
  nl: {
    forms: "Formulieren",
    name: "Naam",
    created: "Aangemaakt in",
    season: "Seizoen",
    applications: "Ontvangen dossiers",
    status: "Status",
    actions: "Acties",
    open: "Open voor het publiek",
    closed: "Gesloten",
    archived: "Gearchiveerd",
    opensOn: "Opent op {date}",
    closedSince: "Gesloten sinds {date}",
    preview: "Voorbeeld",
    previewOf: "Voorbeeld van {form}",
    reuse: "Hergebruiken",
    reuseOf: "{form} hergebruiken voor een nieuw seizoen",
    share: "Delen",
    shareOf: "{form} delen",
    more: "Meer acties voor {form}",
    archive: "Archiveren",
    restore: "Uit het archief halen",
    saveTemplate: "Opslaan als model",
    showArchived: "Gearchiveerde formulieren tonen",
    select: "De vragen van {form} tonen",
    empty: "Geen formulier. Maak het eerste aan met « Nieuw formulier ».",
    archivedDone: "Formulier gearchiveerd",
    restoredDone: "Formulier uit het archief gehaald",
    newForm: "Nieuw formulier",
    newFormIntro: "Hoe wilt u beginnen?",
    fromScratch: "Van nul beginnen",
    fromScratchHint: "Een leeg formulier: u voegt uw eigen vragen toe.",
    fromTemplate: "Vertrekken van een model",
    platformTemplates: "Modellen van het platform",
    clubTemplates: "Modellen van de club",
    noClubTemplates: "Nog geen model van de club. Open in de lijst van formulieren « … » en daarna « Opslaan als model ».",
    templateNames: { player: "Inschrijving van een speler", renewal: "Herinschrijving", camp: "Inschrijving voor een stage" },
    templateHints: {
      player: "Gegevens, noodcontact, gezondheid (vertrouwelijk), shirt, joystick, lidgeld en toestemmingen.",
      renewal: "Voor spelers die al bij de club zijn: gegevens nakijken, wijzigingen, lidgeld.",
      camp: "Niveau, eigen of geleende rolstoel, joystick, maaltijden, toestemmingen.",
    },
    questionsCount: "{n} vragen",
    use: "Gebruiken",
    useOf: "Het model {name} gebruiken",
    deleteTemplate: "Het model {name} verwijderen",
    templateName: "Naam van het model",
    templateSaved: "Model opgeslagen",
    templateDeleted: "Model verwijderd",
    saveTemplateTitle: "{form} opslaan als model",
    saveTemplateHint: "Het model neemt de voorstelling, de vragen en de capaciteit over. Het dient daarna voor « Vertrekken van een model ».",
    fromTemplateNotice: "Model « {name} » geladen: pas de teksten aan, sla op en open het formulier daarna voor het publiek via « Delen ».",
    editing: "Vragen van {form}",
    newEditing: "Nieuw formulier",
    reusing: "{form} hergebruiken",
    savedClosed: "Formulier opgeslagen. Het blijft gesloten voor het publiek zolang u het niet opent via « Delen ».",
    question: "Vraag {n}",
    removeQuestion: "Vraag {n} verwijderen: {label}",
    questionRemoved: "Vraag verwijderd",
    moveUp: "Vraag {n} omhoog",
    moveDown: "Vraag {n} omlaag",
    drag: "Vraag {n} verplaatsen: slepen, of pijltjes omhoog en omlaag",
    moved: "Vraag verplaatst naar positie {n}.",
    untitled: "zonder titel",
    shareTitle: "{form} delen",
    publicSwitch: "Open voor het publiek",
    publicHint: "Zolang het open is, kan iedereen met de link een aanvraag indienen.",
    opens: "Opent op (optioneel)",
    closes: "Sluit op (optioneel)",
    datesInvalid: "De sluitingsdatum moet na de openingsdatum liggen.",
    saveOpening: "Opslaan",
    openSaved: "Formulier open voor het publiek",
    closeSaved: "Formulier gesloten voor het publiek",
    notOpenYet: "Het formulier is gesloten: de link toont « niet beschikbaar » zolang het niet open is.",
    ways: "Manieren om te delen",
    tabLink: "Link",
    tabSite: "Website",
    tabSocial: "Sociale media",
    link: "Openbaar adres",
    linkHint: "Kopieer het adres in een e-mail of bericht. De QR-code kunt u afdrukken op een affiche of flyer.",
    qrLabel: "QR-code van het formulier {form}",
    downloadQr: "De QR-code downloaden (PNG)",
    siteHint: "Plak deze code in uw website (WordPress: blok Aangepaste HTML; Wix: element Code insluiten).",
    iframe: "Code van het ingesloten formulier",
    popup: "Of een knop die het formulier in een venster opent",
    button: "Inschrijven",
    socialHint: "Kopieer deze aankondiging, of deel rechtstreeks. Er wordt geen account gekoppeld: het netwerk opent in een nieuw tabblad.",
    announcement: "Aankondiging",
    announcementText: "De inschrijvingen van {club} zijn open! Vul het formulier « {form} » in: {url}",
    facebook: "Delen op Facebook",
    whatsapp: "Delen op WhatsApp",
    email: "Versturen per e-mail",
    emailSubject: "Inschrijvingen {club}",
    copy: "Kopiëren",
    copyWhat: "Kopiëren: {what}",
    copied: "Gekopieerd naar het klembord.",
    copyFailed: "Kopiëren lukt niet: selecteer de tekst en kopieer hem zelf.",
    openTab: "Het openbare formulier openen",
    newTab: "(nieuw tabblad)",
    accept: "Aanvaarden",
    refuse: "Weigeren",
    acceptOf: "Het dossier van {name} aanvaarden",
    refuseOf: "Het dossier van {name} weigeren",
    moreOf: "Andere beslissingen voor het dossier van {name}",
    waiting: "Wachtlijst",
    complement: "Aanvulling vragen",
    decision: "Beslissing",
    accepted: "Dossier aanvaard",
    refused: "Dossier geweigerd",
    waited: "Dossier op de wachtlijst gezet",
    completed: "Aanvulling gevraagd",
    chooseTeam: "In welk team {name} aanvaarden?",
    chooseTeamHint: "De speler komt in het gekozen team voor het seizoen van het formulier.",
    noTeam: "Voorlopig zonder team",
    freePlaces: "{n} vrije plaatsen",
    onePlace: "1 vrije plaats",
    full: "Volzet",
    noLimit: "Onbeperkt aantal plaatsen",
    confirmAccept: "Het dossier aanvaarden",
    teamFullTitle: "{team} is volzet",
    teamFullText: "U kunt toch aanvaarden, of het dossier op de wachtlijst zetten.",
    acceptAnyway: "Toch aanvaarden",
    toWaiting: "Op de wachtlijst zetten",
    cancel: "Annuleren",
    refuseTitle: "Het dossier van {name} weigeren",
    reason: "Reden (optioneel)",
    reasonHint: "Als ze ingevuld is, wordt de reden naar de kandidaat gestuurd.",
    confirmRefuse: "Het dossier weigeren",
    complementTitle: "Een aanvulling vragen aan {name}",
    complementText: "Wat er in het dossier ontbreekt",
    complementHint: "Naar de kandidaat gestuurd, die aanvult en opnieuw indient.",
    send: "De vraag versturen",
    identity: "Dit dossier lijkt op een bestaande fiche: kies ze in « Opties voor de toelating » en aanvaard daarna.",
    admission: "Opties voor de toelating",
    change: "De beslissing wijzigen",
    mailDelay: "De e-mail aan de kandidaat vertrekt binnen twee minuten, tenzij u annuleert.",
  },
  en: {
    forms: "Forms",
    name: "Name",
    created: "Created in",
    season: "Season",
    applications: "Applications received",
    status: "Status",
    actions: "Actions",
    open: "Open to the public",
    closed: "Closed",
    archived: "Archived",
    opensOn: "Opens on {date}",
    closedSince: "Closed since {date}",
    preview: "Preview",
    previewOf: "Preview of {form}",
    reuse: "Reuse",
    reuseOf: "Reuse {form} for a new season",
    share: "Share",
    shareOf: "Share {form}",
    more: "More actions for {form}",
    archive: "Archive",
    restore: "Restore from the archive",
    saveTemplate: "Save as a template",
    showArchived: "Show archived forms",
    select: "Show the questions of {form}",
    empty: "No form yet. Create the first one with « New form ».",
    archivedDone: "Form archived",
    restoredDone: "Form restored",
    newForm: "New form",
    newFormIntro: "How do you want to start?",
    fromScratch: "Start from scratch",
    fromScratchHint: "An empty form: you add your own questions.",
    fromTemplate: "Start from a template",
    platformTemplates: "Platform templates",
    clubTemplates: "Club templates",
    noClubTemplates: "No club template yet. In the list of forms, open « … » then « Save as a template ».",
    templateNames: { player: "Player registration", renewal: "Renewal", camp: "Camp registration" },
    templateHints: {
      player: "Contact details, emergency contact, health (confidential), shirt, joystick, fee and consents.",
      renewal: "For players already in the club: details to check, changes, fee.",
      camp: "Level, own or borrowed chair, joystick, meals, consents.",
    },
    questionsCount: "{n} questions",
    use: "Use",
    useOf: "Use the template {name}",
    deleteTemplate: "Delete the template {name}",
    templateName: "Template name",
    templateSaved: "Template saved",
    templateDeleted: "Template deleted",
    saveTemplateTitle: "Save {form} as a template",
    saveTemplateHint: "The template keeps the introduction, the questions and the capacity. It then serves for « Start from a template ».",
    fromTemplateNotice: "Template « {name} » loaded: adapt the texts, save, then open the form to the public from « Share ».",
    editing: "Questions of {form}",
    newEditing: "New form",
    reusing: "Reuse {form}",
    savedClosed: "Form saved. It stays closed to the public until you open it from « Share ».",
    question: "Question {n}",
    removeQuestion: "Remove question {n}: {label}",
    questionRemoved: "Question removed",
    moveUp: "Move question {n} up",
    moveDown: "Move question {n} down",
    drag: "Move question {n}: drag, or up and down arrows",
    moved: "Question moved to position {n}.",
    untitled: "untitled",
    shareTitle: "Share {form}",
    publicSwitch: "Open to the public",
    publicHint: "While it is open, anyone with the link can apply.",
    opens: "Opens on (optional)",
    closes: "Closes on (optional)",
    datesInvalid: "The closing date must come after the opening date.",
    saveOpening: "Save",
    openSaved: "Form open to the public",
    closeSaved: "Form closed to the public",
    notOpenYet: "The form is closed: the link shows « unavailable » until it is open.",
    ways: "Ways to share",
    tabLink: "Link",
    tabSite: "Website",
    tabSocial: "Social media",
    link: "Public address",
    linkHint: "Copy the address into an email or a message. Print the QR code on a poster or a flyer.",
    qrLabel: "QR code of the form {form}",
    downloadQr: "Download the QR code (PNG)",
    siteHint: "Paste this code into your website (WordPress: Custom HTML block; Wix: Embed code element).",
    iframe: "Code of the embedded form",
    popup: "Or a button that opens the form in a window",
    button: "Register",
    socialHint: "Copy this announcement, or share directly. No account is connected: the network opens in a new tab.",
    announcement: "Announcement",
    announcementText: "Registrations at {club} are open! Fill in the form « {form} »: {url}",
    facebook: "Share on Facebook",
    whatsapp: "Share on WhatsApp",
    email: "Send by email",
    emailSubject: "Registrations {club}",
    copy: "Copy",
    copyWhat: "Copy: {what}",
    copied: "Copied to the clipboard.",
    copyFailed: "Copy failed: select the text and copy it yourself.",
    openTab: "Open the public form",
    newTab: "(new tab)",
    accept: "Accept",
    refuse: "Refuse",
    acceptOf: "Accept the application of {name}",
    refuseOf: "Refuse the application of {name}",
    moreOf: "Other decisions for the application of {name}",
    waiting: "Waiting list",
    complement: "Ask for more information",
    decision: "Decision",
    accepted: "Application accepted",
    refused: "Application refused",
    waited: "Application put on the waiting list",
    completed: "More information requested",
    chooseTeam: "Into which team do you accept {name}?",
    chooseTeamHint: "The player joins the chosen team for the form's season.",
    noTeam: "No team for now",
    freePlaces: "{n} places left",
    onePlace: "1 place left",
    full: "Full",
    noLimit: "No limit on places",
    confirmAccept: "Accept the application",
    teamFullTitle: "{team} is full",
    teamFullText: "You can accept anyway, or put the application on the waiting list.",
    acceptAnyway: "Accept anyway",
    toWaiting: "Put on the waiting list",
    cancel: "Cancel",
    refuseTitle: "Refuse the application of {name}",
    reason: "Reason (optional)",
    reasonHint: "When filled in, the reason is sent to the applicant.",
    confirmRefuse: "Refuse the application",
    complementTitle: "Ask {name} for more information",
    complementText: "What the application is missing",
    complementHint: "Sent to the applicant, who completes it and submits again.",
    send: "Send the request",
    identity: "This application looks like an existing file: choose it in « Admission options », then accept.",
    admission: "Admission options",
    change: "Change the decision",
    mailDelay: "The email to the applicant leaves in two minutes, unless you undo.",
  },
};

/** « {n} places libres » and the like. */
export const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
