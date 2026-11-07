/**
 * Security (07/11/2026), data leaking to an AI. What a model receives from
 * the platform (the console's assistant through the Claude API, an MCP
 * client of an operator or of a club) leaves the platform: it is read and
 * kept by the model's provider, outside the European Union. So it carries the
 * facts a question needs, never the means to reach or identify someone
 * further: e-mail addresses, phone numbers, bank accounts, national numbers,
 * card numbers, birth dates and street addresses are taken out, as fields and
 * inside free text (a ticket's message). Identifiers (uuid) stay as they are:
 * the tools need them.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const patterns: [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]"],
  // An IBAN: two letters, two check digits, 10 to 30 letters or digits (spaces allowed).
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g, "[IBAN]"],
  // A Belgian national number (YY.MM.DD-XXX.XX, or its eleven digits).
  [/\b\d{2}[.\s]?\d{2}[.\s]?\d{2}[-.\s]?\d{3}[.\s]?\d{2}\b/g, "[numéro national]"],
  // A card number: 13 to 19 digits, in groups or not.
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[carte]"],
  // A phone number: international (+32, 0032...) or national (0 then 8 or 9 more digits).
  [/(?:\+|\b00)\d{2}(?:[\s./-]?\d){8,12}\b/g, "[téléphone]"],
  [/\b0\d(?:[\s./-]?\d){7,8}\b/g, "[téléphone]"],
];
/** Free text with its identifying details masked, its uuids untouched. */
export function redactText(text: string) {
  const ids: string[] = [];
  let s = text.replace(UUID, (m) => `\u0000${ids.push(m) - 1}\u0000`);
  for (const [re, label] of patterns) s = s.replace(re, label);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => ids[Number(i)]);
}
/** Fields that are never sent to a model, whatever their value. */
export const withheldField = (key: string) => /(^|_)(e?mail|email|phone|mobile|tel|iban|bic|national|birth|birth_date|address|street|postal|token|secret|password|hash|sealed|ciphertext)(_|$)|^(email|phone|iban|address|birthDate|nationalNumber)$/i.test(key);
/** A tool's result, ready for a model: withheld fields out, free text masked. */
export function redactForModel<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactForModel(v)) as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!withheldField(k)) out[k] = redactForModel(v);
    return out as T;
  }
  return value;
}
