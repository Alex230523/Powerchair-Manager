"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { eventCopy } from "./calendar-event-copy";

import type { InviteGroup, InviteState } from "./event-invite-state";
export { initialInvite } from "./event-invite-state";
const audiences = ["team", "teamCoaches", "guardians", "players", "coaches", "staff"] as const;
const managerOnly = new Set(["players", "coaches", "staff"]);
const key = (g: InviteGroup) => `${g.kind}:${g.ref ?? ""}`;

/**
 * Wave 16 (E1): the « Invitations » section of the event form. Groups by
 * checkbox (the event's team, its coaches, parents, everyone, staff, other
 * teams, Communication groups) and people one by one; how many people it
 * makes, asked to the server. The whole choice travels in one hidden field.
 */
export function InvitePicker({
  locale,
  initial,
  teamId,
  manage,
  teams,
  groups,
  profiles,
  organizationId,
}: {
  locale: Locale;
  initial: InviteState;
  teamId: string;
  manage: boolean;
  teams: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  profiles: { id: string; full_name: string }[];
  organizationId: string;
}) {
  const t = eventCopy[locale];
  const [state, setState] = useState(initial);
  const [preview, setPreview] = useState<{ count: number; people: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The event's own team stands in « L'équipe de l'événement »: its ref follows the team field.
  const chosen = state.groups.map((g) => (g.kind === "team" && g.ref === null ? { kind: "team", ref: teamId || null } : g)).filter((g) => g.kind !== "team" || g.ref);
  const payload = { ask: state.ask, deadline: state.deadline ? new Date(state.deadline).toISOString() : null, groups: dedupe(chosen) };
  const has = (g: InviteGroup) => state.groups.some((x) => key(x) === key(g));
  const toggle = (g: InviteGroup, on: boolean) => setState((s) => ({ ...s, groups: on ? [...s.groups.filter((x) => key(x) !== key(g)), g] : s.groups.filter((x) => key(x) !== key(g)) }));
  const people = state.groups.filter((g) => g.kind === "person").map((g) => g.ref!);
  const serialized = JSON.stringify(payload);

  // A coach plans for one of their teams: no preview (the server would refuse it) until a team is chosen.
  const ready = manage || !!teamId;
  const shown = ready ? preview : null;
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!ready) return;
    timer.current = setTimeout(() => {
      fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "previewInvite", teamId: teamId || null, invite: JSON.parse(serialized), organizationId }),
      })
        .then(async (r) => (r.ok ? setPreview(await r.json()) : setPreview(null)))
        .catch(() => setPreview(null));
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [serialized, teamId, organizationId, ready]);

  return (
    <fieldset className="event-section" id="event-invitations">
      <legend>{t.sections.invitations}</legend>
      <input type="hidden" name="invite" value={serialized} />
      <label className="check">
        <input type="checkbox" checked={state.ask} onChange={(e) => setState((s) => ({ ...s, ask: e.target.checked }))} />
        {t.ask}
      </label>
      {state.ask && (
        <div>
          <label htmlFor="event-deadline">{t.deadline}</label>
          <input id="event-deadline" type="datetime-local" value={state.deadline} onChange={(e) => setState((s) => ({ ...s, deadline: e.target.value }))} aria-describedby="event-deadline-help" />
          <p className="muted small" id="event-deadline-help">
            {t.deadlineHelp}
          </p>
        </div>
      )}
      <fieldset className="event-chips">
        <legend>{t.groupsLabel}</legend>
        {audiences
          .filter((a) => manage || !managerOnly.has(a))
          .filter((a) => (a === "team" || a === "teamCoaches" ? !!teamId : true))
          .map((a) => {
            const g = { kind: a, ref: null };
            return (
              <label key={a} className="chip-check">
                <input type="checkbox" checked={has(g)} onChange={(e) => toggle(g, e.target.checked)} />
                {t.groups[a]}
              </label>
            );
          })}
      </fieldset>
      {manage && teams.filter((x) => x.id !== teamId).length > 0 && (
        <fieldset className="event-chips">
          <legend>{t.otherTeams}</legend>
          {/* 1: every team at once; a player in two teams is invited once (the server counts people, not teams). */}
          <label className="chip-check">
            <input
              type="checkbox"
              checked={teams.filter((x) => x.id !== teamId).every((x) => has({ kind: "team", ref: x.id })) && (!teamId || has({ kind: "team", ref: null }))}
              onChange={(e) =>
                setState((s) => {
                  const others = teams.filter((x) => x.id !== teamId).map((x) => ({ kind: "team", ref: x.id }) as InviteGroup);
                  const own = teamId ? [{ kind: "team", ref: null } as InviteGroup] : [];
                  const all = [...own, ...others];
                  const rest = s.groups.filter((g) => !all.some((a) => key(a) === key(g)));
                  return { ...s, groups: e.target.checked ? [...rest, ...all] : rest };
                })
              }
            />
            <strong>{t.allTeams}</strong>
          </label>
          {teams
            .filter((x) => x.id !== teamId)
            .map((x) => {
              const g = { kind: "team", ref: x.id };
              return (
                <label key={x.id} className="chip-check">
                  <input type="checkbox" checked={has(g)} onChange={(e) => toggle(g, e.target.checked)} />
                  {x.name}
                </label>
              );
            })}
        </fieldset>
      )}
      {manage && groups.length > 0 && (
        <fieldset className="event-chips">
          <legend>{t.communicationGroups}</legend>
          {groups.map((x) => {
            const g = { kind: "group", ref: x.id };
            return (
              <label key={x.id} className="chip-check">
                <input type="checkbox" checked={has(g)} onChange={(e) => toggle(g, e.target.checked)} />
                {x.name}
              </label>
            );
          })}
        </fieldset>
      )}
      <div>
        <label htmlFor="event-people">{t.people}</label>
        <select
          id="event-people"
          multiple
          size={Math.min(6, Math.max(3, profiles.length))}
          value={people}
          aria-describedby="event-people-help"
          onChange={(e) => {
            const ids = [...e.target.selectedOptions].map((o) => o.value);
            setState((s) => ({ ...s, groups: [...s.groups.filter((g) => g.kind !== "person"), ...ids.map((ref) => ({ kind: "person", ref }))] }));
          }}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <p className="muted small" id="event-people-help">
          {t.peopleHelp}
        </p>
      </div>
      <details className="event-invited" aria-live="polite">
        <summary>
          {t.invited(shown?.count ?? 0)}
          {shown && shown.count > 0 && <span className="muted"> · {t.showList}</span>}
        </summary>
        {shown && shown.count > 0 && (
          <ul className="plain-list">
            {shown.people.map((name, i) => (
              <li key={name + i}>{name}</li>
            ))}
          </ul>
        )}
      </details>
    </fieldset>
  );
}
function dedupe(groups: InviteGroup[]) {
  const seen = new Set<string>();
  return groups.filter((g) => (seen.has(key(g)) ? false : (seen.add(key(g)), true)));
}
