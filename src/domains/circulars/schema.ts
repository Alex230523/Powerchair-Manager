/** 33: who a circular may reach (pure, shared with the page). */
export const circularAudiences = ["presidents", "coaches", "referees", "members"] as const;
export type CircularAudience = (typeof circularAudiences)[number];
