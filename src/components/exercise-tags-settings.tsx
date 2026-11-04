"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { exercisesView, Tag } from "@/domains/exercises/service";
import { tagColors } from "@/domains/exercises/schema";
import { exercisesCopy } from "./exercises-copy";
import { Button, Card } from "./ui";
import { TagChip } from "./tag-picker";
import { failure } from "./exercises";

type View = Awaited<ReturnType<typeof exercisesView>>;

/** One tag: its name, its colour, merged into another or deleted. */
function TagRow({ locale, tag, others, busy, send }: { locale: Locale; tag: Tag & { sheets: number }; others: Tag[]; busy: boolean; send: (body: Record<string, unknown>) => Promise<boolean> }) {
  const t = exercisesCopy[locale].x4.tagsSettings;
  const [name, setName] = useState(tag.name),
    [into, setInto] = useState("");
  return (
    <li className="exercise-tag-row">
      <TagChip tag={tag} />
      <span className="muted small">{t.sheets(tag.sheets)}</span>
      <form
        className="exercise-tag-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ action: "tagRename", tagId: tag.id, name: name.trim() });
        }}
      >
        <input aria-label={t.name(tag.name)} value={name} required maxLength={30} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim() || name.trim() === tag.name}>
          {t.rename}
        </Button>
      </form>
      <select aria-label={t.color(tag.name)} value={tag.color} disabled={busy} onChange={(e) => void send({ action: "tagColor", tagId: tag.id, color: e.target.value })}>
        {tagColors.map((c) => (
          <option key={c} value={c}>
            {t.colors[c]}
          </option>
        ))}
      </select>
      {others.length > 0 && (
        <form
          className="exercise-tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (into) void send({ action: "tagMerge", tagId: tag.id, into });
          }}
        >
          <select aria-label={t.merge(tag.name)} value={into} onChange={(e) => setInto(e.target.value)}>
            <option value="">{t.merge(tag.name)}…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !into}>
            {t.mergeButton}
          </Button>
        </form>
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send({ action: "tagDelete", tagId: tag.id })}>
        {t.delete(tag.name)}
      </Button>
    </li>
  );
}

/** 4: Réglages › Activités: the club's exercise tags (rename, colour, merge, delete). */
export function ExerciseTagsSettings({ locale }: { locale: Locale }) {
  const t = exercisesCopy[locale];
  const s = t.x4.tagsSettings;
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetch("/api/exercises", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (r.ok) setView(v);
        })
        .catch(() => setView(null)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await load();
      setMessage(t.saved);
      return true;
    } catch (e) {
      setError(failure(locale, (e as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!view?.can.write) return null;
  return (
    <Card title={s.title} subtitle={s.intro} labelledBy="settings-exercise-tags" headingId="settings-exercise-tags">
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {view.tags.length ? (
        <ul className="exercise-tag-rows">
          {view.tags.map((g) => (
            <TagRow key={`${g.id}-${g.name}-${g.color}`} locale={locale} tag={g} others={view.tags.filter((o) => o.id !== g.id)} busy={busy} send={send} />
          ))}
        </ul>
      ) : (
        <p className="muted">{s.empty}</p>
      )}
    </Card>
  );
}
