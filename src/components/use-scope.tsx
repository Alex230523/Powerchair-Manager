"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SeasonOption, TeamOption } from "@/domains/scope/service";

/**
 * The season and team the member is looking at (wave 12). The choice lives
 * in the URL (?season=&team=), so a shared link keeps it, and in the browser
 * (localStorage pfm-scope-<organisation>), so it is found again next time.
 * Pages read it with useScope(); the server validates it on its side.
 */
export type ScopeValue = {
  organizationId: string | null;
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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const storageKey = (org: string) => `pfm-scope-${org}`;
export function readStored(org: string): { season?: string; team?: string } {
  try {
    const v = JSON.parse(window.localStorage.getItem(storageKey(org)) ?? "{}");
    return {
      season: uuid.test(v.season ?? "") ? v.season : undefined,
      team: uuid.test(v.team ?? "") ? v.team : undefined,
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
/** The current season, or the latest open one, when nothing valid is chosen. */
export function defaultSeasonId(seasons: SeasonOption[]) {
  return seasons.find((s) => s.current)?.id ?? seasons.find((s) => !s.archived)?.id ?? seasons[0]?.id ?? null;
}
/** Pure resolution, shared with the tests: what the URL or the storage asked, checked against the lists. */
export function resolve(
  seasons: SeasonOption[],
  teams: TeamOption[],
  raw: { season?: string | null; team?: string | null },
) {
  const seasonId = raw.season && seasons.some((s) => s.id === raw.season) ? raw.season : defaultSeasonId(seasons);
  const team = raw.team ? teams.find((t) => t.id === raw.team && t.season_id === seasonId && !t.archived) : undefined;
  return { seasonId, teamId: team ? team.id : null };
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
  seasons,
  teams,
  children,
}: {
  organizationId: string | null;
  seasons: SeasonOption[];
  teams: TeamOption[];
  children: ReactNode;
}) {
  const router = useRouter(),
    path = usePathname();
  const [url, setUrl] = useState<Raw>({}),
    [stored, setStored] = useState<Raw>({});
  useEffect(() => {
    // The browser's memory is read after the first paint (nothing to hydrate against on the server).
    setStored(organizationId ? readStored(organizationId) : {});
  }, [organizationId]);
  const { seasonId, teamId } = resolve(seasons, teams, {
    season: url.season ?? stored.season,
    team: url.team ?? stored.team,
  });
  const navigate = useCallback(
    (season: string | null, team: string | null) => {
      if (!organizationId) return;
      store(organizationId, { season, team });
      setStored({ season, team });
      const next = new URLSearchParams(window.location.search);
      const seasonDefault = defaultSeasonId(seasons);
      if (season && season !== seasonDefault) next.set("season", season);
      else next.delete("season");
      if (team) next.set("team", team);
      else next.delete("team");
      const q = next.toString();
      router.replace(q ? `${path}?${q}` : path, { scroll: false });
      window.dispatchEvent(new Event("pfm-scope"));
    },
    [organizationId, path, router, seasons],
  );
  useEffect(() => {
    // A shared link's choice is remembered too.
    if (organizationId && (url.season || url.team)) store(organizationId, { season: seasonId, team: teamId });
  }, [organizationId, url.season, url.team, seasonId, teamId]);
  const value = useMemo<ScopeValue>(
    () => ({
      organizationId,
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
    [organizationId, seasons, teams, seasonId, teamId, navigate],
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
export function useScopedTeam() {
  const scope = useScope();
  const global = scope.teamId ?? "";
  const [team, setTeam] = useState(global);
  useEffect(() => {
    setTeam(global);
  }, [global]);
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
const wholeClubCopy = {
  fr: "Vue club entière : les montants ne sont pas découpés par équipe.",
  nl: "Hele club: de bedragen zijn niet per team opgesplitst.",
  en: "Whole club view: amounts are not split by team.",
};
/** Money pages (wave 12): a discreet note when a team is chosen, since amounts stay club-wide. */
export function WholeClubNote({ locale }: { locale: "fr" | "nl" | "en" }) {
  const scope = useScope();
  if (!scope.teamId) return null;
  return <p className="scope-note">{wholeClubCopy[locale]}</p>;
}
