import { z } from "zod";

/** H3: mini polls. Pure parts shared by the service, the pages and the tests. */
export const pollKinds = ["dates", "single", "multiple"] as const;
export const clubAudiences = ["team", "team_parents", "coaches", "staff", "members"] as const;
export const federationAudiences = ["presidents", "staff"] as const;
export const answerValues = ["yes", "maybe", "no"] as const;
const id = z.uuid();
export const pollCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(pollKinds),
    question: z.string().trim().min(3).max(200),
    detail: z.string().trim().max(1000).default(""),
    anonymous: z.boolean().default(false),
    audience: z.enum(["team", "team_parents", "coaches", "staff", "members", "presidents"]),
    teamId: id.nullable().default(null),
    perChild: z.boolean().default(false),
    closesAt: z.iso.datetime({ offset: true }),
    options: z.array(z.object({ label: z.string().trim().min(1).max(120), startsAt: z.iso.datetime({ offset: true }).nullable().default(null) })).min(2).max(20),
    sourceEventId: id.nullable().default(null),
  }),
  z.object({ action: z.literal("answer"), recipientId: id, answers: z.array(z.object({ optionId: id, value: z.enum(answerValues) })).min(1).max(20) }),
  z.object({ action: z.literal("close"), id }),
  /** At the closing: the event of the chosen date, or the task of the chosen option. */
  z.object({ action: z.literal("outcome"), id, optionId: id }),
]);
export type PollCommand = z.infer<typeof pollCommand>;
export const publicAnswer = z.object({ answers: z.array(z.object({ optionId: id, value: z.enum(answerValues) })).min(1).max(20) });

/** A set of answers fits its poll: every date answered; one « yes » for a single choice; one at least for several. */
export function validAnswers(kind: (typeof pollKinds)[number], optionIds: string[], answers: { optionId: string; value: string }[]) {
  if (answers.some((a) => !optionIds.includes(a.optionId)) || new Set(answers.map((a) => a.optionId)).size !== answers.length) return false;
  const yes = answers.filter((a) => a.value === "yes").length;
  if (kind === "dates") return answers.length === optionIds.length;
  if (answers.some((a) => a.value === "maybe")) return false;
  return kind === "single" ? yes === 1 : yes >= 1;
}
/** The live results: for each option, its yes, if need be and no. */
export function tally(options: { id: string }[], answers: { option_id: string; value: string }[]) {
  return options.map((o) => ({
    id: o.id,
    yes: answers.filter((a) => a.option_id === o.id && a.value === "yes").length,
    maybe: answers.filter((a) => a.option_id === o.id && a.value === "maybe").length,
    no: answers.filter((a) => a.option_id === o.id && a.value === "no").length,
  }));
}
/** The option the results point to: most « yes », then most « if need be ». */
export function leading(t: ReturnType<typeof tally>) {
  return [...t].sort((a, b) => b.yes - a.yes || b.maybe - a.maybe)[0]?.id ?? null;
}
/** One relaunch, 24 hours before closing, to who has not answered. */
export const dueForReminder = (closesAt: Date, now: Date, reminded: boolean, answered: boolean) => !reminded && !answered && closesAt.getTime() - now.getTime() <= 24 * 3600000 && closesAt > now;
