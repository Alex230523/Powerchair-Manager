"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { clubRequestsView } from "@/domains/independent/service";
import type { Discount } from "@/domains/billing/service";
import { formatCents } from "@/domains/dashboard/summary";
import { Modal } from "./modal";
import { errors } from "./access-copy";
import { independentCopy } from "./independent-copy";
import { Badge, Button, Card, Field } from "./ui";
import { useData, usePost } from "./use-api";

type Requests = Awaited<ReturnType<typeof clubRequestsView>>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));

/** 12/11/2026: the requests of clubs without a federation, in the console's Organisations tab. */
export function ClubRequestsCard({ locale, day, open }: { locale: Locale; day: (iso: string) => string; open: (id: string) => void }) {
  const t = independentCopy[locale].requests;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, reload } = useData<Requests>("/api/console/club-requests", failure);
  const { busy, message, post } = usePost("/api/console/club-requests", reload, setError, failure);
  const [approving, setApproving] = useState<Requests["requests"][number] | null>(null);
  const [refusing, setRefusing] = useState<Requests["requests"][number] | null>(null);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const label = { pending: t.pending, approved: t.approved, refused: t.refused };
  const pending = data.requests.filter((r) => r.state === "pending").length;
  return (
    <Card title={t.title} subtitle={pending ? `${pending} · ${t.pending.toLowerCase()}` : undefined} className="club-requests">
      <p className="muted">{t.intro}</p>
      {!data.canDecide && <p className="muted small">{t.readOnly}</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.requests.length ? (
        <ul className="plain-list club-request-list">
          {data.requests.map((r) => (
            <li key={r.id} className="club-request">
              <p>
                <strong>{r.club_name}</strong> · {t.countries[r.country_code as keyof typeof t.countries] ?? r.country_code}
                {r.city ? ` · ${r.city}` : ""} <Badge tone={r.state === "pending" ? "warning" : r.state === "approved" ? "success" : "neutral"}>{label[r.state]}</Badge>
              </p>
              <p className="muted small">
                {fill(t.from, { name: r.president_name, email: r.president_email })} · {fill(t.sentOn, { day: day(r.confirmed_at) })}
              </p>
              {r.discount_code && (
                <p className="small">
                  {fill(t.code, { code: r.discount_code })} <Badge tone={r.discount_usable ? "success" : "warning"}>{r.discount_usable ? t.codeUsable : t.codeUnusable}</Badge>
                </p>
              )}
              {r.message && <p className="pre-line club-request-message">{r.message}</p>}
              {r.decided_at && <p className="muted small">{fill(t.decided, { state: label[r.state], day: day(r.decided_at), name: r.decided_by_name ?? "" })}</p>}
              {r.state === "refused" && r.decision_reason && <p className="pre-line small">{r.decision_reason}</p>}
              <p className="actions">
                {r.state === "pending" && data.canDecide && (
                  <>
                    <Button type="button" size="sm" icon="check" disabled={busy} onClick={() => setApproving(r)}>
                      {t.approve}
                      <span className="sr-only"> : {r.club_name}</span>
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setRefusing(r)}>
                      {t.refuse}
                      <span className="sr-only"> : {r.club_name}</span>
                    </Button>
                  </>
                )}
                {r.organization_id && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => open(r.organization_id!)}>
                    {t.open}
                    <span className="sr-only"> : {r.club_name}</span>
                  </Button>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.none}</p>
      )}
      {approving && (
        <Modal title={t.approve} close={() => setApproving(null)}>
          <p>{fill(t.approveConfirm, { club: approving.club_name, email: approving.president_email })}</p>
          <p className="actions">
            <Button type="button" disabled={busy} onClick={() => void post({ action: "approve", id: approving.id }, t.approved_).then((ok) => ok && setApproving(null))}>
              {t.approve}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setApproving(null)}>
              {cancel[locale]}
            </Button>
          </p>
        </Modal>
      )}
      {refusing && (
        <Modal title={t.refuse} close={() => setRefusing(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "refuse", id: refusing.id, reason: String(new FormData(e.currentTarget).get("reason") ?? "") }, t.refused_).then((ok) => ok && setRefusing(null));
            }}
          >
            <p>
              <strong>{refusing.club_name}</strong>
            </p>
            <Field id="refuse-reason" label={t.reason} help={t.reasonHelp} required>
              <textarea id="refuse-reason" name="reason" required minLength={3} maxLength={500} rows={4} aria-describedby="refuse-reason-help" />
            </Field>
            <p className="actions">
              <Button disabled={busy}>{t.refuseSend}</Button>
              <Button type="button" variant="secondary" onClick={() => setRefusing(null)}>
                {cancel[locale]}
              </Button>
            </p>
          </form>
        </Modal>
      )}
    </Card>
  );
}
const cancel: Record<Locale, string> = { fr: "Annuler", nl: "Annuleren", en: "Cancel" };

