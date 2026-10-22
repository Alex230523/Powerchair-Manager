/** Wave 17 (G1): what the outgoing president keeps after the handover. */
export const keepRoles = ["member", "coach", "none"] as const;
export type KeepRole = (typeof keepRoles)[number];
