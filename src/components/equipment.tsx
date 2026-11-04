"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import { chairStatuses, serviceState } from "@/domains/equipment/schema";
import { equipmentCopy } from "./equipment-copy";
import { fleetCopy } from "./fleet-copy";
import { errors } from "./access-copy";
import { type IconName } from "./icons";
import { Stock } from "./equipment-stock";
import { undoToast } from "./toast";
import { toastCopy } from "./toast-copy";
import { Badge, EmptyState, ExportButton, PageHeader, KpiCard, Tabs } from "./ui";
import { setupCopy } from "./setup-copy";
import { ChairDialog, LoanBadge, ModelCell, NewChairDialog, brusselsToday, dayOf, type View } from "./chair-sheet";
import { BorrowedChairs, LendingTab, ModelsTab, PlacesTab } from "./fleet";
import { WorkshopOverview } from "./workshop";
import { CategoriesCard, DirectLoans, LendDialog } from "./equipment-more";
import { equipmentMoreCopy } from "./equipment-more-copy";
import { workshopCopy } from "./workshop-copy";

const tones = {
  available: "success",
  in_use: "",
  maintenance: "warning",
  out_of_service: "danger",
  lent: "info",
  retired: "neutral",
} as const;
const serviceTones = {
  ok: "success",
  soon: "warning",
  due: "danger",
  unknown: "",
} as const;
type Tab = "chairs" | "workshop" | "small" | "lending" | "places" | "models";

/**
 * Equipment. Wave 17 (Q1): tabs « Fauteuils », « Petit matériel », « Prêts
 * entre clubs », « Lieux de stockage » (and « Modèles de fauteuils » for the
 * federation, whose own fleet uses the same screens). A chair's sheet opens
 * in a window from its name.
 */
