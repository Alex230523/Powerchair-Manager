import type { Locale } from "@/lib/locale";

/** The data tables (wave 15, C8): selection, grouped actions, columns. */
export type TableCopy = {
  selectAll: string;
  selectRow: string;
  selected: [string, string];
  clear: string;
  toolbar: string;
  columns: string;
  columnsShown: string;
  done: [string, string];
  refused: [string, string];
  working: string;
  apply: string;
  confirm: string;
  back: string;
  exportName: string;
  reasons: Record<string, string>;
  otherReason: string;
};

export const tableCopy: Record<Locale, TableCopy> = {
  fr: {
    selectAll: "Tout sélectionner",
    selectRow: "Sélectionner {name}",
    selected: ["1 sélectionné", "{n} sélectionnés"],
    clear: "Désélectionner",
    toolbar: "Actions sur la sélection",
    columns: "Colonnes",
    columnsShown: "Colonnes affichées",
    done: ["1 réussie", "{n} réussies"],
    refused: ["1 refusée", "{n} refusées"],
    working: "Action en cours…",
    apply: "Appliquer",
    confirm: "Confirmer",
    back: "Retour",
    exportName: "selection",
    reasons: {
      FORBIDDEN: "droits insuffisants",
      MFA_REQUIRED: "double authentification requise",
      NOT_FOUND: "introuvable",
      INVALID_TRANSITION: "état incompatible",
      STALE_VERSION: "modifié entre-temps",
      ALREADY_EXISTS: "déjà fait",
      CONFLICT: "déjà fait",
    },
    otherReason: "action impossible",
  },
  nl: {
    selectAll: "Alles selecteren",
    selectRow: "{name} selecteren",
    selected: ["1 geselecteerd", "{n} geselecteerd"],
    clear: "Selectie wissen",
    toolbar: "Acties op de selectie",
    columns: "Kolommen",
    columnsShown: "Getoonde kolommen",
    done: ["1 gelukt", "{n} gelukt"],
    refused: ["1 geweigerd", "{n} geweigerd"],
    working: "Bezig…",
    apply: "Toepassen",
    confirm: "Bevestigen",
    back: "Terug",
    exportName: "selectie",
    reasons: {
      FORBIDDEN: "onvoldoende rechten",
      MFA_REQUIRED: "tweestapsverificatie vereist",
      NOT_FOUND: "niet gevonden",
      INVALID_TRANSITION: "status past niet",
      STALE_VERSION: "intussen gewijzigd",
      ALREADY_EXISTS: "al gedaan",
      CONFLICT: "al gedaan",
    },
    otherReason: "actie niet mogelijk",
  },
  en: {
    selectAll: "Select all",
    selectRow: "Select {name}",
    selected: ["1 selected", "{n} selected"],
    clear: "Clear selection",
    toolbar: "Actions on the selection",
    columns: "Columns",
    columnsShown: "Columns shown",
    done: ["1 done", "{n} done"],
    refused: ["1 refused", "{n} refused"],
    working: "Working…",
    apply: "Apply",
    confirm: "Confirm",
    back: "Back",
    exportName: "selection",
    reasons: {
      FORBIDDEN: "insufficient rights",
      MFA_REQUIRED: "two-step verification required",
      NOT_FOUND: "not found",
      INVALID_TRANSITION: "state does not allow it",
      STALE_VERSION: "changed in the meantime",
      ALREADY_EXISTS: "already done",
      CONFLICT: "already done",
    },
    otherReason: "action not possible",
  },
};

const fill = (s: string, n: number) => s.replace("{n}", String(n));
/** "3 réussies, 1 refusée : droits insuffisants". */
export function bulkSentence(t: TableCopy, locale: Locale, s: { done: number; refused: number; reasons: { code: string; count: number }[] }) {
  const parts = [];
  if (s.done || !s.refused) parts.push(fill(t.done[s.done === 1 ? 0 : 1], s.done));
  if (s.refused) parts.push(fill(t.refused[s.refused === 1 ? 0 : 1], s.refused));
  const why = s.reasons.map((r) => t.reasons[r.code] ?? t.otherReason).filter((v, i, a) => a.indexOf(v) === i);
  return parts.join(", ") + (why.length ? (locale === "fr" ? " : " : ": ") + why.join(", ") : "");
}
