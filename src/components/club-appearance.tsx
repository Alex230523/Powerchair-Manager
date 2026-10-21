"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { palettes, tints, type Palette, type Tint } from "@/domains/club/appearance";
import { appearanceCopy } from "./appearance-copy";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, Button, Card, Segmented } from "./ui";

type View = { organization: { id: string; theme_palette: Palette; theme_tint: Tint }; canEdit: boolean };

/** A palette shown in its own colours: serif title, button, chip, card (also in the /design gallery). */
export function PaletteSample({ locale, palette }: { locale: Locale; palette: Palette }) {
  const t = appearanceCopy[locale];
  return (
    <span className="palette-sample" data-palette={palette} aria-hidden="true">
      <span className="palette-sample-title">{t.sampleTitle}</span>
      <span className="palette-sample-row">
        <span className="palette-sample-button">{t.sampleButton}</span>
        <Badge tone="primary">{t.sampleChip}</Badge>
      </span>
      <span className="palette-sample-card" />
    </span>
  );
}

/** Applies a palette and a tint to the page (the live preview), "night" and "light" being the defaults. */
function apply(palette: Palette, tint: Tint) {
  const d = document.documentElement.dataset;
  if (palette === "night") delete d.palette;
  else d.palette = palette;
  if (tint === "light") delete d.tint;
  else d.tint = tint;
}

/**
 * Settings > Club, under the identity (prompt 2.9): four validated palettes
 * shown as samples (button, serif title, chip, card), the background tint,
 * a live preview of the page, then "Enregistrer".
 */
export function ClubAppearance({ locale }: { locale: Locale }) {
  const t = appearanceCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? "", [locale]);
  const { data, error, setError, reload } = useData<View>("/api/club", failure);
  const { busy, message, post } = usePost("/api/club", reload, setError, failure);
  const [choice, setChoice] = useState<{ palette: Palette; tint: Tint } | null>(null);
  const saved = data ? { palette: data.organization.theme_palette ?? "night", tint: data.organization.theme_tint ?? "light" } : null;
  const current = choice ?? saved;
  // Leaving the page without saving puts the club's own palette back.
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  });
  useEffect(
    () => () => {
      const s = savedRef.current;
      if (s) apply(s.palette, s.tint);
    },
    [],
  );
  if (!data || !current || !data.canEdit) return error ? <p role="alert">{error}</p> : null;
  const pick = (next: { palette: Palette; tint: Tint }) => {
    setChoice(next);
    apply(next.palette, next.tint);
  };
  return (
    <Card title={t.title} labelledBy="settings-appearance" headingId="settings-appearance" subtitle={t.intro}>
      <fieldset className="palette-choice">
        <legend>{t.palette}</legend>
        <div className="palette-grid">
          {palettes.map((p) => (
            <label key={p} className="palette-option" data-checked={current.palette === p || undefined}>
              <input type="radio" name="palette" value={p} data-nodirty="" checked={current.palette === p} onChange={() => pick({ ...current, palette: p })} />
              <PaletteSample locale={locale} palette={p} />
              <span className="palette-name">{t.palettes[p]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="palette-tint">
        <span>{t.tint}</span>
        <Segmented label={t.tint} value={current.tint} onChange={(v) => pick({ ...current, tint: v as Tint })} items={tints.map((x) => ({ id: x, label: t.tints[x] }))} />
      </div>
      <p className="muted small">{t.preview}</p>
      <Button
        disabled={busy || (current.palette === saved!.palette && current.tint === saved!.tint)}
        onClick={() =>
          void post({ organizationId: data.organization.id, action: "appearance", palette: current.palette, tint: current.tint }, t.saved).then((ok) => {
            if (ok) setChoice(null);
          })
        }
      >
        {t.save}
      </Button>
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
