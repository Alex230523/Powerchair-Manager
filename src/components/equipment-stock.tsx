"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { equipmentView } from "@/domains/equipment/service";
import { itemCategories } from "@/domains/equipment/schema";
import { stockCopy } from "./equipment-stock-copy";
import { Badge, EmptyState, Card } from "./ui";

type View = Awaited<ReturnType<typeof equipmentView>>;
type Item = View["items"][number];
type Wish = View["wishes"][number];

type Copy = (typeof stockCopy)["fr"];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const tones: Record<string, string | undefined> = {
  expired: "danger",
  soon: "warning",
  ok: "success",
  pending: "warning",
  approved: "success",
  refused: "danger",
  bought: "success",
};

export function Stock({
  locale,
  view,
  busy,
  send,
}: {
  locale: Locale;
  view: View;
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<{ id: string } | null>;
}) {
  const t = stockCopy[locale] as Copy;
  const [editing, setEditing] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const can = view.stockCan;
  if (!can.seeItems && !can.propose && !can.decide) return null;
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
  const money = (cents: number) =>
    new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const alerts = view.items.filter((i) => !i.archived && (i.expiry === "expired" || i.expiry === "soon")).length;
  function itemForm(item?: Item) {
    const id = (k: string) => `item-${item?.id ?? "new"}-${k}`;
    return (
      <form
        className="panel"
        aria-label={item?.name ?? t.addItem}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send({
            action: "item",
            ...(item ? { id: item.id, expectedVersion: item.version } : {}),
            name: String(f.get("name") ?? "").trim(),
            category: String(f.get("category")),
            quantity: Number(f.get("quantity") || 0),
            storage: String(f.get("storage") ?? "").trim(),
            expiresOn: String(f.get("expires") ?? "") || null,
            notes: String(f.get("notes") ?? "").trim(),
            archived: f.get("archived") === "on",
          }).then((r) => r && setEditing(null));
        }}
      >
        <div className="form-grid">
          <label htmlFor={id("name")}>
            {t.name}
            <input id={id("name")} name="name" required minLength={2} maxLength={120} defaultValue={item?.name} />
          </label>
          <label htmlFor={id("category")}>
            {t.category}
            <select id={id("category")} name="category" defaultValue={item?.category ?? "ball"}>
              {itemCategories.map((c) => (
                <option key={c} value={c}>
                  {t.categories[c]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("quantity")}>
            {t.quantity}
            <input id={id("quantity")} name="quantity" type="number" min={0} max={10000} required defaultValue={item?.quantity ?? 1} />
          </label>
          <label htmlFor={id("storage")}>
            {t.storage}
            <input id={id("storage")} name="storage" maxLength={120} list="storage-places-items" defaultValue={item?.storage} />
          </label>
          <label htmlFor={id("expires")}>
            {t.expires}
            <input id={id("expires")} name="expires" type="date" defaultValue={item?.expires_on ?? ""} />
          </label>
        </div>
        <datalist id="storage-places-items">
          {view.storages.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <label htmlFor={id("notes")}>
          {t.notes}
          <input id={id("notes")} name="notes" maxLength={1000} defaultValue={item?.notes} />
        </label>
        {item && (
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={item.archived} />
            {t.archived}
          </label>
        )}
        <div className="actions">
          <button className="button" disabled={busy}>
            {t.save}
          </button>
          <button type="button" className="button secondary" onClick={() => setEditing(null)}>
            {t.cancel}
          </button>
        </div>
      </form>
    );
  }
  function decide(w: Wish, decision: "approved" | "refused", form: HTMLFormElement) {
    const note = String(new FormData(form).get("note") ?? "").trim();
    void send({ action: "decideWish", id: w.id, expectedVersion: w.version, decision, note });
  }
  return (
    <>
      {can.seeItems && (
        <Card title={t.items} labelledBy="stock-items" headingId="stock-items" actions={can.items && editing !== "new" && (
              <button type="button" className="button secondary" onClick={() => setEditing("new")}>
                {t.addItem}
              </button>
            )}>
          <p className="muted">{t.itemsIntro}</p>
          {alerts > 0 && <p className="notice">{t.alerts.replace("{n}", String(alerts))}</p>}
          {editing === "new" && itemForm()}
          {!view.items.length && <EmptyState title={t.noItem} />}
          {view.items.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.name}</th>
                    <th scope="col">{t.category}</th>
                    <th scope="col">{t.quantity}</th>
                    <th scope="col">{t.storage}</th>
                    <th scope="col">{t.expires}</th>
                    {can.items && (
                      <th scope="col">
                        <span className="sr-only">{t.edit}</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {view.items.map((i) =>
                    editing === i.id ? (
                      <tr key={i.id}>
                        <td colSpan={can.items ? 6 : 5}>{itemForm(i)}</td>
                      </tr>
                    ) : (
                      <tr key={i.id} className={i.archived ? "muted" : undefined}>
                        <th scope="row">
                          {i.name}
                          {i.archived && <span className="muted small"> · {t.archived}</span>}
                          {i.notes && <span className="muted small"> · {i.notes}</span>}
                        </th>
                        <td>{t.categories[i.category]}</td>
                        <td>{i.quantity}</td>
                        <td>{i.storage || "…"}</td>
                        <td>
                          {i.expires_on ? day(i.expires_on) : "…"}{" "}
                          {i.expiry !== "none" && !i.archived && (
                            <Badge tone={tones[i.expiry]}>
                              {t.expiry[i.expiry]}
                            </Badge>
                          )}
                        </td>
                        {can.items && (
                          <td>
                            <button type="button" className="text-button" onClick={() => setEditing(i.id)}>
                              {t.edit}
                              <span className="sr-only"> : {i.name}</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {(can.propose || can.decide) && (
        <Card title={t.wishes} labelledBy="stock-wishes" headingId="stock-wishes" actions={can.propose && !proposing && (
              <button type="button" className="button secondary" onClick={() => setProposing(true)}>
                {t.propose}
              </button>
            )}>
          <p className="muted">{t.wishesIntro}</p>
          {proposing && (
            <form
              className="panel"
              aria-label={t.propose}
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const price = String(f.get("estimate") ?? "").replace(",", ".").trim();
                void send({
                  action: "wish",
                  title: String(f.get("title") ?? "").trim(),
                  reason: String(f.get("reason") ?? "").trim(),
                  quantity: Number(f.get("quantity") || 1),
                  estimatedCents: price ? Math.round(Number(price) * 100) : null,
                  link: String(f.get("link") ?? "").trim(),
                }).then((r) => r && setProposing(false));
              }}
            >
              <div className="form-grid">
                <label>
                  {t.title}
                  <input name="title" required minLength={2} maxLength={160} />
                </label>
                <label>
                  {t.quantity}
                  <input name="quantity" type="number" min={1} max={1000} defaultValue={1} required />
                </label>
                <label>
                  {t.estimate}
                  <input name="estimate" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" />
                </label>
                <label>
                  {t.link}
                  <input name="link" type="url" maxLength={500} pattern="https?://.+" />
                </label>
              </div>
              <label>
                {t.reason}
                <textarea name="reason" rows={2} maxLength={1000} />
              </label>
              <div className="actions">
                <button className="button" disabled={busy}>
                  {t.propose}
                </button>
                <button type="button" className="button secondary" onClick={() => setProposing(false)}>
                  {t.cancel}
                </button>
              </div>
            </form>
          )}
          {!view.wishes.length && <EmptyState title={t.noWish} />}
          <ul className="records">
            {view.wishes.map((w) => (
              <li key={w.id}>
                <div className="panel-head">
                  <h3>
                    {w.quantity > 1 ? `${w.quantity} × ` : ""}
                    {w.title}
                    {w.estimated_cents !== null && <span className="muted"> · {money(w.estimated_cents)}</span>}
                  </h3>
                  <Badge tone={tones[w.status]}>
                    {t.statuses[w.status]}
                  </Badge>
                </div>
                <p className="muted small">
                  {t.askedBy.replace("{name}", w.requested_by)} · {day(w.created_at)}
                  {w.decided_by && ` · ${t.decidedBy.replace("{name}", w.decided_by)}`}
                  {w.bought_on && ` · ${t.boughtOn.replace("{d}", day(w.bought_on))}`}
                </p>
                {w.reason && <p>{w.reason}</p>}
                {w.decision_note && <p className="muted">{w.decision_note}</p>}
                {w.link && (
                  <p>
                    <a href={w.link} target="_blank" rel="noopener noreferrer">
                      {w.link}
                    </a>
                  </p>
                )}
                {w.status === "pending" && can.decide && (
                  <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
                    <label>
                      {t.note}
                      <input name="note" maxLength={1000} />
                    </label>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={(e) => decide(w, "approved", e.currentTarget.form!)}
                    >
                      {t.approve}
                      <span className="sr-only"> : {w.title}</span>
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={(e) => decide(w, "refused", e.currentTarget.form!)}
                    >
                      {t.refuse}
                      <span className="sr-only"> : {w.title}</span>
                    </button>
                  </form>
                )}
                <div className="row-actions">
                  {w.status === "approved" && (can.items || can.decide) && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => void send({ action: "boughtWish", id: w.id, expectedVersion: w.version, boughtOn: today })}
                    >
                      {t.bought}
                      <span className="sr-only"> : {w.title}</span>
                    </button>
                  )}
                  {w.status === "pending" && w.mine && (
                    <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "cancelWish", id: w.id })}>
                      {t.withdraw}
                      <span className="sr-only"> : {w.title}</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
