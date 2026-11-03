import { z } from "zod";
import { drawing } from "./drawing";

/** Wave 16 (E2): the lists and commands of the exercise sheets (no I/O: shared with the page). */
/** 4: the fixed list is now shown as the « Type »; the column keeps its name. */
export const objectives = ["technique", "tactics", "driving", "warmup", "game", "other"] as const;
export const levels = ["beginner", "intermediate", "advanced"] as const;
export const suitedFor = ["PF1", "PF2", "both"] as const;
/** 4: an exercise or a tactic, same form, same editor. */
export const genres = ["exercise", "tactic"] as const;
/** 4: a tag's colour is one of the chart variables. */
export const tagColors = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
const text = (n: number) => z.string().trim().max(n);
export const tagName = text(30).min(1);
export const sheetFields = {
  title: text(120).min(2),
  genre: z.enum(genres).default("exercise"),
  objective: z.enum(objectives),
  goal: text(500).default(""),
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
  /** The tags by name: an unknown name creates the club's tag. */
  tags: z.array(tagName).max(10),
};
const fields = { ...sheetFields, shared: z.boolean() };
const diagramTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export const exerciseCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...fields }),
  z.object({ action: z.literal("update"), id: z.uuid(), version: z.number().int().positive(), ...fields }),
  z.object({ action: z.literal("duplicate"), id: z.uuid() }),
  z.object({ action: z.literal("archive"), id: z.uuid(), archived: z.boolean() }),
  z.object({ action: z.literal("diagram"), id: z.uuid(), mediaType: z.enum(diagramTypes), data: z.string().max(2800000) }),
  z.object({ action: z.literal("removeDiagram"), id: z.uuid() }),
  // 4: the drawn pitch; null removes it.
  z.object({ action: z.literal("drawing"), id: z.uuid(), drawing: drawing.nullable() }),
  // 4: the club's tags, managed in Réglages › Activités.
  z.object({ action: z.literal("tagRename"), tagId: z.uuid(), name: tagName }),
  z.object({ action: z.literal("tagColor"), tagId: z.uuid(), color: z.enum(tagColors) }),
  z.object({ action: z.literal("tagMerge"), tagId: z.uuid(), into: z.uuid() }),
  z.object({ action: z.literal("tagDelete"), tagId: z.uuid() }),
  // 4: the tactics of a match.
  z.object({ action: z.literal("tacticAdd"), matchId: z.uuid(), exerciseId: z.uuid(), notes: text(1000).default("") }),
  z.object({ action: z.literal("tacticRemove"), matchId: z.uuid(), exerciseId: z.uuid() }),
  // 4: « Proposer à la bibliothèque fédérale », and taking the proposal back.
  z.object({ action: z.literal("propose"), id: z.uuid() }),
  z.object({ action: z.literal("unpropose"), id: z.uuid() }),
]);
export type ExerciseCommand = z.infer<typeof exerciseCommand>;

/** 4: the federal library, for the clubs (copy) and the federation (decide, publish, withdraw). */
export const libraryCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("copy"), id: z.uuid() }),
  z.object({ action: z.literal("decide"), exerciseId: z.uuid(), approve: z.boolean(), reason: text(1000).default("") }),
  z.object({ action: z.literal("publish"), ...sheetFields, drawing: drawing.nullable().default(null) }),
  z.object({ action: z.literal("withdraw"), id: z.uuid() }),
]);
export type LibraryCommand = z.infer<typeof libraryCommand>;
