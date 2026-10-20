import { createHash } from "node:crypto";
/** Stable key of an address for unsubscribes: the address itself is not stored. */
export function emailHash(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
