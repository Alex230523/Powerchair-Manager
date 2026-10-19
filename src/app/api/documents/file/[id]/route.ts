import { getDb } from "@/lib/db";
import { documentUpload, documentDownload } from "@/domains/documents/service";
import {
  principal,
  origin,
  bounded,
  noStore,
  failure,
} from "@/lib/http";
import { AccessError } from "@/domains/access/service";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const f = await documentDownload(
      getDb(),
      await principal(request),
      (await params).id,
      z.uuid().parse(new URL(request.url).searchParams.get("organizationId")),
    );
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        ...noStore,
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(f.filename),
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    origin(request);
    const p = await principal(request),
      bytes = await bounded(request, 2200000);
    let d: FormData;
    try {
      d = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "" },
        body: bytes,
      }).formData();
    } catch {
      throw new AccessError("INVALID_FILE", 400);
    }
    const f = d.get("file");
    if (!(f instanceof File)) throw new AccessError("INVALID_FILE", 400);
    return Response.json(
      await documentUpload(
        getDb(),
        p,
        (await params).id,
        z.coerce.number().int().positive().parse(d.get("version")),
        {
          name: f.name,
          type: f.type,
          bytes: Buffer.from(await f.arrayBuffer()),
        },
        z.uuid().parse(d.get("organizationId")),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
