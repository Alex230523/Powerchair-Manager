import { getDb } from "@/lib/db";
import { appealFile, disciplineExecute, disciplineHistory, disciplineView } from "@/domains/discipline/service";
import { principal, origin, bounded, noStore, failure, servedType } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/**
 * 34: discipline. GET: the federation's desk or the club's page; ?player=
 * a player's history (his club and his federation); ?file= an appeal's
 * proof. POST: rules, decisions, manual sanctions, appeals, fines.
 */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principal(request);
    const db = getDb();
    const player = q.get("player");
    if (player) return Response.json(await disciplineHistory(db, p, z.uuid().parse(player)), { headers: noStore });
    const file = q.get("file");
    if (file) {
      const f = await appealFile(db, p, z.uuid().parse(file));
      return new Response(new Uint8Array(f.content), {
        headers: { ...noStore, "Content-Type": servedType(f.media_type), "Content-Disposition": `attachment; filename="${f.filename.replace(/[^\w.\- ]/g, "_")}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
      });
    }
    return Response.json(await disciplineView(db, p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 7500000)));
    return Response.json(await disciplineExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
