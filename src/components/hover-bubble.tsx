"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cssVars } from "./css-vars";

/**
 * 04/11/2026 (points 2 and 18): a small grey bubble opened on hover or keyboard
 * focus. It is placed against the window, so a table that scrolls no longer
 * cuts it; Escape, leaving or scrolling closes it (WCAG 1.4.13). On a touch
 * screen, where nothing hovers, the same content shows under the trigger.
 */
export function HoverBubble({ trigger, title, children, className = "" }: { trigger: (describedBy: string) => ReactNode; title: string; children: ReactNode; className?: string }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 296)), y: r.bottom + 6 });
  };
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", key);
    };
  }, [at]);
  return (
    <div ref={ref} className={`hover-bubble ${className}`.trim()} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}>
      {trigger(id)}
      <div id={id} role="tooltip" className="hover-bubble-panel" data-open={at ? "true" : undefined} style={at ? cssVars({ "bubble-x": `${at.x}px`, "bubble-y": `${at.y}px` }) : undefined}>
        <p className="hover-bubble-title">{title}</p>
        {children}
      </div>
    </div>
  );
}
