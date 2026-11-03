import { getDb } from "@/lib/db";
import { mailTemplateCommand, mailTemplateExecute, mailTemplatesView } from "@/domains/mail-templates/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
import { isLocale } from "@/lib/locale";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** 10: the club's library of email templates. */
export async function GET(request: Request) {
  try {
    const l = new URL(request.url).searchParams.get("locale") ?? "fr";
    return Response.json(await mailTemplatesView(getDb(), await principal(request), isLocale(l) ? l : "fr"), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 200000)));
    return Response.json(await mailTemplateExecute(getDb(), p, mailTemplateCommand.parse(body), z.uuid().parse(body.organizationId)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
