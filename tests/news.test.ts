import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { allEntries, badgeRoutes, concerns, entriesOfRoute, isFresh, newsEntry, newsRoleOf, popupEntry } from "../src/domains/news/schema";
import { changelogFiles, indexSource } from "../scripts/changelog-index";
import { newsCopy } from "../src/components/news-copy";

/** 20: « Nouveautés »: every file complete and indexed; the role's filter, the badge's 14 days, the window once. */
describe("news", () => {
  it("refuses an incomplete file, and keeps every file in the index", () => {
    const files = changelogFiles();
    expect(files.length).toBeGreaterThan(30);
    for (const f of files) {
      const r = newsEntry.safeParse(JSON.parse(readFileSync(`content/changelog/${f}`, "utf8")));
      expect(r.success, `${f}: ${r.success ? "" : r.error.message}`).toBe(true);
      expect(f.startsWith((r.data as { date: string }).date), f).toBe(true);
    }
    expect(readFileSync("src/domains/news/entries.ts", "utf8")).toBe(indexSource(files));
    expect(allEntries()).toHaveLength(files.length);
    // A missing language, an unknown role or a too short text is refused.
    const ok = JSON.parse(readFileSync(`content/changelog/${files[0]}`, "utf8"));
    expect(newsEntry.safeParse({ ...ok, nl: undefined }).success).toBe(false);
    expect(newsEntry.safeParse({ ...ok, roles: ["referee"] }).success).toBe(false);
    expect(newsEntry.safeParse({ ...ok, en: { title: "New", text: "Short." } }).success).toBe(false);
  });
  it("writes plainly, without the banned vocabulary", () => {
    for (const e of allEntries()) for (const l of ["fr", "nl", "en"] as const) expect(`${e[l].title} ${e[l].text}`).not.toMatch(/convoqu|opgeroep|summon|call-up|API|SQL|JSON/i);
  });
  it("filters by the role of the profile in use", () => {
    expect(newsRoleOf("club", "guardian")).toBe("parent");
    expect(newsRoleOf("federation", "referee")).toBe("federation");
    expect(newsRoleOf(null, null)).toBe("all");
    const coach = allEntries().filter((e) => concerns(e, "coach"));
    expect(coach.some((e) => e.id.endsWith("fiches-exercices"))).toBe(true);
    expect(coach.some((e) => e.id.endsWith("espace-federation"))).toBe(false);
    expect(coach.some((e) => e.id.endsWith("nouveautes"))).toBe(true);
  });
  it("shows « Nouveau » 14 days, or until read; the window once", () => {
    const e = { id: "2026-10-22-x", date: "2026-10-22", roles: ["coach"], link: "/exercises", image: null, fr: { title: "a", text: "b" }, nl: { title: "a", text: "b" }, en: { title: "a", text: "b" } } as never;
    expect(isFresh({ date: "2026-10-22" }, "2026-11-04")).toBe(true);
    expect(isFresh({ date: "2026-10-22" }, "2026-11-05")).toBe(false);
    expect(badgeRoutes([e], "coach", new Set(), "2026-11-02")).toEqual(["/exercises"]);
    expect(badgeRoutes([e], "coach", new Set(["2026-10-22-x"]), "2026-11-02")).toEqual([]);
    // At most three, the newest first; a page opened takes its entries with it.
    const many = ["/a", "/b", "/c", "/d"].map((link, i) => ({ ...(e as object), id: `2026-10-2${i}-x${i}`, link })) as never[];
    expect(badgeRoutes(many, "coach", new Set(), "2026-11-02")).toEqual(["/a", "/b", "/c"]);
    expect(entriesOfRoute(many, "coach", "/b")).toEqual(["2026-10-21-x1"]);
    expect(badgeRoutes([e], "player", new Set(), "2026-11-02")).toEqual([]);
    expect(popupEntry([e], "coach", new Set(), "2026-11-02", false)).toBe(e);
    expect(popupEntry([e], "coach", new Set(["2026-10-22-x"]), "2026-11-02", false)).toBeNull();
    expect(popupEntry([e], "coach", new Set(), "2026-11-02", true)).toBeNull();
  });
  it("has the words in the three languages", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(newsCopy.nl)).toEqual(keys(newsCopy.fr));
    expect(keys(newsCopy.en)).toEqual(keys(newsCopy.fr));
  });
});
