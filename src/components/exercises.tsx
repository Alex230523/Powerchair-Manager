"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { exercisesView, Exercise } from "@/domains/exercises/service";
import { objectives, levels, suitedFor } from "@/domains/exercises/schema";
import { errors } from "./access-copy";
import { exercisesCopy } from "./exercises-copy";
import { Badge, Button, EmptyState, IconTile, PageHeader, Toolbar } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof exercisesView>>;
type Filters = { q: string; objective: string; level: string; suited: string; duration: string; tag: string; mine: boolean; archived: boolean };
const empty: Filters = { q: "", objective: "", level: "", suited: "", duration: "", tag: "", mine: false, archived: false };
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Wave 16 (E2): the library of exercise sheets (/[locale]/exercises). */
export function Exercises({ locale }: { locale: Locale }) {
  const t = exercisesCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState<Filters>(empty),
    [editing, setEditing] = useState<Exercise | "new" | null>(null);
  const load = useCallback(
    () =>
      fetch("/api/exercises", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setView(v);
        })
        .catch((e: Error) => setError(["FORBIDDEN", "CLUB_ONLY"].includes(e.message) ? t.forbidden : (errors[e.message]?.[locale] ?? t.failed))),
    [locale, t.forbidden, t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const tags = useMemo(() => [...new Set((view?.exercises ?? []).flatMap((x) => x.tags))].sort(), [view]);
  const shown = (view?.exercises ?? []).filter(
    (x) =>
      (filters.archived ? x.archived : !x.archived) &&
      (!filters.q || fold(`${x.title} ${x.description} ${x.tags.join(" ")}`).includes(fold(filters.q))) &&
      (!filters.objective || x.objective === filters.objective) &&
      (!filters.level || x.level === filters.level) &&
      (!filters.suited || x.suited === filters.suited || x.suited === "both") &&
      (!filters.duration || (filters.duration === "short" ? x.duration_minutes <= 15 : filters.duration === "medium" ? x.duration_minutes > 15 && x.duration_minutes <= 30 : x.duration_minutes > 30)) &&
      (!filters.tag || x.tags.includes(filters.tag)) &&
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
    const num = (k: string) => Number(f.get(k));
    const file = f.get("diagram");
    setBusy(true);
    setError("");
    try {
      const { id } = await post({
        action: row ? "update" : "create",
        ...(row ? { id: row.id, version: row.version } : {}),
        title: String(f.get("title") ?? "").trim(),
        objective: f.get("objective"),
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
        tags: String(f.get("tags") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 10),
        shared: f.has("shared"),
      });
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
      if (f.has("removeDiagram") && row) await post({ action: "removeDiagram", id });
      setEditing(null);
      await load();
      setMessage(t.saved);
    } catch (err) {
      const code = (err as Error).message;
      if (code === "STALE_VERSION") await load();
      setError(code === "INVALID_FILE" ? t.invalidFile : code === "STALE_VERSION" ? t.stale : (errors[code]?.[locale] ?? t.failed));
    } finally {
      setBusy(false);
    }
  }
  const row = editing && editing !== "new" ? editing : null;
  return (
    <main id="main" className="access exercises">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          view?.can.write && (
            <Button icon="plus" onClick={() => setEditing("new")}>
              {t.add}
            </Button>
          )
        }
      />
      {error && !editing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          <Toolbar label={t.title}>
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
            {tags.length > 0 && (
              <label className="compact-field">
                {t.tag}
                <select value={filters.tag} onChange={(e) => set("tag", e.target.value)}>
                  <option value="">{t.all}</option>
                  {tags.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
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
          {shown.length ? (
            <ul className="exercise-grid">
              {shown.map((x) => (
                <li key={x.id}>
                  <Link className="card interactive exercise-card" href={`/${locale}/exercises/${x.id}`}>
                    <span className="exercise-thumb">
                      {x.has_diagram && x.diagram_type !== "application/pdf" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/exercises/${x.id}/diagram`} alt="" loading="lazy" />
                      ) : (
                        <IconTile icon="clipboardList" size={44} />
                      )}
                    </span>
                    <span className="exercise-body">
                      <strong className="exercise-title">{x.title}</strong>
                      <span className="exercise-badges">
                        <Badge tone="info">{t.minutes(x.duration_minutes)}</Badge>
                        <Badge>{t.players(x.players_min, x.players_max)}</Badge>
                        <Badge tone="primary">{t.levels[x.level]}</Badge>
                        <Badge>{t.suitedFor[x.suited]}</Badge>
                        {!x.shared && <Badge tone="warning">{t.private}</Badge>}
                        {x.archived && <Badge>{t.archived}</Badge>}
                      </span>
                      <span className="muted small">
                        {t.objectives[x.objective]} · {t.uses(x.uses)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="clipboardList" title={view.exercises.length ? t.noMatch : t.empty} />
          )}
        </>
      )}
      {editing && view && <ExerciseForm locale={locale} row={row} busy={busy} error={error} close={() => setEditing(null)} save={save} />}
    </main>
  );
}

/** The sheet's form, for a new one or an edit. */
export function ExerciseForm({
  locale,
  row,
  busy,
  error,
  close,
  save,
}: {
  locale: Locale;
  row: Exercise | null;
  busy: boolean;
  error: string;
  close: () => void;
  save: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const t = exercisesCopy[locale];
  const [fileError, setFileError] = useState("");
  const check = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(file && (file.size > 2097152 || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) ? t.invalidFile : "");
  };
  return (
    <Modal title={row ? row.title : t.add} close={close}>
      {error && <p role="alert">{error}</p>}
      <form className="federation-form" onSubmit={(e) => void save(e)}>
        <label>
          {t.form.titleLabel}
          <input name="title" required minLength={2} maxLength={120} defaultValue={row?.title ?? ""} />
        </label>
        <div className="form-pair">
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
          <label>
            {t.form.durationLabel}
            <input name="duration" type="number" min={1} max={180} required defaultValue={row?.duration_minutes ?? 15} />
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
        <div className="form-pair">
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
        </div>
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
        <label>
          {t.form.tags}
          <input name="tags" maxLength={330} defaultValue={row?.tags.join(", ") ?? ""} />
        </label>
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
        <Button type="submit" loading={busy} disabled={!!fileError}>
          {t.form.save}
        </Button>
      </form>
    </Modal>
  );
}
