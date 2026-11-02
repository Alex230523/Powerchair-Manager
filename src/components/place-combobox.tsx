"use client";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/lib/locale";
import { placeComboCopy } from "./place-combobox-copy";

/**
 * 1: the event's place in one field, an editable combobox (ARIA 1.2): as
 * one types, « Nos lieux », then « Annuaire partagé », then « Utiliser
 * ‹texte› comme lieu libre » and « + Créer ce lieu ». Without a choice, the
 * text typed is a free-text place. The form reads three hidden fields, as
 * before: place, sharedVenue, freeLocation (one of them filled).
 */
export type PlaceOption = { id: string; name: string; address?: string | null };
type Chosen = { kind: "place" | "shared"; id: string; name: string } | null;
type Item = { key: string; kind: "place" | "shared" | "free" | "create"; id?: string; label: string; detail?: string };

const norm = (s: string) => s.toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function PlaceCombobox({
  locale,
  places,
  shared,
  initial,
  canCreate,
  create,
}: {
  locale: Locale;
  places: PlaceOption[];
  shared: PlaceOption[];
  initial: { placeId: string | null; sharedId: string | null; free: string };
  canCreate: boolean;
  /** Opens the club's « new place » window with the text typed; the new place is chosen on return. */
  create: (name: string) => void;
}) {
  const t = placeComboCopy[locale];
  const uid = useId();
  const start: Chosen = initial.placeId
    ? { kind: "place", id: initial.placeId, name: places.find((p) => p.id === initial.placeId)?.name ?? "" }
    : initial.sharedId
      ? { kind: "shared", id: initial.sharedId, name: shared.find((p) => p.id === initial.sharedId)?.name ?? "" }
      : null;
  const [chosen, setChosen] = useState<Chosen>(start),
    [text, setText] = useState(start?.name ?? initial.free),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const items = useMemo(() => {
    const q = norm(text.trim());
    const match = (p: PlaceOption) => !q || norm(`${p.name} ${p.address ?? ""}`).includes(q);
    const ours: Item[] = places.filter(match).slice(0, 8).map((p) => ({ key: "p" + p.id, kind: "place", id: p.id, label: p.name, detail: p.address ?? undefined }));
    const dir: Item[] = shared.filter(match).slice(0, 8).map((p) => ({ key: "s" + p.id, kind: "shared", id: p.id, label: p.name, detail: p.address ?? undefined }));
    const tail: Item[] = text.trim()
      ? [{ key: "free", kind: "free", label: t.free.replace("{text}", text.trim()) }, ...(canCreate ? [{ key: "create", kind: "create", label: t.create } as Item] : [])]
      : [];
    return { ours, dir, all: [...ours, ...dir, ...tail], tail };
  }, [text, places, shared, canCreate, t]);
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  function pick(item: Item) {
    if (item.kind === "create") {
      setOpen(false);
      create(text.trim());
      return;
    }
    if (item.kind === "free") setChosen(null);
    else setChosen({ kind: item.kind, id: item.id!, name: item.label });
    if (item.kind !== "free") setText(item.label);
    setOpen(false);
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(items.all.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && items.all[active]) {
      // Enter picks the option, never submits the event's form.
      e.preventDefault();
      pick(items.all[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }
  const index = (item: Item) => items.all.indexOf(item);
  const option = (item: Item) => (
    <li
      key={item.key}
      id={optionId(index(item))}
      role="option"
      aria-selected={index(item) === active}
      className={`combo-option${item.kind === "create" ? " combo-create" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(item)}
    >
      <span>{item.label}</span>
      {item.detail && <span className="muted small">{item.detail}</span>}
    </li>
  );
  return (
    <div className="place-combo">
      <label htmlFor={`${uid}-input`}>{t.label}</label>
      <div className="combo-anchor">
        <input
          id={`${uid}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          maxLength={500}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items.all[active] ? optionId(active) : undefined}
          aria-describedby={`${uid}-hint`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Typing again leaves the place chosen: the text is free until a new choice.
            setChosen(null);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={key}
        />
        {open && (
          <div className="combo-popup">
            {!items.all.length && <p className="muted small combo-empty">{t.none}</p>}
            <ul id={listId} role="listbox" aria-label={t.label} hidden={!items.all.length}>
              {items.ours.length > 0 && (
                <li role="presentation">
                  <span className="combo-group" id={`${uid}-g1`} aria-hidden="true">
                    {t.ours}
                  </span>
                  <ul role="group" aria-labelledby={`${uid}-g1`}>
                    {items.ours.map(option)}
                  </ul>
                </li>
              )}
              {items.dir.length > 0 && (
                <li role="presentation">
                  <span className="combo-group" id={`${uid}-g2`} aria-hidden="true">
                    {t.shared}
                  </span>
                  <ul role="group" aria-labelledby={`${uid}-g2`}>
                    {items.dir.map(option)}
                  </ul>
                </li>
              )}
              {items.tail.map(option)}
            </ul>
          </div>
        )}
      </div>
      <p className="muted small" id={`${uid}-hint`}>
        {t.hint}
      </p>
      <input type="hidden" name="place" value={chosen?.kind === "place" ? chosen.id : ""} />
      <input type="hidden" name="sharedVenue" value={chosen?.kind === "shared" ? chosen.id : ""} />
      <input type="hidden" name="freeLocation" value={chosen ? "" : text.trim()} />
      <span className="sr-only" role="status" aria-live="polite">
        {open && text.trim() ? t.results.replace("{n}", String(items.all.length)) : ""}
      </span>
    </div>
  );
}
