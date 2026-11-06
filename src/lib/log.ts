/**
 * B2: one JSON line per event, for the host's logs. Only technical fields:
 * names, counts, durations, codes. A value that looks like an email address
 * or a field named like a person's data is dropped before it is written.
 */
const personal = /^(email|e-mail|name|full_name|phone|address|iban|birth|password|token)$/i;
/** Security (06/11/2026): a field named like a secret, or a value that looks like one, never reaches a log. */
const secretName = /secret|token|password|passwd|api_?key|apikey|authorization|cookie|session|bearer|private|credential|signature/i;
const secretValue = /\b(pfm|pfmop|pfmorg)_[a-z0-9]{8}_|\bwhsec_|\bBearer\s|\bsk-ant-|\b(live|test)_[A-Za-z0-9]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/;
export function cleanFields(fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (personal.test(k) || secretName.test(k)) continue;
    if (typeof v === "string" && (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(v) || secretValue.test(v))) continue;
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
