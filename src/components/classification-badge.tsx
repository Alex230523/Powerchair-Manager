"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import { defaultTexts, shownClass, type ClassificationTexts } from "@/domains/classification/schema";
import { classificationCopy } from "./classification-copy";
import { Badge } from "./ui";
import { Tip } from "./tip";

/** One request per page for the federation's texts; the defaults until it answers or when it fails. */
let cached: Promise<ClassificationTexts> | null = null;
function loadTexts() {
  cached ??= fetch("/api/classification/texts", { cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()).texts as ClassificationTexts) : defaultTexts))
    .catch(() => defaultTexts);
  return cached;
}
/** Forget the cached texts (after the federation saves new ones). */
export function refreshClassificationTexts() {
  cached = null;
}
export function useClassificationTexts() {
  const [texts, setTexts] = useState<ClassificationTexts>(defaultTexts);
  useEffect(() => {
    let live = true;
    void loadTexts().then((t) => live && setTexts(t));
    return () => {
      live = false;
    };
  }, []);
  return texts;
}

/**
 * Wave 17 (J4): a classification everywhere it is shown. PF1 and PF2 carry
 * a tip with the federation's text (hover or keyboard focus, Escape closes);
 * « En attente » and « Non définie » are plain badges.
 */
export function ClassificationBadge({ locale, value }: { locale: Locale; value: string | null | undefined }) {
  const texts = useClassificationTexts();
  const c = shownClass(value);
  const label = classificationCopy[locale].classes[c];
  if (c === "PF1" || c === "PF2")
    return (
      <Tip label={label} tone="info">
        <strong>{c}</strong>{locale === "fr" ? " : " : ": "}{texts[c][locale]}
      </Tip>
    );
  return <Badge tone={c === "pending" ? "warning" : "neutral"}>{label}</Badge>;
}
