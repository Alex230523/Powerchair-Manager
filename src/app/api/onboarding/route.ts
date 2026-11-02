import { getDb } from "@/lib/db";
import { onboardingExecute, onboardingView } from "@/domains/onboarding/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Parcours d'accueil: one's own journeys; for who manages the members, the templates and the follow-up. */
export async function GET(request: Request) {
  try {
    return Response.json(await onboardingView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 80000)));
    return Response.json(await onboardingExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
