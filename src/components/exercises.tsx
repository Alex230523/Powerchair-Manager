"use client";
import { emptyStart } from "./empty-start-copy";
import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { exercisesView, Exercise, Tag } from "@/domains/exercises/service";
import { objectives, levels, suitedFor, genres } from "@/domains/exercises/schema";
import { isBlank, type Drawing } from "@/domains/exercises/drawing";
import { errors } from "./access-copy";
import { exercisesCopy } from "./exercises-copy";
import { Badge, Button, EmptyState, IconTile, PageHeader, Segmented, Tabs, Toolbar } from "./ui";
import { Modal } from "./modal";
import { TagChip, TagPicker } from "./tag-picker";
import { FieldEditor } from "./field-editor";
import { FederalLibrary } from "./federal-library";

type View = Awaited<ReturnType<typeof exercisesView>>;
type Filters = { q: string; genre: string; objective: string; level: string; suited: string; duration: string; tags: string[]; mine: boolean; archived: boolean };
const empty: Filters = { q: "", genre: "", objective: "", level: "", suited: "", duration: "", tags: [], mine: false, archived: false };
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** The message of a failed action, in the reader's language. */
export function failure(locale: Locale, code: string) {
  const t = exercisesCopy[locale];
  if (code === "INVALID_FILE") return t.invalidFile;
  if (code === "STALE_VERSION") return t.stale;
  if (code in t.x4.errors) return t.x4.errors[code as keyof typeof t.x4.errors];
  return errors[code]?.[locale] ?? t.failed;
}
/** The fields of a sheet, read from its form (shared by the library, the sheet page and the federation). */
export function sheetFields(f: FormData) {
  const num = (k: string) => Number(f.get(k));
  let tags: string[] = [];
  try {
    tags = (JSON.parse(String(f.get("tags") ?? "[]")) as string[]).slice(0, 10);
  } catch {
    tags = [];
  }
  return {
    title: String(f.get("title") ?? "").trim(),
    genre: f.get("genre") ?? "exercise",
    objective: f.get("objective"),
    goal: String(f.get("goal") ?? ""),
    description: f.get("description"),
    safety: f.get("safety"),
    durationMinutes: num("duration"),
    playersMin: num("playersMin"),
    playersMax: num("playersMax"),
    level: f.get("level"),
    suited: f.get("suited"),
    equipment: f.get("equipment"),
    variants: f.get("variants"),
    videoUrl: String(f.get("video") ?? "").trim(),
    tags,
  };
}
/** The drawing in the form: undefined if untouched, null if emptied. */
export function formDrawing(f: FormData): Drawing | null | undefined {
  const raw = f.get("drawing");
  if (raw === null || raw === "") return undefined;
  try {
    const d = JSON.parse(String(raw)) as Drawing;
    return isBlank(d) ? null : d;
  } catch {
    return undefined;
  }
}
/** Sends the uploaded diagram, the removal and the drawing after the sheet is saved. */
export async function saveExtras(post: (b: Record<string, unknown>) => Promise<{ id: string }>, id: string, f: FormData, existing: boolean) {
  const file = f.get("diagram");
  if (file instanceof File && file.size) {
    if (file.size > 2097152 || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) throw new Error("INVALID_FILE");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("INVALID_FILE"));
      reader.readAsDataURL(file);
    });
    await post({ action: "diagram", id, mediaType: file.type, data });
  }
  if (f.has("removeDiagram") && existing) await post({ action: "removeDiagram", id });
  const drawing = formDrawing(f);
  if (drawing !== undefined) await post({ action: "drawing", id, drawing });
}

