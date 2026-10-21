"use client";
import { useCallback, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { bySeason, medalOf } from "@/domains/awards/schema";
import type { Award, awardsView } from "@/domains/awards/service";
import { useData } from "./use-api";
import { Badge, Button, Card, DataTable, EmptyState } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { ChartMenu } from "./chart-menu";
import { downloadCsv, exportPng, slug } from "./chart-export";
import { showToast } from "./toast";
import { errors } from "./access-copy";
import { fill, placeLabel, statisticsCopy } from "./statistics-copy";

type View = Awaited<ReturnType<typeof awardsView>>;
type Suggestion = View["suggestions"][number];
type Draft = Partial<Award> & { trip_id?: string | null };
const day = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
/** The three latest seasons by default; the « ... » menu shows the older ones. */
const recentSeasons = 3;

async function send(body: Record<string, unknown>) {
  const r = await fetch("/api/statistics/awards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v as { id: string };
}
const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("INVALID_FILE"));
    reader.readAsDataURL(file);
  });

/**
 * « Hall of fame » (wave 16, S1): the club's prizes as a timeline by season,
 * the latest on top; each prize with its medal and the place in words. The
 * tournaments that ended on the podium are suggested, never added alone.
 */
export function HallOfFame({ locale }: { locale: Locale }) {
  const t = statisticsCopy[locale],
    w = t.awards;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? w.failed, [locale, w.failed]);
  const { data, error, denied, reload } = useData<View>("/api/statistics/awards", failure);
  const [older, setOlder] = useState(false),
    [table, setTable] = useState(false),
    [editing, setEditing] = useState<Draft | null>(null),
    [removing, setRemoving] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  if (denied) return null;
  const groups = data ? bySeason(data.awards, w.noSeason) : [];
  const shown = older ? groups : groups.slice(0, recentSeasons);
  const rows = data
    ? [
        [w.form.season, w.form.date, w.form.title, w.form.competition, w.form.kind, w.form.place, w.form.team, w.form.person],
        ...data.awards.map((a) => [a.season ?? w.noSeason, a.awarded_on, a.title, a.competition, w.kinds[a.kind], placeLabel(w, a.place, locale), a.team ?? "", a.person ?? ""]),
      ]
    : [];
  const fromSuggestion = (x: Suggestion): Draft => ({
    title: x.title,
    competition: "",
    kind: x.team_id ? "team" : "club",
    place: x.place,
    team_id: x.team_id,
    season_id: x.season_id,
    awarded_on: x.awarded_on,
    trip_id: x.trip_id,
    publishable: false,
  });
  async function remove(id: string) {
    try {
      await send({ action: "delete", id, organizationId: data!.organization_id });
      setRemoving(null);
      showToast({ message: w.removed, icon: "check" });
      await reload();
    } catch (e) {
      showToast({ message: failure((e as Error).message), icon: "alert" });
    }
  }
  return (
    <Card
      id="hall-of-fame"
      title={w.title}
      subtitle={w.intro}
      className="stats-wide"
      actions={
        <span className="stats-card-tools">
          {data?.can.manage && (
            <Button icon="plus" size="sm" onClick={() => setEditing({ kind: "team", place: 1, publishable: false })}>
              {w.add}
            </Button>
          )}
          <ChartMenu
            locale={locale}
            table={table}
            onTable={() => setTable((v) => !v)}
            onCsv={data ? () => downloadCsv(`${slug(w.title)}.csv`, rows) : undefined}
            onPng={() => area.current && void exportPng(area.current, w.title, w.intro, `${slug(w.title)}.png`)}
          >
            {groups.length > recentSeasons && (
              <button type="button" aria-pressed={older} onClick={() => setOlder((v) => !v)}>
                <Icon name="calendar" size={16} />
                {older ? t.menu.recent : t.menu.older}
              </button>
            )}
          </ChartMenu>
        </span>
      }
    >
      {error && <p role="alert">{error}</p>}
      {data && data.suggestions.length > 0 && (
        <section className="award-suggestions" aria-labelledby="award-suggestions">
          <h3 id="award-suggestions">{w.suggestions}</h3>
          <ul className="plain-list">
            {data.suggestions.map((x) => (
              <li key={x.trip_id}>
                <span>
                  <MedalMark place={x.place} />
                  {fill(w.suggestion, { place: placeLabel(w, x.place, locale), title: x.title })}
                  {x.team && <span className="muted"> · {x.team}</span>}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setEditing(fromSuggestion(x))}>
                  {w.addSuggestion}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data && !data.awards.length && <EmptyState icon="trophy" title={w.empty} />}
      {data && data.awards.length > 0 && (
        <div ref={area}>
          {table ? (
            <DataTable label={w.title}>
              <thead>
                <tr>
                  {rows[0].map((h) => (
                    <th scope="col" key={String(h)}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((r, i) => (
                  <tr key={data.awards[i].id}>
                    <th scope="row">{r[0]}</th>
                    {r.slice(1).map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <ol className="award-timeline">
              {shown.map((g) => (
                <li key={g.season}>
                  <h3 className="award-season" data-export-text>
                    {g.season}
                  </h3>
                  <ul className="award-list">
                    {g.items.map((a) => (
                      <li key={a.id}>
                        <article className="award" aria-labelledby={`award-${a.id}`}>
                          <p className="award-place">
                            <MedalMark place={a.place} />
                            <span data-export-text>{placeLabel(w, a.place, locale)}</span>
                          </p>
                          <h4 id={`award-${a.id}`} className="award-title" data-export-text>
                            {a.title}
                          </h4>
                          {a.competition && <p className="muted small">{a.competition}</p>}
                          <p className="award-meta small">
                            {a.team && (
                              <span className="team-chip" data-color={a.team_color ?? undefined}>
                                <span className="team-dot" aria-hidden="true" />
                                {a.team}
                              </span>
                            )}
                            {a.person && <span>{a.person}</span>}
                            <span className="muted">{day(locale, a.awarded_on)}</span>
                            {a.publishable && <Badge tone="info">{w.publicBadge}</Badge>}
                          </p>
                          {a.has_photo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="award-photo" src={`/api/statistics/awards/${a.id}/photo?v=${a.version}`} alt={fill(w.photoAlt, { title: a.title })} loading="lazy" />
                          )}
                          {data.can.manage && (
                            <p className="actions">
                              <Button size="sm" variant="ghost" aria-label={`${w.edit} : ${a.title}`} onClick={() => setEditing(a)}>
                                {w.edit}
                              </Button>
                              {removing === a.id ? (
                                <Button size="sm" variant="danger" onClick={() => void remove(a.id)}>
                                  {w.confirmRemove}
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" aria-label={`${w.remove} : ${a.title}`} onClick={() => setRemoving(a.id)}>
                                  {w.remove}
                                </Button>
                              )}
                            </p>
                          )}
                        </article>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {editing && data && (
        <AwardForm
          locale={locale}
          view={data}
          draft={editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            showToast({ message: w.saved, icon: "trophy" });
            await reload();
          }}
        />
      )}
    </Card>
  );
}

function MedalMark({ place }: { place: number | null }) {
  const medal = medalOf(place);
  return (
    <span className="medal" data-medal={medal} aria-hidden="true">
      <Icon name={medal === "star" ? "star" : "medal"} size={18} />
    </span>
  );
}

function AwardForm({ locale, view, draft, close, saved }: { locale: Locale; view: View; draft: Draft; close: () => void; saved: () => Promise<void> }) {
  const w = statisticsCopy[locale].awards,
    f = w.form;
  const [kind, setKind] = useState(draft.kind ?? "team"),
    [season, setSeason] = useState(draft.season_id ?? view.seasons[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const editing = !!draft.id;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "").trim();
    const place = get("place");
    setBusy(true);
    setError("");
    try {
      const file = form.get("photo");
      const photo = file instanceof File && file.size ? file : null;
      if (photo && (photo.size > 1572864 || !["image/png", "image/jpeg", "image/webp"].includes(photo.type))) throw new Error("INVALID_FILE");
      const body = {
        title: get("title"),
        competition: get("competition"),
        kind,
        place: place ? Number(place) : null,
        awardedOn: get("date"),
        seasonId: get("season") || null,
        teamId: get("team") || null,
        profileId: kind === "individual" ? get("person") || null : null,
        note: get("note"),
        publishable: form.has("publishable"),
        organizationId: view.organization_id,
      };
      const { id } = editing
        ? await send({ action: "update", id: draft.id, expectedVersion: draft.version, ...body })
        : await send({ action: "create", tripId: draft.trip_id ?? null, ...body });
      if (photo) await send({ action: "photo", id, mediaType: photo.type, data: await readFile(photo), organizationId: view.organization_id });
      else if (editing && form.has("removePhoto")) await send({ action: "removePhoto", id, organizationId: view.organization_id });
      await saved();
    } catch (err) {
      const code = (err as Error).message;
      setError(code === "INVALID_FILE" ? f.invalidFile : code === "STALE_VERSION" ? w.stale : (errors[code]?.[locale] ?? w.failed));
    } finally {
      setBusy(false);
    }
  }
  const teams = view.teams.filter((x) => !season || x.season_id === season);
  return (
    <Modal title={editing ? `${w.edit} : ${draft.title}` : w.add} close={close}>
      {error && <p role="alert">{error}</p>}
      <form className="federation-form award-form" onSubmit={(e) => void submit(e)}>
        <label>
          {f.title}
          <input name="title" required minLength={2} maxLength={120} defaultValue={draft.title ?? ""} aria-describedby="award-title-help" />
        </label>
        <p className="muted small" id="award-title-help">
          {f.titleHelp}
        </p>
        <label>
          {f.competition}
          <input name="competition" maxLength={120} defaultValue={draft.competition ?? ""} />
        </label>
        <div className="form-pair">
          <label>
            {f.kind}
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {(["team", "individual", "club"] as const).map((k) => (
                <option key={k} value={k}>
                  {w.kinds[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {f.place}
            <select name="place" defaultValue={draft.place === null ? "" : String(draft.place ?? 1)}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {placeLabel(w, n, locale)}
                </option>
              ))}
              {draft.place && draft.place > 3 && <option value={draft.place}>{placeLabel(w, draft.place, locale)}</option>}
              <option value="">{f.other}</option>
            </select>
          </label>
        </div>
        <div className="form-pair">
          <label>
            {f.season}
            <select name="season" value={season} onChange={(e) => setSeason(e.target.value)}>
              <option value="">{f.none}</option>
              {view.seasons.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {f.date}
            <input name="date" type="date" required defaultValue={draft.awarded_on ?? ""} />
          </label>
        </div>
        <label>
          {f.team}
          <select name="team" defaultValue={draft.team_id ?? ""}>
            <option value="">{f.none}</option>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        {kind === "individual" && (
          <label>
            {f.person}
            <select name="person" required defaultValue={draft.profile_id ?? ""}>
              <option value="" disabled>
                {f.none}
              </option>
              {view.people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {f.note}
          <textarea name="note" maxLength={500} rows={2} defaultValue={draft.note ?? ""} />
        </label>
        <label className="check">
          <input type="checkbox" name="publishable" defaultChecked={draft.publishable ?? false} aria-describedby="award-publishable-help" />
          {f.publishable}
        </label>
        <p className="muted small" id="award-publishable-help">
          {f.publishableHelp}
        </p>
        <label>
          {f.photo}
          <input name="photo" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="award-photo-help" />
        </label>
        <p className="muted small" id="award-photo-help">
          {f.photoHelp}
        </p>
        {editing && draft.has_photo && (
          <label className="check">
            <input type="checkbox" name="removePhoto" />
            {f.removePhoto}
          </label>
        )}
        <Button type="submit" loading={busy}>
          {f.save}
        </Button>
      </form>
    </Modal>
  );
}

/** Settings > Club (wave 16, S1): the public Hall of fame page, switched on or off, and its embed code. */
export function HallOfFameSettings({ locale }: { locale: Locale }) {
  const w = statisticsCopy[locale].awards.widget;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? "", [locale]);
  const { data, reload, denied, error } = useData<View>("/api/statistics/awards", failure);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [copied, setCopied] = useState("");
  if (denied || error || !data?.can.widget) return null;
  const site = typeof window === "undefined" ? "" : window.location.origin;
  const url = data.widget ? `${site}/${locale}/hall-of-fame-widget/${data.widget}` : "";
  const code = url ? `<iframe title="Hall of fame" src="${url}" width="100%" height="600" style="border:0"></iframe>` : "";
  async function toggle(enabled: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await send({ action: "widget", enabled, organizationId: data!.organization_id });
      await reload();
      setMessage(enabled ? w.onDone : w.offDone);
    } catch (e) {
      setMessage(failure((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied("");
    }
  };
  return (
    <Card title={w.title} headingId="settings-hall-of-fame" labelledBy="settings-hall-of-fame">
      <p className="muted">{w.intro}</p>
      {message && <p role="status">{message}</p>}
      {data.widget ? (
        <>
          <p>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {w.open} ↗
            </a>
          </p>
          {[
            { key: "link", label: w.link, text: url },
            { key: "iframe", label: w.iframe, text: code },
          ].map((x) => (
            <div key={x.key} className="share-code">
              <label htmlFor={`hall-${x.key}`}>{x.label}</label>
              <textarea id={`hall-${x.key}`} readOnly rows={x.key === "iframe" ? 3 : 1} value={x.text} />
              <Button size="sm" variant="secondary" onClick={() => void copy(x.key, x.text)}>
                {copied === x.key ? w.copied : w.copy}
              </Button>
            </div>
          ))}
          <Button variant="secondary" loading={busy} onClick={() => void toggle(false)}>
            {w.off}
          </Button>
        </>
      ) : (
        <Button loading={busy} onClick={() => void toggle(true)}>
          {w.on}
        </Button>
      )}
    </Card>
  );
}
