#!/usr/bin/env node
// B4: prints a new VAPID key pair for the push notifications (PFM_VAPID_PUBLIC_KEY and PFM_VAPID_PRIVATE_KEY).
// Generate it once per platform and keep the private key secret; changing it unsubscribes every device.
import { generateKeyPairSync } from "node:crypto";
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]);
console.log(`PFM_VAPID_PUBLIC_KEY=${raw.toString("base64url")}`);
console.log(`PFM_VAPID_PRIVATE_KEY=${privateKey.export({ format: "jwk" }).d}`);
console.log("PFM_VAPID_SUBJECT=mailto:contact@example.org");
