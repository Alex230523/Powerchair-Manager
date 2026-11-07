import "server-only";
import { headers } from "next/headers";

/** The nonce drawn by src/proxy.ts for this page (absent outside a page). */
export async function scriptNonce() {
  return (await headers()).get("x-nonce") ?? undefined;
}
