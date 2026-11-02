import { getDb } from "@/lib/db";
import { guideChapter, guideExecute, guideIndex } from "@/domains/guide/service";
import { isLocale } from "@/lib/locale";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Guide du powerchair football: the chapters (?locale=), one chapter (?slug=, &draft=1 for the federation's text being written). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principal(request);
    const slug = q.get("slug");
    if (slug) return Response.json(await guideChapter(getDb(), p, z.string().regex(/^[a-z0-9-]{2,40}$/).parse(slug), q.get("draft") === "1"), { headers: noStore });
    const l = q.get("locale") ?? "fr";
    return Response.json(await guideIndex(getDb(), p, isLocale(l) ? l : "fr"), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 120000)));
    return Response.json(await guideExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
