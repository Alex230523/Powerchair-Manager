import { brusselsDay } from "@/lib/today";
/** Wave 16 (I2): « Envoyer une invitation par email » on a new file; for a minor, the parent's address. */
export const inviteCopy = {
  fr: {
    send: "Envoyer une invitation par email",
    adult: "La personne reçoit un lien pour créer son compte, déjà relié à cette fiche.",
    minor: "Joueur mineur : l'invitation part au parent, dont le compte sera relié à l'enfant.",
    parentName: "Nom du parent",
    parentEmail: "Email du parent",
    batch: (n: number) => (n === 1 ? "1 invitation va partir." : `${n} invitations vont partir.`),
    batchHelp: "Une par ligne avec une adresse email, celle du parent pour un mineur.",
    sent: (n: number) => (n === 1 ? "1 invitation envoyée." : `${n} invitations envoyées.`),
  },
  nl: {
    send: "Een uitnodiging per e-mail sturen",
    adult: "De persoon krijgt een link om een account aan te maken, al gekoppeld aan deze fiche.",
    minor: "Minderjarige speler: de uitnodiging gaat naar de ouder, wiens account aan het kind gekoppeld wordt.",
    parentName: "Naam van de ouder",
    parentEmail: "E-mail van de ouder",
    batch: (n: number) => (n === 1 ? "1 uitnodiging wordt verstuurd." : `${n} uitnodigingen worden verstuurd.`),
    batchHelp: "Eén per regel met een e-mailadres, dat van de ouder voor een minderjarige.",
    sent: (n: number) => (n === 1 ? "1 uitnodiging verstuurd." : `${n} uitnodigingen verstuurd.`),
  },
  en: {
    send: "Send an invitation by email",
    adult: "The person gets a link to create their account, already linked to this file.",
    minor: "Minor player: the invitation goes to the parent, whose account will be linked to the child.",
    parentName: "Parent's name",
    parentEmail: "Parent's email",
    batch: (n: number) => (n === 1 ? "1 invitation will be sent." : `${n} invitations will be sent.`),
    batchHelp: "One per line with an email address, the parent's for a minor.",
    sent: (n: number) => (n === 1 ? "1 invitation sent." : `${n} invitations sent.`),
  },
};

export const isMinor = (birthDate: string, today = brusselsDay()) => {
  if (!birthDate) return false;
  const [y, m, d] = birthDate.split("-").map(Number),
    [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0) < 18;
};
