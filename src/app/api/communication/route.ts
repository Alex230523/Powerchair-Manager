import { getDb } from "@/lib/db";
import {
  communicationView,
  communicationExecute,
} from "@/domains/communication/service";
import { communicationCommand } from "@/domains/communication/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await communicationView(getDb(), await principalIn(request, "communication")),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "communication"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 120000)));
    return Response.json(
      await communicationExecute(
        getDb(),
        p,
        communicationCommand.parse(body),
        z.uuid().parse(body.organizationId),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
