import type { Pool, PoolClient } from "pg";
import { AccessError } from "../access/service";
import { fits, storageSummary } from "./summary";

type Db = Pool | PoolClient;

/** The bytes an organisation stores, by category (the storage_usage view), and its quota. */
export async function storageOf(db: Db, org: string) {
  const quota = Number(
    (await db.query("SELECT storage_quota_bytes FROM organization WHERE id=$1", [org])).rows[0]?.storage_quota_bytes ?? 0,
  );
  const rows = (await db.query("SELECT category,bytes,files FROM storage_usage WHERE organization_id=$1", [org])).rows as {
    category: string;
    bytes: string;
    files: number;
  }[];
  return storageSummary(rows, quota);
}

/**
 * Refuses a new file when the club's storage is full (wave 16, S1): called by
 * every upload before it writes. `adding` is the size of the new file, `replacing`
 * the size of the one it replaces (a logo, a diagram), so a smaller file
 * still goes through.
 */
export async function ensureStorage(db: Db, org: string, adding: number, replacing = 0) {
  const s = await storageOf(db, org);
  if (!fits(s.used - replacing, s.quota, adding)) throw new AccessError("STORAGE_FULL", 413);
}

/** Where a file is shown in the app, for « Voir les plus gros fichiers ». */
export function originHref(origin: string, ref: string) {
  switch (origin) {
    case "document":
    case "signature":
      return "/documents";
    case "registration":
      return "/registrations";
    case "receipt":
      return "/funding/operations";
    case "statement":
      return "/funding/statements";
    case "licence":
    case "training":
      return `/coaches/${ref}`;
    case "partner":
      return `/funding/grants-sponsors?vue=sponsoring&partner=${ref}`;
    case "grant":
      return `/funding/grants-sponsors?vue=subsides&grant=${ref}`;
    case "logo":
      return `/settings/club`;
    case "trophy":
      return `/tournaments/${ref}`;
    case "exercise":
      return `/exercises/${ref}`;
    case "match_sheet":
      return `/matches/${ref}`;
    case "transfer_proof":
      return "/transfers";
    case "award":
      return `/statistics/club#hall-of-fame`;
    default:
      return "/statistics/club";
  }
}

/** The 20 largest files of the organisation, with the page they come from. */
export async function largestFiles(db: Db, org: string) {
  const rows = (
    await db.query(
      "SELECT category,id,name,size_bytes::bigint AS bytes,created_at,origin,ref FROM storage_file WHERE organization_id=$1 ORDER BY size_bytes DESC,created_at DESC LIMIT 20",
      [org],
    )
  ).rows as { category: string; id: string; name: string; bytes: string; created_at: Date; origin: string; ref: string }[];
  return rows.map((r) => ({
    id: `${r.origin}:${r.id}`,
    category: r.category,
    name: r.name,
    bytes: Number(r.bytes),
    createdAt: r.created_at,
    href: originHref(r.origin, r.ref),
  }));
}
