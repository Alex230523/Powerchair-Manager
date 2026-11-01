"use client";
import { useId, useState, type ReactNode } from "react";
import { Badge } from "./ui";

/** A small grey tip shown on hover or keyboard focus, closed with Escape (WCAG 1.4.13). */
export function Tip({ label, tone, children }: { label: ReactNode; tone: string; children: ReactNode }) {
  const id = useId();
  const [hidden, setHidden] = useState(false);
  return (
    <span className="tip" data-hidden={hidden || undefined} onMouseLeave={() => setHidden(false)} onBlur={() => setHidden(false)}>
      <button type="button" className="tip-trigger" aria-describedby={id} onKeyDown={(e) => e.key === "Escape" && setHidden(true)}>
        <Badge tone={tone}>{label}</Badge>
      </button>
      <span role="tooltip" id={id} className="tip-body">
        {children}
      </span>
    </span>
  );
}
