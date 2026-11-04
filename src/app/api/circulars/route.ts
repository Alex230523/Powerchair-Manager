import { getDb } from "@/lib/db";
import { circularDetail, circularExecute, circularExport, circularsView } from "@/domains/circulars/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 33: the circulars (received; written and followed by the federation's communication); ?id= one of them; ?export= its follow-up (CSV). */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = await principal(request);
    const exp = q.get("export");
    if (exp) {
      const csv = await circularExport(getDb(), p, z.uuid().parse(exp));
      return new Response("﻿" + csv, { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="circulaire-${exp.slice(0, 8)}.csv"` } });
    }
    const id = q.get("id");
    if (id) return Response.json(await circularDetail(getDb(), p, z.uuid().parse(id)), { headers: noStore });
    return Response.json(await circularsView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 7500000)));
    return Response.json(await circularExecute(getDb(), p, body, z.uuid().parse(body?.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
