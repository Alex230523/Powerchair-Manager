"use client";
import { useCallback, useMemo, useState } from "react";
import type { Locale } from "@/lib/locale";
import { formatIban } from "@/lib/iban";
import { parseCsv, parseXlsx, type Grid } from "@/lib/spreadsheet";
import { detectBank, detectFormat, guessColumns, linesFromGrid, parseCamt, parseCoda, usable, type Bank, type ColumnMap, type Format, type StatementLine } from "@/domains/bank/parse";
import { spread, type Suggestion } from "@/domains/bank/match";
import { formatReference } from "@/domains/bank/reference";
import { bankCopy, type BankCopy } from "./bank-copy";
import { financeCopy } from "./finance-copy";
import { errors } from "./access-copy";
import { fill } from "./fleet-copy";
import { Badge, Button, Card, EmptyState } from "./ui";
import { Modal } from "./modal";
import { useData } from "./use-api";

/**
 * B1 (lot 09): in « Relevés de compte », the club's bank accounts, the
 * import of a statement (read on the device, previewed, then sent), the
 * lines left to reconcile with their ranked suggestions, the reconciled
 * ones (cancelled only with a reason) and the families' credits.
 */
type Account = { id: string; label: string; iban: string; bic: string; holder: string; for_dues: boolean; archived: boolean };
type Allocation = { id: string; target: string; target_id: string | null; amount_cents: number; automatic: boolean; label: string };
type Line = {
  id: string;
  bank_account_id: string | null;
  booked_on: string;
  amount_cents: number;
  counterparty: string;
  counterparty_iban: string;
  communication: string;
  bank_ref: string;
  reference: string | null;
  status: "new" | "matched" | "ignored";
  note: string;
  allocations: Allocation[];
};
type Receivable = { id: string; profileId: string; person: string; category: string; season: string; remaining: number };
type Named = { id: string; name: string };
type View = {
  organization_id: string;
  can: { manage: boolean };
  today: string;
  accounts: Account[];
  lines: Line[];
  suggestions: Record<string, Suggestion[]>;
  receivables: Receivable[];
  credits: { profile_id: string; full_name: string; cents: number }[];
  imports: { id: string; format: string; bank: string; filename: string; lines: number; created: number; matched: number; imported_at: string; author: string | null }[];
  mappings: Record<string, ColumnMap>;
  targets: { pots: Named[]; partners: Named[]; grants: Named[]; people: Named[] };
};
type Target = "receivable" | "credit" | "pot" | "partner" | "grant" | "other";
type Part = { target: Target; targetId: string; amount: string; category: string };
type Ctx = {
  t: BankCopy;
  f: (typeof financeCopy)[Locale];
  data: View;
  busy: boolean;
  send: <T = Record<string, unknown>>(body: Record<string, unknown>, done: string | ((out: T) => string)) => Promise<T | null>;
  money: (cents: number) => string;
  day: (d: string) => string;
  /** The last refusal: a dialog shows it itself (the page's message is hidden behind it). */
  error: string;
};
const left = (l: Line) => Math.abs(l.amount_cents) - l.allocations.reduce((n, a) => n + a.amount_cents, 0);
const categories = ["dues", "subsidy", "sponsor", "donation", "event", "equipment", "venue", "travel", "competition", "insurance", "affiliation", "other"] as const;

const toCents = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const asInput = (cents: number) => (cents / 100).toFixed(2);

