import { z } from "zod";

/**
 * Wave 17 (C4): a club's places in two categories, their private sheet
 * (contact, food and drinks, notes, dated rates) and their sharing, validated
 * by the federation. Only the name, address, category and accessibility are
 * ever shared.
 */
export const placeCategories = ["training", "other"] as const;
export type PlaceCategory = (typeof placeCategories)[number];
const text = (n: number) => z.string().trim().max(n);
const id = z.uuid();

export const placeCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("savePlace"),
    id: id.optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: text(120).min(2),
    address: text(500),
    category: z.enum(placeCategories),
    contactId: id.nullable().default(null),
    /** A contact created in the same window, added to the contacts book. */
    newContact: z
      .object({ fullName: text(120).min(2), organizationName: text(160).default(""), email: z.union([z.literal(""), z.email().max(200)]).default(""), phone: text(40).default("") })
      .nullable()
      .default(null),
    capacity: z.number().int().min(1).max(100000).nullable().default(null),
    accessible: z.boolean().default(false),
    toilets: z.boolean().default(false),
    parking: z.boolean().default(false),
    storage: z.boolean().default(false),
    charging: z.boolean().default(false),
    home: z.boolean().default(false),
    foodPolicy: text(1000).default(""),
    notes: text(2000).default(""),
    archived: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("addRate"),
    placeId: id,
    label: text(120).min(2),
    amountCents: z.number().int().min(0).max(100000000),
    unit: text(40).default(""),
    validFrom: z.iso.date(),
  }),
  z.object({ action: z.literal("proposeShare"), placeId: id }),
  /** Federation: validate or refuse a proposal (a reason when refused). */
  z.object({ action: z.literal("decide"), placeId: id, approve: z.boolean(), reason: text(1000).default("") }),
  /** Federation: take a hall out of the shared directory. */
  z.object({ action: z.literal("withdraw"), venueId: id, reason: text(1000).min(3) }),
]);
export type PlaceCommand = z.infer<typeof placeCommand>;

export type Rate = { id: string; label: string; amount_cents: number; unit: string; valid_from: string; created_at: string; created_by_name: string };
/** The rate in force today for each label: the latest that has started. */
export function currentRates(rates: Rate[], today: string) {
  const out = new Map<string, Rate>();
  for (const r of [...rates].sort((a, b) => b.valid_from.localeCompare(a.valid_from) || b.created_at.localeCompare(a.created_at)))
    if (r.valid_from <= today && !out.has(r.label.toLowerCase())) out.set(r.label.toLowerCase(), r);
  return new Set([...out.values()].map((r) => r.id));
}

/** Training and match places first for a training or a match, then the others; each by name. */
export function placesFor<P extends { category: string; name: string }>(places: P[], eventKind: string) {
  const sport = ["training", "match", "friendly", "tournament", "camp"].includes(eventKind);
  const rank = (p: P) => (sport ? (p.category === "training" ? 0 : 1) : p.category === "other" ? 0 : 1);
  return [...places].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The public fields a validated place gives the shared directory: never contact, rates, food or notes. */
export function publicFields(p: { name: string; address: string; category: string; accessible: boolean; toilets: boolean; parking: boolean; charging: boolean }) {
  return {
    name: p.name,
    address: p.address,
    category: p.category,
    step_free: p.accessible || null,
    adapted_toilets: p.toilets || null,
    parking: p.parking || null,
    charging: p.charging || null,
  };
}

/** A club's place as the Places page and the creation window see it. */
export type PlaceRow = {
  id: string;
  name: string;
  address: string;
  category: PlaceCategory;
  contact: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  capacity: number | null;
  accessible: boolean;
  toilets: boolean;
  parking: boolean;
  storage: boolean;
  charging: boolean;
  home: boolean;
  food_policy: string;
  notes: string;
  archived: boolean;
  version: number;
  share_status: "private" | "pending" | "approved" | "refused";
  share_reason: string;
  shared_venue_id: string | null;
  rates: Rate[];
};

/**
 * Wave 17 (C4): who sees a shared hall. A validated hall is seen by the
 * clubs of the same federation and the federation itself; the club that
 * proposed it always sees it. `$1` is the viewer's organization.
 */
export const visibleVenue = (v = "v") =>
  `(${v}.status='approved' AND (${v}.organization_id=$1 OR EXISTS (SELECT 1 FROM organization vo JOIN organization me ON me.id=$1 WHERE vo.id=${v}.organization_id AND COALESCE(me.federation_id,me.id) IN (vo.id,vo.federation_id))))`;
