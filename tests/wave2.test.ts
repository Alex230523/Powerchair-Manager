import { describe, expect, it } from "vitest";
import {
  budgetComparison,
  commandSchema as financeCommand,
  receiptType,
  seasonBounds,
} from "../src/domains/finance/schema";
import { applyPayments, duesStatus } from "../src/domains/reminders/schema";
import {
  anonymousName,
  commandSchema as privacyCommand,
  duplicatePairs,
} from "../src/domains/privacy/schema";
import { rowsFromGrid, templateHeaders } from "../src/lib/spreadsheet";
import { peopleCommand } from "../src/domains/people/schema";
import { financeExtras } from "../src/components/finance-copy";
import { privacyCopy } from "../src/components/privacy-copy";

const keys = (o: object) => Object.keys(o).sort();

describe("finance budget and receipts", () => {
  it("compares planned and actual, favourable gaps are positive", () => {
    const rows = budgetComparison(
      [
        { direction: "in", category: "dues", amount_cents: 100000 },
        { direction: "out", category: "venue", amount_cents: 50000 },
      ],
      {
        dues: { in: 80000, out: 0 },
        venue: { in: 0, out: 40000 },
        event: { in: 5000, out: 0 },
      },
    );
    expect(rows.map((r) => [r.direction, r.category, r.gap, r.ratio])).toEqual([
      ["in", "dues", -20000, 80],
      ["in", "event", 5000, null],
      ["out", "venue", 10000, 80],
    ]);
  });
  it("recognises receipts by their signature", () => {
    const bytes = (hex: string) =>
      Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    expect(receiptType(bytes("255044462d312e34"))).toBe("application/pdf");
    expect(receiptType(bytes("89504e470d0a1a0a00"))).toBe("image/png");
    expect(receiptType(bytes("ffd8ffe000"))).toBe("image/jpeg");
    expect(receiptType(new TextEncoder().encode("RIFF0000WEBPVP8 "))).toBe(
      "image/webp",
    );
    expect(receiptType(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("knows season bounds and validates budget commands", () => {
    expect(seasonBounds("2026-27")).toEqual({
      from: "2026-07-01",
      to: "2027-06-30",
      label: "2026-27",
    });
    expect(
      financeCommand.safeParse({ action: "budget", season: "2026", lines: [] })
        .success,
    ).toBe(false);
    expect(
      financeCommand.safeParse({
        action: "budget",
        season: "2026-27",
        lines: [{ direction: "in", category: "dues", amountCents: 1000 }],
      }).success,
    ).toBe(true);
  });
});

describe("dues payments", () => {
  const plan = [
    { due_on: "2026-09-01", amount_cents: 6250 },
    { due_on: "2026-10-01", amount_cents: 6250 },
    { due_on: "2026-11-01", amount_cents: 6250 },
  ];
  it("settles the earliest instalments first", () => {
    expect(applyPayments(plan, 8000)).toEqual([
      { due_on: "2026-10-01", amount_cents: 4500 },
      { due_on: "2026-11-01", amount_cents: 6250 },
    ]);
  });
  it("stops reminding once the overdue part is paid", () => {
    expect(duesStatus(plan, "2026-10-19", 14, 0).overdueCents).toBe(12500);
    expect(duesStatus(plan, "2026-10-19", 7, 12500).concerned).toBe(false);
    expect(duesStatus(plan, "2026-10-25", 14, 12500).concerned).toBe(true);
  });
});

describe("duplicates and anonymisation", () => {
  const p = (
    id: string,
    full_name: string,
    birth_date: string | null,
    extra = {},
  ) => ({
    id,
    full_name,
    birth_date,
    email: null as string | null,
    has_account: false,
    status: "active",
    ...extra,
  });
  it("pairs same names with compatible birth dates, or same emails", () => {
    const pairs = duplicatePairs([
      p("1", "Yanis El Amrani", "2005-09-17"),
      p("2", "Yanis El-Amrani", null, { has_account: true }),
      p("3", "Léa Dupont", "2008-01-01"),
      p("4", "Lea Dupont", "2009-01-01"),
      p("5", "Tom", null, { email: "x@example.org" }),
      p("6", "Thomas", null, { email: "X@example.org" }),
    ]);
    expect(pairs.map((x) => [x.a.id, x.b.id, x.reason])).toEqual([
      ["2", "1", "name"],
      ["5", "6", "email"],
    ]);
  });
  it("requires a confirmation name and never reuses a real name", () => {
    expect(
      privacyCommand.safeParse({
        action: "anonymize",
        id: crypto.randomUUID(),
        confirmName: "",
      }).success,
    ).toBe(false);
    expect(anonymousName("abcdef12-3456")).toBe("Personne anonymisée abcdef12");
  });
});

describe("richer spreadsheet import", () => {
  it("reads team and parent columns and imports coaches", () => {
    const { rows, issues } = rowsFromGrid(
      [
        templateHeaders,
        [
          "Léa Dupont",
          "15/04/2012",
          "",
          "",
          "",
          "Défense",
          "5",
          "Équipe A",
          "Marc Dupont",
          "MARC@example.org",
          "+32 470",
        ],
        ["Tom Claes", "", "", "", "", "", "", "", "Ann", "pas-un-email", ""],
      ],
      "2026-10-19",
    );
    expect(rows[0]).toMatchObject({
      team: "Équipe A",
      guardianName: "Marc Dupont",
      guardianEmail: "marc@example.org",
      guardianPhone: "+32 470",
    });
    expect(issues).toEqual([{ line: 3, field: "guardianEmail" }]);
    expect(
      peopleCommand.safeParse({
        action: "importPlayers",
        teamId: null,
        role: "coach",
        rows,
      }).success,
    ).toBe(true);
  });
});

describe("copy", () => {
  it("keeps the three languages aligned", () => {
    for (const copy of [financeExtras, privacyCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
    }
  });
});
