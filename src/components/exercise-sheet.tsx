"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { exerciseDetail, programPrint, Exercise } from "@/domains/exercises/service";
import { errors } from "./access-copy";
import { exercisesCopy } from "./exercises-copy";
import { Badge, Button, PageHeader } from "./ui";
import { ExerciseForm, failure, saveExtras, sheetFields } from "./exercises";
import { FieldView } from "./field-editor";
import { TagChip } from "./tag-picker";
import { Modal } from "./modal";
import type { Drawing } from "@/domains/exercises/drawing";

type Detail = Awaited<ReturnType<typeof exerciseDetail>>;
type Program = Awaited<ReturnType<typeof programPrint>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** The content of a sheet, on screen and on paper (A4, for the side of the pitch). */
function SheetBody({ locale, x, planned, notes, drawing, exports = false }: { locale: Locale; x: Exercise; planned?: number; notes?: string; drawing: Drawing | null; exports?: boolean }) {
  const t = exercisesCopy[locale];
  return (
    <>
      <p className="exercise-badges">
        <Badge tone={x.genre === "tactic" ? "warning" : "success"}>{t.x4.genres[x.genre]}</Badge>
        <Badge tone="info">{t.minutes(planned ?? x.duration_minutes)}</Badge>
        <Badge>{t.players(x.players_min, x.players_max)}</Badge>
        <Badge tone="primary">{t.levels[x.level]}</Badge>
        <Badge>{t.suitedFor[x.suited]}</Badge>
        <Badge>{t.objectives[x.objective]}</Badge>
      </p>
      {x.goal && (
        <p>
          <strong>{t.x4.goal}</strong> : {x.goal}
        </p>
      )}
      {x.tags.length > 0 && (
        <ul className="tag-list" aria-label={t.x4.tags}>
          {x.tags.map((g) => (
            <li key={g.id}>
              <TagChip tag={g} />
            </li>
          ))}
        </ul>
      )}
      {drawing && <FieldView locale={locale} drawing={drawing} title={x.title} exportLabels={exports ? { png: t.x4.exportPng, pdf: t.x4.exportPdf } : undefined} />}
      {x.has_diagram &&
        (x.diagram_type === "application/pdf" ? (
          <p>
            <a href={`/api/exercises/${x.id}/diagram`} target="_blank" rel="noopener noreferrer">
              {t.diagramPdf}
            </a>
          </p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="exercise-diagram" src={`/api/exercises/${x.id}/diagram`} alt={t.diagramAlt(x.title)} />
        ))}
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
      {x.video_url && (
        <p className="no-print">
          <a href={x.video_url} target="_blank" rel="noopener noreferrer">
            {x.video_url}
          </a>
        </p>
      )}
      {notes && <p className="exercise-notes">{notes}</p>}
    </>
  );
}

