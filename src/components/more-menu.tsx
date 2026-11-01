"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons";

/** « … »: a few more actions in a small panel; Escape or a click outside closes it. */
export function MoreMenu({ label, items, className = "" }: { label: string; items: { label: string; run: () => void; hidden?: boolean }[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const outside = (e: PointerEvent) => {
      if (panel.current?.contains(e.target as Node) || button.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const shown = items.filter((i) => !i.hidden);
  if (!shown.length) return null;
  return (
    <div className={`more-menu ${className}`.trim()}>
      <button
        ref={button}
        type="button"
        className="icon-button sm"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="ellipsis" size={16} />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className="more-menu-panel"
          role="group"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            }
          }}
        >
          {shown.map((i) => (
            <button
              key={i.label}
              type="button"
              className="button ghost sm"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                i.run();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
