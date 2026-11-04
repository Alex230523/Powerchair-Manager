"use client";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Locale } from "@/lib/locale";
import { clamp, emptyDrawing, lineKinds, moveBy, newId, nextNumber, pitch, scale, type Drawing, type DrawingObject, type ObjectKind, type Situation } from "@/domains/exercises/drawing";
import { imagePdf } from "@/lib/image-pdf";
import { describeObject, describeSituation, fieldCopy } from "./field-copy";
import { Button, Tabs } from "./ui";

/**
 * 4: the pitch editor (SVG, no library). One tool for exercises, tactics and
 * the layout of the equipment: players of two teams (numbered, coloured and
 * lettered A or B, never colour alone), goalkeepers, ball, cones, markers,
 * chairs, zones, text, and movement or pass arrows; several situations;
 * mouse, finger and keyboard; every drag has a tap or keyboard alternative
 * (WCAG 2.5.7) and the drawing is described in words.
 */
const S = scale;
const margin = 1;
const view = (half: boolean) => `${-margin * S} ${-margin * S} ${((half ? pitch.length / 2 : pitch.length) + 2 * margin) * S} ${(pitch.width + 2 * margin) * S}`;

/** The pitch lines: a basketball court, its goals and goal areas. */
function PitchLines() {
  const L = pitch.length * S,
    W = pitch.width * S,
    gy = (pitch.width / 2) * S;
  const areaY = gy - (pitch.goalAreaWidth / 2) * S,
    areaH = pitch.goalAreaWidth * S,
    areaW = pitch.goalAreaDepth * S;
  const goal = (pitch.goalWidth / 2) * S;
  return (
    <g aria-hidden="true">
      <rect className="pitch-surface" x={0} y={0} width={L} height={W} />
      <rect className="pitch-line" x={0} y={0} width={L} height={W} />
      <line className="pitch-line" x1={L / 2} y1={0} x2={L / 2} y2={W} />
      <circle className="pitch-line" cx={L / 2} cy={gy} r={pitch.centreRadius * S} />
      <rect className="pitch-line" x={0} y={areaY} width={areaW} height={areaH} />
      <rect className="pitch-line" x={L - areaW} y={areaY} width={areaW} height={areaH} />
      <line className="pitch-goal" x1={0} y1={gy - goal} x2={0} y2={gy + goal} />
      <line className="pitch-goal" x1={L} y1={gy - goal} x2={L} y2={gy + goal} />
    </g>
  );
}

