/**
 * B2: a photo is made lighter in the browser before it is sent (no server
 * library, no cost): at most 2000 px on its longest side, JPEG at 82 %.
 * PDFs, small images and anything the browser cannot draw go as they are;
 * a result that is not smaller is dropped.
 */
export const imageLimits = { side: 2000, quality: 0.82, keepUnder: 300 * 1024 } as const;

/** The size to draw at, the ratio kept (pure, tested). */
export function fitWithin(width: number, height: number, side = imageLimits.side) {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= imageLimits.keepUnder || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // A transparent PNG keeps a white background once in JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", imageLimits.quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** The form's file fields, lighter, before sending. */
export async function compressFormImages(data: FormData) {
  for (const [key, value] of [...data.entries()]) if (value instanceof File && value.size) data.set(key, await compressImage(value));
  return data;
}
