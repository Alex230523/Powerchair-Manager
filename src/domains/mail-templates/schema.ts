import { z } from "zod";

/** 10: the club's email templates (no I/O: shared with the page). */
export const usages = ["dues_reminder", "event_invitation", "document_reminder", "new_season", "welcome", "match_invitation", "sponsor_thanks", "free"] as const;
export type Usage = (typeof usages)[number];
/** The messages one may stop receiving carry an unsubscribe link and skip those who did. */
export const optional: Usage[] = ["new_season", "welcome", "sponsor_thanks", "free"];
/** The variables, inserted from a menu; the same braces in the three languages. */
export const variables = ["prénom", "équipe", "événement", "date", "lieu", "montant", "échéance", "lien", "club"] as const;
export type Variable = (typeof variables)[number];
export type Values = Partial<Record<Variable, string>>;
export const locales = ["fr", "nl", "en"] as const;
type Lang = (typeof locales)[number];
export type Texts = Record<Lang, { subject: string; body: string }>;

/** Unknown variables or a stray brace make the text invalid. */
export function checkText(text: string) {
  const unknown = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((v) => !(variables as readonly string[]).includes(v));
  return !unknown.length && !/[{}]/.test(text.replace(/\{[^{}]*\}/g, ""));
}
/** Fills the variables; a value not known for this sending stays empty. */
export function fill(text: string, values: Values) {
  return text.replace(/\{([^{}]+)\}/g, (_, k: string) => values[k as Variable] ?? "");
}
const piece = z.object({ subject: z.string().trim().min(2).max(200).refine(checkText, "INVALID_TEMPLATE"), body: z.string().trim().min(2).max(8000).refine(checkText, "INVALID_TEMPLATE") });
export const texts = z.object({ fr: piece, nl: piece, en: piece });
export const target = z.string().regex(/^(dues_reminder|documents_reminder|automation:[a-zA-Z]+)$/);
export const mailTemplateCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.uuid().optional(), version: z.number().int().positive().optional(), name: z.string().trim().min(2).max(120), usage: z.enum(usages), texts }),
  z.object({ action: z.literal("archive"), id: z.uuid(), archived: z.boolean() }),
  z.object({ action: z.literal("duplicate"), id: z.uuid() }),
  // Preview with a real person of the club, in that person's language.
  z.object({ action: z.literal("preview"), id: z.uuid(), profileId: z.uuid().nullable().default(null), eventId: z.uuid().nullable().default(null) }),
  z.object({ action: z.literal("test"), id: z.uuid(), eventId: z.uuid().nullable().default(null) }),
  // « Envoyer »: to groups of the club, or to those invited to an event.
  z.object({
    action: z.literal("send"),
    id: z.uuid(),
    groupIds: z.array(z.uuid()).max(30).default([]),
    eventId: z.uuid().nullable().default(null),
    toInvited: z.boolean().default(false),
    // Changed in the window before sending, for this sending only.
    texts: texts.optional(),
  }),
  z.object({ action: z.literal("bind"), target, templateId: z.uuid().nullable() }),
]);
export type MailTemplateCommand = z.infer<typeof mailTemplateCommand>;

/** First name of a full name, for {prénom}. */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";

