import { describe, it, expect } from "vitest";
import {
  communicationCommand,
  eventMailState,
  fillPlaceholders,
  hasContent,
  pickContacts,
  renderNewsletter,
  type GuardianContact,
  type PersonContact,
} from "../src/domains/communication/schema";
import { emailHash } from "../src/domains/communication/hash";
import { expiryState, commandSchema as equipmentCommand } from "../src/domains/equipment/schema";
import { exportGrid, exportOptions, printablePage } from "../src/domains/people/export";
import { daysBetween, isMonday } from "../src/domains/calendar/schema";
import { crc32, xlsx, columnName } from "../src/lib/xlsx";
import { parseXlsx } from "../src/lib/spreadsheet";
import { communicationCopy, unsubscribeCopy } from "../src/components/communication-copy";
import { stockCopy } from "../src/components/equipment-stock-copy";
import { exportCopy } from "../src/components/export-copy";
import { calendarCopyWeek } from "../src/components/calendar-copy";
import { renderTemplate, builtin } from "../src/domains/notifications/templates";

/** Same keys, at every depth, in the three languages. */
function shape(o: unknown): unknown {
  if (o && typeof o === "object")
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, shape((o as Record<string, unknown>)[k])]),
    );
  return typeof o;
}
const person = (over: Partial<PersonContact>): PersonContact => ({
  profile_id: "p",
  full_name: "X",
  birth_date: null,
  file_email: null,
  user_id: null,
  user_email: null,
  user_name: null,
  locale: "fr",
  ...over,
});

