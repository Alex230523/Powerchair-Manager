/** The team palette (wave 12): keys of the CSS variables --team-<colour>-bg/-border/-ink. Pure, shared by the browser and the server. */
export const teamColors = ["blue", "teal", "green", "amber", "coral", "plum", "slate", "sand"] as const;
export type TeamColor = (typeof teamColors)[number];
