import { z } from "zod";
import { getDb } from "@/lib/db";
import { tournamentView } from "@/domains/tournaments/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** One tournament: current situation, match days and results. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(await tournamentView(getDb(), await principal(request), z.uuid().parse((await params).id)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
