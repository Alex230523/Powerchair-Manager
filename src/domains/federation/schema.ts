import { z } from "zod";

const id = z.uuid();
const season = z.string().regex(/^\d{4}-\d{2}$/);
export const clubCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("requestLicenses"),
    season,
    profileIds: z.array(id).min(1).max(200),
  }),
  z.object({ action: z.literal("cancelLicense"), id }),
  z.object({ action: z.literal("requestClassification"), profileId: id }),
]);
export type ClubCommand = z.infer<typeof clubCommand>;

export const federationCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("decideLicenses"),
    ids: z.array(id).min(1).max(200),
    decision: z.enum(["active", "refused"]),
    note: z.string().trim().max(500),
  }),
  z.object({
    action: z.literal("suspendLicense"),
    id,
    note: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal("decideClassification"),
    profileId: id,
    decision: z.enum(["validated", "refused"]),
    classification: z.enum(["PF1", "PF2"]).nullable(),
    validUntil: z.iso.date().nullable(),
    note: z.string().trim().max(500),
  }),
]);
export type FederationCommand = z.infer<typeof federationCommand>;

/** Licence numbers: season start year and a per-federation sequence ("2026-0007"). */
export function licenseNumber(season: string, sequence: number) {
  return `${season.slice(0, 4)}-${String(sequence).padStart(4, "0")}`;
}
