import { getDb } from "@/lib/db";
import {
  coachProfileView,
  coachExecute,
  clubCommand,
} from "@/domains/coaches/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
import { AccessError } from "@/domains/access/service";
import { proofMaxBytes } from "@/domains/licences/schema";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    return Response.json(
      await coachProfileView(getDb(), await principal(request), id),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
/** JSON command, or multipart (the request with its certificate in `file`). */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const bytes = await bounded(request, proofMaxBytes + 200000);
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      let d: FormData;
      try {
        d = await new Request(request.url, { method: "POST", headers: { "content-type": type }, body: bytes }).formData();
      } catch {
        throw new AccessError("INVALID_FILE", 400);
      }
      const f = d.get("file");
      const proof = f instanceof File && f.size > 0 ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null;
      return Response.json(
        await coachExecute(
          getDb(),
          p,
          clubCommand.parse({ action: d.get("action"), profileId: d.get("profileId"), courseId: d.get("courseId"), note: d.get("note") ?? "" }),
          z.uuid().parse(d.get("organizationId")),
          proof,
        ),
        { headers: noStore },
      );
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return Response.json(await coachExecute(getDb(), p, clubCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
