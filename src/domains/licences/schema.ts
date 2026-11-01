import { z } from "zod";

/**
 * Wave 17 (O1): a coach's driving licence, declared from their own profile.
 * The club sees « Déclaré » until someone who organises the trips checks the
 * copy and marks it « Vérifié par le club ». Any change by the coach sends it
 * back to « Déclaré ».
 */
export const licenceCategories = ["B", "BE", "C1", "D1", "D"] as const;
export type LicenceCategory = (typeof licenceCategories)[number];

const id = z.uuid();
export const licenceCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    profileId: id,
    categories: z.array(z.enum(licenceCategories)).min(1).max(5),
    validUntil: z.iso.date().nullable(),
  }),
  z.object({ action: z.literal("verify"), profileId: id, verified: z.boolean() }),
  z.object({ action: z.literal("removeCopy"), profileId: id }),
  z.object({ action: z.literal("remove"), profileId: id }),
]);
export type LicenceCommand = z.infer<typeof licenceCommand>;

export const proofMaxBytes = 5 * 1024 * 1024;
/** A copy or a certificate: a PDF or a photo, checked on its first bytes. */
export function proofType(b: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-") return "application/pdf";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}
export const safeName = (name: string, fallback: string) => name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200) || fallback;

/** The coach hears about the expiry once, 30 days ahead (or at once when it is closer). */
export function reminderDue(validUntil: string | null, today: string, remindedOn: string | null) {
  if (!validUntil || validUntil < today) return false;
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 30);
  if (validUntil > d.toISOString().slice(0, 10)) return false;
  return !remindedOn;
}

export type TrainingState = { status: "trained"; title: string; on: string | null } | { status: "pending"; title: string } | { status: "none" };
/** « Formé » with an approved course still valid, else « En attente » with an open request, else « Non formé ». */
export function trainingState(rows: { status: string; title: string; completed_on: string | null; decided_on: string | null; valid_until: string | null }[], today: string): TrainingState {
  const done = rows
    .filter((r) => r.status === "approved" && (!r.valid_until || r.valid_until >= today))
    .sort((a, b) => (b.completed_on ?? b.decided_on ?? "").localeCompare(a.completed_on ?? a.decided_on ?? ""))[0];
  if (done) return { status: "trained", title: done.title, on: done.completed_on ?? done.decided_on };
  const open = rows.find((r) => r.status === "requested");
  return open ? { status: "pending", title: open.title } : { status: "none" };
}
