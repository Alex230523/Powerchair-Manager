import { z } from "zod";
/**
 * Profile data a question can feed when the club accepts the application.
 * Mapped answers fill empty profile fields only; nothing already known is overwritten.
 */
export const mappings = [
  "phone",
  "email",
  "emergency",
  "condition",
  "control",
  "jersey_size",
  "jersey_number",
  "installments",
] as const;
export type Mapping = (typeof mappings)[number];
/** Number of payments chosen in an answer such as "2 fois" or "4x". */
export function installmentsFrom(value: unknown) {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}
/** Chair control recorded on the sport profile, from the joystick answer(s). */
export function controlFrom(values: string[]) {
  const v = (values[0] ?? "").toLowerCase();
  if (!v) return "";
  if (/droit|recht|right/.test(v)) return "right_hand";
  if (/gauche|link|left/.test(v)) return "left_hand";
  if (/menton|kin|chin/.test(v)) return "chin";
  if (/t[êe]te|hoofd|head/.test(v)) return "head";
  return "other";
}
/** Splits answers into the clear part and the confidential part (to be encrypted). */
export function splitConfidential(fields: Field[], answers: Answers) {
  const secret = new Set(
    fields.filter((f) => f.confidential).map((f) => f.key),
  );
  const clear: Answers = {},
    hidden: Answers = {};
  for (const [k, v] of Object.entries(answers))
    (secret.has(k) ? hidden : clear)[k] = v;
  return { clear, hidden };
}
export const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.object({
    en: z.string().trim().max(160).optional(),
    fr: z.string().trim().min(2).max(160),
    nl: z.string().trim().min(2).max(160),
  }),
  type: z.enum([
    "text",
    "date",
    "phone",
    "email",
    "choice",
    "multi",
    "file",
    "consent",
    "signature",
    /** A section title: groups the questions that follow, never answered (04/11/2026). */
    "section",
  ]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  /** Multiple choice: maximum number of ticked options (none = all). */
  max: z.number().int().min(1).max(20).optional(),
  /** Short explanation shown under the question. */
  help: z
    .object({
      fr: z.string().trim().max(500),
      nl: z.string().trim().max(500),
      en: z.string().trim().max(500).optional(),
    })
    .optional(),
  /** Encrypted at rest, shown only to the applicant and to staff holding people.sensitive. */
  confidential: z.boolean().default(false),
  /** Where the answer goes when the application is accepted. */
  maps: z.enum(mappings).optional(),
  condition: z
    .object({ key: z.string(), equals: z.string().max(100) })
    .optional(),
});
export type Answer = string | boolean | string[];
export type Answers = Record<string, Answer>;
export const fieldsSchema = z
  .array(fieldSchema)
  .max(20)
  .superRefine((fields, c) => {
    const keys = new Set<string>();
    for (const f of fields) {
      if (
        keys.has(f.key) ||
        (f.condition && !keys.has(f.condition.key)) ||
        ((f.type === "choice" || f.type === "multi") && f.options.length < 2)
      )
        c.addIssue({
          code: "custom",
          message: "Invalid field order, duplicate or options",
        });
      keys.add(f.key);
    }
  });
export type Field = z.infer<typeof fieldSchema>;
export const applicationSchema = z.object({
  formId: z.uuid(),
  subjectKind: z.enum(["self", "represented"]).default("represented"),
  subjectName: z.string().trim().min(2).max(120),
  birthDate: z.iso.date(),
  locale: z.enum(["fr", "nl", "en"]),
  answers: z.record(
    z.string(),
    z.union([
      z.string().max(5000),
      z.boolean(),
      z.array(z.string().max(100)).max(20),
    ]),
  ),
  priorId: z.uuid().optional(),
});
export const statuses = [
  "draft",
  "submitted",
  "incomplete",
  "review",
  "accepted",
  "waiting",
  "refused",
  "withdrawn",
] as const;
export type Status = (typeof statuses)[number];
export function fieldVisible(field: Field, answers: Answers) {
  if (!field.condition) return true;
  const value = answers[field.condition.key];
  return Array.isArray(value)
    ? value.includes(field.condition.equals)
    : value === field.condition.equals;
}
export function validateAnswers(
  fields: Field[],
  answers: Answers,
  fileKeys: string[] = [],
) {
  const output: Answers = {};
  for (const field of fields) {
    if (!fieldVisible(field, answers)) continue;
    if (field.type === "section") continue;
    const value = answers[field.key];
    if (field.type === "file") {
      if (field.required && !fileKeys.includes(field.key))
        throw new Error("MISSING_FIELDS");
      continue;
    }
    const empty =
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (field.type === "consent" && value !== true);
    if (empty) {
      if (field.required) throw new Error("MISSING_FIELDS");
      continue;
    }
    if (field.type === "consent") {
      if (typeof value !== "boolean") throw new Error("INVALID_INPUT");
    } else if (field.type === "multi") {
      if (
        !Array.isArray(value) ||
        new Set(value).size !== value.length ||
        value.some((v) => !field.options.includes(v)) ||
        (field.max !== undefined && value.length > field.max)
      )
        throw new Error("INVALID_INPUT");
    } else {
      if (typeof value !== "string") throw new Error("INVALID_INPUT");
      if (field.type === "choice" && !field.options.includes(value))
        throw new Error("INVALID_INPUT");
      if (field.type === "date") z.iso.date().parse(value);
      if (field.type === "phone" && !/^[+\d ()/.-]{5,35}$/.test(value))
        throw new Error("INVALID_INPUT");
      if (
        field.type === "email" &&
        (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      )
        throw new Error("INVALID_INPUT");
      if (field.type === "signature" && value.trim().length < 2)
        throw new Error("INVALID_INPUT");
    }
    output[field.key] = value!;
  }
  return output;
}
