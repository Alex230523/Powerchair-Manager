/**
 * B1: the Belgian structured communication (« communication structurée »,
 * OGM/VCS): ten digits and a two digit check, the remainder of the ten
 * digits by 97 (97 when it is 0), written +++123/4567/89012+++. And the
 * EPC QR code of a SEPA credit transfer (EPC069-12, version 002).
 */
export function checkDigits(base: string) {
  const r = Number(base) % 97;
  return String(r === 0 ? 97 : r).padStart(2, "0");
}
/** The twelve digits of a number (the database sequence gives it). */
export function referenceFor(n: number) {
  const base = String(n).padStart(10, "0").slice(-10);
  return base + checkDigits(base);
}
export function validReference(digits: string) {
  return /^\d{12}$/.test(digits) && checkDigits(digits.slice(0, 10)) === digits.slice(10) && digits.slice(0, 10) !== "0000000000";
}
/** +++123/4567/89012+++ */
export function formatReference(digits: string) {
  return `+++${digits.slice(0, 3)}/${digits.slice(3, 7)}/${digits.slice(7, 12)}+++`;
}
/**
 * The structured communication found in a bank line's text: written with
 * + or * and slashes, or twelve digits in a row, the check digits right.
 */
export function findReference(text: string): string | null {
  const s = text ?? "";
  const formatted = [...s.matchAll(/[+*]{3}\s*(\d{3})\s*\/\s*(\d{4})\s*\/\s*(\d{5})\s*[+*]{3}/g)].map((m) => m[1] + m[2] + m[3]);
  const plain = [...s.matchAll(/(?<!\d)(\d{3})[\s/.-]?(\d{4})[\s/.-]?(\d{5})(?!\d)/g)].map((m) => m[1] + m[2] + m[3]);
  return [...formatted, ...plain].find(validReference) ?? null;
}

/**
 * The text of an EPC QR code (« QR de virement ») for a banking app: the
 * beneficiary, the IBAN, the amount and the structured communication in the
 * creditor reference line. It does not prove any payment.
 */
export function epcPayload(t: { name: string; iban: string; bic?: string | null; cents: number; reference: string }) {
  const name = t.name
    .normalize("NFC")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 70);
  const iban = t.iban.replace(/\s+/g, "").toUpperCase();
  if (!name || !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) throw new Error("EPC_INVALID");
  if (!Number.isInteger(t.cents) || t.cents < 1 || t.cents > 99999999999) throw new Error("EPC_INVALID");
  const amount = `EUR${Math.floor(t.cents / 100)}.${String(t.cents % 100).padStart(2, "0")}`;
  return ["BCD", "002", "1", "SCT", (t.bic ?? "").replace(/\s+/g, "").toUpperCase(), name, iban, amount, "", t.reference, ""].join("\n");
}
