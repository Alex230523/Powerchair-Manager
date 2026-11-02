/**
 * B8: the identifiers of a tax receipt. The Belgian national number (11
 * digits, the last two a modulo 97 check of the first nine, preceded by a 2
 * for those born from 2000) and the company number of the BCE/KBO (10
 * digits starting with 0 or 1, the last two a modulo 97 check of the first
 * eight). Pure.
 */
const digits = (raw: string) => (raw ?? "").replace(/[\s.\-/]/g, "");

export function validNationalNumber(raw: string) {
  const n = digits(raw);
  if (!/^\d{11}$/.test(n) || /^0+$/.test(n)) return false;
  const base = n.slice(0, 9),
    check = Number(n.slice(9));
  return 97 - (Number(base) % 97) === check || 97 - (Number("2" + base) % 97) === check;
}
export const normalizeNationalNumber = (raw: string) => digits(raw);
/** 85.07.30-033.28 */
export function formatNationalNumber(n: string) {
  const d = digits(n);
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}-${d.slice(6, 9)}.${d.slice(9, 11)}`;
}
/** What a screen may show without the dedicated right: the last two digits only. */
export const maskedNationalNumber = (n: string) => `••.••.••-•••.${digits(n).slice(9, 11)}`;

export function validCompanyNumber(raw: string) {
  const n = digits(raw);
  if (!/^[01]\d{9}$/.test(n)) return false;
  return 97 - (Number(n.slice(0, 8)) % 97) === Number(n.slice(8));
}
export const normalizeCompanyNumber = (raw: string) => {
  const d = digits(raw);
  return d.length === 9 ? "0" + d : d;
};
/** 0123.456.749 */
export const formatCompanyNumber = (n: string) => `${n.slice(0, 4)}.${n.slice(4, 7)}.${n.slice(7, 10)}`;
