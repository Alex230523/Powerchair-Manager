"use client";
import { statisticsCsv } from "@/domains/statistics/summary";

/**
 * Exports of a chart (wave 16, S1): its data as CSV (semicolons, UTF-8 with
 * BOM for spreadsheets, formulas neutralised) and its drawing as a PNG. The
 * drawings use CSS variables: the PNG copies each SVG with the colours the
 * page computed, so it keeps the theme the person sees.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  downloadBlob(new Blob([statisticsCsv(rows)], { type: "text/csv;charset=utf-8" }), filename);
}
/** A file name from a title: lower case, no accents, dashes. */
export function slug(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "graphique"
  );
}

const painted = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-family", "font-weight"] as const;
/** A copy of an SVG with the computed colours and fonts written on each element. */
function standalone(svg: SVGSVGElement) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const from = [svg, ...svg.querySelectorAll("*")],
    to = [copy, ...copy.querySelectorAll("*")];
  from.forEach((el, i) => {
    const style = getComputedStyle(el);
    for (const p of painted) {
      const v = style.getPropertyValue(p);
      if (v) (to[i] as Element).setAttribute(p, v);
    }
  });
  const rect = svg.getBoundingClientRect();
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(rect.width));
  copy.setAttribute("height", String(rect.height));
  return new XMLSerializer().serializeToString(copy);
}
function image(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draws the chart area as the person sees it: every SVG at its place, and the
 * texts marked data-export-text (names under the rings, the storage line),
 * under a heading with the title and the period.
 */
export async function exportPng(area: HTMLElement, title: string, subtitle: string, filename: string) {
  const box = area.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const head = 56;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.width * ratio);
  canvas.height = Math.ceil((box.height + head) * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  const card = getComputedStyle(area.closest(".card") ?? document.body);
  const page = getComputedStyle(document.body);
  ctx.fillStyle = card.backgroundColor && card.backgroundColor !== "rgba(0, 0, 0, 0)" ? card.backgroundColor : page.backgroundColor;
  ctx.fillRect(0, 0, box.width, box.height + head);
  ctx.fillStyle = page.color;
  ctx.font = `600 16px ${page.fontFamily}`;
  ctx.fillText(title, 12, 24);
  ctx.font = `13px ${page.fontFamily}`;
  ctx.fillText(subtitle, 12, 44);
  for (const svg of area.querySelectorAll<SVGSVGElement>("svg")) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const img = await image("data:image/svg+xml;charset=utf-8," + encodeURIComponent(standalone(svg)));
    ctx.drawImage(img, r.left - box.left, r.top - box.top + head, r.width, r.height);
  }
  for (const el of area.querySelectorAll<HTMLElement>("[data-export-text]")) {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    ctx.fillStyle = s.color;
    ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    ctx.textBaseline = "top";
    const text = el.textContent ?? "",
      width = ctx.measureText(text).width;
    const x = s.textAlign === "center" ? r.left + (r.width - width) / 2 : s.textAlign === "right" || s.textAlign === "end" ? r.right - width : r.left;
    ctx.fillText(text, Math.max(x - box.left, 0), r.top - box.top + head, Math.max(box.right - r.left, 10));
    ctx.textBaseline = "alphabetic";
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) downloadBlob(blob, filename);
}
