import { getDb } from "@/lib/db";
import { clubStatistics } from "@/domains/statistics/club";
import { principalIn, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 16 (S1): one chart of the « Club » tab (?chart=), for the season and team of the top bar and the chart's period. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const get = (k: string) => q.get(k) ?? undefined;
    return Response.json(
      await clubStatistics(getDb(), await principalIn(request, "statistics"), q.get("chart") ?? "summary", {
        season: get("season"),
        team: get("team"),
        period: get("period"),
        grain: get("grain"),
        view: get("view"),
      }),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
