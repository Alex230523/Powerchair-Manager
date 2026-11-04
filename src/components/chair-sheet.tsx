"use client";
import { equipmentMoreCopy } from "./equipment-more-copy";
import Link from "next/link";
import { ContactPicker } from "./contact-picker";
import { crmCopy } from "./crm-copy";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";
import type { equipmentView } from "@/domains/equipment/service";
import { chairStatuses, holdingLoan, modelLabel, overMatchSpeed, ownerships, serviceState } from "@/domains/equipment/schema";
import { equipmentCopy } from "./equipment-copy";
import { fleetCopy, fill } from "./fleet-copy";
import { errors } from "./access-copy";
import { Badge, EmptyState, PageHeader, Tabs } from "./ui";
import { Icon } from "./icons";
import { LoanActions, loanTone } from "./fleet";
import { ChairQr, ChairWorkshop, ReportBreakdown } from "./workshop";
import { workshopCopy } from "./workshop-copy";
import { ChairCompliance } from "./chair-compliance";
import { knowledgeCopy } from "./knowledge-copy";

export type View = Awaited<ReturnType<typeof equipmentView>>;
export type Chair = View["chairs"][number];
export type Send = (body: Record<string, unknown>) => Promise<{ id: string; undo?: string } | null>;
export const brusselsToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
export const dayOf = (locale: Locale, d: string | null) =>
  d ? new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "…";
const statusTones = { available: "success", in_use: "", maintenance: "warning", out_of_service: "danger", lent: "info", retired: "neutral" } as const;
const serviceTones = { ok: "success", soon: "warning", due: "danger", unknown: "" } as const;

/** The model of a chair, with « En attente de validation » while the federation has not decided. */
export function ModelCell({
  locale,
  chair,
  onChoose,
  name,
}: {
  locale: Locale;
  chair: Pick<Chair, "model_name" | "model_brand" | "model_status" | "model" | "brand">;
  /** 11: « Choisir le modèle » for a chair without one, or one still waiting. */
  onChoose?: () => void;
  name?: string;
}) {
  const f = fleetCopy[locale],
    m = equipmentMoreCopy[locale];
  const choose = onChoose && (
    <>
      {" "}
      <button type="button" className="text-button small" aria-label={name ? m.chooseModelOf(name) : m.chooseModel} onClick={onChoose}>
        {m.chooseModel}
      </button>
    </>
  );
  if (!chair.model_name)
    return (
      <>
        {chair.model ? [chair.brand, chair.model].filter(Boolean).join(" · ") : <span className="muted">{f.noModel}</span>} <Badge tone="warning">{m.noModel}</Badge>
        {choose}
      </>
    );
  return (
    <>
      {modelLabel({ brand: chair.model_brand ?? "", name: chair.model_name })}
      {chair.model_status && chair.model_status !== "validated" && (
        <>
          {" "}
          <Badge tone={chair.model_status === "refused" ? "danger" : "warning"}>{f.modelStatus[chair.model_status]}</Badge>
          {choose}
        </>
      )}
    </>
  );
}

/** The loan holding a chair today or next (lender side), for its badge. */
export function currentLoan(view: View, chairId: string) {
  return view.loans.lent.filter((l) => l.chair_id === chairId && (l.status === "accepted" || l.status === "ongoing")).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
}
export function LoanBadge({ locale, view, chairId }: { locale: Locale; view: View; chairId: string }) {
  const f = fleetCopy[locale];
  const l = currentLoan(view, chairId);
  if (!l) return null;
  return l.status === "ongoing" ? (
    <Badge tone="info">{fill(f.lentTo, { club: l.borrower, date: dayOf(locale, l.ends_on) })}</Badge>
  ) : (
    <Badge tone="neutral">{fill(f.reservedFor, { club: l.borrower, from: dayOf(locale, l.starts_on), to: dayOf(locale, l.ends_on) })}</Badge>
  );
}

/**
 * Wave 17 (Q1): a chair's sheet, in a window from the list (or as a full
 * page): its model and purchase date first, then Modifier, Prêter,
 * Entretien and Historique for the people who manage the material.
 */
