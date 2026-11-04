import { describe, expect, it } from "vitest";
import { feedbackCommand, issueBody, issueTitle, pageOnly, stateOf } from "../src/domains/feedback/schema";
import { githubConfig } from "../src/domains/feedback/github";
import { workshopCommand } from "../src/domains/equipment/workshop";
import { feedbackCopy } from "../src/components/feedback-copy";
import { workshopCopy } from "../src/components/workshop-copy";
import { readFileSync } from "node:fs";

/** 19: the pure parts of the two reports. */
describe("reports", () => {
  it("keeps the page without its query, and no name unless agreed", () => {
    expect(pageOnly("/fr/join?token=secret#x")).toBe("/fr/join");
    const body = issueBody({ kind: "bug", description: "Rien ne bouge", context: { page: "/fr", role: "coach", browser: "A|B" }, contact: null, screenshot: null });
    expect(body).toContain("| browser | A/B |");
    expect(body).toContain("aucun nom transmis");
    expect(issueBody({ kind: "bug", description: "x", context: {}, contact: { name: "Léa", email: "lea@example.test" }, screenshot: "https://app/x" })).toContain("Léa <lea@example.test>");
    expect(issueTitle("idea", "Une   idée\nsur deux lignes")).toBe("[Idée] Une idée sur deux lignes");
  });
  it("reads an issue's state", () => {
    expect(stateOf({ closed: true, labels: [] })).toBe("fixed");
    expect(stateOf({ closed: false, labels: ["signalement", "en cours"] })).toBe("in_progress");
    expect(stateOf({ closed: false, labels: ["signalement"] })).toBe("received");
  });
  it("sends nothing without a token and a repository", () => {
    const keep = { ...process.env };
    delete process.env.PFM_FEEDBACK_GITHUB_TOKEN;
    expect(githubConfig()).toBeNull();
    process.env.PFM_FEEDBACK_GITHUB_TOKEN = "t";
    process.env.PFM_FEEDBACK_GITHUB_REPO = "not a repo";
    expect(githubConfig()).toBeNull();
    process.env = keep;
  });
  it("keeps the token on the server: no client file reads it", () => {
    for (const f of ["src/components/feedback.tsx", "src/lib/capture.ts", "src/components/app-shell.tsx"]) expect(readFileSync(f, "utf8")).not.toMatch(/PFM_FEEDBACK_GITHUB|domains\/feedback\/github/);
  });
  it("validates the commands", () => {
    expect(feedbackCommand.safeParse({ kind: "bug", description: "abc" }).success).toBe(false);
    expect(feedbackCommand.safeParse({ kind: "bug", description: "Un vrai souci" }).success).toBe(true);
    const id = "6f1c2f9e-1f6b-4a43-9b8f-3b8f2b8b8b8b";
    expect(workshopCommand.parse({ action: "report", chairId: id, description: "Batterie" })).toMatchObject({ category: "other", severity: "unusable" });
    expect(workshopCommand.safeParse({ action: "report", chairId: id, description: "Batterie", severity: "broken" }).success).toBe(false);
  });
  it("has the same words in the three languages", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(feedbackCopy.nl)).toEqual(keys(feedbackCopy.fr));
    expect(keys(feedbackCopy.en)).toEqual(keys(feedbackCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) expect(Object.keys(workshopCopy[l].categories)).toHaveLength(7);
  });
});