/** /[locale]/exercises/[id]: the whole sheet, where it was used, and its actions. */
export function ExerciseSheet({ locale, id }: { locale: Locale; id: string }) {
  const t = exercisesCopy[locale];
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [sending, setSending] = useState(false);
  const load = useCallback(
    () =>
      fetch(`/api/exercises/${id}`, { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setData(v);
        })
        .catch((e: Error) => setError(["FORBIDDEN", "CLUB_ONLY"].includes(e.message) ? t.forbidden : (errors[e.message]?.[locale] ?? t.failed))),
    [id, locale, t.forbidden, t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data?.organization_id }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v as { id: string };
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const code = (e as Error).message;
      setError(failure(locale, code));
      if (code === "STALE_VERSION") await load();
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const x = data!.exercise;
    await run(async () => {
      await post({ action: "update", id: x.id, version: x.version, ...sheetFields(f), shared: f.has("shared") });
      await saveExtras(post, x.id, f, true);
      setEditing(false);
      await load();
      setMessage(t.saved);
    });
  }
  const x = data?.exercise;
  return (
    <main id="main" className="access exercise-page">
      <p className="no-print">
        <Link href={`/${locale}/exercises`}>{t.back}</Link>
      </p>
      {error && !editing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {x && data && (
        <>
          <PageHeader
            title={x.title}
            subtitle={`${t.x4.creator(x.creator, x.creator_club)} · ${t.x4.uses(x.uses, x.matches)}`}
            actions={
              <span className="no-print exercise-actions">
                <Button variant="secondary" icon="document" onClick={() => window.print()}>
                  {t.print}
                </Button>
                {data.can.write && (
                  <>
                    <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                      {t.edit}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const copy = await post({ action: "duplicate", id: x.id });
                          router.push(`/${locale}/exercises/${copy.id}`);
                        })
                      }
                    >
                      {t.duplicate}
                    </Button>
                    {data.clubs.length > 0 && (
                      <Button variant="secondary" disabled={busy} onClick={() => setSending(true)}>
                        {t.send.action}
                      </Button>
                    )}
                    {data.can.propose && (x.federal_status === "private" || x.federal_status === "refused") && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await post({ action: "propose", id: x.id });
                            await load();
                            setMessage(t.x4.federal.pending);
                          })
                        }
                      >
                        {t.x4.federal.propose}
                      </Button>
                    )}
                    {x.federal_status === "pending" && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await post({ action: "unpropose", id: x.id });
                            await load();
                            setMessage(t.saved);
                          })
                        }
                      >
                        {t.x4.federal.unpropose}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await post({ action: "archive", id: x.id, archived: !x.archived });
                          await load();
                          setMessage(t.saved);
                        })
                      }
                    >
                      {x.archived ? t.restore : t.archive}
                    </Button>
                  </>
                )}
              </span>
            }
          />
          {sending && (
            // 04/11/2026: the sheet goes to another club of the federation, whose presidency answers.
            <Modal title={t.send.title} close={() => setSending(false)}>
              <form
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    await post({ action: "send", id: x.id, clubId: String(f.get("club")), message: String(f.get("message") ?? "") });
                    setSending(false);
                    setMessage(t.send.sent);
                  });
                }}
              >
                <p className="muted">{t.send.intro}</p>
                {error && <p role="alert">{error}</p>}
                <label>
                  {t.send.club}
                  <select name="club" required defaultValue="">
                    <option value="" disabled>
                      {t.send.club}
                    </option>
                    {data.clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.send.message}
                  <textarea name="message" rows={3} maxLength={500} />
                </label>
                <div className="form-actions">
                  <Button type="submit" loading={busy}>
                    {t.send.submit}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setSending(false)}>
                    {t.send.cancel}
                  </Button>
                </div>
              </form>
            </Modal>
          )}
          {/* Point 12: where the sheet went, and the answers. */}
          {data.sent.length > 0 && (
            <section className="no-print exercise-sent" aria-labelledby="exercise-sent">
              <h2 id="exercise-sent">{t.send.sentTitle}</h2>
              <ul className="plain-list">
                {data.sent.map((o) => (
                  <li key={o.id}>
                    <strong>{o.club}</strong>{" "}
                    <Badge tone={o.status === "accepted" ? "success" : o.status === "refused" ? "danger" : "info"}>{t.send.sentStates[o.status]}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {x.archived && <Badge>{t.archived}</Badge>}
          {x.federal_status === "pending" && <p className="muted no-print">{t.x4.federal.pending}</p>}
          {x.federal_status === "published" && <p className="muted no-print">{t.x4.federal.published}</p>}
          {x.federal_status === "refused" && <p className="no-print">{t.x4.federal.refused(x.federal_reason)}</p>}
          <article className="exercise-print">
            <SheetBody locale={locale} x={x} drawing={data.drawing} exports />
          </article>
          {data.used.length > 0 && (
            <section className="no-print" aria-labelledby="exercise-used">
              <h2 id="exercise-used">{t.usedIn}</h2>
              <ul className="plain-list">
                {data.used.map((u) => (
                  <li key={u.id}>
                    <Link href={`/${locale}/calendar?event=${u.id}`}>
                      {u.title} · {new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(u.starts_at))}
                      {u.team ? ` · ${u.team}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.matches.length > 0 && (
            <section className="no-print" aria-labelledby="exercise-matches">
              <h2 id="exercise-matches">{t.x4.matchesUsed}</h2>
              <ul className="plain-list">
                {data.matches.map((m) => (
                  <li key={m.id}>
                    <Link href={`/${locale}/matches/${m.id}`}>
                      {m.team} · {m.opponent} · {new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(m.starts_at))}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {editing && x && data && <ExerciseForm locale={locale} row={x} tags={data.tags} drawing={data.drawing} busy={busy} error={error} close={() => setEditing(false)} save={save} />}
    </main>
  );
}

/** « Imprimer le programme »: every sheet of a training, one per page. */
export function ProgramPrint({ locale, eventId }: { locale: Locale; eventId: string }) {
  const t = exercisesCopy[locale];
  const [data, setData] = useState<Program | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/exercises/program/${eventId}`, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setData(v);
      })
      .catch((e: Error) => setError(["FORBIDDEN", "CLUB_ONLY"].includes(e.message) ? t.forbidden : (errors[e.message]?.[locale] ?? t.failed)));
  }, [eventId, locale, t.forbidden, t.failed]);
  const total = data?.items.reduce((n, i) => n + i.planned_minutes, 0) ?? 0;
  return (
    <main id="main" className="access exercise-page">
      <p className="no-print">
        <Link href={`/${locale}/calendar?event=${eventId}`}>{t.back}</Link>
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <PageHeader
            title={`${t.program.printTitle} : ${data.event.title}`}
            subtitle={`${new Intl.DateTimeFormat(tag(locale), { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(data.event.starts_at))}${data.event.team ? ` · ${data.event.team}` : ""} · ${t.program.total(total)}`}
            actions={
              <Button variant="secondary" icon="document" className="no-print" onClick={() => window.print()}>
                {t.print}
              </Button>
            }
          />
          {data.items.length ? (
            <ol className="program-print">
              {data.items.map((x) => (
                <li key={x.id} className="exercise-print">
                  <h2>{x.title}</h2>
                  <SheetBody locale={locale} x={x} planned={x.planned_minutes} notes={x.notes} drawing={data.drawings[x.id] ?? null} />
                </li>
              ))}
            </ol>
          ) : (
            <p>{t.program.empty}</p>
          )}
        </>
      )}
    </main>
  );
}
