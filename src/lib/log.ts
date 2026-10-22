/**
 * B2: one JSON line per event, for the host's logs. Only technical fields:
 * names, counts, durations, codes. A value that looks like an email address
 * or a field named like a person's data is dropped before it is written.
 */
const personal = /^(email|e-mail|name|full_name|phone|address|iban|birth|password|token)$/i;
export function cleanFields(fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (personal.test(k)) continue;
    if (typeof v === "string" && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)) continue;
    out[k] = v;
  }
  return out;
}
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...cleanFields(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
