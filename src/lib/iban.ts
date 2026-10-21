/** IBAN check: country, check digits and the mod-97 rule (ISO 13616); spaces ignored. */
export function validIban(raw: string) {
  const v = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const moved = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}
/** "BE68539007547034" as "BE68 5390 0754 7034". */
export const formatIban = (v: string) => v.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
