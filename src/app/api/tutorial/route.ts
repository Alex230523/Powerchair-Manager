import { getDb } from "@/lib/db";
import { tutorialExecute, tutorialView } from "@/domains/tutorial/service";
import { tutorialCommand } from "@/domains/tutorial/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Wave 17 (O1): the first-connection tour of the active profile. */
export async function GET(request: Request) {
  try {
    return Response.json(await tutorialView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 2000)));
    return Response.json(await tutorialExecute(getDb(), p, tutorialCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
