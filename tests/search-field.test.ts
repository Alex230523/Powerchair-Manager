import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 13/11/2026: in « Rechercher un nom », the magnifier ran over the text: the
 * « one look for every field » rule, more specific, won on the padding. The
 * search fields' rule is now above it (photo of 13/11/2026, Coachs page).
 */
describe("the pages' search fields", () => {
  it("leave room for the magnifier, with a rule more specific than the fields' one", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.match(/\nmain input\[type="search"\]:not\(\.command-input input\) \{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/padding-inline: 40px 14px;/);
    expect(rule![1]).toMatch(/background-position: 14px 50%;/);
    expect(css).toMatch(/main :is\(\.toolbar-filters, \.directory-filters\) select:not\(\.capsule select\) \{/);
  });
});
