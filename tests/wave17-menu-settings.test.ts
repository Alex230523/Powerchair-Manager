import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { durationText } from "../src/components/duration-copy";
import { settingsEntries } from "../src/components/settings-nav";

/** Wave 17 (G3): Relances in Settings, no offline book, rights until further notice. */
describe("menu and settings", () => {
  it("drops Relances and the offline book from the menu, keeps the old address as a redirect", () => {
    const menu = readFileSync("src/components/menu.ts", "utf8");
    expect(menu).not.toContain('"/reminders"');
    expect(menu).not.toContain("/offline-book");
    expect(existsSync("src/app/[locale]/offline-book/page.tsx")).toBe(false);
    expect(existsSync("src/lib/offline-book.ts")).toBe(false);
    expect(readFileSync("src/app/[locale]/reminders/page.tsx", "utf8")).toContain("/settings/notifications");
    expect(settingsEntries.find((e) => e.id === "reminders")).toEqual({ id: "reminders", category: "notifications", anchor: "settings-reminders" });
    // Old offline books still on a device are wiped at sign-out.
    expect(readFileSync("src/lib/offline-queue.ts", "utf8")).toContain('indexedDB.deleteDatabase("pcm-offline-books")');
  });
  it("says « jusqu'à nouvel ordre » for rights without an end, never nothing", () => {
    expect(durationText("fr", null)).toBe("Jusqu'à nouvel ordre");
    expect(durationText("nl", undefined)).toBe("Tot nader order");
    expect(durationText("en", null)).toBe("Until further notice");
    expect(durationText("fr", "2027-03-12T22:59:59Z")).toBe("Jusqu'au 12/03/2027");
  });
});
