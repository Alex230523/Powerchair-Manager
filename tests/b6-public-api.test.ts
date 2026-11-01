import { describe, it, expect } from "vitest";
import { acceptableUrl, privateAddress, signature, verifySignature } from "../src/domains/integrations/webhooks";
import { keyHash, publicName, slugOf } from "../src/domains/integrations/public";
import { openApi } from "../src/domains/integrations/api";
import { publicCopy } from "../src/components/public-copy";
import { widgetHeaders, pageHeaders } from "../src/lib/security-headers";

/** B6: names on public pages, addresses, webhook signatures, the API description and the texts. */
describe("B6 public pages, API and webhooks", () => {
  it("shows an adult's name, a minor's only with consent, and nobody without a birth date", () => {
    expect(publicName("Ana Peeters", "2012-03-01", false, "2026-11-01")).toBeNull();
    expect(publicName("Ana Peeters", "2012-03-01", true, "2026-11-01")).toBe("Ana Peeters");
    expect(publicName("Zoé Martin", "1995-05-05", false, "2026-11-01")).toBe("Zoé Martin");
    expect(publicName("Sans Date", null, false, "2026-11-01")).toBeNull();
  });
  it("proposes a clean address from the club's name", () => {
    expect(slugOf("Tigerstorm Powerchair Club")).toBe("tigerstorm-powerchair-club");
    expect(slugOf("Les Écureuils de Liège !")).toBe("les-ecureuils-de-liege");
  });
  it("signs webhooks so the receiver can check them, and refuses a stale or altered one", () => {
    const body = JSON.stringify({ id: "d1", event: "match.validated" });
    const sig = signature("whsec_test", "1793000000", body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_test", "1793000000", body, sig, 1793000100 * 1000)).toBe(true);
    expect(verifySignature("whsec_test", "1793000000", body + " ", sig, 1793000100 * 1000)).toBe(false);
    expect(verifySignature("whsec_other", "1793000000", body, sig, 1793000100 * 1000)).toBe(false);
    expect(verifySignature("whsec_test", "1793000000", body, sig, 1793009999 * 1000)).toBe(false);
  });
  it("calls only public HTTPS addresses", () => {
    expect(acceptableUrl("https://hooks.example.org/pfm")).toBe(true);
    for (const bad of ["http://hooks.example.org/x", "https://127.0.0.1/x", "https://localhost/x", "https://nas.local/x", "https://user:pw@example.org/x", "https://[::1]/x", "ftp://example.org"]) expect(acceptableUrl(bad)).toBe(false);
    for (const ip of ["10.0.0.1", "172.16.5.4", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(privateAddress(ip)).toBe(true);
    for (const ip of ["93.184.216.34", "2606:4700::1111"]) expect(privateAddress(ip)).toBe(false);
  });
  it("keeps only the hash of a key and describes the API", () => {
    expect(keyHash("pfm_abcdefgh_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(keyHash("pfm_abcdefgh_x")).not.toContain("abcdefgh");
    const spec = openApi("https://app.example.org");
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toEqual(["/teams", "/matches", "/tournaments", "/events"]);
    expect(spec.servers[0].url).toBe("https://app.example.org/api/v1");
  });
  it("lets widgets be embedded, never the other pages", () => {
    expect(widgetHeaders.find((h) => h.key === "Content-Security-Policy")?.value).toContain("frame-ancestors *");
    expect(pageHeaders.find((h) => h.key === "Content-Security-Policy")?.value).toContain("frame-ancestors 'none'");
  });
  it("has every text in French, Dutch and English, with the invitation vocabulary", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(publicCopy.nl)).toEqual(keys(publicCopy.fr));
    expect(keys(publicCopy.en)).toEqual(keys(publicCopy.fr));
    expect(JSON.stringify(publicCopy)).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
  });
});
