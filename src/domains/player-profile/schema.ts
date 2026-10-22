import { z } from "zod";
import { careMoments } from "../trips/schema";
/** FIPFA sport classes. "pending" = assessment requested, not yet decided. */
export const classifications = [
  "PF1",
  "PF2",
  "pending",
  "not_classified",
] as const;
/** How the player drives the chair (joystick position or alternative control). */
export const controls = [
  "",
  "right_hand",
  "left_hand",
  "chin",
  "head",
  "other",
] as const;
const id = z.uuid(),
  version = z.number().int().min(0),
  text = (n: number) => z.string().trim().max(n);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sport"),
    id,
    version,
    classification: z.enum(classifications),
    classificationValidUntil: z.iso.date().nullable(),
    control: z.enum(controls),
    sportNotes: text(2000),
  }),
  z.object({
    action: z.literal("support"),
    id,
    version,
    supportNeeds: text(2000),
    safetyNotes: text(2000),
    emergencyContact: text(300),
  }),
  z.object({
    action: z.literal("confidential"),
    id,
    version,
    impairment: text(2000),
    medicalNotes: text(2000),
  }),
  /** A care instruction (transfer, positioning, ventilation...), sealed at rest. */
  z.object({
    action: z.literal("care"),
    id,
    careId: z.uuid().optional(),
    moment: z.enum(careMoments),
    time: z.union([z.literal(""), z.string().regex(/^[0-2]\d:[0-5]\d$/)]),
    title: text(120).min(2),
    details: text(2000),
    active: z.boolean(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;

export type AttendanceRow = {
  kind: string;
  status: string;
  response: string;
  actual: string;
  closed: boolean;
  withdrawn: boolean;
};
export type AttendanceSummary = {
  invited: number;
  answered: number;
  closed: number;
  attended: number;
  absent: number;
  late: number;
};
/**
 * Attendance figures for one player. Cancelled events and withdrawn invitations
 * are ignored; presence only counts once the register is closed, so an open
 * register never lowers a rate.
 */
export function attendanceSummary(rows: AttendanceRow[]): AttendanceSummary {
  const out = {
    invited: 0,
    answered: 0,
    closed: 0,
    attended: 0,
    absent: 0,
    late: 0,
  };
  for (const r of rows) {
    if (r.withdrawn || r.status === "cancelled") continue;
    out.invited++;
    if (r.response !== "none") out.answered++;
    if (!r.closed) continue;
    out.closed++;
    if (["present", "late", "early"].includes(r.actual)) out.attended++;
    if (r.actual === "late") out.late++;
    if (r.actual === "absent") out.absent++;
  }
  return out;
}
/** Whole-number percentage, or null when there is nothing to divide by. */
export function rate(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : null;
}
