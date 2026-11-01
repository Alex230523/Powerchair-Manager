import { z } from "zod";

/**
 * Wave 17 (J4): classification days. Pure parts, shared by the server and
 * the screens: the commands, the federation's PF1/PF2 texts and their
 * defaults, what a decision does to the player's sport profile and when a
 * day can be published.
 */
export const languages = ["fr", "nl", "en"] as const;
export const classes = ["PF1", "PF2"] as const;
export const decisions = ["PF1", "PF2", "review"] as const;
export type Decision = (typeof decisions)[number];

const text = z.string().trim().min(1).max(500);
const perLanguage = z.object({ fr: text, nl: text, en: text });
export const classificationTexts = z.object({ PF1: perLanguage, PF2: perLanguage });
export type ClassificationTexts = z.infer<typeof classificationTexts>;

/** Until the federation writes its own. */
export const defaultTexts: ClassificationTexts = {
  PF1: {
    fr: "Joueur dont le handicap limite le plus la conduite du fauteuil et le jeu.",
    nl: "Speler wiens beperking het besturen van de rolstoel en het spel het meest beperkt.",
    en: "Player whose impairment most limits driving the chair and playing.",
  },
  PF2: {
    fr: "Joueur moins limité ; le règlement limite le nombre de PF2 en même temps sur le terrain.",
    nl: "Minder beperkte speler; het reglement beperkt het aantal PF2 tegelijk op het veld.",
    en: "Less limited player; the rules cap how many PF2 can be on the pitch at the same time.",
  },
};
/** The stored texts when complete and valid, otherwise the defaults. */
export function textsOf(stored: unknown): ClassificationTexts {
  const parsed = classificationTexts.safeParse(stored);
  return parsed.success ? parsed.data : defaultTexts;
}

const id = z.uuid();
export const classificationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    day: z.iso.date(),
    registrationDeadline: z.iso.date(),
    sharedVenueId: id.nullable(),
    venue: z.string().trim().max(200).default(""),
    notes: z.string().trim().max(2000).default(""),
    clubIds: z.array(id).min(1).max(200),
    classifierIds: z.array(z.string().min(1).max(200)).max(50).default([]),
  }),
  z.object({ action: z.literal("cancel"), id }),
  z.object({ action: z.literal("publish"), id }),
  z.object({ action: z.literal("texts"), texts: classificationTexts }),
  z.object({ action: z.literal("register"), sessionId: id, profileIds: z.array(id).min(1).max(100) }),
  z.object({ action: z.literal("unregister"), sessionId: id, profileId: id }),
  z.object({
    action: z.literal("mark"),
    id,
    present: z.boolean().nullable(),
    decision: z.enum(decisions).nullable(),
    comment: z.string().trim().max(1000).default(""),
  }),
]);
export type ClassificationCommand = z.infer<typeof classificationCommand>;

/** A day is created with a deadline from today up to the day itself. */
export function validDates(day: string, deadline: string, today: string) {
  return today <= deadline && deadline <= day;
}
/** Clubs register until the deadline included, while the day is open. */
export function registrationOpen(session: { status: string; registration_deadline: string }, today: string) {
  return session.status === "open" && today <= session.registration_deadline;
}

/** What a decision writes on the sport profile. « À revoir » keeps the class and refuses the check. */
export function outcome(decision: Decision, current: string, comment: string, reviewNote: string) {
  if (decision === "review") return { classification: current, status: "refused" as const, note: (comment || reviewNote).slice(0, 500) };
  return { classification: decision, status: "validated" as const, note: comment.slice(0, 500) };
}

type Line = { present: boolean | null; decision: Decision | null };
/** Every registered player marked present or absent, and every present one decided. */
export function publishable(lines: Line[]) {
  const unmarked = lines.filter((l) => l.present === null).length;
  const undecided = lines.filter((l) => l.present === true && !l.decision).length;
  return { ok: lines.length > 0 && !unmarked && !undecided, unmarked, undecided, decided: lines.filter((l) => l.present && l.decision).length };
}

/** The class shown for a sport profile: « Non définie » when missing. */
export function shownClass(value: string | null | undefined): "PF1" | "PF2" | "pending" | "not_classified" {
  return value === "PF1" || value === "PF2" || value === "pending" ? value : "not_classified";
}
