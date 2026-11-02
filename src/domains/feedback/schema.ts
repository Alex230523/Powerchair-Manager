import { z } from "zod";

/** 19: a remark on the application. */
export const feedbackKinds = ["bug", "idea", "text"] as const;
export const feedbackCommand = z.object({
  kind: z.enum(feedbackKinds),
  description: z.string().trim().min(5).max(4000),
  contact: z.boolean().default(false),
  context: z
    .object({
      page: z.string().max(300).default(""),
      locale: z.string().max(10).default(""),
      screen: z.string().max(40).default(""),
      browser: z.string().max(300).default(""),
    })
    .default({ page: "", locale: "", screen: "", browser: "" }),
  /** A PNG already masked in the browser, and seen by the person before sending. */
  screenshot: z.string().max(4300000).nullable().default(null),
});
export type FeedbackCommand = z.infer<typeof feedbackCommand>;
export const DAILY_LIMIT = 10;
/** The page without its query or anchor (a link's token never travels). */
export const pageOnly = (page: string) => page.split(/[?#]/)[0].slice(0, 200);
/** The issue's text: the remark, then its context; a name and an e-mail only if the person agreed. */
export function issueBody(f: { kind: string; description: string; context: Record<string, string>; contact: { name: string; email: string } | null; screenshot: string | null }) {
  const rows = Object.entries(f.context)
    .filter(([, v]) => v)
    .map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, "/").replace(/\s+/g, " ")} |`);
  return [
    f.description,
    "",
    "| Contexte | |",
    "|---|---|",
    ...rows,
    "",
    f.contact ? `On peut recontacter : ${f.contact.name} <${f.contact.email}>` : "Personne à ne pas recontacter (aucun nom transmis).",
    ...(f.screenshot ? ["", `![Capture (zones sensibles masquées)](${f.screenshot})`] : []),
  ].join("\n");
}
export const issueTitle = (kind: string, description: string) => `[${{ bug: "Bug", idea: "Idée", text: "Texte" }[kind] ?? kind}] ${description.replace(/\s+/g, " ").slice(0, 70)}`;
/** The issue's state as the person sees it. */
export const stateOf = (i: { closed: boolean; labels: string[] }) => (i.closed ? "fixed" : i.labels.some((l) => l === "en cours" || l === "in progress") ? "in_progress" : "received");
