import { getDb } from "@/lib/db";
import { myDataExport } from "@/domains/privacy/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 12: « Mes données »: what the platform holds on the person signed in, as a JSON file. */
export async function GET(request: Request) {
  try {
    const data = await myDataExport(getDb(), await principal(request));
    return new Response(JSON.stringify(data, null, 2), {
      headers: { ...noStore, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="mes-donnees.json"' },
    });
  } catch (e) {
    return failure(e);
  }
}
