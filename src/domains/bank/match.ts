/**
 * B1: what a bank line probably pays, for a human to confirm. Only an
 * exact structured communication with an amount within what is left is
 * reconciled by itself (see service.ts); everything else is a ranked
 * suggestion: the payer's name close to the person or their family, the
 * amount equal to what is left or to an instalment. Pure.
 */
export type Candidate = { id: string; person: string; family: string[]; remaining: number; installments: number[]; reference: string; references: string[] };
export type Suggestion = { id: string; score: number; reasons: ("reference" | "amount" | "name")[] };

const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !["les", "des", "van", "der", "den", "the", "mme", "mrs", "monsieur", "madame", "famille", "fam"].includes(w));

export function suggest(line: { amountCents: number; counterparty: string; communication: string; reference: string | null }, candidates: Candidate[], limit = 5): Suggestion[] {
  if (line.amountCents <= 0) return [];
  const payer = new Set([...words(line.counterparty), ...words(line.communication)]);
  return candidates
    .filter((c) => c.remaining > 0)
    .map((c) => {
      const reasons: Suggestion["reasons"] = [];
      let score = 0;
      if (line.reference && (c.reference === line.reference || c.references.includes(line.reference))) {
        score += 100;
        reasons.push("reference");
      }
      if (line.amountCents === c.remaining || c.installments.includes(line.amountCents)) {
        score += 40;
        reasons.push("amount");
      }
      const shared = [c.person, ...c.family].flatMap(words).filter((w) => payer.has(w));
      if (shared.length) {
        score += Math.min(60, 30 * new Set(shared).size);
        reasons.push("name");
      }
      return { id: c.id, score, reasons };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Splits an amount across receivables in order, never more than each one's rest; what is left over is a credit. */
export function spread(amount: number, rests: { id: string; remaining: number }[]) {
  const parts: { id: string; amount: number }[] = [];
  let left = amount;
  for (const r of rests) {
    if (left <= 0) break;
    const take = Math.min(left, r.remaining);
    if (take > 0) parts.push({ id: r.id, amount: take });
    left -= take;
  }
  return { parts, credit: Math.max(0, left) };
}
