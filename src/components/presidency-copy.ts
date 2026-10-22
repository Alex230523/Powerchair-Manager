/** Wave 17 (G1): Settings > Members > « Transmettre la présidence ». */
type Copy = {
  title: string;
  intro: string;
  who: string;
  pick: string;
  other: string;
  email: string;
  name: string;
  effective: string;
  effectiveHint: string;
  keep: string;
  keeps: Record<"member" | "coach" | "none", string>;
  message: string;
  send: string;
  sent: string;
  pending: string;
  pendingText: string;
  onAcceptance: string;
  disputed: string;
  cancel: string;
  cancelled: string;
};
export const presidencyCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    title: "Transmettre la présidence",
    intro: "La personne choisie reçoit une invitation de président. Tant qu'elle ne l'a pas acceptée, rien ne change et vous pouvez l'annuler. Le club n'est jamais sans président.",
    who: "Nouveau président",
    pick: "Choisir une personne du club",
    other: "Une autre personne (email)",
    email: "Email de la nouvelle personne",
    name: "Nom (facultatif)",
    effective: "Date d'effet (facultative)",
    effectiveHint: "Laissez vide : dès l'acceptation.",
    keep: "Ce que vous gardez ensuite",
    keeps: { member: "Membre du club, sans mandat", coach: "Coach", none: "Aucun rôle" },
    message: "Message (facultatif)",
    send: "Envoyer l'invitation",
    sent: "Invitation envoyée. Rien ne change avant son acceptation.",
    pending: "Transmission en attente",
    pendingText: "Invitation envoyée à {email} le {date}. Prise d'effet : {effective}. Vous gardez : {keep}.",
    onAcceptance: "dès l'acceptation",
    disputed: "La personne a indiqué que ce n'était pas son rôle.",
    cancel: "Annuler la transmission",
    cancelled: "Transmission annulée.",
  },
  nl: {
    title: "Het voorzitterschap overdragen",
    intro: "De gekozen persoon krijgt een uitnodiging als voorzitter. Zolang die niet aanvaard is, verandert er niets en kunt u ze annuleren. De club is nooit zonder voorzitter.",
    who: "Nieuwe voorzitter",
    pick: "Een persoon van de club kiezen",
    other: "Een andere persoon (e-mail)",
    email: "E-mail van de nieuwe persoon",
    name: "Naam (optioneel)",
    effective: "Ingangsdatum (optioneel)",
    effectiveHint: "Leeg laten: vanaf de aanvaarding.",
    keep: "Wat u daarna behoudt",
    keeps: { member: "Lid van de club, zonder mandaat", coach: "Coach", none: "Geen rol" },
    message: "Bericht (optioneel)",
    send: "De uitnodiging versturen",
    sent: "Uitnodiging verstuurd. Er verandert niets voor de aanvaarding.",
    pending: "Overdracht in afwachting",
    pendingText: "Uitnodiging verstuurd naar {email} op {date}. Ingang: {effective}. U behoudt: {keep}.",
    onAcceptance: "vanaf de aanvaarding",
    disputed: "De persoon gaf aan dat het niet haar rol is.",
    cancel: "De overdracht annuleren",
    cancelled: "Overdracht geannuleerd.",
  },
  en: {
    title: "Hand over the presidency",
    intro: "The person chosen gets a president invitation. Until it is accepted nothing changes and you may cancel it. The club is never without a president.",
    who: "New president",
    pick: "Choose a person of the club",
    other: "Someone else (email)",
    email: "Email of the new person",
    name: "Name (optional)",
    effective: "Date of effect (optional)",
    effectiveHint: "Leave empty: on acceptance.",
    keep: "What you keep afterwards",
    keeps: { member: "Club member, no mandate", coach: "Coach", none: "No role" },
    message: "Message (optional)",
    send: "Send the invitation",
    sent: "Invitation sent. Nothing changes until it is accepted.",
    pending: "Handover waiting",
    pendingText: "Invitation sent to {email} on {date}. Takes effect: {effective}. You keep: {keep}.",
    onAcceptance: "on acceptance",
    disputed: "The person said it is not their role.",
    cancel: "Cancel the handover",
    cancelled: "Handover cancelled.",
  },
};