/** The templates offered to every club: warm and clear, in the three languages. */
export const builtins: Record<Exclude<Usage, "free">, { name: Record<Lang, string>; texts: Texts }> = {
  dues_reminder: {
    name: { fr: "Rappel de cotisation", nl: "Herinnering lidgeld", en: "Membership fee reminder" },
    texts: {
      fr: {
        subject: "{club} : petit rappel pour la cotisation",
        body: "Bonjour {prénom},\n\nNous espérons que tout va bien ! Un petit rappel : la cotisation de {montant} est attendue pour le {échéance}.\n\nVous trouverez le détail et les moyens de paiement ici : {lien}\n\nSi c'est déjà fait, merci et ne tenez pas compte de ce message. Une question ? Répondez simplement à cet email.\n\nSportivement,\n{club}",
      },
      nl: {
        subject: "{club}: kleine herinnering voor het lidgeld",
        body: "Hallo {prénom},\n\nWe hopen dat alles goed gaat! Een kleine herinnering: het lidgeld van {montant} wordt verwacht tegen {échéance}.\n\nDe details en betaalmogelijkheden vindt u hier: {lien}\n\nAl betaald? Dank u, en negeer dan dit bericht. Een vraag? Antwoord gewoon op deze e-mail.\n\nSportieve groeten,\n{club}",
      },
      en: {
        subject: "{club}: a quick reminder about the membership fee",
        body: "Hello {prénom},\n\nWe hope all is well! A quick reminder: the membership fee of {montant} is due on {échéance}.\n\nYou will find the details and how to pay here: {lien}\n\nIf it is already done, thank you and please ignore this message. A question? Just reply to this email.\n\nBest wishes,\n{club}",
      },
    },
  },
  event_invitation: {
    name: { fr: "Invitation à un événement", nl: "Uitnodiging voor een activiteit", en: "Event invitation" },
    texts: {
      fr: {
        subject: "Invitation : {événement} le {date}",
        body: "Bonjour {prénom},\n\nNous serions ravis de vous voir à {événement}, le {date} à {lieu}.\n\nDites-nous si vous venez en un clic : {lien}\n\nÀ très bientôt,\n{club}",
      },
      nl: {
        subject: "Uitnodiging: {événement} op {date}",
        body: "Hallo {prénom},\n\nWe zien u graag op {événement}, op {date} in {lieu}.\n\nLaat ons met één klik weten of u komt: {lien}\n\nTot binnenkort,\n{club}",
      },
      en: {
        subject: "Invitation: {événement} on {date}",
        body: "Hello {prénom},\n\nWe would be delighted to see you at {événement}, on {date} at {lieu}.\n\nLet us know if you are coming in one click: {lien}\n\nSee you soon,\n{club}",
      },
    },
  },
  document_reminder: {
    name: { fr: "Rappel de document", nl: "Herinnering document", en: "Document reminder" },
    texts: {
      fr: {
        subject: "{club} : un document à nous transmettre",
        body: "Bonjour {prénom},\n\nPour que tout soit en ordre, il nous manque encore un document. Vous pouvez le déposer en quelques secondes ici : {lien}\n\nMerci beaucoup, et n'hésitez pas à nous écrire en cas de souci.\n\n{club}",
      },
      nl: {
        subject: "{club}: een document om ons te bezorgen",
        body: "Hallo {prénom},\n\nOm alles in orde te hebben, ontbreekt er nog een document. U kunt het hier in enkele seconden opladen: {lien}\n\nHartelijk dank, en schrijf ons gerust bij een probleem.\n\n{club}",
      },
      en: {
        subject: "{club}: a document to send us",
        body: "Hello {prénom},\n\nTo have everything in order, we are still missing a document. You can upload it in a few seconds here: {lien}\n\nThank you very much, and feel free to write to us if anything is unclear.\n\n{club}",
      },
    },
  },
  new_season: {
    name: { fr: "Nouvelle saison", nl: "Nieuw seizoen", en: "New season" },
    texts: {
      fr: {
        subject: "{club} : c'est reparti pour une nouvelle saison !",
        body: "Bonjour {prénom},\n\nUne nouvelle saison commence et nous avons hâte de vous retrouver sur le terrain.\n\nPour bien démarrer, prenez deux minutes pour vérifier vos informations (coordonnées, contacts, documents) : {lien}\n\nMerci et belle saison à toutes et à tous !\n{club}",
      },
      nl: {
        subject: "{club}: we beginnen aan een nieuw seizoen!",
        body: "Hallo {prénom},\n\nEen nieuw seizoen begint en we kijken ernaar uit u terug op het veld te zien.\n\nNeem twee minuten om uw gegevens na te kijken (contactgegevens, contactpersonen, documenten): {lien}\n\nBedankt en een fijn seizoen aan iedereen!\n{club}",
      },
      en: {
        subject: "{club}: here we go for a new season!",
        body: "Hello {prénom},\n\nA new season is starting and we can't wait to see you on the pitch again.\n\nTo start well, take two minutes to check your details (contact details, contacts, documents): {lien}\n\nThank you and have a great season, everyone!\n{club}",
      },
    },
  },
  welcome: {
    name: { fr: "Bienvenue à une nouvelle recrue", nl: "Welkom aan een nieuw lid", en: "Welcome to a new member" },
    texts: {
      fr: {
        subject: "Bienvenue au {club}, {prénom} !",
        body: "Bonjour {prénom},\n\nToute l'équipe du {club} est très heureuse de vous accueillir. Vous rejoignez {équipe} : les coachs vous attendent avec plaisir.\n\nTout se passe ici (entraînements, matchs, documents) : {lien}\n\nÀ très vite sur le terrain !\n{club}",
      },
      nl: {
        subject: "Welkom bij {club}, {prénom}!",
        body: "Hallo {prénom},\n\nHet hele team van {club} is heel blij u te verwelkomen. U komt bij {équipe}: de coaches kijken ernaar uit.\n\nAlles gebeurt hier (trainingen, wedstrijden, documenten): {lien}\n\nTot heel snel op het veld!\n{club}",
      },
      en: {
        subject: "Welcome to {club}, {prénom}!",
        body: "Hello {prénom},\n\nEveryone at {club} is very happy to welcome you. You are joining {équipe}: the coaches look forward to meeting you.\n\nEverything happens here (trainings, matches, documents): {lien}\n\nSee you very soon on the pitch!\n{club}",
      },
    },
  },
  match_invitation: {
    name: { fr: "Invitation à un match", nl: "Uitnodiging voor een wedstrijd", en: "Match invitation" },
    texts: {
      fr: {
        subject: "{équipe} : match le {date}",
        body: "Bonjour {prénom},\n\nTu es attendu pour {événement} le {date} à {lieu}.\n\nMerci de confirmer ta présence au plus vite : {lien}\n\nAllez {équipe} !\n{club}",
      },
      nl: {
        subject: "{équipe}: wedstrijd op {date}",
        body: "Hallo {prénom},\n\nWe verwachten je voor {événement} op {date} in {lieu}.\n\nBevestig zo snel mogelijk of je komt: {lien}\n\nHup {équipe}!\n{club}",
      },
      en: {
        subject: "{équipe}: match on {date}",
        body: "Hello {prénom},\n\nYou are expected for {événement} on {date} at {lieu}.\n\nPlease confirm as soon as you can: {lien}\n\nCome on {équipe}!\n{club}",
      },
    },
  },
  sponsor_thanks: {
    name: { fr: "Remerciement à un sponsor", nl: "Dankwoord aan een sponsor", en: "Thanks to a sponsor" },
    texts: {
      fr: {
        subject: "Merci pour votre soutien au {club}",
        body: "Bonjour {prénom},\n\nAu nom de tous les joueurs, coachs et bénévoles du {club}, un immense merci pour votre soutien. Grâce à vous, nos joueurs en fauteuil peuvent s'entraîner et jouer dans de bonnes conditions.\n\nNos nouvelles sont ici : {lien}\n\nAvec toute notre reconnaissance,\n{club}",
      },
      nl: {
        subject: "Bedankt voor uw steun aan {club}",
        body: "Hallo {prénom},\n\nNamens alle spelers, coaches en vrijwilligers van {club}, heel erg bedankt voor uw steun. Dankzij u kunnen onze spelers in hun rolstoel in goede omstandigheden trainen en spelen.\n\nOns nieuws vindt u hier: {lien}\n\nMet onze oprechte dank,\n{club}",
      },
      en: {
        subject: "Thank you for supporting {club}",
        body: "Hello {prénom},\n\nOn behalf of all the players, coaches and volunteers of {club}, a huge thank you for your support. Thanks to you, our wheelchair players can train and play in good conditions.\n\nOur news is here: {lien}\n\nWith all our gratitude,\n{club}",
      },
    },
  },
};
