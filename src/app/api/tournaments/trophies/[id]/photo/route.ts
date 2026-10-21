import { z } from "zod";
import { getDb } from "@/lib/db";
import { photoCommand } from "@/domains/tournaments/schema";
import { trophyPhoto, trophyPhotoSave } from "@/domains/tournaments/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** The photo of a trophy, for those who can see its tournament. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const photo = await trophyPhoto(getDb(), await principal(request), z.uuid().parse((await params).id));
    return new Response(new Uint8Array(photo.photo), {
      headers: { ...noStore, "Content-Type": photo.photo_type, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    });
  } catch (e) {
    return failure(e);
  }
}
/** Adds or replaces it (base64 JSON, like the club logo). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 2_200_000)));
    const cmd = photoCommand.parse(body);
    return Response.json(await trophyPhotoSave(getDb(), p, z.uuid().parse((await params).id), cmd.mediaType, cmd.data, z.uuid().parse(body.organizationId)), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
