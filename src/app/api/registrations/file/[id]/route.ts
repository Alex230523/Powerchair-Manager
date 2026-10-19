import { getDb } from "@/lib/db";
import {
  attachmentUpload,
  attachmentRead,
} from "@/domains/registrations/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
import { guestPrincipal, guestToken } from "@/domains/registrations/guest";
const who = async (request: Request) => {
  const token = guestToken(request);
  return token ? guestPrincipal(getDb(), token) : principal(request);
};
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const org = new URL(request.url).searchParams.get("organizationId");
    const file = await attachmentRead(
      getDb(),
      await who(request),
      (await params).id,
      org ? z.uuid().parse(org) : undefined,
    );
    return new Response(new Uint8Array(file.content), {
      headers: {
        ...noStore,
        "Content-Type": "application/octet-stream",
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename),
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
    const p = await who(request);
    const bytes = await bounded(request, 2200000);
    const wrapped = new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: bytes,
    });
    const data = await wrapped.formData();
    const file = data.get("file");
    if (!(file instanceof File))
      return Response.json(
        { error: "INVALID_FILE" },
        { status: 400, headers: noStore },
      );
    return Response.json(
      await attachmentUpload(
        getDb(),
        p,
        (await params).id,
        z.string().parse(data.get("key")),
        z.coerce.number().int().positive().parse(data.get("version")),
        {
          name: file.name,
          type: file.type,
          bytes: Buffer.from(await file.arrayBuffer()),
        },
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
