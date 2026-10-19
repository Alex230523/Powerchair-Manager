import { getDb } from "@/lib/db";
import {
  clubLicensesView,
  clubLicensesExecute,
  clubCommand,
} from "@/domains/federation/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await clubLicensesView(getDb(), await principal(request)),
      {
        headers: noStore,
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(
        new TextDecoder().decode(await bounded(request, 20000)),
      );
    return Response.json(
      await clubLicensesExecute(
        getDb(),
        p,
        clubCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
