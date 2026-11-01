import type { Locale } from "@/lib/locale";

/** B9: open events (public registration, waiting list, check-in, opinions). `mail` goes to the registered people. */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  unavailable: string;
  saved: string;
  save: string;
  cancel: string;
  close: string;
  open: string;
  openTitle: string;
  noEvents: string;
  noCandidates: string;
  event: string;
  series: string;
  description: string;
  capacity: string;
  capacityHint: string;
  opensAt: string;
  closesAt: string;
  fee: string;
  feeHint: string;
  confirmHours: string;
  confirmHint: string;
  reminders: string;
  survey: string;
  questions: string;
  questionsHint: string;
  surveyQuestions: string;
  surveyHint: string;
  link: string;
  copy: string;
  copied: string;
  export: string;
  counts: string;
  window: Record<"before" | "open" | "closed", string>;
  statuses: Record<"confirmed" | "waiting" | "offered" | "cancelled", string>;
  eventCancelled: string;
  cancelEvent: string;
  cancelReason: string;
  tabs: Record<"people" | "checkin" | "opinions", string>;
  tabsLabel: string;
  noPeople: string;
  needs: string;
  needLabels: Record<"wheelchair" | "helper" | "transport", string>;
  diet: string;
  image: string;
  noImage: string;
  paid: string;
  unpaid: string;
  markPaid: string;
  checkIn: string;
  checkedIn: string;
  present: string;
  scanHint: string;
  removeRegistration: string;
  message: string;
  subject: string;
  body: string;
  send: string;
  sent: string;
  opinions: string;
  noOpinions: string;
  average: string;
  answersOf: string;
  checkinPage: { title: string; done: string; already: string; failed: string; back: string };
  public: {
    places: string;
    full: string;
    free: string;
    notYet: string;
    over: string;
    cancelled: string;
    feeLine: string;
    register: string;
    name: string;
    email: string;
    phone: string;
    needs: string;
    consentData: string;
    consentImage: string;
    yes: string;
    no: string;
    done: string;
    waiting: string;
    offered: string;
    confirm: string;
    withdraw: string;
    withdrawn: string;
    yourStatus: string;
    keepLink: string;
    pay: string;
    paidLine: string;
    qr: string;
    opinion: string;
    rating: string;
    thanks: string;
    notFound: string;
  };
  mail: {
    confirmedTitle: string;
    confirmed: string;
    waitingTitle: string;
    waiting: string;
    offerTitle: string;
    offer: string;
    reminderTitle: string;
    reminder7: string;
    reminder1: string;
    surveyTitle: string;
    survey: string;
    cancelledTitle: string;
    cancelled: string;
    task: string;
  };
  errors: Record<string, string>;
};

