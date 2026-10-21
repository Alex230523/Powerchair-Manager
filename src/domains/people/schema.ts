import { z } from "zod";
const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
export const date = z.iso.date();
const email = z.union([z.email().max(254), z.literal("")]);
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
