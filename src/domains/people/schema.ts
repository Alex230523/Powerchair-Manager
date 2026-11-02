import { z } from "zod";
const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
export const date = z.iso.date();
const email = z.union([z.email().max(254), z.literal("")]);
/** 8: the relation a representative has with the player. */
export const representativeRelations = ["mother", "father", "guardian", "administrator", "carer", "other"] as const;
export const representativeSchema = z.object({
  /** A person the club already knows (a sibling's parent), or a new one. */
  existingId: z.uuid().optional(),
  fullName: z.string().trim().max(120).optional(),
  relation: z.enum(representativeRelations),
  email: z.union([z.literal(""), z.email().max(254)]).optional(),
  phone: z.string().trim().max(40).optional(),
  locale: z.enum(["fr", "nl", "en"]).optional(),
  /** Legal representative (the child's whole file) or delegated carer (seeing, not deciding). */
  rights: z.enum(["legal", "aid"]),
});
const profileFields = {
  fullName: text(120).min(2),
  birthDate: date.nullable(),
  email,
  phone: text(40),
  joinedOn: date,
};
export const rosterRoles = [
  "player",
  "coach",
  "assistant",
  "volunteer",
] as const;
export const statuses = [
  "active",
  "inactive",
  "archived",
  "transferred",
] as const;
/** Maximum number of players accepted in one spreadsheet import. */
export const importLimit = 300;
export const importRow = z.object({
  fullName: text(120).min(2),
  birthDate: date.nullable(),
  email,
  phone: text(40),
  joinedOn: date.nullable(),
  position: text(80),
  jerseyNumber: z.number().int().min(0).max(99).nullable(),
  /** Team name of the line, matched with the club's active teams. */
  team: text(100).optional(),
  /** Parent or representative to record next to a player. */
  guardianName: text(120).optional(),
  guardianEmail: email.optional(),
  guardianPhone: text(40).optional(),
});
export type ImportRow = z.infer<typeof importRow>;
/** Wave 17 (J1): why someone left the club. */
export const departureStatuses = ["stopped", "moved", "unknown", "deceased"] as const;
export type DepartureStatus = (typeof departureStatuses)[number];
export const peopleCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("directoryRole"),
    id,
    role: z.enum(["player", "coach"]),
  }),
  z.object({
    action: z.literal("directoryArchive"),
    id,
    role: z.enum(["player", "coach"]),
    archived: z.boolean(),
    /** Wave 17 (J1): why the person leaves (not « deceased »: see « departure »). */
    departureStatus: z.enum(["stopped", "moved", "unknown"]).optional(),
    departureNote: text(500).optional(),
  }),
  /**
   * Wave 17 (J1): the reason of a departure, changed later. « Décédé » is set
   * or lifted by the club president only, with an explicit confirmation.
   */
  z.object({
    action: z.literal("departure"),
    id,
    status: z.enum(departureStatuses),
    note: text(500).default(""),
    confirm: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("gameInfo"),
    id,
    version: z.number().int().positive(),
    position: text(80),
    jerseyNumber: z.number().int().min(0).max(99).nullable(),
  }),
  z.object({
    action: z.literal("updateSeason"),
    id,
    name: text(80).min(2),
    startsOn: date,
    endsOn: date,
  }),
  z.object({
    action: z.literal("updateTeam"),
    id,
    name: text(100).min(2),
    category: text(80),
    level: text(80),
    homeLocation: text(160),
  }),
  z.object({
    action: z.literal("createPerson"),
    ...profileFields,
    accountUserId: text(200).optional(),
    directoryRoles: z
      .array(z.enum(["player", "coach"]))
      .max(2)
      .optional(),
    /** Wave 16 (I2): « Envoyer une invitation par email »; for a minor it goes to the parent. */
    invite: z.boolean().optional(),
    guardianName: text(120).optional(),
    guardianEmail: email.optional(),
    /**
     * 8: the player's representatives, one or two, given with the player:
     * required for a minor, asked for an adult who has one (an administrator,
     * a carer), never imposed on an autonomous adult.
     */
    hasRepresentative: z.boolean().optional(),
    representatives: z.array(representativeSchema).max(2).optional(),
    /** « Inviter maintenant » (checked by default): an email to each representative who has one. */
    inviteRepresentatives: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("updatePerson"),
    id,
    version: z.number().int().positive(),
    ...profileFields,
  }),
  z.object({
    action: z.literal("contacts"),
    id,
    version: z.number().int().positive(),
    email,
    phone: text(40),
  }),
  z.object({ action: z.literal("linkAccount"), id, userId: text(200).min(1) }),
  z.object({
    action: z.literal("status"),
    id,
    status: z.enum(["active", "inactive", "archived"]),
  }),
  z.object({
    action: z.literal("season"),
    name: text(80).min(2),
    startsOn: date,
    endsOn: date,
  }),
  z.object({ action: z.literal("seasonArchive"), id, archived: z.boolean() }),
  z.object({
    action: z.literal("team"),
    seasonId: id,
    name: text(100).min(2),
    category: text(80),
    level: text(80),
    homeLocation: text(160),
  }),
  z.object({ action: z.literal("teamArchive"), id, archived: z.boolean() }),
  z.object({
    action: z.literal("assign"),
    teamId: id,
    profileId: id,
    role: z.enum(rosterRoles),
    position: text(80),
    startsOn: date,
    endsOn: date.nullable(),
  }),
  z.object({ action: z.literal("endAssignment"), id, endsOn: date }),
  z.object({
    // A president (or any staff member) who also coaches: one profile, no duplicate.
    action: z.literal("selfCoach"),
    teamId: id.nullable(),
  }),
  z.object({
    action: z.literal("importPlayers"),
    teamId: id.nullable(),
    role: z.enum(["player", "coach"]).optional(),
    rows: z.array(importRow).min(1).max(importLimit),
    /** Wave 16 (I2): one invitation per line with an address (the parent's for a minor). */
    invite: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("coachScope"),
    mandateId: id,
    teamId: id.nullable(),
  }),
  z.object({
    action: z.literal("guardian"),
    guardianId: id,
    subjectId: id,
    kind: z.enum(["declared", "legal_verified", "delegated_aid"]),
    canView: z.boolean(),
    canEdit: z.boolean(),
    startsOn: date,
    endsOn: date.nullable(),
    authorizationNote: text(300),
  }),
  z.object({ action: z.literal("revokeGuardian"), id }),
  z.object({
    action: z.literal("transfer"),
    id,
    authorizationNote: text(300).min(5),
  }),
  z.object({ action: z.literal("cancelTransfer"), id }),
  z.object({
    action: z.literal("acceptTransfer"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);
export type PeopleCommand = z.infer<typeof peopleCommand>;
export function ageOn(birth: string, day: string) {
  const b = new Date(birth + "T00:00:00Z"),
    d = new Date(day + "T00:00:00Z");
  return (
    d.getUTCFullYear() -
    b.getUTCFullYear() -
    Number(
      d.getUTCMonth() < b.getUTCMonth() ||
        (d.getUTCMonth() === b.getUTCMonth() &&
          d.getUTCDate() < b.getUTCDate()),
    )
  );
}
export function orderedDates(start: string, end: string | null) {
  return !end || end >= start;
}
