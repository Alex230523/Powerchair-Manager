import { getDb } from "@/lib/db";
import { contactChoices, contactDetail, contactExport, contactsView, contactsExecute } from "@/domains/crm/service";
import { contactCommand } from "@/domains/crm/schema";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/**
 * The contact book (A4): the whole book, ?list=1 for the « Choisir ou
 * créer un contact » field, ?contact= for one contact's sheet, ?export=
 * for what the club keeps about a person (GDPR).
 */
export async function GET(request: Request) {
  try {
    const p = await principal(request),
      q = new URL(request.url).searchParams;
    if (q.get("list") === "1") return Response.json(await contactChoices(getDb(), p), { headers: noStore });
    if (q.get("contact")) return Response.json(await contactDetail(getDb(), p, z.uuid().parse(q.get("contact"))), { headers: noStore });
    if (q.get("export")) {
      const data = await contactExport(getDb(), p, z.uuid().parse(q.get("export")));
      return new Response(JSON.stringify(data, null, 2), {
        headers: { ...noStore, "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="contact-${q.get("export")}.json"` },
      });
    }
    return Response.json(await contactsView(getDb(), p), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    // An import carries up to 500 rows.
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 600000)));
    return Response.json(await contactsExecute(getDb(), p, contactCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
