import { getDb } from "@/lib/db";
import { venuesView, venueExecute, venueCommand } from "@/domains/venues/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(await venuesView(getDb(), await principal(request)), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(
      await venueExecute(getDb(), p, venueCommand.parse(body)),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
