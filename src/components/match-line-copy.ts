/** Wave 17 (C5): friendlies between clubs, the full line of a match, tournament matches. */
type Copy = {
  newFriendly: string;
  friendlyIntro: string;
  ourTeam: string;
  opponentTeam: string;
  otherOpponent: string;
  otherName: string;
  when: string;
  place: string;
  noPlace: string;
  venue: string;
  homeAway: string;
  message: string;
  send: string;
  cancel: string;
  invitations: string;
  invitationsIntro: string;
  invitedBy: string;
  accept: string;
  acceptOf: string;
  refuse: string;
  refuseOf: string;
  answer: string;
  invitation: Record<"sent" | "accepted" | "refused" | "cancelled", string>;
  cancelInvitation: string;
  players: string;
  coaches: string;
  coming: string;
  waiting: string;
  nobody: string;
  referee: string;
  noReferee: string;
  refereeStatus: Record<string, string>;
  refereeRole: Record<string, string>;
  transport: string;
  transportState: Record<"home" | "ready" | "todo", string>;
  organize: string;
  organizeOf: string;
  organized: string;
  tasksLink: string;
  toConfirm: string;
  confirmScore: string;
  confirmOf: string;
  confirmed: string;
  tournament: string;
  tournamentIntro: string;
  noTournament: string;
  stage: Record<string, string>;
  vs: string;
  sent: string;
};

