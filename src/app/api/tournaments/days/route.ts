import { z } from "zod";
import { getDb } from "@/lib/db";
import { tournamentDaysIn } from "@/domains/tournaments/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** Match days between two dates, for the calendar (?from=YYYY-MM-DD&to=YYYY-MM-DD). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const from = z.iso.date().parse(q.get("from")),
      to = z.iso.date().parse(q.get("to"));
    return Response.json({ items: await tournamentDaysIn(getDb(), await principal(request), from, to) }, { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