export function ChairSheet({ locale, view, chair, busy, send, reload }: { locale: Locale; view: View; chair: Chair; busy: boolean; send: Send; reload?: () => Promise<void> }) {
  const t = equipmentCopy[locale],
    f = fleetCopy[locale];
  const [tab, setTab] = useState<"facts" | "edit" | "lend" | "service" | "workshop" | "history">("facts");
  const today = brusselsToday();
  const service = serviceState(chair.next_service_on, today, chair.status);
  // B3: « Atelier » (interventions, batteries, speed, funding, cost) for the club's material managers.
  const tabs = (["facts", "edit", "lend", "service", "workshop", "history"] as const).filter(
    (k) => k === "facts" || (view.manage && (k !== "lend" || chair.status !== "retired") && (k !== "workshop" || view.kind === "club")),
  );
  const panel = `chair-panel-${chair.id}`;
  return (
    <div className="chair-sheet">
      <dl className="chair-key">
        <div>
          <dt>{f.cols.model}</dt>
          <dd>
            <ModelCell locale={locale} chair={chair} />
            {/* G4: the model's sheet in the guide's catalogue. */}
            {chair.model_id && chair.model_status === "validated" && (
              <>
                {" "}
                <Link href={`/${locale}/guide/chairs/${chair.model_id}`}>{knowledgeCopy[locale].chairs.modelLink}</Link>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{f.acquired}</dt>
          <dd>{dayOf(locale, chair.acquired_on)}</dd>
        </div>
        <div>
          <dt>{t.status}</dt>
          <dd>
            <Badge tone={statusTones[chair.status as keyof typeof statusTones]}>{t.statuses[chair.status as keyof typeof t.statuses]}</Badge> <LoanBadge locale={locale} view={view} chairId={chair.id} />
          </dd>
        </div>
      </dl>
      {tabs.length > 1 && (
        <Tabs label={chair.name} items={tabs.map((k) => ({ id: k, label: k === "workshop" ? workshopCopy[locale].tab : f.sheetTabs[k] }))} value={tab} onChange={(v) => setTab(v as typeof tab)} panelId={panel} idPrefix={`chair-tab-${chair.id}`} />
      )}
      <div id={panel} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `chair-tab-${chair.id}-${tab}` : undefined}>
        {tab === "facts" && (
          <dl className="chair-facts">
            <dt>{t.ownership}</dt>
            <dd>{t.ownerships[chair.ownership as keyof typeof t.ownerships]}</dd>
            {chair.serial_number && (
              <>
                <dt>{t.serial}</dt>
                <dd>{chair.serial_number}</dd>
              </>
            )}
            <dt>{t.speed}</dt>
            <dd>
              {chair.max_speed_kmh ? `${Number(chair.max_speed_kmh)} km/h` : "…"} {overMatchSpeed(chair.max_speed_kmh) && <Badge tone="warning">{t.overSpeed}</Badge>}
            </dd>
            {chair.battery && (
              <>
                <dt>{t.battery}</dt>
                <dd>{chair.battery}</dd>
              </>
            )}
            <dt>{f.cols.place}</dt>
            <dd>{chair.storage_name ?? (chair.storage || "…")}</dd>
            <dt>{t.nextService}</dt>
            <dd>
              {dayOf(locale, chair.next_service_on)} {chair.status !== "retired" && <Badge tone={serviceTones[service]}>{t.service[service]}</Badge>}
            </dd>
            <dt>{t.players}</dt>
            <dd>
              {chair.links.filter((l) => !l.ends_on).length
                ? chair.links
                    .filter((l) => !l.ends_on)
                    .map((l, i) => (
                      <span key={l.id}>
                        {i > 0 && ", "}
                        <Link href={`/${locale}/players/${l.profile_id}`}>{l.full_name}</Link>
                        {l.is_primary && <> ({t.primary.toLocaleLowerCase()})</>}
                      </span>
                    ))
                : t.noPlayers}
              {chair.others > 0 && ` + ${chair.others} ${t.others}`}
            </dd>
            {view.manage && (
              <>
                <dt>{f.lendable}</dt>
                <dd>{chair.lendable ? "✓" : "…"}</dd>
              </>
            )}
            {chair.notes && (
              <>
                <dt>{t.notes}</dt>
                <dd>{chair.notes}</dd>
              </>
            )}
          </dl>
        )}
        {tab === "facts" && view.kind === "club" && chair.status !== "retired" && (
          <ReportBreakdown locale={locale} chairId={chair.id} chairName={chair.name} organizationId={view.context.organization_id} done={() => void reload?.()} />
        )}
        {tab === "facts" && view.kind === "club" && view.manage && chair.status !== "retired" && <ChairQr locale={locale} chairId={chair.id} chairName={chair.name} />}
        {/* Guide, Le fauteuil de match: « Conforme pour un match », ticked at a service. */}
        {tab === "facts" && view.kind === "club" && chair.status !== "retired" && <ChairCompliance locale={locale} chairId={chair.id} today={today} />}
        {tab === "workshop" && <ChairWorkshop locale={locale} chairId={chair.id} />}
        {tab === "edit" && <ChairForm key={chair.id + chair.version} locale={locale} view={view} chair={chair} busy={busy} send={send} />}
        {tab === "lend" && <LendPanel locale={locale} view={view} chair={chair} busy={busy} send={send} />}
        {tab === "service" && (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void send({ action: "service", chairId: chair.id, expectedVersion: chair.version, doneOn: d.get("done"), nextOn: d.get("next") || null, note: String(d.get("note") ?? "") });
            }}
          >
            <p>
              {t.lastService} : {dayOf(locale, chair.last_service_on)} · {t.nextService} : {dayOf(locale, chair.next_service_on)}{" "}
              {chair.status !== "retired" && <Badge tone={serviceTones[service]}>{t.service[service]}</Badge>}
            </p>
            <div className="form-grid">
              <label>
                {f.serviceDone}
                <input type="date" name="done" required defaultValue={today} max={today} />
              </label>
              <label>
                {f.serviceNext}
                <input type="date" name="next" min={today} />
              </label>
            </div>
            <label>
              {f.serviceNote}
              <input name="note" maxLength={500} />
            </label>
            <p>
              <button className="button" disabled={busy}>
                {f.markService}
              </button>
            </p>
          </form>
        )}
        {tab === "history" && <History locale={locale} view={view} chair={chair} />}
      </div>
    </div>
  );
}

