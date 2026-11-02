/**
 * B8: which gifts open a tax receipt and the yearly checks before the
 * Belcotax-on-Web filing. Only a gift without anything in return counts:
 * never a membership fee, sponsoring, a purchase (supper, sale) or a gift in
 * kind. Pure.
 */
export const natures = ["gift", "in_kind", "purchase", "sponsor", "dues"] as const;
export type Nature = (typeof natures)[number];
export const counts = (nature: string) => nature === "gift";

export type GiftRow = { donor_id: string; received_on: string; amount_cents: number; nature: string; cancelled_at: string | Date | null };
/** Per donor, the gifts of a calendar year that count. */
export function yearTotals(gifts: GiftRow[], year: number) {
  const out = new Map<string, number>();
  for (const g of gifts)
    if (!g.cancelled_at && counts(g.nature) && Number(g.received_on.slice(0, 4)) === year) out.set(g.donor_id, (out.get(g.donor_id) ?? 0) + g.amount_cents);
  return out;
}

export type DonorRow = { id: string; kind: "person" | "company"; name: string; postal_code: string; has_national: boolean; national_hash: string | null; company_number: string };
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
/**
 * The control report of a year: who will get a receipt, who is under the
 * threshold, who lacks the national number (or the company number), and
 * the probable duplicates (same number, or same name and postal code).
 */
export function controlReport(donors: DonorRow[], totals: Map<string, number>, threshold: number) {
  const given = donors.filter((d) => (totals.get(d.id) ?? 0) > 0);
  const eligible = given.filter((d) => (totals.get(d.id) ?? 0) >= threshold);
  const below = given.filter((d) => (totals.get(d.id) ?? 0) < threshold);
  const missing = eligible.filter((d) => (d.kind === "person" ? !d.has_national : !d.company_number));
  const groups = new Map<string, string[]>();
  for (const d of given) {
    const keys = [d.national_hash ? "n:" + d.national_hash : "", d.company_number ? "c:" + d.company_number : "", "p:" + fold(d.name) + "|" + d.postal_code.trim()];
    for (const k of keys.filter(Boolean)) groups.set(k, [...(groups.get(k) ?? []), d.id]);
  }
  const duplicates = [...new Set([...groups.values()].filter((ids) => ids.length > 1).map((ids) => [...new Set(ids)].sort().join(",")))]
    .map((s) => s.split(","))
    .filter((ids) => ids.length > 1);
  return { eligible: eligible.map((d) => d.id), below: below.map((d) => d.id), missing: missing.map((d) => d.id), duplicates };
}

/** The filing deadline for the gifts of a year: the end of February of the next year (to check each year). */
export function belcotaxDeadline(year: number) {
  const leap = (year + 1) % 4 === 0 && ((year + 1) % 100 !== 0 || (year + 1) % 400 === 0);
  return `${year + 1}-02-${leap ? 29 : 28}`;
}
/** Days from one ISO day to another. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);
}
/** The approval ends within this many days (or has ended): an alert on the page. */
export function approvalAlert(to: string | null, today: string, days = 90): "ended" | "ending" | null {
  if (!to) return null;
  const left = daysBetween(today, to);
  return left < 0 ? "ended" : left <= days ? "ending" : null;
}
/** Ten years after the last gift, the national number and the address go. */
export function purgeAfter(lastGift: string) {
  const rest = lastGift.slice(4) === "-02-29" ? "-03-01" : lastGift.slice(4);
  return `${Number(lastGift.slice(0, 4)) + 10}${rest}`;
}
