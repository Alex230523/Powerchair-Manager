import type { Locale } from "@/lib/locale";

/** 17: the « Vie de l'ASBL » page and its rules, in fr, nl, en. */
type Copy = {
  title: string;
  intro: string;
  loading: string;
  denied: string;
  tabs: Record<"register" | "meetings", string>;
  statuses: Record<"effective" | "adherent" | "none", string>;
  roles: Record<"president" | "vice_president" | "secretary" | "treasurer" | "director", string>;
  events: Record<"admission" | "resignation" | "exclusion" | "status" | "board_start" | "board_end" | "correction", string>;
  bodies: Record<"assembly" | "board", string>;
  members: string;
  noMember: string;
  admitted: string;
  mandateUntil: string;
  exportPdf: string;
  record: string;
  recordIntro: string;
  person: string;
  event: string;
  status: string;
  body: string;
  noBody: string;
  decisionOn: string;
  boardRole: string;
  boardUntil: string;
  reason: string;
  save: string;
  suggestions: string;
  suggestionsIntro: string;
  why: Record<"adult" | "parent", string>;
  prepare: string;
  history: string;
  recordedBy: string;
  correct: string;
  correctOf: string;
  correctReason: string;
  correctSave: string;
  corrects: string;
  deadline: string;
  deadlinePlanned: string;
  plan: string;
  kind: string;
  kinds: Record<"assembly" | "board", string>;
  meetingTitle: string;
  when: string;
  place: string;
  planSave: string;
  meetingStatuses: Record<"planned" | "held" | "closed" | "cancelled", string>;
  steps: string;
  stepsText: string;
  inviteSent: string;
  inviteNotSent: string;
  sendInvite: string;
  agenda: string;
  majorities: Record<"simple" | "absolute" | "two_thirds" | "four_fifths", string>;
  itemKinds: Record<"accounts" | "budget" | "discharge" | "mandate" | "admission" | "exit" | "free", string>;
  addItem: string;
  itemTitle: string;
  itemKind: string;
  itemPerson: string;
  majority: string;
  up: string;
  down: string;
  remove: string;
  attendees: string;
  answers: Record<"none" | "present" | "absent", string>;
  present: string;
  proxyTo: string;
  noProxy: string;
  holds: string;
  quorum: string;
  quorumNone: string;
  quorumOk: string;
  quorumMissing: string;
  votes: string;
  for: string;
  against: string;
  abstain: string;
  saveVote: string;
  results: Record<"adopted" | "rejected", string>;
  second: string;
  secondWhen: string;
  close: string;
  minutes: string;
  saveMinutes: string;
  sign: string;
  signAs: Record<"president" | "secretary", string>;
  signName: string;
  signedBy: string;
  filed: string;
  cancel: string;
  myAnswer: string;
  iAttend: string;
  iCannot: string;
  giveProxy: string;
  saved: string;
  rules: string;
  rulesIntro: string;
  noticeDays: string;
  quorumPercent: string;
  secondWithoutQuorum: string;
  maxProxies: string;
  remoteVote: string;
  weighting: string;
  weightings: { equal: string; licences: string };
  weightOf: string;
  representatives: string;
  representativesIntro: string;
  noRepresentative: string;
  saveRepresentative: string;
  recordDelayDays: string;
  publicationDays: string;
  uboDays: string;
  majorityOf: string;
  saveRules: string;
  errors: Record<string, string>;
};
const fr: Copy = {
  title: "Vie de l'ASBL",
  intro: "Registre des membres, assemblée générale et conseil d'administration. Ce n'est pas un avis juridique : toutes les règles sont des réglages, à aligner sur les statuts du club.",
  loading: "Chargement…",
  denied: "Cette page est réservée à la présidence, au secrétariat et aux membres effectifs.",
  tabs: { register: "Registre des membres", meetings: "Assemblées et conseil" },
  statuses: { effective: "Membre effectif", adherent: "Membre adhérent", none: "Aucun" },
  roles: { president: "Président", vice_president: "Vice-président", secretary: "Secrétaire", treasurer: "Trésorier", director: "Administrateur" },
  events: { admission: "Admission", resignation: "Démission", exclusion: "Exclusion", status: "Changement de statut", board_start: "Début de mandat", board_end: "Fin de mandat", correction: "Correction" },
  bodies: { assembly: "Assemblée générale", board: "Conseil d'administration" },
  members: "Membres",
  noMember: "Aucun membre effectif ni adhérent inscrit pour l'instant.",
  admitted: "admis le {date}",
  mandateUntil: "{role} jusqu'au {date}",
  exportPdf: "Registre daté (PDF)",
  record: "Inscrire une décision",
  recordIntro: "Le statut associatif est décidé (AG ou conseil), jamais déduit de l'inscription sportive. Chaque décision ajoute une ligne datée au registre.",
  person: "Personne",
  event: "Décision",
  status: "Statut après la décision",
  body: "Décidé par",
  noBody: "Non précisé",
  decisionOn: "Date de la décision",
  boardRole: "Fonction",
  boardUntil: "Fin du mandat",
  reason: "Remarque",
  save: "Inscrire au registre",
  suggestions: "Suggestions",
  suggestionsIntro: "Personnes qui pourraient devenir membres effectifs. Rien n'est ajouté sans décision.",
  why: { adult: "adulte inscrit depuis plus d'une saison", parent: "parent très actif" },
  prepare: "Préparer l'admission",
  history: "Historique du registre",
  recordedBy: "inscrit par {name}",
  correct: "Corriger",
  correctOf: "Corriger la ligne : {name}",
  correctReason: "Motif de la correction",
  correctSave: "Ajouter la correction",
  corrects: "corrige une ligne précédente",
  deadline: "L'assemblée qui approuve les comptes {year} doit se tenir au plus tard le {date}.",
  deadlinePlanned: "Elle est planifiée.",
  plan: "Planifier une réunion",
  kind: "Réunion",
  kinds: { assembly: "Assemblée générale", board: "Conseil d'administration" },
  meetingTitle: "Titre",
  when: "Date et heure",
  place: "Lieu",
  planSave: "Planifier",
  meetingStatuses: { planned: "Prévue", held: "Tenue sans quorum", closed: "Clôturée", cancelled: "Annulée" },
  steps: "Étapes",
  stepsText: "Préparer les comptes : {prepare} · valider l'ordre du jour : {agenda} · invitation : {invite} · rappel : {reminder}",
  inviteSent: "Invitation envoyée le {date}",
  inviteNotSent: "Invitation envoyée seule à J-{days}",
  sendInvite: "Envoyer l'invitation maintenant",
  agenda: "Ordre du jour",
  majorities: { simple: "majorité simple", absolute: "majorité absolue", two_thirds: "deux tiers", four_fifths: "quatre cinquièmes" },
  itemKinds: { accounts: "Comptes", budget: "Budget", discharge: "Décharge", mandate: "Mandat", admission: "Admission", exit: "Sortie", free: "Point libre" },
  addItem: "Ajouter le point",
  itemTitle: "Point",
  itemKind: "Type",
  itemPerson: "Personne concernée",
  majority: "Majorité",
  up: "Monter",
  down: "Descendre",
  remove: "Retirer",
  attendees: "Invités",
  answers: { none: "Sans réponse", present: "Présent annoncé", absent: "Absent annoncé" },
  present: "Présent : {name}",
  proxyTo: "procuration à {name}",
  noProxy: "Aucune procuration",
  holds: "{n} procuration(s)",
  quorum: "Présents {present}, représentés {represented} sur {members}",
  quorumNone: "Pas de quorum demandé.",
  quorumOk: "Quorum atteint ({needed}).",
  quorumMissing: "Quorum non atteint ({needed} demandés).",
  votes: "Vote : {title}",
  for: "Pour",
  against: "Contre",
  abstain: "Abstentions",
  saveVote: "Enregistrer le vote",
  results: { adopted: "Adopté", rejected: "Rejeté" },
  second: "Réunir une seconde assemblée",
  secondWhen: "Date de la seconde assemblée",
  close: "Clôturer et rédiger le PV",
  minutes: "Procès-verbal",
  saveMinutes: "Enregistrer le PV",
  sign: "Signer",
  signAs: { president: "Signature du président", secretary: "Signature du secrétaire" },
  signName: "Nom du signataire",
  signedBy: "Signé par {name} le {date}",
  filed: "PV rangé dans Documents",
  cancel: "Annuler la réunion",
  myAnswer: "Ma réponse",
  iAttend: "Je serai présent",
  iCannot: "Je serai absent",
  giveProxy: "Donner procuration à",
  saved: "Enregistré.",
  rules: "Règles de l'ASBL",
  rulesIntro: "Selon les statuts du club : délai d'invitation, quorum, majorités, procurations. Ce n'est pas un avis juridique.",
  noticeDays: "Délai d'invitation (jours)",
  quorumPercent: "Quorum (% des membres effectifs, 0 = aucun)",
  secondWithoutQuorum: "Une seconde assemblée décide quel que soit le nombre de présents",
  maxProxies: "Procurations par membre",
  remoteVote: "Vote à distance autorisé",
  weighting: "Voix de chaque club",
  weightings: { equal: "Une voix par club", licences: "Une voix par licence active du club" },
  weightOf: "{n} voix",
  representatives: "Représentants des clubs",
  representativesIntro: "La personne qui porte la voix de chaque club affilié à l'assemblée générale (une personne qui a un mandat dans le club).",
  noRepresentative: "À choisir",
  saveRepresentative: "Enregistrer",
  recordDelayDays: "Délai d'inscription d'une décision au registre (jours)",
  publicationDays: "Délai de publication au Moniteur belge (jours)",
  uboDays: "Délai de mise à jour du registre UBO (jours)",
  majorityOf: "Majorité : {kind}",
  saveRules: "Enregistrer les règles",
  errors: {
    PROXY_LIMIT: "Ce membre détient déjà le nombre maximum de procurations.",
    PROXY_CHAIN: "Un membre qui détient une procuration ne peut pas donner la sienne.",
    NO_QUORUM: "Le quorum n'est pas atteint : pas de vote.",
    QUORUM_REACHED: "Le quorum est atteint : pas besoin d'une seconde assemblée.",
    ALREADY_SENT: "L'invitation est déjà partie.",
    MEETING_CLOSED: "La réunion est clôturée.",
    MEETING_SIGNED: "Le PV est signé : il ne se modifie plus.",
    MEETING_OPEN: "Clôturez d'abord la réunion.",
    REGISTER_FROZEN: "Une ligne du registre ne se modifie pas : ajoutez une correction.",
  },
};
const nl: Copy = {
  title: "Vzw-leven",
  intro: "Ledenregister, algemene vergadering en raad van bestuur. Dit is geen juridisch advies: alle regels zijn instellingen, af te stemmen op de statuten van de club.",
  loading: "Laden…",
  denied: "Deze pagina is voorbehouden aan het voorzitterschap, het secretariaat en de effectieve leden.",
  tabs: { register: "Ledenregister", meetings: "Vergaderingen en raad" },
  statuses: { effective: "Effectief lid", adherent: "Toegetreden lid", none: "Geen" },
  roles: { president: "Voorzitter", vice_president: "Ondervoorzitter", secretary: "Secretaris", treasurer: "Penningmeester", director: "Bestuurder" },
  events: { admission: "Toelating", resignation: "Ontslag", exclusion: "Uitsluiting", status: "Statuswijziging", board_start: "Begin van mandaat", board_end: "Einde van mandaat", correction: "Correctie" },
  bodies: { assembly: "Algemene vergadering", board: "Raad van bestuur" },
  members: "Leden",
  noMember: "Nog geen effectief of toegetreden lid ingeschreven.",
  admitted: "toegelaten op {date}",
  mandateUntil: "{role} tot {date}",
  exportPdf: "Gedateerd register (pdf)",
  record: "Een beslissing inschrijven",
  recordIntro: "Het verenigingsstatuut wordt beslist (AV of raad), nooit afgeleid uit de sportinschrijving. Elke beslissing voegt een gedateerde regel toe aan het register.",
  person: "Persoon",
  event: "Beslissing",
  status: "Statuut na de beslissing",
  body: "Beslist door",
  noBody: "Niet vermeld",
  decisionOn: "Datum van de beslissing",
  boardRole: "Functie",
  boardUntil: "Einde van het mandaat",
  reason: "Opmerking",
  save: "In het register inschrijven",
  suggestions: "Suggesties",
  suggestionsIntro: "Personen die effectief lid zouden kunnen worden. Niets wordt toegevoegd zonder beslissing.",
  why: { adult: "volwassene ingeschreven sinds meer dan een seizoen", parent: "zeer actieve ouder" },
  prepare: "De toelating voorbereiden",
  history: "Geschiedenis van het register",
  recordedBy: "ingeschreven door {name}",
  correct: "Corrigeren",
  correctOf: "De regel corrigeren: {name}",
  correctReason: "Reden van de correctie",
  correctSave: "De correctie toevoegen",
  corrects: "corrigeert een eerdere regel",
  deadline: "De vergadering die de rekeningen {year} goedkeurt, moet uiterlijk op {date} plaatsvinden.",
  deadlinePlanned: "Ze is gepland.",
  plan: "Een vergadering plannen",
  kind: "Vergadering",
  kinds: { assembly: "Algemene vergadering", board: "Raad van bestuur" },
  meetingTitle: "Titel",
  when: "Datum en uur",
  place: "Plaats",
  planSave: "Plannen",
  meetingStatuses: { planned: "Gepland", held: "Gehouden zonder quorum", closed: "Afgesloten", cancelled: "Geannuleerd" },
  steps: "Stappen",
  stepsText: "Rekeningen voorbereiden: {prepare} · agenda bevestigen: {agenda} · uitnodiging: {invite} · herinnering: {reminder}",
  inviteSent: "Uitnodiging verstuurd op {date}",
  inviteNotSent: "Uitnodiging vertrekt vanzelf op D-{days}",
  sendInvite: "De uitnodiging nu versturen",
  agenda: "Agenda",
  majorities: { simple: "gewone meerderheid", absolute: "volstrekte meerderheid", two_thirds: "twee derde", four_fifths: "vier vijfde" },
  itemKinds: { accounts: "Rekeningen", budget: "Begroting", discharge: "Kwijting", mandate: "Mandaat", admission: "Toelating", exit: "Uittreding", free: "Vrij punt" },
  addItem: "Het punt toevoegen",
  itemTitle: "Punt",
  itemKind: "Soort",
  itemPerson: "Betrokken persoon",
  majority: "Meerderheid",
  up: "Omhoog",
  down: "Omlaag",
  remove: "Verwijderen",
  attendees: "Genodigden",
  answers: { none: "Geen antwoord", present: "Aanwezig gemeld", absent: "Afwezig gemeld" },
  present: "Aanwezig: {name}",
  proxyTo: "volmacht aan {name}",
  noProxy: "Geen volmacht",
  holds: "{n} volmacht(en)",
  quorum: "Aanwezig {present}, vertegenwoordigd {represented} op {members}",
  quorumNone: "Geen quorum gevraagd.",
  quorumOk: "Quorum bereikt ({needed}).",
  quorumMissing: "Quorum niet bereikt ({needed} gevraagd).",
  votes: "Stemming: {title}",
  for: "Voor",
  against: "Tegen",
  abstain: "Onthoudingen",
  saveVote: "De stemming bewaren",
  results: { adopted: "Aangenomen", rejected: "Verworpen" },
  second: "Een tweede vergadering bijeenroepen",
  secondWhen: "Datum van de tweede vergadering",
  close: "Afsluiten en notulen opstellen",
  minutes: "Notulen",
  saveMinutes: "De notulen bewaren",
  sign: "Ondertekenen",
  signAs: { president: "Handtekening van de voorzitter", secretary: "Handtekening van de secretaris" },
  signName: "Naam van de ondertekenaar",
  signedBy: "Ondertekend door {name} op {date}",
  filed: "Notulen opgeborgen in Documenten",
  cancel: "De vergadering annuleren",
  myAnswer: "Mijn antwoord",
  iAttend: "Ik ben aanwezig",
  iCannot: "Ik ben afwezig",
  giveProxy: "Volmacht geven aan",
  saved: "Bewaard.",
  rules: "Regels van de vzw",
  rulesIntro: "Volgens de statuten van de club: uitnodigingstermijn, quorum, meerderheden, volmachten. Dit is geen juridisch advies.",
  noticeDays: "Uitnodigingstermijn (dagen)",
  quorumPercent: "Quorum (% van de effectieve leden, 0 = geen)",
  secondWithoutQuorum: "Een tweede vergadering beslist ongeacht het aantal aanwezigen",
  maxProxies: "Volmachten per lid",
  remoteVote: "Stemmen op afstand toegelaten",
  weighting: "Stemmen van elke club",
  weightings: { equal: "Eén stem per club", licences: "Eén stem per actieve licentie van de club" },
  weightOf: "{n} stem(men)",
  representatives: "Vertegenwoordigers van de clubs",
  representativesIntro: "De persoon die de stem van elke aangesloten club draagt op de algemene vergadering (iemand met een mandaat in de club).",
  noRepresentative: "Te kiezen",
  saveRepresentative: "Opslaan",
  recordDelayDays: "Termijn om een beslissing in het register in te schrijven (dagen)",
  publicationDays: "Termijn voor publicatie in het Belgisch Staatsblad (dagen)",
  uboDays: "Termijn om het UBO-register bij te werken (dagen)",
  majorityOf: "Meerderheid: {kind}",
  saveRules: "De regels bewaren",
  errors: {
    PROXY_LIMIT: "Dit lid heeft al het maximum aantal volmachten.",
    PROXY_CHAIN: "Een lid dat een volmacht heeft, kan de zijne niet geven.",
    NO_QUORUM: "Het quorum is niet bereikt: geen stemming.",
    QUORUM_REACHED: "Het quorum is bereikt: geen tweede vergadering nodig.",
    ALREADY_SENT: "De uitnodiging is al vertrokken.",
    MEETING_CLOSED: "De vergadering is afgesloten.",
    MEETING_SIGNED: "De notulen zijn ondertekend: ze wijzigen niet meer.",
    MEETING_OPEN: "Sluit eerst de vergadering af.",
    REGISTER_FROZEN: "Een regel van het register wijzigt niet: voeg een correctie toe.",
  },
};
const en: Copy = {
  title: "ASBL life",
  intro: "Register of members, general assembly and board. This is not legal advice: every rule is a setting, to align with the club's statutes.",
  loading: "Loading…",
  denied: "This page is for the presidency, the secretariat and the effective members.",
  tabs: { register: "Register of members", meetings: "Assemblies and board" },
  statuses: { effective: "Effective member", adherent: "Adherent member", none: "None" },
  roles: { president: "President", vice_president: "Vice-president", secretary: "Secretary", treasurer: "Treasurer", director: "Director" },
  events: { admission: "Admission", resignation: "Resignation", exclusion: "Exclusion", status: "Change of status", board_start: "Mandate starts", board_end: "Mandate ends", correction: "Correction" },
  bodies: { assembly: "General assembly", board: "Board" },
  members: "Members",
  noMember: "No effective or adherent member recorded yet.",
  admitted: "admitted on {date}",
  mandateUntil: "{role} until {date}",
  exportPdf: "Dated register (PDF)",
  record: "Record a decision",
  recordIntro: "The associative status is decided (assembly or board), never drawn from the sport registration. Each decision adds a dated line to the register.",
  person: "Person",
  event: "Decision",
  status: "Status after the decision",
  body: "Decided by",
  noBody: "Not stated",
  decisionOn: "Date of the decision",
  boardRole: "Function",
  boardUntil: "End of the mandate",
  reason: "Note",
  save: "Write in the register",
  suggestions: "Suggestions",
  suggestionsIntro: "People who could become effective members. Nothing is added without a decision.",
  why: { adult: "adult registered for more than a season", parent: "very active parent" },
  prepare: "Prepare the admission",
  history: "History of the register",
  recordedBy: "recorded by {name}",
  correct: "Correct",
  correctOf: "Correct the line: {name}",
  correctReason: "Reason for the correction",
  correctSave: "Add the correction",
  corrects: "corrects an earlier line",
  deadline: "The assembly approving the {year} accounts must be held by {date}.",
  deadlinePlanned: "It is planned.",
  plan: "Plan a meeting",
  kind: "Meeting",
  kinds: { assembly: "General assembly", board: "Board" },
  meetingTitle: "Title",
  when: "Date and time",
  place: "Place",
  planSave: "Plan",
  meetingStatuses: { planned: "Planned", held: "Held without quorum", closed: "Closed", cancelled: "Cancelled" },
  steps: "Steps",
  stepsText: "Prepare the accounts: {prepare} · confirm the agenda: {agenda} · invitation: {invite} · reminder: {reminder}",
  inviteSent: "Invitation sent on {date}",
  inviteNotSent: "Invitation leaves by itself at D-{days}",
  sendInvite: "Send the invitation now",
  agenda: "Agenda",
  majorities: { simple: "simple majority", absolute: "absolute majority", two_thirds: "two thirds", four_fifths: "four fifths" },
  itemKinds: { accounts: "Accounts", budget: "Budget", discharge: "Discharge", mandate: "Mandate", admission: "Admission", exit: "Leaving", free: "Free point" },
  addItem: "Add the point",
  itemTitle: "Point",
  itemKind: "Kind",
  itemPerson: "Person concerned",
  majority: "Majority",
  up: "Move up",
  down: "Move down",
  remove: "Remove",
  attendees: "Invited",
  answers: { none: "No answer", present: "Will attend", absent: "Will not attend" },
  present: "Present: {name}",
  proxyTo: "proxy to {name}",
  noProxy: "No proxy",
  holds: "{n} proxy(ies)",
  quorum: "Present {present}, represented {represented} out of {members}",
  quorumNone: "No quorum asked.",
  quorumOk: "Quorum reached ({needed}).",
  quorumMissing: "Quorum missed ({needed} asked).",
  votes: "Vote: {title}",
  for: "For",
  against: "Against",
  abstain: "Abstentions",
  saveVote: "Save the vote",
  results: { adopted: "Adopted", rejected: "Rejected" },
  second: "Hold a second assembly",
  secondWhen: "Date of the second assembly",
  close: "Close and write the minutes",
  minutes: "Minutes",
  saveMinutes: "Save the minutes",
  sign: "Sign",
  signAs: { president: "President's signature", secretary: "Secretary's signature" },
  signName: "Signatory's name",
  signedBy: "Signed by {name} on {date}",
  filed: "Minutes filed in Documents",
  cancel: "Cancel the meeting",
  myAnswer: "My answer",
  iAttend: "I will attend",
  iCannot: "I will not attend",
  giveProxy: "Give a proxy to",
  saved: "Saved.",
  rules: "The ASBL's rules",
  rulesIntro: "As the club's statutes say: notice, quorum, majorities, proxies. This is not legal advice.",
  noticeDays: "Notice (days)",
  quorumPercent: "Quorum (% of effective members, 0 = none)",
  secondWithoutQuorum: "A second assembly decides whatever the number present",
  maxProxies: "Proxies per member",
  remoteVote: "Remote vote allowed",
  weighting: "Each club's votes",
  weightings: { equal: "One vote per club", licences: "One vote per active licence of the club" },
  weightOf: "{n} vote(s)",
  representatives: "The clubs' representatives",
  representativesIntro: "The person who carries each affiliated club's voice at the general assembly (someone with a mandate in the club).",
  noRepresentative: "To choose",
  saveRepresentative: "Save",
  recordDelayDays: "Delay to write a decision in the register (days)",
  publicationDays: "Delay for the publication in the Belgian Official Gazette (days)",
  uboDays: "Delay to update the UBO register (days)",
  majorityOf: "Majority: {kind}",
  saveRules: "Save the rules",
  errors: {
    PROXY_LIMIT: "This member already holds the maximum number of proxies.",
    PROXY_CHAIN: "A member holding a proxy cannot give his own.",
    NO_QUORUM: "The quorum is not reached: no vote.",
    QUORUM_REACHED: "The quorum is reached: no second assembly needed.",
    ALREADY_SENT: "The invitation has already left.",
    MEETING_CLOSED: "The meeting is closed.",
    MEETING_SIGNED: "The minutes are signed: they no longer change.",
    MEETING_OPEN: "Close the meeting first.",
    REGISTER_FROZEN: "A line of the register does not change: add a correction.",
  },
};
export const associationCopy: Record<Locale, Copy> = { fr, nl, en };
