import { it, expect } from "vitest";
import { templateText, validFile } from "../src/domains/documents/schema";
it("limits document templates to literal approved variables without execution", () => {
  expect(
    templateText("Nom {name} · {date}", {
      name: "<script>",
      date: "2026-10-19",
    }),
  ).toBe("Nom <script> · 2026-10-19");
  expect(() => templateText("{secret}", {})).toThrow();
  expect(() => templateText("Malformed {name", {})).toThrow();
});
it("requires allowed MIME, matching bytes and size for document uploads", () => {
  expect(validFile("text/html", Buffer.from("%PDF-1.7"))).toBe(false);
  expect(validFile("application/pdf", Buffer.from("invalid"))).toBe(false);
  expect(validFile("application/pdf", Buffer.from("%PDF-1.7"))).toBe(true);
  expect(validFile("image/jpeg", Buffer.alloc(2097153))).toBe(false);
});
