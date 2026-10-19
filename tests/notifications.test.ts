import { describe, it, expect } from "vitest";
import {
  builtin,
  editableKinds,
  validateTemplate,
  renderTemplate,
} from "../src/domains/notifications/templates";
import { seal, unseal } from "../src/domains/notifications/crypto";
import { createTransport } from "../src/domains/notifications/transport";
describe("notification content and secret boundaries", () => {
  it("validates built-in FR/NL templates and rejects unknown variables and header injection", () => {
    for (const kind of editableKinds)
      for (const locale of ["fr", "nl", "en"] as const)
        expect(() =>
          validateTemplate(kind, builtin[kind][locale]),
        ).not.toThrow();
    expect(() =>
      validateTemplate("test_self", {
        subject: "One\r\nBcc: other@example.test",
        body: "Valid body {url}",
      }),
    ).toThrow();
    expect(() =>
      validateTemplate("test_self", {
        subject: "Subject",
        body: "Unknown {medical} {url}",
      }),
    ).toThrow();
  });
  it("escapes HTML rather than executing template or user content", () => {
    expect(
      renderTemplate(
        { subject: "Title", body: "<img src=x> {name} {url}" },
        {
          name: "<script>alert(1)</script>",
          organization: "Club",
          url: "https://example.test",
        },
      ).html,
    ).not.toContain("<script>");
  });
  it("authenticates encrypted content and binds it to its dispatch key", () => {
    const original = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "test-only-encryption-secret-at-least-32";
    try {
      const value = seal({ token: "private-token" }, "key-a");
      expect(value).not.toContain("private-token");
      expect(unseal(value, "key-a")).toEqual({ token: "private-token" });
      expect(() => unseal(value, "key-b")).toThrow();
    } finally {
      if (original === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = original;
    }
  });
  it("requires explicit external SMTP authorization and retains a secure transport configuration", () => {
    expect(() =>
      createTransport({
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "smtp.example.org",
        SMTP_FROM: "pfm@example.org",
      }),
    ).toThrow("EXTERNAL_DELIVERY_REQUIRES_EXPLICIT_FLAG");
    expect(() => createTransport({ NODE_ENV: "production" })).toThrow(
      "MAIL_TRANSPORT_NOT_CONFIGURED",
    );
  });
});
