import { sessionGroup } from "../coaches/schema";

/**
 * Wave 17 (J2): the roll call, one session at a time, and the figures per
 * player. Pure functions over what attendanceView returns.
 */
type Inv = { id: string; profile_id: string; full_name: string; actual: string; response: string; withdrawn_at: Date | string | null; staff?: boolean };
type Ev = {
  id: string;
  kind: string;
  status: string;
  starts_at: Date | string;
  team_id: string | null;
  manage: boolean;
  register: { closed_at: Date | string | null } | null;
  invitations: Inv[];
};

/** The four choices of a line; « late » and « early » are a present person with a note. */
export const segments = ["present", "absent", "excused", "unchecked"] as const;
export type Segment = (typeof segments)[number];
export function segmentOf(actual: string): Segment {
  if (actual === "late" || actual === "early" || actual === "present") return "present";
  if (actual === "absent" || actual === "excused") return actual;
  return "unchecked";
}

/** Sessions one can take the roll of: started, not cancelled, with invitations, most recent first. */
export function callSessions<E extends Ev>(events: E[], team: string, now: number) {
  return events
    .filter((e) => e.manage && e.register && e.status === "scheduled" && new Date(e.starts_at).getTime() <= now && (!team || e.team_id === team))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
}

export type Tally = { attended: number; closed: number };
export type PlayerSummary = {
  profileId: string;
  name: string;
  training: Tally;
  match: Tally;
  all: Tally;
  excused: number;
  absent: number;
  /** Attended over closed sessions, in percent; null before any closed session. */
  rate: number | null;
};

/**
 * Per player, over closed registers of sessions not cancelled; « Excusé »
 * counted apart. 13/11/2026: `staff` gives the coaches' figures instead, never
 * mixed with the players'.
 */
export function playerSummaries(events: Ev[], staff = false): PlayerSummary[] {
  const out = new Map<string, PlayerSummary>();
  for (const e of events) {
    if (e.status === "cancelled" || !e.register?.closed_at) continue;
    for (const i of e.invitations) {
      if (i.withdrawn_at || !!i.staff !== staff) continue;
      const v =
        out.get(i.profile_id) ??
        ({ profileId: i.profile_id, name: i.full_name, training: { attended: 0, closed: 0 }, match: { attended: 0, closed: 0 }, all: { attended: 0, closed: 0 }, excused: 0, absent: 0, rate: null } as PlayerSummary);
      const group = sessionGroup(e.kind);
      const attended = segmentOf(i.actual) === "present";
      for (const t of group === "other" ? [v.all] : [v.all, v[group]]) {
        t.closed++;
        if (attended) t.attended++;
      }
      if (i.actual === "excused") v.excused++;
      if (i.actual === "absent") v.absent++;
      v.rate = Math.round((v.all.attended / v.all.closed) * 100);
      out.set(i.profile_id, v);
    }
  }
  return [...out.values()];
}

export function sortSummaries(list: PlayerSummary[], by: "rate" | "name") {
  return [...list].sort((a, b) => (by === "rate" ? (b.rate ?? -1) - (a.rate ?? -1) : 0) || a.name.localeCompare(b.name));
}

/** 13/11/2026: the roll call in two groups, the players first, then the coaches. */
export function splitStaff<I extends { staff?: boolean }>(people: I[]) {
  return { players: people.filter((i) => !i.staff), staff: people.filter((i) => i.staff) };
}

/**
 * 13/11/2026: « Mes prochaines séances »: the viewer's own invitations (not a
 * child's) for sessions still open to answers, soonest first.
 */
type MineInv = Inv & { self?: boolean; canRespond?: boolean; version: number; comment?: string };
type MineEv = Omit<Ev, "register" | "invitations"> & { title: string; register: { closed_at: Date | string | null; deadline?: Date | string } | null; invitations: MineInv[] };
export function myUpcoming<E extends MineEv>(events: E[], now: number, limit = 5) {
  const out: { event: E; invitation: E["invitations"][number] }[] = [];
  for (const e of events) {
    if (e.status !== "scheduled" || !e.register || e.register.closed_at || new Date(e.starts_at).getTime() <= now) continue;
    if (e.register.deadline && new Date(e.register.deadline).getTime() <= now) continue;
    const mine = e.invitations.find((i) => i.self && i.canRespond && !i.withdrawn_at);
    if (mine) out.push({ event: e, invitation: mine });
  }
  return out.sort((a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime()).slice(0, limit);
}
