import { getDb } from "@/lib/db";
import { attestationsView } from "@/domains/dues/attestation";
import { attestationSend, mutualExecute } from "@/domains/dues/attestation-send";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** Mutual insurance attestations of a season (?season=). */
export async function GET(request: Request) {
  try {
    const season = new URL(request.url).searchParams.get("season");
    return Response.json(
      await attestationsView(
        getDb(),
        await principalIn(request, "dues"),
        season ? z.uuid().parse(season) : undefined,
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
/** 9: « Envoyer » / « Renvoyer » an attestation; a mutual's own form dropped by the member, returned filled by the club. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "dues"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 7500000)));
    if (body?.action === "send") {
      const b = z.object({ profileId: z.uuid(), seasonId: z.uuid(), organizationId: z.uuid() }).parse(body);
      return Response.json(await attestationSend(getDb(), p, b.profileId, b.seasonId, b.organizationId), { headers: noStore });
    }
    return Response.json(await mutualExecute(getDb(), p, body, body?.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
