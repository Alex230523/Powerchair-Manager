"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { tournamentsView } from "@/domains/tournaments/service";
import { defaultRules, formats, tiebreaks, type Format, type Rules } from "@/domains/tournaments/schema";
import { Badge, Button, Card, EmptyState, Field, PageHeader } from "./ui";
import { Modal } from "./modal";
import { Icon } from "./icons";
import { showToast } from "./toast";
import { useData, usePost } from "./use-api";
import { fill, tournamentsCopy, type TournamentsCopy } from "./tournaments-copy";
import { ClubTournaments } from "./club-tournaments";

type View = Awaited<ReturnType<typeof tournamentsView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
export const shortDate = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
export const longDate = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(tag(locale), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
export const tournamentFailure = (t: TournamentsCopy) => (code: string) => t.errors[code] ?? t.errors.UNAVAILABLE;

/** The tournaments page: add, change the year, the gallery, then one card per tournament. */
export function Tournaments({ locale, initialYear }: { locale: Locale; initialYear: number }) {
  const t = tournamentsCopy[locale];
  const [year, setYear] = useState(initialYear);
  const failure = useCallback((code: string) => tournamentFailure(t)(code), [t]);
  const { data, error, setError, denied, reload } = useData<View>(`/api/tournaments?year=${year}`, failure);
  const { busy, post, postFor } = usePost("/api/tournaments", reload, setError, failure);
  const [creating, setCreating] = useState(false);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [teamIds, setTeamIds] = useState<Record<string, string>>({});
  const changeYear = (y: number) => {
    setYear(y);
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(y));
    history.replaceState(null, "", url);
  };
  return (
    <main id="main" className="access tournaments">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <>
            <label className="year-picker">
              <span>{t.year}</span>
              <select value={year} onChange={(e) => changeYear(Number(e.target.value))}>
                {(data?.years ?? [year]).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Link className="button secondary" href={`/${locale}/tournaments/trophies`}>
              <Icon name="trophy" size={16} /> {t.gallery}
            </Link>
            {data?.canCreate && (
              <Button icon="plus" onClick={() => setCreating(true)}>
                {t.add}
              </Button>
            )}
          </>
        }
      />
      {error && <p role="alert">{error}</p>}
      {denied && <p className="notice">{t.errors.FORBIDDEN}</p>}
      {!data && !denied && !error && <p role="status" className="muted">{t.loading}</p>}
      {data && data.invitations.length > 0 && (
        <Card title={t.invitations} subtitle={t.invitationsText} icon="inbox" className="tournament-invitations">
          <ul className="plain-list invitation-list">
            {data.invitations.map((i) => (
              <li key={i.id}>
                <div>
                  <Link href={`/${locale}/tournaments/${i.id}`}>
                    <strong>{i.name}</strong>
                  </Link>{" "}
                  <span className="muted">
                    {i.year} · {fill(t.organisedBy, { name: i.owner_name })}
                  </span>
                </div>
                <Field id={"team-" + i.id} label={t.teamName} help={t.teamNameHelp}>
                  <input
                    id={"team-" + i.id}
                    maxLength={120}
                    aria-describedby={"team-" + i.id + "-help"}
                    value={teamNames[i.id] ?? ""}
                    onChange={(e) => setTeamNames({ ...teamNames, [i.id]: e.target.value })}
                  />
                </Field>
                {data.myTeams.length > 0 && (
                  <Field id={"squad-" + i.id} label={t.team} help={t.teamHelp}>
                    <select id={"squad-" + i.id} value={teamIds[i.id] ?? ""} onChange={(e) => setTeamIds({ ...teamIds, [i.id]: e.target.value })} aria-describedby={"squad-" + i.id + "-help"}>
                      <option value="">{t.teamNone}</option>
                      {data.myTeams.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="actions">
                  <Button
                    disabled={busy}
                    onClick={() => void post({ action: "respond", id: i.id, accept: true, teamName: teamNames[i.id] ?? "", teamId: teamIds[i.id] || null, organizationId: data.organization_id }, t.acceptedDone).then((ok) => ok && showToast({ message: t.acceptedDone, icon: "check" }))}
                  >
                    {t.accept}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void post({ action: "respond", id: i.id, accept: false, teamName: "", organizationId: data.organization_id }, t.declinedDone).then((ok) => ok && showToast({ message: t.declinedDone, icon: "check" }))}
                  >
                    {t.decline}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data &&
        (data.tournaments.length ? (
          <ul className="tournament-grid" aria-label={t.title}>
            {data.tournaments.map((x) => (
              <li key={x.id}>
              <Card href={`/${locale}/tournaments/${x.id}`} title={x.name} subtitle={fill(t.organisedBy, { name: x.owner })} icon="trophy" className="tournament-card">
                <p className="tournament-badges">
                  <Badge tone={x.status === "open" ? "success" : "neutral"}>{x.status === "open" ? t.open : t.finished}</Badge>
                  <Badge tone="info">{t.formats[x.format]}</Badge>
                  {x.myStatus && <Badge tone={x.myStatus === "invited" ? "warning" : x.myStatus === "accepted" ? "primary" : "neutral"}>{t[x.myStatus]}</Badge>}
                </p>
                <dl className="tournament-facts">
                  <div>
                    <dt className="sr-only">{t.dayDate}</dt>
                    <dd>
                      <Icon name="calendar" size={14} />{" "}
                      {x.firstDay ? (x.firstDay === x.lastDay ? shortDate(locale, x.firstDay) : `${shortDate(locale, x.firstDay)} · ${shortDate(locale, x.lastDay!)}`) : t.noDates}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t.clubs}</dt>
                    <dd>
                      <Icon name="club" size={14} /> {fill(t.clubsCount, { n: x.clubs })} · {fill(t.days, { n: x.days })}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t.matchDays}</dt>
                    <dd>
                      <Icon name="chart" size={14} /> {fill(t.matchesPlayed, { played: x.played, total: x.matches })}
                    </dd>
                  </div>
                  {x.status === "open" && x.nextDay && (
                    <div>
                      <dt className="sr-only">{t.nextDay}</dt>
                      <dd className="tournament-next">{fill(t.nextDay, { date: shortDate(locale, x.nextDay) })}</dd>
                    </div>
                  )}
                </dl>
                {x.podium.length > 0 && (
                  <ol className="mini-podium" aria-label={t.podium}>
                    {x.podium.map((p) => (
                      <li key={p.rank} data-rank={p.rank}>
                        <span className="podium-rank">{(x.format === "league" || x.format === "custom" ? t.ranksLeague : t.ranks)[p.rank]}</span> {p.name}
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="trophy" title={t.none} text={t.noneText} action={data.canCreate ? <Button icon="plus" onClick={() => setCreating(true)}>{t.add}</Button> : undefined} />
        ))}
      {data?.clubTrips && <ClubTournaments locale={locale} trips={data.clubTrips} organizationId={data.organization_id} reload={reload} />}
      {creating && data && (
        <TournamentForm
          locale={locale}
          busy={busy}
          year={year}
          clubOptions={data.clubOptions}
          close={() => setCreating(false)}
          submit={async (body) => {
            const r = await postFor({ action: "create", ...body, organizationId: data.organization_id }, t.created);
            if (r?.id) {
              showToast({ message: t.created, icon: "check" });
              window.location.assign(`/${locale}/tournaments/${r.id}`);
            }
          }}
        />
      )}
    </main>
  );
}

export type TournamentFields = { name: string; year: number; format: Format; rules: Rules; description: string; clubs: string[]; tier: number };

/** Create or edit: name, year, type, rules that follow the type, description, clubs to invite. */
export function TournamentForm({
  locale,
  busy,
  year,
  clubOptions,
  initial,
  close,
  submit,
}: {
  locale: Locale;
  busy: boolean;
  year: number;
  clubOptions: { id: string; name: string; affiliated: boolean }[];
  initial?: Omit<TournamentFields, "clubs">;
  close: () => void;
  submit: (body: TournamentFields) => Promise<void>;
}) {
  const t = tournamentsCopy[locale];
  const [format, setFormat] = useState<Format>(initial?.format ?? "league");
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const rules = initial?.rules ?? defaultRules;
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: keyof Rules) => Number(f.get(k));
    void submit({
      name: String(f.get("name") ?? ""),
      year: Number(f.get("year")),
      format,
      tier: Number(f.get("tier") ?? 0),
      description: String(f.get("description") ?? ""),
      rules: {
        legs: n("legs") === 2 ? 2 : 1,
        groups: f.has("groups") ? n("groups") : rules.groups,
        qualifiers: f.has("qualifiers") ? n("qualifiers") : rules.qualifiers,
        win: n("win"),
        draw: n("draw"),
        loss: n("loss"),
        halves: n("halves"),
        halfMinutes: n("halfMinutes"),
        tiebreak: String(f.get("tiebreak")) as Rules["tiebreak"],
        shootout: f.has("shootout"),
        other: String(f.get("other") ?? ""),
      },
      clubs: chosen,
    });
  }
  const shown = clubOptions.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const knockout = format === "knockout" || format === "groups_knockout";
  return (
    <Modal title={initial ? t.editTitle : t.newTitle} close={close} className="player-dialog tournament-dialog">
      <form onSubmit={onSubmit} className="tournament-form">
        <Field id="t-name" label={t.name} required>
          <input id="t-name" name="name" required minLength={2} maxLength={120} defaultValue={initial?.name} />
        </Field>
        <div className="form-pair">
          <Field id="t-year" label={t.year} required>
            <input id="t-year" name="year" type="number" min={2000} max={2100} required defaultValue={initial?.year ?? year} />
          </Field>
          <Field id="t-format" label={t.format} required>
            <select id="t-format" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              {formats.map((f) => (
                <option key={f} value={f}>
                  {t.formats[f]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="t-tier" label={t.tier} help={t.tierHelp}>
          <select id="t-tier" name="tier" defaultValue={String(initial?.tier ?? 0)} aria-describedby="t-tier-help">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t.tiers[n] ?? String(n)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend>{t.rules}</legend>
          <div className="form-pair">
            {(format === "league" || format === "custom") && (
              <Field id="t-legs" label={t.legs}>
                <select id="t-legs" name="legs" defaultValue={rules.legs}>
                  <option value={1}>{t.legsOne}</option>
                  <option value={2}>{t.legsTwo}</option>
                </select>
              </Field>
            )}
            {format === "groups_knockout" && (
              <>
                <Field id="t-groups" label={t.groups}>
                  <input id="t-groups" name="groups" type="number" min={1} max={8} defaultValue={rules.groups} />
                </Field>
                <Field id="t-qualifiers" label={t.qualifiers}>
                  <input id="t-qualifiers" name="qualifiers" type="number" min={1} max={8} defaultValue={rules.qualifiers} />
                </Field>
              </>
            )}
            {format !== "knockout" && (
              <>
                <Field id="t-win" label={t.win}>
                  <input id="t-win" name="win" type="number" min={0} max={5} defaultValue={rules.win} />
                </Field>
                <Field id="t-draw" label={t.draw}>
                  <input id="t-draw" name="draw" type="number" min={0} max={5} defaultValue={rules.draw} />
                </Field>
                <Field id="t-loss" label={t.loss}>
                  <input id="t-loss" name="loss" type="number" min={0} max={5} defaultValue={rules.loss} />
                </Field>
                <Field id="t-tiebreak" label={t.tiebreak}>
                  <select id="t-tiebreak" name="tiebreak" defaultValue={rules.tiebreak}>
                    {tiebreaks.map((x) => (
                      <option key={x} value={x}>
                        {t.tiebreaks[x]}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {format === "knockout" && (
              <>
                <input type="hidden" name="win" value={rules.win} />
                <input type="hidden" name="draw" value={rules.draw} />
                <input type="hidden" name="loss" value={rules.loss} />
                <input type="hidden" name="tiebreak" value={rules.tiebreak} />
              </>
            )}
            <Field id="t-halves" label={t.halves}>
              <input id="t-halves" name="halves" type="number" min={1} max={4} defaultValue={rules.halves} />
            </Field>
            <Field id="t-minutes" label={t.halfMinutes}>
              <input id="t-minutes" name="halfMinutes" type="number" min={5} max={45} defaultValue={rules.halfMinutes} />
            </Field>
          </div>
          {knockout && (
            <label className="check">
              <input type="checkbox" name="shootout" defaultChecked={rules.shootout} /> {t.shootout}
            </label>
          )}
          <Field id="t-other" label={t.other}>
            <textarea id="t-other" name="other" maxLength={1000} rows={3} defaultValue={rules.other} />
          </Field>
        </fieldset>
        <Field id="t-description" label={t.description}>
          <textarea id="t-description" name="description" maxLength={2000} rows={3} defaultValue={initial?.description} />
        </Field>
        {!initial && clubOptions.length > 0 && (
          <ClubPicker locale={locale} options={shown} filter={filter} setFilter={setFilter} chosen={chosen} setChosen={setChosen} />
        )}
        <div className="actions">
          <Button type="submit" loading={busy}>
            {initial ? t.save : t.create}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Checkboxes of clubs, the federation's first, with a filter. */
export function ClubPicker({
  locale,
  options,
  filter,
  setFilter,
  chosen,
  setChosen,
}: {
  locale: Locale;
  options: { id: string; name: string; affiliated: boolean }[];
  filter: string;
  setFilter: (v: string) => void;
  chosen: string[];
  setChosen: (v: string[]) => void;
}) {
  const t = tournamentsCopy[locale];
  const groups = [
    { label: t.affiliated, items: options.filter((c) => c.affiliated) },
    { label: t.otherClubs, items: options.filter((c) => !c.affiliated) },
  ].filter((g) => g.items.length);
  return (
    <fieldset className="club-picker">
      <legend>{t.inviteClubs}</legend>
      <p className="muted">{t.inviteHelp}</p>
      <Field id="t-club-filter" label={t.search}>
        <input id="t-club-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Field>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="chair-subtitle">{g.label}</p>
          <ul className="plain-list club-options">
            {g.items.map((c) => (
              <li key={c.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))}
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
