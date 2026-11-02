import { z } from "zod";

/**
 * 17: the ASBL's life. Pure parts: the statutes' rules (set by the club,
 * never guessed), the quorum, the majority of a vote, the dates around an
 * assembly, the mandates that end. Not legal advice: every rule is a
 * setting to align with the club's statutes.
 */
export const memberStatuses = ["effective", "adherent", "none"] as const;
export type MemberStatus = (typeof memberStatuses)[number];
export const boardRoles = ["president", "vice_president", "secretary", "treasurer", "director"] as const;
export const itemKinds = ["accounts", "budget", "discharge", "mandate", "admission", "exit", "free"] as const;
export type ItemKind = (typeof itemKinds)[number];
export const majorities = ["simple", "absolute", "two_thirds", "four_fifths"] as const;
export type Majority = (typeof majorities)[number];

const majority = z.enum(majorities);
export const rulesSchema = z.object({
  /** Days between the invitation and the assembly (15 by default, as the law asks at least). */
  noticeDays: z.number().int().min(8).max(90).default(15),
  /** Share of effective members present or represented for the assembly to decide; 0: no quorum. */
  quorumPercent: z.number().int().min(0).max(100).default(0),
  /** A second assembly decides whatever the number present. */
  secondWithoutQuorum: z.boolean().default(true),
  majorities: z
    .object({ accounts: majority, budget: majority, discharge: majority, mandate: majority, admission: majority, exit: majority, free: majority })
    .default({ accounts: "simple", budget: "simple", discharge: "simple", mandate: "simple", admission: "simple", exit: "two_thirds", free: "simple" }),
  /** Proxies one member may hold. */
  maxProxies: z.number().int().min(0).max(10).default(1),
  remoteVote: z.boolean().default(false),
  /** Days to write a decision in the register before the secretariat is reminded. */
  recordDelayDays: z.number().int().min(1).max(60).default(8),
  /** Days to publish a change of directors in the Moniteur belge, and to update the UBO register. */
  publicationDays: z.number().int().min(1).max(120).default(30),
  uboDays: z.number().int().min(1).max(120).default(30),
});
export type Rules = z.infer<typeof rulesSchema>;
/** The club's rules, completed by the defaults. */
export const rulesOf = (raw: unknown): Rules => rulesSchema.parse(raw && typeof raw === "object" ? raw : {});

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const date = z.iso.date();
export const associationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rules"), rules: rulesSchema }),
  /** 1 and 2: a status decided (admission, resignation, exclusion, change, board). */
  z.object({
    action: z.literal("status"),
    profileId: id,
    event: z.enum(["admission", "resignation", "exclusion", "status", "board_start", "board_end"]),
    status: z.enum(memberStatuses),
    decisionBody: z.enum(["assembly", "board"]).nullable(),
    decisionOn: date.nullable(),
    boardRole: z.enum(boardRoles).nullable().default(null),
    boardUntil: date.nullable().default(null),
    reason: text(1000).default(""),
  }),
  /** A line is never changed: a correction is a new line with its reason. */
  z.object({ action: z.literal("correct"), lineId: id, status: z.enum(memberStatuses), reason: text(1000).min(3) }),
  z.object({ action: z.literal("plan"), kind: z.enum(["assembly", "board"]), title: text(160).min(2), startsAt: z.iso.datetime({ offset: true }), place: text(300), fiscalYearStart: date.nullable().default(null), locale: z.enum(["fr", "nl", "en"]) }),
  z.object({ action: z.literal("cancel"), meetingId: id }),
  z.object({
    action: z.literal("item"),
    meetingId: id,
    id: id.optional(),
    kind: z.enum(itemKinds),
    title: text(300).min(2),
    detail: text(4000).default(""),
    majority: majority.optional(),
    profileId: id.nullable().default(null),
    boardRole: z.enum(boardRoles).nullable().default(null),
  }),
  z.object({ action: z.literal("removeItem"), id }),
  z.object({ action: z.literal("moveItem"), id, direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("sendInvite"), meetingId: id }),
  z.object({ action: z.literal("answer"), meetingId: id, profileId: id, answer: z.enum(["present", "absent"]) }),
  z.object({ action: z.literal("proxy"), meetingId: id, giverId: id, holderId: id.nullable() }),
  z.object({ action: z.literal("presence"), meetingId: id, profileId: id, present: z.boolean() }),
  z.object({ action: z.literal("vote"), itemId: id, for: z.number().int().min(0).max(10000), against: z.number().int().min(0).max(10000), abstain: z.number().int().min(0).max(10000) }),
  z.object({ action: z.literal("second"), meetingId: id, startsAt: z.iso.datetime({ offset: true }), locale: z.enum(["fr", "nl", "en"]) }),
  z.object({ action: z.literal("close"), meetingId: id, locale: z.enum(["fr", "nl", "en"]) }),
  z.object({ action: z.literal("minutes"), meetingId: id, text: text(40000).min(10) }),
  z.object({ action: z.literal("sign"), meetingId: id, role: z.enum(["president", "secretary"]), name: text(120).min(2) }),
]);
export type AssociationCommand = z.infer<typeof associationCommand>;

/** Present plus represented, against the effective members; 0 % asks no quorum. */
export function quorum(members: number, present: number, represented: number, percent: number) {
  const count = present + represented;
  const needed = percent ? Math.ceil((members * percent) / 100) : 0;
  return { members, present, represented, count, needed, reached: count >= needed };
}

/** Whether a point passes: simple (more for than against), absolute (more than half of those voting), two thirds or four fifths of the votes cast. */
export function adopted(m: Majority, v: { for: number; against: number; abstain: number }) {
  const cast = v.for + v.against;
  if (m === "simple") return v.for > v.against;
  if (m === "absolute") return v.for * 2 > v.for + v.against + v.abstain;
  if (m === "two_thirds") return cast > 0 && v.for * 3 >= cast * 2;
  return cast > 0 && v.for * 5 >= cast * 4;
}

const plus = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
/** 6: the steps before an assembly, from its date and the notice the statutes ask. */
export function assemblySteps(day: string, noticeDays: number) {
  return {
    prepare: plus(day, -noticeDays - 21),
    agenda: plus(day, -noticeDays - 3),
    invite: plus(day, -noticeDays),
    reminder: plus(day, -5),
  };
}

/** 7: the directors whose mandate ends by the assembly (or within its year). */
export function endingMandates<M extends { board_role: string | null; board_until: string | null }>(members: M[], day: string) {
  return members.filter((m) => m.board_role && m.board_until && m.board_until <= plus(day, 365));
}

/** 8: a proxy beyond the number a member may hold is refused. */
export const proxyAllowed = (held: number, max: number) => held < max;
