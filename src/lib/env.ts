import type { Pool } from "pg";

/** A database on this machine (or a container next to it) is reached without leaving it. */
export function localDatabaseHost(hostname: string) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "" || h === "localhost" || h === "127.0.0.1" || h === "::1" || !h.includes(".");
}

/**
 * Security (06/11/2026), cloud: a database elsewhere is only ever reached
 * encrypted. Neon gives its addresses with `sslmode=require`; an address
 * without it (or with `disable`, `allow`, `prefer`, which fall back to clear
 * text) would send the health data of minors and the passwords' checks over
 * the internet in the clear.
 */
export function encryptedDatabase(url: URL) {
  if (localDatabaseHost(url.hostname)) return true;
  return ["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode")?.toLowerCase() ?? "");
}

export function databaseUrl(env: Record<string, string | undefined>): string {
  const value = env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL URL required");
  if (!encryptedDatabase(url)) throw new Error("DATABASE_URL must use sslmode=require (or verify-full) for a database outside this machine");
  return value;
}

/**
 * The database cuts what the application left behind: a statement still
 * running after the client gave up (query_timeout), a transaction opened and
 * forgotten. Without it, a slow query or a lost connection keeps a slot of a
 * small free database busy until it restarts. Set on each new connection
 * rather than as a startup parameter, which a pooler (Neon's PgBouncer)
 * refuses.
 */
export const poolSettings = { connectionTimeoutMillis: 3000, query_timeout: 3000 } as const;
// 13/11/2026: « aujourd'hui » est le jour de Bruxelles (CURRENT_DATE, ::date), comme la base par défaut (migration 0148).
export const sessionGuards = "SET statement_timeout = 5000; SET idle_in_transaction_session_timeout = 120000; SET TIME ZONE 'Europe/Brussels'";
export function guardPool<P extends Pool>(pool: P): P {
  pool.on("connect", (client) => {
    client.query(sessionGuards).catch(() => undefined);
  });
  return pool;
}
