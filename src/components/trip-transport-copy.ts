import type { Locale } from "@/lib/locale";

/** 3: the words of transport logistics (modes, vehicles, rounds, tasks, road sheet, costs) in fr, nl, en. */
type Copy = {
  mode: string;
  modes: Record<"transport" | "stay", string>;
  modeHint: string;
  serves: string;
  servesNone: string;
  servesKinds: Record<"event" | "match" | "tournamentDay", string>;
  servesHint: string;
  departure: string;
  arrival: string;
  vehicles: string;
  preview: string;
  openFull: string;
  kind: string;
  kinds: Record<"club" | "rental" | "private", string>;
  renter: string;
  noRenter: string;
  pickupAddress: string;
  returnAddress: string;
  bookingRef: string;
  plannedCost: string;
  deposit: string;
  owner: string;
  ownerContact: string;
  noOwner: string;
  ramp: string;
  mileage: string;
  distance: string;
  mileageAt: string;
  noRate: string;
  fuel: string;
  equipment: string;
  drivers: string;
  driverLegs: string;
  addDriver: string;
  removeDriver: string;
  driverPick: string;
  covering: string;
  others: string;
  licenceVerified: string;
  licenceDeclared: string;
  licenceMissing: string;
  chairs: string;
  ownership: Record<string, string>;
  load: string;
  problems: Record<"seats" | "wheelchair" | "ramp", string>;
  fits: string;
  round: string;
  noStops: string;
  suggest: string;
  editRound: string;
  stopKinds: Record<"pickup_vehicle" | "load_equipment" | "pick_passengers" | "drive" | "arrive" | "reload" | "unload" | "return_vehicle" | "other", string>;
  stopKind: string;
  stopLabel: string;
  address: string;
  place: string;
  at: string;
  minutes: string;
  notes: string;
  people: string;
  up: string;
  down: string;
  removeStop: string;
  addStop: string;
  saveRound: string;
  moveHint: string;
  estimate: string;
  route: string;
  minutesText: string;
  taskSent: string;
  taskDone: string;
  stepOf: string;
  createTasks: string;
  tasksIntro: string;
  noTasks: string;
  taskTitle: string;
  taskDay: string;
  taskTime: string;
  taskPeople: string;
  taskRemove: string;
  taskRemoveSent: string;
  sendTasks: string;
  sent: string;
  inTodo: string;
  words: Record<"book" | "pickup_vehicle" | "load_equipment" | "pick_passengers" | "drive" | "arrive" | "reload" | "unload" | "return_vehicle" | "other", string>;
  importInvited: string;
  imported: string;
  sheet: string;
  sheetTitle: string;
  sheetIntro: string;
  print: string;
  phones: string;
  roles: Record<"driver" | "rental" | "owner", string>;
  passengers: string;
  care: string;
  careNote: string;
  nothing: string;
  booking: string;
  emergency: string;
  contact: string;
  costs: string;
  costRental: string;
  costFuel: string;
  costMileage: string;
  costTotal: string;
  settingsTitle: string;
  settingsIntro: string;
  rate: string;
  rateSave: string;
  rateSaved: string;
  saved: string;
  errors: Record<string, string>;
};

