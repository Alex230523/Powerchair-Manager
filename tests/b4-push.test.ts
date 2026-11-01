import { describe, it, expect } from "vitest";
import { createECDH, createPublicKey, verify } from "node:crypto";
import { encryptPayload, generateVapidKeys, vapidAuthorization, vapidFromEnv } from "../src/domains/notifications/webpush";
import { firstName, groupPayload, topicOfKind, urgentChange } from "../src/domains/notifications/push-queue";
import { knownService, pushCommand } from "../src/domains/notifications/push";
import { pushCopy } from "../src/components/push-copy";

/** B4: the Web Push encryption and signature, topics, urgency, grouping and texts. */
describe("B4 push notifications", () => {
  it("encrypts exactly like the RFC 8291 example", () => {
    const as = createECDH("prime256v1");
    as.setPrivateKey(Buffer.from("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "base64url"));
    const body = encryptPayload(
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      "When I grow up, I want to be a watermelon",
      Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url"),
      as,
    );
    expect(body.toString("base64url")).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });
  it("signs a VAPID token the push service can check", () => {
    const keys = { ...generateVapidKeys(), subject: "mailto:contact@example.org" };
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, Date.UTC(2026, 10, 1));
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: Date.UTC(2026, 10, 1) / 1000 + 43200, sub: "mailto:contact@example.org" });
    const pub = Buffer.from(keys.publicKey, "base64url");
    const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
    expect(vapidFromEnv({})).toBeNull();
    expect(() => vapidFromEnv({ PFM_VAPID_PUBLIC_KEY: "abc", PFM_VAPID_PRIVATE_KEY: keys.privateKey, PFM_VAPID_SUBJECT: "mailto:a@b.be" })).toThrow("VAPID_KEYS_INVALID");
  });
  it("sorts kinds into phone topics, never sign-in or tax mails", () => {
    expect(topicOfKind("dues_issued")).toBe("dues");
    expect(topicOfKind("document_reminder")).toBe("document");
    expect(topicOfKind("match_update")).toBe("change");
    expect(topicOfKind("automation")).toBe("message");
    for (const k of ["auth_reset", "weekly_digest", "tax_receipt", "club_newsletter", "attendance_update", "calendar_update"]) expect(topicOfKind(k)).toBeNull();
  });
  it("calls urgent a change within 48 hours, and groups close notifications", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(urgentChange("2026-11-02T18:00:00Z", null, now)).toBe(true);
    expect(urgentChange("2026-11-05T18:00:00Z", null, now)).toBe(false);
    expect(urgentChange("2026-11-05T18:00:00Z", "2026-11-02T09:00:00Z", now)).toBe(true);
    const one = { title: "Club", body: "a", url: "/fr", tag: "x" };
    expect(groupPayload([one], "fr", "Club")).toBe(one);
    expect(groupPayload([one, { ...one, urgent: true }, one], "nl", "Club")).toEqual({ title: "Club", body: "3 nieuwe meldingen van de club.", url: "/nl/settings/notifications", tag: "pfm-group", urgent: true });
    expect(firstName("  Ana Peeters ")).toBe("Ana");
  });
  it("only accepts devices of the known push services", () => {
    expect(knownService("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(knownService("https://web.push.apple.com/abc")).toBe(true);
    expect(knownService("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(knownService("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(knownService("http://fcm.googleapis.com/x")).toBe(false);
    const subscription = { endpoint: "https://intranet.local/push", p256dh: "B".repeat(87), auth: "a".repeat(22) };
    expect(pushCommand.safeParse({ action: "subscribe", subscription }).success).toBe(false);
    expect(pushCommand.safeParse({ action: "subscribe", subscription: { ...subscription, endpoint: "https://fcm.googleapis.com/fcm/send/1" } }).success).toBe(true);
  });
  it("has every text in three languages, without sensitive placeholders or the old vocabulary", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(pushCopy.nl)).toEqual(keys(pushCopy.fr));
    expect(keys(pushCopy.en)).toEqual(keys(pushCopy.fr));
    expect(JSON.stringify(pushCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    for (const l of ["fr", "nl", "en"] as const) for (const m of Object.values(pushCopy[l].messages)) expect(m).not.toMatch(/\{(amount|reason|diagnosis|name)\}/);
  });
});
