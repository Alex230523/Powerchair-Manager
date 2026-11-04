import type { Locale } from "../../lib/locale";

/** 8 (part 2): the start-of-season check, screen, follow-up and reminder. */
type Copy = {
  title: string;
  intro: string;
  forPerson: string;
  contacts: string;
  email: string;
  phone: string;
  emergency: string;
  care: string;
  needs: string;
  safety: string;
  consent: string;
  consentYes: string;
  consentNo: string;
  documents: string;
  noDocument: string;
  until: string;
  empty: string;
  stillRight: string;
  change: string;
  done: string;
  later: string;
  laterHint: string;
  close: string;
  followTitle: string;
  followIntro: string;
  launch: string;
  launched: string;
  noCheck: string;
  verified: string;
  notYet: string;
  postponed: string;
  remind: string;
  remindAll: string;
  reminded: string;
  player: string;
  state: string;
  mailTitle: string;
  mailText: string;
};
export const seasonCheckCopy: Record<Locale, Copy> = {
  fr: {
    title: "Vos informations sont-elles toujours exactes ?",
    intro: "Une nouvelle saison commence. Relisez les informations de chaque personne dont vous avez la charge : moins de deux minutes.",
    forPerson: "Pour {name}",
    contacts: "Coordonnées",
    email: "Email",
    phone: "Téléphone",
    emergency: "Contact d'urgence",
    care: "Consignes de soin",
    needs: "Besoins",
    safety: "Sécurité",
    consent: "Nom sur le site du club",
    consentYes: "Accepté",
    consentNo: "Pas accepté",
    documents: "Documents qui expirent cette saison",
    noDocument: "Aucun.",
    until: "jusqu'au {date}",
    empty: "Non renseigné",
    stillRight: "C'est toujours exact",
    change: "Modifier",
    done: "Merci, c'est noté.",
    later: "Me le rappeler plus tard",
    laterHint: "Possible une fois : l'écran reviendra à chaque connexion après {date}.",
    close: "Fermer",
    followTitle: "Vérification de début de saison",
    followIntro: "Chaque joueur adulte et chaque responsable légal confirme que les informations sont exactes. Les réponses aux convocations ne sont jamais bloquées.",
    launch: "Lancer la vérification",
    launched: "Vérification lancée pour la saison en cours.",
    noCheck: "Pas encore de vérification pour la saison en cours.",
    verified: "Vérifié le {date}",
    notYet: "Pas encore",
    postponed: "reportée",
    remind: "Relancer",
    remindAll: "Relancer ceux qui n'ont pas répondu",
    reminded: "{n} relances envoyées.",
    player: "Joueur",
    state: "État",
    mailTitle: "Saison {season} : vos informations sont-elles exactes ?",
    mailText: "La saison {season} commence. Connectez-vous pour relire les informations de chaque personne dont vous avez la charge : coordonnées, contact d'urgence, consignes de soin, documents.",
  },
  nl: {
    title: "Kloppen uw gegevens nog?",
    intro: "Een nieuw seizoen begint. Lees de gegevens na van elke persoon voor wie u zorgt: minder dan twee minuten.",
    forPerson: "Voor {name}",
    contacts: "Contactgegevens",
    email: "E-mail",
    phone: "Telefoon",
    emergency: "Contact bij nood",
    care: "Zorginstructies",
    needs: "Noden",
    safety: "Veiligheid",
    consent: "Naam op de website van de club",
    consentYes: "Aanvaard",
    consentNo: "Niet aanvaard",
    documents: "Documenten die dit seizoen verlopen",
    noDocument: "Geen.",
    until: "tot {date}",
    empty: "Niet ingevuld",
    stillRight: "Dit klopt nog",
    change: "Wijzigen",
    done: "Bedankt, genoteerd.",
    later: "Herinner me later",
    laterHint: "Eén keer mogelijk: het scherm komt na {date} bij elke aanmelding terug.",
    close: "Sluiten",
    followTitle: "Controle bij de start van het seizoen",
    followIntro: "Elke volwassen speler en elke wettelijke vertegenwoordiger bevestigt dat de gegevens kloppen. Antwoorden op uitnodigingen worden nooit geblokkeerd.",
    launch: "De controle starten",
    launched: "Controle gestart voor het huidige seizoen.",
    noCheck: "Nog geen controle voor het huidige seizoen.",
    verified: "Gecontroleerd op {date}",
    notYet: "Nog niet",
    postponed: "uitgesteld",
    remind: "Herinneren",
    remindAll: "Wie niet antwoordde herinneren",
    reminded: "{n} herinneringen verstuurd.",
    player: "Speler",
    state: "Status",
    mailTitle: "Seizoen {season}: kloppen uw gegevens?",
    mailText: "Seizoen {season} begint. Meld u aan om de gegevens na te lezen van elke persoon voor wie u zorgt: contactgegevens, contact bij nood, zorginstructies, documenten.",
  },
  en: {
    title: "Is your information still right?",
    intro: "A new season begins. Read again the information of each person in your care: less than two minutes.",
    forPerson: "For {name}",
    contacts: "Contact details",
    email: "Email",
    phone: "Phone",
    emergency: "Emergency contact",
    care: "Care notes",
    needs: "Needs",
    safety: "Safety",
    consent: "Name on the club's website",
    consentYes: "Accepted",
    consentNo: "Not accepted",
    documents: "Documents expiring this season",
    noDocument: "None.",
    until: "until {date}",
    empty: "Not given",
    stillRight: "This is still right",
    change: "Change",
    done: "Thank you, noted.",
    later: "Remind me later",
    laterHint: "Possible once: the screen comes back at each sign-in after {date}.",
    close: "Close",
    followTitle: "Start-of-season check",
    followIntro: "Each adult player and each legal guardian confirms the information is right. Answers to invitations are never blocked.",
    launch: "Launch the check",
    launched: "Check launched for the current season.",
    noCheck: "No check yet for the current season.",
    verified: "Checked on {date}",
    notYet: "Not yet",
    postponed: "postponed",
    remind: "Remind",
    remindAll: "Remind those who did not answer",
    reminded: "{n} reminders sent.",
    player: "Player",
    state: "State",
    mailTitle: "Season {season}: is your information right?",
    mailText: "Season {season} begins. Sign in to read again the information of each person in your care: contact details, emergency contact, care notes, documents.",
  },
};
