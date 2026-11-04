"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { SeasonOption, TeamOption } from "@/domains/scope/service";
import { defaultSeasonId, isUuid, resolve } from "@/domains/scope/resolve";
export { defaultSeasonId, resolve };

/**
 * The season and team the member is looking at (wave 12). The choice lives
 * in the URL (?season=&team=), so a shared link keeps it, and in the browser
 * (localStorage pfm-scope-<organisation>), so it is found again next time.
 * Pages read it with useScope(); the server validates it on its side.
 */
export type ScopeValue = {
  organizationId: string | null;
  /** B8: the club is approved for tax receipts (the module shows only then). */
  taxApproved: boolean;
  /** 35: the federation's own management (no dues, no tax receipts, no affiliations to pay). */
  federation: boolean;
  seasons: SeasonOption[];
  teams: TeamOption[];
  seasonId: string | null;
  teamId: string | null;
  /** The teams of the chosen season. */
  seasonTeams: TeamOption[];
  season: SeasonOption | null;
  team: TeamOption | null;
  setSeason: (id: string | null) => void;
  setTeam: (id: string | null) => void;
};
const empty: ScopeValue = {
  organizationId: null,
  taxApproved: false,
  federation: false,
  seasons: [],
  teams: [],
  seasonId: null,
  teamId: null,
  seasonTeams: [],
  season: null,
  team: null,
  setSeason: () => {},
  setTeam: () => {},
};
const ScopeContext = createContext<ScopeValue>(empty);
export const storageKey = (org: string) => `pfm-scope-${org}`;
export function readStored(org: string): { season?: string; team?: string } {
  return parseStored(readRaw(org));
}
function readRaw(org: string) {
  try {
    return window.localStorage.getItem(storageKey(org)) ?? "";
  } catch {
    return "";
  }
}
function parseStored(raw: string): { season?: string; team?: string } {
  try {
    const v = JSON.parse(raw || "{}");
    return {
      season: isUuid(v.season) ? v.season : undefined,
      team: isUuid(v.team) ? v.team : undefined,
    };
  } catch {
    return {};
  }
}
function store(org: string, scope: { season: string | null; team: string | null }) {
  try {
    window.localStorage.setItem(storageKey(org), JSON.stringify(scope));
  } catch {
    /* Private mode or quota: the URL still carries the choice. */
  }
}
const scopeEvent = "pfm-scope";
function subscribe(onChange: () => void) {
  window.addEventListener(scopeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(scopeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}
/** The browser's memory of the choice, read after hydration (the server knows nothing of it). */
function useStored(org: string | null) {
  const raw = useSyncExternalStore(
    subscribe,
    () => (org ? readRaw(org) : ""),
    () => "",
  );
  return useMemo(() => parseStored(raw), [raw]);
}
type Raw = { season?: string | null; team?: string | null };
/** Reads ?season= and ?team= (inside its own Suspense boundary, as Next asks). */
function UrlReader({ onChange }: { onChange: (raw: Raw) => void }) {
  const params = useSearchParams();
  const season = params.get("season"),
    team = params.get("team");
  useEffect(() => {
    onChange({ season, team });
  }, [season, team, onChange]);
  return null;
}
export function ScopeProvider({
  organizationId,
  taxApproved = false,
  federation = false,
  seasons,
  teams,
  children,
}: {
  organizationId: string | null;
  taxApproved?: boolean;
  federation?: boolean;
  seasons: SeasonOption[];
  teams: TeamOption[];
  children: ReactNode;
}) {
  const router = useRouter(),
    path = usePathname();
  const [url, setUrl] = useState<Raw>({});
  const stored = useStored(organizationId);
  const { seasonId, teamId } = resolve(seasons, teams, {
    season: url.season ?? stored.season,
    team: url.team ?? stored.team,
  });
  const navigate = useCallback(
    (season: string | null, team: string | null) => {
      if (!organizationId) return;
      store(organizationId, { season, team });
      const next = new URLSearchParams(window.location.search);
      const seasonDefault = defaultSeasonId(seasons);
      if (season && season !== seasonDefault) next.set("season", season);
      else next.delete("season");
      if (team) next.set("team", team);
      else next.delete("team");
      const q = next.toString();
      router.replace(q ? `${path}?${q}` : path, { scroll: false });
      window.dispatchEvent(new Event(scopeEvent));
    },
    [organizationId, path, router, seasons],
  );
  useEffect(() => {
    // A shared link's choice is remembered too.
    if (organizationId && (url.season || url.team)) {
      store(organizationId, { season: seasonId, team: teamId });
      window.dispatchEvent(new Event(scopeEvent));
    }
  }, [organizationId, url.season, url.team, seasonId, teamId]);
  const value = useMemo<ScopeValue>(
    () => ({
      organizationId,
      taxApproved,
      federation,
      seasons,
      teams,
      seasonId,
      teamId,
      seasonTeams: teams.filter((t) => t.season_id === seasonId && !t.archived),
      season: seasons.find((s) => s.id === seasonId) ?? null,
      team: teams.find((t) => t.id === teamId) ?? null,
      setSeason: (id) => navigate(id, null),
      setTeam: (id) => navigate(seasonId, id),
    }),
    [organizationId, taxApproved, federation, seasons, teams, seasonId, teamId, navigate],
  );
  return (
    <ScopeContext.Provider value={value}>
      <Suspense fallback={null}>
        <UrlReader onChange={setUrl} />
      </Suspense>
      {children}
    </ScopeContext.Provider>
  );
}
/** What the member is looking at: season and team ids, with setters. */
export function useScope() {
  return useContext<ScopeValue>(ScopeContext);
}
/** Builds a link that keeps the current scope (used by the teams page to open a filtered page). */
export function scopedHref(base: string, scope: { seasonId: string | null; teamId: string | null }, seasons: SeasonOption[]) {
  const q = new URLSearchParams();
  if (scope.seasonId && scope.seasonId !== defaultSeasonId(seasons)) q.set("season", scope.seasonId);
  if (scope.teamId) q.set("team", scope.teamId);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * A page's own team filter, seeded by the top bar choice. When the member
 * changes it locally, `differs` is true and `apply` pushes the local choice
 * to the whole platform.
 */
/**
 * Local state re-seeded whenever `seed` changes, derived during render (no
 * effect, no extra paint): the page's filter follows the top bar until the
 * member touches it.
 */
export function useSeeded<T>(seed: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState({ seed, value: seed });
  const value = Object.is(state.seed, seed) ? state.value : seed;
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setState((s) => {
        const prev = Object.is(s.seed, seed) ? s.value : seed;
        return { seed, value: typeof next === "function" ? (next as (prev: T) => T)(prev) : next };
      }),
    [seed],
  );
  return [value, set];
}
export function useScopedTeam() {
  const scope = useScope();
  const global = scope.teamId ?? "";
  const [team, setTeam] = useSeeded(global);
  return {
    team,
    setTeam,
    differs: team !== global,
    apply: () => scope.setTeam(team || null),
  };
}
const applyCopy = { fr: "Appliquer à toute la plateforme", nl: "Overal toepassen", en: "Apply everywhere" };
/** The small link shown next to a local filter that differs from the top bar. */
export function ApplyScope({ locale, differs, apply }: { locale: "fr" | "nl" | "en"; differs: boolean; apply: () => void }) {
  if (!differs) return null;
  return (
    <button type="button" className="text-button apply-scope" onClick={apply}>
      {applyCopy[locale]}
    </button>
  );
}
