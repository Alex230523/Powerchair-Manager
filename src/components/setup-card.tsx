"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { setupDone, setupIcons, setupLinks, type SetupState } from "@/domains/setup/schema";
import { Icon } from "./icons";
import { Card, IconTile } from "./ui";
import { setupCopy } from "./setup-copy";
import { cssVars } from "./css-vars";
import { useData } from "./use-api";

/**
 * "Bien démarrer" (wave 15, C3): the steps of a new club, from its data, a
 * thin progress bar, "Commencer" opening the right form, and "Masquer". On
 * the home page until done or hidden; always in Settings > Club.
 */
export function SetupCard({
  locale,
  organizationId,
  state,
  where,
  changed,
}: {
  locale: Locale;
  organizationId: string;
  state: SetupState;
  where: "home" | "settings";
  /** After hiding or showing the card again. */
  changed: (state: SetupState) => void;
}) {
  const t = setupCopy[locale];
  const [busy, setBusy] = useState(false);
  const done = setupDone(state),
    total = state.steps.length;
  async function hide(hidden: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "setupHidden", hidden }),
      });
      if (r.ok) changed((await r.json()) as SetupState);
    } finally {
      setBusy(false);
    }
  }
  const progress = t.progress.replace("{done}", String(done)).replace("{total}", String(total));
  return (
    <Card
      className="setup-card dash-section"
      title={t.title}
      id={where === "home" ? "dash-setup" : "settings-setup"}
      subtitle={where === "settings" ? t.settingsIntro : undefined}
      actions={
        where === "home" ? (
          <button type="button" className="text-button" disabled={busy} onClick={() => void hide(true)}>
            {t.hide}
          </button>
        ) : state.hidden && done < total ? (
          <button type="button" className="button secondary" disabled={busy} onClick={() => void hide(false)}>
            {t.show}
          </button>
        ) : undefined
      }
    >
      <div className="setup-progress">
        <span className="setup-bar" role="progressbar" aria-label={t.progressLabel} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={progress} style={cssVars({ value: `${Math.round((done / total) * 100)}%` })}>
          <span />
        </span>
        <strong>{progress}</strong>
      </div>
      {where === "settings" && (state.hidden && done < total ? <p className="muted">{t.hiddenNote}</p> : done === total ? <p className="muted">{t.allDone}</p> : null)}
      <ul className="setup-steps">
        {state.steps.map((s) => (
          <li key={s.id} data-done={s.done || undefined}>
            {s.done ? (
              <span className="setup-check" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            ) : (
              <IconTile icon={setupIcons[s.id]} size={28} />
            )}
            <span className="setup-text">
              <strong>
                {t.steps[s.id].title}
                {s.done && <span className="sr-only"> · {t.done}</span>}
              </strong>
              <span className="muted small">{t.steps[s.id].text}</span>
            </span>
            {!s.done && (
              <Link className="button secondary sm" href={`/${locale}${setupLinks[s.id]}`}>
                {t.start}
                <span className="sr-only"> : {t.steps[s.id].title}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Settings > Club: the same card, always there for the president, with "Afficher à nouveau" when hidden. */
export function SetupSettings({ locale }: { locale: Locale }) {
  const failure = useCallback(() => "", []);
  const { data, reload, denied } = useData<SetupState & { organization_id: string }>("/api/setup", failure);
  if (denied || !data) return null;
  return <SetupCard locale={locale} organizationId={data.organization_id} state={data} where="settings" changed={() => void reload()} />;
}