export const matchLineCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    newFriendly: "Nouveau match amical",
    friendlyIntro: "Choisissez une équipe d'un club de la fédération : son club reçoit l'invitation et l'accepte ou la refuse. Entre deux équipes du club, c'est accepté d'office.",
    ourTeam: "Notre équipe",
    opponentTeam: "Adversaire",
    otherOpponent: "Autre adversaire (hors plateforme)",
    otherName: "Nom de l'adversaire",
    when: "Date et heure",
    place: "Lieu",
    noPlace: "Autre lieu (texte libre)",
    venue: "Lieu (texte libre)",
    homeAway: "Domicile ou extérieur",
    message: "Message (facultatif)",
    send: "Créer le match",
    cancel: "Annuler",
    invitations: "Invitations à des matchs amicaux",
    invitationsIntro: "Les clubs de la fédération qui invitent une de vos équipes.",
    invitedBy: "{club} · {team} invite {ours}",
    accept: "Accepter",
    acceptOf: "Accepter l'invitation de {club}",
    refuse: "Refuser",
    refuseOf: "Refuser l'invitation de {club}",
    answer: "Réponse (facultative)",
    invitation: { sent: "Invitation envoyée", accepted: "Invitation acceptée", refused: "Invitation refusée", cancelled: "Invitation annulée" },
    cancelInvitation: "Annuler l'invitation",
    players: "Joueurs {n}/{t}",
    coaches: "Coachs {n}/{t}",
    coming: "Viennent : {names}",
    waiting: "Sans réponse : {names}",
    nobody: "personne",
    referee: "Arbitre : {name}",
    noReferee: "Pas encore désigné",
    refereeStatus: { proposed: "proposé", accepted: "accepté" },
    refereeRole: { main: "principal", assistant: "assistant", table: "table" },
    transport: "Transport",
    transportState: { home: "En ordre (domicile)", ready: "En ordre", todo: "À organiser" },
    organize: "Organiser",
    organizeOf: "Organiser le transport : {match}",
    organized: "{n} tâches de transport créées.",
    tasksLink: "Tâches de transport ({n})",
    toConfirm: "à confirmer",
    confirmScore: "Confirmer le score",
    confirmOf: "Confirmer le score : {match}",
    confirmed: "Score confirmé.",
    tournament: "Matchs de tournoi",
    tournamentIntro: "Les matchs des tournois fédéraux où le club est invité ou inscrit, par journée.",
    noTournament: "Aucun match de tournoi.",
    stage: { league: "Championnat", group: "Groupe", round16: "Huitième", quarter: "Quart", semi: "Demi", third: "3e place", final: "Finale", other: "Match" },
    vs: "contre",
    sent: "Match créé.",
  },
  nl: {
    newFriendly: "Nieuwe vriendschappelijke wedstrijd",
    friendlyIntro: "Kies een team van een club van de federatie: die club krijgt de uitnodiging en aanvaardt of weigert ze. Tussen twee teams van de club is ze meteen aanvaard.",
    ourTeam: "Ons team",
    opponentTeam: "Tegenstander",
    otherOpponent: "Andere tegenstander (buiten het platform)",
    otherName: "Naam van de tegenstander",
    when: "Datum en uur",
    place: "Locatie",
    noPlace: "Andere locatie (vrije tekst)",
    venue: "Locatie (vrije tekst)",
    homeAway: "Thuis of uit",
    message: "Bericht (optioneel)",
    send: "De wedstrijd aanmaken",
    cancel: "Annuleren",
    invitations: "Uitnodigingen voor vriendschappelijke wedstrijden",
    invitationsIntro: "De clubs van de federatie die een van uw teams uitnodigen.",
    invitedBy: "{club} · {team} nodigt {ours} uit",
    accept: "Aanvaarden",
    acceptOf: "De uitnodiging van {club} aanvaarden",
    refuse: "Weigeren",
    refuseOf: "De uitnodiging van {club} weigeren",
    answer: "Antwoord (optioneel)",
    invitation: { sent: "Uitnodiging verstuurd", accepted: "Uitnodiging aanvaard", refused: "Uitnodiging geweigerd", cancelled: "Uitnodiging geannuleerd" },
    cancelInvitation: "De uitnodiging annuleren",
    players: "Spelers {n}/{t}",
    coaches: "Coaches {n}/{t}",
    coming: "Komen: {names}",
    waiting: "Geen antwoord: {names}",
    nobody: "niemand",
    referee: "Scheidsrechter: {name}",
    noReferee: "Nog niet aangeduid",
    refereeStatus: { proposed: "voorgesteld", accepted: "aanvaard" },
    refereeRole: { main: "hoofd", assistant: "assistent", table: "tafel" },
    transport: "Vervoer",
    transportState: { home: "In orde (thuis)", ready: "In orde", todo: "Te regelen" },
    organize: "Regelen",
    organizeOf: "Het vervoer regelen: {match}",
    organized: "{n} vervoerstaken aangemaakt.",
    tasksLink: "Vervoerstaken ({n})",
    toConfirm: "te bevestigen",
    confirmScore: "De score bevestigen",
    confirmOf: "De score bevestigen: {match}",
    confirmed: "Score bevestigd.",
    tournament: "Toernooiwedstrijden",
    tournamentIntro: "De wedstrijden van de federale toernooien waarvoor de club uitgenodigd of ingeschreven is, per speeldag.",
    noTournament: "Geen toernooiwedstrijd.",
    stage: { league: "Competitie", group: "Groep", round16: "Achtste", quarter: "Kwart", semi: "Halve", third: "3e plaats", final: "Finale", other: "Wedstrijd" },
    vs: "tegen",
    sent: "Wedstrijd aangemaakt.",
  },
  en: {
    newFriendly: "New friendly",
    friendlyIntro: "Choose a team of a club of the federation: its club gets the invitation and accepts or refuses it. Between two teams of the club, it is accepted at once.",
    ourTeam: "Our team",
    opponentTeam: "Opponent",
    otherOpponent: "Other opponent (outside the platform)",
    otherName: "Opponent's name",
    when: "Date and time",
    place: "Place",
    noPlace: "Other place (free text)",
    venue: "Place (free text)",
    homeAway: "Home or away",
    message: "Message (optional)",
    send: "Create the match",
    cancel: "Cancel",
    invitations: "Invitations to friendlies",
    invitationsIntro: "Clubs of the federation inviting one of your teams.",
    invitedBy: "{club} · {team} invites {ours}",
    accept: "Accept",
    acceptOf: "Accept the invitation from {club}",
    refuse: "Refuse",
    refuseOf: "Refuse the invitation from {club}",
    answer: "Answer (optional)",
    invitation: { sent: "Invitation sent", accepted: "Invitation accepted", refused: "Invitation refused", cancelled: "Invitation cancelled" },
    cancelInvitation: "Cancel the invitation",
    players: "Players {n}/{t}",
    coaches: "Coaches {n}/{t}",
    coming: "Coming: {names}",
    waiting: "No answer: {names}",
    nobody: "nobody",
    referee: "Referee: {name}",
    noReferee: "Not designated yet",
    refereeStatus: { proposed: "proposed", accepted: "accepted" },
    refereeRole: { main: "main", assistant: "assistant", table: "table" },
    transport: "Transport",
    transportState: { home: "Sorted (home)", ready: "Sorted", todo: "To organise" },
    organize: "Organise",
    organizeOf: "Organise the transport: {match}",
    organized: "{n} transport tasks created.",
    tasksLink: "Transport tasks ({n})",
    toConfirm: "to confirm",
    confirmScore: "Confirm the score",
    confirmOf: "Confirm the score: {match}",
    confirmed: "Score confirmed.",
    tournament: "Tournament matches",
    tournamentIntro: "Matches of the federal tournaments the club is invited to or registered in, by match day.",
    noTournament: "No tournament match.",
    stage: { league: "League", group: "Group", round16: "Round of 16", quarter: "Quarter-final", semi: "Semi-final", third: "Third place", final: "Final", other: "Match" },
    vs: "v",
    sent: "Match created.",
  },
};
