/**
 * Offline trip books, kept in this browser only and encrypted with a code the
 * person chooses (PBKDF2 then AES-GCM). The server never sees the code. A book
 * is erased after its trip, after ten wrong codes, and at sign-out.
 */
export const BOOKS_DB = "pcm-offline-books";
const STORE = "books";
const ITERATIONS = 310000;
export const MAX_ATTEMPTS = 10;

export type BookMeta = {
  tripId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  expiresAt: string;
  savedAt: string;
  attempts: number;
};
type Row = BookMeta & { salt: string; iv: string; data: string; iterations: number };

function b64(b: ArrayBuffer | Uint8Array) {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  // Chunks keep large books under the argument limit of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("NO_STORAGE"));
    const r = indexedDB.open(BOOKS_DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE))
        r.result.createObjectStore(STORE, { keyPath: "tripId" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function key(code: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(code),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
/** Two days after the return, the book is no longer kept. */
export function expiryOf(endsOn: string) {
  return new Date(Date.parse(endsOn + "T23:59:59Z") + 2 * 86400000).toISOString();
}

export async function storeBook(
  pack: { trip: { id: string; title: string; starts_on: string; ends_on: string } },
  code: string,
) {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    await key(code, salt, ITERATIONS),
    new TextEncoder().encode(JSON.stringify(pack)),
  );
  const row: Row = {
    tripId: pack.trip.id,
    title: pack.trip.title,
    startsOn: pack.trip.starts_on,
    endsOn: pack.trip.ends_on,
    expiresAt: expiryOf(pack.trip.ends_on),
    savedAt: new Date().toISOString(),
    attempts: 0,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(sealed),
    iterations: ITERATIONS,
  };
  await run("readwrite", (s) => s.put(row));
}

/** Books on this device, without their content. Expired ones are erased first. */
export async function listBooks(): Promise<BookMeta[]> {
  const rows = (await run("readonly", (s) => s.getAll())) as Row[];
  const now = Date.now();
  for (const r of rows.filter((r) => Date.parse(r.expiresAt) <= now))
    await removeBook(r.tripId);
  return rows
    .filter((r) => Date.parse(r.expiresAt) > now)
    .map((r) => ({
      tripId: r.tripId,
      title: r.title,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      expiresAt: r.expiresAt,
      savedAt: r.savedAt,
      attempts: r.attempts,
    }));
}

export type OpenResult<T> =
  | { ok: true; pack: T }
  | { ok: false; reason: "wrong"; left: number }
  | { ok: false; reason: "erased" | "missing" | "expired" };
/**
 * The attempt is counted before trying: closing the tab during the slow key
 * derivation does not give a free try. The tenth wrong code erases the book.
 */
export async function openBook<T>(tripId: string, code: string): Promise<OpenResult<T>> {
  const row = (await run("readonly", (s) => s.get(tripId))) as Row | undefined;
  if (!row) return { ok: false, reason: "missing" };
  if (Date.parse(row.expiresAt) <= Date.now()) {
    await removeBook(tripId);
    return { ok: false, reason: "expired" };
  }
  const attempts = row.attempts + 1;
  if (attempts > MAX_ATTEMPTS) {
    await removeBook(tripId);
    return { ok: false, reason: "erased" };
  }
  await run("readwrite", (s) => s.put({ ...row, attempts }));
  try {
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(row.iv) as BufferSource },
      await key(code, unb64(row.salt), row.iterations),
      unb64(row.data) as BufferSource,
    );
    await run("readwrite", (s) => s.put({ ...row, attempts: 0 }));
    return { ok: true, pack: JSON.parse(new TextDecoder().decode(clear)) as T };
  } catch {
    if (attempts >= MAX_ATTEMPTS) {
      await removeBook(tripId);
      return { ok: false, reason: "erased" };
    }
    return { ok: false, reason: "wrong", left: MAX_ATTEMPTS - attempts };
  }
}
export async function removeBook(tripId: string) {
  await run("readwrite", (s) => s.delete(tripId));
}
/** At sign-out: nothing of the club stays on a shared device. */
export function clearBooks() {
  try {
    indexedDB.deleteDatabase(BOOKS_DB);
  } catch {
    /* No storage: nothing to clear. */
  }
}
