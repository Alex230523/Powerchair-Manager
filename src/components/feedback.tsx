"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/locale";
import type { feedbackView } from "@/domains/feedback/service";
import { feedbackKinds } from "@/domains/feedback/schema";
import { captureScreen, pngOf } from "@/lib/capture";
import { errors } from "./access-copy";
import { feedbackCopy, fill } from "./feedback-copy";
import { useData } from "./use-api";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";

/**
 * 19: « Signaler un problème » in the application. The window asks the
 * kind and the description; a picture of the screen is optional, made in
 * the browser with every piece of data masked, shown before sending, where
 * the person may mask more or drop it. The server sends it to the project.
 */
export function FeedbackDialog({ locale, close }: { locale: Locale; close: () => void }) {
  const t = feedbackCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  // The picture lives in a ref (a canvas is drawn on, never re-rendered); `shots` counts the captures.
  const shot = useRef<HTMLCanvasElement | null>(null),
    [shots, setShots] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function capture() {
    setError("");
    // The window steps aside for the picture, then comes back.
    ref.current?.close();
    try {
      shot.current = await captureScreen();
      setShots((n) => n + 1);
    } catch {
      setError(t.captureFailed);
    } finally {
      ref.current?.showModal();
    }
  }
  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    const f = new FormData(form);
    let screenshot: string | null = null;
    try {
      screenshot = shot.current ? pngOf(shot.current) : null;
    } catch {
      screenshot = null;
    }
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: f.get("kind"),
          description: f.get("description"),
          contact: f.has("contact"),
          context: { page: window.location.pathname, locale, screen: `${window.innerWidth}x${window.innerHeight}`, browser: navigator.userAgent },
          screenshot,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setSent(true);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} className="player-dialog feedback-dialog" aria-labelledby="feedback-title" onCancel={close} data-capture-skip>
      <div className="dialog-heading">
        <h2 id="feedback-title">{t.title}</h2>
      </div>
      {sent ? (
        <div className="stack-form">
          <p role="status">{t.sent}</p>
          <p className="actions">
            <a className="button secondary" href={`/${locale}/signalements`}>
              {t.mine}
            </a>
            <button type="button" className="button" onClick={close}>
              {t.close}
            </button>
          </p>
        </div>
      ) : (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          {error && <p role="alert">{error}</p>}
          <fieldset>
            <legend>{t.kind}</legend>
            {feedbackKinds.map((k) => (
              <label key={k} className="check">
                <input type="radio" name="kind" value={k} defaultChecked={k === "bug"} />
                {t.kinds[k]}
              </label>
            ))}
          </fieldset>
          <label htmlFor="feedback-description">
            {t.description}
            <textarea id="feedback-description" name="description" required minLength={5} maxLength={4000} rows={4} />
          </label>
          <p className="field-help">{t.contextHint}</p>
          <label className="check" htmlFor="feedback-contact">
            <input id="feedback-contact" name="contact" type="checkbox" />
            {t.contact}
          </label>
          {shots > 0 ? (
            <ShotPreview
              key={shots}
              locale={locale}
              shot={shot}
              drop={() => {
                shot.current = null;
                setShots(0);
              }}
            />
          ) : (
            <p>
              <button type="button" className="button secondary" onClick={() => void capture()}>
                {t.capture}
              </button>
            </p>
          )}
          <p className="actions">
            <button className="button" disabled={busy}>
              {t.send}
            </button>
            <button type="button" className="button secondary" onClick={close}>
              {t.cancel}
            </button>
          </p>
        </form>
      )}
    </dialog>
  );
}

/** The picture before it leaves: drag on it to mask a zone; or drop it. */
function ShotPreview({ locale, shot, drop }: { locale: Locale; shot: RefObject<HTMLCanvasElement | null>; drop: () => void }) {
  const t = feedbackCopy[locale];
  const box = useRef<HTMLDivElement>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const host = box.current,
      canvas = shot.current;
    if (!host || !canvas) return;
    canvas.className = "feedback-shot";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t.preview);
    host.replaceChildren(canvas);
  }, [shot, t]);
  const point = (e: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = shot.current!,
      r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  return (
    <div className="feedback-preview">
      <p className="field-help">{t.previewHint}</p>
      <div
        ref={box}
        className="feedback-shot-box"
        onPointerDown={(e) => {
          start.current = point(e);
        }}
        onPointerUp={(e) => {
          const a = start.current;
          start.current = null;
          if (!a) return;
          const b = point(e);
          const ctx = shot.current?.getContext("2d");
          if (!ctx) return;
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "currentColor";
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }}
      />
      <button type="button" className="button secondary" onClick={drop}>
        {t.drop}
      </button>
    </div>
  );
}

/** /signalements: the person's reports and their state. */
export function MyReports({ locale }: { locale: Locale }) {
  const t = feedbackCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, reload } = useData<Awaited<ReturnType<typeof feedbackView>>>("/api/feedback", failure);
  // Ctrl+K « Signaler un problème » lands here with ?new=1.
  const [open, setOpen] = useState(useSearchParams().get("new") === "1");
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  return (
    <main id="main" className="access feedback">
      <PageHeader title={t.mine} subtitle={t.mineIntro} actions={<Button onClick={() => setOpen(true)}>{t.open}</Button>} />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      {data && (
        <Card title={t.mine} labelledBy="feedback-mine" headingId="feedback-mine">
          <p className="muted">{fill(t.left, { n: data.left })}</p>
          {data.mine.length ? (
            <ul className="records">
              {data.mine.map((m) => (
                <li key={m.id}>
                  <strong>{t.kinds[m.kind as keyof typeof t.kinds]}</strong> <span className="muted">· {new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date(m.created_at))}</span>{" "}
                  <Badge tone={m.state === "fixed" ? "success" : m.state === "in_progress" ? "info" : "neutral"}>{t.states[m.state as keyof typeof t.states]}</Badge>
                  <p>{m.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.none} />
          )}
        </Card>
      )}
      {open && (
        <FeedbackDialog
          locale={locale}
          close={() => {
            setOpen(false);
            void reload();
          }}
        />
      )}
    </main>
  );
}