describe("who receives a club mail", () => {
  const today = "2026-10-20";
  const lucas = person({ profile_id: "lucas", full_name: "Lucas", birth_date: "2014-04-30", user_id: "u-lucas", user_email: "lucas@x.test" });
  const ines = person({ profile_id: "ines", full_name: "Inès", birth_date: "2016-01-01", file_email: "famille@x.test" });
  const adult = person({ profile_id: "adult", full_name: "Sam", birth_date: "1990-01-01", user_id: "u-sam", user_email: "sam@x.test", locale: "nl" });
  const nadia: GuardianContact = {
    ...person({ profile_id: "nadia", full_name: "Nadia", user_id: "u-nadia", user_email: "Nadia@X.test", user_name: "Nadia P." }),
    subject_profile_id: "lucas",
  };
  it("writes to a minor through their representatives, once per address", () => {
    const out = pickContacts([lucas, adult], [nadia, { ...nadia, subject_profile_id: "ines" }], today);
    expect(out.map((c) => c.email).sort()).toEqual(["Nadia@X.test", "sam@x.test"]);
    expect(out.find((c) => c.userId === "u-sam")?.locale).toBe("nl");
  });
  it("uses the minor's own or file address when nobody represents them", () => {
    expect(pickContacts([ines], [], today)).toEqual([
      { email: "famille@x.test", userId: null, name: "Inès", locale: "fr" },
    ]);
    expect(pickContacts([lucas], [], today)[0].email).toBe("lucas@x.test");
  });
  it("also writes to the helpers of an adult (delegated aid)", () => {
    const helper = { ...nadia, subject_profile_id: "adult" };
    expect(pickContacts([adult], [helper], today)).toHaveLength(2);
  });
  it("prefers the account when an address is both on file and on an account", () => {
    const filed = person({ profile_id: "a", file_email: "nadia@x.test" });
    const out = pickContacts([filed], [{ ...nadia, subject_profile_id: "a" }], today);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe("u-nadia");
  });
  it("hashes addresses without case or spaces", () => {
    expect(emailHash(" Nadia@X.test ")).toBe(emailHash("nadia@x.test"));
    expect(emailHash("a@b.c")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("newsletters by blocks", () => {
  const blocks = [
    { type: "heading" as const, text: "Big <news>" },
    { type: "text" as const, text: "Line 1\nLine \"2\"" },
    { type: "events" as const, eventIds: ["e1", "missing"] },
    { type: "button" as const, label: "Site", url: "https://club.test/?a=1&b=2" },
    { type: "divider" as const },
  ];
  const out = renderNewsletter(blocks, [{ id: "e1", title: "Tournoi & fête", when: "samedi", place: "Namur" }], {
    organization: "Club <Tigers>",
    locale: "fr",
    unsubscribeUrl: "https://app.test/fr/desinscription/1",
  });
  it("escapes everything in the HTML and keeps a plain text version", () => {
    expect(out.html).toContain("Big &lt;news&gt;");
    expect(out.html).toContain("Line 1<br>Line &quot;2&quot;");
    expect(out.html).toContain("Tournoi &amp; fête");
    expect(out.html).toContain('href="https://club.test/?a=1&amp;b=2"');
    expect(out.html).toContain("Club &lt;Tigers&gt;");
    expect(out.html).not.toContain("<news>");
    expect(out.message).toContain("BIG <NEWS>");
    expect(out.message).toContain("- Tournoi & fête, samedi, Namur");
    expect(out.html).toContain("https://app.test/fr/desinscription/1");
  });
  it("accepts only http(s) links and bounded content", () => {
    const base = { action: "newsletter", subject: "Hello", groupIds: [], includeAlumni: false };
    expect(communicationCommand.safeParse({ ...base, blocks: [{ type: "button", label: "x", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(communicationCommand.safeParse({ ...base, blocks: [{ type: "button", label: "x", url: "https://ok.test" }] }).success).toBe(true);
    expect(communicationCommand.safeParse({ ...base, blocks: Array(41).fill({ type: "divider" }) }).success).toBe(false);
    expect(hasContent([{ type: "divider" }])).toBe(false);
    expect(hasContent(blocks)).toBe(true);
  });
  it("refuses a sender name that could break the mail header", () => {
    expect(communicationCommand.safeParse({ action: "sender", senderName: "Tigers\r\nBcc: x", replyTo: "" }).success).toBe(false);
    expect(communicationCommand.safeParse({ action: "sender", senderName: "Tigers", replyTo: "not-an-email" }).success).toBe(false);
    expect(communicationCommand.safeParse({ action: "sender", senderName: "Tigers", replyTo: "" }).success).toBe(true);
  });
  it("renders club-written mails with the builtin templates", () => {
    const r = renderTemplate(builtin.club_newsletter.nl, {
      name: "A",
      organization: "Club",
      url: "https://app.test/nl/desinscription/1",
      title: "Nieuws",
      message: "Tekst",
    });
    expect(r.subject).toBe("Nieuws");
    expect(r.text).toContain("Tekst");
    expect(r.text).toContain("https://app.test/nl/desinscription/1");
  });
});

describe("mails prepared before an event", () => {
  it("waits for a new reading when the event changed or was cancelled", () => {
    expect(eventMailState({ status: "scheduled", event_version: 2 }, { status: "scheduled", version: 2 })).toBe("scheduled");
    expect(eventMailState({ status: "scheduled", event_version: 2 }, { status: "scheduled", version: 3 })).toBe("review");
    expect(eventMailState({ status: "scheduled", event_version: 2 }, { status: "cancelled", version: 3 })).toBe("event_cancelled");
    expect(eventMailState({ status: "sent", event_version: 2 }, { status: "scheduled", version: 5 })).toBe("sent");
    expect(eventMailState({ status: "cancelled", event_version: 2 }, { status: "scheduled", version: 2 })).toBe("cancelled");
  });
  it("fills the placeholders", () => {
    expect(
      fillPlaceholders("{name}: {event} le {date} à {place} ({name})", {
        name: "Nadia",
        event: "Match",
        date: "samedi",
        place: "Namur",
      }),
    ).toBe("Nadia: Match le samedi à Namur (Nadia)");
  });
});

describe("equipment stock", () => {
  it("flags expired and soon expiring material", () => {
    expect(expiryState(null, "2026-10-20")).toBe("none");
    expect(expiryState("2026-10-19", "2026-10-20")).toBe("expired");
    expect(expiryState("2026-11-19", "2026-10-20")).toBe("soon");
    expect(expiryState("2026-11-20", "2026-10-20")).toBe("ok");
  });
  it("validates wishes and links", () => {
    const wish = { action: "wish", title: "Ballons", reason: "", quantity: 2, estimatedCents: 4500, link: "" };
    expect(equipmentCommand.safeParse(wish).success).toBe(true);
    expect(equipmentCommand.safeParse({ ...wish, link: "ftp://x" }).success).toBe(false);
    expect(equipmentCommand.safeParse({ ...wish, quantity: 0 }).success).toBe(false);
  });
});

describe("selective export", () => {
  const people = [
    {
      full_name: "=cmd|' /C calc'!A0",
      birth_date: "2014-04-30",
      email: "a@b.test",
      phone: "",
      joined_on: "2024-09-01",
      status: "active",
      teams: ["Équipe A", "Équipe B"],
      directory_roles: ["player", "coach"],
      former_roles: ["coach"],
      jersey_number: 7,
      playing_position: "Attaquant",
    },
  ];
  it("keeps the chosen columns in order, in the club's language", () => {
    const grid = exportGrid(people, ["name", "age", "teams", "roles", "jersey"], "2026-10-20", "nl");
    expect(grid[0]).toEqual(["Naam", "Leeftijd", "Teams", "Functies", "Nummer"]);
    expect(grid[1].slice(1)).toEqual(["12", "Équipe A, Équipe B", "speler", "7"]);
    expect(exportGrid(people, ["name"], "2026-10-20")[0]).toEqual(["Nom / Naam"]);
  });
  it("parses the column list and rejects unknown columns", () => {
    expect(exportOptions.parse({}).columns).toContain("teams");
    expect(exportOptions.parse({ columns: "name,email,name" }).columns).toEqual(["name", "email"]);
    expect(exportOptions.safeParse({ columns: "name,password" }).success).toBe(false);
    expect(exportOptions.safeParse({ format: "pdf" }).success).toBe(false);
  });
  it("writes an Excel file that reads back, with text only (no formulas)", async () => {
    const grid = exportGrid(people, ["name", "email", "teams"], "2026-10-20", "fr");
    const bytes = xlsx(grid, "Club / Tigers");
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const back = await parseXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(back).toEqual(grid);
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain("<f>");
    expect(text).toContain('t="inlineStr"');
  });
  it("computes zip checksums and column names", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
    expect([0, 25, 26, 51, 701].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "ZZ"]);
  });
  it("escapes the printable page", () => {
    const html = printablePage([["Nom"], ["<script>x</script>"]], "Club & co", "2026-10-20", "fr");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("Club &amp; co");
    expect(html).toContain("1 personnes");
  });
});

describe("calendar week copy", () => {
  it("works on Mondays and counts days", () => {
    expect(isMonday("2026-10-19")).toBe(true);
    expect(isMonday("2026-10-20")).toBe(false);
    expect(daysBetween("2026-10-19", "2026-10-26")).toBe(7);
    expect(daysBetween("2026-10-26", "2026-10-19")).toBe(-7);
    // Across the change to winter time (25 October 2026).
    expect(daysBetween("2026-10-19", "2026-11-02")).toBe(14);
  });
});

describe("wave 9 texts", () => {
  it.each([
    ["communication", communicationCopy],
    ["unsubscribe", unsubscribeCopy],
    ["stock", stockCopy],
    ["export", exportCopy],
    ["calendar week copy", calendarCopyWeek],
  ])("%s has the same keys in fr, nl and en", (_name, copy) => {
    const c = copy as Record<string, unknown>;
    expect(shape(c.nl)).toEqual(shape(c.fr));
    expect(shape(c.en)).toEqual(shape(c.fr));
  });
  it("uses no long dashes in the visible texts", () => {
    const all = JSON.stringify([communicationCopy, unsubscribeCopy, stockCopy, exportCopy, calendarCopyWeek]);
    expect(all).not.toMatch(/[–—]/);
  });
});
