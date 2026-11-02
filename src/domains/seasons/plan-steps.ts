/** 16: the steps of « Préparer la saison suivante », in order (pure: shared by the page and the service). */
export const planSteps = ["review", "season", "players", "dues", "affiliations", "reminders", "check", "communication", "summary"] as const;
export type PlanStep = (typeof planSteps)[number];
export type StepState = "todo" | "done" | "skipped";
