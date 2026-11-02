import type { Locale } from "@/lib/locale";
import type { representativeRelations } from "@/domains/people/schema";

/** 8: a player's representatives, given with the player. */
type Copy = {
  title: string;
  minorIntro: string;
  adultQuestion: string;
  adultHint: string;
  who: string;
  newPerson: string;
  known: string;
  suggested: string;
  name: string;
  relation: string;
  relations: Record<(typeof representativeRelations)[number], string>;
  email: string;
  phone: string;
  language: string;
  rights: string;
  legal: string;
  legalHint: string;
  aid: string;
  aidHint: string;
  addSecond: string;
  removeSecond: string;
  second: string;
  invite: string;
  inviteHint: string;
  missing: string;
  showThem: string;
  showAll: string;
};
export const representativeCopy: Record<Locale, Copy> = {
  fr: {
    title: "Parent ou responsable légal",
    minorIntro: "Le joueur a moins de 18 ans : indiquez au moins un parent ou responsable légal.",
    adultQuestion: "Ce joueur a-t-il un représentant légal ou un aidant qui gère son dossier ?",
    adultHint: "Un adulte autonome gère son dossier lui-même : ne cochez que s'il a un administrateur ou un aidant.",
    who: "Personne",
    newPerson: "Une nouvelle personne",
    known: "Personnes déjà connues du club",
    suggested: "Même nom de famille",
    name: "Prénom et nom",
    relation: "Lien",
    relations: { mother: "Mère", father: "Père", guardian: "Tuteur", administrator: "Administrateur", carer: "Aidant", other: "Autre" },
    email: "Adresse email",
    phone: "Téléphone",
    language: "Langue",
    rights: "Droits",
    legal: "Responsable légal",
    legalHint: "Accès complet au dossier du joueur, après acceptation de l'invitation.",
    aid: "Aidant délégué",
    aidHint: "Voit le dossier jusqu'à la fin de la saison, sans décider.",
    addSecond: "Ajouter un second responsable",
    removeSecond: "Retirer le second responsable",
    second: "Second responsable",
    invite: "Inviter maintenant par email",
    inviteHint: "Chaque responsable qui a une adresse reçoit une invitation à créer son accès.",
    missing: "{n} joueurs mineurs sans responsable",
    showThem: "Les afficher pour compléter",
    showAll: "Afficher tous les joueurs",
  },
  nl: {
    title: "Ouder of wettelijke vertegenwoordiger",
    minorIntro: "De speler is jonger dan 18: geef minstens één ouder of wettelijke vertegenwoordiger op.",
    adultQuestion: "Heeft deze speler een wettelijke vertegenwoordiger of een mantelzorger die zijn dossier beheert?",
    adultHint: "Een zelfstandige volwassene beheert zijn dossier zelf: vink enkel aan als hij een bewindvoerder of mantelzorger heeft.",
    who: "Persoon",
    newPerson: "Een nieuwe persoon",
    known: "Personen die de club al kent",
    suggested: "Zelfde familienaam",
    name: "Voornaam en naam",
    relation: "Band",
    relations: { mother: "Moeder", father: "Vader", guardian: "Voogd", administrator: "Bewindvoerder", carer: "Mantelzorger", other: "Andere" },
    email: "E-mailadres",
    phone: "Telefoon",
    language: "Taal",
    rights: "Rechten",
    legal: "Wettelijke vertegenwoordiger",
    legalHint: "Volledige toegang tot het dossier van de speler, na aanvaarding van de uitnodiging.",
    aid: "Gedelegeerde mantelzorger",
    aidHint: "Ziet het dossier tot het einde van het seizoen, zonder te beslissen.",
    addSecond: "Een tweede verantwoordelijke toevoegen",
    removeSecond: "De tweede verantwoordelijke verwijderen",
    second: "Tweede verantwoordelijke",
    invite: "Nu per e-mail uitnodigen",
    inviteHint: "Elke verantwoordelijke met een adres krijgt een uitnodiging om zijn toegang aan te maken.",
    missing: "{n} minderjarige spelers zonder verantwoordelijke",
    showThem: "Ze tonen om aan te vullen",
    showAll: "Alle spelers tonen",
  },
  en: {
    title: "Parent or legal guardian",
    minorIntro: "The player is under 18: give at least one parent or legal guardian.",
    adultQuestion: "Does this player have a legal representative or a carer who manages their file?",
    adultHint: "An autonomous adult manages their own file: tick only if they have an administrator or a carer.",
    who: "Person",
    newPerson: "A new person",
    known: "People the club already knows",
    suggested: "Same family name",
    name: "First and last name",
    relation: "Relation",
    relations: { mother: "Mother", father: "Father", guardian: "Guardian", administrator: "Administrator", carer: "Carer", other: "Other" },
    email: "Email address",
    phone: "Phone",
    language: "Language",
    rights: "Rights",
    legal: "Legal guardian",
    legalHint: "Full access to the player's file, once the invitation is accepted.",
    aid: "Delegated carer",
    aidHint: "Sees the file until the end of the season, without deciding.",
    addSecond: "Add a second guardian",
    removeSecond: "Remove the second guardian",
    second: "Second guardian",
    invite: "Invite now by email",
    inviteHint: "Each guardian with an address receives an invitation to create their access.",
    missing: "{n} minor players without a guardian",
    showThem: "Show them to complete",
    showAll: "Show all players",
  },
};
