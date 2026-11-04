"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { loanMoves, modelLabel, placePath } from "@/domains/equipment/schema";
import { equipmentMoreCopy } from "./equipment-more-copy";
import type { Loan } from "@/domains/equipment/loans";
import { fleetCopy, fill } from "./fleet-copy";
import { Badge, Card, EmptyState } from "./ui";
import { dayOf, brusselsToday, tag, type Send, type View } from "./chair-sheet";

export const loanTone: Record<Loan["status"], string> = { requested: "warning", accepted: "info", ongoing: "info", returned: "success", refused: "danger", cancelled: "neutral" };
const money = (locale: Locale, cents: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);

/** What the lender or the borrower can do next with a loan. */
export function LoanActions({ locale, loan, side, busy, send }: { locale: Locale; loan: Loan; side: "lender" | "borrower"; busy: boolean; send: Send }) {
  const f = fleetCopy[locale];
  const moves = loanMoves(loan.status, side);
  const [open, setOpen] = useState<"" | "decide" | "handOver" | "return">("");
  if (!moves.length) return null;
  const who = `${loan.chair} · ${side === "lender" ? loan.borrower : loan.lender}`;
  return (
    <div className="loan-actions">
      {moves.includes("accept") &&
        (open === "decide" ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const decision = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? "accepted";
              void send({ action: "decideLoan", id: loan.id, decision, note: String(d.get("note") ?? "") }).then((r) => r && setOpen(""));
            }}
          >
            <label>
              {f.decisionNote}
              <input name="note" maxLength={1000} />
            </label>
            <button className="button sm" value="accepted" disabled={busy}>
              {f.accept}
              <span className="sr-only"> : {who}</span>
            </button>
            <button className="button secondary sm" value="refused" disabled={busy}>
              {f.refuse}
              <span className="sr-only"> : {who}</span>
            </button>
          </form>
        ) : (
          <button type="button" className="button sm" onClick={() => setOpen("decide")}>
            {f.accept} / {f.refuse}
            <span className="sr-only"> : {who}</span>
          </button>
        ))}
      {(moves.includes("handOver") || moves.includes("return")) &&
        (open === "handOver" || open === "return" ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const condition = String(new FormData(e.currentTarget).get("condition") ?? "");
              void send({ action: open === "handOver" ? "handOver" : "returnLoan", id: loan.id, condition }).then((r) => r && setOpen(""));
            }}
          >
            <label>
              {open === "handOver" ? f.conditionOut : f.conditionIn}
              <input name="condition" maxLength={1000} required />
            </label>
            <button className="button sm" disabled={busy}>
              {open === "handOver" ? f.handOver : f.markReturned}
              <span className="sr-only"> : {who}</span>
            </button>
          </form>
        ) : (
          <button type="button" className="button sm" onClick={() => setOpen(moves.includes("handOver") ? "handOver" : "return")}>
            {moves.includes("handOver") ? f.handOver : f.markReturned}
            <span className="sr-only"> : {who}</span>
          </button>
        ))}
      {moves.includes("cancel") && (
        <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "cancelLoan", id: loan.id })}>
          {f.cancelLoan}
          <span className="sr-only"> : {who}</span>
        </button>
      )}
    </div>
  );
}

