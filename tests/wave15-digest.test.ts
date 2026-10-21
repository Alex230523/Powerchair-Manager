import { describe, it, expect } from "vitest";
import { brusselsClock, clockLabel, digestCommand, digestDue, digestSections, digestTimes, isoWeek, nextDigestDate } from "../src/domains/digest/schema";
import { digestContent, renderDigest, type DigestData } from "../src/domains/digest/build";
import { digestCopy } from "../src/components/digest-copy";

/** Wave 15 (C7): the weekly digest's clock, its content and its email. */
const empty: DigestData = {
  club: "Club <test>",
  name: "Alex",
  todos: [],
  events: [],
  registrations: 0,
  documents: 0,
  dues: { players: 0, cents: 0 },
  readiness: [],
  deadlines: [],
  tasks: [],
  treasury: 125000,
};
const full: DigestData = {
  ...empty,
  todos: [
    { key: "registrationsReview", count: 2 },
    { key: "registersToClose", count: 1 },
    { key: "sponsorTasks", count: 1 },
  ],
  events: [{ title: "Entraînement", startsAt: "2026-10-22T16:00:00Z", team: "Lions", place: "Hall du Parc" }],
  registrations: 2,
  documents: 3,
  dues: { players: 4, cents: 36000 },
  readiness: [{ title: "Match contre Gand", startsAt: "2026-10-24T09:00:00Z", team: "Lions", players: 2, coaches: 0 }],
  deadlines: [{ kind: "grant", date: "2026-11-10", title: "Province · Matériel" }],
  tasks: [{ date: "2026-10-20", title: "Garage Dupont · Logo sur le maillot", responsible: "Sam Coach", late: true }],
};
const links = { dashboard: "https://pfm.test/fr", settings: "https://pfm.test/fr/settings/notifications#notif-digest", stop: "https://pfm.test/fr/desinscription/x", logo: null };

describe("the clock", () => {
  it("reads the Brussels wall clock, summer and winter time", () => {
    // 21 October 2026, 5:30 UTC = 7:30 in Brussels (summer time), a Wednesday.
    expect(brusselsClock(new Date("2026-10-21T05:30:00Z"))).toEqual({ date: "2026-10-21", day: 3, minute: 450, week: "2026-W43" });
    // 2 December 2026, 6:30 UTC = 7:30 in Brussels (winter time).
    expect(brusselsClock(new Date("2026-12-02T06:30:00Z"))).toMatchObject({ day: 3, minute: 450 });
    // Late Sunday evening UTC is already Monday in Brussels.
    expect(brusselsClock(new Date("2026-10-25T23:30:00Z"))).toMatchObject({ date: "2026-10-26", day: 1 });
  });
  it("numbers ISO weeks across the new year", () => {
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
  });
  it("is due on the day once the time is reached, once a week", () => {
    const when = { day: 3, minute: 450 };
    expect(digestDue({ day: 3, minute: 449 }, when, false)).toBe(false);
    expect(digestDue({ day: 3, minute: 450 }, when, false)).toBe(true);
    expect(digestDue({ day: 3, minute: 700 }, when, false)).toBe(true);
    expect(digestDue({ day: 3, minute: 700 }, when, true)).toBe(false);
    expect(digestDue({ day: 4, minute: 450 }, when, false)).toBe(false);
  });
  it("tells the next sending date", () => {
    const wed = { date: "2026-10-21", day: 3, minute: 400 };
    expect(nextDigestDate(wed, { day: 3, minute: 450 }, false)).toBe("2026-10-21");
    expect(nextDigestDate({ ...wed, minute: 500 }, { day: 3, minute: 450 }, false)).toBe("2026-10-28");
    expect(nextDigestDate(wed, { day: 3, minute: 450 }, true)).toBe("2026-10-28");
    // Already sent this week, the day moved to Friday: next week's Friday.
    expect(nextDigestDate(wed, { day: 5, minute: 450 }, true)).toBe("2026-10-30");
    expect(nextDigestDate(wed, { day: 5, minute: 450 }, false)).toBe("2026-10-23");
  });
  it("offers 6:00 to 20:00 by half hours", () => {
    expect(digestTimes[0]).toBe(360);
    expect(digestTimes.at(-1)).toBe(1200);
    expect(clockLabel(450, "fr")).toBe("7 h 30");
    expect(clockLabel(450, "en")).toBe("7:30");
  });
  it("validates the settings", () => {
    expect(digestCommand.parse({ action: "digest", enabled: true, day: null, minute: 480, sections: ["todos", "todos"] })).toMatchObject({ sections: ["todos"] });
    expect(() => digestCommand.parse({ action: "digest", enabled: true, day: 8, minute: null, sections: [] })).toThrow();
    expect(() => digestCommand.parse({ action: "digestClub", day: 3, minute: 455 })).toThrow();
    expect(() => digestCommand.parse({ action: "digest", enabled: true, day: null, minute: null, sections: ["health"] })).toThrow();
  });
});

describe("the content", () => {
  it("sends nothing for an empty week, even with a treasury balance", () => {
    expect(digestContent(empty, digestSections).items).toBe(0);
    expect(renderDigest(empty, digestSections, "fr", links)).toBeNull();
  });
  it("keeps only the sections chosen and does not repeat a todo told by its own section", () => {
    const all = digestContent(full, digestSections);
    expect(all.parts.todos.map((t) => t.key)).toEqual(["registersToClose"]);
    expect(all.items).toBe(1 + 1 + 1 + 1 + 1 + 1 + 1 + 1);
    const some = digestContent(full, ["todos", "events"]);
    expect(some.parts.todos.map((t) => t.key)).toEqual(["registrationsReview", "registersToClose", "sponsorTasks"]);
    expect(some.items).toBe(4);
    expect(digestContent(full, []).items).toBe(0);
  });
  it("writes a sober email in the recipient's language, text and HTML", () => {
    for (const locale of ["fr", "nl", "en"] as const) {
      const mail = renderDigest(full, digestSections, locale, links)!;
      expect(mail.subject).toBe(digestCopy[locale].mail.subject.replace("{club}", "Club <test>"));
      expect(mail.text).toContain(digestCopy[locale].mail.button);
      expect(mail.text).toContain(links.stop);
      expect(mail.text).toContain("Sam Coach");
      expect(mail.html).toContain(`lang="${locale}"`);
      expect(mail.html).toContain(digestCopy[locale].mail.heading);
      expect(mail.html).toContain('href="https://pfm.test/fr"');
      // The club's name is escaped, never raw HTML.
      expect(mail.html).not.toContain("Club <test>");
      expect(mail.html).toContain("Club &lt;test&gt;");
      expect(mail.text + mail.html).not.toMatch(/[–—]/);
    }
    const fr = renderDigest(full, digestSections, "fr", links)!;
    expect(fr.text).toContain("4 joueurs en retard");
    expect(fr.text).toContain("2 joueurs et 0 coachs présents");
    expect(fr.text).toContain("(en retard)");
    expect(fr.text).toContain("Solde actuel");
  });
  it("shows the club's logo when there is one", () => {
    const mail = renderDigest(full, ["events"], "fr", { ...links, logo: "https://pfm.test/api/club/logo?org=o&v=1" })!;
    expect(mail.html).toContain('<img src="https://pfm.test/api/club/logo?org=o&amp;v=1"');
  });
  it("has every text in three languages, without dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
    expect(keys(digestCopy.nl)).toEqual(keys(digestCopy.fr));
    expect(keys(digestCopy.en)).toEqual(keys(digestCopy.fr));
    expect(JSON.stringify(digestCopy)).not.toMatch(/[–—]/);
  });
});
