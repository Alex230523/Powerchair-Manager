"use client";
import { useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { federationTeamsView } from "@/domains/federation/clubs";
import { errors } from "./access-copy";
import { federationCopy } from "./federation-copy";
import { Button, EmptyState, PageHeader, Toolbar } from "./ui";
import { downloadCsv } from "./data-grid";

type View = Awaited<ReturnType<typeof federationTeamsView>>;

/** Federation (wave 16, I3): every affiliated club's teams this season, read only, with filters and a CSV export. */
export function FederationTeams({ locale }: { locale: Locale }) {
  const t = federationCopy[locale].teams,
    c = federationCopy[locale].clubs;
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [category, setCategory] = useState(""),
    [level, setLevel] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/federation/teams", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (live) setView(v);
      })
      .catch((e: Error) => live && setError(["FEDERATION_ONLY", "FORBIDDEN"].includes(e.message) ? c.federationOnly : (errors[e.message]?.[locale] ?? c.failed)));
    return () => {
      live = false;
    };
  }, [locale, c.federationOnly, c.failed]);
  const values = (k: "category" | "level") => [...new Set((view?.teams ?? []).map((x) => x[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale));
  const shown = useMemo(() => (view?.teams ?? []).filter((x) => (!category || x.category === category) && (!level || x.level === level)), [view, category, level]);
  const head = [t.club, t.team, t.category, t.level, t.players, t.licensed, t.coaches];
  return (
    <main id="main" className="access federation-teams">
      <PageHeader title={t.title} subtitle={view ? t.intro(view.season) : undefined} />
      {error && <p role="alert">{error}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view &&
        (view.teams.length ? (
          <>
            <Toolbar
              label={t.title}
              actions={
                <Button
                  variant="secondary"
                  onClick={() => downloadCsv(`equipes-${view.season}`, head, shown.map((x) => [x.club, x.name, x.category, x.level, x.players, x.licensed, x.coaches]))}
                >
                  {t.export}
                </Button>
              }
            >
              <label className="compact-field">
                {t.category}
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{t.allCategories}</option>
                  {values("category").map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="compact-field">
                {t.level}
                <select value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="">{t.allLevels}</option>
                  {values("level").map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </Toolbar>
            <p role="status" className="muted">
              {t.count(shown.length)}
            </p>
            {shown.length ? (
              <div className="table-scroll" role="region" aria-label={t.title} tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t.club}</th>
                      <th scope="col">{t.team}</th>
                      <th scope="col">{t.category}</th>
                      <th scope="col">{t.level}</th>
                      <th scope="col" className="num">
                        {t.players}
                      </th>
                      <th scope="col" className="num">
                        {t.licensed}
                      </th>
                      <th scope="col">{t.coaches}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((x) => (
                      <tr key={x.id}>
                        <td>{x.club}</td>
                        <th scope="row">{x.name}</th>
                        <td>{x.category || <span className="muted">{t.none}</span>}</td>
                        <td>{x.level || <span className="muted">{t.none}</span>}</td>
                        <td className="num">{x.players}</td>
                        <td className="num">{x.licensed}</td>
                        <td>{x.coaches || <span className="muted">{t.none}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={t.noMatch} />
            )}
          </>
        ) : (
          <EmptyState title={t.empty} />
        ))}
    </main>
  );
}
