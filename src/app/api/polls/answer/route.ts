import { getDb } from "@/lib/db";
import { answerByToken, pollByToken } from "@/domains/polls/service";
import { origin, bounded, noStore, failure } from "@/lib/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
/** H3, public: the personal link of a poll; it is the only key and answers once. */
const token = z.string().regex(/^[A-Za-z0-9_-]{30,40}$/);
const headers = { ...noStore, "Referrer-Policy": "no-referrer" };
export async function GET(request: Request) {
  try {
    return Response.json(await pollByToken(getDb(), token.parse(new URL(request.url).searchParams.get("token"))), { headers });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const body = JSON.parse(new TextDecoder().decode(await bounded(request, 10000)));
    return Response.json(await answerByToken(getDb(), token.parse(body.token), { answers: body.answers }), { headers });
  } catch (e) {
    return failure(e);
  }
}
