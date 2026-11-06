import { getDb } from "@/lib/db";
import { dataRequestCreate, myDataRequests } from "@/domains/legal/service";
import { dataRequestCommand } from "@/domains/legal/schema";
import { dataRequestCertificate } from "@/domains/support/service";
import { z } from "zod";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 21: a person's requests (access, rectification, erasure), sent to the club responsible; `?certificate=` the PDF of one answered (series C). */
export async function GET(request: Request) {
  try {
    const p = await principal(request),
      certificate = new URL(request.url).searchParams.get("certificate");
    if (certificate) {
      const r = await dataRequestCertificate(getDb(), p, z.uuid().parse(certificate));
      return new Response(new Uint8Array(r.pdf), { headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.number}.pdf"` } });
    }
    return Response.json(await myDataRequests(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await dataRequestCreate(getDb(), p, dataRequestCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
