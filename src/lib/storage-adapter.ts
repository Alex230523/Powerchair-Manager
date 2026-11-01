/**
 * B2: where the bytes of a file live. Today PostgreSQL holds them in the
 * row itself (no cost, saved with the database); an external store (an S3
 * compatible bucket) can come later behind the same two calls without
 * touching the modules. The documents go through it; the other modules
 * follow the same pattern when they move.
 */
export interface StorageAdapter {
  readonly kind: string;
  /** Keeps the (already encrypted) content; returns what the row stores. */
  put(key: string, sealed: string): Promise<string>;
  /** From what the row stores back to the encrypted content. */
  get(key: string, stored: string): Promise<string>;
}

/** The content stays in the row: nothing to put elsewhere, nothing to fetch. */
export const postgresStorage: StorageAdapter = {
  kind: "postgres",
  async put(_key, sealed) {
    return sealed;
  },
  async get(_key, stored) {
    return stored;
  },
};

/** STORAGE_DRIVER chooses the store; only « postgres » exists today, anything else stops the start. */
export function storageAdapter(env: Record<string, string | undefined> = process.env): StorageAdapter {
  const driver = (env.STORAGE_DRIVER ?? "postgres").trim();
  if (driver === "postgres") return postgresStorage;
  throw new Error("STORAGE_DRIVER_UNKNOWN");
}
