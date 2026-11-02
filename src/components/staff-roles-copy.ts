import type { Locale } from "@/lib/locale";

/** 7: staff roles, in Réglages › Membres et droits and on the coaches' page. */
type Copy = {
  title: string;
  intro: string;
  people: string;
  archived: string;
  create: string;
  edit: string;
  archive: string;
  restore: string;
  name: string;
  description: string;
  scope: string;
  scopes: Record<"all" | "own_teams", string>;
  scopeHelp: string;
  can: string;
  nothing: string;
  save: string;
  saved: string;
  close: string;
  confirmTitle: string;
  confirmIntro: string;
  gains: string;
  loses: string;
  confirm: string;
  cancel: string;
  staff: string;
  staffIntro: string;
  roles: string;
  custom: string;
  assign: string;
  assigned: string;
  noStaff: string;
  chooseRole: string;
  noRole: string;
  column: string;
  tasks: string;
  tasksCount: string;
  formations: string;
  formationsCount: string;
  formationOn: string;
  noFormation: string;
  competences: string;
  until: string;
  noEnd: string;
  end: string;
  ended: string;
  presidencyOnly: string;
  appoint: string;
  appointIntro: string;
  appointed: string;
  person: string;
  untilLabel: string;
  untilHelp: string;
  inviteTitle: string;
  invited: string;
  email: string;
  link: string;
  journal: string;
  noJournal: string;
  actions: Record<string, string>;
  teamTitle: string;
  teamIntro: string;
};
const fr: Copy = {
  title: "Rôles",
  intro: "Un rôle est un modèle de droits : on le donne à une personne, ses droits se cochent ; on peut encore ajuster une personne.",
  people: "{n} personne(s)",
  archived: "Archivé",
  create: "Créer un rôle",
  edit: "Modifier",
  archive: "Archiver",
  restore: "Réactiver",
  name: "Nom",
  description: "Description (une phrase)",
  scope: "Portée",
  scopes: { all: "Toutes les équipes", own_teams: "Ses équipes seulement" },
  scopeHelp: "« Ses équipes seulement » : le calendrier, les présences et les joueurs valent pour les équipes que la personne entraîne, pas pour tout le club.",
  can: "Peut : {list}",
  nothing: "Aucun droit en plus de ceux de son rôle de coach.",
  save: "Enregistrer le rôle",
  saved: "Rôle enregistré.",
  close: "Fermer",
  confirmTitle: "Confirmer la modification du rôle",
  confirmIntro: "Ces personnes ont le rôle ; leurs droits changent ainsi :",
  gains: "gagne : {list}",
  loses: "perd : {list}",
  confirm: "Confirmer et appliquer",
  cancel: "Annuler",
  staff: "Rôles des personnes",
  staffIntro: "Une personne peut avoir plusieurs rôles ; ses droits sont l'union de ses rôles et de ses ajustements.",
  roles: "Rôles de {name}",
  custom: "Personnalisé",
  assign: "Enregistrer les rôles",
  assigned: "Rôles enregistrés.",
  noStaff: "Aucun coach ni membre du staff pour l'instant.",
  chooseRole: "Rôle (préremplit les droits)",
  noRole: "Aucun",
  column: "Rôle",
  tasks: "Tâches",
  tasksCount: "{open} ouvertes · {late} en retard",
  formations: "Formations",
  formationsCount: "{n} validée(s)",
  formationOn: "{title} ({date})",
  noFormation: "Aucune formation validée",
  competences: "Compétences",
  until: "Jusqu'au {date}",
  noEnd: "Jusqu'à nouvel ordre",
  end: "Mettre fin",
  ended: "Délégation terminée.",
  presidencyOnly: "Cette page est réservée à la présidence de la fédération.",
  appoint: "Désigner une personne",
  appointIntro: "Un arbitre, ou le président ou un coach d'un club affilié. La personne garde ses autres rôles et choisit son profil dans la barre du haut.",
  appointed: "Personne désignée.",
  person: "Personne",
  untilLabel: "Jusqu'au",
  untilHelp: "Vide : jusqu'à nouvel ordre.",
  inviteTitle: "Inviter par email",
  invited: "Invitation créée.",
  email: "Email",
  link: "Lien d'invitation",
  journal: "Journal des changements",
  noJournal: "Aucun changement pour l'instant.",
  actions: { "mandate.grants": "droits modifiés", "mandate.roles": "rôles attribués", "staff_role.created": "rôle créé", "staff_role.changed": "rôle modifié", "delegate.appointed": "personne désignée", "delegate.ended": "délégation terminée" },
  teamTitle: "Équipe fédérale",
  teamIntro: "Les délégués de la présidence et leurs rôles : chacun ne voit que ce que ses compétences lui ouvrent.",
};
const nl: Copy = {
  title: "Rollen",
  intro: "Een rol is een rechtenmodel: geef je hem aan iemand, dan worden zijn rechten aangevinkt; je kan iemand nog bijstellen.",
  people: "{n} persoon/personen",
  archived: "Gearchiveerd",
  create: "Een rol aanmaken",
  edit: "Wijzigen",
  archive: "Archiveren",
  restore: "Heractiveren",
  name: "Naam",
  description: "Beschrijving (één zin)",
  scope: "Bereik",
  scopes: { all: "Alle ploegen", own_teams: "Alleen zijn ploegen" },
  scopeHelp: "« Alleen zijn ploegen »: kalender, aanwezigheden en spelers gelden voor de ploegen die de persoon traint, niet voor de hele club.",
  can: "Mag: {list}",
  nothing: "Geen rechten bovenop die van zijn rol als coach.",
  save: "De rol opslaan",
  saved: "Rol opgeslagen.",
  close: "Sluiten",
  confirmTitle: "De wijziging van de rol bevestigen",
  confirmIntro: "Deze personen hebben de rol; hun rechten veranderen zo:",
  gains: "krijgt: {list}",
  loses: "verliest: {list}",
  confirm: "Bevestigen en toepassen",
  cancel: "Annuleren",
  staff: "Rollen van de personen",
  staffIntro: "Iemand kan meerdere rollen hebben; zijn rechten zijn de som van zijn rollen en zijn bijstellingen.",
  roles: "Rollen van {name}",
  custom: "Aangepast",
  assign: "De rollen opslaan",
  assigned: "Rollen opgeslagen.",
  noStaff: "Nog geen coach of staflid.",
  chooseRole: "Rol (vult de rechten in)",
  noRole: "Geen",
  column: "Rol",
  tasks: "Taken",
  tasksCount: "{open} open · {late} te laat",
  formations: "Opleidingen",
  formationsCount: "{n} goedgekeurd",
  formationOn: "{title} ({date})",
  noFormation: "Geen goedgekeurde opleiding",
  competences: "Bevoegdheden",
  until: "Tot {date}",
  noEnd: "Tot nader bericht",
  end: "Beëindigen",
  ended: "Delegatie beëindigd.",
  presidencyOnly: "Deze pagina is voorbehouden aan het voorzitterschap van de federatie.",
  appoint: "Iemand aanduiden",
  appointIntro: "Een scheidsrechter, of de voorzitter of een coach van een aangesloten club. De persoon houdt zijn andere rollen en kiest zijn profiel bovenaan.",
  appointed: "Persoon aangeduid.",
  person: "Persoon",
  untilLabel: "Tot",
  untilHelp: "Leeg: tot nader bericht.",
  inviteTitle: "Uitnodigen per e-mail",
  invited: "Uitnodiging aangemaakt.",
  email: "E-mail",
  link: "Uitnodigingslink",
  journal: "Logboek van de wijzigingen",
  noJournal: "Nog geen wijziging.",
  actions: { "mandate.grants": "rechten gewijzigd", "mandate.roles": "rollen toegekend", "staff_role.created": "rol aangemaakt", "staff_role.changed": "rol gewijzigd", "delegate.appointed": "persoon aangeduid", "delegate.ended": "delegatie beëindigd" },
  teamTitle: "Federaal team",
  teamIntro: "De gedelegeerden van het voorzitterschap en hun rollen: elk ziet alleen wat zijn bevoegdheden openen.",
};
const en: Copy = {
  title: "Roles",
  intro: "A role is a model of rights: give it to someone and his rights are ticked; one person can still be adjusted.",
  people: "{n} person(s)",
  archived: "Archived",
  create: "Create a role",
  edit: "Edit",
  archive: "Archive",
  restore: "Restore",
  name: "Name",
  description: "Description (one sentence)",
  scope: "Scope",
  scopes: { all: "All teams", own_teams: "His own teams only" },
  scopeHelp: "« His own teams only »: the calendar, attendance and players count for the teams the person coaches, not for the whole club.",
  can: "Can: {list}",
  nothing: "No rights beyond those of his coach role.",
  save: "Save the role",
  saved: "Role saved.",
  close: "Close",
  confirmTitle: "Confirm the change to the role",
  confirmIntro: "These people have the role; their rights change as follows:",
  gains: "gains: {list}",
  loses: "loses: {list}",
  confirm: "Confirm and apply",
  cancel: "Cancel",
  staff: "People's roles",
  staffIntro: "A person may have several roles; his rights are the union of his roles and his adjustments.",
  roles: "Roles of {name}",
  custom: "Customised",
  assign: "Save the roles",
  assigned: "Roles saved.",
  noStaff: "No coach or staff member yet.",
  chooseRole: "Role (prefills the rights)",
  noRole: "None",
  column: "Role",
  tasks: "Tasks",
  tasksCount: "{open} open · {late} late",
  formations: "Courses",
  formationsCount: "{n} validated",
  formationOn: "{title} ({date})",
  noFormation: "No validated course",
  competences: "Competences",
  until: "Until {date}",
  noEnd: "Until further notice",
  end: "End",
  ended: "Delegation ended.",
  presidencyOnly: "This page is for the federation's presidency.",
  appoint: "Appoint someone",
  appointIntro: "A referee, or the president or a coach of an affiliated club. The person keeps his other roles and picks his profile in the top bar.",
  appointed: "Person appointed.",
  person: "Person",
  untilLabel: "Until",
  untilHelp: "Empty: until further notice.",
  inviteTitle: "Invite by email",
  invited: "Invitation created.",
  email: "Email",
  link: "Invitation link",
  journal: "Log of changes",
  noJournal: "No change yet.",
  actions: { "mandate.grants": "rights changed", "mandate.roles": "roles given", "staff_role.created": "role created", "staff_role.changed": "role changed", "delegate.appointed": "person appointed", "delegate.ended": "delegation ended" },
  teamTitle: "Federation team",
  teamIntro: "The presidency's delegates and their roles: each sees only what his competences open.",
};
export const staffRolesCopy: Record<Locale, Copy> = { fr, nl, en };
