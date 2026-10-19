import { getDb } from "@/lib/db";
import {
  registrationView,
  registrationExecute,
  commandSchema,
} from "@/domains/registrations/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
import { guestPrincipal, guestToken } from "@/domains/registrations/guest";
import { AccessError } from "@/domains/access/service";

/** Login session, or a guest link limited to the applicant side. */
async function who(request: Request, admin: boolean) {
  const token = guestToken(request);
  if (!token) return principal(request);
  if (admin) throw new AccessError("FORBIDDEN");
  return guestPrincipal(getDb(), token);
}
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      await registrationView(
        getDb(),
        await who(
          request,
          new URL(request.url).searchParams.get("mode") === "admin",
        ),
        new URL(request.url).searchParams.get("mode") === "admin",
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const body = JSON.parse(
      new TextDecoder().decode(await bounded(request, 65000)),
    );
    const command = commandSchema.parse(body);
    const p = await who(
      request,
      ["form", "decision", "note"].includes(command.action),
    );
    const org = ["form", "decision", "note"].includes(command.action)
      ? z.uuid().parse(body.organizationId)
      : undefined;
    return Response.json(await registrationExecute(getDb(), p, command, org), {
      headers: noStore,
    });
  } catch (e) {
    return failure(e);
  }
}
