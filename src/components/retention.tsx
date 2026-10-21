"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { useData } from "./use-api";
import { Card, DataTable, EmptyState, KpiCard, Segmented } from "./ui";
import { ChartFrame, StackedBarChart, type ChartSeries } from "./charts";
import { retentionCopy, statisticsCopy } from "./statistics-copy";

type Row = {
  season: string;
  members: number;
  stayed: number | null;
  joined: number | null;
  left: number | null;
  rate: number | null;
};
type Headcount = {
  season: string;
  total: number;
  teams: { name: string; color: string | null; count: number }[];
  categories: { name: string; count: number }[];
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const palette = (i: number) => `var(--chart-${(i % 8) + 1})`;

/**
 * Players per season (wave 15, 2.6): stacked bars over the last five seasons,
 * by team or by category, with the retention rate beside them. Shown to those
 * who see the directory; the table view keeps who stayed, joined and left.
 */
export function SeasonHeadcount({ locale }: { locale: Locale }) {
  const t = statisticsCopy[locale],
    r = retentionCopy[locale];
  const failure = useCallback(() => "", []);
  const { data } = useData<{ seasons: Row[]; headcount: Headcount[] }>("/api/statistics/retention", failure);
  const [split, setSplit] = useState<"team" | "category">("team");
  if (!data) return null;
  const seasons = data.headcount;
  const retention = data.seasons.slice(-seasons.length);
  const last = [...data.seasons].reverse().find((x) => x.rate !== null) ?? null;
  // One series per team name (teams are per season) or per category, in order of appearance.
  const keys: { id: string; label: string; color: string }[] = [];
  for (const s of seasons)
    for (const item of split === "team" ? s.teams : s.categories) {
      const id = item.name;
      if (keys.some((k) => k.id === id)) continue;
      const teamColor = split === "team" && "color" in item && item.color ? `var(--team-${item.color}-border)` : null;
      keys.push({ id, label: id || t.noCategory, color: teamColor ?? palette(keys.length) });
    }
  const series: ChartSeries[] = keys.map((k) => ({
    ...k,
    values: seasons.map((s) => (split === "team" ? s.teams.find((x) => x.name === k.id)?.count : s.categories.find((x) => x.name === k.id)?.count) ?? 0),
  }));
  const categories = seasons.map((s) => s.season);
  const summary = `${t.headcountSummary} : ${seasons.map((s) => `${s.season} ${s.total} ${t.players}`).join(", ")}`;
  return (
    <div className="headcount-row">
      <Card
        title={t.headcount}
        subtitle={t.headcountIntro}
        id="stats-headcount"
        actions={
          <Segmented
            label={t.split}
            items={[
              { id: "team", label: t.byTeam },
              { id: "category", label: t.byCategory },
            ]}
            value={split}
            onChange={(v) => setSplit(v as "team" | "category")}
          />
        }
      >
        {!seasons.some((s) => s.total > 0) ? (
          <EmptyState icon="chart" title={t.headcountEmpty} />
        ) : (
          <ChartFrame
            locale={locale}
            legend={keys}
            table={
              <DataTable label={t.headcount}>
                <thead>
                  <tr>
                    <th scope="col">{r.season}</th>
                    {keys.map((k) => (
                      <th scope="col" className="num" key={k.id}>{k.label}</th>
                    ))}
                    <th scope="col" className="num">{t.total}</th>
                    <th scope="col" className="num">{r.stayed}</th>
                    <th scope="col" className="num">{r.joined}</th>
                    <th scope="col" className="num">{r.left}</th>
                    <th scope="col" className="num">{r.rate}</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s, i) => {
                    const ret = retention[i];
                    return (
                      <tr key={s.season}>
                        <th scope="row">{s.season}</th>
                        {series.map((k) => (
                          <td className="num" key={k.id}>{k.values[i]}</td>
                        ))}
                        <td className="num"><strong>{s.total}</strong></td>
                        <td className="num">{ret?.stayed ?? "…"}</td>
                        <td className="num">{ret?.joined ?? "…"}</td>
                        <td className="num">{ret?.left ?? "…"}</td>
                        <td className="num">{ret?.rate === null || ret?.rate === undefined ? "…" : `${ret.rate} %`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            }
          >
            {(hidden) => <StackedBarChart locale={locale} summary={summary} categories={categories} segments={series.filter((s) => !hidden.has(s.id))} />}
          </ChartFrame>
        )}
      </Card>
      <KpiCard
        label={t.loyalty}
        value={last ? `${last.rate} %` : "…"}
        icon="players"
        tone="success"
        description={last ? `${last.season} · ${fill(t.loyaltyHint, { stayed: last.stayed ?? 0, joined: last.joined ?? 0, left: last.left ?? 0 })}` : t.loyaltyNone}
      />
    </div>
  );
}
