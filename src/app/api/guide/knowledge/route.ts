import { getDb } from "@/lib/db";
import { knowledgeExecute, knowledgeView } from "@/domains/guide/knowledge";
import { isLocale } from "@/lib/locale";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Knowledge centre: the lexicon, the gallery, the chair catalogue (?part=, &id= for one model); the federation writes them. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const part = z.enum(["lexicon", "gallery", "chairs", "chair"]).parse(q.get("part"));
    const l = q.get("locale") ?? "fr";
    const id = part === "chair" ? z.uuid().parse(q.get("id")) : undefined;
    return Response.json(await knowledgeView(getDb(), await principal(request), part, isLocale(l) ? l : "fr", id), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 3000000)));
    return Response.json(await knowledgeExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
