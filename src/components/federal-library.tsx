"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { libraryView, FederalSheet } from "@/domains/exercises/library";
import type { Tag } from "@/domains/exercises/service";
import { genres, objectives } from "@/domains/exercises/schema";
import { exercisesCopy } from "./exercises-copy";
import { Badge, Button, EmptyState, PageHeader, Segmented, Toolbar } from "./ui";
import { Modal } from "./modal";
import { TagChip } from "./tag-picker";
import { FieldView } from "./field-editor";
import { ExerciseForm, failure, formDrawing, sheetFields } from "./exercises";

type View = Awaited<ReturnType<typeof libraryView>>;
type Pending = View["pending"][number];
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** The content of a federal sheet or of a proposal, read only. */
function Preview({ locale, x, image }: { locale: Locale; x: FederalSheet | Pending; image: string | null }) {
  const t = exercisesCopy[locale];
  return (
    <div className="exercise-print">
      <p className="exercise-badges">
        <Badge tone={x.genre === "tactic" ? "warning" : "success"}>{t.x4.genres[x.genre]}</Badge>
        <Badge>{t.objectives[x.objective]}</Badge>
        <Badge tone="info">{t.minutes(x.duration_minutes)}</Badge>
        <Badge>{t.players(x.players_min, x.players_max)}</Badge>
        <Badge tone="primary">{t.levels[x.level]}</Badge>
        <Badge>{t.suitedFor[x.suited]}</Badge>
      </p>
      {x.goal && (
        <p>
          <strong>{t.x4.goal}</strong> : {x.goal}
        </p>
      )}
      {x.tags.length > 0 && (
        <ul className="tag-list" aria-label={t.x4.tags}>
          {x.tags.map((name) => (
            <li key={name}>
              <TagChip tag={{ name, color: "c8" }} />
            </li>
          ))}
        </ul>
      )}
      {x.drawing && <FieldView locale={locale} drawing={x.drawing} title={x.title} />}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="exercise-diagram" src={image} alt={t.diagramAlt(x.title)} />
      )}
      {x.description && (
        <section>
          <h3>{t.form.description}</h3>
          <p className="prewrap">{x.description}</p>
        </section>
      )}
      {x.safety && (
        <section>
          <h3>{t.form.safety}</h3>
          <p className="prewrap">{x.safety}</p>
        </section>
      )}
      {x.equipment && (
        <p>
          <strong>{t.form.equipment}</strong> : {x.equipment}
        </p>
      )}
      {x.variants && (
        <section>
          <h3>{t.form.variants}</h3>
          <p className="prewrap">{x.variants}</p>
        </section>
      )}
    </div>
  );
}

/** One proposal, with « Valider et publier » and « Refuser » (a reason is required). */
function Proposal({ locale, x, busy, decide }: { locale: Locale; x: Pending; busy: boolean; decide: (approve: boolean, reason: string) => void }) {
  const t = exercisesCopy[locale].x4.federal;
  const [reason, setReason] = useState(""),
    [refusing, setRefusing] = useState(false),
    [invalid, setInvalid] = useState(false);
  return (
    <li className="card federal-proposal">
      <h3>{x.title}</h3>
      <p className="muted small">{t.proposedBy(x.author, x.club)}</p>
      <details>
        <summary>{t.preview(x.title)}</summary>
        <Preview locale={locale} x={x} image={null} />
      </details>
      <div className="exercise-actions">
        <Button disabled={busy} onClick={() => decide(true, "")}>
          {t.approve}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setRefusing(true)}>
          {t.refuse}
        </Button>
      </div>
      {refusing && (
        <form
          className="federation-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) {
              setInvalid(true);
              return;
            }
            decide(false, reason.trim());
          }}
        >
          <label>
            {t.reason}
            <textarea value={reason} maxLength={1000} rows={2} aria-invalid={invalid || undefined} aria-describedby={invalid ? `reason-${x.id}` : undefined} onChange={(e) => setReason(e.target.value)} />
          </label>
          {invalid && (
            <p className="field-error" id={`reason-${x.id}`}>
              {t.reasonRequired}
            </p>
          )}
          <Button type="submit" variant="secondary" disabled={busy}>
            {t.refuse}
          </Button>
        </form>
      )}
    </li>
  );
}

/**
 * 4: the federal library. For a club: search, filters, tags, preview, and
 * « Copier dans notre bibliothèque ». For the federation: the proposals to
 * validate or refuse, its own sheets to publish, and the withdrawal.
 */