function LoanTable({ locale, loans, side, busy, send, title }: { locale: Locale; loans: Loan[]; side: "lender" | "borrower"; busy: boolean; send: Send; title: string }) {
  const f = fleetCopy[locale];
  if (!loans.length) return <EmptyState title={f.noLoan} />;
  return (
    <div className="table-scroll" role="region" aria-label={title} tabIndex={0}>
      <table className="ledger">
        <thead>
          <tr>
            <th scope="col">{f.loanCols.chair}</th>
            <th scope="col">{f.loanCols.club}</th>
            <th scope="col">{f.loanCols.dates}</th>
            <th scope="col">{f.loanCols.status}</th>
            <th scope="col">{f.loanCols.details}</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id}>
              <th scope="row">
                {l.chair}
                {l.model_name && <span className="muted small"> · {modelLabel({ brand: l.model_brand ?? "", name: l.model_name })}</span>}
              </th>
              <td>{side === "lender" ? l.borrower : l.lender}</td>
              <td>{fill(f.fromTo, { from: dayOf(locale, l.starts_on), to: dayOf(locale, l.ends_on) })}</td>
              <td>
                <Badge tone={loanTone[l.status]}>{f.loanStatus[l.status]}</Badge>
              </td>
              <td>
                {[
                  l.message,
                  l.conditions && `${f.conditions} : ${l.conditions}`,
                  l.deposit_cents !== null && fill(f.depositOf, { amount: money(locale, l.deposit_cents) }),
                  side === "borrower" && l.storage_name && `${f.cols.place} : ${[l.storage_name, l.storage_address].filter(Boolean).join(", ")}`,
                  l.condition_out && `${f.conditionOut} : ${l.condition_out}`,
                  l.condition_in && `${f.conditionIn} : ${l.condition_in}`,
                  l.decision_note,
                ]
                  .filter(Boolean)
                  .map((x, i) => (
                    <span key={i} className="muted small loan-detail">
                      {x}
                    </span>
                  ))}
                <LoanActions locale={locale} loan={l} side={side} busy={busy} send={send} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The chairs another club or the federation lends us, with their badge. */
export function BorrowedChairs({ locale, view }: { locale: Locale; view: View }) {
  const f = fleetCopy[locale];
  const now = view.loans.borrowed.filter((l) => l.status === "ongoing" || l.status === "accepted");
  if (!now.length) return null;
  return (
    <Card title={f.borrowedTitle} subtitle={f.borrowedIntro} labelledBy="borrowed-chairs" headingId="borrowed-chairs">
      <ul className="records">
        {now.map((l) => (
          <li key={l.id}>
            <strong>{l.chair}</strong>
            {l.model_name && <span className="muted"> · {modelLabel({ brand: l.model_brand ?? "", name: l.model_name })}</span>}{" "}
            {l.status === "ongoing" ? (
              <Badge tone="info">{fill(f.lentBy, { club: l.lender, date: dayOf(locale, l.ends_on) })}</Badge>
            ) : (
              <Badge tone="neutral">{fill(f.reservedFor, { club: l.lender, from: dayOf(locale, l.starts_on), to: dayOf(locale, l.ends_on) })}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** « Prêts entre clubs »: the chairs offered, our loans and our borrowings. */
export function LendingTab({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const f = fleetCopy[locale];
  const [asking, setAsking] = useState("");
  const today = brusselsToday();
  return (
    <>
      <Card title={f.available} subtitle={f.availableIntro} labelledBy="loan-available" headingId="loan-available">
        {view.loans.available.length ? (
          <div className="table-scroll" role="region" aria-label={f.available} tabIndex={0}>
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">{f.cols.name}</th>
                  <th scope="col">{f.cols.model}</th>
                  <th scope="col">{f.owner}</th>
                  <th scope="col">{f.cols.place}</th>
                  <th scope="col">{f.availability}</th>
                  <th scope="col">
                    <span className="sr-only">{f.ask}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.loans.available.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.name}</th>
                    <td>{c.model_name ? modelLabel({ brand: c.model_brand ?? "", name: c.model_name }) : "…"}</td>
                    <td>{c.owner}</td>
                    <td>{c.storage_name ?? "…"}</td>
                    <td>{c.busy.length ? c.busy.map((b) => fill(f.busyRange, { from: dayOf(locale, b.starts_on), to: dayOf(locale, b.ends_on) })).join(" · ") : f.free}</td>
                    <td>
                      {asking === c.id ? (
                        <form
                          className="stack-form"
                          aria-label={fill(f.askOf, { name: c.name })}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const d = new FormData(e.currentTarget);
                            void send({ action: "requestLoan", chairId: c.id, startsOn: d.get("starts"), endsOn: d.get("ends"), message: String(d.get("message") ?? "") }).then((r) => r && setAsking(""));
                          }}
                        >
                          <label>
                            {f.starts}
                            <input type="date" name="starts" required min={today} />
                          </label>
                          <label>
                            {f.ends}
                            <input type="date" name="ends" required min={today} />
                          </label>
                          <label>
                            {f.message}
                            <input name="message" maxLength={1000} />
                          </label>
                          <button className="button sm" disabled={busy}>
                            {f.sendRequest}
                          </button>
                        </form>
                      ) : (
                        <button type="button" className="button secondary sm" onClick={() => setAsking(c.id)}>
                          {f.ask}
                          <span className="sr-only"> : {c.name}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={f.noAvailable} />
        )}
      </Card>
      <Card title={f.lent} labelledBy="loan-lent" headingId="loan-lent">
        <LoanTable locale={locale} loans={view.loans.lent} side="lender" busy={busy} send={send} title={f.lent} />
      </Card>
      <Card title={f.borrowed} labelledBy="loan-borrowed" headingId="loan-borrowed">
        <LoanTable locale={locale} loans={view.loans.borrowed} side="borrower" busy={busy} send={send} title={f.borrowed} />
      </Card>
    </>
  );
}

/** Storage places and what each one holds. */
export function PlacesTab({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const f = fleetCopy[locale],
    m = equipmentMoreCopy[locale];
  const [editing, setEditing] = useState("");
  const form = (p?: View["storage"]["places"][number]) => {
    const id = (k: string) => `place-${p?.id ?? "new"}-${k}`;
    return (
      <form
        className="stack-form panel"
        aria-label={p ? fill(f.editOf, { name: p.name }) : f.addPlace}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const v = (k: string) => String(d.get(k) ?? "").trim();
          void send({
            action: "storage",
            ...(p ? { id: p.id, expectedVersion: p.version } : {}),
            name: v("name"),
            placeId: v("place") || null,
            address: v("address"),
            contact: v("contact"),
            access: v("access"),
            notes: v("notes"),
            archived: d.get("archived") === "on",
            parentId: v("parent") || null,
          }).then((r) => r && setEditing(""));
        }}
      >
        <div className="form-grid">
          <label htmlFor={id("name")}>
            {f.placeName}
            <input id={id("name")} name="name" required minLength={2} maxLength={120} defaultValue={p?.name} />
          </label>
          {/* 11: inside another place, two levels at most. */}
          <label htmlFor={id("parent")}>
            {m.parent}
            <select id={id("parent")} name="parent" defaultValue={p?.parent_id ?? ""}>
              <option value="">{m.noParent}</option>
              {view.storage.places
                .filter((x) => !x.parent_id && !x.archived && x.id !== p?.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <label htmlFor={id("place")}>
            {f.clubPlace}
            <select id={id("place")} name="place" defaultValue={p?.place_id ?? ""}>
              <option value="">{f.noClubPlace}</option>
              {view.storage.clubPlaces.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("address")}>
            {f.address}
            <input id={id("address")} name="address" maxLength={300} defaultValue={p?.address} />
          </label>
          <label htmlFor={id("contact")}>
            {f.contact}
            <input id={id("contact")} name="contact" maxLength={200} defaultValue={p?.contact} />
          </label>
          <label htmlFor={id("access")}>
            {f.access}
            <input id={id("access")} name="access" maxLength={500} defaultValue={p?.access} />
          </label>
          <label htmlFor={id("notes")}>
            {f.notes}
            <input id={id("notes")} name="notes" maxLength={1000} defaultValue={p?.notes} />
          </label>
        </div>
        {p && (
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={p.archived} />
            {f.archivedPlace}
          </label>
        )}
        <div className="actions">
          <button className="button" disabled={busy}>
            {f.save}
          </button>
          <button type="button" className="button secondary" onClick={() => setEditing("")}>
            {f.cancel}
          </button>
        </div>
      </form>
    );
  };
  return (
    <Card
      title={f.tabs.places}
      labelledBy="storage-places"
      headingId="storage-places"
      actions={
        view.storage.can &&
        editing !== "new" && (
          <button type="button" className="button secondary" onClick={() => setEditing("new")}>
            {f.addPlace}
          </button>
        )
      }
    >
      {editing === "new" && form()}
      {view.storage.places.length ? (
        <ul className="storage-places">
          {/* 11: a tree: each place, then its sub-places with what each level holds. */}
          {[...view.storage.places.filter((p) => !p.parent_id || !view.storage.places.some((x) => x.id === p.parent_id))]
            .flatMap((top) => [top, ...view.storage.places.filter((x) => x.parent_id === top.id)])
            .map((p) => (
            <li key={p.id} className={[p.archived ? "muted" : "", p.parent_id ? "storage-child" : ""].filter(Boolean).join(" ") || undefined}>
              <h3>{fill(f.storedAt, { name: placePath(p) })}</h3>
              <p className="muted small">
                {[p.place_name, p.address, p.contact, p.access, p.archived ? f.archivedPlace : ""].filter(Boolean).join(" · ")}
              </p>
              {p.notes && <p className="small">{p.notes}</p>}
              {p.chairs.length + p.items.length ? (
                <dl className="chair-facts">
                  {p.chairs.length > 0 && (
                    <>
                      <dt>{f.chairsLabel}</dt>
                      <dd>{p.chairs.map((c) => c.name).join(", ")}</dd>
                    </>
                  )}
                  {p.items.length > 0 && (
                    <>
                      <dt>{f.itemsLabel}</dt>
                      <dd>{p.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(", ")}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="muted">{f.noStored}</p>
              )}
              {view.storage.can &&
                (editing === p.id ? (
                  form(p)
                ) : (
                  <button type="button" className="text-button" onClick={() => setEditing(p.id)}>
                    {f.edit}
                    <span className="sr-only"> : {p.name}</span>
                  </button>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={f.noPlaces} />
      )}
    </Card>
  );
}

/** The federation decides the models its clubs proposed. */
export function ModelsTab({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const f = fleetCopy[locale];
  const list = view.models.list;
  return (
    <Card title={f.models} subtitle={f.modelsIntro} labelledBy="chair-models" headingId="chair-models">
      {list.length ? (
        <div className="table-scroll" role="region" aria-label={f.models} tabIndex={0}>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{f.name}</th>
                <th scope="col">{f.brand}</th>
                <th scope="col">{f.loanCols.status}</th>
                <th scope="col">{f.chairsLabel}</th>
                <th scope="col">
                  <span className="sr-only">{f.validate}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.name}</th>
                  <td>{m.brand || "…"}</td>
                  <td>
                    <Badge tone={m.status === "validated" ? "success" : m.status === "refused" ? "danger" : "warning"}>{f.modelStatus[m.status]}</Badge>
                    <span className="muted small"> · {m.shared ? f.shared : m.club ? fill(f.proposedBy, { club: m.club }) : ""}</span>
                  </td>
                  <td>{fill(f.chairsCount, { n: m.chairs })}</td>
                  <td>
                    {view.models.canDecide && !m.shared && m.status !== "validated" && (
                      <button type="button" className="button sm" disabled={busy} onClick={() => void send({ action: "decideModel", id: m.id, decision: "validated", note: "" })}>
                        {f.validate}
                        <span className="sr-only"> : {modelLabel(m)}</span>
                      </button>
                    )}{" "}
                    {view.models.canDecide && !m.shared && m.status === "proposed" && (
                      <button type="button" className="button secondary sm" disabled={busy} onClick={() => void send({ action: "decideModel", id: m.id, decision: "refused", note: "" })}>
                        {f.refuseModel}
                        <span className="sr-only"> : {modelLabel(m)}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={f.noModels} />
      )}
    </Card>
  );
}
