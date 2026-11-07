import { getAuth } from "@/lib/auth-server";
import { getDb } from "@/lib/db";
import { tooMany } from "@/lib/http";
import { limit } from "@/lib/rate-limit";
import { securityEvent } from "@/domains/security/events";
import { AccessError } from "@/domains/access/service";
import { peopleExportGrid, filterSchema } from "@/domains/people/service";
import { columnTypes, exportOptions, printablePage, printHandler } from "@/domains/people/export";
import { createHash } from "node:crypto";
import { csvRows } from "@/domains/people/csv";
import { typedXlsx } from "@/lib/xlsx";
import { z, ZodError } from "zod";
export const dynamic = "force-dynamic";
const printPolicy = `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-hashes' 'sha256-${createHash("sha256").update(printHandler).digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session) throw new AccessError("UNAUTHENTICATED", 401);
    // Security (07/11/2026): a whole file built on demand counts.
    await limit(getDb(), "user-export", session.user.id);
    await securityEvent(getDb(), "data.export", { actorId: session.user.id, details: { path: "/api/people/export" } });
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const options = exportOptions.parse(params);
    const { grid, organization, today } = await peopleExportGrid(
      getDb(),
      { userId: session.user.id, sessionId: session.session.id },
      filterSchema.parse(params),
      z.uuid().parse(params.organizationId),
      options.columns,
      options.locale,
    );
    const name = "personnes-" + today;
    if (options.format === "xlsx")
      return new Response(typedXlsx(options.columns.map((c, i) => ({ header: String(grid[0][i]), type: columnTypes[c] })), grid.slice(1), organization) as BodyInit, {
        headers: {
          ...headers,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}.xlsx"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    if (options.format === "html")
      return new Response(
        printablePage(grid, organization, today, options.locale ?? "fr"),
        {
          headers: {
            ...headers,
            "Content-Type": "text/html; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            // A static page: only its print button runs (XSS, 07/11/2026: by its hash, nothing else).
            "Content-Security-Policy": printPolicy,
          },
        },
      );
    return new Response(csvRows(grid), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${options.locale ? name : "personnes"}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const flood = tooMany(e);
    if (flood) return flood;
    if (e instanceof AccessError)
      return Response.json({ error: e.code }, { status: e.status, headers });
    if (e instanceof ZodError)
      return Response.json(
        { error: "INVALID_INPUT" },
        { status: 400, headers },
      );
    return Response.json({ error: "UNAVAILABLE" }, { status: 503, headers });
  }
}