function History({ locale, view, chair }: { locale: Locale; view: View; chair: Chair }) {
  const f = fleetCopy[locale];
  const rows = view.history.filter((h) => h.chair_id === chair.id);
  if (!rows.length) return <EmptyState title={f.noHistory} />;
  const when = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
  return (
    <ul className="records chair-history">
      {rows.map((h, i) => {
        const d = (h.details ?? {}) as Record<string, string | null>;
        const extra = [d.borrower, d.starts_on && d.ends_on ? fill(f.fromTo, { from: dayOf(locale, d.starts_on), to: dayOf(locale, d.ends_on) }) : null, d.condition, d.note].filter(Boolean).join(" · ");
        return (
          <li key={i}>
            <strong>{f.history[h.action] ?? h.action}</strong>
            <span className="muted">
              {" "}
              · {when(h.created_at)} · {h.actor}
            </span>
            {extra && <p className="muted small">{extra}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function LendPanel({ locale, view, chair, busy, send }: { locale: Locale; view: View; chair: Chair; busy: boolean; send: Send }) {
  const t = equipmentCopy[locale],
    f = fleetCopy[locale];
  const today = brusselsToday();
  const loans = view.loans.lent.filter((l) => l.chair_id === chair.id && holdingLoan(l.status));
  return (
    <div className="lend-panel">
      <section aria-labelledby={`to-player-${chair.id}`}>
        <h3 id={`to-player-${chair.id}`}>{f.toPlayer}</h3>
        {chair.links.filter((l) => !l.ends_on).length > 0 && (
          <ul className="records">
            {chair.links
              .filter((l) => !l.ends_on)
              .map((l) => (
                <li key={l.id} className="link-row">
                  <span>
                    <strong>{l.full_name}</strong> · {t.since} {dayOf(locale, l.starts_on)}
                    {l.is_primary && <Badge tone="success">{t.primary}</Badge>}
                  </span>
                  <button type="button" className="button secondary sm" disabled={busy} onClick={() => void send({ action: "unassign", id: l.id, endsOn: today })}>
                    {t.unlink}
                    <span className="sr-only"> : {l.full_name}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
        {view.players.length > 0 ? (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void send({ action: "assign", chairId: chair.id, profileId: d.get("profile"), primary: d.get("primary") === "on", startsOn: d.get("from") });
            }}
          >
            <div className="form-grid">
              <label>
                {t.player}
                <select name="profile" required>
                  <option value="">{t.player}</option>
                  {view.players
                    .filter((p) => !chair.links.some((l) => !l.ends_on && l.profile_id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {t.from}
                <input type="date" name="from" defaultValue={today} required />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" name="primary" />
              {t.primary} ({t.primaryHint.toLocaleLowerCase()})
            </label>
            <p>
              <button className="button" disabled={busy}>
                {t.assign}
              </button>
            </p>
          </form>
        ) : (
          <p className="muted">{t.noPlayers}</p>
        )}
        {chair.links.some((l) => l.ends_on) && (
          <>
            <h4>{t.past}</h4>
            <ul className="plain-list muted">
              {chair.links
                .filter((l) => l.ends_on)
                .map((l) => (
                  <li key={l.id}>{`${l.full_name} · ${fill(f.fromTo, { from: dayOf(locale, l.starts_on), to: dayOf(locale, l.ends_on) })}`}</li>
                ))}
            </ul>
          </>
        )}
      </section>
      {view.loans.can && (
        <section aria-labelledby={`to-club-${chair.id}`}>
          <h3 id={`to-club-${chair.id}`}>{f.toClub}</h3>
          {loans.length > 0 && (
            <ul className="records">
              {loans.map((l) => (
                <li key={l.id}>
                  <strong>{l.borrower}</strong> · {fill(f.fromTo, { from: dayOf(locale, l.starts_on), to: dayOf(locale, l.ends_on) })} <Badge tone={loanTone[l.status]}>{f.loanStatus[l.status]}</Badge>
                  <LoanActions locale={locale} loan={l} side="lender" busy={busy} send={send} />
                </li>
              ))}
            </ul>
          )}
          {view.loans.partners.length ? (
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const deposit = String(d.get("deposit") ?? "").replace(",", ".").trim();
                void send({
                  action: "lend",
                  chairId: chair.id,
                  borrowerId: d.get("borrower"),
                  startsOn: d.get("starts"),
                  endsOn: d.get("ends"),
                  conditions: String(d.get("conditions") ?? ""),
                  depositCents: deposit ? Math.round(Number(deposit) * 100) : null,
                });
              }}
            >
              <div className="form-grid">
                <label>
                  {f.borrower}
                  <select name="borrower" required defaultValue="">
                    <option value="" disabled>
                      {f.borrower}
                    </option>
                    {view.loans.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {f.starts}
                  <input type="date" name="starts" required min={today} defaultValue={today} />
                </label>
                <label>
                  {f.ends}
                  <input type="date" name="ends" required min={today} />
                </label>
                <label>
                  {f.deposit}
                  <input name="deposit" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" />
                </label>
              </div>
              <label>
                {f.conditions}
                <textarea name="conditions" rows={2} maxLength={1000} />
              </label>
              <p>
                <button className="button" disabled={busy}>
                  {f.lendButton}
                </button>
              </p>
            </form>
          ) : (
            <p className="muted">{f.noPartner}</p>
          )}
        </section>
      )}
    </div>
  );
}

/** Add or edit a chair: model and purchase date required, a storage place, « Prêtable ». */
export function ChairForm({ locale, view, chair, busy, send, onDone }: { locale: Locale; view: View; chair?: Chair; busy: boolean; send: Send; onDone?: (id: string) => void }) {
  const t = equipmentCopy[locale],
    f = fleetCopy[locale];
  const [model, setModel] = useState(chair?.model_id ?? "");
  const id = (k: string) => `chair-${chair?.id ?? "new"}-${k}`;
  const models = view.models.list.filter((m) => m.status === "validated" || m.mine || m.id === chair?.model_id);
  const places = view.storage.places.filter((p) => !p.archived || p.id === chair?.storage_location_id);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const v = (k: string) => String(d.get(k) ?? "").trim();
    void send({
      action: "chair",
      ...(chair ? { id: chair.id, expectedVersion: chair.version } : {}),
      name: v("name"),
      brand: chair?.brand ?? "",
      model: chair?.model ?? "",
      modelId: model && model !== "new" ? model : null,
      newModel: model === "new" ? { brand: v("newBrand"), name: v("newName") } : null,
      serialNumber: v("serial"),
      ownership: v("ownership"),
      status: v("status"),
      maxSpeedKmh: v("speed") === "" ? null : Number(v("speed")),
      battery: v("battery"),
      acquiredOn: v("acquired") || null,
      lastServiceOn: v("last") || null,
      nextServiceOn: v("next") || null,
      notes: v("notes"),
      storageLocationId: v("place") || null,
      lendable: d.get("lendable") === "on",
      // A4: absent when the club's contact book is not reachable (the link stays).
      ...(d.has("supplier") ? { supplierContactId: v("supplier") || null } : {}),
    }).then((r) => r && onDone?.(r.id));
  }
  return (
    <form className="stack-form chair-form" onSubmit={submit}>
      <div className="form-grid">
        <label htmlFor={id("name")}>
          {t.name}
          <input id={id("name")} name="name" required minLength={2} maxLength={80} defaultValue={chair?.name} />
        </label>
        <label htmlFor={id("model")}>
          {f.model} <span className="muted small">({f.required})</span>
          <select id={id("model")} name="modelId" required value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="" disabled>
              {f.chooseModel}
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {modelLabel(m)}
                {m.status !== "validated" ? ` (${f.modelStatus[m.status]})` : ""}
              </option>
            ))}
            <option value="new">{f.proposeModel}</option>
          </select>
        </label>
        <label htmlFor={id("acquired")}>
          {f.acquired} <span className="muted small">({f.required})</span>
          <input id={id("acquired")} name="acquired" type="date" required defaultValue={chair?.acquired_on ?? ""} />
        </label>
      </div>
      {model === "new" && (
        <fieldset className="propose-model">
          <legend>{f.proposeModel.replace("…", "")}</legend>
          <p className="field-help" id={id("propose-help")}>
            {f.proposeHint}
          </p>
          <div className="form-grid">
            <label htmlFor={id("newBrand")}>
              {f.newBrand}
              <input id={id("newBrand")} name="newBrand" maxLength={80} aria-describedby={id("propose-help")} />
            </label>
            <label htmlFor={id("newName")}>
              {f.newName}
              <input id={id("newName")} name="newName" required minLength={2} maxLength={80} aria-describedby={id("propose-help")} />
            </label>
          </div>
        </fieldset>
      )}
      <div className="form-grid">
        <label htmlFor={id("serial")}>
          {t.serial}
          <input id={id("serial")} name="serial" maxLength={80} defaultValue={chair?.serial_number} />
        </label>
        <label htmlFor={id("ownership")}>
          {t.ownership}
          <select id={id("ownership")} name="ownership" defaultValue={chair?.ownership ?? "club"}>
            {ownerships.map((o) => (
              <option key={o} value={o}>
                {t.ownerships[o]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id("status")}>
          {t.status}
          <select id={id("status")} name="status" defaultValue={chair?.status ?? "available"}>
            {chairStatuses.map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id("speed")}>
          {t.speed}
          <input id={id("speed")} name="speed" type="number" min="0" max="20" step="0.1" aria-describedby={id("speed-hint")} defaultValue={chair?.max_speed_kmh ?? ""} />
          <span id={id("speed-hint")} className="field-help">
            {t.speedHint}
          </span>
        </label>
        <label htmlFor={id("battery")}>
          {t.battery}
          <input id={id("battery")} name="battery" maxLength={120} defaultValue={chair?.battery} />
        </label>
        <label htmlFor={id("place")}>
          {f.cols.place}
          <select id={id("place")} name="place" defaultValue={chair?.storage_location_id ?? ""}>
            <option value="">{f.noPlace}</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id("last")}>
          {t.lastService}
          <input id={id("last")} name="last" type="date" defaultValue={chair?.last_service_on ?? ""} />
        </label>
        <label htmlFor={id("next")}>
          {t.nextService}
          <input id={id("next")} name="next" type="date" defaultValue={chair?.next_service_on ?? ""} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="lendable" defaultChecked={chair?.lendable ?? false} aria-describedby={id("lendable-help")} />
        {f.lendable}
      </label>
      <p className="field-help" id={id("lendable-help")}>
        {f.lendableHint}
      </p>
      {view.kind === "club" && <ContactPicker locale={locale} name="supplier" value={chair?.supplier_contact_id ?? null} label={crmCopy[locale].supplier} none={crmCopy[locale].nobody} />}
      <label htmlFor={id("notes")}>
        {t.notes}
        <textarea id={id("notes")} name="notes" maxLength={2000} defaultValue={chair?.notes} />
      </label>
      <p>
        <button className="button" disabled={busy}>
          {t.save}
        </button>
      </p>
    </form>
  );
}

/** The sheet in a window; « Agrandir » opens the same sheet as a full page (a link one can share). */
export function ChairDialog({ locale, view, chair, busy, send, close, reload }: { locale: Locale; view: View; chair: Chair; busy: boolean; send: Send; close: () => void; reload?: () => Promise<void> }) {
  const f = fleetCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="player-dialog sheet-dialog" aria-labelledby="chair-sheet-title" onCancel={close}>
      <div className="dialog-heading sheet-heading">
        <h2 id="chair-sheet-title">{chair.label ?? chair.name}</h2>
        <div className="sheet-tools">
          <button
            type="button"
            className="button secondary sm"
            aria-label={fill(f.expandOf, { name: chair.name })}
            onClick={() => {
              ref.current?.close();
              router.push(`/${locale}/equipment/${chair.id}`);
            }}
          >
            <Icon name="arrow" size={16} />
            {f.expand}
          </button>
          <button type="button" className="button secondary sm" onClick={close}>
            <Icon name="close" size={16} />
            {f.close}
          </button>
        </div>
      </div>
      <ChairSheet locale={locale} view={view} chair={chair} busy={busy} send={send} reload={reload} />
    </dialog>
  );
}

/** A new chair, in a window. */
export function NewChairDialog({ locale, view, busy, send, close, opened }: { locale: Locale; view: View; busy: boolean; send: Send; close: () => void; opened: (id: string) => void }) {
  const f = fleetCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="player-dialog sheet-dialog" aria-labelledby="new-chair-title" onCancel={close}>
      <div className="dialog-heading sheet-heading">
        <h2 id="new-chair-title">{f.addChair}</h2>
        <button type="button" className="button secondary sm" onClick={close}>
          <Icon name="close" size={16} />
          {f.close}
        </button>
      </div>
      <ChairForm locale={locale} view={view} busy={busy} send={send} onDone={opened} />
    </dialog>
  );
}

/** /equipment/[id]: the same sheet as a full page. */
export function ChairPage({ locale, id }: { locale: Locale; id: string }) {
  const t = equipmentCopy[locale],
    f = fleetCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const failure = useCallback((code: string) => f.errors[code] ?? t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [f, t, locale]);
  const load = useCallback(async () => {
    const r = await fetch("/api/equipment", { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }, []);
  // The first load inside the effect, its state set in the promise only (React rule: no synchronous setState in an effect).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/equipment", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [failure]);
  const send: Send = async (body) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.context.organization_id }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(f.saved);
      return v;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const chair = view?.chairs.find((c) => c.id === id);
  return (
    <main id="main" className="access equipment">
      <p>
        <Link href={`/${locale}/equipment`}>← {f.back}</Link>
      </p>
      <PageHeader title={chair?.name ?? t.title} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && !chair && <EmptyState title={f.notFound} />}
      {view && chair && <ChairSheet locale={locale} view={view} chair={chair} busy={busy} send={send} reload={load} />}
    </main>
  );
}
