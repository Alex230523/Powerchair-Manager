import type { CSSProperties } from "react";

/**
 * The only way a component passes a value to its styles (wave 15, 2.8): CSS
 * custom properties ("--top": "528px"), read by the stylesheet. No inline
 * colour, width or position: tests/wave15-finance.test.ts checks it.
 */
export function cssVars(values: Record<string, string | number>): CSSProperties {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`--${k}`, String(v)])) as CSSProperties;
}
