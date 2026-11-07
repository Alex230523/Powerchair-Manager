import { getDb } from "@/lib/db";
import { annualSummary, expensesCsv, refereeProof, refereeingExecute, refereeingView, reportForClub } from "@/domains/referees/service";
import { principal, origin, bounded, noStore, failure, servedType, disposition } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/**
 * 25 and 36 to 39: refereeing. GET: the federation's desk or the referee's;
 * ?report= a club match's report (club side); ?expenses=csv the claims to
 * pay; ?summary=<referee>&year= the yearly PDF; ?proof=training:<id> or
 * expense:<id> a proof.
 */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principal(request);
    const db = getDb();
    const report = q.get("report");
    if (report) return Response.json(await reportForClub(db, p, z.uuid().parse(report)), { headers: noStore });
    if (q.get("expenses") === "csv") return new Response("﻿" + (await expensesCsv(db, p)), { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="notes-de-frais.csv"' } });
    const summary = q.get("summary");
    if (summary) {
      const f = await annualSummary(db, p, z.string().min(1).max(200).parse(summary), z.coerce.number().int().min(2000).max(2100).parse(q.get("year")));
      return new Response(new Uint8Array(f.bytes), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": disposition("attachment", f.filename) } });
    }
    const proof = q.get("proof");
    if (proof) {
      const [kind, id] = proof.split(":");
      const f = await refereeProof(db, p, z.enum(["training", "expense"]).parse(kind), z.uuid().parse(id));
      return new Response(new Uint8Array(f.content), { headers: { ...noStore, "Content-Type": servedType(f.media_type), "Content-Disposition": `attachment; filename="${f.filename.replace(/[^\w.\- ]/g, "_")}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
    }
    return Response.json(await refereeingView(db, p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 7500000)));
    return Response.json(await refereeingExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
