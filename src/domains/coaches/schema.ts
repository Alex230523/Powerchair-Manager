import { z } from "zod";

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);

/** Club side: the president asks the federation to record a course for a coach. */
export const clubCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("requestCourse"),
    profileId: id,
    courseId: id,
    note: text(1000),
  }),
  z.object({ action: z.literal("cancelRequest"), id }),
]);
export type ClubCommand = z.infer<typeof clubCommand>;

const courseFields = {
  title: text(120).min(2),
  level: text(60),
  description: text(2000),
  hours: z.number().min(0).max(1000).nullable(),
  validityYears: z.number().int().min(1).max(20).nullable(),
};
/** Federation side: course catalogue and decisions on club requests. */
export const federationCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createCourse"), ...courseFields }),
  z.object({
    action: z.literal("updateCourse"),
    id,
    version: z.number().int().positive(),
    active: z.boolean(),
    ...courseFields,
  }),
  z.object({
    action: z.literal("decide"),
    id,
    decision: z.enum(["approved", "refused"]),
    note: text(1000),
    completedOn: z.iso.date().nullable(),
  }),
]);
export type FederationCommand = z.infer<typeof federationCommand>;

/** Expiry of a completed course, or null when it never expires. */
export function validUntil(completedOn: string, years: number | null) {
  if (!years) return null;
  const [y, m, d] = completedOn.split("-").map(Number);
  const date = new Date(Date.UTC(y + years, m - 1, d));
  // 29 February rolls back to 28 February in a non-leap year.
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export type CoachAttendanceRow = {
  kind: string;
  status: string;
  response: string;
  actual: string;
  closed: boolean;
  withdrawn: boolean;
};
/** Groups calendar kinds the way coaches think about them. */
export function sessionGroup(kind: string): "training" | "match" | "other" {
  if (kind === "training" || kind === "camp") return "training";
  if (kind === "friendly" || kind === "tournament") return "match";
  return "other";
}
/** Presence of a coach per group: invited sessions, closed registers, attended. */
export function coachAttendance(rows: CoachAttendanceRow[]) {
  const out = {
    training: { invited: 0, closed: 0, attended: 0 },
    match: { invited: 0, closed: 0, attended: 0 },
    other: { invited: 0, closed: 0, attended: 0 },
  };
  for (const r of rows) {
    if (r.withdrawn || r.status === "cancelled") continue;
    const g = out[sessionGroup(r.kind)];
    g.invited++;
    if (!r.closed) continue;
    g.closed++;
    if (["present", "late", "early"].includes(r.actual)) g.attended++;
  }
  return out;
}
