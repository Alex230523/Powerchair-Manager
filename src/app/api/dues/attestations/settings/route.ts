import { getDb } from "@/lib/db";
import { attestationSettings, attestationSettingsExecute } from "@/domains/dues/attestation-send";
import { principalIn, origin, bounded, noStore, failure } from "@/lib/http";
export const dynamic = "force-dynamic";
/** 9: the signatory and the signature (administrators only), the automatic sending (Réglages › Finances). */
export async function GET(request: Request) {
  try {
    return Response.json(await attestationSettings(getDb(), await principalIn(request, "dues")), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const p = await principalIn(request, "dues"),
      body = JSON.parse(new TextDecoder().decode(await bounded(request, 800000)));
    return Response.json(await attestationSettingsExecute(getDb(), p, body, body?.organizationId), { headers: noStore });
  } catch (e) {
    return failure(e);
  }
}
