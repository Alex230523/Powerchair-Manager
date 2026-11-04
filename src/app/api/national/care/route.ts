import { getDb } from "@/lib/db";
import { nationalCare } from "@/domains/national/service";
import { principal, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 6: for the national staff, the care instructions of the players who consented, during the period only. */
export async function GET(request: Request) {
  try {
    const team = z.uuid().parse(new URL(request.url).searchParams.get("team"));
    return Response.json(await nationalCare(getDb(), await principal(request), team), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
