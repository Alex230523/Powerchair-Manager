/**
 * 4: a one page PDF (A4 landscape) around a JPEG, built in the browser for
 * « Exporter le terrain en PDF ». No library: the JPEG goes in as is
 * (DCTDecode), centred, with a title line in Helvetica.
 */
const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, (c) => `\\${c}`);

export function imagePdf(jpeg: Uint8Array, width: number, height: number, title: string): Uint8Array {
  const pageW = 842,
    pageH = 595,
    margin = 36,
    top = 40;
  const k = Math.min((pageW - 2 * margin) / width, (pageH - 2 * margin - top) / height);
  const w = Math.round(width * k),
    h = Math.round(height * k),
    x = Math.round((pageW - w) / 2),
    y = Math.round((pageH - top - margin - h) / 2 + margin);
  const content = `BT /F1 14 Tf ${margin} ${pageH - margin - 10} Td (${ascii(title).slice(0, 120)}) Tj ET\nq ${w} 0 0 ${h} ${x} ${y} cm /Im1 Do Q\n`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array) => {
    parts.push(b);
    size += b.length;
  };
  const text = (s: string) => push(enc.encode(s));
  text("%PDF-1.4\n");
  const object = (n: number, body: string | [string, Uint8Array, string]) => {
    offsets[n] = size;
    if (typeof body === "string") text(`${n} 0 obj\n${body}\nendobj\n`);
    else {
      text(`${n} 0 obj\n${body[0]}`);
      push(body[1]);
      text(`${body[2]}\nendobj\n`);
    }
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>`);
  object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  object(5, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  object(6, `<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`);
  const xref = size;
  text(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
