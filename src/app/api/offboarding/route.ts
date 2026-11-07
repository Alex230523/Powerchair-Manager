import { getDb } from "@/lib/db";
import { offboardingExecute, offboardingSettings, offboardingView, volunteerCertificate } from "@/domains/offboarding/service";
import { isLocale } from "@/lib/locale";
import { principal, origin, bounded, noStore, failure, disposition } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** « Fin de coach »: the departure of one coach (?profile=); ?settings=1 the club's choices; ?certificate=1 gives his volunteering certificate (PDF). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    if (q.get("settings") === "1") return Response.json(await offboardingSettings(getDb(), await principal(request)), { headers: noStore });
    const profile = z.uuid().parse(q.get("profile"));
    const l = q.get("locale") ?? "fr";
    const p = await principal(request);
    if (q.get("certificate") === "1") {
      const f = await volunteerCertificate(getDb(), p, profile, isLocale(l) ? l : "fr");
      return new Response(new Uint8Array(f.bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": disposition("attachment", f.filename) } });
    }
    return Response.json(await offboardingView(getDb(), p, profile), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await offboardingExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
