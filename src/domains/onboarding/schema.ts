import { z } from "zod";

/**
 * Parcours d'accueil: a template is a list of steps chosen from a list of
 * kinds, each reusing what exists (message, reading, signature, a profile
 * field, a document to upload, a training, a task, a meeting, the guided
 * tour). Pure parts shared by the service, the pages and the tests.
 */
export const stepKinds = ["message", "read", "sign", "profile", "upload", "training", "task", "meeting", "tour"] as const;
export type StepKind = (typeof stepKinds)[number];
export const audiences = ["coach", "player", "guardian", "referee", "federation_worker"] as const;
export type Audience = (typeof audiences)[number];
/** The profile fields a step can ask, and where each is read. */
export const profileFields = ["phone", "birth_date", "licence", "photo", "availability"] as const;
export type ProfileField = (typeof profileFields)[number];
/** Steps the newcomer marks himself; the others tick by themselves when their brick is done. */
export const selfSteps: StepKind[] = ["message", "read", "sign", "training"];

const text3 = z.object({ fr: z.string().trim().max(2000), nl: z.string().trim().max(2000), en: z.string().trim().max(2000) });
export const stepSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: z.enum(stepKinds),
  title: text3,
  body: text3.default({ fr: "", nl: "", en: "" }),
  /** The field (profile), the document's name (upload) or nothing. */
  link: z.string().trim().max(200).default(""),
  daysAfter: z.number().int().min(0).max(365).default(7),
  required: z.boolean().default(true),
  /** Who takes part on the club's side (meeting, check): a profile (club) or an account (federation). */
  ownerId: z.string().max(80).nullable().default(null),
});
export type Step = z.infer<typeof stepSchema>;

const id = z.uuid();
export const onboardingCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveTemplate"), id: id.optional(), name: z.string().trim().min(2).max(120), audience: z.enum(audiences), trigger: z.enum(["invitation", "manual"]), steps: z.array(stepSchema).min(1).max(30) }),
  z.object({ action: z.literal("archiveTemplate"), id, archived: z.boolean() }),
  /** 2: a proposed template, added to the club's or federation's own (then changed freely). */
  z.object({ action: z.literal("adopt"), key: z.enum(["coach", "referee", "family"]), locale: z.enum(["fr", "nl", "en"]) }),
  /** A journey started by hand. */
  z.object({ action: z.literal("start"), templateId: id, userId: z.string().min(1).max(80) }),
  z.object({ action: z.literal("cancel"), runId: id }),
  /** The newcomer: read, signed (his name), training asked. */
  z.object({ action: z.literal("done"), runId: id, key: z.string().max(40), signedName: z.string().trim().max(120).optional() }),
  /** The club marks a step done (a meeting held, a check made). */
  z.object({ action: z.literal("mark"), runId: id, key: z.string().max(40), done: z.boolean() }),
  /** 5: one gentle reminder to everyone late. */
  z.object({ action: z.literal("remind") }),
]);
export type OnboardingCommand = z.infer<typeof onboardingCommand>;

