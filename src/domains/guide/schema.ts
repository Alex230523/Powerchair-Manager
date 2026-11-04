import { z } from "zod";

/**
 * Guide du powerchair football. A chapter's text is written in a small,
 * safe markup (never HTML) and read as blocks: « ## » a heading, « - » a
 * list line, « | a | b | » a table row, « > » a note, « [[figure:pitch]] »
 * one of the drawn figures, a blank line between paragraphs. Pure parts
 * shared by the service, the pages and the tests.
 */
export const guideAudiences = ["player", "guardian", "coach", "staff", "referee", "president", "federation"] as const;
export type GuideAudience = (typeof guideAudiences)[number];
/** The drawn figures a text may place (each has its own text alternative). */
export const figures = ["pitch", "two-v-one", "three-in-area", "chair-profile", "chair-top", "pyramid"] as const;
export type Figure = (typeof figures)[number];

const one = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(300).default(""),
  body: z.string().max(20000).default(""),
});
/** A chapter's text in the three languages; French is required, the others fall back to it. */
export const chapterContent = z.object({ fr: one, nl: one.partial().default({}), en: one.partial().default({}) });
export type ChapterContent = z.infer<typeof chapterContent>;

const id = z.uuid();
/** Addresses taken by the guide's own pages. */
export const reservedSlugs = ["lexicon", "chairs", "gallery", "help", "public"];
const slug = z
  .string()
  .regex(/^[a-z0-9-]{2,40}$/)
  .refine((x) => !reservedSlugs.includes(x), "RESERVED");
export const guideCommand = z.discriminatedUnion("action", [
  /** The federation: the proposed drafts added as its own drafts (to read, change, then publish). */
  z.object({ action: z.literal("adopt") }),
  z.object({
    action: z.literal("save"),
    id: id.optional(),
    slug,
    audiences: z.array(z.enum(guideAudiences)).min(1).max(7),
    content: chapterContent,
    sources: z.string().trim().max(2000).default(""),
  }),
  z.object({ action: z.literal("publish"), id }),
  z.object({ action: z.literal("unpublish"), id }),
  z.object({ action: z.literal("public"), id, public: z.boolean() }),
  /** A club: its note « Chez nous » under a chapter (empty removes it). */
  z.object({ action: z.literal("note"), id, body: z.string().trim().max(1000) }),
  /** The reader: the chapter read (a welcome journey's « À lire » ticks with it). */
  z.object({ action: z.literal("read"), id }),
]);
export type GuideCommand = z.infer<typeof guideCommand>;

export type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "note"; text: string }
  | { type: "figure"; figure: Figure }
  /** A photo or diagram of the federation's gallery (G5), with its own text alternative. */
  | { type: "image"; id: string };

/** The text read as blocks; an unknown figure is left out, nothing is ever read as HTML. */
export function parseBody(body: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "paragraph", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = out.at(-1);
    if (!line) {
      flush();
      continue;
    }
    const fig = /^\[\[figure:([a-z-]+)\]\]$/.exec(line);
    const img = /^\[\[image:([0-9a-f-]{36})\]\]$/i.exec(line);
    if (img) {
      flush();
      out.push({ type: "image", id: img[1].toLowerCase() });
    } else if (fig) {
      flush();
      if ((figures as readonly string[]).includes(fig[1])) out.push({ type: "figure", figure: fig[1] as Figure });
    } else if (line.startsWith("## ")) {
      flush();
      out.push({ type: "heading", text: line.slice(3).trim() });
    } else if (/^[-*] /.test(line)) {
      flush();
      if (last?.type === "list" && !para.length) last.items.push(line.slice(2).trim());
      else out.push({ type: "list", items: [line.slice(2).trim()] });
    } else if (line.startsWith("|") && line.endsWith("|")) {
      flush();
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (last?.type === "table") last.rows.push(cells);
      else out.push({ type: "table", rows: [cells] });
    } else if (line.startsWith("> ")) {
      flush();
      if (last?.type === "note") last.text += " " + line.slice(2).trim();
      else out.push({ type: "note", text: line.slice(2).trim() });
    } else para.push(line);
  }
  flush();
  return out;
}

/** The text in the reader's language, French where a language is missing. */
export function inLocale(content: ChapterContent, locale: "fr" | "nl" | "en") {
  const own = locale === "fr" ? content.fr : content[locale];
  return {
    title: own?.title || content.fr.title,
    summary: own?.summary || content.fr.summary,
    body: own?.body || content.fr.body,
    fallback: locale !== "fr" && !own?.body,
  };
}

