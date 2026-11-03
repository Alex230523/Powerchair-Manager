import localFont from "next/font/local";

/**
 * The two typefaces of the interface (wave 13), served by the site itself
 * (no request to Google, neither at run time nor at build time: offline mode,
 * GDPR, and a build that does not depend on the font server). Files: the
 * « latin » subset of Fontsource (SIL Open Font License, see fonts/OFL-*.txt);
 * a rarer letter falls back to the system font. The layouts put both
 * variables on <html>; globals.css reads them in --font-ui and
 * --font-display, with system fallbacks.
 */
export const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/dm-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/dm-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-dm-sans",
});
export const sourceSerif = localFont({
  src: [
    { path: "./fonts/source-serif-4-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/source-serif-4-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-source-serif",
});
export const fontClass = `${dmSans.variable} ${sourceSerif.variable}`;
