import { z } from "zod";

/**
 * 13.3: keyset pagination. A page ends on the sort values of its last row
 * (for instance a date and an id); the next page starts strictly after them,
 * so rows added or removed meanwhile never shift a page as an OFFSET would.
 * The cursor is opaque to the browser: base64url of the JSON values. No
 * server import here: schemas that use cursorSchema are shared with pages.
 */
export const PAGE_SIZE = 100;
export type Page<T> = { items: T[]; next: string | null };

export function encodeCursor(values: (string | number | null)[]) {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}
export function decodeCursor(cursor: string | null | undefined, length: number): (string | number | null)[] | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(v) && v.length === length && v.every((x) => x === null || typeof x === "string" || typeof x === "number")) return v;
  } catch {
    // An altered cursor: treated as invalid below.
  }
  // An invalid input (400 INVALID_INPUT, see failure() in lib/http).
  throw new SyntaxError("CURSOR_INVALID");
}
/** The query asks for `size + 1` rows; the extra one only says a next page exists. */
export function pageOf<T>(rows: T[], size: number, key: (row: T) => (string | number | null)[]): Page<T> {
  const items = rows.slice(0, size);
  return { items, next: rows.length > size && items.length ? encodeCursor(key(items[items.length - 1])) : null };
}
export const cursorSchema = z.string().max(400).regex(/^[A-Za-z0-9_-]*$/).optional();
