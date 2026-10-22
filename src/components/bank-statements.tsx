"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { financeCopy } from "./finance-copy";
import { financeSectionsCopy } from "./finance-sections-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { FinanceNav } from "./finance-nav";
import { useData } from "./use-api";

/**
 * Wave 17 (N1): Finances > Relevés de compte. The bank's statement of each
 * month is filed as proof (PDF or CSV); its closing balance, entered or read
 * from the CSV, is set beside the platform's cash on the same day. The
 * line-by-line reconciliation is lot 09's: only its place is kept here.
 */
type Statement = {
  id: string;
  account: string;
  month: string;
  filename: string;
  media_type: string;
  closing_balance_cents: number | null;
  balance_source: "none" | "entered" | "csv";
  author: string;
  platform_cents: number;
  gap_cents: number | null;
};
type View = { organization_id: string; can_edit: boolean; today: string; statements: Statement[] };

export function BankStatements({ locale }: { locale: Locale }) {
  const t = financeSectionsCopy[locale],
    f = financeCopy[locale];
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? ({ fr: "Action impossible pour le moment.", nl: "Actie momenteel niet mogelijk.", en: "Action not possible right now." } as const)[locale],
    [locale],
  );
  const { data, error, setError, denied, reload } = useData<View>("/api/finance/statements", failure);
  const [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  const money = (cents: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(cents / 100);
  const monthName = (m: string) => new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-15T12:00:00Z"));
  async function call(run: () => Promise<Response>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await run();
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      setMessage(done);
      return true;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (denied)
    return (
      <main id="main" className="access finance">
        <PageHeader title={t.statementsTitle} />
        <p className="notice">{f.restricted}</p>
      </main>
    );
  return (
    <main id="main" className="access finance statements">
      <PageHeader
        title={t.statementsTitle}
        subtitle={t.statementsIntro}
        actions={
          data?.can_edit && (
            <Button icon="plus" onClick={() => setAdding(true)}>
              {t.upload}
            </Button>
          )
        }
      />
      <FinanceNav locale={locale} current="statements" />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data && (
        <Card title={t.statementsTitle} id="statements">
          {data.statements.length ? (
            <div className="table-scroll" role="region" aria-label={t.statementsTitle} tabIndex={0}>
              <table className="ledger statements-table">
                <thead>
                  <tr>
                    <th scope="col">{t.month}</th>
                    <th scope="col">{t.file}</th>
                    <th scope="col" className="num">
                      {t.closing}
                    </th>
                    <th scope="col" className="num">
                      {t.platform}
                    </th>
                    <th scope="col">{t.gap}</th>
                    {data.can_edit && (
                      <th scope="col">
                        <span className="sr-only">{f.cancel}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.statements.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">
                        {monthName(s.month)}
                        {s.account && <span className="muted statement-account">{s.account}</span>}
                      </th>
                      <td>
                        <a href={`/api/finance/statements/${s.id}`} target="_blank" rel="noopener noreferrer">
                          {s.filename}
                        </a>
                      </td>
                      <td className="num">
                        {s.closing_balance_cents === null ? <span className="muted">{t.unknown}</span> : money(s.closing_balance_cents)}
                        {s.balance_source === "csv" && <span className="muted statement-account">{t.fromCsv}</span>}
                      </td>
                      <td className="num">{money(s.platform_cents)}</td>
                      <td>
                        {s.gap_cents === null ? (
                          <span className="muted">…</span>
                        ) : s.gap_cents === 0 ? (
                          <Badge tone="success" dot>
                            {t.equal}
                          </Badge>
                        ) : (
                          <Badge tone="warning" dot>
                            {(s.gap_cents > 0 ? "+" : "−") + money(Math.abs(s.gap_cents))}
                          </Badge>
                        )}
                      </td>
                      {data.can_edit && (
                        <td>
                          <button
                            type="button"
                            className="icon-button sm"
                            disabled={busy}
                            aria-label={t.removeOf.replace("{month}", monthName(s.month)).replace("{name}", s.filename)}
                            title={t.removeOf.replace("{month}", monthName(s.month)).replace("{name}", s.filename)}
                            onClick={() =>
                              void call(
                                () =>
                                  fetch("/api/finance/statements", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "remove", id: s.id, organizationId: data.organization_id }),
                                  }),
                                t.removed,
                              )
                            }
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={t.none} />
          )}
          <p className="muted">{t.lot09}</p>
        </Card>
      )}
      {adding && data && (
        <Modal title={t.upload} close={() => setAdding(false)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              d.set("organizationId", data.organization_id);
              void call(() => fetch("/api/finance/statements", { method: "POST", body: d }), t.uploaded).then((ok) => ok && setAdding(false));
            }}
          >
            <label htmlFor="statement-month">
              {t.month}
              <input id="statement-month" name="month" type="month" required max={data.today.slice(0, 7)} defaultValue={data.today.slice(0, 7)} />
            </label>
            <label htmlFor="statement-account">
              {t.account}
              <input id="statement-account" name="account" maxLength={80} aria-describedby="statement-account-hint" />
              <span id="statement-account-hint" className="muted">
                {t.accountHint}
              </span>
            </label>
            <label htmlFor="statement-file">
              {t.file}
              <input id="statement-file" name="file" type="file" required accept="application/pdf,.csv,text/csv" aria-describedby="statement-file-hint" />
              <span id="statement-file-hint" className="muted">
                {t.fileHint}
              </span>
            </label>
            <label htmlFor="statement-balance">
              {t.balance}
              <input id="statement-balance" name="balance" inputMode="decimal" pattern="-?[0-9 ]+([.,][0-9]{1,2})?" aria-describedby="statement-balance-hint" />
              <span id="statement-balance-hint" className="muted">
                {t.balanceHint}
              </span>
            </label>
            <div className="actions">
              <Button disabled={busy}>{t.upload}</Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
