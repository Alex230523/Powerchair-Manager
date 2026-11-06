import { getDb } from "@/lib/db";
import { mcpKeyCommand, mcpKeys, mcpKeysExecute } from "@/domains/mcp/service";
import { principal, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";

/** Console, step 6 (06/11/2026): an operator's keys for the MCP server. */
export async function GET(request: Request) {
  try {
    return Response.json(await mcpKeys(getDb(), await principal(request)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principal(request),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 4000)));
    return Response.json(await mcpKeysExecute(getDb(), p, mcpKeyCommand.parse(body)), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