/** Wave 16 (E2), 4: the library of exercise and tactic sheets (/[locale]/exercises). */
export function Exercises({ locale, genre }: { locale: Locale; genre?: string }) {
  const t = exercisesCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState<Filters>({ ...empty, genre: genre === "tactic" || genre === "exercise" ? genre : "" }),
    [layout, setLayout] = useState<"cards" | "list">("cards"),
    [tab, setTab] = useState<"ours" | "federal">("ours"),
    [federation, setFederation] = useState(false),
    [editing, setEditing] = useState<Exercise | "new" | null>(null);
  const load = useCallback(
    () =>
      // 4: the federation has only the federal library here; asked first, so no refused request.
      fetch("/api/exercises/library", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as { kind?: string }) : null))
        .then(async (lib) => {
          if (lib?.kind === "federation") throw new Error("CLUB_ONLY");
          const r = await fetch("/api/exercises", { cache: "no-store" });
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setView(v);
        })
        .catch((e: Error) => {
          // 4: the federation has only the federal library here.
          if (e.message === "CLUB_ONLY") setFederation(true);
          else setError(e.message === "FORBIDDEN" ? t.forbidden : failure(locale, e.message));
        }),
    [locale, t.forbidden],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const shown = (view?.exercises ?? []).filter(
    (x) =>
      (filters.archived ? x.archived : !x.archived) &&
      (!filters.q || fold(`${x.title} ${x.goal} ${x.description} ${x.tags.map((g) => g.name).join(" ")}`).includes(fold(filters.q))) &&
      (!filters.genre || x.genre === filters.genre) &&
      (!filters.objective || x.objective === filters.objective) &&
      (!filters.level || x.level === filters.level) &&
      (!filters.suited || x.suited === filters.suited || x.suited === "both") &&
      (!filters.duration || (filters.duration === "short" ? x.duration_minutes <= 15 : filters.duration === "medium" ? x.duration_minutes > 15 && x.duration_minutes <= 30 : x.duration_minutes > 30)) &&
      filters.tags.every((id) => x.tags.some((g) => g.id === id)) &&
      (!filters.mine || x.author_id === view?.user_id),
  );
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v as { id: string };
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = editing === "new" ? null : editing;
    setBusy(true);
    setError("");
    try {
      const { id } = await post({ action: row ? "update" : "create", ...(row ? { id: row.id, version: row.version } : {}), ...sheetFields(f), shared: f.has("shared") });
      await saveExtras(post, id, f, !!row);
      setEditing(null);
      await load();
      setMessage(t.saved);
    } catch (err) {
      const code = (err as Error).message;
      if (code === "STALE_VERSION") await load();
      setError(failure(locale, code));
    } finally {
      setBusy(false);
    }
  }
  async function decide(offerId: string, accept: boolean) {
    setBusy(true);
    setError("");
    try {
      await post({ action: "offerDecide", offerId, accept });
      await load();
      setMessage(accept ? t.send.accepted : t.send.refused);
    } catch (err) {
      setError(failure(locale, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const row = editing && editing !== "new" ? editing : null;
  if (federation) return <FederalLibrary locale={locale} federation />;
  return (
    <main id="main" className="access exercises">
      <PageHeader
        title={t.title}
        subtitle={t.x4.intro}
        actions={
          view?.can.write &&
          tab === "ours" && (
            <Button icon="plus" onClick={() => setEditing("new")}>
              {t.add}
            </Button>
          )
        }
      />
      {error && !editing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && view.offers.length > 0 && (
        // 04/11/2026: sheets another club sent; the presidency accepts or refuses.
        <section className="card exercise-offers" id="exercise-offers" aria-labelledby="exercise-offers-title">
          <h2 id="exercise-offers-title">{t.send.received}</h2>
          <ul className="profile-list">
            {view.offers.map((o) => (
              <li key={o.id}>
                <div>
                  <strong>{o.title}</strong>
                  <p className="muted small">{t.send.from(o.club, o.sender)}</p>
                  {o.message && <p className="small prewrap">{o.message}</p>}
                </div>
                <span className="offer-actions">
                  <Button
                    disabled={busy}
                    onClick={() => void decide(o.id, true)}
                    aria-label={`${t.send.accept} : ${o.title}`}
                  >
                    {t.send.accept}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void decide(o.id, false)} aria-label={`${t.send.refuse} : ${o.title}`}>
                    {t.send.refuse}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view && (
        <Tabs
          label={t.title}
          idPrefix="exercises-tab"
          panelId="exercises-panel"
          value={tab}
          onChange={(v) => setTab(v === "federal" ? "federal" : "ours")}
          items={[
            { id: "ours", label: t.x4.tabs.ours },
            { id: "federal", label: t.x4.tabs.federal },
          ]}
        />
      )}
      {view && tab === "federal" && (
        <div id="exercises-panel" role="tabpanel" aria-labelledby="exercises-tab-federal">
          <FederalLibrary locale={locale} federation={false} onCopied={() => void load()} />
        </div>
      )}
      {view && tab === "ours" && (
        <div id="exercises-panel" role="tabpanel" aria-labelledby="exercises-tab-ours">
          <Segmented
            label={t.x4.genre}
            value={filters.genre || "all"}
            onChange={(v) => set("genre", v === "all" ? "" : v)}
            items={(["all", ...genres] as const).map((g) => ({ id: g, label: t.x4.genreFilter[g] }))}
          />
          <Toolbar
            label={t.title}
            actions={
              <Segmented
                label={t.x4.layout}
                value={layout}
                onChange={(v) => setLayout(v === "list" ? "list" : "cards")}
                items={[
                  { id: "cards", label: t.x4.cards },
                  { id: "list", label: t.x4.list },
                ]}
              />
            }
          >
            <label className="compact-field">
              {t.search}
              <input type="search" value={filters.q} onChange={(e) => set("q", e.target.value)} />
            </label>
            <label className="compact-field">
              {t.objective}
              <select value={filters.objective} onChange={(e) => set("objective", e.target.value)}>
                <option value="">{t.all}</option>
                {objectives.map((o) => (
                  <option key={o} value={o}>
                    {t.objectives[o]}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-field">
              {t.level}
              <select value={filters.level} onChange={(e) => set("level", e.target.value)}>
                <option value="">{t.all}</option>
                {levels.map((o) => (
                  <option key={o} value={o}>
                    {t.levels[o]}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-field">
              {t.suited}
              <select value={filters.suited} onChange={(e) => set("suited", e.target.value)}>
                <option value="">{t.all}</option>
                <option value="PF1">PF1</option>
                <option value="PF2">PF2</option>
              </select>
            </label>
            <label className="compact-field">
              {t.duration}
              <select value={filters.duration} onChange={(e) => set("duration", e.target.value)}>
                <option value="">{t.all}</option>
                {(["short", "medium", "long"] as const).map((d) => (
                  <option key={d} value={d}>
                    {t.durations[d]}
                  </option>
                ))}
              </select>
            </label>
            {view.tags.length > 0 && (
              <details className="tag-filter">
                <summary>
                  {t.x4.tagsFilter}
                  {filters.tags.length > 0 && ` (${filters.tags.length})`}
                </summary>
                <fieldset>
                  <legend className="sr-only">{t.x4.tagsFilter}</legend>
                  {view.tags.map((g) => (
                    <label key={g.id} className="check">
                      <input
                        type="checkbox"
                        checked={filters.tags.includes(g.id)}
                        onChange={(e) => set("tags", e.target.checked ? [...filters.tags, g.id] : filters.tags.filter((x) => x !== g.id))}
                      />
                      <TagChip tag={g} />
                    </label>
                  ))}
                </fieldset>
              </details>
            )}
            <label className="check">
              <input type="checkbox" checked={filters.mine} onChange={(e) => set("mine", e.target.checked)} />
              {t.mine}
            </label>
            <label className="check">
              <input type="checkbox" checked={filters.archived} onChange={(e) => set("archived", e.target.checked)} />
              {t.archivedToggle}
            </label>
          </Toolbar>
          {!shown.length ? (
            <EmptyState
              icon="clipboardList"
              title={view.exercises.length ? t.noMatch : t.empty}
              // Point 19: an empty page says what to do, with the button to start.
              action={
                !view.exercises.length && view.can.write ? (
                  <Button icon="plus" onClick={() => setEditing("new")}>
                    {emptyStart[locale]}
                  </Button>
                ) : undefined
              }
            />
          ) : layout === "cards" ? (
            <ul className="exercise-grid">
              {shown.map((x) => (
                <li key={x.id}>
                  <Link className="card interactive exercise-card" href={`/${locale}/exercises/${x.id}`}>
                    <span className="exercise-thumb">
                      {x.has_diagram && x.diagram_type !== "application/pdf" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/exercises/${x.id}/diagram`} alt="" loading="lazy" />
                      ) : (
                        <IconTile icon={x.genre === "tactic" ? "whistle" : "clipboardList"} size={44} />
                      )}
                    </span>
                    <span className="exercise-body">
                      <strong className="exercise-title">{x.title}</strong>
                      {x.goal && <span className="small">{x.goal}</span>}
                      <span className="exercise-badges">
                        <Badge tone={x.genre === "tactic" ? "warning" : "success"}>{t.x4.genres[x.genre]}</Badge>
                        <Badge tone="info">{t.minutes(x.duration_minutes)}</Badge>
                        <Badge>{t.players(x.players_min, x.players_max)}</Badge>
                        <Badge tone="primary">{t.levels[x.level]}</Badge>
                        <Badge>{t.suitedFor[x.suited]}</Badge>
                        {!x.shared && <Badge tone="warning">{t.private}</Badge>}
                        {x.archived && <Badge>{t.archived}</Badge>}
                      </span>
                      {x.tags.length > 0 && <Tags tags={x.tags} />}
                      <span className="muted small">
                        {t.objectives[x.objective]} · {t.x4.uses(x.uses, x.matches)}
                      </span>
                      <span className="muted small">{t.x4.creator(x.creator, x.creator_club)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-wrap">
              <table className="data-table exercise-table">
                <thead>
                  <tr>
                    <th scope="col">{t.x4.columns.title}</th>
                    <th scope="col">{t.x4.columns.type}</th>
                    <th scope="col">{t.x4.columns.duration}</th>
                    <th scope="col">{t.x4.columns.tags}</th>
                    <th scope="col">{t.x4.columns.uses}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((x) => (
                    <tr key={x.id}>
                      <th scope="row">
                        <Link href={`/${locale}/exercises/${x.id}`}>{x.title}</Link>
                        <span className="muted small"> · {t.x4.genres[x.genre]}</span>
                      </th>
                      <td>{t.objectives[x.objective]}</td>
                      <td>{t.minutes(x.duration_minutes)}</td>
                      <td>{x.tags.length ? <Tags tags={x.tags} /> : null}</td>
                      <td>{t.x4.uses(x.uses, x.matches)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {editing && view && <ExerciseForm locale={locale} row={row} tags={view.tags} drawing={null} busy={busy} error={error} close={() => setEditing(null)} save={save} />}
    </main>
  );
}
function Tags({ tags }: { tags: Tag[] }) {
  return (
    <ul className="tag-list">
      {tags.map((g) => (
        <li key={g.id}>
          <TagChip tag={g} />
        </li>
      ))}
    </ul>
  );
}

/** The sheet's form, for a new one or an edit (also the federation's own sheets). */
export function ExerciseForm({
  locale,
  row,
  tags,
  drawing,
  busy,
  error,
  close,
  save,
  federal = false,
}: {
  locale: Locale;
  row: Exercise | null;
  tags: Tag[];
  drawing: Drawing | null;
  busy: boolean;
  error: string;
  close: () => void;
  save: (e: FormEvent<HTMLFormElement>) => void;
  federal?: boolean;
}) {
  const t = exercisesCopy[locale];
  const [fileError, setFileError] = useState(""),
    [sketch, setSketch] = useState<string>("");
  const check = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(file && (file.size > 2097152 || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) ? t.invalidFile : "");
  };
  return (
    <Modal title={row ? row.title : federal ? t.x4.federal.publishOwn : t.add} close={close}>
      {error && <p role="alert">{error}</p>}
      <form className="federation-form" onSubmit={(e) => void save(e)}>
        <label>
          {t.form.titleLabel}
          <input name="title" required minLength={2} maxLength={120} defaultValue={row?.title ?? ""} />
        </label>
        <div className="form-pair">
          <label>
            {t.x4.genre}
            <select name="genre" defaultValue={row?.genre ?? "exercise"}>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {t.x4.genres[g]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.objective}
            <select name="objective" defaultValue={row?.objective ?? "technique"}>
              {objectives.map((o) => (
                <option key={o} value={o}>
                  {t.objectives[o]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t.x4.goal}
          <textarea name="goal" rows={2} maxLength={500} defaultValue={row?.goal ?? ""} aria-describedby="exercise-goal-hint" />
        </label>
        <p className="muted small" id="exercise-goal-hint">
          {t.x4.goalHint}
        </p>
        <div className="form-pair">
          <label>
            {t.form.durationLabel}
            <input name="duration" type="number" min={1} max={180} required defaultValue={row?.duration_minutes ?? 15} />
          </label>
          <label>
            {t.level}
            <select name="level" defaultValue={row?.level ?? "beginner"}>
              {levels.map((o) => (
                <option key={o} value={o}>
                  {t.levels[o]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-pair">
          <label>
            {t.form.playersMin}
            <input name="playersMin" type="number" min={1} max={40} required defaultValue={row?.players_min ?? 2} />
          </label>
          <label>
            {t.form.playersMax}
            <input name="playersMax" type="number" min={1} max={40} required defaultValue={row?.players_max ?? 8} />
          </label>
        </div>
        <label>
          {t.suited}
          <select name="suited" defaultValue={row?.suited ?? "both"}>
            {suitedFor.map((o) => (
              <option key={o} value={o}>
                {t.suitedFor[o]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.form.description}
          <textarea name="description" rows={5} maxLength={5000} defaultValue={row?.description ?? ""} />
        </label>
        <label>
          {t.form.safety}
          <textarea name="safety" rows={2} maxLength={2000} defaultValue={row?.safety ?? ""} />
        </label>
        <label>
          {t.form.equipment}
          <input name="equipment" maxLength={1000} defaultValue={row?.equipment ?? ""} />
        </label>
        <label>
          {t.form.variants}
          <textarea name="variants" rows={2} maxLength={3000} defaultValue={row?.variants ?? ""} />
        </label>
        <label>
          {t.form.video}
          <input name="video" type="url" pattern="https://.*" maxLength={500} defaultValue={row?.video_url ?? ""} />
        </label>
        <TagPicker locale={locale} tags={tags} initial={row?.tags.map((g) => g.name) ?? []} />
        <details className="pitch-details" open={!!drawing}>
          <summary>{t.x4.editDrawing}</summary>
          <input type="hidden" name="drawing" value={sketch} />
          <FieldEditor locale={locale} initial={drawing} onChange={(d) => setSketch(JSON.stringify(d))} />
        </details>
        {!federal && (
          <>
            <label>
              {t.form.diagram}
              <input name="diagram" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={check} aria-describedby={fileError ? "exercise-file-error" : undefined} />
            </label>
            {fileError && (
              <p className="field-error" id="exercise-file-error">
                {fileError}
              </p>
            )}
            {row?.has_diagram && (
              <label className="check">
                <input type="checkbox" name="removeDiagram" />
                {t.form.removeDiagram}
              </label>
            )}
            <label className="check">
              <input type="checkbox" name="shared" defaultChecked={row?.shared ?? true} />
              {t.form.shared}
            </label>
          </>
        )}
        <Button type="submit" loading={busy} disabled={!!fileError}>
          {t.form.save}
        </Button>
      </form>
    </Modal>
  );
}