/** One object, drawn; the caller adds the focus and the handlers. */
function Shape({ o, marker }: { o: DrawingObject; marker: string }) {
  const x = o.x * S,
    y = o.y * S;
  const team = o.team === "B" ? "pitch-team-b" : "pitch-team-a";
  switch (o.kind) {
    case "player":
      return (
        <>
          <circle className={`pitch-player ${team}`} cx={x} cy={y} r={14} />
          <text className="pitch-player-label" x={x} y={y} textAnchor="middle" dominantBaseline="central">
            {`${o.team ?? "A"}${o.n ?? ""}`}
          </text>
        </>
      );
    case "keeper":
      return (
        <>
          <rect className={`pitch-player pitch-keeper ${team}`} x={x - 14} y={y - 14} width={28} height={28} rx={6} />
          <text className="pitch-player-label" x={x} y={y} textAnchor="middle" dominantBaseline="central">
            {`${o.team ?? "A"}${o.n ?? ""}`}
          </text>
        </>
      );
    case "ball":
      return <circle className="pitch-ball" cx={x} cy={y} r={7} />;
    case "cone":
      return <polygon className="pitch-cone" points={`${x},${y - 10} ${x - 9},${y + 8} ${x + 9},${y + 8}`} />;
    case "plot":
      return <ellipse className="pitch-plot" cx={x} cy={y} rx={9} ry={5} />;
    case "chair":
      return (
        <>
          <rect className="pitch-chair" x={x - 12} y={y - 10} width={24} height={20} rx={4} />
          <circle className="pitch-chair" cx={x} cy={y} r={5} />
        </>
      );
    case "zone":
      return <rect className="pitch-zone" x={x} y={y} width={(o.w ?? 4) * S} height={(o.h ?? 3) * S} />;
    case "area":
      return <polygon className="pitch-zone" points={(o.points ?? []).map(([px, py]) => `${px * S},${py * S}`).join(" ")} />;
    case "text":
      return (
        <text className="pitch-text" x={x} y={y} textAnchor="middle" dominantBaseline="central">
          {o.label ?? ""}
        </text>
      );
    default:
      return <line className={o.kind === "pass" ? "pitch-arrow pitch-pass" : "pitch-arrow"} x1={x} y1={y} x2={(o.x2 ?? o.x) * S} y2={(o.y2 ?? o.y) * S} markerEnd={`url(#${marker})`} />;
  }
}
/** Where an object can be grabbed and where its focus ring goes. */
function Hit({ o }: { o: DrawingObject }) {
  if (o.kind === "zone") return <rect className="pitch-hit" x={o.x * S} y={o.y * S} width={(o.w ?? 4) * S} height={(o.h ?? 3) * S} />;
  if (o.kind === "area") return <polygon className="pitch-hit" points={(o.points ?? []).map(([px, py]) => `${px * S},${py * S}`).join(" ")} />;
  if (lineKinds.includes(o.kind)) return <line className="pitch-hit pitch-hit-line" x1={o.x * S} y1={o.y * S} x2={(o.x2 ?? o.x) * S} y2={(o.y2 ?? o.y) * S} />;
  return <circle className="pitch-hit" cx={o.x * S} cy={o.y * S} r={20} />;
}
function Defs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path className="pitch-arrowhead" d="M 0 0 L 10 5 L 0 10 z" />
      </marker>
    </defs>
  );
}
/** Lines first, so players stay on top of their arrows. */
const layered = (items: DrawingObject[]) => [...items.filter((o) => o.kind === "zone" || o.kind === "area"), ...items.filter((o) => lineKinds.includes(o.kind)), ...items.filter((o) => !["zone", "area", "move", "pass"].includes(o.kind))];

/* ------------------------------------------------------------- Export */
const styled = ["fill", "stroke", "stroke-width", "stroke-dasharray", "fill-opacity", "font-size", "font-family", "font-weight"];
/** Draws the SVG on a canvas, its computed colours written in, for PNG and PDF. */
async function rasterize(svg: SVGSVGElement, type: "image/png" | "image/jpeg") {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")],
    to = [clone, ...clone.querySelectorAll("*")];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    for (const k of styled) {
      const v = cs.getPropertyValue(k);
      if (v) to[i].setAttribute(k, v);
    }
  });
  clone.querySelectorAll(".pitch-hit").forEach((n) => n.remove());
  const [, , vw, vh] = (svg.getAttribute("viewBox") ?? "0 0 600 340").split(" ").map(Number);
  const width = Math.round(vw * 2),
    height = Math.round(vh * 2);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("EXPORT"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("EXPORT"))), type, 0.92));
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "terrain";