export const tripTransportCopy: Record<Locale, Copy> = {
  fr: {
    mode: "Mode",
    modes: { transport: "Transport", stay: "Séjour" },
    modeHint: "Transport : un aller-retour dans la journée. Séjour : plusieurs jours, avec hébergement, programme et budget.",
    serves: "Pour",
    servesNone: "Rien de précis",
    servesKinds: { event: "Activité", match: "Match", tournamentDay: "Journée de tournoi" },
    servesHint: "Choisir une activité, un match ou une journée de tournoi reprend sa date, son heure et son lieu.",
    departure: "Départ {time}",
    arrival: "Arrivée {time}",
    vehicles: "{n} véhicule(s)",
    preview: "Voir le détail : {title}",
    openFull: "Ouvrir la fiche complète",
    kind: "Type de véhicule",
    kinds: { club: "Véhicule du club", rental: "Location", private: "Véhicule d'un particulier" },
    renter: "Loueur",
    noRenter: "Choisir un loueur",
    pickupAddress: "Adresse de retrait",
    returnAddress: "Adresse de retour (si différente)",
    bookingRef: "Numéro de réservation",
    plannedCost: "Coût prévu (€)",
    deposit: "Caution (€)",
    owner: "Propriétaire (membre)",
    ownerContact: "Propriétaire (contact)",
    noOwner: "Aucun",
    ramp: "Rampe ou lift",
    mileage: "Indemnité kilométrique",
    distance: "Distance aller-retour (km)",
    mileageAt: "Au taux de {rate} par km",
    noRate: "Le taux se fixe dans Réglages › Activités.",
    fuel: "Carburant prévu (€)",
    equipment: "Autre matériel (ballons, chargeurs, batteries, trousse, chaises)",
    drivers: "Chauffeurs",
    driverLegs: "Trajet de {name}",
    addDriver: "Ajouter ce chauffeur",
    removeDriver: "Retirer {name}",
    driverPick: "Chercher un chauffeur",
    covering: "Permis adapté",
    others: "Autres membres (sans le permis requis)",
    licenceVerified: "Permis vérifié",
    licenceDeclared: "Permis déclaré",
    licenceMissing: "Sans le permis {need}",
    chairs: "Fauteuils transportés",
    ownership: { club: "club", player: "joueur", loan: "prêt" },
    load: "Assis {seated}/{seats} · places fauteuil {places}/{wheel}",
    problems: {
      seats: "Trop de passagers assis pour les places du véhicule.",
      wheelchair: "Plus de fauteuils (joueurs dans leur fauteuil et fauteuils transportés) que de places fauteuil.",
      ramp: "Un fauteuil voyage à bord mais le véhicule n'a ni rampe ni lift.",
    },
    fits: "Le chargement tient dans le véhicule.",
    round: "Tournée",
    noStops: "Aucune étape pour l'instant.",
    suggest: "Proposer les étapes",
    editRound: "Modifier la tournée",
    stopKinds: {
      pickup_vehicle: "Retrait du véhicule",
      load_equipment: "Chargement du matériel",
      pick_passengers: "Prise des passagers",
      drive: "Trajet",
      arrive: "Arrivée",
      reload: "Rechargement",
      unload: "Déchargement au local",
      return_vehicle: "Retour du véhicule",
      other: "Autre",
    },
    stopKind: "Étape",
    stopLabel: "Précision",
    address: "Adresse",
    place: "Lieu du club",
    at: "Jour et heure",
    minutes: "Durée du trajet (min)",
    notes: "Remarque",
    people: "Responsables",
    up: "Monter",
    down: "Descendre",
    removeStop: "Supprimer l'étape",
    addStop: "Ajouter une étape",
    saveRound: "Enregistrer la tournée",
    moveHint: "Glissez une étape pour la déplacer, ou utilisez Monter et Descendre.",
    estimate: "Estimer le trajet",
    route: "Itinéraire",
    minutesText: "{n} min de trajet",
    taskSent: "Tâche envoyée",
    taskDone: "Tâche faite",
    stepOf: "Étape {n} : {kind}",
    createTasks: "Créer les tâches",
    tasksIntro: "Les tâches tirées des étapes. Vérifiez-les puis envoyez-les dans la to-do (catégorie Sport, liées au déplacement) : chaque personne est prévenue et reçoit les rappels. Envoyer à nouveau met à jour les mêmes tâches.",
    noTasks: "Ajoutez des étapes aux véhicules pour en tirer des tâches.",
    taskTitle: "Tâche",
    taskDay: "Date",
    taskTime: "Heure",
    taskPeople: "Personnes",
    taskRemove: "Ne pas créer",
    taskRemoveSent: "Retirer de la to-do",
    sendTasks: "Envoyer dans la to-do",
    sent: "{created} tâche(s) créée(s), {updated} mise(s) à jour.",
    inTodo: "Dans la to-do",
    words: {
      book: "Réserver le véhicule",
      pickup_vehicle: "Aller chercher le véhicule",
      load_equipment: "Charger le matériel",
      pick_passengers: "Prendre les passagers",
      drive: "Conduire",
      arrive: "Arrivée",
      reload: "Recharger le matériel",
      unload: "Décharger au local",
      return_vehicle: "Rendre le véhicule",
      other: "Étape",
    },
    importInvited: "Ajouter les invités de l'activité",
    imported: "{n} personne(s) ajoutée(s).",
    sheet: "Feuille de route",
    sheetTitle: "Feuille de route : {title}",
    sheetIntro: "Votre véhicule, ses étapes et ses heures, les téléphones utiles.",
    print: "Imprimer",
    phones: "Téléphones utiles",
    roles: { driver: "Chauffeur", rental: "Loueur", owner: "Propriétaire" },
    passengers: "Passagers",
    care: "Consignes de soin",
    careNote: "Visibles seulement par qui a le droit d'accès aux données sensibles.",
    nothing: "Aucun véhicule ne vous concerne pour ce déplacement.",
    booking: "Réservation {ref}",
    emergency: "En cas d'urgence",
    contact: "Contact sur place",
    costs: "Coûts du transport prévus",
    costRental: "Location",
    costFuel: "Carburant",
    costMileage: "Indemnités kilométriques",
    costTotal: "Total prévu",
    settingsTitle: "Déplacements",
    settingsIntro: "Le taux de l'indemnité kilométrique des véhicules de particuliers.",
    rate: "Taux (€ par km)",
    rateSave: "Enregistrer le taux",
    rateSaved: "Taux enregistré.",
    saved: "Enregistré.",
    errors: {
      NO_EVENT: "Ce déplacement n'est lié à aucune activité.",
      ESTIMATOR_OFF: "L'estimation n'est pas activée : saisissez la durée.",
      NO_ADDRESS: "Il faut l'adresse de cette étape et de la précédente.",
      NO_PREVIOUS: "La première étape n'a pas de trajet avant elle.",
      ESTIMATE_FAILED: "L'estimation n'a pas abouti : saisissez la durée.",
    },
  },
  nl: {
    mode: "Modus",
    modes: { transport: "Vervoer", stay: "Verblijf" },
    modeHint: "Vervoer: heen en terug op één dag. Verblijf: meerdere dagen, met verblijf, programma en budget.",
    serves: "Voor",
    servesNone: "Niets bepaalds",
    servesKinds: { event: "Activiteit", match: "Wedstrijd", tournamentDay: "Toernooidag" },
    servesHint: "Een activiteit, wedstrijd of toernooidag kiezen neemt de datum, het uur en de plaats over.",
    departure: "Vertrek {time}",
    arrival: "Aankomst {time}",
    vehicles: "{n} voertuig(en)",
    preview: "Details bekijken: {title}",
    openFull: "De volledige fiche openen",
    kind: "Soort voertuig",
    kinds: { club: "Voertuig van de club", rental: "Huur", private: "Voertuig van een particulier" },
    renter: "Verhuurder",
    noRenter: "Een verhuurder kiezen",
    pickupAddress: "Ophaaladres",
    returnAddress: "Terugbrengadres (indien anders)",
    bookingRef: "Reservatienummer",
    plannedCost: "Voorziene kost (€)",
    deposit: "Waarborg (€)",
    owner: "Eigenaar (lid)",
    ownerContact: "Eigenaar (contact)",
    noOwner: "Geen",
    ramp: "Oprijplaat of lift",
    mileage: "Kilometervergoeding",
    distance: "Afstand heen en terug (km)",
    mileageAt: "Aan {rate} per km",
    noRate: "Het tarief stelt u in bij Instellingen › Activiteiten.",
    fuel: "Voorziene brandstof (€)",
    equipment: "Ander materiaal (ballen, laders, batterijen, EHBO-koffer, stoelen)",
    drivers: "Chauffeurs",
    driverLegs: "Rit van {name}",
    addDriver: "Deze chauffeur toevoegen",
    removeDriver: "{name} verwijderen",
    driverPick: "Een chauffeur zoeken",
    covering: "Gepast rijbewijs",
    others: "Andere leden (zonder het vereiste rijbewijs)",
    licenceVerified: "Rijbewijs nagekeken",
    licenceDeclared: "Rijbewijs aangegeven",
    licenceMissing: "Zonder rijbewijs {need}",
    chairs: "Vervoerde rolstoelen",
    ownership: { club: "club", player: "speler", loan: "lening" },
    load: "Zittend {seated}/{seats} · rolstoelplaatsen {places}/{wheel}",
    problems: {
      seats: "Te veel zittende passagiers voor de plaatsen van het voertuig.",
      wheelchair: "Meer rolstoelen (spelers in hun rolstoel en vervoerde rolstoelen) dan rolstoelplaatsen.",
      ramp: "Er reist een rolstoel mee maar het voertuig heeft geen oprijplaat of lift.",
    },
    fits: "De lading past in het voertuig.",
    round: "Rit",
    noStops: "Nog geen etappes.",
    suggest: "Etappes voorstellen",
    editRound: "De rit wijzigen",
    stopKinds: {
      pickup_vehicle: "Voertuig ophalen",
      load_equipment: "Materiaal laden",
      pick_passengers: "Passagiers ophalen",
      drive: "Rit",
      arrive: "Aankomst",
      reload: "Opnieuw laden",
      unload: "Uitladen in het lokaal",
      return_vehicle: "Voertuig terugbrengen",
      other: "Andere",
    },
    stopKind: "Etappe",
    stopLabel: "Verduidelijking",
    address: "Adres",
    place: "Locatie van de club",
    at: "Dag en uur",
    minutes: "Rijtijd (min)",
    notes: "Opmerking",
    people: "Verantwoordelijken",
    up: "Omhoog",
    down: "Omlaag",
    removeStop: "De etappe verwijderen",
    addStop: "Een etappe toevoegen",
    saveRound: "De rit bewaren",
    moveHint: "Sleep een etappe om ze te verplaatsen, of gebruik Omhoog en Omlaag.",
    estimate: "De rit schatten",
    route: "Route",
    minutesText: "{n} min rijden",
    taskSent: "Taak verstuurd",
    taskDone: "Taak klaar",
    stepOf: "Etappe {n}: {kind}",
    createTasks: "De taken aanmaken",
    tasksIntro: "De taken uit de etappes. Kijk ze na en stuur ze naar de to-do (categorie Sport, gekoppeld aan de verplaatsing): elke persoon wordt verwittigd en krijgt de herinneringen. Opnieuw versturen werkt dezelfde taken bij.",
    noTasks: "Voeg etappes toe aan de voertuigen om er taken uit te halen.",
    taskTitle: "Taak",
    taskDay: "Datum",
    taskTime: "Uur",
    taskPeople: "Personen",
    taskRemove: "Niet aanmaken",
    taskRemoveSent: "Uit de to-do halen",
    sendTasks: "Naar de to-do sturen",
    sent: "{created} taak/taken aangemaakt, {updated} bijgewerkt.",
    inTodo: "In de to-do",
    words: {
      book: "Het voertuig reserveren",
      pickup_vehicle: "Het voertuig ophalen",
      load_equipment: "Het materiaal laden",
      pick_passengers: "De passagiers ophalen",
      drive: "Rijden",
      arrive: "Aankomst",
      reload: "Het materiaal opnieuw laden",
      unload: "Uitladen in het lokaal",
      return_vehicle: "Het voertuig terugbrengen",
      other: "Etappe",
    },
    importInvited: "De genodigden van de activiteit toevoegen",
    imported: "{n} persoon/personen toegevoegd.",
    sheet: "Routeblad",
    sheetTitle: "Routeblad: {title}",
    sheetIntro: "Uw voertuig, de etappes en uren, de nuttige telefoonnummers.",
    print: "Afdrukken",
    phones: "Nuttige telefoonnummers",
    roles: { driver: "Chauffeur", rental: "Verhuurder", owner: "Eigenaar" },
    passengers: "Passagiers",
    care: "Zorginstructies",
    careNote: "Alleen zichtbaar voor wie toegang heeft tot gevoelige gegevens.",
    nothing: "Geen enkel voertuig betreft u voor deze verplaatsing.",
    booking: "Reservatie {ref}",
    emergency: "In geval van nood",
    contact: "Contact ter plaatse",
    costs: "Voorziene vervoerskosten",
    costRental: "Huur",
    costFuel: "Brandstof",
    costMileage: "Kilometervergoedingen",
    costTotal: "Totaal voorzien",
    settingsTitle: "Verplaatsingen",
    settingsIntro: "Het tarief van de kilometervergoeding voor voertuigen van particulieren.",
    rate: "Tarief (€ per km)",
    rateSave: "Het tarief bewaren",
    rateSaved: "Tarief bewaard.",
    saved: "Bewaard.",
    errors: {
      NO_EVENT: "Deze verplaatsing is aan geen enkele activiteit gekoppeld.",
      ESTIMATOR_OFF: "De schatting is niet ingeschakeld: vul de duur in.",
      NO_ADDRESS: "Het adres van deze etappe en van de vorige is nodig.",
      NO_PREVIOUS: "De eerste etappe heeft geen rit ervoor.",
      ESTIMATE_FAILED: "De schatting lukte niet: vul de duur in.",
    },
  },
  en: {
    mode: "Mode",
    modes: { transport: "Transport", stay: "Stay" },
    modeHint: "Transport: there and back within the day. Stay: several days, with accommodation, programme and budget.",
    serves: "For",
    servesNone: "Nothing in particular",
    servesKinds: { event: "Activity", match: "Match", tournamentDay: "Tournament day" },
    servesHint: "Choosing an activity, a match or a tournament day takes over its date, time and place.",
    departure: "Leaves {time}",
    arrival: "Arrives {time}",
    vehicles: "{n} vehicle(s)",
    preview: "See the details: {title}",
    openFull: "Open the full page",
    kind: "Kind of vehicle",
    kinds: { club: "Club vehicle", rental: "Rental", private: "Private vehicle" },
    renter: "Rental company",
    noRenter: "Choose a rental company",
    pickupAddress: "Pick-up address",
    returnAddress: "Return address (if different)",
    bookingRef: "Booking number",
    plannedCost: "Planned cost (€)",
    deposit: "Deposit (€)",
    owner: "Owner (member)",
    ownerContact: "Owner (contact)",
    noOwner: "None",
    ramp: "Ramp or lift",
    mileage: "Mileage allowance",
    distance: "Round-trip distance (km)",
    mileageAt: "At {rate} per km",
    noRate: "The rate is set in Settings › Activities.",
    fuel: "Planned fuel (€)",
    equipment: "Other equipment (balls, chargers, batteries, first aid kit, chairs)",
    drivers: "Drivers",
    driverLegs: "Journey of {name}",
    addDriver: "Add this driver",
    removeDriver: "Remove {name}",
    driverPick: "Find a driver",
    covering: "Right licence",
    others: "Other members (without the licence required)",
    licenceVerified: "Licence checked",
    licenceDeclared: "Licence declared",
    licenceMissing: "Without licence {need}",
    chairs: "Chairs carried",
    ownership: { club: "club", player: "player", loan: "loan" },
    load: "Seated {seated}/{seats} · wheelchair places {places}/{wheel}",
    problems: {
      seats: "Too many seated passengers for the vehicle's seats.",
      wheelchair: "More chairs (players in their chair and chairs carried) than wheelchair places.",
      ramp: "A chair travels on board but the vehicle has neither ramp nor lift.",
    },
    fits: "The load fits in the vehicle.",
    round: "Round",
    noStops: "No step yet.",
    suggest: "Propose the steps",
    editRound: "Edit the round",
    stopKinds: {
      pickup_vehicle: "Vehicle pick-up",
      load_equipment: "Loading the equipment",
      pick_passengers: "Picking up passengers",
      drive: "Drive",
      arrive: "Arrival",
      reload: "Reloading",
      unload: "Unloading at the club",
      return_vehicle: "Vehicle return",
      other: "Other",
    },
    stopKind: "Step",
    stopLabel: "Detail",
    address: "Address",
    place: "Club place",
    at: "Day and time",
    minutes: "Driving time (min)",
    notes: "Note",
    people: "People in charge",
    up: "Move up",
    down: "Move down",
    removeStop: "Delete the step",
    addStop: "Add a step",
    saveRound: "Save the round",
    moveHint: "Drag a step to move it, or use Move up and Move down.",
    estimate: "Estimate the drive",
    route: "Route",
    minutesText: "{n} min drive",
    taskSent: "Task sent",
    taskDone: "Task done",
    stepOf: "Step {n}: {kind}",
    createTasks: "Create the tasks",
    tasksIntro: "The tasks drawn from the steps. Check them, then send them to the to-do (category Sport, linked to the trip): each person is told and gets the reminders. Sending again updates the same tasks.",
    noTasks: "Add steps to the vehicles to draw tasks from them.",
    taskTitle: "Task",
    taskDay: "Date",
    taskTime: "Time",
    taskPeople: "People",
    taskRemove: "Do not create",
    taskRemoveSent: "Remove from the to-do",
    sendTasks: "Send to the to-do",
    sent: "{created} task(s) created, {updated} updated.",
    inTodo: "In the to-do",
    words: {
      book: "Book the vehicle",
      pickup_vehicle: "Pick up the vehicle",
      load_equipment: "Load the equipment",
      pick_passengers: "Pick up the passengers",
      drive: "Drive",
      arrive: "Arrival",
      reload: "Reload the equipment",
      unload: "Unload at the club",
      return_vehicle: "Return the vehicle",
      other: "Step",
    },
    importInvited: "Add the activity's invited people",
    imported: "{n} person(s) added.",
    sheet: "Road sheet",
    sheetTitle: "Road sheet: {title}",
    sheetIntro: "Your vehicle, its steps and times, the useful phone numbers.",
    print: "Print",
    phones: "Useful phone numbers",
    roles: { driver: "Driver", rental: "Rental company", owner: "Owner" },
    passengers: "Passengers",
    care: "Care instructions",
    careNote: "Visible only to those with access to sensitive data.",
    nothing: "No vehicle concerns you on this trip.",
    booking: "Booking {ref}",
    emergency: "In an emergency",
    contact: "Contact on site",
    costs: "Planned transport costs",
    costRental: "Rental",
    costFuel: "Fuel",
    costMileage: "Mileage allowances",
    costTotal: "Total planned",
    settingsTitle: "Trips",
    settingsIntro: "The mileage allowance's rate for private vehicles.",
    rate: "Rate (€ per km)",
    rateSave: "Save the rate",
    rateSaved: "Rate saved.",
    saved: "Saved.",
    errors: {
      NO_EVENT: "This trip is linked to no activity.",
      ESTIMATOR_OFF: "The estimate is not switched on: type the duration.",
      NO_ADDRESS: "The address of this step and of the previous one is needed.",
      NO_PREVIOUS: "The first step has no drive before it.",
      ESTIMATE_FAILED: "The estimate failed: type the duration.",
    },
  },
};
