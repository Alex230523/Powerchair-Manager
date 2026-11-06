import { z } from "zod";

/**
 * International, step 2 (05/11/2026): the rulebook of a federation as data.
 * What the application used to know as « the BPCF scale » (training
 * compensation per year and format, the file fee of an international
 * transfer, the caps, the fines offered) is read from the federation's
 * policy; without one, the BPCF 2025 scale applies. Pure parts, shared
 * with the screens.
 */
export const trainingFormats = ["academy", "elite", "elite_certified"] as const;
export type TrainingFormat = (typeof trainingFormats)[number];
export const fineKinds = ["late", "forfeit", "forfeit_day", "other"] as const;
export type FineKind = (typeof fineKinds)[number];

const cents = z.number().int().min(0).max(100000000);
const rates = z.object({ academy: cents, elite: cents, elite_certified: cents });
export const policySchema = z.object({
  /** Per year of training, in cents, for a national and for an international transfer. */
  trainingRates: z.object({ national: rates, international: rates }),
  /** Added once to an international transfer. */
  internationalFileFeeCents: cents,
  /** The compensation never exceeds these. */
  indemnityCaps: z.object({ national: cents, international: cents }),
  /** The amounts offered when a fine is given (« other » has none). */
  fineDefaults: z.object({ late: cents, forfeit: cents, forfeit_day: cents }),
});
export type Policy = z.infer<typeof policySchema>;

/** The BPCF 2025 scale, the policy of every federation that has not written its own. */
export const bpcfPolicy: Policy = {
  trainingRates: {
    national: { academy: 5000, elite: 12500, elite_certified: 25000 },
    international: { academy: 50000, elite: 75000, elite_certified: 100000 },
  },
  internationalFileFeeCents: 25000,
  indemnityCaps: { national: 50000, international: 300000 },
  fineDefaults: { late: 2500, forfeit: 5000, forfeit_day: 50000 },
};

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100000000 ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
function ratesOf(raw: unknown, base: Policy["trainingRates"]["national"]) {
  const r = obj(raw);
  return { academy: num(r.academy, base.academy), elite: num(r.elite, base.elite), elite_certified: num(r.elite_certified, base.elite_certified) };
}
/** A stored policy completed with the defaults (a key added later, or a bad value, reads the BPCF value). */
export function policyOf(raw: unknown): Policy {
  const p = obj(raw),
    rates = obj(p.trainingRates),
    caps = obj(p.indemnityCaps),
    fines = obj(p.fineDefaults);
  return {
    trainingRates: { national: ratesOf(rates.national, bpcfPolicy.trainingRates.national), international: ratesOf(rates.international, bpcfPolicy.trainingRates.international) },
    internationalFileFeeCents: num(p.internationalFileFeeCents, bpcfPolicy.internationalFileFeeCents),
    indemnityCaps: { national: num(caps.national, bpcfPolicy.indemnityCaps.national), international: num(caps.international, bpcfPolicy.indemnityCaps.international) },
    fineDefaults: { late: num(fines.late, bpcfPolicy.fineDefaults.late), forfeit: num(fines.forfeit, bpcfPolicy.fineDefaults.forfeit), forfeit_day: num(fines.forfeit_day, bpcfPolicy.fineDefaults.forfeit_day) },
  };
}

/**
 * The training compensation: years (one at least) times the rate of the
 * training club's format, capped; an international one adds the file fee.
 * No format known: nothing to suggest.
 */
export function trainingIndemnity(format: string | null | undefined, years: number, scope: "national" | "international" = "national", policy: Policy = bpcfPolicy) {
  if (!format || !(trainingFormats as readonly string[]).includes(format)) return null;
  const base = Math.max(1, Math.floor(years)) * policy.trainingRates[scope][format as TrainingFormat] + (scope === "international" ? policy.internationalFileFeeCents : 0);
  return Math.min(policy.indemnityCaps[scope], base);
}

/** The amount offered for a fine of this kind, null for « other ». */
export function fineDefault(policy: Policy, kind: FineKind): number | null {
  return kind === "other" ? null : policy.fineDefaults[kind];
}

/** The certificate number of an international transfer accepted by a federation: year and sequence. */
export function certificateNumber(year: number, sequence: number) {
  return `CIT-${year}-${String(sequence).padStart(4, "0")}`;
}
