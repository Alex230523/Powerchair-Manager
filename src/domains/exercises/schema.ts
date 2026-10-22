import { z } from "zod";

/** Wave 16 (E2): the lists and commands of the exercise sheets (no I/O: shared with the page). */
export const objectives = ["technique", "tactics", "driving", "warmup", "game", "other"] as const;
export const levels = ["beginner", "intermediate", "advanced"] as const;
export const suitedFor = ["PF1", "PF2", "both"] as const;
const text = (n: number) => z.string().trim().max(n);
const fields = {
  title: text(120).min(2),
  objective: z.enum(objectives),
  description: text(5000),
  safety: text(2000),
  durationMinutes: z.number().int().min(1).max(180),
  playersMin: z.number().int().min(1).max(40),
  playersMax: z.number().int().min(1).max(40),
  level: z.enum(levels),
  suited: z.enum(suitedFor),
  equipment: text(1000),
  variants: text(3000),
  videoUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(500)]),
  tags: z.array(text(30).min(1)).max(10),
  shared: z.boolean(),
};
export const exerciseCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields }),
  z.object({ action: z.literal("update"), id: z.uuid(), version: z.number().int().positive(), ...fields }),
  z.object({ action: z.literal("duplicate"), id: z.uuid() }),
  z.object({ action: z.literal("archive"), id: z.uuid(), archived: z.boolean() }),
  z.object({ action: z.literal("diagram"), id: z.uuid(), mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]), data: z.string().max(2800000) }),
  z.object({ action: z.literal("removeDiagram"), id: z.uuid() }),
]);
export type ExerciseCommand = z.infer<typeof exerciseCommand>;

