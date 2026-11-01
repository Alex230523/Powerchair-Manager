/**
 * B9: the event's questions, typed one per line by the club: « ? » at the
 * end for a yes or no answer, « * » for a required one. Pure, shared by the
 * page and the tests.
 */
export type Question = { id: string; label: string; kind: "text" | "yesno"; required: boolean };
export function parseQuestions(text: string): Question[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 2)
    .slice(0, 20)
    .map((l, i) => {
      const required = l.includes("*");
      const label = l.replace(/\*/g, "").trim().slice(0, 200);
      return { id: `q${i + 1}`, label, kind: label.endsWith("?") ? "yesno" : "text", required };
    });
}
export const unparseQuestions = (qs: Question[]) => qs.map((q) => q.label + (q.required ? " *" : "")).join("\n");
