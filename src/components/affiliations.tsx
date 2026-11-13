"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import { bpcfPlayerCapCents, federationExamples, type DueState, type FeeExample } from "@/domains/affiliations/schema";
import { affiliationsCopy, put } from "./affiliations-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, ExportButton, PageHeader } from "./ui";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { Fines } from "./fines";
import { useData, usePost } from "./use-api";
import { FinanceNav } from "./finance-nav";
import { undoToast, showToast } from "./toast";

/**
 * Wave 17 (N2): affiliations and federal fees. The club sees what it owes
 * (the federation's fees and its own), marks a due « en ordre » with a round
 * green button, and may create the expense at once; the federation defines
 * its fees for all or chosen clubs and follows who paid.
 */
type Fee = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  contact_id: string | null;
  basis: "player" | "club";
  frequency: "annual" | "monthly";
  amount_cents: number;
  opens_month: number;
  opens_day: number;
  due_days: number | null;
  due_month: number | null;
  due_day: number | null;
  all_clubs: boolean;
  owner_kind?: "club" | "federation";
  owner_name?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  club_ids?: string[];
};
type Due = {
  id: string;
  fee_id: string;
  name: string;
  period: string;
  due_on: string;
  players: number | null;
  amount_cents: number;
  paid_on: string | null;
  basis: "player" | "club";
  owner_kind: "club" | "federation";
  owner_name: string;
  state: DueState;
};
type Contact = { id: string; full_name: string; organization_name: string };
type ClubView = { organization_id: string; today: string; canManage: boolean; fees: Fee[]; dues: Due[]; contacts: Contact[] };
type FedDue = { id: string; fee_id: string; club_id: string; club: string; period: string; due_on: string; amount_cents: number; players: number | null; paid_on: string | null; state: DueState };
type FedView = { organization_id: string; today: string; canManage: boolean; fees: Fee[]; clubs: { id: string; name: string }[]; dues: FedDue[]; contacts: Contact[] };

const tone: Record<DueState, string> = { open: "warning", late: "danger", paid: "success" };
const money = (locale: Locale, cents: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { style: "currency", currency: "EUR" }).format(cents / 100);
const day = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));

function useFailure(locale: Locale) {
  return useCallback(
    (code: string) =>
      errors[code]?.[locale] ??
      ({ fr: "Action impossible pour le moment. Actualisez puis réessayez.", nl: "Actie momenteel niet mogelijk. Vernieuw en probeer opnieuw.", en: "Action not possible right now. Refresh and try again." } as const)[locale],
    [locale],
  );
}