/** The deadline of a step, from the arrival. */
export const dueOf = (start: string, days: number) => new Date(Date.parse(start + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

/** Progress and the next step: required ones count, the next is the first not done. */
export function progress(steps: { key: string; required: boolean; done_at: string | Date | null; due_on: string }[], today: string) {
  const required = steps.filter((s) => s.required);
  const done = required.filter((s) => s.done_at).length;
  const next = steps.find((s) => !s.done_at) ?? null;
  const late = steps.filter((s) => s.required && !s.done_at && s.due_on < today).length;
  return { done, total: required.length, percent: required.length ? Math.round((done * 100) / required.length) : 100, next: next?.key ?? null, late, finished: done === required.length };
}

type T3 = { fr: string; nl: string; en: string };
const s = (key: string, kind: StepKind, title: T3, daysAfter: number, extra: Partial<Step> = {}): Step => ({ key, kind, title, body: { fr: "", nl: "", en: "" }, link: "", daysAfter, required: true, ownerId: null, ...extra });
/** 2: the proposed templates, changed freely once adopted. */
export const suggested: Record<"coach" | "referee" | "family", { audience: Audience; name: T3; steps: Step[] }> = {
  coach: {
    audience: "coach",
    name: { fr: "Nouveau coach", nl: "Nieuwe coach", en: "New coach" },
    steps: [
      s("welcome", "message", { fr: "Mot de bienvenue du président", nl: "Welkomstwoord van de voorzitter", en: "Welcome word from the president" }, 0, {
        body: { fr: "Bienvenue au club ! Merci de rejoindre l'équipe des coachs.", nl: "Welkom bij de club! Bedankt om het coachteam te versterken.", en: "Welcome to the club! Thank you for joining the coaching team." },
      }),
      s("charter", "sign", { fr: "Signer la charte du club", nl: "Het clubcharter ondertekenen", en: "Sign the club's charter" }, 7, {
        body: { fr: "Je m'engage à respecter les joueurs, leurs familles et les règles du club.", nl: "Ik verbind me ertoe de spelers, hun families en de clubregels te respecteren.", en: "I undertake to respect the players, their families and the club's rules." },
      }),
      s("phone", "profile", { fr: "Indiquer son téléphone", nl: "Zijn telefoonnummer invullen", en: "Give one's phone number" }, 7, { link: "phone" }),
      s("licence", "profile", { fr: "Déclarer son permis de conduire", nl: "Zijn rijbewijs aangeven", en: "Declare one's driving licence" }, 14, { link: "licence", required: false }),
      s("certificate", "upload", { fr: "Déposer le certificat de bonne vie et mœurs", nl: "Het getuigschrift van goed gedrag en zeden opladen", en: "Upload the certificate of good conduct" }, 30, { link: "Certificat de bonne vie et mœurs" }),
      s("training", "training", { fr: "Demander la validation de sa formation", nl: "De validatie van zijn opleiding aanvragen", en: "Ask the validation of one's training" }, 60, { required: false }),
      s("observe", "task", { fr: "Observer un entraînement", nl: "Een training bijwonen", en: "Observe a training session" }, 14),
      s("meet", "meeting", { fr: "Rencontre avec le président", nl: "Ontmoeting met de voorzitter", en: "Meeting with the president" }, 21),
      s("tour", "tour", { fr: "Visite guidée de l'espace coach", nl: "Rondleiding in de coachruimte", en: "Guided tour of the coach's space" }, 3),
      // Guide du powerchair football: the two pages, ticked once read.
      s("guide-game", "read", { fr: "Lire « Le powerchair football en une page »", nl: "« Powerchair football op één pagina » lezen", en: "Read « Powerchair football on one page »" }, 14, { link: "guide:game" }),
      s("guide-chair", "read", { fr: "Lire « Le fauteuil de match »", nl: "« De wedstrijdrolstoel » lezen", en: "Read « The match chair »" }, 21, { link: "guide:chair" }),
    ],
  },
  referee: {
    audience: "referee",
    name: { fr: "Nouvel arbitre", nl: "Nieuwe scheidsrechter", en: "New referee" },
    steps: [
      s("welcome", "message", { fr: "Bienvenue dans le corps arbitral", nl: "Welkom bij het scheidsrechterskorps", en: "Welcome to the referees" }, 0, {
        body: { fr: "Bienvenue ! Voici les premières étapes avant votre premier match.", nl: "Welkom! Dit zijn de eerste stappen voor uw eerste wedstrijd.", en: "Welcome! Here are the first steps before your first match." },
      }),
      s("rules", "read", { fr: "Lire le règlement des arbitres", nl: "Het reglement voor scheidsrechters lezen", en: "Read the referees' rules" }, 7),
      s("code", "sign", { fr: "Signer le code de conduite", nl: "De gedragscode ondertekenen", en: "Sign the code of conduct" }, 7, {
        body: { fr: "Je m'engage à arbitrer avec impartialité et respect.", nl: "Ik verbind me ertoe onpartijdig en respectvol te fluiten.", en: "I undertake to referee impartially and with respect." },
      }),
      s("availability", "profile", { fr: "Renseigner ses disponibilités", nl: "Zijn beschikbaarheden invullen", en: "Give one's availability" }, 14, { link: "availability" }),
      s("training", "training", { fr: "Suivre la formation d'arbitre", nl: "De scheidsrechtersopleiding volgen", en: "Follow the referee training" }, 60),
      s("observe", "meeting", { fr: "Observer un match avec un arbitre confirmé", nl: "Een wedstrijd bijwonen met een ervaren scheidsrechter", en: "Observe a match with an experienced referee" }, 30),
      s("tour", "tour", { fr: "Visite guidée de l'espace arbitre", nl: "Rondleiding in de scheidsrechtersruimte", en: "Guided tour of the referee's space" }, 3),
      s("guide-game", "read", { fr: "Lire « Le powerchair football en une page »", nl: "« Powerchair football op één pagina » lezen", en: "Read « Powerchair football on one page »" }, 14, { link: "guide:game" }),
      s("guide-chair", "read", { fr: "Lire « Le fauteuil de match »", nl: "« De wedstrijdrolstoel » lezen", en: "Read « The match chair »" }, 21, { link: "guide:chair" }),
    ],
  },
  family: {
    audience: "guardian",
    name: { fr: "Nouveau joueur et sa famille", nl: "Nieuwe speler en zijn gezin", en: "New player and family" },
    steps: [
      s("welcome", "message", { fr: "Bienvenue au club", nl: "Welkom bij de club", en: "Welcome to the club" }, 0, {
        body: { fr: "Bienvenue ! Quelques étapes pour bien commencer la saison.", nl: "Welkom! Enkele stappen om het seizoen goed te beginnen.", en: "Welcome! A few steps to start the season well." },
      }),
      s("check", "read", { fr: "Vérifier les informations de la fiche", nl: "De gegevens van de fiche nakijken", en: "Check the details of the file" }, 7),
      s("authorizations", "read", { fr: "Lire et signer les autorisations parentales (page Famille)", nl: "De ouderlijke toestemmingen lezen en ondertekenen (pagina Gezin)", en: "Read and sign the parental authorizations (Family page)" }, 14),
      s("phone", "profile", { fr: "Indiquer un téléphone", nl: "Een telefoonnummer invullen", en: "Give a phone number" }, 7, { link: "phone" }),
      s("first", "task", { fr: "Répondre à la première invitation à l'entraînement", nl: "Antwoorden op de eerste uitnodiging voor de training", en: "Answer the first training invitation" }, 14),
      s("guide-game", "read", { fr: "Lire « Le powerchair football en une page »", nl: "« Powerchair football op één pagina » lezen", en: "Read « Powerchair football on one page »" }, 14, { link: "guide:game" }),
      s("guide-chair", "read", { fr: "Lire « Le fauteuil de match »", nl: "« De wedstrijdrolstoel » lezen", en: "Read « The match chair »" }, 21, { link: "guide:chair", required: false }),
    ],
  },
};
