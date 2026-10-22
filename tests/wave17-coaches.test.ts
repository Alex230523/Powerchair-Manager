import { describe, it, expect } from "vitest";
import { dueBefore, groupTasks, suggestedTemplates, taskCommand, taskKinds } from "../src/domains/tasks/schema";
import { licenceCommand, proofType, reminderDue, trainingState } from "../src/domains/licences/schema";
import { tutorialAudience, tutorialCommand } from "../src/domains/tutorial/schema";
import { tasksCopy } from "../src/components/tasks-copy";
import { coachSpaceCopy } from "../src/components/coach-space-copy";
import { tutorialCopy } from "../src/components/tutorial-copy";
import { originHref } from "../src/domains/storage/service";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}
const id = "00000000-0000-4000-8000-000000000001";

/** Wave 17 (O1): tasks by type, the coach's licence and courses, the first-connection tour. */
describe("wave 17, O1: tasks", () => {
  // A1: the groups are now the categories of the central to-do, every one shown (empty ones too).
  it("never mixes categories and sorts each group by due date, undated last", () => {
    const groups = groupTasks([
      { category: "sport", due_on: null, title: "Salle" },
      { category: "events", due_on: "2026-11-10", title: "Camionnette" },
      { category: "sport", due_on: "2026-11-02", title: "Fiches" },
      { category: "events", due_on: "2026-11-01", title: "Conducteur" },
      { category: "other", due_on: "2026-10-30", title: "Divers" },
    ]).filter((g) => g.tasks.length);
    expect(groups.map((g) => g.category)).toEqual(["sport", "events", "other"]);
    expect(groups[1].tasks.map((t) => t.title)).toEqual(["Conducteur", "Camionnette"]);
    expect(groups[0].tasks.map((t) => t.title)).toEqual(["Fiches", "Salle"]);
    expect(taskKinds).toEqual(["transport", "training", "documents", "sponsor", "grant", "obligation", "equipment", "other"]);
  });
  it("dates a template's tasks so many days before the date", () => {
    expect(dueBefore("2026-11-14", 14)).toBe("2026-10-31");
    expect(dueBefore("2026-03-01", 1)).toBe("2026-02-28");
  });
  it("leaves sponsors' and grants' tasks to their files", () => {
    expect(taskCommand.safeParse({ action: "create", kind: "sponsor", title: "Logo" }).success).toBe(false);
    expect(taskCommand.safeParse({ action: "create", kind: "transport", title: "Réserver la camionnette" }).success).toBe(true);
    expect(taskCommand.safeParse({ action: "saveTemplate", kind: "grant", name: "Dossier", items: [{ title: "Budget", daysBefore: 3 }] }).success).toBe(false);
  });
  it("proposes the Transport and « Préparer un entraînement » templates in three languages", () => {
    for (const l of ["fr", "nl", "en"] as const) expect(suggestedTemplates[l].map((t) => t.key)).toEqual(["transport", "training"]);
    expect(suggestedTemplates.fr[1].items.map((i) => i.title)).toEqual(["Choisir les fiches exercices", "Confirmer la salle", "Vérifier le matériel"]);
  });
});

describe("wave 17, O1: licence and courses", () => {
  it("asks at least one category among B, BE, C1, D1, D", () => {
    expect(licenceCommand.safeParse({ action: "save", profileId: id, categories: [], validUntil: null }).success).toBe(false);
    expect(licenceCommand.safeParse({ action: "save", profileId: id, categories: ["C"], validUntil: null }).success).toBe(false);
    expect(licenceCommand.safeParse({ action: "save", profileId: id, categories: ["B", "D1"], validUntil: "2027-01-01" }).success).toBe(true);
  });
  it("reminds once, within 30 days of the expiry", () => {
    expect(reminderDue("2026-11-21", "2026-10-22", null)).toBe(true);
    expect(reminderDue("2026-11-22", "2026-10-22", null)).toBe(false);
    expect(reminderDue("2026-11-01", "2026-10-22", "2026-10-15")).toBe(false);
    expect(reminderDue("2026-10-01", "2026-10-22", null)).toBe(false);
    expect(reminderDue(null, "2026-10-22", null)).toBe(false);
  });
  it("accepts a PDF or a photo as a copy, checked on its first bytes", () => {
    expect(proofType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(proofType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(proofType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(proofType(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("says « Formé » with a valid approved course, else « En attente », else « Non formé »", () => {
    const row = (status: string, title: string, completed_on: string | null, valid_until: string | null = null) => ({ status, title, completed_on, decided_on: completed_on, valid_until });
    expect(trainingState([row("approved", "Coach niveau 1", "2026-05-02")], "2026-10-22")).toEqual({ status: "trained", title: "Coach niveau 1", on: "2026-05-02" });
    expect(trainingState([row("approved", "Ancien", "2020-01-01", "2024-01-01"), row("requested", "Niveau 2", null)], "2026-10-22")).toEqual({ status: "pending", title: "Niveau 2" });
    expect(trainingState([], "2026-10-22")).toEqual({ status: "none" });
  });
  it("leads a licence copy or a course proof in the storage to the coach's profile", () => {
    expect(originHref("licence", id)).toBe(`/coaches/${id}`);
    expect(originHref("training", id)).toBe(`/coaches/${id}`);
  });
});

describe("wave 17, O1: first connection", () => {
  it("has a tour for coaches, in five steps and three languages", () => {
    expect(tutorialAudience("coach")).toBe("coach");
    expect(tutorialAudience("club_president")).toBeNull();
    for (const l of ["fr", "nl", "en"] as const) expect(tutorialCopy[l].steps.coach).toHaveLength(5);
    expect(tutorialCopy.fr.steps.coach!.map((s) => s.title)).toEqual(["Votre équipe", "Le calendrier", "L'appel des présences", "À faire", "Votre profil"]);
    expect(tutorialCommand.safeParse({ action: "reset" }).success).toBe(true);
  });
  it("has every text in the three languages, without long dashes", () => {
    for (const c of [tasksCopy, coachSpaceCopy, tutorialCopy]) {
      expect(shape(c.nl)).toEqual(shape(c.fr));
      expect(shape(c.en)).toEqual(shape(c.fr));
      expect(JSON.stringify(c)).not.toMatch(/[–—]/);
    }
  });
});