/** A statement file as text: UTF-8, or the Windows encoding many Belgian banks still write. */
async function textOf(file: File) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export function BankReconcile({ locale }: { locale: Locale }) {
  const t = bankCopy[locale],
    f = financeCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unreadable, [t, locale]);
  const { data, error, setError, denied, reload } = useData<View>("/api/bank", failure);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [account, setAccount] = useState<Account | "new" | null>(null),
    [importing, setImporting] = useState(false),
    [allocating, setAllocating] = useState<{ line: Line; parts: Part[] } | null>(null),
    [cancelling, setCancelling] = useState<Allocation | null>(null),
    [credit, setCredit] = useState<{ kind: "apply" | "refund"; profileId: string; name: string; cents: number } | null>(null);
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  const money = (cents: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(cents / 100);
  const day = (d: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

  /** Sends one command; the view reloads after it. Returns the answer, or null when it failed. */
  async function send<T = Record<string, unknown>>(body: Record<string, unknown>, done: string | ((out: T) => string)): Promise<T | null> {
    if (!data) return null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data.organization_id }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error);
      if (body.action !== "preview") await reload();
      setMessage(typeof done === "string" ? done : done(out as T));
      return out as T;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (denied) return <p className="notice">{t.restricted}</p>;
  if (!data) return error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>;
  const open = data.lines.filter((l) => l.status === "new"),
    closed = data.lines.filter((l) => l.status !== "new");
  const receivable = (id: string) => data.receivables.find((r) => r.id === id);
  const lineLabel = (l: Line) => ({ date: day(l.booked_on), amount: money(l.amount_cents) });
  const ctx: Ctx = { t, f, data, busy, send, money, day, error };
  const dialog = !!(account || importing || allocating || cancelling || credit);

  /** A suggestion opens the split already filled: the receivable, then the surplus as a credit. */
  function fromSuggestion(l: Line, id: string) {
    const r = receivable(id);
    if (!r) return;
    const s = spread(left(l), [{ id: r.id, remaining: r.remaining }]);
    const parts: Part[] = s.parts.map((p) => ({ target: "receivable", targetId: p.id, amount: asInput(p.amount), category: "dues" }));
    if (s.credit > 0) parts.push({ target: "credit", targetId: r.profileId, amount: asInput(s.credit), category: "dues" });
    setAllocating({ line: l, parts });
  }

  return (
    <div className="bank">
      {error && !dialog && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>

      <Card
        title={t.accounts}
        subtitle={t.accountsIntro}
        id="bank-accounts"
        actions={
          data.can.manage && (
            <Button icon="plus" variant="secondary" onClick={() => setAccount("new")}>
              {t.addAccount}
            </Button>
          )
        }
      >
        {data.accounts.length ? (
          <ul className="bank-accounts">
            {data.accounts.map((a) => (
              <li key={a.id} data-archived={a.archived || undefined}>
                <div>
                  <strong>{a.label}</strong> {a.for_dues && <Badge tone="success">{t.forDuesBadge}</Badge>} {a.archived && <Badge>{t.archived}</Badge>}
                  <p className="muted small bank-iban">{formatIban(a.iban)}</p>
                </div>
                {data.can.manage && (
                  <div className="actions">
                    <Button size="sm" variant="secondary" aria-label={fill(t.editAccountOf, { name: a.label })} onClick={() => setAccount(a)}>
                      {t.edit}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      aria-label={fill(a.archived ? t.restoreOf : t.archiveOf, { name: a.label })}
                      onClick={() => void send({ action: "archiveAccount", id: a.id, archived: !a.archived }, t.saved)}
                    >
                      {a.archived ? t.restore : t.archive}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t.noAccount} />
        )}
      </Card>

      <Card
        title={t.toReconcile}
        subtitle={t.toReconcileIntro}
        id="bank-open"
        actions={
          data.can.manage && (
            <Button icon="document" onClick={() => setImporting(true)}>
              {t.import}
            </Button>
          )
        }
      >
        {open.length ? (
          <ul className="bank-lines">
            {open.map((l) => {
              const s = data.suggestions[l.id] ?? [];
              return (
                <li key={l.id} className="bank-line">
                  <div className="bank-line-head">
                    <span className="muted">{day(l.booked_on)}</span>
                    <strong className={l.amount_cents < 0 ? "bank-out" : "bank-in"}>{money(l.amount_cents)}</strong>
                    <span>{l.counterparty || "…"}</span>
                  </div>
                  {l.communication && <p className="small bank-communication">{l.communication}</p>}
                  {l.allocations.length > 0 && <p className="small muted">{fill(t.left, { amount: money(left(l)) })}</p>}
                  {s.length > 0 && (
                    <div className="bank-suggestions" role="group" aria-label={t.suggestions}>
                      {s.map((x) => {
                        const r = receivable(x.id);
                        if (!r) return null;
                        return (
                          <Button key={x.id} size="sm" variant="secondary" disabled={!data.can.manage || busy} onClick={() => fromSuggestion(l, x.id)}>
                            {fill(t.suggestionOf, { name: `${r.person} · ${f.categories[r.category] ?? r.category}`, left: money(r.remaining) })}
                            <span className="muted"> · {x.reasons.map((k) => t.reasons[k]).join(", ")}</span>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                  {data.can.manage && (
                    <div className="actions">
                      <Button
                        size="sm"
                        disabled={busy}
                        aria-label={fill(t.allocateOf, lineLabel(l))}
                        onClick={() => setAllocating({ line: l, parts: [{ target: l.amount_cents > 0 ? "receivable" : "other", targetId: "", amount: asInput(left(l)), category: "other" }] })}
                      >
                        {t.allocate}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy || l.allocations.length > 0} aria-label={fill(t.ignoreOf, lineLabel(l))} onClick={() => void send({ action: "ignore", lineId: l.id, ignored: true }, t.ignoredDone)}>
                        {t.ignore}
                      </Button>
                    </div>
                  )}
                  {l.allocations.length > 0 && <Allocations ctx={ctx} line={l} onCancel={setCancelling} />}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={t.allClear} />
        )}
      </Card>

      <Card title={t.credits} subtitle={t.creditsIntro} id="bank-credits">
        {data.credits.length ? (
          <ul className="bank-credits">
            {data.credits.map((c) => (
              <li key={c.profile_id}>
                <span>
                  <strong>{c.full_name}</strong> · {money(c.cents)}
                </span>
                {data.can.manage && (
                  <span className="actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || !data.receivables.some((r) => r.profileId === c.profile_id && r.remaining > 0)}
                      aria-label={fill(t.applyCreditOf, { name: c.full_name })}
                      onClick={() => setCredit({ kind: "apply", profileId: c.profile_id, name: c.full_name, cents: c.cents })}
                    >
                      {t.applyCredit}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.refundOf, { name: c.full_name })} onClick={() => setCredit({ kind: "refund", profileId: c.profile_id, name: c.full_name, cents: c.cents })}>
                      {t.refund}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noCredit}</p>
        )}
      </Card>

      {closed.length > 0 && (
        <Card title={t.done} subtitle={t.doneIntro} id="bank-done">
          <ul className="bank-lines">
            {closed.map((l) => (
              <li key={l.id} className="bank-line" data-status={l.status}>
                <div className="bank-line-head">
                  <span className="muted">{day(l.booked_on)}</span>
                  <strong className={l.amount_cents < 0 ? "bank-out" : "bank-in"}>{money(l.amount_cents)}</strong>
                  <span>{l.counterparty || "…"}</span>
                  {l.status === "ignored" && <Badge>{t.ignoredState}</Badge>}
                </div>
                {l.communication && <p className="small bank-communication">{l.communication}</p>}
                {l.status === "ignored" ? (
                  data.can.manage && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "ignore", lineId: l.id, ignored: false }, t.saved)}>
                      {t.unignore}
                    </Button>
                  )
                ) : (
                  <Allocations ctx={ctx} line={l} onCancel={setCancelling} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.imports.length > 0 && (
        <Card title={t.history} id="bank-imports">
          <ul className="small">
            {data.imports.map((i) => (
              <li key={i.id}>{fill(t.historyLine, { date: day(i.imported_at.slice(0, 10)), file: i.filename || t.formats[i.format as Format], c: i.created, m: i.matched })}</li>
            ))}
          </ul>
        </Card>
      )}

      {account && <AccountForm ctx={ctx} account={account === "new" ? null : account} close={() => setAccount(null)} />}
      {importing && <ImportDialog ctx={ctx} close={() => setImporting(false)} />}
      {allocating && <AllocateDialog ctx={ctx} line={allocating.line} initial={allocating.parts} close={() => setAllocating(null)} />}
      {cancelling && (
        <Modal title={fill(t.cancelAllocationOf, { name: cancelling.label, amount: money(cancelling.amount_cents) })} close={() => setCancelling(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
              void send({ action: "cancelAllocation", id: cancelling.id, reason }, t.cancelled).then((ok) => ok && setCancelling(null));
            }}
          >
            <label htmlFor="bank-cancel-reason">
              {t.reason}
              <input id="bank-cancel-reason" name="reason" required minLength={5} maxLength={300} aria-describedby="bank-cancel-hint" />
              <span id="bank-cancel-hint" className="muted">
                {t.reasonHint}
              </span>
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="actions">
              <Button disabled={busy}>{t.cancelAllocation}</Button>
              <Button type="button" variant="secondary" onClick={() => setCancelling(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {credit && <CreditDialog ctx={ctx} {...credit} close={() => setCredit(null)} />}
    </div>
  );
}

function Allocations({ ctx, line, onCancel }: { ctx: Ctx; line: Line; onCancel: (a: Allocation) => void }) {
  const { t, data, busy, money } = ctx;
  return (
    <ul className="bank-allocations small">
      {line.allocations.map((a) => (
        <li key={a.id}>
          <span>
            {t.targets[a.target as Target]} · {a.label || "…"} · {money(a.amount_cents)} {a.automatic && <Badge tone="info">{t.automatic}</Badge>}
          </span>
          {data.can.manage && (
            <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(t.cancelAllocationOf, { name: a.label, amount: money(a.amount_cents) })} onClick={() => onCancel(a)}>
              {t.cancelAllocation}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function AccountForm({ ctx, account, close }: { ctx: Ctx; account: Account | null; close: () => void }) {
  const { t, data, busy, send } = ctx;
  return (
    <Modal title={account ? fill(t.editAccountOf, { name: account.label }) : t.addAccount} close={() => close()}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void send(
            {
              action: "account",
              ...(account ? { id: account.id } : {}),
              label: String(d.get("label") ?? ""),
              iban: String(d.get("iban") ?? ""),
              bic: String(d.get("bic") ?? ""),
              holder: String(d.get("holder") ?? ""),
              forDues: d.get("forDues") === "on",
            },
            t.saved,
          ).then((ok) => ok && close());
        }}
      >
        <label htmlFor="bank-account-label">
          {t.label}
          <input id="bank-account-label" name="label" required minLength={2} maxLength={80} defaultValue={account?.label ?? ""} />
        </label>
        <label htmlFor="bank-account-iban">
          {t.iban}
          <input id="bank-account-iban" name="iban" required maxLength={42} autoComplete="off" spellCheck={false} defaultValue={account ? formatIban(account.iban) : ""} />
        </label>
        <label htmlFor="bank-account-bic">
          {t.bic}
          <input id="bank-account-bic" name="bic" maxLength={11} autoComplete="off" spellCheck={false} defaultValue={account?.bic ?? ""} />
        </label>
        <label htmlFor="bank-account-holder">
          {t.holder}
          <input id="bank-account-holder" name="holder" maxLength={70} defaultValue={account?.holder ?? ""} aria-describedby="bank-account-holder-hint" />
          <span id="bank-account-holder-hint" className="muted">
            {t.holderHint}
          </span>
        </label>
        <label className="check">
          <input type="checkbox" name="forDues" defaultChecked={account ? account.for_dues : !data.accounts.some((a) => a.for_dues)} />
          {t.forDues}
        </label>
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          <Button disabled={busy}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={() => close()}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({ ctx, close }: { ctx: Ctx; close: () => void }) {
  const { t, data, busy, send, money, day } = ctx;
  const [accountId, setAccountId] = useState(data.accounts.find((a) => a.for_dues && !a.archived)?.id ?? ""),
    [file, setFile] = useState<{ name: string; format: Format; bank: Bank; grid: Grid | null; lines: StatementLine[]; ignored: number } | null>(null),
    [map, setMap] = useState<ColumnMap | null>(null),
    [preview, setPreview] = useState<(StatementLine & { duplicate: boolean; automatic: boolean })[] | null>(null),
    [unreadable, setUnreadable] = useState(false);
  const parsed = useMemo(() => {
    if (!file) return null;
    if (file.grid && map) return usable(map) ? linesFromGrid(file.grid, map) : { lines: [], ignored: 0 };
    return { lines: file.lines, ignored: file.ignored };
  }, [file, map]);
  async function read(input: File) {
    setPreview(null);
    setUnreadable(false);
    try {
      const head = new TextDecoder("utf-8").decode((await input.slice(0, 600).arrayBuffer()) as ArrayBuffer);
      const format = detectFormat(input.name, head);
      if (format === "csv" || format === "xlsx") {
        const grid = format === "xlsx" ? await parseXlsx(await input.arrayBuffer()) : parseCsv(await textOf(input));
        const bank = detectBank(grid[0] ?? []);
        const saved = data.mappings[bank];
        const guess = saved && Math.max(saved.date, saved.amount, saved.credit, saved.debit, ...saved.communication) < (grid[0]?.length ?? 0) ? saved : guessColumns(grid[0] ?? []);
        setFile({ name: input.name, format, bank, grid, lines: [], ignored: 0 });
        setMap(guess);
      } else {
        const out = format === "coda" ? parseCoda(await textOf(input)) : parseCamt(await textOf(input));
        setFile({ name: input.name, format, bank: "other", grid: null, lines: out.lines, ignored: out.ignored });
        setMap(null);
      }
    } catch {
      setFile(null);
      setUnreadable(true);
    }
  }
  const body = () => ({ accountId: accountId || null, lines: parsed?.lines ?? [] });
  const headers = file?.grid?.[0] ?? [];
  const pick = (k: Exclude<keyof ColumnMap, "communication">) => (
    <label htmlFor={`bank-col-${k}`} key={k}>
      {t.col[k]}
      <select
        id={`bank-col-${k}`}
        value={map?.[k] ?? -1}
        onChange={(e) => {
          setPreview(null);
          setMap((m) => (m ? { ...m, [k]: Number(e.target.value) } : m));
        }}
      >
        <option value={-1}>{t.none}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `#${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
  const counts = preview && { n: preview.filter((l) => !l.duplicate).length, d: preview.filter((l) => l.duplicate).length, a: preview.filter((l) => l.automatic).length };
  return (
    <Modal title={t.import} close={() => close()} className="player-dialog bank-import">
      <p className="muted">{t.importIntro}</p>
      <div className="stack-form">
        {data && data.accounts.some((a) => !a.archived) && (
          <label htmlFor="bank-import-account">
            {t.account}
            <select id="bank-import-account" value={accountId} onChange={(e) => (setAccountId(e.target.value), setPreview(null))}>
              <option value="">{t.noAccountChoice}</option>
              {data.accounts
                .filter((a) => !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {formatIban(a.iban)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label htmlFor="bank-import-file">
          {t.file}
          <input
            id="bank-import-file"
            type="file"
            accept=".csv,.txt,.xlsx,.cod,.coda,.xml,text/csv,application/xml,text/xml"
            aria-describedby="bank-import-hint"
            onChange={(e) => {
              const input = e.target.files?.[0];
              if (input) void read(input);
            }}
          />
          <span id="bank-import-hint" className="muted">
            {t.fileHint}
          </span>
        </label>
        {unreadable && <p role="alert">{t.unreadable}</p>}
        {file && parsed && (
          <p role="status">
            {fill(t.detected, { format: t.formats[file.format], bank: t.banks[file.bank], n: parsed.lines.length })}
            {parsed.ignored > 0 && <> {fill(t.ignoredRows, { n: parsed.ignored })}</>}
          </p>
        )}
        {file?.grid && map && (
          <fieldset className="bank-columns">
            <legend>{t.columns}</legend>
            <p className="muted small">{t.columnsHint}</p>
            <div className="form-grid">
              {(["date", "amount", "credit", "debit", "counterparty", "counterpartyIban", "bankRef"] as const).map(pick)}
              <label htmlFor="bank-col-communication">
                {t.col.communication}
                <select
                  id="bank-col-communication"
                  value={map.communication[0] ?? -1}
                  onChange={(e) => {
                    setPreview(null);
                    const v = Number(e.target.value);
                    setMap({ ...map, communication: v < 0 ? [] : [v, ...map.communication.slice(1).filter((x) => x !== v)] });
                  }}
                >
                  <option value={-1}>{t.none}</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `#${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        )}
        {preview && counts && (
          <section aria-labelledby="bank-preview-title">
            <h3 id="bank-preview-title">{t.preview}</h3>
            <p>{counts.n ? fill(t.previewSummary, counts) : t.nothingNew}</p>
            <div className="table-scroll" role="region" aria-labelledby="bank-preview-title" tabIndex={0}>
              <table className="ledger bank-preview">
                <thead>
                  <tr>
                    <th scope="col">{t.date}</th>
                    <th scope="col" className="num">
                      {t.amount}
                    </th>
                    <th scope="col">{t.counterparty}</th>
                    <th scope="col">{t.communication}</th>
                    <th scope="col">{t.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 200).map((l, i) => (
                    <tr key={i}>
                      <td>{day(l.bookedOn)}</td>
                      <td className="num">{money(l.amountCents)}</td>
                      <td>{l.counterparty}</td>
                      <td className="bank-communication">{l.communication}</td>
                      <td>
                        <Badge tone={l.duplicate ? "neutral" : l.automatic ? "success" : "info"}>{t.state[l.duplicate ? "duplicate" : l.automatic ? "automatic" : "new"]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          {!preview ? (
            <Button
              disabled={busy || !parsed?.lines.length}
              onClick={() => void send<{ lines: (StatementLine & { duplicate: boolean; automatic: boolean })[] }>({ action: "preview", ...body() }, "").then((out) => out && setPreview(out.lines))}
            >
              {t.previewDo}
            </Button>
          ) : (
            <Button
              disabled={busy || !counts?.n}
              onClick={() =>
                file &&
                void send<{ created: number; matched: number; duplicates: number }>(
                  { action: "import", ...body(), format: file.format, bank: file.bank, filename: file.name.slice(0, 160), ...(map ? { columns: map } : {}) },
                  (out) => fill(t.imported, { c: out.created, m: out.matched, d: out.duplicates }),
                ).then((ok) => ok && close())
              }
            >
              {t.importDo}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => close()}>
            {t.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AllocateDialog({ ctx, line, initial, close }: { ctx: Ctx; line: Line; initial: Part[]; close: () => void }) {
  const { t, f, data, busy, send, money, day } = ctx;
  const lineLabel = { date: day(line.booked_on), amount: money(line.amount_cents) };
  const [parts, setParts] = useState<Part[]>(initial);
  const incoming = line.amount_cents > 0;
  const total = parts.reduce((n, p) => n + (toCents(p.amount) || 0), 0),
    max = left(line);
  const set = (i: number, patch: Partial<Part>) => setParts((all) => all.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const options = (p: Part): Named[] =>
    !data
      ? []
      : p.target === "receivable"
        ? data.receivables.filter((r) => r.remaining > 0).map((r) => ({ id: r.id, name: fill(t.remainingOf, { name: r.person, category: f.categories[r.category] ?? r.category, season: r.season, left: money(r.remaining) }) }))
        : p.target === "credit"
          ? data.targets.people
          : p.target === "pot"
            ? data.targets.pots
            : p.target === "partner"
              ? data.targets.partners
              : p.target === "grant"
                ? data.targets.grants
                : [];
  const valid = parts.every((p) => toCents(p.amount) > 0 && (p.target === "other" || p.targetId)) && total <= max;
  const surplus = parts.find((p) => p.target === "credit");
  return (
    <Modal title={fill(t.allocateOf, lineLabel)} close={() => close()} className="player-dialog bank-allocate">
      <p>
        <strong>{line.counterparty}</strong> {line.reference ? <span className="muted">{formatReference(line.reference)}</span> : line.communication && <span className="muted">{line.communication}</span>}
      </p>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          void send(
            {
              action: "allocate",
              lineId: line.id,
              parts: parts.map((p) => ({ target: p.target, targetId: p.target === "other" ? null : p.targetId, amountCents: toCents(p.amount), ...(p.target === "other" ? { category: p.category } : {}) })),
            },
            t.allocated,
          ).then((ok) => ok && close());
        }}
      >
        {parts.map((p, i) => {
          const id = `bank-part-${i}`;
          const list = options(p);
          return (
            <fieldset key={i} className="bank-part">
              <legend>
                {t.parts} {parts.length > 1 ? i + 1 : ""}
              </legend>
              <div className="form-grid">
                <label htmlFor={`${id}-target`}>
                  {t.target}
                  <select id={`${id}-target`} value={p.target} onChange={(e) => set(i, { target: e.target.value as Target, targetId: "" })}>
                    {(incoming ? (["receivable", "credit", "pot", "partner", "grant", "other"] as const) : (["other"] as const)).map((k) => (
                      <option key={k} value={k}>
                        {t.targets[k]}
                      </option>
                    ))}
                  </select>
                </label>
                {p.target === "other" ? (
                  <label htmlFor={`${id}-category`}>
                    {t.category}
                    <select id={`${id}-category`} value={p.category} onChange={(e) => set(i, { category: e.target.value })}>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {f.categories[c] ?? c}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label htmlFor={`${id}-id`}>
                    {p.target === "receivable" ? t.receivable : p.target === "credit" ? t.person : p.target === "pot" ? t.pot : p.target === "partner" ? t.partner : t.grant}
                    <select id={`${id}-id`} value={p.targetId} required onChange={(e) => set(i, { targetId: e.target.value })}>
                      <option value="" disabled>
                        …
                      </option>
                      {list.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label htmlFor={`${id}-amount`}>
                  {t.amount}
                  <input id={`${id}-amount`} inputMode="decimal" required pattern="[0-9 ]+([.,][0-9]{1,2})?" value={p.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                </label>
              </div>
              {parts.length > 1 && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setParts((all) => all.filter((_, k) => k !== i))}>
                  {fill(t.removePart, { n: i + 1 })}
                </Button>
              )}
            </fieldset>
          );
        })}
        {incoming && (
          <p>
            <Button type="button" size="sm" variant="secondary" icon="plus" onClick={() => setParts((all) => [...all, { target: "receivable", targetId: "", amount: asInput(Math.max(0, max - total)), category: "other" }])}>
              {t.addPart}
            </Button>
          </p>
        )}
        <p role="status">{total > max ? fill(t.tooMuch, { amount: money(max) }) : fill(t.left, { amount: money(max - total) })}</p>
        {ctx.error && <p role="alert">{ctx.error}</p>}
        {surplus && surplus.targetId && <p className="muted">{fill(t.surplus, { amount: money(toCents(surplus.amount) || 0), name: data.targets.people.find((x) => x.id === surplus.targetId)?.name ?? "" })}</p>}
        <div className="actions">
          <Button disabled={busy || !valid}>{t.allocate.replace("…", "")}</Button>
          <Button type="button" variant="secondary" onClick={() => close()}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreditDialog({ ctx, kind, profileId, name, cents, close }: { ctx: Ctx; kind: "apply" | "refund"; profileId: string; name: string; cents: number; close: () => void }) {
  const { t, f, data, busy, send, money } = ctx;
  const mine = data.receivables.filter((r) => r.profileId === profileId && r.remaining > 0) ?? [];
  const [target, setTarget] = useState(mine[0]?.id ?? "");
  const room = kind === "apply" ? Math.min(cents, mine.find((r) => r.id === target)?.remaining ?? 0) : cents;
  return (
    <Modal title={fill(kind === "apply" ? t.applyCreditOf : t.refundOf, { name })} close={() => close()}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const amountCents = toCents(String(d.get("amount") ?? ""));
          const body =
            kind === "apply"
              ? { action: "applyCredit", profileId, receivableId: target, amountCents }
              : { action: "refundCredit", profileId, amountCents, occurredOn: String(d.get("date") ?? ""), reason: String(d.get("reason") ?? "") };
          void send(body, kind === "apply" ? t.applied : t.refunded).then((ok) => ok && close());
        }}
      >
        {kind === "apply" && (
          <label htmlFor="bank-credit-receivable">
            {t.receivable}
            <select id="bank-credit-receivable" value={target} onChange={(e) => setTarget(e.target.value)} required>
              {mine.map((r) => (
                <option key={r.id} value={r.id}>
                  {fill(t.remainingOf, { name: r.person, category: f.categories[r.category] ?? r.category, season: r.season, left: money(r.remaining) })}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor="bank-credit-amount">
          {t.amount}
          <input id="bank-credit-amount" name="amount" key={room} inputMode="decimal" required pattern="[0-9 ]+([.,][0-9]{1,2})?" defaultValue={asInput(room)} />
        </label>
        {kind === "refund" && (
          <>
            <label htmlFor="bank-credit-date">
              {t.refundDate}
              <input id="bank-credit-date" name="date" type="date" required max={data.today} defaultValue={data.today} />
            </label>
            <label htmlFor="bank-credit-reason">
              {t.reason}
              <input id="bank-credit-reason" name="reason" required minLength={5} maxLength={300} aria-describedby="bank-credit-reason-hint" />
              <span id="bank-credit-reason-hint" className="muted">
                {t.reasonHint}
              </span>
            </label>
          </>
        )}
        {ctx.error && <p role="alert">{ctx.error}</p>}
        <div className="actions">
          <Button disabled={busy}>{kind === "apply" ? t.applyCredit : t.refund}</Button>
          <Button type="button" variant="secondary" onClick={() => close()}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

