import { z } from "zod";
export const categories = [
  "identity",
  "registration",
  "licence",
  "insurance",
  "fitness",
  "consent",
  "training",
  "contract",
  "accounting",
] as const;
/**
 * 1: categories no longer offered for a new document (fewer personal data):
 * the documents already there stay readable, marked « catégorie retirée ».
 */
export const retiredCategories: readonly (typeof categories)[number][] = ["identity"];
export const offeredCategories = categories.filter((c) => !retiredCategories.includes(c)) as [(typeof categories)[number], ...(typeof categories)[number][]];
export const statuses = [
  "missing",
  "requested",
  "uploaded",
  "review",
  "valid",
  "refused",
  "expired",
  "archived",
] as const;
/** 10: who sees a free folder. */
export const folderVisibilities = ["presidency", "staff", "members"] as const;
const id = z.uuid(),
  name = z.string().trim().min(2).max(120);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    profileId: id.optional(),
    seasonId: id,
    name,
    category: z.enum(offeredCategories),
    sensitive: z.boolean(),
    /** 10: dropped in a free folder. */
    folderId: id.optional(),
  }),
  z.object({
    action: z.literal("rule"),
    id: id.optional(),
    expectedVersion: z.number().int().positive().optional(),
    seasonId: id,
    name,
    category: z.enum(offeredCategories),
    sensitive: z.boolean(),
    role: z.enum(["any", "player", "coach", "assistant", "volunteer"]),
    minAge: z.number().int().min(0).max(120),
    maxAge: z.number().int().min(0).max(120),
    active: z.boolean(),
  }),
  z.object({ action: z.literal("plan"), seasonId: id }),
  z.object({
    action: z.literal("review"),
    id,
    expectedVersion: z.number().int().positive(),
    status: z.enum(["review", "valid", "refused", "requested", "archived"]),
    message: z.string().trim().max(2000),
    expiresOn: z.iso.date().nullable(),
  }),
  z.object({
    action: z.literal("share"),
    id,
    federationId: id,
    expiresOn: z.iso.date(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({ action: z.literal("revoke"), id }),
  // 10: free folders (a view, never a right) and moving a document.
  z.object({ action: z.literal("folderSave"), id: id.optional(), parentId: id.nullable().default(null), name: z.string().trim().min(1).max(80), visibility: z.enum(folderVisibilities) }),
  z.object({ action: z.literal("folderDelete"), id }),
  z.object({ action: z.literal("move"), id, folderId: id.nullable() }),
  /** 1: the president deletes the documents of a retired category (« Identité administrative »). */
  z.object({ action: z.literal("purgeRetired") }),
  z.object({
    action: z.literal("template"),
    name,
    locale: z.enum(["fr", "nl", "en"]),
    body: z.string().trim().min(5).max(10000),
    expectedVersion: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("generate"),
    id,
    templateId: id,
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("import"),
    id,
    attachmentId: id,
    expectedVersion: z.number().int().positive(),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function templateText(body: string, values: Record<string, string>) {
  const valid = ["name", "organization", "season", "date"];
  if (
    [...body.matchAll(/\{([^{}]+)\}/g)].some((m) => !valid.includes(m[1])) ||
    /[{}]/.test(body.replace(/\{[^{}]+\}/g, ""))
  )
    throw new Error("INVALID_TEMPLATE");
  return body.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}
export function validFile(type: string, b: Buffer) {
  return (
    b.length > 0 &&
    b.length <= 2097152 &&
    ((type === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-") ||
      (type === "image/png" &&
        b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
      (type === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255))
  );
}
