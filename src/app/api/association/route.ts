import { getDb } from "@/lib/db";
import { associationExecute, associationView, registerPdf } from "@/domains/association/service";
import { associationCommand } from "@/domains/association/schema";
import { isLocale } from "@/lib/locale";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 17: the ASBL's life (register, meetings); ?pdf=1 gives the register as a dated PDF. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const l = q.get("locale") ?? "fr";
    const locale = isLocale(l) ? l : "fr";
    const p = await principal(request);
    if (q.get("pdf") === "1") {
      const f = await registerPdf(getDb(), p, locale);
      return new Response(new Uint8Array(f.bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${f.filename}"` } });
    }
    return Response.json(await associationView(getDb(), p, locale), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 60000)));
    return Response.json(await associationExecute(getDb(), p, associationCommand.parse(body), z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
