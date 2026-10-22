import { describe, it, expect } from "vitest";
import { keepRoles } from "../src/domains/access/presidency-schema";
import { presidencyCommand } from "../src/domains/access/presidency";
import { presidencyCopy } from "../src/components/presidency-copy";

function shape(o: unknown): unknown {
  return o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o;
}

/** Wave 17 (G1): the club president hands over the presidency. */
describe("wave 17, G1: presidency", () => {
  it("lets the outgoing president keep a member's place, a coach role, or nothing", () => {
    expect(keepRoles).toEqual(["member", "coach", "none"]);
    const base = { action: "handOver", userId: null, email: "nina@example.test", effectiveOn: null, keep: "coach" };
    expect(presidencyCommand.safeParse(base).success).toBe(true);
    expect(presidencyCommand.safeParse({ ...base, keep: "president" }).success).toBe(false);
    expect(presidencyCommand.safeParse({ ...base, effectiveOn: "01/11/2026" }).success).toBe(false);
    expect(presidencyCommand.safeParse({ action: "cancel", id: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
  it("has every text in the three languages, without long dashes", () => {
    expect(shape(presidencyCopy.nl)).toEqual(shape(presidencyCopy.fr));
    expect(shape(presidencyCopy.en)).toEqual(shape(presidencyCopy.fr));
    expect(JSON.stringify(presidencyCopy)).not.toMatch(/[–—]/);
  });
});
