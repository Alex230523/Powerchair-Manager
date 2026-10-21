import { z } from "zod";

/**
 * Readiness of a session (wave 10): how many players and coaches answered
 * "present", against the club's thresholds. Green when the "ok" count is
 * reached, yellow from the "warn" count, red below.
 */
export type PresenceFamily = "training" | "match";
export type Threshold = { ok: number; warn: number };
export type PresenceRules = Record<
  PresenceFamily,
  { players: Threshold; coaches: Threshold }
>;
const threshold = z
  .object({
    ok: z.number().int().min(0).max(300),
    warn: z.number().int().min(0).max(300),
  })
  .refine((t) => t.warn <= t.ok, "warn must not exceed ok");
const family = z.object({ players: threshold, coaches: threshold });
export const presenceRulesSchema = z.object({
  training: family,
  match: family,
});
/** Club defaults asked by the pilot: coaches 2 ok, 1 yellow; players 5 ok, 4 yellow. */
export const defaultPresenceRules: PresenceRules = {
  training: { players: { ok: 5, warn: 4 }, coaches: { ok: 2, warn: 1 } },
  match: { players: { ok: 5, warn: 4 }, coaches: { ok: 2, warn: 1 } },
};
/** Stored rules may be partial (older clubs): missing parts take the defaults. */
export function presenceRules(stored: unknown): PresenceRules {
  const parsed = presenceRulesSchema.partial().safeParse(stored ?? {});
  const s = parsed.success ? parsed.data : {};
  return {
    training: s.training ?? defaultPresenceRules.training,
    match: s.match ?? defaultPresenceRules.match,
  };
}
/** Matches and tournaments follow the match thresholds; everything else the training ones. */
export function familyOf(kind: string): PresenceFamily {
  return kind === "friendly" || kind === "tournament" || kind === "match"
    ? "match"
    : "training";
}
export type Tone = "ok" | "warn" | "low";
export function toneFor(count: number, t: Threshold): Tone {
  if (count >= t.ok) return "ok";
  if (count >= t.warn) return "warn";
  return "low";
}
export type Readiness = {
  players: number;
  coaches: number;
  playersTone: Tone;
  coachesTone: Tone;
  /** Worst of the two, for the single dot of a list row. */
  tone: Tone;
};
export function readiness(
  kind: string,
  present: { players: number; coaches: number },
  rules: PresenceRules,
): Readiness {
  const r = rules[familyOf(kind)];
  const playersTone = toneFor(present.players, r.players);
  const coachesTone = toneFor(present.coaches, r.coaches);
  const order: Tone[] = ["low", "warn", "ok"];
  const tone = order[Math.min(order.indexOf(playersTone), order.indexOf(coachesTone))];
  return { ...present, playersTone, coachesTone, tone };
}
