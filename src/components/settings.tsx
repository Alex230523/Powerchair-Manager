"use client";
import { TutorialSettings } from "./first-steps";
import { PresidencyHandover } from "./presidency";
import { tutorialAudience } from "@/domains/tutorial/schema";
import { TaskTemplates } from "./tasks";
import { Reminders } from "./reminders";
import { Automations } from "./automations";
import { DurationField, readDuration } from "./duration-field";
import { durationText } from "./duration-copy";
import { TeamPlacesSettings } from "./team-places-settings";
import { ClubObligations } from "./club-obligations";
import { HallOfFameSettings } from "./hall-of-fame";
import { EventTypesSettings } from "./event-types-settings";
import { FiscalYearPanel } from "./fiscal-year";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { isAdmin, type Role } from "@/domains/access/policy";
import { settingsCopy } from "./settings-copy";
import { builtInProfiles, type Grant } from "@/domains/access/rights";
import {
  ModuleRights,
  rightsSummary,
  ModulesPanel,
  PresencePanel,
  ProfilesPanel,
  Journal,
  type Governance,
} from "./governance";
import { governanceCopy } from "./governance-copy";
import { errors } from "./access-copy";
import { Modal } from "./modal";
import { Notifications } from "./notifications";
import { SetupSettings } from "./setup-card";
import { ClubAppearance } from "./club-appearance";
import { DuesSettingsPanel } from "./dues-settings";
import { Badge, Button, Card, PageHeader, EmptyState, ExportButton } from "./ui";
import { exportCopy } from "./export-copy";
import { Icon } from "./icons";
import { AccountPanels } from "./account-settings";
import { ClubIdentity } from "./club-identity";
import { Privacy } from "./privacy";
import { People } from "./people";
import { SeasonCheckPanel } from "./season-check";
import { AuthorizationSettings } from "./authorization-settings";
import { seasonPlanCopy } from "./season-plan-copy";
import { seasonScheduleCopy } from "./season-schedule-copy";
import { TaxApproval } from "./tax-approval";
import { settingsHubCopy } from "./settings-hub-copy";
import { categoryIcons, legacyAnchors, searchSettings, visibleCategories, type SettingsCategory } from "./settings-nav";

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
  selected?: { id: string; role: Role; organization_id: string; kind: string; disabled_modules?: string[] };
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
 * Settings (wave 15, C13): a home with one card per category and a search,
 * then one sub-page per category. The panels are the ones of the former single
 * page, moved as they were; visibility follows the same rights.
 */
