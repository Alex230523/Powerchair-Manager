"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Native modal dialog: focus trap, Escape and backdrop come from the browser. */
export function Modal({
  title,
  close,
  children,
  className = "player-dialog",
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={className} aria-label={title} onCancel={close}>
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="button secondary"
          onClick={close}
          aria-label="Fermer / Sluiten / Close"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
