import { z } from "zod";

/**
 * Getting started of a new club (wave 15, C3). Each step is computed from the
 * club's data, never ticked by hand; "Commencer" opens the form that does it.
 * The club's palette (prompt 2.9) will add its step when it exists.
 */
export const setupSteps = ["identity", "season", "team", "coach", "players", "dues", "modules", "presence"] as const;
export type SetupStep = (typeof setupSteps)[number];
export const setupLinks: Record<SetupStep, string> = {
  identity: "/settings/club#club-identity-title",
  season: "/club/manage#teams",
  team: "/club/manage#teams",
  coach: "/access#access-invite",
  players: "/players?import=1",
  dues: "/settings/money#settings-dues-title",
  modules: "/settings/club#settings-modules",
  presence: "/settings/activities#settings-presence",
};
export const setupIcons = {
  identity: "club",
  season: "calendar",
  team: "team",
  coach: "whistle",
  players: "players",
  dues: "dues",
  modules: "settings",
  presence: "attendance",
} as const satisfies Record<SetupStep, string>;
export type SetupState = { steps: { id: SetupStep; done: boolean }[]; hidden: boolean };
export const setupDone = (s: SetupState) => s.steps.filter((x) => x.done).length;
/** The card shows until every step is done, unless the president hid it. */
export const setupShown = (s: SetupState) => !s.hidden && setupDone(s) < s.steps.length;
export const setupCommand = z.object({ action: z.literal("setupHidden"), hidden: z.boolean() });
