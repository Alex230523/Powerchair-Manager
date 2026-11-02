export const roles = [
  "club_president",
  "federation_president",
  "federation_worker",
  "coach",
  "referee",
  "player",
  "guardian",
] as const;
export type Role = (typeof roles)[number];
export const delegable = [
  "members.read",
  "invitations.create",
  "audit.read",
  "people.read",
  "people.manage",
  "teams.manage",
  "people.export",
  "notifications.manage",
  "registrations.manage",
  "documents.read",
  "documents.manage",
  "documents.sensitive",
  "calendar.manage",
  "attendance.manage",
  "calendar.read",
  "dues.manage",
  "equipment.manage",
  "people.sensitive",
  "dues.read",
  /** H1: the recruitment of new players (prospects, trial sessions). */
  "recruitment.manage",
  /** B8: a donor's national number, for the tax receipts (each opening is logged). */
  "tax.identity",
  /** 32: the federation's competences, given to its delegates (the presidency holds them all). */
  "federation.referees",
  "federation.competitions",
  "federation.discipline",
  "federation.classification",
  "federation.licences",
  "federation.courses",
  "federation.communication",
  "federation.finance",
] as const;
export const federationCompetences = [
  "federation.referees",
  "federation.competitions",
  "federation.discipline",
  "federation.classification",
  "federation.licences",
  "federation.courses",
  "federation.communication",
  "federation.finance",
] as const;
export type FederationCompetence = (typeof federationCompetences)[number];
/**
 * 32: may this mandate act for the federation in this competence? The
 * presidency always; a delegate (federation_worker) when one of his roles
 * gives it. Without a competence named: any of them.
 */
export function fedCan(role: string, grants: readonly string[], competence?: FederationCompetence) {
  if (role === "federation_president") return true;
  if (role !== "federation_worker") return false;
  return competence ? grants.includes(competence) : grants.some((g) => g.startsWith("federation."));
}
/**
 * 35: who reads and who manages an organisation's money. A club: « Lire » or
 * « Gérer les cotisations ». A federation: the finance competence (the
 * presidency has it). Never one organisation's rights over another's books.
 */
export function moneyRights(a: { kind: string; role: string; grants: readonly string[] }) {
  if (a.kind === "federation") {
    const ok = fedCan(a.role, a.grants, "federation.finance");
    return { read: ok, manage: ok };
  }
  if (a.kind !== "club") return { read: false, manage: false };
  const r = permissions(a.role as Role, a.grants as never) as readonly string[];
  return { read: r.includes("dues.read") || r.includes("dues.manage"), manage: r.includes("dues.manage") };
}
export type Permission =
  "organization.read" | "mandates.manage" | (typeof delegable)[number];
export type OrganizationKind = "club" | "federation";
export const labels: Record<Role, { fr: string; nl: string; en: string }> = {
  club_president: {
    fr: "Président de club",
    nl: "Clubvoorzitter",
    en: "Club president",
  },
  federation_president: {
    fr: "Président fédéral",
    nl: "Federatievoorzitter",
    en: "Federation president",
  },
  federation_worker: {
    fr: "Travailleur fédéral",
    nl: "Federatiemedewerker",
    en: "Federation staff",
  },
  coach: { fr: "Coach", nl: "Coach", en: "Coach" },
  referee: { fr: "Arbitre", nl: "Scheidsrechter", en: "Referee" },
  player: { fr: "Joueur", nl: "Speler", en: "Player" },
  guardian: {
    fr: "Parent / représentant",
    nl: "Ouder / vertegenwoordiger",
    en: "Parent / representative",
  },
};
export function roleAllowed(role: Role, kind: OrganizationKind) {
  return kind === "club"
    ? !["federation_president", "federation_worker", "referee"].includes(role)
    : ["federation_president", "federation_worker", "referee"].includes(role);
}
export function isAdmin(role: Role) {
  return role === "club_president" || role === "federation_president";
}
export function permissions(
  role: Role,
  grants: readonly string[],
): Permission[] {
  return [
    "organization.read",
    ...(isAdmin(role)
      ? [
          "mandates.manage",
          ...delegable.filter(
            (p) =>
              // A club's presidency never holds the federation's competences.
              (role === "club_president" && !p.startsWith("federation.")) ||
              (role !== "club_president" &&
                !p.startsWith("people.") &&
                p !== "teams.manage" &&
                p !== "registrations.manage" &&
                p !== "documents.manage" &&
                p !== "attendance.manage" &&
                p !== "dues.manage" &&
                p !== "dues.read" &&
                p !== "recruitment.manage" &&
                p !== "equipment.manage"),
          ),
        ]
      : grants.filter((p) => delegable.some((d) => d === p))),
  ] as Permission[];
}
export type Mandate = {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  grants: string[];
  valid_from: Date | string;
  valid_until: Date | string | null;
  revoked_at: Date | string | null;
  team_id?: string | null;
};
export function isCurrent(
  m: Pick<Mandate, "valid_from" | "valid_until" | "revoked_at">,
  now = new Date(),
) {
  return (
    !m.revoked_at &&
    new Date(m.valid_from) <= now &&
    (!m.valid_until || new Date(m.valid_until) > now)
  );
}
export function can(
  m: Mandate,
  organizationId: string,
  permission: Permission,
  now = new Date(),
) {
  return (
    m.organization_id === organizationId &&
    isCurrent(m, now) &&
    permissions(m.role, m.grants).includes(permission)
  );
}
