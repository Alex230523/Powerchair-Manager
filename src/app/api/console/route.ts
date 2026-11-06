import { getDb } from "@/lib/db";
import { consoleCommand, consoleCountries, consoleCountryExecute, consoleExecute, consoleHome, consoleOperators, consoleOrganization, consoleOrganizations, consoleSupervision } from "@/domains/console/service";
import { countryCommand } from "@/domains/console/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Console, step 1 (05/11/2026): the platform's operators read counts and states; every write is journaled. */
export async function GET(request: Request) {
  try {
    const p = await principal(request),
      url = new URL(request.url),
      view = url.searchParams.get("view") ?? "home";
    const db = getDb();
    if (view === "organizations") return Response.json(await consoleOrganizations(db, p, { q: url.searchParams.get("q") ?? "", kind: url.searchParams.get("kind") ?? "", country: url.searchParams.get("country") ?? "" }), { headers: noStore });
    if (view === "organization") return Response.json(await consoleOrganization(db, p, z.uuid().parse(url.searchParams.get("id"))), { headers: noStore });
    if (view === "supervision") return Response.json(await consoleSupervision(db, p), { headers: noStore });
    if (view === "operators") return Response.json(await consoleOperators(db, p), { headers: noStore });
    if (view === "countries") return Response.json(await consoleCountries(db, p), { headers: noStore });
    return Response.json(await consoleHome(db, p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 8000)));
    // Series E: the countries (owner).
    if (body && typeof body === "object" && (body as { action?: unknown }).action === "country") return Response.json(await consoleCountryExecute(getDb(), p, countryCommand.parse(body)), { headers: noStore });
    return Response.json(await consoleExecute(getDb(), p, consoleCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
