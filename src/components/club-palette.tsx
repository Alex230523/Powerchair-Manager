import type { Appearance } from "@/lib/appearance";

/**
 * Applies a club's palette before the page paints (public pages, prompt 2.9):
 * a tiny inline script at the top of the page, as for the theme. The values
 * come from the database through a closed list, never from the address.
 */
export function ClubPalette({ appearance }: { appearance: Appearance }) {
  const palette = ["night", "bordeaux", "aubergine", "brown"].includes(appearance.palette) ? appearance.palette : "night";
  const tint = ["neutral", "light", "strong"].includes(appearance.tint) ? appearance.tint : "light";
  const script = `(function(d){${palette === "night" ? "delete d.palette" : `d.palette="${palette}"`};${tint === "light" ? "delete d.tint" : `d.tint="${tint}"`}})(document.documentElement.dataset)`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
