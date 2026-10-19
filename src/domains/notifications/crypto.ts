import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("MAIL_KEY_MISSING");
  return createHash("sha256")
    .update("pfm-mail-v1:" + secret)
    .digest();
}
export function seal(value: unknown, aad: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const content = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), content]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal<T>(value: string, aad: string): T {
  const [iv, tag, content] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(content), decipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}
