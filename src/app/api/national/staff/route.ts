import { getDb } from "@/lib/db";
import { nationalStaffView } from "@/domains/national/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 13/11/2026: « Mon équipe nationale »: the teams, players and gatherings of the national staff, read only. */
export async function GET(request: Request) {
  try {
    return Response.json(await nationalStaffView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
