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
});
export type Rules = z.infer<typeof rulesSchema>;
export const defaultRules: Rules = { windows: [], amountsAllowed: false, amountCapCents: null, maxPerClubSeason: null, federationValidation: true, rulesText: "" };

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
  };
}
/** Open all year without windows; otherwise only within one of them (ends included). */
export function marketOpen(rules: Pick<Rules, "windows">, today: string) {
  return !rules.windows.length || rules.windows.some((w) => w.from <= today && today <= w.to);
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
export function offerMoves(o: { status: string; player_consent: string; from_organization_id: string | null }, side: "from" | "to" | "federation", validation: boolean) {
  const open = o.status === "sent" || o.status === "discussing";
  if (side === "to") return open || o.status === "accepted" ? ["withdraw"] : [];
  if (side === "from") return open && o.from_organization_id ? (o.player_consent === "given" ? ["accept", "refuse"] : ["refuse"]) : [];
  return validation && o.status === "accepted" ? ["validate", "refuse"] : [];
}
