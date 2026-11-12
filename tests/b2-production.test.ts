import { describe, it, expect } from "vitest";
import { allowedNow, mailLimits } from "../src/domains/jobs/mail-budget";
import { lateJob } from "../src/domains/jobs/health";
import { cronAuthorized } from "../src/domains/jobs/secret";
import { jobNames, isJob } from "../src/domains/jobs/registry";
import { cleanFields } from "../src/lib/log";
import { fitWithin } from "../src/lib/image-compress";
import { postgresStorage, storageAdapter } from "../src/lib/storage-adapter";
import { pageHeaders, widgetHeaders } from "../src/lib/security-headers";

/** B2: production at no cost, the pure parts. */
describe("B2 production", () => {
  it("knows its background tasks", () => {
    expect(jobNames).toEqual(["mail", "documents", "attendance", "platform", "reminders", "security", "watchdog"]);
    expect(isJob("mail")).toBe(true);
    expect(isJob("toString")).toBe(false);
  });
  it("keeps to the day's mail budget", () => {
    expect(mailLimits({})).toEqual({ daily: Number.POSITIVE_INFINITY, batch: 50 });
    expect(mailLimits({ MAIL_DAILY_LIMIT: "300", MAIL_BATCH: "20" })).toEqual({ daily: 300, batch: 20 });
    expect(allowedNow({ daily: 300, batch: 50 }, 290)).toBe(10);
    expect(allowedNow({ daily: 300, batch: 50 }, 300)).toBe(0);
    expect(allowedNow({ daily: 300, batch: 50 }, 310)).toBe(0);
    expect(allowedNow({ daily: Number.POSITIVE_INFINITY, batch: 50 }, 9999)).toBe(50);
  });
  it("calls a task late after two missed cycles", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(lateJob(5, new Date("2026-10-22T11:51:00Z"), now, true)).toBe(false);
    expect(lateJob(5, new Date("2026-10-22T11:49:00Z"), now, true)).toBe(true);
    expect(lateJob(60, null, now, false)).toBe(false);
    expect(lateJob(60, null, now, true)).toBe(true);
  });
  it("opens the cron routes only with a long secret", () => {
    const secret = "s".repeat(40);
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorized(secret, secret)).toBe(false);
    expect(cronAuthorized("Bearer short", "short")).toBe(false);
    expect(cronAuthorized(`Bearer ${secret}`, undefined)).toBe(false);
  });
  it("writes logs without personal data", () => {
    expect(cleanFields({ job: "mail", sent: 3, email: "a@b.be", name: "Anne", note: "to a@b.be", ms: 12 })).toEqual({ job: "mail", sent: 3, ms: 12 });
  });
  it("draws a photo at 2000 px at most, the ratio kept", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1200, 3600)).toEqual({ width: 667, height: 2000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("keeps files in PostgreSQL unless another store is chosen", async () => {
    expect(storageAdapter({}).kind).toBe("postgres");
    expect(await postgresStorage.get("k", await postgresStorage.put("k", "sealed"))).toBe("sealed");
    expect(() => storageAdapter({ STORAGE_DRIVER: "s3" })).toThrow("STORAGE_DRIVER_UNKNOWN");
  });
  it("sends HSTS and a CSP that forbids framing, widgets aside", () => {
    const value = (list: readonly { key: string; value: string }[], key: string) => list.find((h) => h.key === key)?.value ?? "";
    expect(value(pageHeaders, "Strict-Transport-Security")).toContain("max-age=63072000");
    expect(value(pageHeaders, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(value(pageHeaders, "X-Frame-Options")).toBe("DENY");
    expect(value(widgetHeaders, "Content-Security-Policy")).toContain("frame-ancestors *");
    expect(value(widgetHeaders, "X-Frame-Options")).toBe("");
  });
});
