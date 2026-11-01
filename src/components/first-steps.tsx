"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { TutorialAudience } from "@/domains/tutorial/schema";
import { tutorialCopy } from "./tutorial-copy";
import { Button, Card } from "./ui";

/** Settings > My account asks the tour to start again. */
export const tutorialEvent = "pfm-tutorial";

async function mark(action: "seen" | "reset") {
  await fetch("/api/tutorial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
}

/**
 * Wave 17 (O1): the first-connection tour, a window one can skip, that
 * points in turn at the team bar, the calendar, attendance, the tasks and the
 * profile. Seen once per account and audience.
 */
export function FirstSteps({ locale, role }: { locale: Locale; role: string | undefined }) {
  const t = tutorialCopy[locale];
  const [audience, setAudience] = useState<TutorialAudience | null>(null),
    [step, setStep] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const load = (force: boolean) =>
      fetch("/api/tutorial", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as { audience: TutorialAudience | null; seen: boolean }) : null))
        .then((v) => {
          if (cancelled || !v?.audience || !tutorialCopy[locale].steps[v.audience]) return;
          setAudience(v.audience);
          if (force || !v.seen) setStep(0);
        })
        .catch(() => undefined);
    if (role) void load(false);
    const again = () => void load(true);
    window.addEventListener(tutorialEvent, again);
    return () => {
      cancelled = true;
      window.removeEventListener(tutorialEvent, again);
    };
  }, [role, locale]);
  const steps = audience ? (t.steps[audience] ?? []) : [];
  const current = step !== null ? steps[step] : undefined;
  // The part of the screen the step talks about is outlined while visible.
  useEffect(() => {
    if (!current) return;
    const target = document.querySelector<HTMLElement>(current.target);
    if (!target || !target.getClientRects().length) return;
    target.setAttribute("data-tour-target", "");
    target.scrollIntoView({ block: "nearest" });
    return () => target.removeAttribute("data-tour-target");
  }, [current]);
  useEffect(() => {
    if (current) box.current?.focus();
  }, [current]);
  if (!current || step === null) return null;
  const close = () => {
    setStep(null);
    void mark("seen");
  };
  const last = step === steps.length - 1;
  return (
    <div
      ref={box}
      className="first-steps"
      role="dialog"
      aria-modal="false"
      aria-labelledby="first-steps-title"
      aria-describedby="first-steps-text"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <p className="first-steps-count muted small">
        {t.label} · {t.step.replace("{n}", String(step + 1)).replace("{total}", String(steps.length))}
      </p>
      <h2 id="first-steps-title">{current.title}</h2>
      <p id="first-steps-text">{current.text}</p>
      <div className="first-steps-actions">
        <Button variant="ghost" onClick={close}>
          {t.skip}
        </Button>
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            {t.previous}
          </Button>
        )}
        <Button onClick={() => (last ? close() : setStep(step + 1))}>{last ? t.finish : t.next}</Button>
      </div>
    </div>
  );
}

/** Settings > My account: start the tour again. */
export function TutorialSettings({ locale }: { locale: Locale }) {
  const t = tutorialCopy[locale];
  return (
    <Card title={t.settingsTitle} labelledBy="settings-tutorial" headingId="settings-tutorial">
      <p className="muted">{t.settingsText}</p>
      <Button
        variant="secondary"
        onClick={async () => {
          await mark("reset");
          window.dispatchEvent(new Event(tutorialEvent));
        }}
      >
        {t.replay}
      </Button>
    </Card>
  );
}
