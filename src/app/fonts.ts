import { DM_Sans, Source_Serif_4 } from "next/font/google";

/**
 * The two typefaces of the interface (wave 13), served by the site itself
 * (no request to Google at run time: offline mode and GDPR). The layouts put
 * both variables on <html>; globals.css reads them in --font-ui and
 * --font-display, with system fallbacks.
 */
export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});
export const sourceSerif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-source-serif",
});
export const fontClass = `${dmSans.variable} ${sourceSerif.variable}`;