export const openEventsCopy: Record<Locale, Copy> = {
  fr: {
    title: "Événements ouverts",
    intro: "Journées découverte, stages, soupers et tournois : une inscription par simple lien, sans compte, avec liste d'attente et pointage.",
    loading: "Chargement des événements…",
    unavailable: "Les événements ouverts ne sont pas disponibles pour le moment.",
    saved: "Enregistré.",
    save: "Enregistrer",
    cancel: "Annuler",
    close: "Fermer",
    open: "Ouvrir un événement",
    openTitle: "Ouvrir un événement au public",
    noEvents: "Aucun événement ouvert pour l'instant.",
    noCandidates: "Aucun rendez-vous à venir dans le calendrier. Créez-le d'abord dans le calendrier.",
    event: "Rendez-vous du calendrier",
    series: "Ouvrir aussi les autres dates de la série",
    description: "Présentation",
    capacity: "Places",
    capacityHint: "Vide : sans limite. Au-delà, la liste d'attente prend le relais.",
    opensAt: "Inscriptions à partir du",
    closesAt: "Inscriptions jusqu'au",
    fee: "Participation (€)",
    feeHint: "Facultative, réglée par virement avec la communication structurée. Aucun paiement en ligne.",
    confirmHours: "Délai de confirmation (heures)",
    confirmHint: "Une place libérée est proposée au suivant de la liste d'attente, qui a ce délai pour la confirmer.",
    reminders: "Rappels par e-mail 7 jours et 1 jour avant",
    survey: "Questionnaire d'avis après l'événement",
    questions: "Questions de l'inscription",
    questionsHint: "Une question par ligne. Terminez par « ? » pour une réponse oui ou non, ajoutez « * » pour la rendre obligatoire.",
    surveyQuestions: "Questions de l'avis",
    surveyHint: "Une question par ligne, en plus de la note sur 5.",
    link: "Lien d'inscription",
    copy: "Copier le lien",
    copied: "Lien copié.",
    export: "Exporter les inscrits (Excel)",
    counts: "{confirmed} inscrits · {waiting} en attente · {present} présents",
    window: { before: "Inscriptions pas encore ouvertes", open: "Inscriptions ouvertes", closed: "Inscriptions closes" },
    statuses: { confirmed: "Inscrit", waiting: "En attente", offered: "Place proposée", cancelled: "Désisté" },
    eventCancelled: "Événement annulé",
    cancelEvent: "Annuler l'événement",
    cancelReason: "Raison (envoyée aux inscrits)",
    tabs: { people: "Inscrits", checkin: "Pointage", opinions: "Avis" },
    tabsLabel: "Sections de l'événement",
    noPeople: "Personne n'est encore inscrit.",
    needs: "Besoins",
    needLabels: { wheelchair: "Fauteuil", helper: "Aidant", transport: "Transport adapté" },
    diet: "Régime",
    image: "Droit à l'image",
    noImage: "Pas de photo",
    paid: "Payé",
    unpaid: "À payer",
    markPaid: "Marquer payé",
    checkIn: "Pointer",
    checkedIn: "Présent",
    present: "Présents",
    scanHint: "Chaque inscrit a un QR code dans son lien personnel : scannez-le avec l'appareil photo du téléphone, ou pointez ici.",
    removeRegistration: "Retirer l'inscription",
    message: "Écrire aux inscrits",
    subject: "Objet",
    body: "Message",
    send: "Envoyer",
    sent: "Message envoyé aux inscrits.",
    opinions: "Avis",
    noOpinions: "Pas encore d'avis.",
    average: "Note moyenne : {n} sur 5 ({count} avis)",
    answersOf: "Réponses à « {q} »",
    checkinPage: { title: "Pointage", done: "{name} est pointé présent.", already: "{name} était déjà pointé.", failed: "Ce code ne correspond à aucune inscription de votre club.", back: "Retour aux événements" },
    public: {
      places: "{n} places restantes",
      full: "Complet : vous serez sur la liste d'attente.",
      free: "Gratuit",
      notYet: "Les inscriptions ouvrent le {date}.",
      over: "Les inscriptions sont closes.",
      cancelled: "Cet événement est annulé.",
      feeLine: "Participation : {amount}, à régler par virement.",
      register: "S'inscrire",
      name: "Nom et prénom",
      email: "Adresse e-mail",
      phone: "Téléphone (facultatif)",
      needs: "Besoins d'accessibilité",
      consentData: "J'accepte que le club utilise ces données pour organiser l'événement (obligatoire).",
      consentImage: "J'accepte d'apparaître sur les photos et vidéos du club (facultatif).",
      yes: "Oui",
      no: "Non",
      done: "C'est noté : vous êtes inscrit. Un e-mail vous a été envoyé avec votre lien personnel.",
      waiting: "L'événement est complet : vous êtes sur la liste d'attente. Vous serez prévenu si une place se libère.",
      offered: "Une place s'est libérée pour vous : confirmez avant le {date}.",
      confirm: "Confirmer ma place",
      withdraw: "Me désinscrire",
      withdrawn: "Votre inscription est annulée.",
      yourStatus: "Votre inscription : {status}",
      keepLink: "Gardez ce lien : il permet de confirmer, de vous désinscrire et de donner votre avis.",
      pay: "Paiement",
      paidLine: "Paiement reçu. Merci.",
      qr: "Votre code d'entrée, à montrer à l'accueil",
      opinion: "Votre avis",
      rating: "Note sur 5",
      thanks: "Merci pour votre avis.",
      notFound: "Cet événement n'existe pas ou n'est plus ouvert.",
    },
    mail: {
      confirmedTitle: "Inscription confirmée : {event}",
      confirmed: "Votre inscription à « {event} » du {date} est confirmée. Votre lien personnel pour la gérer :",
      waitingTitle: "Liste d'attente : {event}",
      waiting: "« {event} » du {date} est complet : vous êtes sur la liste d'attente. Votre lien personnel :",
      offerTitle: "Une place pour vous : {event}",
      offer: "Une place s'est libérée pour « {event} » du {date}. Confirmez-la avant le {until}, sinon elle passera à la personne suivante :",
      reminderTitle: "Rappel : {event}",
      reminder7: "« {event} » a lieu dans une semaine, le {date}. Votre lien personnel :",
      reminder1: "« {event} » a lieu demain, le {date}. Pensez à votre code d'entrée :",
      surveyTitle: "Votre avis sur {event}",
      survey: "Merci d'avoir participé à « {event} ». Deux minutes pour nous donner votre avis :",
      cancelledTitle: "Annulé : {event}",
      cancelled: "« {event} » du {date} est annulé. {reason}",
      task: "Organiser : {event}",
    },
    errors: {
      WINDOW_CLOSED: "Les inscriptions ne sont pas ouvertes.",
      ALREADY_REGISTERED: "Cette adresse est déjà inscrite à cet événement.",
      OFFER_EXPIRED: "Le délai pour confirmer cette place est passé.",
      EVENT_CANCELLED: "Cet événement est annulé.",
      ALREADY_OPEN: "Ce rendez-vous est déjà ouvert au public.",
      ANSWER_REQUIRED: "Une question obligatoire est sans réponse.",
      SURVEY_CLOSED: "L'avis n'est pas encore ou plus ouvert.",
      INVALID_WINDOW: "La fin des inscriptions doit suivre leur début, avant le début de l'événement.",
    },
  },
  nl: {
    title: "Open evenementen",
    intro: "Ontdekkingsdagen, stages, etentjes en tornooien: inschrijven via een eenvoudige link, zonder account, met wachtlijst en aanmelding.",
    loading: "Evenementen laden…",
    unavailable: "De open evenementen zijn momenteel niet beschikbaar.",
    saved: "Opgeslagen.",
    save: "Opslaan",
    cancel: "Annuleren",
    close: "Sluiten",
    open: "Evenement openstellen",
    openTitle: "Een evenement openstellen voor het publiek",
    noEvents: "Nog geen open evenement.",
    noCandidates: "Geen komende afspraak in de kalender. Maak ze eerst in de kalender aan.",
    event: "Afspraak uit de kalender",
    series: "Ook de andere data van de reeks openstellen",
    description: "Voorstelling",
    capacity: "Plaatsen",
    capacityHint: "Leeg: onbeperkt. Daarboven neemt de wachtlijst het over.",
    opensAt: "Inschrijvingen vanaf",
    closesAt: "Inschrijvingen tot",
    fee: "Bijdrage (€)",
    feeHint: "Facultatief, te betalen per overschrijving met de gestructureerde mededeling. Geen online betaling.",
    confirmHours: "Bevestigingstermijn (uren)",
    confirmHint: "Een vrijgekomen plaats wordt aan de volgende op de wachtlijst aangeboden, die ze binnen deze termijn moet bevestigen.",
    reminders: "Herinneringen per e-mail 7 dagen en 1 dag vooraf",
    survey: "Tevredenheidsvragenlijst na het evenement",
    questions: "Vragen bij de inschrijving",
    questionsHint: "Eén vraag per regel. Eindig met « ? » voor een ja/nee-antwoord, voeg « * » toe om ze verplicht te maken.",
    surveyQuestions: "Vragen van de vragenlijst",
    surveyHint: "Eén vraag per regel, naast de score op 5.",
    link: "Inschrijvingslink",
    copy: "Link kopiëren",
    copied: "Link gekopieerd.",
    export: "Ingeschrevenen exporteren (Excel)",
    counts: "{confirmed} ingeschreven · {waiting} wachtend · {present} aanwezig",
    window: { before: "Inschrijvingen nog niet open", open: "Inschrijvingen open", closed: "Inschrijvingen gesloten" },
    statuses: { confirmed: "Ingeschreven", waiting: "Wachtlijst", offered: "Plaats aangeboden", cancelled: "Afgezegd" },
    eventCancelled: "Evenement geannuleerd",
    cancelEvent: "Evenement annuleren",
    cancelReason: "Reden (gestuurd naar de ingeschrevenen)",
    tabs: { people: "Ingeschrevenen", checkin: "Aanmelding", opinions: "Meningen" },
    tabsLabel: "Onderdelen van het evenement",
    noPeople: "Nog niemand ingeschreven.",
    needs: "Noden",
    needLabels: { wheelchair: "Rolstoel", helper: "Begeleider", transport: "Aangepast vervoer" },
    diet: "Dieet",
    image: "Beeldrecht",
    noImage: "Geen foto",
    paid: "Betaald",
    unpaid: "Te betalen",
    markPaid: "Als betaald markeren",
    checkIn: "Aanmelden",
    checkedIn: "Aanwezig",
    present: "Aanwezigen",
    scanHint: "Elke ingeschrevene heeft een QR-code in zijn persoonlijke link: scan ze met de camera van de telefoon, of meld hier aan.",
    removeRegistration: "Inschrijving verwijderen",
    message: "De ingeschrevenen schrijven",
    subject: "Onderwerp",
    body: "Bericht",
    send: "Versturen",
    sent: "Bericht verstuurd naar de ingeschrevenen.",
    opinions: "Meningen",
    noOpinions: "Nog geen meningen.",
    average: "Gemiddelde score: {n} op 5 ({count} meningen)",
    answersOf: "Antwoorden op « {q} »",
    checkinPage: { title: "Aanmelding", done: "{name} is aangemeld als aanwezig.", already: "{name} was al aangemeld.", failed: "Deze code hoort bij geen enkele inschrijving van uw club.", back: "Terug naar de evenementen" },
    public: {
      places: "Nog {n} plaatsen",
      full: "Volzet: u komt op de wachtlijst.",
      free: "Gratis",
      notYet: "De inschrijvingen openen op {date}.",
      over: "De inschrijvingen zijn gesloten.",
      cancelled: "Dit evenement is geannuleerd.",
      feeLine: "Bijdrage: {amount}, te betalen per overschrijving.",
      register: "Inschrijven",
      name: "Naam en voornaam",
      email: "E-mailadres",
      phone: "Telefoon (optioneel)",
      needs: "Toegankelijkheidsnoden",
      consentData: "Ik ga akkoord dat de club deze gegevens gebruikt om het evenement te organiseren (verplicht).",
      consentImage: "Ik ga akkoord om op foto's en video's van de club te verschijnen (optioneel).",
      yes: "Ja",
      no: "Nee",
      done: "Genoteerd: u bent ingeschreven. U kreeg een e-mail met uw persoonlijke link.",
      waiting: "Het evenement is volzet: u staat op de wachtlijst. U wordt verwittigd als er een plaats vrijkomt.",
      offered: "Er is een plaats vrijgekomen voor u: bevestig voor {date}.",
      confirm: "Mijn plaats bevestigen",
      withdraw: "Mij uitschrijven",
      withdrawn: "Uw inschrijving is geannuleerd.",
      yourStatus: "Uw inschrijving: {status}",
      keepLink: "Bewaar deze link: hiermee kunt u bevestigen, u uitschrijven en uw mening geven.",
      pay: "Betaling",
      paidLine: "Betaling ontvangen. Dank u.",
      qr: "Uw toegangscode, te tonen aan het onthaal",
      opinion: "Uw mening",
      rating: "Score op 5",
      thanks: "Dank u voor uw mening.",
      notFound: "Dit evenement bestaat niet of is niet meer open.",
    },
    mail: {
      confirmedTitle: "Inschrijving bevestigd: {event}",
      confirmed: "Uw inschrijving voor « {event} » op {date} is bevestigd. Uw persoonlijke link om ze te beheren:",
      waitingTitle: "Wachtlijst: {event}",
      waiting: "« {event} » op {date} is volzet: u staat op de wachtlijst. Uw persoonlijke link:",
      offerTitle: "Een plaats voor u: {event}",
      offer: "Er is een plaats vrijgekomen voor « {event} » op {date}. Bevestig ze voor {until}, anders gaat ze naar de volgende persoon:",
      reminderTitle: "Herinnering: {event}",
      reminder7: "« {event} » vindt over een week plaats, op {date}. Uw persoonlijke link:",
      reminder1: "« {event} » vindt morgen plaats, op {date}. Denk aan uw toegangscode:",
      surveyTitle: "Uw mening over {event}",
      survey: "Bedankt voor uw deelname aan « {event} ». Twee minuten om ons uw mening te geven:",
      cancelledTitle: "Geannuleerd: {event}",
      cancelled: "« {event} » op {date} is geannuleerd. {reason}",
      task: "Organiseren: {event}",
    },
    errors: {
      WINDOW_CLOSED: "De inschrijvingen zijn niet open.",
      ALREADY_REGISTERED: "Dit adres is al ingeschreven voor dit evenement.",
      OFFER_EXPIRED: "De termijn om deze plaats te bevestigen is verstreken.",
      EVENT_CANCELLED: "Dit evenement is geannuleerd.",
      ALREADY_OPEN: "Deze afspraak is al opengesteld voor het publiek.",
      ANSWER_REQUIRED: "Een verplichte vraag is niet beantwoord.",
      SURVEY_CLOSED: "De vragenlijst is nog niet of niet meer open.",
      INVALID_WINDOW: "Het einde van de inschrijvingen moet na het begin liggen, voor de start van het evenement.",
    },
  },
  en: {
    title: "Open events",
    intro: "Discovery days, camps, dinners and tournaments: registration by a simple link, without an account, with a waiting list and check-in.",
    loading: "Loading the events…",
    unavailable: "Open events are not available right now.",
    saved: "Saved.",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    open: "Open an event",
    openTitle: "Open an event to the public",
    noEvents: "No open event yet.",
    noCandidates: "No upcoming appointment in the calendar. Create it in the calendar first.",
    event: "Calendar appointment",
    series: "Also open the other dates of the series",
    description: "Presentation",
    capacity: "Places",
    capacityHint: "Empty: no limit. Beyond, the waiting list takes over.",
    opensAt: "Registration from",
    closesAt: "Registration until",
    fee: "Fee (€)",
    feeHint: "Optional, paid by transfer with the structured communication. No online payment.",
    confirmHours: "Time to confirm (hours)",
    confirmHint: "A freed place is offered to the next on the waiting list, who has this time to confirm it.",
    reminders: "E-mail reminders 7 days and 1 day before",
    survey: "Opinion survey after the event",
    questions: "Registration questions",
    questionsHint: "One question per line. End with « ? » for a yes or no answer, add « * » to make it required.",
    surveyQuestions: "Survey questions",
    surveyHint: "One question per line, besides the rating out of 5.",
    link: "Registration link",
    copy: "Copy the link",
    copied: "Link copied.",
    export: "Export the registered people (Excel)",
    counts: "{confirmed} registered · {waiting} waiting · {present} present",
    window: { before: "Registration not open yet", open: "Registration open", closed: "Registration closed" },
    statuses: { confirmed: "Registered", waiting: "Waiting", offered: "Place offered", cancelled: "Withdrawn" },
    eventCancelled: "Event cancelled",
    cancelEvent: "Cancel the event",
    cancelReason: "Reason (sent to the registered people)",
    tabs: { people: "Registered", checkin: "Check-in", opinions: "Opinions" },
    tabsLabel: "Event sections",
    noPeople: "Nobody has registered yet.",
    needs: "Needs",
    needLabels: { wheelchair: "Wheelchair", helper: "Helper", transport: "Adapted transport" },
    diet: "Diet",
    image: "Image rights",
    noImage: "No photo",
    paid: "Paid",
    unpaid: "To pay",
    markPaid: "Mark as paid",
    checkIn: "Check in",
    checkedIn: "Present",
    present: "Present",
    scanHint: "Each registered person has a QR code in their personal link: scan it with the phone's camera, or check in here.",
    removeRegistration: "Remove the registration",
    message: "Write to the registered people",
    subject: "Subject",
    body: "Message",
    send: "Send",
    sent: "Message sent to the registered people.",
    opinions: "Opinions",
    noOpinions: "No opinion yet.",
    average: "Average rating: {n} out of 5 ({count} opinions)",
    answersOf: "Answers to « {q} »",
    checkinPage: { title: "Check-in", done: "{name} is checked in.", already: "{name} was already checked in.", failed: "This code matches no registration of your club.", back: "Back to the events" },
    public: {
      places: "{n} places left",
      full: "Full: you will be on the waiting list.",
      free: "Free",
      notYet: "Registration opens on {date}.",
      over: "Registration is closed.",
      cancelled: "This event is cancelled.",
      feeLine: "Fee: {amount}, to pay by transfer.",
      register: "Register",
      name: "Full name",
      email: "E-mail address",
      phone: "Phone (optional)",
      needs: "Accessibility needs",
      consentData: "I agree that the club uses this data to organise the event (required).",
      consentImage: "I agree to appear in the club's photos and videos (optional).",
      yes: "Yes",
      no: "No",
      done: "Done: you are registered. An e-mail with your personal link has been sent.",
      waiting: "The event is full: you are on the waiting list. You will be told if a place is freed.",
      offered: "A place was freed for you: confirm before {date}.",
      confirm: "Confirm my place",
      withdraw: "Withdraw",
      withdrawn: "Your registration is cancelled.",
      yourStatus: "Your registration: {status}",
      keepLink: "Keep this link: it lets you confirm, withdraw and give your opinion.",
      pay: "Payment",
      paidLine: "Payment received. Thank you.",
      qr: "Your entry code, to show at the desk",
      opinion: "Your opinion",
      rating: "Rating out of 5",
      thanks: "Thank you for your opinion.",
      notFound: "This event does not exist or is no longer open.",
    },
    mail: {
      confirmedTitle: "Registration confirmed: {event}",
      confirmed: "Your registration for « {event} » on {date} is confirmed. Your personal link to manage it:",
      waitingTitle: "Waiting list: {event}",
      waiting: "« {event} » on {date} is full: you are on the waiting list. Your personal link:",
      offerTitle: "A place for you: {event}",
      offer: "A place was freed for « {event} » on {date}. Confirm it before {until}, or it goes to the next person:",
      reminderTitle: "Reminder: {event}",
      reminder7: "« {event} » takes place in a week, on {date}. Your personal link:",
      reminder1: "« {event} » takes place tomorrow, on {date}. Remember your entry code:",
      surveyTitle: "Your opinion on {event}",
      survey: "Thank you for taking part in « {event} ». Two minutes to give us your opinion:",
      cancelledTitle: "Cancelled: {event}",
      cancelled: "« {event} » on {date} is cancelled. {reason}",
      task: "Organise: {event}",
    },
    errors: {
      WINDOW_CLOSED: "Registration is not open.",
      ALREADY_REGISTERED: "This address is already registered for this event.",
      OFFER_EXPIRED: "The time to confirm this place has passed.",
      EVENT_CANCELLED: "This event is cancelled.",
      ALREADY_OPEN: "This appointment is already open to the public.",
      ANSWER_REQUIRED: "A required question has no answer.",
      SURVEY_CLOSED: "The survey is not open (yet or any more).",
      INVALID_WINDOW: "Registration must end after it starts, before the event begins.",
    },
  },
};