export function FederalLibrary({ locale, federation, onCopied }: { locale: Locale; federation: boolean; onCopied?: () => void }) {
  const t = exercisesCopy[locale];
  const f = t.x4.federal;
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [genre, setGenre] = useState(""),
    [objective, setObjective] = useState(""),
    [tag, setTag] = useState(""),
    [preview, setPreview] = useState<FederalSheet | null>(null),
    [publishing, setPublishing] = useState(false);
  const load = useCallback(
    () =>
      fetch("/api/exercises/library", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setView(v);
        })
        .catch((e: Error) => setError(e.message === "FORBIDDEN" ? t.forbidden : failure(locale, e.message))),
    [locale, t.forbidden],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/exercises/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v as { id: string };
  }
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await fn());
      await load();
    } catch (e) {
      setError(failure(locale, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(async () => {
      await post({ action: "publish", ...sheetFields(form), drawing: formDrawing(form) ?? null });
      setPublishing(false);
      return t.saved;
    });
  }
  const tags = [...new Set((view?.sheets ?? []).flatMap((x) => x.tags))].sort((a, b) => a.localeCompare(b));
  const shown = (view?.sheets ?? []).filter(
    (x) =>
      (!q || fold(`${x.title} ${x.goal} ${x.description} ${x.origin_club} ${x.tags.join(" ")}`).includes(fold(q))) &&
      (!genre || x.genre === genre) &&
      (!objective || x.objective === objective) &&
      (!tag || x.tags.includes(tag)),
  );
  const content = (
    <>
      {error && !publishing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && !view.federation && <p>{f.noFederation}</p>}
      {view?.federation && !federation && <p className="muted">{f.intro}</p>}
      {view?.can.decide && (
        <section aria-labelledby="federal-pending">
          <h2 id="federal-pending">{f.pendingTitle}</h2>
          {view.pending.length ? (
            <ul className="federal-list">
              {view.pending.map((x) => (
                <Proposal
                  key={x.id}
                  locale={locale}
                  x={x}
                  busy={busy}
                  decide={(approve, reason) =>
                    void run(async () => {
                      await post({ action: "decide", exerciseId: x.id, approve, reason });
                      return f.decided;
                    })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="muted">{f.noPending}</p>
          )}
          <h2>{f.publishedTitle}</h2>
        </section>
      )}
      {view?.federation && (
        <>
          <Toolbar label={t.x4.tabs.federal}>
            <label className="compact-field">
              {t.search}
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Segmented label={t.x4.genre} value={genre || "all"} onChange={(v) => setGenre(v === "all" ? "" : v)} items={(["all", ...genres] as const).map((g) => ({ id: g, label: t.x4.genreFilter[g] }))} />
            <label className="compact-field">
              {t.objective}
              <select value={objective} onChange={(e) => setObjective(e.target.value)}>
                <option value="">{t.all}</option>
                {objectives.map((o) => (
                  <option key={o} value={o}>
                    {t.objectives[o]}
                  </option>
                ))}
              </select>
            </label>
            {tags.length > 0 && (
              <label className="compact-field">
                {t.x4.tags}
                <select value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">{t.all}</option>
                  {tags.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Toolbar>
          {shown.length ? (
            <ul className="federal-list">
              {shown.map((x) => (
                <li key={x.id} className="card federal-sheet">
                  <h3>{x.title}</h3>
                  <p className="exercise-badges">
                    <Badge tone={x.genre === "tactic" ? "warning" : "success"}>{t.x4.genres[x.genre]}</Badge>
                    <Badge>{t.objectives[x.objective]}</Badge>
                    <Badge tone="info">{t.minutes(x.duration_minutes)}</Badge>
                    {x.copied && <Badge tone="primary">{f.alreadyCopied}</Badge>}
                  </p>
                  {x.goal && <p className="small">{x.goal}</p>}
                  {x.tags.length > 0 && (
                    <ul className="tag-list" aria-label={t.x4.tags}>
                      {x.tags.map((name) => (
                        <li key={name}>
                          <TagChip tag={{ name, color: "c8" }} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="muted small">
                    {t.x4.creator(x.origin_author, x.origin_club)} · {f.copies(x.copies)}
                  </p>
                  <div className="exercise-actions">
                    <Button variant="secondary" onClick={() => setPreview(x)}>
                      {f.preview(x.title)}
                    </Button>
                    {view.can.copy && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await post({ action: "copy", id: x.id });
                            onCopied?.();
                            return f.copied;
                          })
                        }
                      >
                        {f.copy}
                      </Button>
                    )}
                    {view.can.decide && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await post({ action: "withdraw", id: x.id });
                            return t.saved;
                          })
                        }
                      >
                        {f.withdraw}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="clipboardList" title={view.sheets.length ? t.noMatch : f.empty} />
          )}
        </>
      )}
      {preview && (
        <Modal title={preview.title} close={() => setPreview(null)}>
          <Preview locale={locale} x={preview} image={preview.diagram_type && preview.diagram_type !== "application/pdf" ? `/api/exercises/library/${preview.id}/diagram` : null} />
        </Modal>
      )}
      {publishing && (
        <ExerciseForm
          locale={locale}
          row={null}
          federal
          tags={tags.map((name): Tag => ({ id: name, name, color: "c8" }))}
          drawing={null}
          busy={busy}
          error={error}
          close={() => setPublishing(false)}
          save={publish}
        />
      )}
    </>
  );
  if (!federation) return <div className="federal-library">{content}</div>;
  return (
    <main id="main" className="access exercises">
      <PageHeader
        title={t.x4.tabs.federal}
        subtitle={f.fedIntro}
        actions={
          view?.can.decide && (
            <Button icon="plus" onClick={() => setPublishing(true)}>
              {f.publishOwn}
            </Button>
          )
        }
      />
      {content}
    </main>
  );
}
