import { getDb } from "@/lib/db";
import { statementRemove, statementUpload, statementsView } from "@/domains/finance/service";
import { statementMaxBytes } from "@/domains/finance/schema";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
import { AccessError } from "@/domains/access/service";
import { z } from "zod";
export const dynamic = "force-dynamic";

/** Wave 17 (N1): the bank statements filed month by month, with the gap to the platform's cash. */
export async function GET(request: Request) {
  try {
    return Response.json(await statementsView(getDb(), await principalIn(request, "finance")), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}

/** Multipart (file, account, month, balance): files a statement. JSON { action: "remove", id }: removes one. */
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "finance");
    const bytes = await bounded(request, statementMaxBytes + 200000);
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("application/json")) {
      const body = z.object({ action: z.literal("remove"), id: z.uuid(), organizationId: z.uuid() }).parse(JSON.parse(new TextDecoder().decode(bytes)));
      return Response.json(await statementRemove(getDb(), p, body.id, body.organizationId), { headers: noStore });
    }
    let d: FormData;
    try {
      d = await new Request(request.url, { method: "POST", headers: { "content-type": type }, body: bytes }).formData();
    } catch {
      throw new AccessError("INVALID_FILE", 400);
    }
    const f = d.get("file");
    if (!(f instanceof File)) throw new AccessError("INVALID_FILE", 400);
    const balance = String(d.get("balance") ?? "").trim();
    const cents = balance ? Math.round(Number(balance.replace(/\s/g, "").replace(",", ".")) * 100) : null;
    if (cents !== null && !Number.isFinite(cents)) throw new AccessError("INVALID_INPUT", 400);
    return Response.json(
      await statementUpload(
        getDb(),
        p,
        {
          account: String(d.get("account") ?? ""),
          month: String(d.get("month") ?? ""),
          balanceCents: cents,
          file: { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) },
        },
        z.uuid().parse(d.get("organizationId")),
      ),
      { headers: noStore },
    );
  } catch (e) {
    return failure(e);
  }
}
