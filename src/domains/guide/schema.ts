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
export const figures = ["pitch", "two-v-one", "three-in-area", "chair-profile", "chair-top"] as const;
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
const slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
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
  | { type: "figure"; figure: Figure };

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
    if (fig) {
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
