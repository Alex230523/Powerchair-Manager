import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { billingPeriods, bookingCommand, bookingEmail, changeEmail, invoiceGap, plannedCost, rateAt, sessionLabel, slotLines } from "../src/domains/venues/bookings-schema";
import { bookingWords } from "../src/domains/venues/bookings-copy";
import { venueBookingsCopy } from "../src/components/venue-bookings-copy";

/** 18: hall bookings (pure parts). */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
const weekly = (from: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(from + "T12:00:00Z") + i * 7 * 86400000).toISOString().slice(0, 10);
    return { local_start: `${d}T18:00`, local_end: `${d}T20:00` };
  });
const rates = [
  { label: "Heure", amount_cents: 5000, valid_from: "2026-09-01" },
  { label: "Heure", amount_cents: 6000, valid_from: "2026-10-01" },
  { label: "Gala", amount_cents: 90000, valid_from: "2026-09-01" },
];

describe("hall bookings", () => {
  it("says a weekly series as one slot, and a lone date by itself", () => {
    const lines = slotLines("fr", [...weekly("2026-09-02", 5), { local_start: "2026-12-19T10:00", local_end: "2026-12-19T12:00" }]);
    expect(lines).toEqual(["chaque mercredi de 18:00 à 20:00, du 2 septembre 2026 au 30 septembre 2026 (5 séances)", "samedi 19 décembre 2026, de 10:00 à 12:00"]);
    expect(slotLines("nl", weekly("2026-09-02", 3))[0]).toBe("elke woensdag van 18:00 tot 20:00, van 2 september 2026 tot 16 september 2026 (3 sessies)");
    expect(sessionLabel("en", "2026-09-02T18:00")).toBe("Wednesday 2 September 2026 at 18:00");
  });
  it("prices each session at the rate in force on its day", () => {
    expect(rateAt(rates, "heure", "2026-09-30")?.amount_cents).toBe(5000);
    expect(rateAt(rates, "Heure", "2026-08-30")).toBeNull();
    // 5 sessions in September at 50 €, 4 in October at 60 €.
    expect(plannedCost(weekly("2026-09-02", 9), rates, "Heure")).toBe(5 * 5000 + 4 * 6000);
    expect(plannedCost(weekly("2026-09-02", 9), rates, null)).toBe(0);
  });
  it("expects an invoice per month, per quarter or for the year, due at the end of its period", () => {
    const s = weekly("2026-09-02", 9);
    expect(billingPeriods(s, "monthly", rates, "Heure")).toEqual([
      { period: "2026-09", due: "2026-09-30", cents: 25000, sessions: 5 },
      { period: "2026-10", due: "2026-10-31", cents: 24000, sessions: 4 },
    ]);
    expect(billingPeriods(s, "quarterly", rates, "Heure").map((p) => [p.period, p.due])).toEqual([
      ["2026-Q3", "2026-09-30"],
      ["2026-Q4", "2026-12-31"],
    ]);
    expect(billingPeriods(s, "yearly", rates, "Heure")).toEqual([{ period: "year", due: "2026-10-28", cents: 49000, sessions: 9 }]);
    expect(billingPeriods(s, "per_session", rates, "Heure")).toHaveLength(9);
  });
  it("prepares the email for the hall, and the one that tells a change", () => {
    const m = bookingEmail("fr", { club: "Club A", place: "Hall", contact: "Marc", season: "2026-2027", slots: ["chaque mercredi"], sender: "Anne" });
    expect(m.subject).toBe("Demande de réservation : Hall 2026-2027");
    expect(m.body.split("\n")).toEqual(["Bonjour Marc,", "", "Le club Club A souhaite réserver Hall pour la saison 2026-2027, aux créneaux suivants :", "", "- chaque mercredi", "", "Pouvez-vous nous confirmer la réservation et nous indiquer sa référence ? Merci d'avance.", "", "Anne", "Club A"]);
    expect(bookingEmail("fr", { club: "C", place: "H", contact: null, season: null, slots: [], sender: "A" }).body.startsWith("Bonjour,")).toBe(true);
    expect(changeEmail("en", { club: "C", place: "H", contact: "Marc", before: "x", after: null, sender: "A" }).body).toContain("The session of x is cancelled");
  });
  it("shows the gap between an invoice and the plan", () => {
    expect(invoiceGap(25000, 25000)).toEqual({ gap: 0, tone: "success" });
    expect(invoiceGap(25300, 25000).tone).toBe("warning");
    expect(invoiceGap(30000, 25000).tone).toBe("danger");
  });
  it("accepts the commands, and refuses an expense without a label", () => {
    expect(bookingCommand.parse({ action: "status", id: "0b6d3d1e-3c4f-4d58-9a5e-2f7d1c9e8b01", status: "requested" })).toMatchObject({ status: "requested" });
    expect(() => bookingCommand.parse({ action: "expense", invoiceId: "0b6d3d1e-3c4f-4d58-9a5e-2f7d1c9e8b01", occurredOn: "2026-11-02", label: "" })).toThrow();
  });
  it("speaks three languages", () => {
    for (const copy of [bookingWords, venueBookingsCopy] as Record<string, object>[]) {
      expect(keys(copy.nl).sort()).toEqual(keys(copy.fr).sort());
      expect(keys(copy.en).sort()).toEqual(keys(copy.fr).sort());
    }
  });
  it("adds without dropping anything; the home hall needs no booking", () => {
    const sql = readFileSync("db/migrations/0087_venue_bookings.sql", "utf8");
    expect(sql).toContain("UPDATE calendar_place SET booking_needed = false WHERE home OR category <> 'training'");
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