/* ------------------------------------------------------------- The view (sheet, print, match) */
/** The drawing, read only: every situation, its description, and the exports. */
export function FieldView({ locale, drawing, title, exportLabels }: { locale: Locale; drawing: Drawing; title: string; exportLabels?: { png: string; pdf: string } }) {
  const t = fieldCopy[locale];
  const base = `p${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const refs = useRef<(SVGSVGElement | null)[]>([]);
  async function exportAs(i: number, kind: "png" | "pdf") {
    const svg = refs.current[i];
    if (!svg) return;
    const name = `${fileName(title)}-${i + 1}`;
    if (kind === "png") download((await rasterize(svg, "image/png")).blob, `${name}.png`);
    else {
      const r = await rasterize(svg, "image/jpeg");
      const pdf = imagePdf(new Uint8Array(await r.blob.arrayBuffer()), r.width, r.height, `${title} · ${drawing.situations[i].name || t.situation(i + 1)}`);
      download(new Blob([pdf.slice().buffer], { type: "application/pdf" }), `${name}.pdf`);
    }
  }
  return (
    <div className="pitch-view">
      {drawing.situations.map((s, i) => (
        <figure key={i} className="pitch-figure">
          <figcaption>{s.name || t.situation(i + 1)}</figcaption>
          <svg
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="pitch-svg"
            viewBox={view(s.half)}
            role="img"
            aria-labelledby={`${base}-d${i}`}
          >
            <Defs id={`${base}-m${i}`} />
            <PitchLines />
            {layered(s.items).map((o) => (
              <g key={o.id}>
                <Shape o={o} marker={`${base}-m${i}`} />
              </g>
            ))}
          </svg>
          <details className="pitch-description">
            <summary>{t.description}</summary>
            <p id={`${base}-d${i}`}>{describeSituation(locale, s, i)}</p>
          </details>
          {exportLabels && (
            <span className="exercise-actions no-print">
              <Button type="button" size="sm" variant="secondary" onClick={() => void exportAs(i, "png")}>
                {exportLabels.png}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => void exportAs(i, "pdf")}>
                {exportLabels.pdf}
              </Button>
            </span>
          )}
        </figure>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- The editor */
type Tool = "select" | "playerA" | "playerB" | "keeperA" | "keeperB" | "ball" | "cone" | "plot" | "chair" | "zone" | "area" | "text" | "move" | "pass";
const tools: Tool[] = ["select", "playerA", "playerB", "keeperA", "keeperB", "ball", "cone", "plot", "chair", "zone", "area", "text", "move", "pass"];
type Drag = { id: string; from: { x: number; y: number }; base: Drawing; moved: boolean };

/** The editor; onChange receives every committed drawing. */
export function FieldEditor({ locale, initial, onChange }: { locale: Locale; initial: Drawing | null; onChange: (d: Drawing) => void }) {
  const t = fieldCopy[locale];
  const base = `p${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawing, setDrawing] = useState<Drawing>(initial ?? emptyDrawing()),
    [index, setIndex] = useState(0),
    [tool, setTool] = useState<Tool>("select"),
    [selected, setSelected] = useState<string | null>(null),
    [start, setStart] = useState<{ x: number; y: number } | null>(null),
    [points, setPoints] = useState<[number, number][]>([]),
    [past, setPast] = useState<Drawing[]>([]),
    [future, setFuture] = useState<Drawing[]>([]),
    [drag, setDrag] = useState<Drag | null>(null),
    [seed, setSeed] = useState(1);
  const s = drawing.situations[Math.min(index, drawing.situations.length - 1)];
  const half = s.half;
  const current = s.items.find((o) => o.id === selected) ?? null;

  function commit(next: Drawing, from: Drawing = drawing) {
    setPast((p) => [...p, from].slice(-50));
    setFuture([]);
    setDrawing(next);
    onChange(next);
  }
  const withSituation = (d: Drawing, fn: (x: Situation) => Situation): Drawing => ({ ...d, situations: d.situations.map((x, i) => (i === index ? fn(x) : x)) });
  const setItems = (fn: (items: DrawingObject[]) => DrawingObject[]) => commit(withSituation(drawing, (x) => ({ ...x, items: fn(x.items) })));
  const update = (id: string, patch: Partial<DrawingObject>) => setItems((items) => items.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  function undo() {
    const prev = past.at(-1);
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [drawing, ...f]);
    setDrawing(prev);
    setIndex((i) => Math.min(i, prev.situations.length - 1));
    onChange(prev);
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, drawing]);
    setDrawing(next);
    setIndex((i) => Math.min(i, next.situations.length - 1));
    onChange(next);
  }
  function metres(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current,
      m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return clamp(p.x / S, p.y / S, half);
  }
  function place(at: { x: number; y: number }) {
    const id = newId(s.items, seed);
    setSeed((n) => n + 1);
    let o: DrawingObject | null = null;
    if (tool === "playerA" || tool === "playerB" || tool === "keeperA" || tool === "keeperB") {
      const team = tool.endsWith("A") ? "A" : "B";
      o = { id, kind: tool.startsWith("player") ? "player" : "keeper", team, n: nextNumber(s.items, team), ...at };
    } else if (tool === "ball" || tool === "cone" || tool === "plot" || tool === "chair") o = { id, kind: tool as ObjectKind, ...at };
    else if (tool === "zone") o = { id, kind: "zone", ...clamp(at.x - 2, at.y - 1.5, half), w: 4, h: 3 };
    else if (tool === "text") o = { id, kind: "text", ...at, label: t.tool.text };
    else if (tool === "move" || tool === "pass") {
      if (!start) {
        setStart(at);
        return;
      }
      o = { id, kind: tool, ...start, x2: at.x, y2: at.y };
      setStart(null);
    } else if (tool === "area") {
      setPoints((p) => [...p, [at.x, at.y]].slice(0, 20) as [number, number][]);
      return;
    }
    if (o) {
      const obj = o;
      setItems((items) => [...items, obj]);
      setSelected(obj.id);
    }
  }
  function finishArea() {
    if (points.length < 3) return;
    const id = newId(s.items, seed);
    setSeed((n) => n + 1);
    setItems((items) => [...items, { id, kind: "area", x: points[0][0], y: points[0][1], points }]);
    setPoints([]);
    setSelected(id);
  }
  function onBackground(e: ReactPointerEvent<SVGElement>) {
    const at = metres(e);
    if (!at) return;
    if (tool === "select") setSelected(null);
    else place(at);
  }
  function onObjectDown(e: ReactPointerEvent<SVGGElement>, o: DrawingObject) {
    e.stopPropagation();
    if (tool !== "select") {
      // Placing on an object: an arrow starts or ends on a player.
      const at = metres(e);
      if (at) place(at);
      return;
    }
    setSelected(o.id);
    const at = metres(e);
    if (!at) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: o.id, from: at, base: drawing, moved: false });
  }
  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const at = metres(e);
    if (!at) return;
    const dx = at.x - drag.from.x,
      dy = at.y - drag.from.y;
    if (!drag.moved && Math.hypot(dx, dy) < 0.2) return;
    const baseItem = drag.base.situations[index].items.find((o) => o.id === drag.id);
    if (!baseItem) return;
    setDrag({ ...drag, moved: true });
    setDrawing(withSituation(drag.base, (x) => ({ ...x, items: x.items.map((o) => (o.id === drag.id ? moveBy(baseItem, dx, dy, half) : o)) })));
  }
  function onUp() {
    if (drag?.moved) commit(drawing, drag.base);
    setDrag(null);
  }
  function onObjectKey(e: KeyboardEvent<SVGGElement>, o: DrawingObject) {
    const step = e.shiftKey ? 2 : 0.5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setItems((items) => items.map((x) => (x.id === o.id ? moveBy(x, moves[e.key][0], moves[e.key][1], half) : x)));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setItems((items) => items.filter((x) => x.id !== o.id));
      setSelected(null);
    }
  }
  function onEditorKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest("input,textarea,select")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }
  const nudge = (dx: number, dy: number) => current && setItems((items) => items.map((x) => (x.id === current.id ? moveBy(x, dx, dy, half) : x)));
  const num = (v: string, max: number, min = 0) => Math.min(max, Math.max(min, Math.round(Number(v) * 10) / 10 || 0));
  const marker = `${base}-arrow`;
  const descId = `${base}-desc`;
  return (
    <div className="pitch-editor" onKeyDown={onEditorKey}>
      <Tabs
        label={t.situations}
        items={drawing.situations.map((x, i) => ({ id: String(i), label: x.name || t.situation(i + 1) }))}
        value={String(index)}
        idPrefix={`${base}-tab`}
        panelId={`${base}-panel`}
        onChange={(v) => {
          setIndex(Number(v));
          setSelected(null);
          setStart(null);
          setPoints([]);
        }}
      />
      <div className="pitch-situation-actions">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={drawing.situations.length >= 8}
          onClick={() => {
            commit({ ...drawing, situations: [...drawing.situations, { name: "", half: false, items: [] }] });
            setIndex(drawing.situations.length);
            setSelected(null);
          }}
        >
          {t.addSituation}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={drawing.situations.length >= 8}
          onClick={() => {
            commit({ ...drawing, situations: [...drawing.situations.slice(0, index + 1), { ...s, name: s.name ? `${s.name} (2)`.slice(0, 40) : "" }, ...drawing.situations.slice(index + 1)] });
            setIndex(index + 1);
            setSelected(null);
          }}
        >
          {t.duplicateSituation}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={drawing.situations.length <= 1}
          onClick={() => {
            commit({ ...drawing, situations: drawing.situations.filter((_, i) => i !== index) });
            setIndex(Math.max(0, index - 1));
            setSelected(null);
          }}
        >
          {t.removeSituation}
        </Button>
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${index}`} className="pitch-panel">
        <div className="form-pair">
          <label>
            {t.situationName}
            <input value={s.name} maxLength={40} onChange={(e) => commit(withSituation(drawing, (x) => ({ ...x, name: e.target.value })))} />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={half}
              onChange={(e) =>
                commit(
                  withSituation(drawing, (x) => ({
                    ...x,
                    half: e.target.checked,
                    items: e.target.checked ? x.items.map((o) => moveBy(o, 0, 0, true)) : x.items,
                  })),
                )
              }
            />
            {t.half}
          </label>
        </div>
        <fieldset className="pitch-tools">
          <legend>{t.tools}</legend>
          {tools.map((k) => (
            <button
              key={k}
              type="button"
              className={tool === k ? "pitch-tool is-active" : "pitch-tool"}
              aria-pressed={tool === k}
              onClick={() => {
                setTool(k);
                setStart(null);
                setPoints([]);
              }}
            >
              {t.tool[k]}
            </button>
          ))}
        </fieldset>
        <p className="muted small">{t.howTo}</p>
        {start && (
          <p role="status" className="small">
            {t.arrowStart}
          </p>
        )}
        {tool === "area" && (
          <p className="pitch-area-status">
            <span role="status" className="small">
              {t.areaPoints(points.length)}
            </span>
            <Button type="button" size="sm" variant="secondary" disabled={points.length < 3} onClick={finishArea}>
              {t.finishArea}
            </Button>
          </p>
        )}
        <div className="pitch-history">
          <Button type="button" size="sm" variant="secondary" disabled={!past.length} onClick={undo}>
            {t.undo}
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={!future.length} onClick={redo}>
            {t.redo}
          </Button>
        </div>
        <svg
          ref={svgRef}
          className={tool === "select" ? "pitch-svg pitch-svg-edit" : "pitch-svg pitch-svg-edit is-placing"}
          viewBox={view(half)}
          role="group"
          aria-label={t.editor}
          aria-describedby={descId}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <Defs id={marker} />
          <g onPointerDown={onBackground}>
            <rect className="pitch-margin" x={-margin * S} y={-margin * S} width={(pitch.length + 2 * margin) * S} height={(pitch.width + 2 * margin) * S} />
            <PitchLines />
          </g>
          {points.map(([px, py], i) => (
            <circle key={i} className="pitch-point" cx={px * S} cy={py * S} r={5} />
          ))}
          {start && <circle className="pitch-point" cx={start.x * S} cy={start.y * S} r={6} />}
          {layered(s.items).map((o) => (
            <g
              key={o.id}
              tabIndex={0}
              role="button"
              aria-label={describeObject(locale, o, s.items)}
              aria-pressed={selected === o.id}
              className={selected === o.id ? "pitch-object is-selected" : "pitch-object"}
              onPointerDown={(e) => onObjectDown(e, o)}
              onFocus={() => setSelected(o.id)}
              onKeyDown={(e) => onObjectKey(e, o)}
            >
              <Hit o={o} />
              <Shape o={o} marker={marker} />
            </g>
          ))}
        </svg>
        <p id={descId} className="muted small pitch-live">
          {describeSituation(locale, s, index)}
        </p>
        <section className="pitch-selected" aria-label={t.selected}>
          {current ? (
            <>
              <strong>{describeObject(locale, current, s.items)}</strong>
              <div className="pitch-fields">
                <label>
                  {t.x}
                  <input type="number" step={0.1} min={0} max={half ? pitch.length / 2 : pitch.length} value={current.x} onChange={(e) => update(current.id, { x: num(e.target.value, half ? pitch.length / 2 : pitch.length) })} />
                </label>
                <label>
                  {t.y}
                  <input type="number" step={0.1} min={0} max={pitch.width} value={current.y} onChange={(e) => update(current.id, { y: num(e.target.value, pitch.width) })} />
                </label>
                {lineKinds.includes(current.kind) && (
                  <>
                    <label>
                      {t.x2}
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={half ? pitch.length / 2 : pitch.length}
                        value={current.x2 ?? current.x}
                        onChange={(e) => update(current.id, { x2: num(e.target.value, half ? pitch.length / 2 : pitch.length) })}
                      />
                    </label>
                    <label>
                      {t.y2}
                      <input type="number" step={0.1} min={0} max={pitch.width} value={current.y2 ?? current.y} onChange={(e) => update(current.id, { y2: num(e.target.value, pitch.width) })} />
                    </label>
                  </>
                )}
                {current.kind === "zone" && (
                  <>
                    <label>
                      {t.w}
                      <input type="number" step={0.5} min={0.5} max={pitch.length} value={current.w ?? 4} onChange={(e) => update(current.id, { w: num(e.target.value, pitch.length, 0.5) })} />
                    </label>
                    <label>
                      {t.h}
                      <input type="number" step={0.5} min={0.5} max={pitch.width} value={current.h ?? 3} onChange={(e) => update(current.id, { h: num(e.target.value, pitch.width, 0.5) })} />
                    </label>
                  </>
                )}
                {(current.kind === "player" || current.kind === "keeper") && (
                  <>
                    <label>
                      {t.team}
                      <select value={current.team ?? "A"} onChange={(e) => update(current.id, { team: e.target.value === "B" ? "B" : "A" })}>
                        <option value="A">A</option>
                        <option value="B">B</option>
                      </select>
                    </label>
                    <label>
                      {t.number}
                      <input type="number" min={0} max={99} value={current.n ?? ""} onChange={(e) => update(current.id, { n: Math.min(99, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
                    </label>
                  </>
                )}
                {!["player", "keeper"].includes(current.kind) && (
                  <label>
                    {t.label}
                    <input value={current.label ?? ""} maxLength={80} onChange={(e) => update(current.id, { label: e.target.value })} />
                  </label>
                )}
              </div>
              <div className="pitch-nudge">
                <Button type="button" size="sm" variant="secondary" icon="back" aria-label={t.nudge.left} onClick={() => nudge(-0.5, 0)} />
                <Button type="button" size="sm" variant="secondary" icon="arrowUp" aria-label={t.nudge.up} onClick={() => nudge(0, -0.5)} />
                <Button type="button" size="sm" variant="secondary" icon="arrowDown" aria-label={t.nudge.down} onClick={() => nudge(0, 0.5)} />
                <Button type="button" size="sm" variant="secondary" icon="arrow" aria-label={t.nudge.right} onClick={() => nudge(0.5, 0)} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setItems((items) => items.filter((x) => x.id !== current.id));
                    setSelected(null);
                  }}
                >
                  {t.remove}
                </Button>
              </div>
            </>
          ) : (
            <p className="muted small">{t.nothingSelected}</p>
          )}
        </section>
      </div>
    </div>
  );
}