export function Equipment({ locale }: { locale: Locale }) {
  const t = equipmentCopy[locale],
    f = fleetCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("active"),
    [model, setModel] = useState(""),
    [place, setPlace] = useState(""),
    [tab, setTab] = useState<Tab>("chairs"),
    // 11: « Prêter » from a row.
    [lending, setLending] = useState<{ chairId?: string; itemId?: string } | null>(null);
  const today = brusselsToday();
  const failure = (code: string) => equipmentMoreCopy[locale].errors[code] ?? f.errors[code] ?? t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;

  const scope = useScope();
  const scopedUrl = "/api/equipment" + (scope.teamId ? `?team=${scope.teamId}` : "");
  async function load() {
    const r = await fetch(scopedUrl, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(scopedUrl, { cache: "no-store" })
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
    // The copy only changes with the locale, which reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedUrl]);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: view?.context.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(t.saved);
      // Retiring a chair can be undone for a moment (wave 15, C10).
      if (v?.undo) undoToast(locale, toastCopy[locale].chairRetired, v.undo, view?.context.organization_id, load);
      return v as { id: string; undo?: string };
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const chairs =
    view?.chairs.filter(
      (c) =>
        (status === "all" || (status === "active" ? c.status !== "retired" : c.status === status)) &&
        (!model || c.model_id === model) &&
        (!place || c.storage_location_id === place) &&
        [c.name, c.brand, c.model, c.model_name ?? "", ...c.links.map((l) => l.full_name)].join(" ").toLocaleLowerCase().includes(q.toLocaleLowerCase()),
    ) ?? [];
  const live = view?.chairs.filter((c) => c.status !== "retired") ?? [];
  const current = view?.chairs.find((c) => c.id === open);
  const usedModels = view ? [...new Map(view.chairs.filter((c) => c.model_id).map((c) => [c.model_id!, c.model_name ?? ""])).entries()] : [];
  const tabs: Tab[] = view
    ? [
        "chairs",
        // B3: the club's workshop, for the material managers and the coaches (chairs for their events).
        ...(view.kind === "club" && (view.manage || view.context.role === "coach") ? (["workshop"] as const) : []),
        ...(view.stockCan.seeItems || view.stockCan.propose || view.stockCan.decide ? (["small"] as const) : []),
        ...(view.loans.can || view.manage ? (["lending"] as const) : []),
        ...(view.storage.can || view.storage.places.length ? (["places"] as const) : []),
        ...(view.models.canDecide ? (["models"] as const) : []),
      ]
    : ["chairs"];

  return (
    <main id="main" className="access equipment">
      <PageHeader
        title={t.title}
        subtitle={view?.kind === "federation" ? f.fleetIntro : t.intro}
        actions={
          view?.manage && tab === "chairs" ? (
            <button
              className="button"
              type="button"
              onClick={() => {
                setOpen("new");
                setMessage("");
              }}
            >
              {f.addChair}
            </button>
          ) : undefined
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p>{t.loading}</p>}
      {view && !view.manage && <p className="notice">{t.readOnly}</p>}
      {/* 19: « Signaler un problème sur un fauteuil » from the equipment page. */}
      {view?.kind === "club" && view.chairs.some((c) => c.status !== "retired") && (
        <ReportChooser locale={locale} chairs={view.chairs.filter((c) => c.status !== "retired").map((c) => ({ id: c.id, name: c.name }))} />
      )}
      {view && (
        <>
          {/* 11: two groups of tabs: what we own, and where it is and with whom; the models for the federation. */}
          {tabs.length > 1 && (
            <div className="tab-groups">
              {(
                [
                  ["owned", tabs.filter((k) => k === "chairs" || k === "workshop" || k === "small")],
                  ["where", tabs.filter((k) => k === "lending" || k === "places")],
                  ["models", tabs.filter((k) => k === "models")],
                ] as const
              )
                .filter(([, list]) => list.length)
                .map(([group, list]) => (
                  <div key={group} className="tab-group">
                    {group !== "models" && <span className="tab-group-label" aria-hidden="true">{equipmentMoreCopy[locale][group]}</span>}
                    <Tabs
                      label={group === "models" ? f.tabs.models : equipmentMoreCopy[locale][group]}
                      items={list.map((k) => ({ id: k, label: k === "workshop" ? workshopCopy[locale].tab : f.tabs[k] }))}
                      value={list.includes(tab as never) ? tab : ""}
                      onChange={(v) => setTab(v as Tab)}
                      panelId="equipment-panel"
                      idPrefix="equipment-tab"
                    />
                  </div>
                ))}
            </div>
          )}
          <div id="equipment-panel" role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `equipment-tab-${tab}` : undefined}>
            {tab === "chairs" && (
              <>
                {view.manage && (
                  <ul className="stat-row-grid" data-cols="4">
                    {(
                      [
                        [t.summaryActive, live.length, "wheelchair"],
                        [t.summaryInUse, live.filter((c) => c.status === "in_use").length, "players"],
                        [t.summaryAvailable, live.filter((c) => c.status === "available").length, "check"],
                        [t.summaryService, live.filter((c) => ["soon", "due"].includes(serviceState(c.next_service_on, today, c.status))).length, "wrench"],
                      ] as [string, number, IconName][]
                    ).map(([label, value, icon]) => (
                      <li key={label}>
                        <KpiCard label={label} value={String(value)} icon={icon} tone={icon === "wrench" && value ? "warning" : "primary"} />
                      </li>
                    ))}
                  </ul>
                )}
                <form className="directory-filters" onSubmit={(e) => e.preventDefault()}>
                  <label>
                    {t.search}
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t.name}, ${f.model}, ${t.player}`} />
                  </label>
                  <label>
                    {t.status}
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="active">{t.current}</option>
                      <option value="all">{t.all}</option>
                      {chairStatuses.map((s) => (
                        <option key={s} value={s}>
                          {t.statuses[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {usedModels.length > 1 && (
                    <label>
                      {f.model}
                      <select value={model} onChange={(e) => setModel(e.target.value)}>
                        <option value="">{f.allModels}</option>
                        {usedModels.map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {view.storage.places.length > 0 && (
                    <label>
                      {f.place}
                      <select value={place} onChange={(e) => setPlace(e.target.value)}>
                        <option value="">{f.allPlaces}</option>
                        {view.storage.places.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {/* Wave 17 (G2): the chairs shown, with their filters. */}
                  <ExportButton
                    locale={locale}
                    organizationId={view.context.organization_id}
                    dataset="equipment"
                    subject={t.title}
                    rows={chairs}
                    columns={[
                      { id: "name", label: t.name, value: (c) => c.name },
                      { id: "model", label: t.model, value: (c) => c.model_name ?? c.model },
                      { id: "brand", label: t.brand, value: (c) => c.model_brand || c.brand },
                      { id: "acquired", label: f.acquired, type: "date", value: (c) => c.acquired_on },
                      { id: "serial", label: t.serial, value: (c) => c.serial_number },
                      { id: "ownership", label: t.ownership, value: (c) => t.ownerships[c.ownership as "club" | "player" | "loan"] ?? c.ownership },
                      { id: "status", label: t.status, value: (c) => t.statuses[c.status as keyof typeof t.statuses] ?? c.status },
                      { id: "players", label: t.players, value: (c) => c.links.filter((l) => !l.ends_on).map((l) => l.full_name).join(", ") },
                      { id: "storage", label: t.storage, value: (c) => c.storage_name ?? c.storage },
                      { id: "lastService", label: t.lastService, type: "date", value: (c) => c.last_service_on },
                      { id: "nextService", label: t.nextService, type: "date", value: (c) => c.next_service_on },
                    ]}
                  />
                </form>
                {chairs.length ? (
                  <div className="table-scroll" role="region" aria-label={f.tabs.chairs} tabIndex={0}>
                    <table className="ledger chair-list">
                      <thead>
                        <tr>
                          <th scope="col">{f.cols.name}</th>
                          <th scope="col">{f.cols.model}</th>
                          <th scope="col">{f.cols.acquired}</th>
                          <th scope="col">{f.cols.status}</th>
                          <th scope="col">{f.cols.players}</th>
                          <th scope="col">{f.cols.place}</th>
                          <th scope="col">{f.cols.nextService}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chairs.map((c) => {
                          const service = serviceState(c.next_service_on, today, c.status);
                          return (
                            <tr key={c.id}>
                              <th scope="row">
                                <button type="button" className="text-button chair-open" onClick={() => setOpen(c.id)}>
                                  {c.name}
                                </button>
                                <LoanBadge locale={locale} view={view} chairId={c.id} />
                                {view.manage && c.status !== "retired" && (
                                  <button type="button" className="text-button small" aria-label={equipmentMoreCopy[locale].lendOf(c.name)} onClick={() => setLending({ chairId: c.id })}>
                                    {equipmentMoreCopy[locale].lend}
                                  </button>
                                )}
                              </th>
                              <td>
                                <ModelCell locale={locale} chair={c} onChoose={view.manage ? () => setOpen(c.id) : undefined} name={c.name} />
                              </td>
                              <td>{dayOf(locale, c.acquired_on)}</td>
                              <td>
                                <Badge tone={tones[c.status as keyof typeof tones]}>{t.statuses[c.status as keyof typeof t.statuses]}</Badge>
                              </td>
                              <td>
                                {c.links
                                  .filter((l) => !l.ends_on)
                                  .map((l) => l.full_name)
                                  .join(", ") || <span className="muted">{t.noPlayers}</span>}
                                {c.others > 0 && <span className="muted"> + {c.others}</span>}
                              </td>
                              <td>{c.storage_name ?? (c.storage || "…")}</td>
                              <td>
                                {dayOf(locale, c.next_service_on)} {c.status !== "retired" && <Badge tone={serviceTones[service]}>{t.service[service]}</Badge>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title={view.manage ? t.empty : t.emptyOwn}
                    action={
                      view.manage && (
                        <button className="button" type="button" onClick={() => setOpen("new")}>
                          {setupCopy[locale].empty.equipment}
                        </button>
                      )
                    }
                  />
                )}
                <BorrowedChairs locale={locale} view={view} />
              </>
            )}
            {tab === "small" && (
              <>
                <Stock locale={locale} view={view} busy={busy} send={send} reload={load} lend={(itemId) => setLending({ itemId })} />
                <CategoriesCard locale={locale} view={view} busy={busy} send={send} />
              </>
            )}
            {tab === "lending" && (
              <>
                <DirectLoans locale={locale} view={view} busy={busy} send={send} />
                {view.loans.can && <LendingTab locale={locale} view={view} busy={busy} send={send} />}
              </>
            )}
            {tab === "places" && <PlacesTab locale={locale} view={view} busy={busy} send={send} />}
            {tab === "workshop" && <WorkshopOverview locale={locale} />}
            {tab === "models" && <ModelsTab locale={locale} view={view} busy={busy} send={send} />}
          </div>
          {open === "new" && view.manage && <NewChairDialog locale={locale} view={view} busy={busy} send={send} close={() => setOpen("")} opened={(id) => setOpen(id)} />}
          {lending && <LendDialog locale={locale} view={view} initial={lending} busy={busy} send={send} close={() => setLending(null)} />}
          {current && <ChairDialog key={current.id} locale={locale} view={view} chair={current} busy={busy} send={send} close={() => setOpen("")} reload={load} />}
        </>
      )}
    </main>
  );
}

function ReportChooser({ locale, chairs }: { locale: Locale; chairs: { id: string; name: string }[] }) {
  const t = workshopCopy[locale];
  const router = useRouter();
  return (
    <form
      id="report"
      className="inline-form report-chooser"
      onSubmit={(e) => {
        e.preventDefault();
        const id = String(new FormData(e.currentTarget).get("chair") ?? "");
        if (id) router.push(`/${locale}/equipment/${id}?report=1`);
      }}
    >
      <label htmlFor="report-chair">
        {t.reportWhich}
        <select id="report-chair" name="chair" required defaultValue="">
          <option value="" disabled>
            {t.reportWhich}
          </option>
          {chairs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button secondary">{t.reportButton}</button>
    </form>
  );
}
