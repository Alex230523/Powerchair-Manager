import type { Locale } from "@/lib/locale";

/** H10: « Clés et badges » (fr, nl, en). */
type Copy = {
  title: string;
  empty: string;
  label: string;
  labelHint: string;
  handedOn: string;
  note: string;
  add: string;
  returned: string;
  returnedOn: string;
  markReturned: string;
  remove: string;
  since: string;
  column: string;
  count: string;
  saved: string;
};
export const keysCopy: Record<Locale, Copy> = {
  fr: {
    title: "Clés et badges",
    empty: "Aucune clé ni aucun badge.",
    label: "Clé ou badge",
    labelHint: "Par exemple « Local du club », « Badge salle X », « Cadenas remorque ».",
    handedOn: "Remis le",
    note: "Remarque",
    add: "Ajouter",
    returned: "Rendu",
    returnedOn: "rendu le {date}",
    markReturned: "Marquer comme rendu",
    remove: "Supprimer",
    since: "depuis le {date}",
    column: "Clés",
    count: "{n} clé(s)",
    saved: "Enregistré.",
  },
  nl: {
    title: "Sleutels en badges",
    empty: "Geen sleutel of badge.",
    label: "Sleutel of badge",
    labelHint: "Bijvoorbeeld « Clublokaal », « Badge zaal X », « Hangslot aanhangwagen ».",
    handedOn: "Overhandigd op",
    note: "Opmerking",
    add: "Toevoegen",
    returned: "Teruggegeven",
    returnedOn: "teruggegeven op {date}",
    markReturned: "Als teruggegeven markeren",
    remove: "Verwijderen",
    since: "sinds {date}",
    column: "Sleutels",
    count: "{n} sleutel(s)",
    saved: "Opgeslagen.",
  },
  en: {
    title: "Keys and badges",
    empty: "No key or badge.",
    label: "Key or badge",
    labelHint: "For example “Club room”, “Hall X badge”, “Trailer padlock”.",
    handedOn: "Handed over on",
    note: "Note",
    add: "Add",
    returned: "Returned",
    returnedOn: "returned on {date}",
    markReturned: "Mark as returned",
    remove: "Remove",
    since: "since {date}",
    column: "Keys",
    count: "{n} key(s)",
    saved: "Saved.",
  },
};
