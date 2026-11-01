"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { keepRoles } from "@/domains/access/presidency-schema";
import { presidencyCopy } from "./presidency-copy";
import { errors } from "./access-copy";
import { Button, Card } from "./ui";
import { useData, usePost } from "./use-api";

type View = {
  organization_id: string;
  can: boolean;
  candidates: { user_id: string; name: string; email: string }[];
  pending: { id: string; email: string; valid_from: string; created_at: string; outgoing_role: "member" | "coach" | "none"; message: string; disputed: boolean } | null;
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/** Wave 17 (G1): Settings > Members, for the president only. */
export function PresidencyHandover({ locale }: { locale: Locale }) {
  const t = presidencyCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<View>("/api/presidency", failure);
  const { busy, message, post } = usePost("/api/presidency", reload, setError, failure);
  const [mode, setMode] = useState<"pick" | "other">("pick");
  if (!data?.can) return null;
  const day = (d: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date(d));
  const p = data.pending;
  return (
    <Card title={t.title} labelledBy="settings-presidency" headingId="settings-presidency">
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {p ? (
        <div className="notice">
          <strong>{t.pending}</strong>
          <p>
            {fill(t.pendingText, {
              email: p.email,
              date: day(p.created_at),
              effective: new Date(p.valid_from).getTime() > new Date(p.created_at).getTime() + 60000 ? day(p.valid_from) : t.onAcceptance,
              keep: t.keeps[p.outgoing_role],
            })}
          </p>
          {p.message && <p className="small">{p.message}</p>}
          {p.disputed && <p className="small">{t.disputed}</p>}
          <Button variant="secondary" disabled={busy} onClick={() => void post({ action: "cancel", id: p.id, organizationId: data.organization_id }, t.cancelled)}>
            {t.cancel}
          </Button>
        </div>
      ) : (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const v = (k: string) => String(f.get(k) ?? "").trim();
            void post(
              {
                action: "handOver",
                organizationId: data.organization_id,
                userId: mode === "pick" ? v("userId") || null : null,
                email: mode === "other" ? v("email") || null : null,
                name: v("name"),
                effectiveOn: v("effective") || null,
                keep: v("keep") || "member",
                message: v("message"),
              },
              t.sent,
            );
          }}
        >
          <fieldset className="check-row">
            <legend>{t.who}</legend>
            <label className="check">
              <input type="radio" name="mode" checked={mode === "pick"} onChange={() => setMode("pick")} />
              {t.pick}
            </label>
            <label className="check">
              <input type="radio" name="mode" checked={mode === "other"} onChange={() => setMode("other")} />
              {t.other}
            </label>
          </fieldset>
          {mode === "pick" ? (
            <label>
              {t.pick}
              <select name="userId" required defaultValue="">
                <option value="" disabled>
                  {t.pick}
                </option>
                {data.candidates.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.name} · {c.email}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                {t.email}
                <input name="email" type="email" required maxLength={254} />
              </label>
              <label>
                {t.name}
                <input name="name" maxLength={120} />
              </label>
            </>
          )}
          <label>
            {t.effective}
            <input name="effective" type="date" aria-describedby="presidency-effective-hint" />
            <span id="presidency-effective-hint" className="muted small">
              {t.effectiveHint}
            </span>
          </label>
          <fieldset className="check-row">
            <legend>{t.keep}</legend>
            {keepRoles.map((k) => (
              <label key={k} className="check">
                <input type="radio" name="keep" value={k} defaultChecked={k === "member"} />
                {t.keeps[k]}
              </label>
            ))}
          </fieldset>
          <label>
            {t.message}
            <textarea name="message" maxLength={1000} />
          </label>
          <Button type="submit" disabled={busy}>
            {t.send}
          </Button>
        </form>
      )}
    </Card>
  );
}
