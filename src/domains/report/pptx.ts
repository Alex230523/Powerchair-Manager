import PptxGenJS from "pptxgenjs";
import type { Slide } from "./slides";

/**
 * The activity report as a PowerPoint file (wave 15, C11), to finish in Canva:
 * 16:9, one slide per section, real text boxes, native bar charts and grey
 * rounded photo frames. The colours are the night-blue palette of the design
 * tokens (globals.css) written as hex, since a file carries no CSS.
 */
const palette = {
  primary: "213C60",
  heading: "1A3655",
  text: "283444",
  muted: "5A697B",
  soft: "F4F7FB",
  border: "E5EBF2",
  charts: ["3E6FA8", "2E9C8F", "D08A2E", "B5577A", "7A68B8", "6B8E3E", "C46A4A", "8A96A6"],
};
const serif = "Source Serif 4",
  sans = "DM Sans";

export async function reportPptx(slides: Slide[], meta: { club: string; title: string; photo: string }) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = meta.club;
  pptx.company = meta.club;
  pptx.title = meta.title;
  const W = 10,
    H = 5.625;
  const frame = (s: PptxGenJS.Slide, x: number, y: number, w: number, h: number) =>
    s.addText(meta.photo, {
      shape: pptx.ShapeType.roundRect,
      rectRadius: 0.15,
      x,
      y,
      w,
      h,
      fill: { color: palette.soft },
      line: { color: palette.border, width: 1 },
      color: palette.muted,
      fontFace: sans,
      fontSize: 12,
      align: "center",
      valign: "middle",
    });
  for (const sl of slides) {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    if (sl.id === "cover") {
      s.addText(sl.subtitle ?? "", { x: 0.6, y: 1.2, w: 4.6, h: 0.5, fontFace: sans, fontSize: 16, color: palette.muted });
      s.addText(sl.title, { x: 0.6, y: 1.8, w: 4.6, h: 1.6, fontFace: serif, fontSize: 34, bold: true, color: palette.heading, valign: "top" });
      frame(s, 5.6, 0.6, 3.8, 4.4);
      continue;
    }
    s.addText(sl.title, { x: 0.5, y: 0.3, w: W - 1, h: 0.7, fontFace: serif, fontSize: 26, bold: true, color: palette.heading });
    let y = 1.15;
    if (sl.subtitle) {
      s.addText(sl.subtitle, { x: 0.5, y, w: W - 1, h: 0.4, fontFace: sans, fontSize: 14, color: palette.muted });
      y += 0.5;
    }
    if (sl.numbers) {
      sl.numbers.forEach((n, i) => {
        const col = i % 3,
          row = Math.floor(i / 3);
        s.addText(
          [
            { text: n.value, options: { fontFace: serif, fontSize: 30, bold: true, color: palette.primary, breakLine: true } },
            { text: n.label, options: { fontFace: sans, fontSize: 14, color: palette.text, breakLine: true } },
            { text: n.note, options: { fontFace: sans, fontSize: 10, color: palette.muted } },
          ],
          {
            shape: pptx.ShapeType.roundRect,
            rectRadius: 0.1,
            x: 0.5 + col * 3.05,
            y: y + row * 2,
            w: 2.85,
            h: 1.8,
            fill: { color: "FFFFFF" },
            line: { color: palette.border, width: 1 },
            margin: 12,
            valign: "middle",
          },
        );
      });
      continue;
    }
    if (sl.text) s.addText(sl.text, { x: 0.5, y, w: W - 1, h: H - y - 0.4, fontFace: sans, fontSize: 16, color: palette.text, valign: "top", paraSpaceAfter: 8 });
    if (sl.lines?.length) {
      const h = Math.min(H - y - 0.4, 0.45 * sl.lines.length + 0.2);
      s.addText(
        sl.lines.map((l) => ({ text: l, options: { bullet: true, breakLine: true } })),
        { x: 0.5, y, w: W - 1, h, fontFace: sans, fontSize: 15, color: palette.text, valign: "top", paraSpaceAfter: 6 },
      );
      y += h + 0.1;
    }
    if (sl.table) {
      s.addTable(
        [
          sl.table.head.map((text) => ({ text, options: { bold: true, color: palette.heading, fill: { color: palette.soft } } })),
          ...sl.table.rows.map((r) => r.map((text) => ({ text }))),
        ],
        { x: 0.5, y, w: W - 1, fontFace: sans, fontSize: 12, color: palette.text, border: { type: "solid", pt: 1, color: palette.border }, colW: [2.5, W - 3.5] },
      );
    }
    if (sl.charts?.length) {
      const w = (W - 1 - 0.3 * (sl.charts.length - 1)) / sl.charts.length;
      sl.charts.forEach((c, i) =>
        s.addChart(pptx.ChartType.bar, [{ name: c.title, labels: c.labels, values: c.values }], {
          x: 0.5 + i * (w + 0.3),
          y,
          w,
          h: H - y - 0.4,
          barDir: "bar",
          chartColors: palette.charts,
          showTitle: true,
          title: c.title,
          titleFontFace: sans,
          titleFontSize: 13,
          titleColor: palette.heading,
          catAxisLabelFontFace: sans,
          catAxisLabelFontSize: 10,
          catAxisLabelColor: palette.muted,
          valAxisLabelFontFace: sans,
          valAxisLabelFontSize: 9,
          valAxisLabelColor: palette.muted,
          valGridLine: { color: palette.border, size: 1 },
          showValue: true,
          dataLabelFontSize: 9,
          dataLabelColor: palette.text,
          showLegend: false,
        }),
      );
    }
    if (sl.photos?.length) {
      const n = sl.photos.length,
        cols = Math.min(3, n),
        rows = Math.ceil(n / cols);
      const w = (W - 1 - 0.3 * (cols - 1)) / cols,
        h = Math.min(1.9, (H - y - 0.3) / rows - 0.45);
      sl.photos.forEach((p, i) => {
        const x = 0.5 + (i % cols) * (w + 0.3),
          top = y + Math.floor(i / cols) * (h + 0.5);
        frame(s, x, top, w, h);
        s.addText(p.caption, { x, y: top + h + 0.02, w, h: 0.4, fontFace: sans, fontSize: 11, color: palette.text });
      });
    }
  }
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
