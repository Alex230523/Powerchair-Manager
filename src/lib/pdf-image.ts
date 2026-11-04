import { deflateSync, inflateSync } from "node:zlib";
import type { PdfImage } from "./pdf";

/**
 * 9: a club logo or a signature ready for the PDF writer. A JPEG goes in as
 * it is; a PNG (8 bits, grey, colour, palette, with or without
 * transparency) is decoded, its alpha kept as a soft mask. Anything else
 * (WebP, 16 bits, interlaced) is left out: the paper is still made, without
 * the image. Server only.
 */
export function pdfImage(bytes: Uint8Array, type: string): PdfImage | null {
  try {
    if (type === "image/jpeg") return jpeg(bytes);
    if (type === "image/png") return png(bytes);
  } catch {
    return null;
  }
  return null;
}

function jpeg(b: Uint8Array): PdfImage | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1],
      length = (b[i + 2] << 8) | b[i + 3];
    // SOF0 (baseline) and SOF2 (progressive) carry the size and the components.
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (b[i + 5] << 8) | b[i + 6],
        width = (b[i + 7] << 8) | b[i + 8],
        components = b[i + 9];
      if (components !== 1 && components !== 3) return null;
      return { width, height, colors: components as 1 | 3, filter: "DCTDecode", data: b };
    }
    i += 2 + length;
  }
  return null;
}

function png(b: Uint8Array): PdfImage | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (view.getUint32(0) !== 0x89504e47) return null;
  let i = 8,
    width = 0,
    height = 0,
    depth = 0,
    type = 0,
    interlace = 0;
  let palette: Uint8Array | null = null,
    paletteAlpha: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (i + 8 <= b.length) {
    const length = view.getUint32(i),
      kind = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]),
      data = b.subarray(i + 8, i + 8 + length);
    if (kind === "IHDR") {
      width = view.getUint32(i + 8);
      height = view.getUint32(i + 12);
      depth = b[i + 16];
      type = b[i + 17];
      interlace = b[i + 20];
    } else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") paletteAlpha = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    i += 12 + length;
  }
  if (depth !== 8 || interlace !== 0 || !width || !height || width * height > 4000000) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels || (type === 3 && !palette)) return null;
  const raw = inflateSync(Buffer.concat(idat.map((x) => Buffer.from(x))));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  // Undo the per-line filters (none, sub, up, average, Paeth).
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)],
      src = y * (stride + 1) + 1,
      dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[dst + x - channels] : 0,
        up = y ? pixels[dst - stride + x] : 0,
        c = y && x >= channels ? pixels[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - up),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      pixels[dst + x] = v & 0xff;
    }
  }
  const n = width * height;
  const colors: 1 | 3 = type === 0 || type === 4 ? 1 : 3;
  const color = new Uint8Array(n * colors),
    alpha = new Uint8Array(n);
  let transparent = false;
  for (let p = 0; p < n; p++) {
    if (type === 3) {
      const k = pixels[p];
      color.set(palette!.subarray(k * 3, k * 3 + 3), p * 3);
      alpha[p] = paletteAlpha && k < paletteAlpha.length ? paletteAlpha[k] : 255;
    } else {
      const s = p * channels;
      for (let k = 0; k < colors; k++) color[p * colors + k] = pixels[s + k];
      alpha[p] = channels === 2 || channels === 4 ? pixels[s + channels - 1] : 255;
    }
    if (alpha[p] !== 255) transparent = true;
  }
  return { width, height, colors, filter: "FlateDecode", data: deflateSync(color), ...(transparent ? { alpha: deflateSync(alpha) } : {}) };
}
