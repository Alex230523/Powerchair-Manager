"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { exerciseDetail, programPrint, Exercise } from "@/domains/exercises/service";
import { errors } from "./access-copy";
import { exercisesCopy } from "./exercises-copy";
import { Badge, Button, PageHeader } from "./ui";
import { ExerciseForm } from "./exercises";

type Detail = Awaited<ReturnType<typeof exerciseDetail>>;
type Program = Awaited<ReturnType<typeof programPrint>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** The content of a sheet, on screen and on paper (A4, for the side of the pitch). */
function SheetBody({ locale, x, planned, notes }: { locale: Locale; x: Exercise; planned?: number; notes?: string }) {
  const t = exercisesCopy[locale];
  return (
    <>
      <p className="exercise-badges">
        <Badge tone="info">{t.minutes(planned ?? x.duration_minutes)}</Badge>
        <Badge>{t.players(x.players_min, x.players_max)}</Badge>
        <Badge tone="primary">{t.levels[x.level]}</Badge>
        <Badge>{t.suitedFor[x.suited]}</Badge>
        <Badge>{t.objectives[x.objective]}</Badge>
      </p>
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
    [editing, setEditing] = useState(false);
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
      setError(code === "INVALID_FILE" ? t.invalidFile : code === "STALE_VERSION" ? t.stale : (errors[code]?.[locale] ?? t.failed));
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
      await post({
        action: "update",
        id: x.id,
        version: x.version,
        title: String(f.get("title") ?? "").trim(),
        objective: f.get("objective"),
        description: f.get("description"),
        safety: f.get("safety"),
        durationMinutes: Number(f.get("duration")),
        playersMin: Number(f.get("playersMin")),
        playersMax: Number(f.get("playersMax")),
        level: f.get("level"),
        suited: f.get("suited"),
        equipment: f.get("equipment"),
        variants: f.get("variants"),
        videoUrl: String(f.get("video") ?? "").trim(),
        tags: String(f.get("tags") ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .slice(0, 10),
        shared: f.has("shared"),
      });
      const file = f.get("diagram");
      if (file instanceof File && file.size) {
        if (file.size > 2097152 || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) throw new Error("INVALID_FILE");
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("INVALID_FILE"));
          reader.readAsDataURL(file);
        });
        await post({ action: "diagram", id: x.id, mediaType: file.type, data: b64 });
      }
      if (f.has("removeDiagram")) await post({ action: "removeDiagram", id: x.id });
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
            subtitle={`${t.author} : ${x.author} · ${t.uses(x.uses)}`}
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
          {x.archived && <Badge>{t.archived}</Badge>}
          <article className="exercise-print">
            <SheetBody locale={locale} x={x} />
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
        </>
      )}
      {editing && x && <ExerciseForm locale={locale} row={x} busy={busy} error={error} close={() => setEditing(false)} save={save} />}
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
                  <SheetBody locale={locale} x={x} planned={x.planned_minutes} notes={x.notes} />
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
