import { z } from "zod";

/**
 * Wave 17 (O1): a short guided tour at the first connection, remembered per
 * account and audience. Coaches have theirs; players and parents can get
 * their own with separate texts by adding an audience here.
 */
export const tutorialAudiences = ["coach", "player", "parent"] as const;
export type TutorialAudience = (typeof tutorialAudiences)[number];
/** The audiences with texts today. */
const live: Partial<Record<string, TutorialAudience>> = { coach: "coach" };
export const tutorialAudience = (role: string | null | undefined): TutorialAudience | null => (role ? (live[role] ?? null) : null);

export const tutorialCommand = z.object({ action: z.enum(["seen", "reset"]) });
export type TutorialCommand = z.infer<typeof tutorialCommand>;
