"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { allocationsView } from "@/domains/finance/allocations";
import { allocationPurposes, allocationSources } from "@/domains/finance/allocations-schema";
import { errors } from "./access-copy";
import { reservedCopy, fill } from "./reserved-funds-copy";
import { useData } from "./use-api";
import { cssVars } from "./css-vars";
import { FinanceNav } from "./finance-nav";
import { Modal } from "./modal";
import { Badge, Card, EmptyState, KpiCard, PageHeader } from "./ui";

/**
 * 9, part 1: the cash in three figures (total, reserved, available) with a
 * stacked bar and its legend in words; the « Fonds réservés » tab, one line
 * per allocation with its linked operations.
 */
type View = Awaited<ReturnType<typeof allocationsView>>;
type Allocation = View["allocations"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const money = (l: Locale, c: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(c / 100);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const message = (l: Locale, code: string) => reservedCopy[l].errors[code] ?? errors[code]?.[l] ?? reservedCopy[l].unavailable;

/** The three figures, the stacked bar and its text; on the finances overview and the president's home. */
export function Treasury({ locale, total, reserved, available, link = true }: { locale: Locale; total: number; reserved: number; available: number; link?: boolean }) {
  const t = reservedCopy[locale];
  const share = total > 0 ? Math.min(100, Math.round((Math.max(0, reserved) * 100) / total)) : 0;
  return (
    <section className="treasury" aria-labelledby="treasury-title">
      <h2 id="treasury-title" className="sr-only">
        {t.barLabel}
      </h2>
      <ul className="stat-row-grid" data-cols="3">
        <li>
          <KpiCard label={t.total} value={money(locale, total)} icon="funding" tone={total < 0 ? "danger" : "primary"} />
        </li>
        <li>
          <KpiCard label={t.reserved} value={money(locale, reserved)} icon="shield" />
        </li>
        <li>
          <KpiCard label={t.available} value={money(locale, available)} description={t.availableHint} icon="check" tone={available < 0 ? "danger" : "success"} />
        </li>
      </ul>
      <div className="treasury-bar" aria-hidden="true">
        <span className="treasury-reserved" style={cssVars({ value: share })} />
      </div>
      <p className="treasury-legend">
        {fill(t.barText, { reserved: money(locale, reserved), available: money(locale, available), total: money(locale, total) })}
        {link && (
          <>
            {" "}
            <Link href={`/${locale}/funding/reserved`}>{t.seeReserved}</Link>
          </>
        )}
      </p>
    </section>
  );
}

const post = async (body: unknown) => {
  const r = await fetch("/api/finance/allocations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const v = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, code: (v.error as string) ?? "" };
};

export function ReservedFunds({ locale }: { locale: Locale }) {
  const t = reservedCopy[locale];
  const failure = useCallback((code: string) => message(locale, code), [locale]);
  const { data, error, reload } = useData<View>("/api/finance/allocations", failure);
  const [editing, setEditing] = useState<Allocation | "new" | null>(null),
    [status, setStatus] = useState("");
  async function act(body: Record<string, unknown>) {
    if (!data) return;
    const r = await post({ ...body, organizationId: data.organization_id });
    setStatus(r.ok ? t.saved : message(locale, r.code));
    if (r.ok) await reload();
    return r.ok;
  }
  return (
    <main id="main" className="access finance reserved-funds">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          data?.can.edit ? (
            <button type="button" className="button" onClick={() => setEditing("new")}>
              {t.add}
            </button>
          ) : null
        }
      />
      <FinanceNav locale={locale} current="reserved" />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      <p role="status" className="muted">
        {status}
      </p>
      {data && (
        <>
          <p>
            <a className="button secondary sm" href={`/api/finance/allocations?export=csv&locale=${locale}`} download>
              {t.export}
            </a>
          </p>
          {data.allocations.length ? (
            <ul className="allocation-list">
              {data.allocations.map((a) => (
                <li key={a.id}>
                  <AllocationCard locale={locale} a={a} data={data} act={act} edit={() => setEditing(a)} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.none} />
          )}
          {editing && (
            <AllocationForm
              locale={locale}
              data={data}
              a={editing === "new" ? null : editing}
              close={() => setEditing(null)}
              save={async (body) => {
                if (await act(body)) setEditing(null);
              }}
            />
          )}
        </>
      )}
    </main>
  );
}

function AllocationCard({ locale, a, data, act, edit }: { locale: Locale; a: Allocation; data: View; act: (b: Record<string, unknown>) => Promise<boolean | undefined>; edit: () => void }) {
  const t = reservedCopy[locale];
  const [choice, setChoice] = useState("");
  const days = a.use_by ? Math.round((Date.parse(a.use_by + "T12:00:00Z") - Date.parse(data.today + "T12:00:00Z")) / 86400000) : null;
  return (
    <Card
      title={a.label}
      labelledBy={`alloc-${a.id}`}
      headingId={`alloc-${a.id}`}
      actions={
        data.can.edit ? (
          <>
            <button type="button" className="text-button" onClick={edit}>
              {t.edit}
              <span className="sr-only"> : {a.label}</span>
            </button>
            <button type="button" className="text-button" onClick={() => void act({ action: "close", id: a.id, closed: !a.closed_at })}>
              {a.closed_at ? t.reopen : t.close}
              <span className="sr-only"> : {a.label}</span>
            </button>
          </>
        ) : null
      }
    >
      <p className="muted">
        {t.sources[a.source_kind]} · {a.origin || t.sources[a.source_kind]} · {t.purposes[a.purpose]}
        {a.closed_at && (
          <>
            {" "}
            <Badge tone="neutral">{t.closedBadge}</Badge>
          </>
        )}
        {!a.closed_at && days !== null && days <= 60 && a.state.remaining > 0 && (
          <>
            {" "}
            <Badge tone="warning">{fill(t.late, { n: Math.max(0, days) })}</Badge>
          </>
        )}
      </p>
      <dl className="allocation-figures">
        <div>
          <dt>{t.amount}</dt>
          <dd>{money(locale, a.amount_cents)}</dd>
        </div>
        <div>
          <dt>{t.received}</dt>
          <dd>{money(locale, a.state.received)}</dd>
        </div>
        <div>
          <dt>{t.spent}</dt>
          <dd>{money(locale, a.state.spent)}</dd>
        </div>
        <div>
          <dt>{t.remaining}</dt>
          <dd>
            <strong>{money(locale, a.state.remaining)}</strong>
          </dd>
        </div>
        {a.state.toReceive > 0 && (
          <div>
            <dt>{t.toReceive}</dt>
            <dd>{money(locale, a.state.toReceive)}</dd>
          </div>
        )}
        <div>
          <dt>{t.useBy}</dt>
          <dd>{a.use_by ? day(locale, a.use_by) : t.noDate}</dd>
        </div>
        {a.proof && (
          <div>
            <dt>{t.proof}</dt>
            <dd>{a.proof}</dd>
          </div>
        )}
      </dl>
      <h3>{t.operations}</h3>
      {a.operations.length ? (
        <ul className="plain-list">
          {a.operations.map((o) => (
            <li key={o.id}>
              {day(locale, o.occurred_on)} · {o.label} · {o.direction === "in" ? t.in : t.out} {money(locale, o.amount_cents)}
              {data.can.edit && (
                <>
                  {" "}
                  <button type="button" className="text-button" onClick={() => void act({ action: "link", transactionId: o.id, allocationId: null })}>
                    {t.detach}
                    <span className="sr-only"> : {o.label}</span>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noOperation}</p>
      )}
      {data.can.edit && !a.closed_at && data.free.length > 0 && (
        <form
          className="allocation-attach"
          onSubmit={(e) => {
            e.preventDefault();
            if (choice) void act({ action: "link", transactionId: choice, allocationId: a.id }).then(() => setChoice(""));
          }}
        >
          <label htmlFor={`attach-${a.id}`}>{t.attach}</label>
          <select id={`attach-${a.id}`} required value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{t.attachChoose}</option>
            {data.free.map((o) => (
              <option key={o.id} value={o.id}>
                {day(locale, o.occurred_on)} · {o.label} · {o.direction === "in" ? t.in : t.out} {money(locale, o.amount_cents)}
              </option>
            ))}
          </select>
          <button type="submit" className="button secondary sm">
            {t.attachButton}
          </button>
        </form>
      )}
    </Card>
  );
}

function AllocationForm({ locale, data, a, close, save }: { locale: Locale; data: View; a: Allocation | null; close: () => void; save: (b: Record<string, unknown>) => Promise<void> }) {
  const t = reservedCopy[locale];
  const [kind, setKind] = useState<string>(a?.source_kind ?? "grant");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    void save({
      action: a ? "update" : "create",
      ...(a ? { id: a.id } : {}),
      sourceKind: kind,
      grantId: kind === "grant" ? v("grant") || null : null,
      partnerId: kind === "sponsor" ? v("partner") || null : null,
      potId: kind === "fundraising" ? v("pot") || null : null,
      sourceLabel: v("sourceLabel"),
      purpose: v("purpose"),
      label: v("label"),
      amountCents: Math.round(Number(v("amount").replace(",", ".")) * 100),
      useBy: v("useBy") || null,
      proof: v("proof"),
    });
  }
  const pick = (name: string, label: string, items: { id: string; name: string }[], value: string | null) => (
    <label htmlFor={`alloc-${name}`}>
      {label}
      <select id={`alloc-${name}`} name={name} defaultValue={value ?? ""}>
        <option value="">{t.fieldAllocationNone}</option>
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal title={a ? a.label : t.add} close={close}>
      <form className="finance-form" onSubmit={submit}>
        <label htmlFor="alloc-kind">
          {t.sourceKind}
          <select id="alloc-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {allocationSources.map((s) => (
              <option key={s} value={s}>
                {t.sources[s]}
              </option>
            ))}
          </select>
        </label>
        {kind === "grant" && pick("grant", t.grant, data.sources.grants, a?.grant_id ?? null)}
        {kind === "sponsor" && pick("partner", t.partner, data.sources.partners, a?.partner_id ?? null)}
        {kind === "fundraising" && pick("pot", t.pot, data.sources.pots, a?.pot_id ?? null)}
        {(kind === "donation" || kind === "other") && (
          <label htmlFor="alloc-source">
            {t.sourceLabel}
            <input id="alloc-source" name="sourceLabel" maxLength={160} defaultValue={a?.source_label ?? ""} />
          </label>
        )}
        <label htmlFor="alloc-purpose">
          {t.purpose}
          <select id="alloc-purpose" name="purpose" defaultValue={a?.purpose ?? "equipment"}>
            {allocationPurposes.map((x) => (
              <option key={x} value={x}>
                {t.purposes[x]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="alloc-label">
          {t.label}
          <input id="alloc-label" name="label" required minLength={2} maxLength={160} placeholder={t.labelHint} defaultValue={a?.label ?? ""} />
        </label>
        <label htmlFor="alloc-amount">
          {t.amount}
          <input id="alloc-amount" name="amount" required inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" defaultValue={a ? String(a.amount_cents / 100).replace(".", ",") : ""} />
        </label>
        <label htmlFor="alloc-useby">
          {t.useBy}
          <input id="alloc-useby" name="useBy" type="date" defaultValue={a?.use_by ?? ""} />
        </label>
        <label htmlFor="alloc-proof">
          {t.proof}
          <input id="alloc-proof" name="proof" maxLength={300} defaultValue={a?.proof ?? ""} />
        </label>
        <p className="actions">
          <button type="button" className="button secondary" onClick={close}>
            {t.cancel}
          </button>
          <button type="submit" className="button">
            {t.save}
          </button>
        </p>
      </form>
    </Modal>
  );
}
