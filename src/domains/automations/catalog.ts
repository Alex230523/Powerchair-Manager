import type { OptionalModule } from "../access/rights";

/**
 * B7: the catalogue of automations (module 17 of the specification). No
 * free builder: each rule is written here with its trigger, its conditions,
 * its delay and who it may reach. « Intégrées » are the reminders that
 * existed before the engine: they keep their wording (the notification
 * templates) and their timing, and gain the pause, the stop, the journal
 * and the simulation.
 */
export const ruleKeys = [
  "duesReminder",
  "documentExpiring",
  "registrationReview",
  "callNoAnswer",
  "licenceExpiring",
  "chairService",
  "grantDeadline",
  "sponsorRenewal",
  "sponsorQuiet",
  "taskLate",
] as const;
export type RuleKey = (typeof ruleKeys)[number];
export type Recipients = "person" | "president" | "responsible";
export type Action = "notify" | "email" | "task";
export type RuleDef = {
  /** Existing reminders moved into the engine: fixed timing, wording from the templates. */
  builtin: boolean;
  /** Before any setting is saved. */
  enabled: boolean;
  modules: OptionalModule[];
  /** Days: before a date (documentExpiring), after a date (taskLate), …; null: fixed. */
  delay: { value: number; min: number; max: number } | null;
  recipients: Recipients[];
  actions: Action[];
  defaultActions: Action[];
  /** The to-do category of the task an action creates. */
  category?: "admin" | "sport" | "equipment" | "grants" | "sponsors";
};
export const catalog: Record<RuleKey, RuleDef> = {
  duesReminder: { builtin: true, enabled: false, modules: ["dues", "reminders"], delay: null, recipients: ["person"], actions: ["email"], defaultActions: ["email"] },
  documentExpiring: { builtin: false, enabled: false, modules: [], delay: { value: 30, min: 1, max: 120 }, recipients: ["person", "president"], actions: ["notify", "email", "task"], defaultActions: ["notify", "email"], category: "admin" },
  registrationReview: { builtin: false, enabled: false, modules: [], delay: { value: 3, min: 0, max: 60 }, recipients: ["president"], actions: ["notify", "email", "task"], defaultActions: ["notify", "email"], category: "sport" },
  callNoAnswer: { builtin: true, enabled: true, modules: [], delay: null, recipients: ["person"], actions: ["notify", "email"], defaultActions: ["notify", "email"] },
  licenceExpiring: { builtin: true, enabled: true, modules: [], delay: null, recipients: ["person"], actions: ["email"], defaultActions: ["email"] },
  chairService: { builtin: false, enabled: false, modules: ["equipment"], delay: { value: 14, min: 1, max: 90 }, recipients: ["president"], actions: ["notify", "email", "task"], defaultActions: ["notify", "email"], category: "equipment" },
  grantDeadline: { builtin: true, enabled: true, modules: ["finance"], delay: null, recipients: ["president"], actions: ["email"], defaultActions: ["email"] },
  sponsorRenewal: { builtin: true, enabled: true, modules: ["finance"], delay: null, recipients: ["president"], actions: ["email"], defaultActions: ["email"] },
  sponsorQuiet: { builtin: false, enabled: false, modules: ["finance"], delay: { value: 90, min: 30, max: 365 }, recipients: ["responsible", "president"], actions: ["notify", "email", "task"], defaultActions: ["notify", "email"], category: "sponsors" },
  // Tasks created by an automation are never « late » for this rule: no loop between rules.
  taskLate: { builtin: false, enabled: false, modules: [], delay: { value: 1, min: 0, max: 60 }, recipients: ["responsible"], actions: ["notify", "email"], defaultActions: ["notify", "email"] },
};

/** The message of a non built-in rule, editable per club; {person}, {about}, {date}, {organization}. */
export type Message = { subject: string; body: string };
export const defaultMessages: Record<Exclude<RuleKey, "duesReminder" | "callNoAnswer" | "licenceExpiring" | "grantDeadline" | "sponsorRenewal">, Record<"fr" | "nl" | "en", Message>> = {
  documentExpiring: {
    fr: { subject: "Document à renouveler · {about}", body: "Bonjour,\nLe document « {about} » de {person} expire le {date}. Pensez à déposer la nouvelle version dans votre espace." },
    nl: { subject: "Document te vernieuwen · {about}", body: "Hallo,\nHet document « {about} » van {person} vervalt op {date}. Denk eraan de nieuwe versie in uw ruimte te zetten." },
    en: { subject: "Document to renew · {about}", body: "Hello,\nThe document « {about} » of {person} expires on {date}. Please upload the new version in your space." },
  },
  registrationReview: {
    fr: { subject: "Inscription à examiner · {about}", body: "Bonjour,\nL'inscription de {about} attend une décision depuis le {date}." },
    nl: { subject: "Inschrijving te beoordelen · {about}", body: "Hallo,\nDe inschrijving van {about} wacht sinds {date} op een beslissing." },
    en: { subject: "Registration to review · {about}", body: "Hello,\nThe registration of {about} has been waiting for a decision since {date}." },
  },
  chairService: {
    fr: { subject: "Révision de fauteuil · {about}", body: "Bonjour,\nLe fauteuil {about} doit être révisé pour le {date}." },
    nl: { subject: "Nazicht van rolstoel · {about}", body: "Hallo,\nDe rolstoel {about} moet tegen {date} nagekeken worden." },
    en: { subject: "Chair service · {about}", body: "Hello,\nThe chair {about} is due for service by {date}." },
  },
  sponsorQuiet: {
    fr: { subject: "Sponsor sans nouvelles · {about}", body: "Bonjour,\nAucun contact avec {about} depuis le {date}. Un appel ou un mot suffit pour garder le lien." },
    nl: { subject: "Sponsor zonder nieuws · {about}", body: "Hallo,\nGeen contact met {about} sinds {date}. Een telefoontje of een berichtje volstaat om de band te houden." },
    en: { subject: "Sponsor without news · {about}", body: "Hello,\nNo contact with {about} since {date}. A call or a short note keeps the link alive." },
  },
  taskLate: {
    fr: { subject: "Tâche en retard · {about}", body: "Bonjour {person},\nLa tâche « {about} » était prévue pour le {date}." },
    nl: { subject: "Taak te laat · {about}", body: "Hallo {person},\nDe taak « {about} » was voorzien tegen {date}." },
    en: { subject: "Late task · {about}", body: "Hello {person},\nThe task « {about} » was due on {date}." },
  },
};
export type EditableRule = keyof typeof defaultMessages;
export const isEditable = (rule: RuleKey): rule is EditableRule => Object.hasOwn(defaultMessages, rule);
export const render = (text: string, v: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));
