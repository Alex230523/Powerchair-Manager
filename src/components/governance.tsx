"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import {
  rightsModules,
  levelOf,
  levelsOf,
  withLevel,
  allowedLevels,
  optionalModules,
  type Grant,
  type Level,
} from "@/domains/access/rights";
import type { DuesRules } from "@/domains/dues/rules";
import type { PresenceRules } from "@/domains/dashboard/presence";
import { governanceCopy } from "./governance-copy";
import { settingsCopy } from "./settings-copy";
import { errors } from "./access-copy";
import { Card, EmptyState } from "./ui";

export type Governance = {
  organizationId: string;
  disabled: string[];
  presence: PresenceRules;
  dues: DuesRules;
  can: {
    modules: boolean;
    presence: boolean;
    profiles: boolean;
    rightsJournal: boolean;
    healthJournal: boolean;
  };
  profiles: { id: string; name: string; grants: Grant[] }[];
};
type Post = (
  url: string,
  body: Record<string, unknown>,
  done: string,
) => Promise<void | boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** Rights of one person or profile, module by module, on three levels. */
export function ModuleRights({
  locale,
  grants,
  own,
  onChange,
  id,
}: {
  locale: Locale;
  grants: readonly string[];
  own: ReadonlySet<string>;
  onChange: (next: Grant[]) => void;
  id: string;
}) {
  const g = governanceCopy[locale],
    s = settingsCopy[locale];
  return (
    <div className="module-rights">
      <p className="muted small">{g.levelHelp}</p>
      {rightsModules.map((m) => {
        const level = levelOf(grants, m),
          allowed = allowedLevels([...own], m);
        return (
          <fieldset key={m.key} className="module-right">
            <legend>{g.rightsModules[m.key]}</legend>
            {levelsOf(m).length > 0 && (
              <div className="segmented">
                {levelsOf(m).map((l: Level) => (
                  <label key={l} className="segment">
                    <input
                      type="radio"
                      name={`${id}-${m.key}`}
                      value={l}
                      checked={level === l}
                      disabled={!allowed.includes(l) && level !== l}
                      onChange={() => onChange(withLevel(grants, m, l))}
                    />
                    <span>{g.levels[l]}</span>
                  </label>
                ))}
              </div>
            )}
            {(m.extras ?? []).map((x) => (
              <label key={x} className="check">
                <input
                  type="checkbox"
                  checked={grants.includes(x)}
                  disabled={
                    !own.has(x) ||
                    (levelsOf(m).length > 0 && level === "none")
                  }
                  onChange={() =>
                    onChange(
                      (grants.includes(x)
                        ? grants.filter((y) => y !== x)
                        : [...grants, x]) as Grant[],
                    )
                  }
                />
                {s.grants[x]}
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

/** One line per module: "Trésorerie : Lecture". */
export function rightsSummary(locale: Locale, grants: readonly string[]) {
  const g = governanceCopy[locale];
  return rightsModules
    .filter((m) => levelsOf(m).length && levelOf(grants, m) !== "none")
    .map((m) => `${g.rightsModules[m.key]} : ${g.levels[levelOf(grants, m)]}`)
    .join(" · ");
}

export function ProfilesPanel({
  locale,
  gov,
  own,
  busy,
  post,
}: {
  locale: Locale;
  gov: Governance;
  own: ReadonlySet<string>;
  busy: boolean;
  post: Post;
}) {
  const g = governanceCopy[locale];
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    grants: Grant[];
  } | null>(null);
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    void post(
      "/api/governance",
      {
        action: "saveProfile",
        ...(editing.id ? { id: editing.id } : {}),
        name: editing.name,
        grants: editing.grants.filter((x) => own.has(x)),
        organizationId: gov.organizationId,
      },
      g.profileSaved,
    ).then(() => setEditing(null));
  }
  return (
    <Card title={g.clubProfiles} labelledBy="settings-profiles" headingId="settings-profiles" actions={<>{gov.can.profiles && !editing && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing({ name: "", grants: [] })}
          >
            {g.newProfile}
          </button>
        )}</>}>
      <p className="muted">{g.clubProfilesIntro}</p>
      {gov.profiles.length ? (
        <ul className="profile-list">
          {gov.profiles.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p className="muted small">
                  {rightsSummary(locale, p.grants) || g.profiles.none}
                </p>
              </div>
              {gov.can.profiles && (
                <div className="row-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setEditing({ id: p.id, name: p.name, grants: p.grants })
                    }
                  >
                    {g.editProfile}
                    <span className="sr-only"> : {p.name}</span>
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void post(
                        "/api/governance",
                        {
                          action: "deleteProfile",
                          id: p.id,
                          organizationId: gov.organizationId,
                        },
                        g.profileDeleted,
                      )
                    }
                  >
                    {g.deleteProfile}
                    <span className="sr-only"> : {p.name}</span>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={g.noProfile} />
      )}
      {editing && (
        <form className="profile-form" onSubmit={save}>
          <label htmlFor="profile-name">
            {g.profileName}
            <input
              id="profile-name"
              required
              minLength={2}
              maxLength={60}
              placeholder="Ex. Kiné, Secrétaire adjoint"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <ModuleRights
            locale={locale}
            id="profile-edit"
            grants={editing.grants}
            own={own}
            onChange={(next) => setEditing({ ...editing, grants: next })}
          />
          <div className="actions">
            <button className="button" disabled={busy}>
              {g.saveProfile}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(null)}
            >
              {g.cancel}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function ModulesPanel({
  locale,
  gov,
  busy,
  post,
}: {
  locale: Locale;
  gov: Governance;
  busy: boolean;
  post: Post;
}) {
  const g = governanceCopy[locale];
  const [off, setOff] = useState<string[]>(gov.disabled);
  return (
    <Card title={g.modulesTitle} labelledBy="settings-modules" headingId="settings-modules">
      <p className="muted">{g.modulesIntro}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post(
            "/api/governance",
            {
              action: "modules",
              disabled: off,
              organizationId: gov.organizationId,
            },
            g.modulesSaved,
          );
        }}
      >
        <fieldset className="module-switches">
          <legend className="sr-only">{g.modulesTitle}</legend>
          {optionalModules.map((m) => (
            <label key={m} className="check">
              <input
                type="checkbox"
                checked={!off.includes(m)}
                onChange={() =>
                  setOff(
                    off.includes(m) ? off.filter((x) => x !== m) : [...off, m],
                  )
                }
              />
              {g.optional[m]}
            </label>
          ))}
        </fieldset>
        <p className="muted small">{g.core}</p>
        <button className="button" disabled={busy}>
          {g.saveModules}
        </button>
      </form>
    </Card>
  );
}

export function PresencePanel({
  locale,
  gov,
  busy,
  post,
}: {
  locale: Locale;
  gov: Governance;
  busy: boolean;
  post: Post;
}) {
  const g = governanceCopy[locale];
  const [rules, setRules] = useState(gov.presence);
  const set = (
    family: "training" | "match",
    who: "players" | "coaches",
    level: "ok" | "warn",
    value: number,
  ) =>
    setRules({
      ...rules,
      [family]: {
        ...rules[family],
        [who]: { ...rules[family][who], [level]: value },
      },
    });
  return (
    <Card title={g.presenceTitle} labelledBy="settings-presence" headingId="settings-presence">
      <p className="muted">{g.presenceIntro}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post(
            "/api/governance",
            { action: "presence", rules, organizationId: gov.organizationId },
            g.presenceSaved,
          );
        }}
      >
        <div className="table-scroll">
          <table className="presence-rules">
            <thead>
              <tr>
                <th scope="col"></th>
                {(["players", "coaches"] as const).flatMap((who) =>
                  (["ok", "warn"] as const).map((level) => (
                    <th scope="col" key={who + level}>
                      {g.presenceWho[who]} · {g.presenceLevel[level]}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {(["training", "match"] as const).map((family) => (
                <tr key={family}>
                  <th scope="row">{g.presenceFamily[family]}</th>
                  {(["players", "coaches"] as const).flatMap((who) =>
                    (["ok", "warn"] as const).map((level) => (
                      <td key={who + level}>
                        <input
                          type="number"
                          min={0}
                          max={300}
                          aria-label={`${g.presenceFamily[family]} · ${g.presenceWho[who]} · ${g.presenceLevel[level]}`}
                          value={rules[family][who][level]}
                          onChange={(e) =>
                            set(family, who, level, Number(e.target.value || 0))
                          }
                        />
                      </td>
                    )),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="button" disabled={busy}>
          {g.savePresence}
        </button>
      </form>
    </Card>
  );
}

type JournalRow = {
  id: string;
  created_at: string;
  actor: string;
  subject: string | null;
  action?: string;
  kind?: string;
  details?: {
    before?: string[];
    after?: string[];
    name?: string;
  } | null;
};
export function Journal({
  locale,
  kind,
}: {
  locale: Locale;
  kind: "rights" | "health";
}) {
  const g = governanceCopy[locale],
    s = settingsCopy[locale];
  const [filters, setFilters] = useState({ user: "", from: "", to: "" }),
    [applied, setApplied] = useState(filters),
    [data, setData] = useState<{
      rows: JournalRow[];
      people: { id: string; name: string }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(
      "/api/governance/journal?" +
        new URLSearchParams({ kind, ...applied }).toString(),
      { cache: "no-store" },
    )
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setData(v);
      })
      .catch((e: Error) => {
        if (!cancelled)
          setError(errors[e.message]?.[locale] ?? errors.FORBIDDEN[locale]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, applied, locale]);
  const when = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Brussels",
    }).format(new Date(d));
  const label = (x: string) =>
    (s.grants as Record<string, string>)[x] ??
    g.optional[x] ??
    x;
  function change(r: JournalRow) {
    if (kind === "health") return g.healthKinds[r.kind ?? ""] ?? r.kind;
    const title = g.actions[r.action ?? ""] ?? r.action;
    const before = r.details?.before ?? [],
      after = r.details?.after ?? [];
    if (r.action === "modules.changed") {
      // The lists hold switched-off modules.
      const nowOff = after.filter((x) => !before.includes(x)).map((x) => `${label(x)} ${g.off}`);
      const nowOn = before.filter((x) => !after.includes(x)).map((x) => `${label(x)} ${g.on}`);
      return [title, [...nowOff, ...nowOn].join(", ")].filter(Boolean).join(" : ");
    }
    const plus = after.filter((x) => !before.includes(x)).map((x) => `+ ${label(x)}`);
    const minus = r.action === "mandate.grants"
      ? before.filter((x) => !after.includes(x)).map((x) => `− ${label(x)}`)
      : [];
    const name = r.details?.name ? ` « ${r.details.name} »` : "";
    return [title + name, [...plus, ...minus].join(", ")].filter(Boolean).join(" : ");
  }
  const heading = kind === "rights" ? g.rightsJournal : g.healthJournal;
  const hid = `journal-${kind}`;
  return (
    <Card title={heading} labelledBy={hid} headingId={hid}>
      <p className="muted">
        {kind === "rights" ? g.rightsJournalIntro : g.healthJournalIntro}
      </p>
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(filters);
        }}
      >
        <label htmlFor={`${hid}-user`}>
          {g.person}
          <select
            id={`${hid}-user`}
            value={filters.user}
            onChange={(e) => setFilters({ ...filters, user: e.target.value })}
          >
            <option value="">{g.everyone}</option>
            {(data?.people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${hid}-from`}>
          {g.from}
          <input
            id={`${hid}-from`}
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label htmlFor={`${hid}-to`}>
          {g.to}
          <input
            id={`${hid}-to`}
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <button className="button secondary">{g.filter}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {data &&
        (data.rows.length ? (
          <div className="table-scroll" role="region" aria-label={heading} tabIndex={0}>
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">{g.when}</th>
                  <th scope="col">{g.who}</th>
                  <th scope="col">{g.what}</th>
                  <th scope="col">{g.about}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.created_at)}</td>
                    <td>{r.actor}</td>
                    <td>{change(r)}</td>
                    <td>{r.subject ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={g.empty} />
        ))}
    </Card>
  );
}
