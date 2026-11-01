"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { teamsView } from "@/domains/teams/service";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { teamsCopy } from "./teams-copy";
import { Button, Card, DataTable } from "./ui";

type View = Awaited<ReturnType<typeof teamsView>>;

/** Settings > Activities > Places per team (wave 16, R1): every team of the season, edited in place. */
export function TeamPlacesSettings({ locale }: { locale: Locale }) {
  const t = teamsCopy[locale] as (typeof teamsCopy)["fr"];
  const p = t.places;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/teams", failure);
  const { busy, message, post } = usePost("/api/teams", reload, setError, failure);
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const teams = data.teams.filter((x) => !x.archived);
  const value = (id: string, capacity: number | null) => draft[id] ?? (capacity === null ? "" : String(capacity));
  return (
    <Card title={p.title} subtitle={p.intro} labelledBy="settings-team-places" headingId="settings-team-places" className="flush">
      {teams.length === 0 ? (
        <p className="muted card-padded">{p.none}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void post(
              {
                organizationId: data.organization_id,
                action: "capacities",
                items: teams.map((x) => {
                  const v = value(x.id, x.capacity).trim();
                  return { id: x.id, capacity: v ? Number(v) : null };
                }),
              },
              p.saved,
            ).then((ok) => ok && setDraft({}));
          }}
        >
          <DataTable label={p.title}>
            <thead>
              <tr>
                <th scope="col">{p.team}</th>
                <th scope="col" className="num">
                  {p.capacity}
                </th>
                <th scope="col" className="num">
                  {p.current}
                </th>
                <th scope="col" className="num">
                  {p.free}
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((x) => {
                const v = value(x.id, x.capacity).trim();
                const max = v ? Number(v) : null;
                return (
                  <tr key={x.id}>
                    <th scope="row">
                      <span className="team-chip" data-color={x.color ?? "none"}>
                        <span className="team-dot" aria-hidden="true" />
                        {x.name}
                      </span>
                    </th>
                    <td className="num">
                      <input
                        className="places-input"
                        type="number"
                        min={1}
                        max={100}
                        inputMode="numeric"
                        aria-label={`${p.capacity} : ${x.name}`}
                        disabled={!data.can.manage}
                        value={value(x.id, x.capacity)}
                        onChange={(e) => setDraft({ ...draft, [x.id]: e.target.value })}
                      />
                    </td>
                    <td className="num">{x.players}</td>
                    <td className="num">{max === null ? p.unlimited : max - x.players}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {data.can.manage && (
            <div className="actions card-padded">
              <Button type="submit" loading={busy}>
                {t.sheet.save}
              </Button>
              {message && <span role="status">{message}</span>}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
