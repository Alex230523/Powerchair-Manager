/**
 * The club's storage (wave 16, S1): what each category takes on the quota.
 * Pure code: the page draws the bar from it, the unit tests check it.
 */
export const storageCategories = ["documents", "registrations", "finance", "funding", "photos", "other"] as const;
export type StorageCategory = (typeof storageCategories)[number];
/** From 80 %, the card warns; from 100 %, new uploads are refused. */
export const storageWarnAt = 80;

export function storageSummary(rows: { category: string; bytes: number | string; files: number }[], quota: number) {
  const by = new Map(rows.map((r) => [r.category, { bytes: Number(r.bytes), files: r.files }]));
  const categories = storageCategories.map((key) => ({ key, bytes: by.get(key)?.bytes ?? 0, files: by.get(key)?.files ?? 0 }));
  const used = categories.reduce((n, c) => n + c.bytes, 0);
  const percent = quota > 0 ? Math.round((used / quota) * 100) : 100;
  return {
    used,
    quota,
    free: Math.max(quota - used, 0),
    percent,
    level: used >= quota ? ("full" as const) : percent >= storageWarnAt ? ("warning" as const) : ("ok" as const),
    // Each category's share of the bar, the free part last; never more than the whole bar.
    segments: [...categories.map((c) => ({ key: c.key as StorageCategory | "free", share: quota > 0 ? Math.min(c.bytes / Math.max(quota, used), 1) : 0 })), { key: "free" as const, share: Math.max(quota - used, 0) / Math.max(quota, used, 1) }],
    categories,
  };
}
/** Whether a new file of `adding` bytes still fits. */
export function fits(used: number, quota: number, adding: number) {
  return used + adding <= quota;
}

/** « 312 Mo », « 1 Go », « 850 ko »: binary units, French or international symbols. */
export function formatBytes(n: number, locale: "fr" | "nl" | "en") {
  const units = locale === "fr" ? ["o", "ko", "Mo", "Go", "To"] : ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, n),
    i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 0 : 1;
  const text = new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { maximumFractionDigits: digits }).format(v);
  return `${text} ${units[i]}`;
}
