import { z } from "zod";

const id = z.uuid();
export const commandSchema = z.discriminatedUnion("action", [
  /** Keeps `keepId`, moves everything of `removeId` onto it, archives `removeId`. */
  z.object({ action: z.literal("merge"), keepId: id, removeId: id }),
  /** Irreversible: the typed name must match the profile. */
  z.object({
    action: z.literal("anonymize"),
    id,
    confirmName: z.string().trim().min(2).max(120),
  }),
  z.object({
    action: z.literal("settings"),
    formerMemberYears: z.number().int().min(1).max(30),
    refusedApplicationMonths: z.number().int().min(1).max(120),
  }),
  /** Anonymises refused or withdrawn applications older than the retention. */
  z.object({ action: z.literal("purgeApplications") }),
]);
export type Command = z.infer<typeof commandSchema>;

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type Candidate = {
  id: string;
  full_name: string;
  birth_date: string | null;
  email: string | null;
  has_account: boolean;
  status: string;
};
/**
 * Probable duplicates: same name (accents and punctuation ignored) with
 * compatible birth dates, or same email. Each pair is listed once.
 */
export function duplicatePairs(people: Candidate[]) {
  const pairs: { a: Candidate; b: Candidate; reason: "name" | "email" }[] = [];
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i],
        b = people[j];
      const sameName =
        normal(a.full_name) === normal(b.full_name) &&
        (!a.birth_date || !b.birth_date || a.birth_date === b.birth_date);
      const sameEmail =
        !!a.email &&
        !!b.email &&
        a.email.toLowerCase() === b.email.toLowerCase();
      if (sameName || sameEmail)
        pairs.push({
          // The profile with an account (or the older one) is suggested as the one to keep.
          ...(b.has_account && !a.has_account ? { a: b, b: a } : { a, b }),
          reason: sameName ? "name" : "email",
        });
    }
  return pairs.slice(0, 100);
}

/** Label written in place of a name when a profile is anonymised. */
export const anonymousName = (id: string) =>
  "Personne anonymisée " + id.slice(0, 8);
