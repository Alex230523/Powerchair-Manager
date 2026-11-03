"use client";
import { useId, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { Tag } from "@/domains/exercises/service";
import { exercisesCopy } from "./exercises-copy";
import { cssVars } from "./css-vars";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** A tag as a small chip with its colour dot (the name carries the meaning, the colour only helps). */
export function TagChip({ tag, onRemove, removeLabel }: { tag: Pick<Tag, "name" | "color">; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className="tag-chip" style={cssVars({ tag: `var(--chart-${tag.color.slice(1)})` })}>
      <span className="tag-dot" aria-hidden="true" />
      {tag.name}
      {onRemove && (
        <button type="button" className="tag-remove" aria-label={removeLabel} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}

/**
 * 4: tags with suggestions. One types, picks one or more of the club's tags;
 * when nothing matches, « Créer le tag « ‹texte› » » is offered. The chosen
 * names go in a hidden field « tags » (JSON).
 */
export function TagPicker({ locale, tags, initial }: { locale: Locale; tags: Tag[]; initial: string[] }) {
  const t = exercisesCopy[locale].x4;
  const id = useId();
  const [chosen, setChosen] = useState<string[]>(initial),
    [text, setText] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const typed = text.trim().slice(0, 30);
  const has = (name: string) => chosen.some((c) => c.toLowerCase() === name.toLowerCase());
  const matches = tags.filter((g) => !has(g.name) && (!typed || fold(g.name).includes(fold(typed)))).slice(0, 8);
  const exact = tags.some((g) => g.name.toLowerCase() === typed.toLowerCase()) || has(typed);
  const options = [...matches.map((g) => ({ key: g.id, name: g.name, label: g.name, create: false })), ...(typed && !exact ? [{ key: "new", name: typed, label: t.createTag(typed), create: true }] : [])];
  const full = chosen.length >= 10;
  function pick(name: string) {
    if (!name || has(name) || full) return;
    setChosen((c) => [...c, name]);
    setText("");
    setActive(0);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      // Enter picks the suggestion, never submits the sheet.
      e.preventDefault();
      const o = options[active];
      if (open && o) pick(o.name);
    } else if (e.key === "Escape") setOpen(false);
    else if (e.key === "Backspace" && !text && chosen.length) setChosen((c) => c.slice(0, -1));
  }
  const color = (name: string) => tags.find((g) => g.name.toLowerCase() === name.toLowerCase())?.color ?? "c8";
  return (
    <div className="tag-picker">
      <input type="hidden" name="tags" value={JSON.stringify(chosen)} />
      <label htmlFor={`${id}-input`}>{t.tags}</label>
      {chosen.length > 0 && (
        <ul className="tag-list" aria-label={t.tags}>
          {chosen.map((name) => (
            <li key={name}>
              <TagChip tag={{ name, color: color(name) }} removeLabel={t.removeTag(name)} onRemove={() => setChosen((c) => c.filter((x) => x !== name))} />
            </li>
          ))}
        </ul>
      )}
      <input
        id={`${id}-input`}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-o${active}` : undefined}
        aria-describedby={`${id}-hint`}
        placeholder={t.tagSearch}
        value={text}
        maxLength={30}
        disabled={full}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      <p id={`${id}-hint`} className="muted small">
        {t.tagHint}
      </p>
      <ul id={`${id}-list`} role="listbox" aria-label={t.tags} className="tag-options" hidden={!open || !options.length}>
        {options.map((o, i) => (
          <li
            key={o.key}
            id={`${id}-o${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? "tag-option is-active" : "tag-option"}
            onMouseDown={(e) => {
              // Keeps the focus in the field while choosing.
              e.preventDefault();
              pick(o.name);
            }}
          >
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