/** 12/11/2026: the discount codes, in the console's Billing tab (owner and finance write). */
export function DiscountsCard({ locale, discounts, canBill, busy, post, day }: { locale: Locale; discounts: Discount[]; canBill: boolean; busy: boolean; post: (body: Record<string, unknown>, done: string) => Promise<boolean>; day: (iso: string) => string }) {
  const t = independentCopy[locale].discounts;
  const [editing, setEditing] = useState<Discount | "new" | null>(null);
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const money = (c: number) => formatCents(c, locale);
  const d = editing === "new" ? null : editing;
  const cycles = (n: number | null) => (n === null ? t.cyclesAll : n === 1 ? t.cyclesOne : fill(t.cyclesN, { n }));
  const start = (x: Discount | "new") => {
    setKind(x !== "new" && x.amount_cents !== null ? "amount" : "percent");
    setEditing(x);
  };
  return (
    <Card
      title={t.title}
      actions={
        canBill ? (
          <Button type="button" icon="plus" size="sm" onClick={() => start("new")}>
            {t.add}
          </Button>
        ) : undefined
      }
    >
      <p className="muted">{t.intro}</p>
      {discounts.length ? (
        <ul className="plain-list">
          {discounts.map((x) => (
            <li key={x.id} className="console-plan">
              <span>
                <code>{x.code}</code> · {x.percent !== null ? `-${x.percent} %` : `-${money(x.amount_cents ?? 0)}`} · {cycles(x.cycles).toLowerCase()} · {fill(t.used, { n: x.uses })}
                {x.max_uses !== null ? ` / ${x.max_uses}` : ""}
                {x.valid_until ? ` · ${t.validUntil.replace(/ \(.*\)$/, "")} ${day(x.valid_until)}` : ""}
                {x.note ? ` · ${x.note}` : ""} <Badge tone={x.usable ? "success" : "neutral"}>{!x.active ? t.inactive : x.usable ? t.usable : t.unusable}</Badge>
              </span>
              {canBill && (
                <Button type="button" variant="secondary" size="sm" onClick={() => start(x)}>
                  {t.edit}
                  <span className="sr-only"> : {x.code}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.none}</p>
      )}
      {editing && (
        <Modal title={d ? t.edit : t.add} close={() => setEditing(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const n = (k: string) => (String(f.get(k) ?? "").trim() === "" ? null : Number(String(f.get(k)).replace(",", ".")));
              const c = String(f.get("cycles"));
              void post(
                {
                  action: "discount",
                  id: d?.id ?? null,
                  code: String(f.get("code") ?? "").trim().toUpperCase(),
                  percent: kind === "percent" ? n("value") : null,
                  amountCents: kind === "amount" ? Math.round((n("value") ?? 0) * 100) : null,
                  cycles: c === "all" ? null : Number(c),
                  validUntil: String(f.get("validUntil") ?? "") || null,
                  maxUses: n("maxUses"),
                  note: String(f.get("note") ?? ""),
                  active: f.get("active") === "on",
                },
                t.saved,
              ).then((ok) => ok && setEditing(null));
            }}
          >
            <Field id="discount-code" label={t.code} help={t.codeHelp} required>
              <input id="discount-code" name="code" required pattern="[A-Za-z0-9\-]{4,30}" maxLength={30} autoCapitalize="characters" spellCheck={false} defaultValue={d?.code ?? ""} aria-describedby="discount-code-help" />
            </Field>
            <fieldset className="check-row">
              <legend>{t.kind}</legend>
              <label className="check">
                <input type="radio" name="kind" checked={kind === "percent"} onChange={() => setKind("percent")} /> {t.percent}
              </label>
              <label className="check">
                <input type="radio" name="kind" checked={kind === "amount"} onChange={() => setKind("amount")} /> {t.amount}
              </label>
            </fieldset>
            <div className="form-grid">
              <Field id="discount-value" label={`${t.value} (${kind === "percent" ? "%" : "€"})`} required>
                {kind === "percent" ? (
                  <input key="percent" id="discount-value" name="value" type="number" min={1} max={100} required defaultValue={d?.percent ?? ""} />
                ) : (
                  <input key="amount" id="discount-value" name="value" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={d?.amount_cents ? (d.amount_cents / 100).toFixed(2) : ""} />
                )}
              </Field>
              <Field id="discount-cycles" label={t.cycles}>
                <select id="discount-cycles" name="cycles" defaultValue={d ? (d.cycles === null ? "all" : String(d.cycles)) : "1"}>
                  <option value="1">{t.cyclesOne}</option>
                  {[2, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      {fill(t.cyclesN, { n })}
                    </option>
                  ))}
                  <option value="all">{t.cyclesAll}</option>
                </select>
              </Field>
              <Field id="discount-until" label={t.validUntil}>
                <input id="discount-until" name="validUntil" type="date" defaultValue={d?.valid_until ?? ""} />
              </Field>
              <Field id="discount-max" label={t.maxUses} help={t.maxUsesHelp}>
                <input id="discount-max" name="maxUses" type="number" min={1} max={10000} defaultValue={d?.max_uses ?? ""} aria-describedby="discount-max-help" />
              </Field>
            </div>
            <Field id="discount-note" label={t.note}>
              <input id="discount-note" name="note" maxLength={300} defaultValue={d?.note ?? ""} />
            </Field>
            <label className="check" htmlFor="discount-active">
              <input id="discount-active" name="active" type="checkbox" defaultChecked={d?.active ?? true} /> {t.active}
            </label>
            <p className="actions">
              <Button disabled={busy}>{t.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                {cancel[locale]}
              </Button>
            </p>
          </form>
        </Modal>
      )}
    </Card>
  );
}
