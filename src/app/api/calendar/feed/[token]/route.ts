import { getDb } from "@/lib/db";
import { calendarFeed } from "@/domains/calendar/service";
import { AccessError } from "@/domains/access/service";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  try {
    return new Response(await calendarFeed(getDb(), (await params).token), {
      headers: {
        ...headers,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="calendar.ics"',
      },
    });
  } catch (e) {
    return new Response(null, {
      status: e instanceof AccessError ? 404 : 503,
      headers,
    });
  }
}
