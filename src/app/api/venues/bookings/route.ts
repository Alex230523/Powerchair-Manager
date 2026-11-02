import { getDb } from "@/lib/db";
import { bookingExecute, bookingsView } from "@/domains/venues/bookings";
import { bookingCommand } from "@/domains/venues/bookings-schema";
import { isLocale } from "@/lib/locale";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 18: the halls' bookings of the club (brought up to date with the calendar first). */
export async function GET(request: Request) {
  try {
    const l = new URL(request.url).searchParams.get("locale") ?? "fr";
    return Response.json(await bookingsView(getDb(), await principal(request), isLocale(l) ? l : "fr"), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 20000)));
    return Response.json(await bookingExecute(getDb(), p, bookingCommand.parse(body), z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
