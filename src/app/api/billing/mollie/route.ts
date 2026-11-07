import { gate } from "@/lib/http";
import { getDb } from "@/lib/db";
import { mollieConfigured, mollieWebhook } from "@/domains/billing/mollie";
export const dynamic = "force-dynamic";

/**
 * Console, series B (06/11/2026): Mollie's webhook. It posts « id=pl_… »;
 * nothing in the call is trusted: the link is read back from the API.
 * Always 200 once handled, so Mollie stops retrying; 503 when not configured.
 */
export async function POST(request: Request) {
  const flood = await gate(request, "webhook-ip");
  if (flood) return flood;
  if (!mollieConfigured()) return new Response(null, { status: 503 });
  let id = "";
  try {
    const raw = (await request.text()).slice(0, 2000);
    const type = request.headers.get("content-type") ?? "";
    id = type.includes("json") ? String((JSON.parse(raw) as { id?: string }).id ?? "") : (new URLSearchParams(raw).get("id") ?? "");
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await mollieWebhook(getDb(), id);
    return new Response(null, { status: 200 });
  } catch {
    // Mollie retries on a 5xx; a failed read of the link is worth a retry.
    return new Response(null, { status: 502 });
  }
}
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
