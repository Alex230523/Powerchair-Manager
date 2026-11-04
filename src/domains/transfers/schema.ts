import { z } from "zod";

/** Wave 17 (J3): the transfer market. Pure parts, shared with the screens. */
export const provinces = ["antwerp", "flemish_brabant", "walloon_brabant", "west_flanders", "east_flanders", "hainaut", "liege", "limburg", "luxembourg", "namur", "brussels"] as const;
export type Province = (typeof provinces)[number];
export const offerStatuses = ["sent", "discussing", "accepted", "refused", "withdrawn", "validated"] as const;
export type OfferStatus = (typeof offerStatuses)[number];

const id = z.uuid();
const text = (n: number) => z.string().trim().max(n);
const window = z.object({ from: z.iso.date(), to: z.iso.date() }).refine((w) => w.from <= w.to, { message: "WINDOW" });
export const rulesSchema = z.object({
  windows: z.array(window).max(12),
  amountsAllowed: z.boolean(),
  amountCapCents: z.number().int().min(0).max(100000000).nullable(),
  maxPerClubSeason: z.number().int().min(0).max(100).nullable(),
  federationValidation: z.boolean(),
  rulesText: text(5000),
  /** BPCF 1/12: a transfer every party agrees to is possible all season long. */
  consentedAnytime: z.boolean().default(false),
  /** BPCF 1/12: at most this many transfers from one club to another per season. */
  maxPerPairSeason: z.number().int().min(0).max(100).nullable().default(null),
});
export type Rules = z.infer<typeof rulesSchema>;
export const defaultRules: Rules = { windows: [], amountsAllowed: false, amountCapCents: null, maxPerClubSeason: null, federationValidation: true, rulesText: "", consentedAnytime: false, maxPerPairSeason: null };

/**
 * 04/11/2026: the BPCF rules (règlement 2025, art. 1/12) for the season of
 * « today »: summer period 1 July to 31 August, winter break 20 December to
 * 10 January; consented transfers all season; training indemnities up to
 * 500 € per player (national); one transfer per season from one club to
 * another; validated by the BPCF commission.
 */
export function bpcfRules(today: string, rulesText: string): Rules {
  const [y, m] = today.split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return {
    windows: [
      { from: `${start}-07-01`, to: `${start}-08-31` },
      { from: `${start}-12-20`, to: `${start + 1}-01-10` },
    ],
    amountsAllowed: true,
    amountCapCents: 50000,
    maxPerClubSeason: null,
    federationValidation: true,
    rulesText,
    consentedAnytime: true,
    maxPerPairSeason: 1,
  };
}

export const transferCommand = z.discriminatedUnion("action", [
  /* The player (adult) or a parent (minor). */
  z.object({ action: z.literal("visibility"), personId: id, visible: z.boolean() }),
  z.object({ action: z.literal("consent"), id, consent: z.enum(["given", "refused"]) }),
  /* The clubs. */
  z.object({
    action: z.literal("request"),
    personId: id,
    season: z.string().regex(/^[0-9]{4}-[0-9]{2}$/),
    amountCents: z.number().int().min(0).max(100000000).nullable(),
    message: text(2000),
  }),
  z.object({ action: z.literal("withdraw"), id }),
  z.object({ action: z.literal("answer"), id, decision: z.enum(["accepted", "refused"]), note: text(1000) }),
  z.object({ action: z.literal("message"), id, body: z.string().trim().min(1).max(5000) }),
  /* The federation. */
  z.object({ action: z.literal("validate"), id, decision: z.enum(["validated", "refused"]), note: text(1000) }),
  z.object({ action: z.literal("rules"), rules: rulesSchema }),
  z.object({ action: z.literal("province"), clubId: id, province: z.union([z.enum(provinces), z.literal("")]) }),
]);
export type TransferCommand = z.infer<typeof transferCommand>;

/** The rules as stored, completed with the defaults. */
export function rulesOf(row: Record<string, unknown> | undefined): Rules {
  if (!row) return defaultRules;
  return {
    windows: (row.windows as Rules["windows"]) ?? [],
    amountsAllowed: !!row.amounts_allowed,
    amountCapCents: (row.amount_cap_cents as number | null) ?? null,
    maxPerClubSeason: (row.max_per_club_season as number | null) ?? null,
    federationValidation: row.federation_validation !== false,
    rulesText: (row.rules_text as string) ?? "",
    consentedAnytime: row.consented_anytime === true,
    maxPerPairSeason: (row.max_per_pair_season as number | null) ?? null,
  };
}
/** Open all year without windows; otherwise only within one of them (ends included). */
export function marketOpen(rules: Pick<Rules, "windows">, today: string) {
  return !rules.windows.length || rules.windows.some((w) => w.from <= today && today <= w.to);
}
/** A request or an acceptance: within a period, or at any time when consented transfers are allowed all season. */
export function requestOpen(rules: Pick<Rules, "windows" | "consentedAnytime">, today: string) {
  return rules.consentedAnytime || marketOpen(rules, today);
}
/**
 * BPCF 1/12 « libre » / « litigieux »: the current club refused, the player
 * agreed; during a transfer period the federation may still validate.
 */
export function freeLeave(o: { status: string; player_consent: string; from_organization_id: string | null; federation_at?: string | null }, rules: Pick<Rules, "windows" | "consentedAnytime" | "federationValidation">, today: string) {
  return rules.consentedAnytime && rules.federationValidation && !!o.from_organization_id && o.status === "refused" && o.player_consent === "given" && !o.federation_at && rules.windows.length > 0 && marketOpen(rules, today);
}
/** An amount is allowed only when the rules say so, and up to the cap. */
export function amountAllowed(rules: Pick<Rules, "amountsAllowed" | "amountCapCents">, cents: number | null) {
  if (cents === null) return true;
  if (!rules.amountsAllowed) return false;
  return rules.amountCapCents === null || cents <= rules.amountCapCents;
}
/** Adult on a day (YYYY-MM-DD); an unknown birth date counts as a minor. */
export function adultOn(birth: string | null, today: string) {
  if (!birth) return false;
  const [by, bm, bd] = birth.split("-").map(Number),
    [y, m, d] = today.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0) >= 18;
}
/** What the current club, the requesting club and the federation can do next. */
export function offerMoves(o: { status: string; player_consent: string; from_organization_id: string | null }, side: "from" | "to" | "federation", validation: boolean, free = false) {
  const open = o.status === "sent" || o.status === "discussing";
  if (side === "to") return open || o.status === "accepted" ? ["withdraw"] : [];
  if (side === "from") return open && o.from_organization_id ? (o.player_consent === "given" ? ["accept", "refuse"] : ["refuse"]) : [];
  // BPCF: a refused transfer can still be validated as a free leave during a period.
  if (free) return ["validate"];
  return validation && o.status === "accepted" ? ["validate", "refuse"] : [];
}
