/**
 * B8: a small PDF writer for official papers (the 281.71 tax receipt): A4
 * pages of text lines in Helvetica and Helvetica-Bold, WinAnsi encoding
 * (French, Dutch and English accents, €, « »), long lines wrapped. No
 * dependency; the bytes are built here. Pure.
 */
export type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number; indent?: number; image?: string; height?: number };
/**
 * 9: an image ready for the PDF (decoded by pdf-image.ts on the server):
 * its pixels compressed (Flate) or a JPEG as is (DCT), and for a PNG with
 * transparency its alpha as a soft mask.
 */
export type PdfImage = { width: number; height: number; colors: 1 | 3; filter: "FlateDecode" | "DCTDecode"; data: Uint8Array; alpha?: Uint8Array };
export type PdfOptions = { images?: Record<string, PdfImage>; footer?: PdfLine[] };

const A4 = { w: 595.28, h: 841.89 },
  margin = 56;
/** WinAnsi (cp1252) for the characters the papers use; anything else becomes « ? ». */
const special: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99, "œ": 0x9c, "Œ": 0x8c };
function winAnsi(s: string) {
  const out: number[] = [];
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (special[ch]) out.push(special[ch]);
    else if (c === 0x202f || c === 0xa0) out.push(0x20);
    else if (c >= 0x20 && c <= 0xff && !(c >= 0x7f && c <= 0x9f)) out.push(c);
    else out.push(0x3f);
  }
  return out;
}
/** A PDF string literal: parentheses and backslashes escaped, bytes above 127 in octal. */
function literal(bytes: number[]) {
  return "(" + bytes.map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? "\\" + String.fromCharCode(b) : b < 0x80 ? String.fromCharCode(b) : "\\" + b.toString(8).padStart(3, "0"))).join("") + ")";
}
/** Wraps a line to the page width (Helvetica is about half an em wide on average). */
export function wrap(text: string, size: number, width = A4.w - 2 * margin) {
  const max = Math.max(10, Math.floor(width / (size * 0.52)));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > max && line) {
        out.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out;
}

const binary = (b: Uint8Array) => {
  let out = "";
  for (let i = 0; i < b.length; i += 8192) out += String.fromCharCode(...b.subarray(i, i + 8192));
  return out;
};

export function pdfDocument(lines: PdfLine[], title: string, options: PdfOptions = {}) {
  const images = Object.entries(options.images ?? {});
  const name = (key: string) => `Im${images.findIndex(([k]) => k === key) + 1}`;
  // The footer, drawn at the bottom of every page: its height is kept free.
  const footerOps: string[] = [];
  let footerTop = margin;
  for (const l of [...(options.footer ?? [])].reverse()) {
    const size = l.size ?? 8;
    if (l.image && options.images?.[l.image]) {
      const img = options.images[l.image],
        h = l.height ?? 24,
        w = (img.width / img.height) * h;
      footerOps.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(margin + (l.indent ?? 0)).toFixed(2)} ${footerTop.toFixed(2)} cm /${name(l.image)} Do Q`);
      footerTop += h + 4;
      continue;
    }
    for (const part of wrap(l.text, size).reverse()) {
      footerOps.push(`BT /${l.bold ? "F2" : "F1"} ${size} Tf ${(margin + (l.indent ?? 0)).toFixed(2)} ${footerTop.toFixed(2)} Td ${literal(winAnsi(part))} Tj ET`);
      footerTop += size * 1.35;
    }
    footerTop += l.gap ?? 0;
  }
  const bottom = options.footer?.length ? footerTop + 12 : margin;
  // Lay the lines out on pages.
  const pages: string[] = [];
  let ops: string[] = [],
    y = A4.h - margin;
  const flush = () => {
    pages.push([...ops, ...footerOps].join("\n"));
    ops = [];
    y = A4.h - margin;
  };
  for (const l of lines) {
    y -= l.gap ?? 0;
    if (l.image) {
      const img = options.images?.[l.image];
      if (!img) continue;
      const h = l.height ?? 48,
        w = Math.min(A4.w - 2 * margin, (img.width / img.height) * h);
      if (y - h < bottom) flush();
      y -= h;
      ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(margin + (l.indent ?? 0)).toFixed(2)} ${y.toFixed(2)} cm /${name(l.image)} Do Q`);
      continue;
    }
    const size = l.size ?? 11;
    for (const part of wrap(l.text, size, A4.w - 2 * margin - (l.indent ?? 0))) {
      if (y - size < bottom) flush();
      y -= size * 1.35;
      ops.push(`BT /${l.bold ? "F2" : "F1"} ${size} Tf ${(margin + (l.indent ?? 0)).toFixed(2)} ${y.toFixed(2)} Td ${literal(winAnsi(part))} Tj ET`);
    }
  }
  flush();
  // Objects: catalog, pages, two fonts, info, then a page and its content per page, then the images (and their masks).
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
  const first = 6 + pages.length * 2;
  const imageObjects: string[] = [];
  const refs: string[] = [];
  for (const [, img] of images) {
    const own = first + imageObjects.length;
    const mask = img.alpha ? own + 1 : null;
    refs.push(`${own} 0 R`);
    imageObjects.push(
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /${img.colors === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /${img.filter}${mask ? ` /SMask ${mask} 0 R` : ""} /Length ${img.data.length} >>\nstream\n${binary(img.data)}\nendstream`,
    );
    if (img.alpha) imageObjects.push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.alpha.length} >>\nstream\n${binary(img.alpha)}\nendstream`);
  }
  const xobjects = images.length ? ` /XObject << ${images.map((_, i) => `/Im${i + 1} ${refs[i]}`).join(" ")} >>` : "";
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(`<< /Title ${literal(winAnsi(title))} /Producer (Powerchair Football Manager) >>`);
  for (const [i, content] of pages.entries()) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${7 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects.push(...imageObjects);
  // The body is one byte per character (text escaped to ASCII, image streams as Latin-1), so length = offset.
  let body = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  for (const [i, o] of objects.entries()) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}
