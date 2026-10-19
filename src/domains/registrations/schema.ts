import { z } from "zod";
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
    "choice",
    "file",
    "consent",
    "signature",
  ]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  condition: z
    .object({ key: z.string(), equals: z.string().max(100) })
    .optional(),
});
export const fieldsSchema = z
  .array(fieldSchema)
  .max(20)
  .superRefine((fields, c) => {
    const keys = new Set<string>();
    for (const f of fields) {
      if (
        keys.has(f.key) ||
        (f.condition && !keys.has(f.condition.key)) ||
        (f.type === "choice" && f.options.length < 2)
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
  answers: z.record(z.string(), z.union([z.string().max(5000), z.boolean()])),
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
export function fieldVisible(
  field: Field,
  answers: Record<string, string | boolean>,
) {
  return (
    !field.condition || answers[field.condition.key] === field.condition.equals
  );
}
export function validateAnswers(
  fields: Field[],
  answers: Record<string, string | boolean>,
  fileKeys: string[] = [],
) {
  const output: Record<string, string | boolean> = {};
  for (const field of fields) {
    if (!fieldVisible(field, answers)) continue;
    const value = answers[field.key];
    if (field.type === "file") {
      if (field.required && !fileKeys.includes(field.key))
        throw new Error("MISSING_FIELDS");
      continue;
    }
    const empty =
      value === undefined ||
      value === "" ||
      (field.type === "consent" && value !== true);
    if (empty) {
      if (field.required) throw new Error("MISSING_FIELDS");
      continue;
    }
    if (field.type === "consent") {
      if (typeof value !== "boolean") throw new Error("INVALID_INPUT");
    } else {
      if (typeof value !== "string") throw new Error("INVALID_INPUT");
      if (field.type === "choice" && !field.options.includes(value))
        throw new Error("INVALID_INPUT");
      if (field.type === "date") z.iso.date().parse(value);
      if (field.type === "phone" && !/^[+\d ()/.-]{5,35}$/.test(value))
        throw new Error("INVALID_INPUT");
      if (field.type === "signature" && value.trim().length < 2)
        throw new Error("INVALID_INPUT");
    }
    output[field.key] = value!;
  }
  return output;
}
