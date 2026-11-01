import { type ECDH, createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, createCipheriv, sign } from "node:crypto";

/**
 * B4: Web Push without a dependency. The payload is encrypted for the
 * device (RFC 8291, « aes128gcm » of RFC 8188) and the request is signed
 * with the platform's VAPID key (RFC 8292, ES256). Pure apart from the
 * random salt and ephemeral key.
 */
const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type Subscription = { endpoint: string; p256dh: string; auth: string };

/** A new VAPID key pair (base64url: the raw 65-byte public point and the 32-byte private scalar). */
export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" }),
    priv = privateKey.export({ format: "jwk" });
  return { publicKey: b64(Buffer.concat([Buffer.from([4]), unb64(pub.x!), unb64(pub.y!)])), privateKey: priv.d! };
}

/** The keys from the environment, or null when push is not configured. */
export function vapidFromEnv(env: Record<string, string | undefined> = process.env): VapidKeys | null {
  const publicKey = env.PFM_VAPID_PUBLIC_KEY?.trim(),
    privateKey = env.PFM_VAPID_PRIVATE_KEY?.trim(),
    subject = env.PFM_VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (unb64(publicKey).length !== 65 || unb64(privateKey).length !== 32 || !/^(mailto:|https:\/\/)/.test(subject)) throw new Error("VAPID_KEYS_INVALID");
  return { publicKey, privateKey, subject };
}

/** The « Authorization: vapid » header for one push service, valid 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()) {
  const pub = unb64(keys.publicKey);
  const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)) } });
  const header = b64(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64(signature)}, k=${keys.publicKey}`;
}

/** The encrypted body for one device (a single record, RFC 8188). */
export function encryptPayload(sub: Pick<Subscription, "p256dh" | "auth">, payload: string, salt = randomBytes(16), ephemeral?: ECDH) {
  const uaPublic = unb64(sub.p256dh),
    authSecret = unb64(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("PUSH_KEYS_INVALID");
  const ecdh = ephemeral ?? createECDH("prime256v1");
  if (!ephemeral) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}
