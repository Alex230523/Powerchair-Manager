import { getDb } from "@/lib/db";
import { exportDownload } from "@/domains/legal/service";
import { principal, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** 21: the club's full export (ZIP), for its presidency, through its temporary link. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const f = await exportDownload(getDb(), await principal(request), (await params).token);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        ...noStore,
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(f.name),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