/** The audiences a reader belongs to, from his role in the organization he is in. */
export function readerAudiences(role: string, kind: string): GuideAudience[] {
  if (kind === "federation") return role === "referee" ? ["referee"] : ["federation"];
  const map: Record<string, GuideAudience[]> = {
    club_president: ["president", "staff", "coach"],
    coach: ["coach", "staff"],
    player: ["player"],
    guardian: ["guardian"],
  };
  return map[role] ?? ["staff"];
}

/* ---------- Knowledge centre: lexicon, gallery, quiz, catalogue ---------- */
export const text3 = z.object({ fr: z.string().trim().min(1).max(300), nl: z.string().trim().max(300).default(""), en: z.string().trim().max(300).default("") });
export type Text3 = { fr: string; nl?: string; en?: string };
/** A text in the reader's language, French where it is missing. */
export const t3 = (x: Text3 | null | undefined, locale: "fr" | "nl" | "en") => (x ? (locale === "fr" ? x.fr : x[locale] || x.fr) : "");

export const quizQuestion = z.object({
  question: text3,
  choices: z.array(text3).min(2).max(4),
  answer: z.number().int().min(0).max(3),
  explanation: text3,
});
export const quizSchema = z.array(quizQuestion).length(5).refine((qs) => qs.every((q) => q.answer < q.choices.length), "ANSWER_OUT_OF_RANGE");
export type Quiz = z.infer<typeof quizSchema>;
/** Four right answers out of five pass; nothing is shown to anyone else. */
export const quizPassed = (quiz: { answer: number }[], answers: number[]) => quiz.filter((q, i) => answers[i] === q.answer).length >= 4;

export const imageCategories = ["court", "goals", "ball", "guard", "speed", "chair", "other"] as const;
const mediaType = z.enum(["image/png", "image/jpeg", "image/webp"]);
const alt = text3.refine((x) => x.fr.length >= 5, "ALT_REQUIRED");
const money = z.number().int().min(0).max(10000000);
export const knowledgeCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("adoptTerms") }),
  z.object({ action: z.literal("saveTerm"), id: z.uuid().optional(), term: text3, definition: text3 }),
  z.object({ action: z.literal("deleteTerm"), id: z.uuid() }),
  z.object({ action: z.literal("saveQuiz"), chapterId: z.uuid(), questions: quizSchema }),
  /** The reader's answers, checked on the server; a pass ticks the journey's step. */
  z.object({ action: z.literal("answerQuiz"), chapterId: z.uuid(), answers: z.array(z.number().int().min(0).max(3)).length(5) }),
  z.object({
    action: z.literal("addImage"),
    category: z.enum(imageCategories),
    conform: z.enum(["yes", "no"]).nullable().default(null),
    alt,
    caption: text3.partial().default({}),
    peopleVisible: z.boolean(),
    imageRights: z.boolean(),
    mediaType,
    data: z.string().max(2800000),
  }),
  z.object({ action: z.literal("deleteImage"), id: z.uuid() }),
  z.object({
    action: z.literal("saveSheet"),
    modelId: z.uuid(),
    manufacturer: z.string().trim().max(120).default(""),
    priceCents: money.nullable().default(null),
    priceOn: z.iso.date().nullable().default(null),
    speedKmh: z.number().min(0).max(30).nullable().default(null),
    weightKg: z.number().min(0).max(500).nullable().default(null),
    protections: text3.partial().default({}),
    strengths: text3.partial().default({}),
    limits: text3.partial().default({}),
    suppliers: z.array(z.uuid()).max(10).default([]),
  }),
  z.object({ action: z.literal("addPhoto"), modelId: z.uuid(), alt, mediaType, data: z.string().max(2800000) }),
  z.object({ action: z.literal("deletePhoto"), id: z.uuid() }),
]);
export type KnowledgeCommand = z.infer<typeof knowledgeCommand>;

/** G12: the first occurrence of each term in a text, longest terms first, whole words only. */
export function findTerms(text: string, terms: { id: string; term: string }[], seen: Set<string> = new Set()) {
  const parts: ({ text: string } | { text: string; id: string })[] = [];
  const sorted = [...terms].filter((t) => t.term.trim().length > 1 && !seen.has(t.id)).sort((a, b) => b.term.length - a.term.length);
  let rest = text;
  for (;;) {
    let best: { at: number; len: number; id: string } | null = null;
    for (const t of sorted) {
      if (seen.has(t.id)) continue;
      const escaped = t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, "iu").exec(rest);
      if (m && (!best || m.index + m[1].length < best.at)) best = { at: m.index + m[1].length, len: m[2].length, id: t.id };
    }
    if (!best) break;
    if (best.at) parts.push({ text: rest.slice(0, best.at) });
    parts.push({ text: rest.slice(best.at, best.at + best.len), id: best.id });
    seen.add(best.id);
    rest = rest.slice(best.at + best.len);
  }
  if (rest) parts.push({ text: rest });
  return parts;
}
