"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";
import { departureStatuses, type DepartureStatus } from "@/domains/people/schema";
import { PlayerProfile } from "./player-profile";
import { CoachProfile } from "./coach-profile";
import { Modal } from "./modal";
import { Button } from "./ui";
import { Icon } from "./icons";
import { fillIn, sheetCopy } from "./player-sheet-copy";

/**
 * Wave 17 (J1): the person's single sheet in a window, from the directory.
 * « Agrandir » opens the same sheet as a full page at /players/[id] (a link
 * one can share); « Fermer » or Escape closes it.
 */
export function SheetDialog({
  locale,
  id,
  name,
  role,
  close,
  onChanged,
}: {
  locale: Locale;
  id: string;
  name: string;
  role: "player" | "coach";
  close: () => void;
  onChanged?: () => void;
}) {
  const t = sheetCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const href = `/${locale}/${role === "player" ? "players" : "coaches"}/${id}`;
  return (
    <dialog ref={ref} className="player-dialog sheet-dialog" aria-labelledby="sheet-title" onCancel={close}>
      <div className="dialog-heading sheet-heading">
        <h2 id="sheet-title">{name}</h2>
        <div className="sheet-tools">
          <button
            type="button"
            className="button secondary sm"
            aria-label={fillIn(t.expandOf, { name })}
            onClick={() => {
              ref.current?.close();
              router.push(href);
            }}
          >
            <Icon name="arrow" size={16} />
            {t.expand}
          </button>
          <button type="button" className="button secondary sm" onClick={close}>
            <Icon name="close" size={16} />
            {t.close}
          </button>
        </div>
      </div>
      {role === "player" ? <PlayerProfile locale={locale} id={id} embedded onChanged={onChanged} /> : <CoachProfile locale={locale} id={id} embedded />}
    </dialog>
  );
}

type Person = { id: string; full_name: string; departure_status: DepartureStatus | null; departure_note?: string };

/**
 * Why someone leaves: stopped playing, moved away, unknown, or deceased. «
 * Décédé » is the president's only, after ticking a confirmation; it then
 * archives the sheet « In memoriam » and stops every message.
 */
export function DepartureDialog({
  locale,
  person,
  mode,
  president,
  busy,
  save,
  close,
}: {
  locale: Locale;
  person: Person;
  mode: "leave" | "edit";
  president: boolean;
  busy: boolean;
  save: (v: { status: DepartureStatus; note: string; confirm: boolean }) => void;
  close: () => void;
}) {
  const t = sheetCopy[locale];
  const wasDeceased = person.departure_status === "deceased";
  const [status, setStatus] = useState<DepartureStatus>(person.departure_status ?? "unknown");
  const [confirm, setConfirm] = useState(false);
  const touchesDeceased = status === "deceased" || wasDeceased;
  const locked = wasDeceased && !president;
  return (
    <Modal title={fillIn(mode === "leave" ? t.departureTitle : t.editSituationOf, { name: person.full_name })} close={close}>
      <form
        className="stack-form departure-form"
        onSubmit={(e) => {
          e.preventDefault();
          save({ status, note: String(new FormData(e.currentTarget).get("note") ?? "").trim(), confirm });
        }}
      >
        <fieldset disabled={locked}>
          <legend>{fillIn(t.departureFor, { name: person.full_name })}</legend>
          {departureStatuses.map((s) => (
            <label key={s} className="check">
              <input
                type="radio"
                name="reason"
                value={s}
                checked={status === s}
                disabled={s === "deceased" && !president}
                onChange={() => {
                  setStatus(s);
                  setConfirm(false);
                }}
              />
              {t.statuses[s]}
            </label>
          ))}
          {!president && <p className="muted small">{t.presidentOnly}</p>}
        </fieldset>
        {status === "deceased" && <p className="notice">{t.deceasedHint}</p>}
        {touchesDeceased && president && (
          <label className="check">
            <input type="checkbox" checked={confirm} required onChange={(e) => setConfirm(e.target.checked)} />
            {fillIn(status === "deceased" ? t.confirmDeceased : t.liftDeceased, { name: person.full_name })}
          </label>
        )}
        <label htmlFor="departure-note">
          {t.note}
          <textarea id="departure-note" name="note" maxLength={500} defaultValue={person.departure_note ?? ""} aria-describedby="departure-note-hint" disabled={locked} />
        </label>
        <p id="departure-note-hint" className="muted small">
          {t.noteHint}
        </p>
        <div className="actions">
          <Button disabled={busy || locked || (touchesDeceased && !confirm)} variant={status === "deceased" ? "danger" : "primary"}>
            {t.saveDeparture}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
