/** The club's palettes and background tints (prompt 2.9); night blue and light by default. */
export const palettes = ["night", "bordeaux", "aubergine", "brown"] as const;
export const tints = ["neutral", "light", "strong"] as const;
export type Palette = (typeof palettes)[number];
export type Tint = (typeof tints)[number];
