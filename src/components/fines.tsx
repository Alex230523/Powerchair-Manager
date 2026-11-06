"use client";
import { brusselsToday } from "./chair-sheet";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { finesView } from "@/domains/fines/service";
import { fineKinds, type FineKind } from "@/domains/fines/schema";
import { finesCopy } from "./fines-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState } from "./ui";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";

type View = Awaited<ReturnType<typeof finesView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const money = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const tone = { open: "warning", paid: "success", cancelled: "neutral" } as const;

/** Point 10 (règlement BPCF 2025): the fines, on the federation's affiliations page and the club's. */
export function Fines({ locale }: { locale: Locale }) {
  const t = finesCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, denied, reload } = useData<View>("/api/fines", failure);
  const { busy, message, post } = usePost("/api/fines", reload, setError, failure);
  const [adding, setAdding] = useState(false),
    [kind, setKind] = useState<FineKind>("late");
  if (denied || !data) return error && !denied ? <p role="alert">{error}</p> : null;
  const federation = data.mode === "federation";
  const send = (body: Record<string, unknown>) => post({ ...body, organizationId: data.organization_id }, t.saved);
  return (
    <Card
      title={t.title}
      id="fines"
      actions={
        data.canManage && data.clubs.length > 0 ? (
          <Button icon="plus" variant="secondary" onClick={() => setAdding(true)}>
            {t.add}
          </Button>
        ) : undefined
      }
    >
      <p className="muted">{federation ? t.intro : t.clubIntro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.open > 0 && <p><Badge tone="warning">{fill(t.open, { amount: money(locale, data.open) })}</Badge></p>}
      {data.fines.length ? (
        <ul className="profile-list fines-list">
          {data.fines.map((f) => (
            <li key={f.id} data-state={f.state}>
              <div>
                <strong>{federation ? fill(t.of, { what: t.kinds[f.kind as FineKind], club: f.club }) : t.kinds[f.kind as FineKind]}</strong>
                <p className="muted small">
                  {[day(locale, f.issued_on), money(locale, f.amount_cents), f.reason].filter(Boolean).join(" · ")}
                </p>
                <Badge tone={tone[f.state]}>{t.states[f.state]}</Badge>
              </div>
              {data.canManage && f.state !== "cancelled" && (
                <span className="fine-actions">
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "paid", id: f.id, paid: f.state !== "paid" })}>
                    {f.state === "paid" ? t.markOpen : t.markPaid}
                    <span className="sr-only"> : {f.club}</span>
                  </Button>
                  {f.state === "open" && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void send({ action: "cancel", id: f.id })}>
                      {t.cancelFine}
                      <span className="sr-only"> : {f.club}</span>
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.none} />
      )}
      {adding && (
        <Modal title={t.add} close={() => setAdding(false)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const euros = Number(String(f.get("amount") ?? "").replace(",", "."));
              void send({ action: "create", clubId: f.get("club"), kind, amountCents: Math.round(euros * 100), issuedOn: f.get("issuedOn"), reason: f.get("reason") ?? "" }).then((ok) => ok && setAdding(false));
            }}
          >
            <label>
              {t.club}
              <select name="club" required defaultValue="">
                <option value="" disabled>
                  {t.club}
                </option>
                {data.clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.kind}
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as FineKind)}>
                {fineKinds.map((k) => (
                  <option key={k} value={k}>
                    {t.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                {t.amount}
                <input key={kind} name="amount" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={data.defaults[kind] !== null ? (data.defaults[kind]! / 100).toFixed(2) : ""} />
              </label>
              <label>
                {t.issuedOn}
                <input name="issuedOn" type="date" required defaultValue={brusselsToday()} />
              </label>
            </div>
            <label>
              {t.reason}
              <textarea name="reason" rows={2} maxLength={1000} />
            </label>
            <div className="actions">
              <Button disabled={busy}>{t.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