/** The fields of a definition, for the club or the federation (with its scope). */
function FeeDialog({
  locale,
  contacts,
  clubs,
  preset,
  busy,
  save,
  close,
}: {
  locale: Locale;
  contacts: Contact[];
  clubs?: { id: string; name: string }[];
  preset?: Omit<FeeExample, "key">;
  busy: boolean;
  save: (body: Record<string, unknown>) => void;
  close: () => void;
}) {
  const t = affiliationsCopy[locale];
  const [frequency, setFrequency] = useState<"annual" | "monthly">(preset?.frequency ?? "annual");
  const [mode, setMode] = useState<"after" | "fixed">(preset?.dueMonth ? "fixed" : "after");
  const [scope, setScope] = useState<"all" | "chosen">("all");
  return (
    <Modal title={clubs ? t.addFed : t.add} close={close}>
      <form
        className="stack-form affiliation-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const fixed = frequency === "annual" && mode === "fixed";
          save({
            action: "addFee",
            name: f.get("name"),
            description: f.get("description") ?? "",
            contactId: f.get("contact") || null,
            basis: f.get("basis"),
            frequency,
            amountCents: Math.round(Number(String(f.get("amount")).replace(",", ".")) * 100),
            opensMonth: Number(f.get("opensMonth") ?? 1),
            opensDay: Number(f.get("opensDay")),
            dueDays: fixed ? null : Number(f.get("dueDays")),
            dueMonth: fixed ? Number(f.get("dueMonth")) : null,
            dueDay: fixed ? Number(f.get("dueDay")) : null,
            ...(clubs ? { allClubs: scope === "all", clubIds: scope === "all" ? [] : f.getAll("clubs") } : {}),
          });
        }}
      >
        <label htmlFor="fee-name">
          {t.name}
          <input id="fee-name" name="name" required minLength={2} maxLength={120} defaultValue={preset?.name ?? ""} />
        </label>
        <label htmlFor="fee-description">
          {t.description}
          <textarea id="fee-description" name="description" maxLength={1000} />
        </label>
        <label htmlFor="fee-contact">
          {t.contact}
          <select id="fee-contact" name="contact" defaultValue="">
            <option value="">{t.noContact}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.organization_name ? ` · ${c.organization_name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{t.basis}</legend>
          <label className="check">
            <input type="radio" name="basis" value="club" defaultChecked={(preset?.basis ?? "club") === "club"} />
            {t.perClub}
          </label>
          <label className="check">
            <input type="radio" name="basis" value="player" defaultChecked={preset?.basis === "player"} />
            {t.perPlayer}
          </label>
        </fieldset>
        <fieldset>
          <legend>{t.frequency}</legend>
          {(["annual", "monthly"] as const).map((v) => (
            <label key={v} className="check">
              <input type="radio" name="frequency" value={v} checked={frequency === v} onChange={() => setFrequency(v)} />
              {v === "annual" ? t.annual : t.monthly}
            </label>
          ))}
        </fieldset>
        <label htmlFor="fee-amount">
          {t.amount}
          <input id="fee-amount" name="amount" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" aria-describedby="fee-amount-hint" defaultValue={preset?.amountCents !== undefined ? (preset.amountCents / 100).toFixed(2) : undefined} />
        </label>
        <p id="fee-amount-hint" className="muted small">
          {t.amountHint}
        </p>
        <fieldset className="date-pair">
          <legend>{t.opens}</legend>
          <p className="muted small">{t.opensHint}</p>
          {frequency === "annual" && (
            <label htmlFor="fee-opens-month">
              {t.month}
              <select id="fee-opens-month" name="opensMonth" defaultValue={String(preset?.opensMonth ?? 8)}>
                {t.months.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label htmlFor="fee-opens-day">
            {t.day}
            <input id="fee-opens-day" name="opensDay" type="number" min={1} max={28} defaultValue={preset?.opensDay ?? 1} required />
          </label>
        </fieldset>
        <fieldset>
          <legend>{t.dueMode}</legend>
          <label className="check">
            <input type="radio" name="dueMode" checked={mode === "after" || frequency === "monthly"} onChange={() => setMode("after")} />
            {t.dueAfter}
          </label>
          {frequency === "annual" && (
            <label className="check">
              <input type="radio" name="dueMode" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
              {t.dueFixed}
            </label>
          )}
          {mode === "fixed" && frequency === "annual" ? (
            <div className="date-pair">
              <label htmlFor="fee-due-month">
                {t.month}
                <select id="fee-due-month" name="dueMonth" defaultValue={String(preset?.dueMonth ?? 9)}>
                  {t.months.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="fee-due-day">
                {t.day}
                <input id="fee-due-day" name="dueDay" type="number" min={1} max={31} defaultValue={preset?.dueDay ?? 30} required />
              </label>
            </div>
          ) : (
            <label htmlFor="fee-due-days">
              {t.days}
              <input id="fee-due-days" name="dueDays" type="number" min={1} max={366} defaultValue={30} required />
            </label>
          )}
        </fieldset>
        {clubs && (
          <fieldset>
            <legend>{t.scope}</legend>
            <label className="check">
              <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
              {t.allClubs}
            </label>
            <label className="check">
              <input type="radio" name="scope" checked={scope === "chosen"} onChange={() => setScope("chosen")} />
              {t.chosenClubs}
            </label>
            {scope === "chosen" && (
              <div className="club-choice">
                {clubs.map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" name="clubs" value={c.id} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
        <div className="actions">
          <Button disabled={busy}>{t.save}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const amountText = (locale: Locale, d: { basis: "player" | "club"; players: number | null; amount_cents: number }) => {
  const t = affiliationsCopy[locale];
  const total = money(locale, d.amount_cents);
  return d.basis === "player" && d.players ? `${total} (${put(t.perPlayerCount, { n: d.players, amount: money(locale, Math.round(d.amount_cents / d.players)) })})` : total;
};

/** Finances > Affiliations of a club. */
export function ClubAffiliations({ locale }: { locale: Locale }) {
  const t = affiliationsCopy[locale];
  const failure = useFailure(locale);
  const { data, error, setError, denied, reload } = useData<ClubView>("/api/affiliations", failure);
  const { busy, message, post, postFor } = usePost("/api/affiliations", reload, setError, failure);
  const [adding, setAdding] = useState(false);
  const [marking, setMarking] = useState<Due | null>(null);
  if (denied) return <main id="main" className="access affiliations"><EmptyState title={errors.FORBIDDEN?.[locale] ?? t.title} /></main>;
  const send = (body: Record<string, unknown>, done: string) => post({ ...body, organizationId: data?.organization_id }, done);
  return (
    <main id="main" className="access affiliations">
      <PageHeader title={t.title} subtitle={t.intro} actions={data?.canManage ? <Button icon="plus" onClick={() => setAdding(true)}>{t.add}</Button> : undefined} />
      <FinanceNav locale={locale} current="affiliations" />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {data ? message : t.loading}
      </p>
      {data && (
        <>
          <Card
            title={t.current}
            id="affiliation-dues"
            actions={
              // Wave 17 (G2): the club's affiliations and dues as listed.
              <ExportButton
                locale={locale}
                organizationId={data.organization_id}
                dataset="affiliations"
                subject={t.title}
                rows={data.dues}
                columns={[
                  { id: "name", label: t.name, value: (d) => d.name },
                  { id: "owner", label: t.federation, value: (d) => (d.owner_kind === "federation" ? d.owner_name : t.club) },
                  { id: "period", label: t.period, value: (d) => d.period },
                  { id: "amount", label: t.amount, type: "money", value: (d) => d.amount_cents / 100 },
                  { id: "players", label: t.perPlayer, type: "number", value: (d) => d.players },
                  { id: "deadline", label: t.deadline, type: "date", value: (d) => d.due_on },
                  { id: "status", label: t.status, value: (d) => t.states[d.state] },
                  { id: "paid", label: t.paidOn, type: "date", value: (d) => d.paid_on },
                ]}
              />
            }
          >
            {data.dues.length ? (
              <div className="table-scroll">
                <table className="compact-table affiliation-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.name}</th>
                      <th scope="col">{t.period}</th>
                      <th scope="col">{t.amount}</th>
                      <th scope="col">{t.deadline}</th>
                      <th scope="col">{t.status}</th>
                      {data.canManage && <th scope="col"><span className="sr-only">{t.markPaid}</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.dues.map((d) => (
                      <tr key={d.id} data-state={d.state}>
                        <th scope="row">
                          {d.name}
                          <span className="muted affiliation-owner">{d.owner_kind === "federation" ? `${t.federation} · ${d.owner_name}` : t.club}</span>
                        </th>
                        <td>{d.period}</td>
                        <td>{amountText(locale, d)}</td>
                        <td>{day(locale, d.due_on)}</td>
                        <td>
                          <Badge tone={tone[d.state]} dot>
                            {t.states[d.state]}
                          </Badge>
                          {d.paid_on && <span className="muted affiliation-owner">{`${t.paidOn} ${day(locale, d.paid_on)}`}</span>}
                        </td>
                        {data.canManage && (
                          <td className="affiliation-action">
                            {!d.paid_on && (
                              <button
                                type="button"
                                className="settle-button"
                                aria-label={put(t.markPaidOf, { name: `${d.name} ${d.period}` })}
                                title={t.markPaid}
                                disabled={busy}
                                onClick={() => setMarking(d)}
                              >
                                <Icon name="check" size={22} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={data.fees.length ? t.noDues : t.none} />
            )}
            <p>
              <Link href={`/${locale}/settings/organisation#settings-obligations`}>{t.statusLink} →</Link>
            </p>
          </Card>
          <Card title={t.definitions} id="affiliation-fees">
            {data.fees.length ? (
              <ul className="affiliation-fees">
                {data.fees.map((f) => (
                  <li key={f.id}>
                    <div>
                      <strong>{f.name}</strong>
                      <span className="muted">
                        {[
                          f.owner_kind === "federation" ? `${t.federation} · ${f.owner_name}` : t.club,
                          f.basis === "player" ? t.perPlayer : t.perClub,
                          f.frequency === "annual" ? t.annual : t.monthly,
                          money(locale, f.amount_cents),
                          f.contact_name ? `${t.contact} : ${f.contact_name}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {data.canManage && f.owner_kind === "club" && (
                      <Button variant="secondary" size="sm" aria-label={put(t.archiveOf, { name: f.name })} disabled={busy} onClick={() => void send({ action: "archiveFee", id: f.id }, t.archived)}>
                        {t.archive}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.none} />
            )}
          </Card>
        </>
      )}
      {adding && data && (
        <FeeDialog
          locale={locale}
          contacts={data.contacts}
          busy={busy}
          close={() => setAdding(false)}
          save={(body) =>
            void send(body, t.saved).then((ok) => {
              if (ok) setAdding(false);
            })
          }
        />
      )}
      {marking && data && (
        <Modal title={put(t.markTitle, { name: `${marking.name} ${marking.period}` })} close={() => setMarking(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const due = marking;
              void postFor(
                { action: "markPaid", id: due.id, paidOn: f.get("paidOn"), createExpense: f.has("expense"), method: f.get("method"), organizationId: data.organization_id },
                t.marked,
              ).then((r) => {
                if (!r) return;
                setMarking(null);
                undoToast(locale, t.marked, r.undo, data.organization_id, reload);
              });
            }}
          >
            <p>{amountText(locale, marking)}</p>
            <label htmlFor="paid-on">
              {t.paidOn}
              <input id="paid-on" name="paidOn" type="date" required max={data.today} defaultValue={data.today} />
            </label>
            {marking.amount_cents > 0 && (
              <>
                <label className="check">
                  <input type="checkbox" name="expense" defaultChecked aria-describedby="expense-hint" />
                  {t.createExpense}
                </label>
                <p id="expense-hint" className="muted small">
                  {t.createExpenseHint}
                </p>
                <label htmlFor="paid-method">
                  {t.method}
                  <select id="paid-method" name="method" defaultValue="transfer">
                    {(["transfer", "cash", "card", "other"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t.methods[m]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <div className="actions">
              <Button disabled={busy} icon="check">
                {t.confirm}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setMarking(null)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {/* Point 10: the federation's fines. */}
      <Fines locale={locale} />
    </main>
  );
}

/** The federation's « Affiliations »: its fees, and who paid. */
export function FederationAffiliations({ locale }: { locale: Locale }) {
  const t = affiliationsCopy[locale];
  const failure = useFailure(locale);
  const { data, error, setError, denied, reload } = useData<FedView>("/api/federation/affiliations", failure);
  const { busy, message, post, postFor } = usePost("/api/federation/affiliations", reload, setError, failure);
  const [adding, setAdding] = useState<null | Omit<FeeExample, "key"> | "blank">(null);
  if (denied) return <main id="main" className="access affiliations"><EmptyState title={errors.FORBIDDEN?.[locale] ?? t.title} /></main>;
  const late = data?.dues.filter((d) => d.state === "late").length ?? 0;
  return (
    <main id="main" className="access affiliations">
      <PageHeader title={t.title} subtitle={t.fedIntro} actions={data?.canManage ? <Button icon="plus" onClick={() => setAdding("blank")}>{t.addFed}</Button> : undefined} />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {data ? message : t.loading}
      </p>
      {data && (
        <>
          <Card title={t.definitions} id="federation-fees">
            {data.fees.length ? (
              <ul className="affiliation-fees">
                {data.fees.map((f) => (
                  <li key={f.id}>
                    <div>
                      <strong>{f.name}</strong>
                      <span className="muted">
                        {[
                          f.all_clubs ? t.allClubs : put(t.clubsCount, { n: f.club_ids?.length ?? 0 }),
                          f.basis === "player" ? t.perPlayer : t.perClub,
                          f.frequency === "annual" ? t.annual : t.monthly,
                          money(locale, f.amount_cents),
                        ].join(" · ")}
                      </span>
                      {/* Point 9 (BPCF 1/18): 80 € per player at most. */}
                      {f.basis === "player" && f.amount_cents > bpcfPlayerCapCents && <Badge tone="warning">{t.overCap}</Badge>}
                    </div>
                    {data.canManage && (
                      <div className="affiliation-fee-tools">
                        {/* 04/11/2026: the amount changes for the next dues (the cost of a player per year, say). */}
                        <form
                          className="inline-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const euros = Number(String(new FormData(e.currentTarget).get("amount") ?? "").replace(",", "."));
                            if (Number.isFinite(euros) && euros >= 0) void post({ action: "setFeeAmount", id: f.id, amountCents: Math.round(euros * 100), organizationId: data.organization_id }, t.amountSaved);
                          }}
                        >
                          <label>
                            <span className="sr-only">{put(t.amountOf, { name: f.name })}</span>
                            <input name="amount" inputMode="decimal" defaultValue={(f.amount_cents / 100).toFixed(2)} aria-label={put(t.amountOf, { name: f.name })} />
                          </label>
                          <Button variant="secondary" size="sm" disabled={busy}>
                            {t.amountSave}
                          </Button>
                        </form>
                        <Button variant="secondary" size="sm" aria-label={put(t.archiveOf, { name: f.name })} disabled={busy} onClick={() => void post({ action: "archiveFee", id: f.id, organizationId: data.organization_id }, t.archived)}>
                          {t.archive}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.none} />
            )}
            {data.canManage && (
              <div className="affiliation-examples">
                <p className="muted">{t.examples}</p>
                {federationExamples
                  .filter((x) => !data.fees.some((f) => f.name === x.name))
                  .map((x) => (
                    <Button key={x.key} variant="secondary" size="sm" onClick={() => setAdding(x)}>
                      {put(t.example, { name: x.name })}
                    </Button>
                  ))}
              </div>
            )}
          </Card>
          <Card
            title={t.tracking}
            id="federation-tracking"
            actions={
              data.canManage && late > 0 ? (
                <Button
                  variant="secondary"
                  icon="bell"
                  disabled={busy}
                  onClick={() =>
                    void postFor({ action: "remind", feeId: null, organizationId: data.organization_id }, "").then((r) => {
                      if (r) showToast({ message: put(t.reminded, { n: (r as { clubs?: number }).clubs ?? 0 }), icon: "bell" });
                    })
                  }
                >
                  {t.remind}
                </Button>
              ) : undefined
            }
          >
            {data.dues.length ? (
              <div className="table-scroll">
                <table className="compact-table affiliation-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.club}</th>
                      <th scope="col">{t.name}</th>
                      <th scope="col">{t.period}</th>
                      <th scope="col">{t.amount}</th>
                      <th scope="col">{t.deadline}</th>
                      <th scope="col">{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dues.map((d) => (
                      <tr key={d.id} data-state={d.state}>
                        <th scope="row">{d.club}</th>
                        <td>{data.fees.find((f) => f.id === d.fee_id)?.name ?? ""}</td>
                        <td>{d.period}</td>
                        <td>{amountText(locale, { ...d, basis: data.fees.find((f) => f.id === d.fee_id)?.basis ?? "club" })}</td>
                        <td>{day(locale, d.due_on)}</td>
                        <td>
                          <Badge tone={tone[d.state]} dot>
                            {t.states[d.state]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title={t.noDues} />
            )}
            {late === 0 && data.dues.length > 0 && <p className="muted">{t.nothingLate}</p>}
          </Card>
        </>
      )}
      {adding && data && (
        <FeeDialog
          locale={locale}
          contacts={data.contacts}
          clubs={data.clubs}
          preset={adding === "blank" ? undefined : adding}
          busy={busy}
          close={() => setAdding(null)}
          save={(body) =>
            void post({ ...body, organizationId: data.organization_id }, t.saved).then((ok) => {
              if (ok) setAdding(null);
            })
          }
        />
      )}
      {/* Point 10: the fines given to the clubs. */}
      <Fines locale={locale} />
    </main>
  );
}
