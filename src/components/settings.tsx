"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { isAdmin, type Role } from "@/domains/access/policy";
import { settingsCopy, grantGroups, presets } from "./settings-copy";
import { errors } from "./access-copy";

type Member = {
  id: string;
  user_id: string;
  name: string;
  role: Role;
  grants: string[];
  team_id: string | null;
  valid_until: string | null;
  revoked_at: string | null;
  active: boolean;
};
type WorkspaceState = {
  user: { id: string; name: string };
  selected?: { id: string; role: Role; organization_id: string; kind: string };
  permissions: string[];
  members: Member[];
};
type Team = {
  id: string;
  name: string;
  archived: boolean;
  season_archived?: boolean;
};
type PeopleState = {
  context: { id: string };
  ownProfileId: string | null;
  teams: Team[];
  profiles: {
    id: string;
    directory_roles: string[];
    assignments: {
      team_id: string;
      role: string;
      closed_at: string | null;
      cancelled: boolean;
    }[];
  }[];
};

/**
 * Club settings for the president: what each coach or member may do, which
 * team a coach follows, and the "I also coach" switch.
 */
export function Settings({ locale }: { locale: Locale }) {
  const t = settingsCopy[locale];
  const [ws, setWs] = useState<WorkspaceState | null>(null),
    [people, setPeople] = useState<PeopleState | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Record<string, string[]>>({}),
    [now] = useState(() => Date.now());
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const load = useCallback(async () => {
    const [w, p] = await Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/people", { cache: "no-store" }),
    ]);
    if (!w.ok) throw new Error("UNAVAILABLE");
    const wv = (await w.json()) as WorkspaceState;
    setWs(wv);
    setDraft(Object.fromEntries(wv.members.map((m) => [m.id, m.grants])));
    setPeople(p.ok ? await p.json() : null);
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/people", { cache: "no-store" }),
    ])
      .then(async ([w, p]) => {
        if (!w.ok) throw new Error("UNAVAILABLE");
        const wv = (await w.json()) as WorkspaceState;
        const pv = p.ok ? ((await p.json()) as PeopleState) : null;
        if (cancelled) return;
        setWs(wv);
        setDraft(Object.fromEntries(wv.members.map((m) => [m.id, m.grants])));
        setPeople(pv);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [failure]);

  async function post(
    url: string,
    body: Record<string, unknown>,
    done: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(done);
      window.dispatchEvent(new Event("pfm-workspace"));
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  if (!ws)
    return (
      <main id="main" className="access settings">
        <h1>{t.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const manage =
    ws.permissions.includes("mandates.manage") && ws.members.length > 0;
  const own = new Set(ws.permissions);
  const teams = (people?.teams ?? []).filter(
    (x) => !x.archived && !x.season_archived,
  );
  const ownProfile = people?.profiles.find((x) => x.id === people.ownProfileId);
  const isCoach = !!ownProfile?.directory_roles.includes("coach");
  const coachedTeams = (ownProfile?.assignments ?? [])
    .filter((a) => a.role === "coach" && !a.closed_at && !a.cancelled)
    .map((a) => teams.find((x) => x.id === a.team_id)?.name)
    .filter(Boolean);
  const members = ws.members.filter(
    (m) =>
      !isAdmin(m.role) &&
      m.user_id !== ws.user.id &&
      m.active &&
      !m.revoked_at &&
      (!m.valid_until || new Date(m.valid_until).getTime() > now),
  );
  members.sort(
    (a, b) => Number(b.role === "coach") - Number(a.role === "coach"),
  );

  function selfCoach(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const team = new FormData(e.currentTarget).get("team") as string;
    void post(
      "/api/people",
      {
        action: "selfCoach",
        teamId: team || null,
        organizationId: people?.context.id,
      },
      t.selfAdded,
    );
  }

  return (
    <main id="main" className="access settings">
      <h1>{t.title}</h1>
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!manage && <p className="notice">{t.presidentOnly}</p>}

      {manage && ws.selected?.role === "club_president" && people && (
        <section className="panel" aria-labelledby="settings-self">
          <h2 id="settings-self">{t.selfTitle}</h2>
          <p className="muted">{t.selfIntro}</p>
          {isCoach && (
            <p>
              <span className="status-tag" data-tone="success">
                {t.selfDone}
              </span>
              {coachedTeams.length > 0 && (
                <span className="muted">
                  {" "}
                  {t.selfTeams} : {coachedTeams.join(", ")}
                </span>
              )}
            </p>
          )}
          <form className="inline-form" onSubmit={selfCoach}>
            <label htmlFor="self-team">
              {t.selfTeam}
              <select id="self-team" name="team" defaultValue="">
                <option value="">{t.noTeamChoice}</option>
                {teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" disabled={busy}>
              {t.selfAdd}
            </button>
            {isCoach && ownProfile && (
              <Link
                className="button secondary"
                href={`/${locale}/coaches/${ownProfile.id}`}
              >
                {t.selfProfile}
              </Link>
            )}
          </form>
        </section>
      )}

      {manage && (
        <section className="panel" aria-labelledby="settings-access">
          <h2 id="settings-access">{t.accessTitle}</h2>
          <p className="muted">{t.accessIntro}</p>
          {members.length ? (
            <ul className="grant-list">
              {members.map((m) => {
                const chosen = new Set(draft[m.id] ?? m.grants);
                const toggle = (g: string) =>
                  setDraft({
                    ...draft,
                    [m.id]: chosen.has(g)
                      ? [...chosen].filter((x) => x !== g)
                      : [...chosen, g],
                  });
                return (
                  <li key={m.id} className="grant-card">
                    <div className="grant-head">
                      <strong>{m.name}</strong>
                      <span className="role-chip">
                        {t.roles[m.role] ?? m.role}
                      </span>
                    </div>
                    {m.role === "coach" && teams.length > 0 && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const team = new FormData(e.currentTarget).get(
                            "team",
                          ) as string;
                          void post(
                            "/api/people",
                            {
                              action: "coachScope",
                              mandateId: m.id,
                              teamId: team || null,
                              organizationId: people?.context.id,
                            },
                            t.scopeSaved,
                          );
                        }}
                      >
                        <label htmlFor={`scope-${m.id}`}>
                          {t.teamScope}
                          <select
                            id={`scope-${m.id}`}
                            name="team"
                            defaultValue={m.team_id ?? ""}
                          >
                            <option value="">{t.allTeams}</option>
                            {teams.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="button secondary" disabled={busy}>
                          {t.saveScope}
                          <span className="sr-only"> : {m.name}</span>
                        </button>
                      </form>
                    )}
                    <div
                      className="preset-row"
                      role="group"
                      aria-label={`${t.presets} : ${m.name}`}
                    >
                      <span className="muted">{t.presets}</span>
                      {(["field", "head", "none"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          className="chip-button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              [m.id]: presets[k].filter((g) => own.has(g)),
                            })
                          }
                        >
                          {k === "field"
                            ? t.presetField
                            : k === "head"
                              ? t.presetHead
                              : t.presetNone}
                        </button>
                      ))}
                    </div>
                    <div className="grant-groups">
                      {grantGroups.map((group) => (
                        <fieldset key={group.key}>
                          <legend>{t.groups[group.key]}</legend>
                          {group.grants.map((g) => (
                            <label key={g} className="check">
                              <input
                                type="checkbox"
                                checked={chosen.has(g)}
                                disabled={!own.has(g)}
                                onChange={() => toggle(g)}
                              />
                              {t.grants[g]}
                            </label>
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void post(
                          "/api/workspace",
                          {
                            action: "grants",
                            id: m.id,
                            grants: [...chosen].filter((g) => own.has(g)),
                          },
                          t.grantsSaved,
                        )
                      }
                    >
                      {t.saveGrants}
                      <span className="sr-only"> : {m.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">{t.noMember}</p>
          )}
        </section>
      )}
    </main>
  );
}
