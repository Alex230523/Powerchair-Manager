import { getDb } from "@/lib/db";
import { journeyTacticDiagram } from "@/domains/competitions/journey";
import { principalIn, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 4: the image or PDF of a tactic, for the staff and the invited players of the match. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const d = await journeyTacticDiagram(getDb(), await principalIn(request, "matches"), z.uuid().parse(url.searchParams.get("id")), z.uuid().parse(url.searchParams.get("exercise")));
    return new Response(new Uint8Array(d.content), {
      headers: {
        "Content-Type": d.media_type,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
