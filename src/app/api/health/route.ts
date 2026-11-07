import { gate } from "@/lib/http";
import { getDb } from "@/lib/db";
import { jobStates, overdueMails } from "@/domains/jobs/health";
export const dynamic = "force-dynamic";
/**
 * The state of the service for an uptime monitor (B2): the database, mails
 * waiting for more than 30 minutes, and each background task's last run.
 * Counts and dates only, no personal data. 200 when it works (« degraded »
 * when a task is late), 503 when the database is out of reach.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    // Security (07/11/2026): a monitor calls once a minute; a flood stops here (a database out of reach answers 503 below).
    const flood = await gate(request, "public-read");
    if (flood) return flood;
    const db = getDb();
    await db.query("SELECT 1");
    const [jobs, overdue] = await Promise.all([jobStates(db).catch(() => []), overdueMails(db).catch(() => null)]);
    const degraded = jobs.some((j) => j.late) || (overdue ?? 0) > 0;
    return Response.json({ status: degraded ? "degraded" : "ok", database: "reachable", mail: { overdue }, jobs }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
