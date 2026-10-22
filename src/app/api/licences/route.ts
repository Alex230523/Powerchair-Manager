import { getDb } from "@/lib/db";
import { licenceCopyUpload, licenceExecute, licenceView } from "@/domains/licences/service";
import { licenceCommand, proofMaxBytes } from "@/domains/licences/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { AccessError } from "@/domains/access/service";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (O1): one person's driving licence (themselves, the president, trip organisers). */
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("profile"));
    return Response.json(await licenceView(getDb(), await principal(request), id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}

/** JSON command (save, verify, removeCopy, remove), or multipart (file, profileId) for the copy. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const bytes = await bounded(request, proofMaxBytes + 200000);
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("application/json")) {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      return Response.json(await licenceExecute(getDb(), p, licenceCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
    }
    let d: FormData;
    try {
      d = await new Request(request.url, { method: "POST", headers: { "content-type": type }, body: bytes }).formData();
    } catch {
      throw new AccessError("INVALID_FILE", 400);
    }
    const f = d.get("file");
    if (!(f instanceof File)) throw new AccessError("INVALID_FILE", 400);
    return Response.json(
      await licenceCopyUpload(getDb(), p, z.uuid().parse(d.get("profileId")), { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, z.uuid().parse(d.get("organizationId"))),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
