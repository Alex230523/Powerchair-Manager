/**
 * 28: the parental authorizations' names and the messages sent to the
 * families (fr, nl, en). Shared by the service (e-mails, document names) and
 * the pages.
 */
export const authorizationKinds = ["travel", "image", "image_event", "care", "outing"] as const;
export type AuthorizationKind = (typeof authorizationKinds)[number];
type Copy = {
  kinds: Record<AuthorizationKind, string>;
  documentName: string;
  forTrip: string;
  requestTitle: string;
  requestText: string;
  reminderTitle: string;
  reminderText: string;
};
export const authorizationCopy: Record<"fr" | "nl" | "en", Copy> = {
  fr: {
    kinds: {
      travel: "Autorisation de déplacement et de transport",
      image: "Droit à l'image (saison)",
      image_event: "Droit à l'image (événement)",
      care: "Autorisation de soins d'urgence",
      outing: "Autorisation de sortie",
    },
    documentName: "{kind} : {name}",
    forTrip: "Pour : {trip}, du {from} au {to}",
    requestTitle: "{kind} à signer pour {name}",
    requestText: "Le club vous demande de lire et de signer « {kind} » pour {name}. Vous pouvez la signer sur votre téléphone depuis Ma famille.",
    reminderTitle: "Rappel : {kind} à signer pour {name}",
    reminderText: "L'autorisation « {kind} » pour {name} n'est pas encore signée. Elle se signe en une minute depuis Ma famille.",
  },
  nl: {
    kinds: {
      travel: "Toestemming voor verplaatsing en vervoer",
      image: "Beeldrecht (seizoen)",
      image_event: "Beeldrecht (activiteit)",
      care: "Toestemming voor dringende zorg",
      outing: "Toestemming om alleen te vertrekken",
    },
    documentName: "{kind}: {name}",
    forTrip: "Voor: {trip}, van {from} tot {to}",
    requestTitle: "{kind} te ondertekenen voor {name}",
    requestText: "De club vraagt u « {kind} » voor {name} te lezen en te ondertekenen. U kunt dat op uw telefoon doen via Mijn gezin.",
    reminderTitle: "Herinnering: {kind} te ondertekenen voor {name}",
    reminderText: "De toestemming « {kind} » voor {name} is nog niet ondertekend. Dat gaat in een minuut via Mijn gezin.",
  },
  en: {
    kinds: {
      travel: "Travel and transport authorization",
      image: "Image rights (season)",
      image_event: "Image rights (event)",
      care: "Emergency care authorization",
      outing: "Permission to leave alone",
    },
    documentName: "{kind}: {name}",
    forTrip: "For: {trip}, from {from} to {to}",
    requestTitle: "{kind} to sign for {name}",
    requestText: "The club asks you to read and sign “{kind}” for {name}. You can sign it on your phone from My family.",
    reminderTitle: "Reminder: {kind} to sign for {name}",
    reminderText: "The authorization “{kind}” for {name} is not signed yet. It takes a minute from My family.",
  },
};
/** Fills {key} placeholders. Pure. */
export const fillCopy = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
/** What a kind does by default: one signature for the season or per trip, asked by itself on trips. */
export const authorizationDefaults: Record<AuthorizationKind, { validity: "season" | "event"; onTrips: boolean }> = {
  travel: { validity: "event", onTrips: true },
  image: { validity: "season", onTrips: false },
  image_event: { validity: "event", onTrips: false },
  care: { validity: "season", onTrips: true },
  outing: { validity: "event", onTrips: false },
};
/** Kinds whose answer feeds the publication rules (public pages, Hall of fame, activity report). */
export const imageKinds: readonly AuthorizationKind[] = ["image", "image_event"];