export function Settings({ locale, category, remindersKind }: { locale: Locale; category?: SettingsCategory; remindersKind?: "dues" | "documents" }) {
  const t = settingsCopy[locale],
    g = governanceCopy[locale],
    h = settingsHubCopy[locale];
  const router = useRouter();
  const [query, setQuery] = useState(""),
    [leaving, setLeaving] = useState<string | null>(null);
  // Unsaved changes: a field changed since the last button press or form submission.
  const dirty = useRef(false);
  const [ws, setWs] = useState<WorkspaceState | null>(null),
    [gov, setGov] = useState<Governance | null>(null),
    [people, setPeople] = useState<PeopleState | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Record<string, string[]>>({}),
    [editingMember, setEditingMember] = useState(""),
    [now] = useState(() => Date.now());
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const load = useCallback(async () => {
    const [w, p, gv] = await Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/people", { cache: "no-store" }),
      fetch("/api/governance", { cache: "no-store" }),
    ]);
    if (!w.ok) throw new Error("UNAVAILABLE");
    const wv = (await w.json()) as WorkspaceState;
    setWs(wv);
    setDraft(Object.fromEntries(wv.members.map((m) => [m.id, m.grants])));
    setPeople(p.ok ? await p.json() : null);
    setGov(gv.ok ? await gv.json() : null);
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/people", { cache: "no-store" }),
      fetch("/api/governance", { cache: "no-store" }),
    ])
      .then(async ([w, p, gv]) => {
        if (!w.ok) throw new Error("UNAVAILABLE");
        const wv = (await w.json()) as WorkspaceState;
        const pv = p.ok ? ((await p.json()) as PeopleState) : null;
        const gov = gv.ok ? ((await gv.json()) as Governance) : null;
        if (cancelled) return;
        setWs(wv);
        setDraft(Object.fromEntries(wv.members.map((m) => [m.id, m.grants])));
        setPeople(pv);
        setGov(gov);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [failure]);
  // Links to an anchor of the former single page land on the right sub-page.
  useEffect(() => {
    if (category) return;
    const id = window.location.hash.slice(1);
    if (legacyAnchors[id]) router.replace(`/${locale}/settings/${legacyAnchors[id]}#${id}`);
  }, [category, locale, router]);
  // A search result (or an old anchor) points at a setting: scroll to it once its panel is drawn.
  useEffect(() => {
    if (!category || !ws) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 20) {
        window.clearInterval(timer);
        el?.scrollIntoView({ block: "start" });
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [category, ws]);
  // Leaving a sub-page with unsaved changes asks first (links of the whole application).
  useEffect(() => {
    if (!category) return;
    const guard = (e: MouseEvent) => {
      if (!dirty.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [category]);
  const markDirty = (e: { target: EventTarget }) => {
    const el = e.target as HTMLElement;
    if (el.closest?.("[data-nodirty]") || (el instanceof HTMLInputElement && el.type === "file")) return;
    if (el.matches?.("input, select, textarea")) dirty.current = true;
  };
  const markClean = (e: { target: EventTarget; type: string }) => {
    if (e.type === "submit" || (e.target as HTMLElement).closest?.("button")) dirty.current = false;
  };

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
      return true;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const crumbs = category ? [{ label: h.title, href: `/${locale}/settings` }, { label: h.categories[category].title }] : undefined;
  if (!ws)
    return (
      <main id="main" className="access settings">
        <PageHeader title={category ? h.categories[category].title : h.title} crumbs={crumbs} crumbsLabel={h.crumbs} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const visible = visibleCategories({
    kind: ws.selected?.kind,
    role: ws.selected?.role,
    permissions: ws.permissions,
    disabled: gov?.disabled ?? ws.selected?.disabled_modules,
  });
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
  const coaches = members.filter((m) => m.role === "coach");
  const others = members.filter((m) => m.role !== "coach");

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

  const withoutRights = manage ? coaches.filter((m) => !rightsSummary(locale, m.grants)).length : 0;
  const badges: Partial<Record<SettingsCategory, string>> = withoutRights
    ? { members: withoutRights === 1 ? h.coachesWithoutRightsOne : h.coachesWithoutRights.replace("{n}", String(withoutRights)) }
    : {};
  const href = (c: SettingsCategory, anchor?: string) => `/${locale}/settings/${c}${anchor ? `#${anchor}` : ""}`;

  if (!category) {
    const results = searchSettings(query, h.entries, visible);
    return (
      <main id="main" className="access settings settings-hub">
        <PageHeader title={h.title} subtitle={h.hubIntro} />
        {error && <p role="alert">{error}</p>}
        <div className="settings-search">
          <label htmlFor="settings-search">{h.searchLabel}</label>
          <span className="settings-search-field">
            <Icon name="search" size={16} />
            <input
              id="settings-search"
              type="search"
              value={query}
              placeholder={h.searchPlaceholder}
              autoComplete="off"
              aria-controls="settings-results"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  router.push(href(results[0].category, results[0].anchor));
                }
              }}
            />
          </span>
          <div id="settings-results" aria-live="polite">
            {query.trim() &&
              (results.length ? (
                <ul className="settings-results" aria-label={h.resultsLabel}>
                  {results.map((r) => (
                    <li key={r.id}>
                      <Link href={href(r.category, r.anchor)}>
                        <Icon name={categoryIcons[r.category]} size={16} />
                        <span>
                          <strong>{h.entries[r.id].title}</strong>
                          <span className="muted"> · {h.categories[r.category].title}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{h.noResult}</p>
              ))}
          </div>
        </div>
        <ul className="settings-grid" aria-label={h.categoriesLabel}>
          {visible.map((c) => (
            <li key={c}>
              <Card href={href(c)} title={h.categories[c].title} icon={categoryIcons[c]} headingId={`settings-cat-${c}`} className="settings-card">
                <p className="muted">{h.categories[c].text}</p>
                {badges[c] && <Badge tone="warning">{badges[c]}</Badge>}
              </Card>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const shown = visible.includes(category);
  return (
    <main id="main" className="access settings settings-page">
      <PageHeader title={h.categories[category].title} subtitle={h.categories[category].text} crumbs={crumbs} crumbsLabel={h.crumbs} />
      <Link className="settings-back" href={`/${locale}/settings`}>
        <Icon name="back" size={16} /> {h.back}
      </Link>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={h.categoriesLabel}>
          <ul>
            {visible.map((c) => (
              <li key={c}>
                <Link href={href(c)} aria-current={c === category ? "page" : undefined}>
                  <Icon name={categoryIcons[c]} size={18} />
                  <span>{h.categories[c].title}</span>
                  {badges[c] && <span className="sr-only"> · {badges[c]}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="settings-content" onChange={markDirty} onInput={markDirty} onClickCapture={markClean} onSubmitCapture={markClean}>
          {!shown && <EmptyState icon="lock" title={h.notAvailable} action={<Link href={`/${locale}/settings`}>{h.back}</Link>} />}
          {shown && category === "account" && <AccountPanels locale={locale} />}
          {/* Wave 17 (O1): the first-connection tour, started again on demand. */}
          {shown && category === "account" && tutorialAudience(ws?.selected?.role) && <TutorialSettings locale={locale} />}
          {/* Notifications live in settings since wave 11, for every profile. */}
          {shown && category === "notifications" && <Notifications locale={locale} embedded />}
          {/* Dues and document reminders (wave 17, G3: out of the menu, here). */}
          {shown && category === "notifications" && ws?.selected?.kind === "club" && <Reminders locale={locale} embedded initial={remindersKind} />}
          {/* B7: the catalogue of automations (president and notifications.manage; the panel hides itself otherwise). */}
          {shown && category === "notifications" && ws?.selected?.kind === "club" && <Automations locale={locale} />}
          {shown && category === "club" && gov?.can.modules && <SetupSettings locale={locale} />}
          {shown && category === "club" && <ClubIdentity locale={locale} only="identity" />}
          {shown && category === "club" && <ClubObligations locale={locale} />}
          {shown && category === "club" && <TaxApproval locale={locale} />}
          {shown && category === "club" && <ClubAppearance locale={locale} />}
          {shown && category === "club" && <HallOfFameSettings locale={locale} />}
          {shown && category === "club" && gov?.can.modules && <ModulesPanel locale={locale} gov={gov} busy={busy} post={post} />}
          {/* Wave 17 (G1): the president hands over the presidency (12: under Club). */}
          {shown && category === "club" && ws?.selected?.role === "club_president" && (
            <div id="settings-presidency">
              <PresidencyHandover locale={locale} />
            </div>
          )}
          {/* 12: « Mes données » for everyone, the club's personal data for whom may see them. */}
          {shown && category === "data" && (
            <Card title={h.myDataTitle} labelledBy="settings-my-data" headingId="settings-my-data">
              <p className="muted">{h.myDataText}</p>
              <p>
                <a className="button secondary" href="/api/privacy/mine" download>
                  {h.myDataExport}
                </a>
              </p>
              <p className="muted">
                {h.myDataFix} <Link href={`/${locale}/settings/account`}>{h.myDataAccount}</Link>
              </p>
            </Card>
          )}
          {shown && category === "data" && ws?.selected?.kind === "club" && (own.has("audit.read") || own.has("mandates.manage")) && <Privacy locale={locale} embedded />}
          {/* 12: seasons, teams and the season's passage (the former « Gestion du club »). */}
          {shown && category === "seasons" && <People locale={locale} management embedded />}
          {/* 8: the start-of-season check, launched and followed here. */}
          {shown && category === "seasons" && <SeasonCheckPanel locale={locale} />}
          {/* 16: the yearly assistant, for the presidency. */}
          {shown && category === "seasons" && ws?.selected?.role === "club_president" && (
            <Card title={seasonPlanCopy[locale].settingsTitle} labelledBy="settings-season-plan" headingId="settings-season-plan">
              <p className="muted">{seasonPlanCopy[locale].settingsText}</p>
              <p>
                <Link className="button" href={`/${locale}/club/season-plan`}>
                  {seasonPlanCopy[locale].settingsTitle}
                </Link>
              </p>
            </Card>
          )}
          {shown && category === "seasons" && (
            <Card title={h.rolloverTitle} labelledBy="settings-rollover" headingId="settings-rollover">
              <p className="muted">{h.rolloverText}</p>
              <p>
                <Link href={`/${locale}/club/rollover`}>{h.rolloverLink}</Link>
              </p>
            </Card>
          )}
          {shown && category === "members" && !manage && !(gov && (gov.can.profiles || gov.profiles.length > 0)) && <EmptyState title={t.noMember} />}

          {shown && category === "account" && manage && ws.selected?.role === "club_president" && people && (
            <Card title={t.selfTitle} labelledBy="settings-self" headingId="settings-self">
              <p className="muted">{t.selfIntro}</p>
              {isCoach && (
                <p>
                  <Badge tone="success">
                    {t.selfDone}
                  </Badge>
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
            </Card>
          )}
          {shown && category === "members" && manage && (
            <Card
              title={t.accessTitle}
              subtitle={t.accessIntro}
              id="settings-access"
              actions={
                // Wave 17 (G2): the members and their rights, as listed here.
                ws.selected && (
                  <ExportButton
                    locale={locale}
                    organizationId={ws.selected.organization_id}
                    dataset="members"
                    subject={h.categories.members.title}
                    rows={members}
                    columns={[
                      { id: "name", label: exportCopy[locale].name, value: (m) => m.name },
                      { id: "role", label: exportCopy[locale].role, value: (m) => t.roles[m.role] ?? m.role },
                      { id: "team", label: exportCopy[locale].team, value: (m) => teams.find((x) => x.id === m.team_id)?.name ?? "" },
                      { id: "rights", label: exportCopy[locale].rights, value: (m) => rightsSummary(locale, m.grants) },
                      { id: "until", label: exportCopy[locale].until, type: "date", value: (m) => m.valid_until?.slice(0, 10) ?? null },
                    ]}
                  />
                )
              }
            >
              <p className="muted small">{t.whatTheySee}</p>
              {coaches.length ? (
                <div className="table-scroll">
                  <table className="compact-table rights-table">
                    <tbody>
                      {coaches.map((m) => {
                        const summary = rightsSummary(locale, m.grants);
                        return (
                          <tr key={m.id}>
                            <th scope="row">
                              <strong>{m.name}</strong>
                              <span className="muted small"> · {t.roles[m.role] ?? m.role}</span>
                              {m.team_id && (
                                <span className="muted small">
                                  {" "}· {teams.find((x) => x.id === m.team_id)?.name ?? ""}
                                </span>
                              )}
                              <span className="muted small"> · {durationText(locale, m.valid_until)}</span>
                            </th>
                            <td className="rights-summary">
                              {summary ? (
                                summary.split(" · ").map((part) => (
                                  <Badge key={part} tone="brand">{part}</Badge>
                                ))
                              ) : (
                                <span className="muted">{t.noRights}</span>
                              )}
                            </td>
                            <td className="row-actions">
                              <button type="button" className="button secondary" onClick={() => setEditingMember(m.id)}>
                                {t.editRights}
                                <span className="sr-only"> : {m.name}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title={t.noMember} />
              )}
              {others.length > 0 && (
                <details className="others-box">
                  <summary>
                    {t.othersTitle} ({others.length})
                  </summary>
                  <p className="muted small">{t.othersIntro}</p>
                  <ul className="inline-list">
                    {others.map((m) => (
                      <li key={m.id}>
                        {m.name} <span className="muted small">· {t.roles[m.role] ?? m.role}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
          {category === "members" && manage && editingMember && (() => {
            const m = members.find((x) => x.id === editingMember);
            if (!m) return null;
            const chosen = new Set(draft[m.id] ?? m.grants);
            const apply = (list: readonly string[]) =>
              setDraft({ ...draft, [m.id]: list.filter((x) => own.has(x)) });
            return (
              <Modal title={`${t.rightsOf} ${m.name}`} close={() => setEditingMember("")}>
                {m.role === "coach" && teams.length > 0 && (
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const team = new FormData(e.currentTarget).get("team") as string;
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
                      <select id={`scope-${m.id}`} name="team" defaultValue={m.team_id ?? ""}>
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
                <div className="preset-row" role="group" aria-label={`${g.apply} : ${m.name}`}>
                  <span className="muted">{t.presets}</span>
                  {Object.keys(builtInProfiles).map((k) => (
                    <button key={k} type="button" className="chip-button" onClick={() => apply(builtInProfiles[k])}>
                      {g.profiles[k]}
                    </button>
                  ))}
                  {(gov?.profiles ?? []).map((x) => (
                    <button key={x.id} type="button" className="chip-button" data-club="true" onClick={() => apply(x.grants)}>
                      {x.name}
                    </button>
                  ))}
                </div>
                <ModuleRights
                  locale={locale}
                  id={m.id}
                  grants={[...chosen]}
                  own={own}
                  onChange={(next: Grant[]) => setDraft({ ...draft, [m.id]: next })}
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    // « Jusqu'à nouvel ordre » unless an end date is chosen (wave 17, G3).
                    const until = readDuration(new FormData(e.currentTarget), "until");
                    const same = (until ?? "").slice(0, 10) === (m.valid_until ?? "").slice(0, 10);
                    void post("/api/workspace", { action: "grants", id: m.id, grants: [...chosen].filter((x) => own.has(x)) }, t.grantsSaved)
                      .then((ok) => (ok && !same ? post("/api/workspace", { action: "renew", id: m.id, validUntil: until }, t.grantsSaved) : ok))
                      .then((ok) => ok && setEditingMember(""));
                  }}
                >
                  <DurationField locale={locale} name="until" initial={m.valid_until} />
                  <div className="actions">
                    <button className="button" disabled={busy}>
                      {t.saveGrants}
                      <span className="sr-only"> : {m.name}</span>
                    </button>
                  </div>
                </form>
              </Modal>
            );
          })()}
          {shown && category === "members" && gov && (gov.can.profiles || gov.profiles.length > 0) && (
            <ProfilesPanel
              locale={locale}
              gov={gov}
              own={own}
              busy={busy}
              post={post}
            />
          )}
          {shown && category === "activities" && gov?.can.presence && (
            <PresencePanel locale={locale} gov={gov} busy={busy} post={post} />
          )}
          {shown && category === "activities" && gov?.can.presence && <TeamPlacesSettings locale={locale} />}
          {shown && category === "activities" && <EventTypesSettings locale={locale} />}
          {/* H9: the holidays of reference, the closures and the season planner. */}
          {shown && category === "activities" && (
            <Card title={seasonScheduleCopy[locale].referenceTitle} labelledBy="settings-holidays" headingId="settings-holidays">
              <p className="muted">{seasonScheduleCopy[locale].settingsText}</p>
              <p>
                <Link className="button" href={`/${locale}/calendar/season`}>
                  {seasonScheduleCopy[locale].open}
                </Link>
              </p>
            </Card>
          )}
          {/* Wave 17 (O1): the task templates (transport, training…), for those who plan. */}
          {shown && category === "activities" && <TaskTemplates locale={locale} />}
          {/* 28: the parental authorizations' texts. */}
          {shown && category === "documents" && <AuthorizationSettings locale={locale} />}
          {shown && category === "money" && gov?.can.presence && !gov.disabled.includes("dues") && (
            <DuesSettingsPanel locale={locale} organizationId={gov.organizationId} rules={gov.dues} busy={busy} post={post} />
          )}
          {shown && category === "money" && gov && !gov.disabled.includes("finance") && <FiscalYearPanel locale={locale} />}
          {shown && category === "journals" && gov?.can.rightsJournal && <Journal locale={locale} kind="rights" />}
          {shown && category === "journals" && gov?.can.healthJournal && <Journal locale={locale} kind="health" />}
        </div>
      </div>
      {leaving && (
        <Modal title={h.unsavedTitle} close={() => setLeaving(null)}>
          <p>{h.unsavedText}</p>
          <div className="actions">
            <Button
              variant="danger"
              onClick={() => {
                dirty.current = false;
                const target = leaving;
                setLeaving(null);
                router.push(target);
              }}
            >
              {h.leave}
            </Button>
            <Button variant="secondary" onClick={() => setLeaving(null)}>
              {h.stay}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
