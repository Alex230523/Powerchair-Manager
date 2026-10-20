import { getDb } from "@/lib/db";
import { attestationsView } from "@/domains/dues/attestation";
import { principalIn, noStore, failure } from "@/lib/http";
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
