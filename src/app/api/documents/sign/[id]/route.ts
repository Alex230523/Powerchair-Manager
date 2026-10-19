import { getDb } from "@/lib/db";
import { documentSign } from "@/domains/documents/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 300000)),
      );
    return Response.json(
      await documentSign(
        getDb(),
        p,
        (await params).id,
        {
          expectedVersion: z.number().int().positive().parse(body.version),
          signerName: String(body.signerName ?? ""),
          signature: String(body.signature ?? ""),
          accept: body.accept === true,
        },
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
