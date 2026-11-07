import { getDb } from "@/lib/db";
import { isJob } from "@/domains/jobs/registry";
import { runJob } from "@/domains/jobs/runner";
import { cronAuthorized } from "@/domains/jobs/secret";
import { securityEvent } from "@/domains/security/events";
import { clientKey } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
// A run stays well within the free plan's function time (the mail batch is capped).
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

/**
 * B2: /api/cron/<task> runs one background task once (mail, documents,
 * attendance, reminders, watchdog). Called by the scheduler with the
 * CRON_SECRET; a second call while one runs answers « locked ».
 */
async function handle(request: Request, params: Promise<{ job: string }>) {
  if (!process.env.CRON_SECRET) return Response.json({ error: "CRON_DISABLED" }, { status: 503, headers });
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    // Security (07/11/2026): the scheduler's door knocked with a wrong secret: journaled, the owners alerted.
    await securityEvent(getDb(), "cron.unauthorized", { source: clientKey(request), details: { path: new URL(request.url).pathname.slice(0, 60) } });
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401, headers });
  }
  const { job } = await params;
  if (!isJob(job)) return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
  const result = await runJob(getDb(), job);
  return Response.json(result, { status: result.status === "failed" ? 500 : 200, headers });
}
export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, params);
}
export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, params);
}
