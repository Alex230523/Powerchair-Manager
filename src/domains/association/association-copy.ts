import type { Locale } from "../../lib/locale";

/** 17: what the server writes for the ASBL (agenda, invitation, tasks, minutes) in fr, nl, en. */
type Words = {
  assemblyTitle: string;
  secondTitle: string;
  items: Record<"accounts" | "budget" | "discharge" | "mandate" | "admission" | "exit" | "free", string>;
  inviteTitle: string;
  inviteText: string;
  reminderTitle: string;
  reminderText: string;
  tasks: Record<"date" | "prepare" | "agenda" | "invite" | "moniteur" | "ubo", string>;
  minutes: {
    title: string;
    opened: string;
    attendance: string;
    quorumReached: string;
    quorumMissed: string;
    noQuorum: string;
    item: string;
    votes: string;
    adopted: string;
    rejected: string;
    notVoted: string;
    closed: string;
    signatures: string;
  };
  documentName: string;
  register: { title: string; printed: string; members: string; history: string; line: string; correction: string; bodies: Record<"assembly" | "board", string> };
  events: Record<"admission" | "resignation" | "exclusion" | "status" | "board_start" | "board_end" | "correction", string>;
  statuses: Record<"effective" | "adherent" | "none", string>;
};
export const associationWords: Record<Locale, Words> = {
  fr: {
    assemblyTitle: "Assemblée générale ordinaire {year}",
    secondTitle: "Seconde assemblée générale : {title}",
    items: {
      accounts: "Approbation des comptes annuels {year}",
      budget: "Approbation du budget de l'exercice {next}",
      discharge: "Décharge aux administrateurs",
      mandate: "Mandat d'administrateur : {name}",
      admission: "Admission comme membre effectif : {name}",
      exit: "Sortie de membre : {name}",
      free: "Divers",
    },
    inviteTitle: "Invitation : {title}, le {date}",
    inviteText: "Vous êtes invité à l'assemblée en tant que membre effectif. Ordre du jour : {agenda}. Les comptes, le budget et le rapport d'activité sont joints sur la page. Dites si vous serez présent, ou donnez procuration à un autre membre.",
    reminderTitle: "Rappel : {title}, le {date}",
    reminderText: "Vous n'avez pas encore répondu. Dites si vous serez présent, ou donnez procuration à un autre membre.",
    tasks: {
      date: "Fixer la date de l'assemblée générale (au plus tard le {date})",
      prepare: "Préparer les comptes et le budget pour : {title}",
      agenda: "Valider l'ordre du jour : {title}",
      invite: "Envoyer l'invitation : {title}",
      moniteur: "Publication au Moniteur belge : changement d'administrateurs ({title})",
      ubo: "Mettre à jour le registre UBO ({title})",
    },
    minutes: {
      title: "Procès-verbal : {title}",
      opened: "La séance est ouverte le {date} à {place}.",
      attendance: "Membres effectifs : {members}. Présents : {present}. Représentés : {represented}.",
      quorumReached: "Le quorum de {needed} membres est atteint : l'assemblée peut délibérer.",
      quorumMissed: "Le quorum de {needed} membres n'est pas atteint : une seconde assemblée doit être réunie.",
      noQuorum: "Les statuts ne demandent pas de quorum.",
      item: "{n}. {title}",
      votes: "Pour : {for}, contre : {against}, abstentions : {abstain}.",
      adopted: "Décision adoptée.",
      rejected: "Décision rejetée.",
      notVoted: "Point présenté, sans vote.",
      closed: "L'ordre du jour étant épuisé, la séance est levée.",
      signatures: "Signé par le président et le secrétaire.",
    },
    documentName: "Vie de l'ASBL · {year} · {title}",
    register: { title: "Registre des membres : {club}", printed: "Arrêté le {date}", members: "Membres effectifs ({n})", history: "Historique", line: "{date} · {name} · {event} · {status}{decision}", correction: " (correction : {reason})", bodies: { assembly: "AG", board: "CA" } },
    events: { admission: "Admission", resignation: "Démission", exclusion: "Exclusion", status: "Changement de statut", board_start: "Début de mandat", board_end: "Fin de mandat", correction: "Correction" },
    statuses: { effective: "Membre effectif", adherent: "Membre adhérent", none: "Aucun" },
  },
  nl: {
    assemblyTitle: "Gewone algemene vergadering {year}",
    secondTitle: "Tweede algemene vergadering: {title}",
    items: {
      accounts: "Goedkeuring van de jaarrekening {year}",
      budget: "Goedkeuring van de begroting van het boekjaar {next}",
      discharge: "Kwijting aan de bestuurders",
      mandate: "Bestuursmandaat: {name}",
      admission: "Toelating als effectief lid: {name}",
      exit: "Uittreding van een lid: {name}",
      free: "Varia",
    },
    inviteTitle: "Uitnodiging: {title}, op {date}",
    inviteText: "U bent als effectief lid uitgenodigd op de vergadering. Agenda: {agenda}. De rekeningen, de begroting en het activiteitenverslag staan op de pagina. Laat weten of u aanwezig bent, of geef volmacht aan een ander lid.",
    reminderTitle: "Herinnering: {title}, op {date}",
    reminderText: "U hebt nog niet geantwoord. Laat weten of u aanwezig bent, of geef volmacht aan een ander lid.",
    tasks: {
      date: "De datum van de algemene vergadering vastleggen (uiterlijk {date})",
      prepare: "De rekeningen en de begroting voorbereiden voor: {title}",
      agenda: "De agenda bevestigen: {title}",
      invite: "De uitnodiging versturen: {title}",
      moniteur: "Publicatie in het Belgisch Staatsblad: wijziging van bestuurders ({title})",
      ubo: "Het UBO-register bijwerken ({title})",
    },
    minutes: {
      title: "Notulen: {title}",
      opened: "De vergadering wordt geopend op {date} te {place}.",
      attendance: "Effectieve leden: {members}. Aanwezig: {present}. Vertegenwoordigd: {represented}.",
      quorumReached: "Het quorum van {needed} leden is bereikt: de vergadering kan beraadslagen.",
      quorumMissed: "Het quorum van {needed} leden is niet bereikt: een tweede vergadering moet worden bijeengeroepen.",
      noQuorum: "De statuten vragen geen quorum.",
      item: "{n}. {title}",
      votes: "Voor: {for}, tegen: {against}, onthoudingen: {abstain}.",
      adopted: "Beslissing aangenomen.",
      rejected: "Beslissing verworpen.",
      notVoted: "Punt voorgesteld, zonder stemming.",
      closed: "Na afhandeling van de agenda wordt de vergadering gesloten.",
      signatures: "Ondertekend door de voorzitter en de secretaris.",
    },
    documentName: "Vzw-leven · {year} · {title}",
    register: { title: "Ledenregister: {club}", printed: "Afgesloten op {date}", members: "Effectieve leden ({n})", history: "Geschiedenis", line: "{date} · {name} · {event} · {status}{decision}", correction: " (correctie: {reason})", bodies: { assembly: "AV", board: "RvB" } },
    events: { admission: "Toelating", resignation: "Ontslag", exclusion: "Uitsluiting", status: "Statuswijziging", board_start: "Begin van mandaat", board_end: "Einde van mandaat", correction: "Correctie" },
    statuses: { effective: "Effectief lid", adherent: "Toegetreden lid", none: "Geen" },
  },
  en: {
    assemblyTitle: "Ordinary general assembly {year}",
    secondTitle: "Second general assembly: {title}",
    items: {
      accounts: "Approval of the annual accounts {year}",
      budget: "Approval of the budget for the year {next}",
      discharge: "Discharge of the directors",
      mandate: "Director's mandate: {name}",
      admission: "Admission as an effective member: {name}",
      exit: "Member leaving: {name}",
      free: "Any other business",
    },
    inviteTitle: "Invitation: {title}, on {date}",
    inviteText: "You are invited to the assembly as an effective member. Agenda: {agenda}. The accounts, the budget and the activity report are on the page. Say whether you will attend, or give a proxy to another member.",
    reminderTitle: "Reminder: {title}, on {date}",
    reminderText: "You have not answered yet. Say whether you will attend, or give a proxy to another member.",
    tasks: {
      date: "Set the date of the general assembly (by {date})",
      prepare: "Prepare the accounts and the budget for: {title}",
      agenda: "Confirm the agenda: {title}",
      invite: "Send the invitation: {title}",
      moniteur: "Publication in the Belgian Official Gazette: change of directors ({title})",
      ubo: "Update the UBO register ({title})",
    },
    minutes: {
      title: "Minutes: {title}",
      opened: "The meeting opens on {date} at {place}.",
      attendance: "Effective members: {members}. Present: {present}. Represented: {represented}.",
      quorumReached: "The quorum of {needed} members is reached: the assembly may decide.",
      quorumMissed: "The quorum of {needed} members is not reached: a second assembly must be held.",
      noQuorum: "The statutes ask no quorum.",
      item: "{n}. {title}",
      votes: "For: {for}, against: {against}, abstentions: {abstain}.",
      adopted: "Decision adopted.",
      rejected: "Decision rejected.",
      notVoted: "Point presented, without a vote.",
      closed: "The agenda being exhausted, the meeting is closed.",
      signatures: "Signed by the president and the secretary.",
    },
    documentName: "ASBL life · {year} · {title}",
    register: { title: "Register of members: {club}", printed: "Drawn up on {date}", members: "Effective members ({n})", history: "History", line: "{date} · {name} · {event} · {status}{decision}", correction: " (correction: {reason})", bodies: { assembly: "GA", board: "Board" } },
    events: { admission: "Admission", resignation: "Resignation", exclusion: "Exclusion", status: "Change of status", board_start: "Mandate starts", board_end: "Mandate ends", correction: "Correction" },
    statuses: { effective: "Effective member", adherent: "Adherent member", none: "None" },
  },
};
export const fillWords = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
