import { getDb } from "@/lib/db";
import { documentDrive } from "@/domains/documents/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 10: the documents in folders (by type, by season, and the free folders), within the same rights. */
export async function GET(request: Request) {
  try {
    return Response.json(await documentDrive(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
