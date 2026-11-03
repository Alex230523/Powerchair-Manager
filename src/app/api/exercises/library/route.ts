import { getDb } from "@/lib/db";
import { libraryCommand, libraryExecute, libraryView } from "@/domains/exercises/library";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 4: the federal library of sheets (clubs copy, the federation decides and publishes). */
export async function GET(request: Request) {
  try {
    return Response.json(await libraryView(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 400000)));
    return Response.json(await libraryExecute(getDb(), p, libraryCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
