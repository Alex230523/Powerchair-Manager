"use client";
import { useId, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { Figure } from "@/domains/guide/schema";
import { guideCopy } from "./guide-copy";

/**
 * The guide's figures, drawn (never pictures of text): the court with its
 * measures, the two-on-one, three in the goal area, the chair from the side
 * and from above. Each has a title and a description for screen readers,
 * repeated as a caption. Colours come from the theme (globals.css).
 */
export function GuideFigure({ locale, figure }: { locale: Locale; figure: Figure }) {
  const t = guideCopy[locale];
  const id = useId();
  const f = t.figures[figure];
  const l = t.labels;
  const svg = (box: string, children: ReactNode) => (
    <svg viewBox={box} role="img" aria-labelledby={`${id}-t ${id}-d`} className="guide-svg" focusable="false">
      <title id={`${id}-t`}>{f.title}</title>
      <desc id={`${id}-d`}>{f.desc}</desc>
      {children}
    </svg>
  );
  return (
    <figure className="guide-figure" data-figure={figure}>
      {figure === "pitch" && <Pitch svg={svg} l={l} />}
      {figure === "two-v-one" &&
        svg(
          "0 0 220 150",
          <>
            <rect className="gf-court" x="5" y="5" width="210" height="140" rx="6" />
            <circle className="gf-zone" cx="110" cy="75" r="48" />
            <line className="gf-dim" x1="110" y1="75" x2="158" y2="75" />
            <text className="gf-text" x="134" y="70" textAnchor="middle">
              3 m
            </text>
            <circle className="gf-ball" cx="110" cy="75" r="6" />
            <circle className="gf-us" cx="86" cy="50" r="10" />
            <circle className="gf-us" cx="96" cy="108" r="10" />
            <circle className="gf-them" cx="132" cy="96" r="10" />
            <text className="gf-text" x="20" y="22">
              {l.us}
            </text>
            <text className="gf-text gf-text-them" x="200" y="22" textAnchor="end">
              {l.them}
            </text>
            <text className="gf-text gf-text-foul" x="110" y="140" textAnchor="middle">
              {l.foul}
            </text>
          </>,
        )}
      {figure === "three-in-area" &&
        svg(
          "0 0 220 150",
          <>
            <rect className="gf-court" x="5" y="5" width="210" height="140" rx="6" />
            <line className="gf-line" x1="200" y1="5" x2="200" y2="145" />
            <rect className="gf-area" x="5" y="35" width="55" height="80" />
            <line className="gf-post" x1="5" y1="50" x2="5" y2="100" />
            <circle className="gf-us" cx="22" cy="60" r="9" />
            <circle className="gf-us" cx="40" cy="80" r="9" />
            <circle className="gf-us" cx="24" cy="100" r="9" />
            <circle className="gf-them" cx="120" cy="70" r="9" />
            <circle className="gf-ball" cx="104" cy="74" r="6" />
            <text className="gf-text" x="64" y="30">
              {l.goalArea}
            </text>
            <text className="gf-text gf-text-foul" x="110" y="138" textAnchor="middle">
              {l.foul}
            </text>
          </>,
        )}
      {figure === "chair-profile" &&
        svg(
          "0 0 260 170",
          <>
            <line className="gf-line" x1="10" y1="150" x2="250" y2="150" />
            <rect className="gf-chair" x="66" y="104" width="124" height="16" rx="3" />
            <rect className="gf-chair" x="88" y="70" width="70" height="14" rx="3" />
            <rect className="gf-chair" x="76" y="22" width="14" height="62" rx="3" />
            <circle className="gf-wheel" cx="98" cy="126" r="24" />
            <circle className="gf-wheel" cx="176" cy="140" r="10" />
            <rect className="gf-guard" x="192" y="104" width="12" height="38" />
            <rect className="gf-guard" x="52" y="104" width="10" height="38" />
            <line className="gf-belt" x1="96" y1="66" x2="150" y2="66" />
            <rect className="gf-number" x="60" y="34" width="14" height="18" />
            <line className="gf-dim" x1="216" y1="150" x2="216" y2="104" />
            <line className="gf-dim" x1="236" y1="150" x2="236" y2="142" />
            <text className="gf-text" x="212" y="96" textAnchor="end">
              {l.guard}
            </text>
            <text className="gf-text" x="220" y="128">
              {l.height}
            </text>
            <text className="gf-text" x="250" y="166" textAnchor="end">
              {l.lowEdge}
            </text>
            <text className="gf-text" x="10" y="100">
              {l.rearGuard}
            </text>
            <text className="gf-text" x="100" y="60">
              {l.belt}
            </text>
            <text className="gf-text" x="10" y="30">
              {l.number}
            </text>
          </>,
        )}
      {figure === "chair-top" &&
        svg(
          "0 0 260 170",
          <>
            <rect className="gf-chair" x="60" y="45" width="112" height="80" rx="6" />
            <rect className="gf-wheel" x="74" y="30" width="44" height="14" rx="4" />
            <rect className="gf-wheel" x="74" y="126" width="44" height="14" rx="4" />
            <rect className="gf-wheel" x="150" y="48" width="18" height="10" rx="3" />
            <rect className="gf-wheel" x="150" y="112" width="18" height="10" rx="3" />
            <rect className="gf-guard" x="196" y="44" width="12" height="82" />
            <rect className="gf-guard" x="46" y="50" width="10" height="70" />
            <rect className="gf-number" x="176" y="76" width="14" height="18" />
            <line className="gf-dim" x1="168" y1="150" x2="208" y2="150" />
            <line className="gf-dim" x1="230" y1="30" x2="230" y2="140" />
            <text className="gf-text" x="188" y="164" textAnchor="middle">
              {l.reach}
            </text>
            <text className="gf-text" x="250" y="90" textAnchor="end">
              {l.width}
            </text>
            <text className="gf-text" x="202" y="36" textAnchor="middle">
              {l.guard}
            </text>
            <text className="gf-text" x="116" y="90" textAnchor="middle">
              {l.front} →
            </text>
          </>,
        )}
      {figure === "pyramid" &&
        svg(
          "0 0 300 190",
          <>
            <polygon className="gf-tier gf-tier-1" points="150,10 180,50 120,50" />
            <polygon className="gf-tier gf-tier-2" points="120,52 180,52 205,92 95,92" />
            <polygon className="gf-tier gf-tier-3" points="95,94 205,94 230,134 70,134" />
            <polygon className="gf-tier gf-tier-4" points="70,136 230,136 255,176 45,176" />
            <text className="gf-text" x="150" y="44" textAnchor="middle">
              FIPFA
            </text>
            <text className="gf-text" x="150" y="76" textAnchor="middle">
              {l.epfa}
            </text>
            <text className="gf-text" x="150" y="118" textAnchor="middle">
              {l.bpcf}
            </text>
            <text className="gf-text" x="150" y="160" textAnchor="middle">
              {l.clubs}
            </text>
            <text className="gf-text" x="150" y="188" textAnchor="middle">
              {l.beside}
            </text>
          </>,
        )}
      <figcaption>
        <strong>{f.title}.</strong> {f.desc}
      </figcaption>
    </figure>
  );
}

/** The court, 28 m × 15 m at 10 units a metre, with the goal areas, posts and penalty marks. */
function Pitch({ svg, l }: { svg: (box: string, children: ReactNode) => ReactNode; l: (typeof guideCopy)["fr"]["labels"] }) {
  return svg(
    "0 0 320 200",
    <>
      <rect className="gf-court" x="20" y="20" width="280" height="150" />
      <line className="gf-line" x1="160" y1="20" x2="160" y2="170" />
      <circle className="gf-line" cx="160" cy="95" r="20" />
      <rect className="gf-area" x="20" y="55" width="50" height="80" />
      <rect className="gf-area" x="250" y="55" width="50" height="80" />
      <line className="gf-post" x1="20" y1="65" x2="20" y2="125" />
      <line className="gf-post" x1="300" y1="65" x2="300" y2="125" />
      <circle className="gf-mark" cx="55" cy="95" r="2.5" />
      <circle className="gf-mark" cx="265" cy="95" r="2.5" />
      <line className="gf-dim" x1="20" y1="184" x2="300" y2="184" />
      <text className="gf-text" x="160" y="196" textAnchor="middle">
        {l.court}
      </text>
      <text className="gf-text" x="24" y="50">
        {l.goalArea}
      </text>
      <text className="gf-text" x="74" y="99">
        {l.penalty}
      </text>
      <text className="gf-text" x="296" y="146" textAnchor="end">
        {l.goal}
      </text>
    </>,
  );
}
