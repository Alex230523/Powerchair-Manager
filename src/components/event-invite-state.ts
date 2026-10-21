/** Wave 16 (E1): the invitations of the event form, as state. */
export type InviteGroup = { kind: string; ref: string | null };
export type InviteState = { ask: boolean; deadline: string; groups: InviteGroup[] };

/** The form's starting point: the event's saved groups (the event's team as « team »), else the type's defaults. */
export function initialInvite(
  saved: InviteGroup[] | null,
  legacyPeople: string[],
  teamId: string | null,
  type: { ask_response: boolean; default_groups: string[] } | null,
  register: { deadline: string } | null,
  toLocal: (iso: string) => string,
): InviteState {
  if (saved && saved.length)
    return {
      ask: !!register,
      deadline: register ? toLocal(register.deadline) : "",
      groups: saved.map((g) => (g.kind === "team" && g.ref === teamId ? { kind: "team", ref: null } : g)),
    };
  if (legacyPeople.length) return { ask: !!register, deadline: register ? toLocal(register.deadline) : "", groups: legacyPeople.map((ref) => ({ kind: "person", ref })) };
  return { ask: !!type?.ask_response, deadline: "", groups: (type?.default_groups ?? []).map((kind) => ({ kind, ref: null })) };
}
