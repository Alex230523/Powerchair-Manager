/** 40: the blocks of a person's overview, and what blocks the person. Pure. */
export type OverviewBlocks = {
  mandates?: { role: string; valid_from: string | null; valid_until: string | null }[];
  tasks?: { open: number; late: number };
  teams?: { id: string; name: string; role: string }[];
  documents?: { missing: number; review: number; expired: number };
  attendance?: { invited: number; present: number; absent: number };
  next?: { id: string; title: string; starts_at: string; response: string }[];
  licence?: string | null;
  chairs?: { id: string; name: string; status: string }[];
  dues?: { due: number; paid: number; late: number; oldest: string | null };
  authorizations?: { kind: string; status: string }[];
  trainings?: { status: string; title: string; completed_on: string | null }[];
  permit?: { valid_until: string | null; categories: string[] } | null;
  guardians?: { id: string; full_name: string }[];
  children?: { id: string; full_name: string }[];
  health?: { support: boolean; safety: boolean };
};
export type Blocking =
  | { key: "licence" }
  | { key: "duesLate"; months: number; cents: number }
  | { key: "documentsMissing"; n: number }
  | { key: "documentsExpired"; n: number }
  | { key: "chairBroken"; chair: string }
  | { key: "authorization"; n: number }
  | { key: "permitExpired" };
const monthsBetween = (from: string, to: string) => Math.max(1, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
/** « Ce qui bloque »: only what the reader may see is in the blocks, so only that can block here. */
export function blockingOf(b: OverviewBlocks, today: string): Blocking[] {
  const out: Blocking[] = [];
  const player = !!b.teams?.some((t) => t.role === "player");
  if (b.licence !== undefined && player && b.licence !== "active") out.push({ key: "licence" });
  if (b.dues && b.dues.late > 0) out.push({ key: "duesLate", months: b.dues.oldest ? monthsBetween(b.dues.oldest, today) : 1, cents: b.dues.late });
  if (b.documents?.missing) out.push({ key: "documentsMissing", n: b.documents.missing });
  if (b.documents?.expired) out.push({ key: "documentsExpired", n: b.documents.expired });
  for (const c of b.chairs ?? []) if (c.status === "maintenance" || c.status === "out_of_service") out.push({ key: "chairBroken", chair: c.name });
  const waiting = (b.authorizations ?? []).filter((a) => a.status === "requested").length;
  if (waiting) out.push({ key: "authorization", n: waiting });
  if (b.permit?.valid_until && b.permit.valid_until < today) out.push({ key: "permitExpired" });
  return out;
}
