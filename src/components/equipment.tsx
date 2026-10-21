"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import type { equipmentView } from "@/domains/equipment/service";
import {
  chairStatuses,
  ownerships,
  overMatchSpeed,
  serviceState,
} from "@/domains/equipment/schema";
import { equipmentCopy } from "./equipment-copy";
import { errors } from "./access-copy";
import { Icon, type IconName } from "./icons";
import { initials } from "./app-shell";
import { Stock } from "./equipment-stock";
import { Badge, EmptyState, PageHeader, Card, KpiCard } from "./ui";

type View = Awaited<ReturnType<typeof equipmentView>>;
type Chair = View["chairs"][number];
const brussels = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const tones = {
  available: "success",
  in_use: "",
  maintenance: "warning",
  retired: "danger",
} as const;
const serviceTones = {
  ok: "success",
  soon: "warning",
  due: "danger",
  unknown: "",
} as const;

export function Equipment({ locale }: { locale: Locale }) {
  const t = equipmentCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("active");
  const today = brussels();
  const date = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(d + "T12:00:00Z"))
      : "—";
  const failure = (code: string) =>
    t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;

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
      return v as { id: string };
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  }
  function saveChair(e: FormEvent<HTMLFormElement>, chair?: Chair) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) ?? "").trim();
    const dateOrNull = (k: string) => value(k) || null;
    void send({
      action: "chair",
      ...(chair ? { id: chair.id, expectedVersion: chair.version } : {}),
      name: value("name"),
      brand: value("brand"),
      model: value("model"),
      serialNumber: value("serial"),
      ownership: value("ownership"),
      status: value("status"),
      maxSpeedKmh: value("speed") === "" ? null : Number(value("speed")),
      battery: value("battery"),
      acquiredOn: dateOrNull("acquired"),
      lastServiceOn: dateOrNull("last"),
      nextServiceOn: dateOrNull("next"),
      notes: value("notes"),
      storage: value("storage"),
    }).then((r) => {
      if (r && !chair) setEditing(r.id);
    });
  }

  const chairs =
    view?.chairs.filter(
      (c) =>
        (status === "all" ||
          (status === "active"
            ? c.status !== "retired"
            : c.status === status)) &&
        [c.name, c.brand, c.model, ...c.links.map((l) => l.full_name)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q.toLocaleLowerCase()),
    ) ?? [];
  const live = view?.chairs.filter((c) => c.status !== "retired") ?? [];
  const current = view?.chairs.find((c) => c.id === editing);

  return (
    <main id="main" className="access equipment">
      <PageHeader title={t.title} subtitle={t.intro} actions={<>{view?.manage && (
          <button
            className="button"
            type="button"
            onClick={() => {
              setEditing("new");
              setMessage("");
            }}
          >
            {t.add}
          </button>
        )}</>} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p>{t.loading}</p>}
      {view && !view.manage && <p className="notice">{t.readOnly}</p>}
      {view && (
        <>
          {view.manage && (
            <ul className="stat-row-grid" data-cols="4">
              {(
                [
                  [t.summaryActive, live.length, "wheelchair"],
                  [t.summaryInUse, live.filter((c) => c.status === "in_use").length, "players"],
                  [t.summaryAvailable, live.filter((c) => c.status === "available").length, "check"],
                  [
                    t.summaryService,
                    live.filter((c) => ["soon", "due"].includes(serviceState(c.next_service_on, today, c.status))).length,
                    "wrench",
                  ],
                ] as [string, number, IconName][]
              ).map(([label, value, icon]) => (
                <li key={label}>
                  <KpiCard label={label} value={String(value)} icon={icon} tone={icon === "wrench" && value ? "warning" : "primary"} />
                </li>
              ))}
            </ul>
          )}
          <form
            className="directory-filters"
            onSubmit={(e) => e.preventDefault()}
          >
            <label>
              {t.search}
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`${t.name}, ${t.brand}, ${t.player}`}
              />
            </label>
            <label>
              {t.status}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">{t.current}</option>
                <option value="all">{t.all}</option>
                {chairStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t.statuses[s]}
                  </option>
                ))}
              </select>
            </label>
          </form>
          {editing === "new" && (
            <Card title={t.newChair} labelledBy="new-chair" headingId="new-chair" className="chair-editor">
              <ChairForm
                t={t}
                storages={view.storages}
                busy={busy}
                onSubmit={(e) => saveChair(e)}
                onCancel={() => setEditing("")}
              />
            </Card>
          )}
          {chairs.length ? (
            <ul className="chair-grid">
              {chairs.map((c) => {
                const service = serviceState(
                  c.next_service_on,
                  today,
                  c.status,
                );
                return (
                  <Card as="li" key={c.id} className="chair-card" data={{ status: c.status }}>
                    <div className="chair-head">
                      <span className="feature-icon">
                        <Icon name="wheelchair" />
                      </span>
                      <div>
                        <h2>{c.name}</h2>
                        <p>
                          {[c.brand, c.model].filter(Boolean).join(" · ") ||
                            "—"}
                        </p>
                      </div>
                      <Badge tone={tones[c.status as keyof typeof tones]}>
                        {t.statuses[c.status as keyof typeof t.statuses]}
                      </Badge>
                    </div>
                    <dl className="chair-facts">
                      <dt>{t.ownership}</dt>
                      <dd>
                        {t.ownerships[c.ownership as keyof typeof t.ownerships]}
                      </dd>
                      <dt>{t.speed}</dt>
                      <dd>
                        {c.max_speed_kmh
                          ? `${Number(c.max_speed_kmh)} km/h`
                          : "—"}
                        {overMatchSpeed(c.max_speed_kmh) && (
                          <Badge tone="warning">
                            {t.overSpeed}
                          </Badge>
                        )}
                      </dd>
                      {c.storage && (
                        <>
                          <dt>{t.storage}</dt>
                          <dd>{c.storage}</dd>
                        </>
                      )}
                      <dt>{t.nextService}</dt>
                      <dd>
                        {date(c.next_service_on)}
                        {c.status !== "retired" && (
                          <Badge tone={serviceTones[service]}>
                            {t.service[service]}
                          </Badge>
                        )}
                      </dd>
                    </dl>
                    <div>
                      <h3 className="chair-subtitle">{t.players}</h3>
                      {c.links.filter((l) => !l.ends_on).length ? (
                        <ul className="player-chips">
                          {c.links
                            .filter((l) => !l.ends_on)
                            .map((l) => (
                              <li key={l.id}>
                                <Link
                                  href={`/${locale}/players/${l.profile_id}`}
                                >
                                  <span className="avatar" aria-hidden="true">
                                    {initials(l.full_name)}
                                  </span>
                                  {l.full_name}
                                  {l.is_primary && (
                                    <Badge tone="success">
                                      {t.primary}
                                    </Badge>
                                  )}
                                </Link>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <EmptyState title={t.noPlayers} />
                      )}
                      {c.others > 0 && (
                        <p className="muted">
                          + {c.others} {t.others}
                        </p>
                      )}
                    </div>
                    {view.manage && (
                      <button
                        className="button secondary"
                        type="button"
                        aria-expanded={editing === c.id}
                        onClick={() => {
                          setEditing(editing === c.id ? "" : c.id);
                          setMessage("");
                        }}
                      >
                        {editing === c.id ? t.close : `${t.manage} · ${c.name}`}
                      </button>
                    )}
                  </Card>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={view.manage ? t.empty : t.emptyOwn} />
          )}
          {view.manage && current && (
            <section
              className="panel chair-editor"
              aria-labelledby="chair-editor-title"
            >
              <h2 id="chair-editor-title">
                {t.edit} · {current.name}
              </h2>
              <div className="grid">
                <ChairForm
                  key={current.id + "-" + current.version}
                  t={t}
                  storages={view.storages}
                  chair={current}
                  busy={busy}
                  onSubmit={(e) => saveChair(e, current)}
                  onCancel={() => setEditing("")}
                />
                <div>
                  <h3>{t.players}</h3>
                  <ul className="records">
                    {current.links
                      .filter((l) => !l.ends_on)
                      .map((l) => (
                        <li key={l.id} className="link-row">
                          <span>
                            <strong>{l.full_name}</strong> · {t.since}{" "}
                            {date(l.starts_on)}
                            {l.is_primary && (
                              <Badge tone="success">
                                {t.primary}
                              </Badge>
                            )}
                          </span>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busy}
                            aria-label={`${t.unlink} : ${l.full_name}`}
                            onClick={() =>
                              void send({
                                action: "unassign",
                                id: l.id,
                                endsOn: today,
                              })
                            }
                          >
                            {t.unlink}
                          </button>
                        </li>
                      ))}
                  </ul>
                  {current.status !== "retired" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void send({
                          action: "assign",
                          chairId: current.id,
                          profileId: f.get("profile"),
                          primary: f.get("primary") === "on",
                          startsOn: f.get("from"),
                        });
                      }}
                    >
                      <label>
                        {t.player}
                        <select name="profile" required>
                          <option value="">{t.player}</option>
                          {view.players
                            .filter(
                              (pl) =>
                                !current.links.some(
                                  (l) => !l.ends_on && l.profile_id === pl.id,
                                ),
                            )
                            .map((pl) => (
                              <option key={pl.id} value={pl.id}>
                                {pl.full_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="check">
                        <input type="checkbox" name="primary" />
                        {t.primary} ({t.primaryHint.toLocaleLowerCase()})
                      </label>
                      <label>
                        {t.from}
                        <input
                          type="date"
                          name="from"
                          defaultValue={today}
                          required
                        />
                      </label>
                      <button className="button" disabled={busy}>
                        {t.assign}
                      </button>
                    </form>
                  )}
                  {current.links.some((l) => l.ends_on) && (
                    <>
                      <h3>{t.past}</h3>
                      <ul className="plain-list muted">
                        {current.links
                          .filter((l) => l.ends_on)
                          .map((l) => (
                            <li key={l.id}>
                              {l.full_name} · {date(l.starts_on)} →{" "}
                              {date(l.ends_on)}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
          <Stock locale={locale} view={view} busy={busy} send={send} />
        </>
      )}
    </main>
  );
}

function ChairForm({
  t,
  chair,
  storages,
  busy,
  onSubmit,
  onCancel,
}: {
  t: (typeof equipmentCopy)[Locale];
  chair?: Chair;
  storages: string[];
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const id = (k: string) => `chair-${chair?.id ?? "new"}-${k}`;
  return (
    <form onSubmit={onSubmit}>
      <label htmlFor={id("name")}>
        {t.name}
        <input
          id={id("name")}
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={chair?.name}
        />
      </label>
      <div className="form-pair">
        <label htmlFor={id("brand")}>
          {t.brand}
          <input
            id={id("brand")}
            name="brand"
            maxLength={80}
            defaultValue={chair?.brand}
          />
        </label>
        <label htmlFor={id("model")}>
          {t.model}
          <input
            id={id("model")}
            name="model"
            maxLength={80}
            defaultValue={chair?.model}
          />
        </label>
      </div>
      <div className="form-pair">
        <label htmlFor={id("serial")}>
          {t.serial}
          <input
            id={id("serial")}
            name="serial"
            maxLength={80}
            defaultValue={chair?.serial_number}
          />
        </label>
        <label htmlFor={id("ownership")}>
          {t.ownership}
          <select
            id={id("ownership")}
            name="ownership"
            defaultValue={chair?.ownership ?? "club"}
          >
            {ownerships.map((o) => (
              <option key={o} value={o}>
                {t.ownerships[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-pair">
        <label htmlFor={id("status")}>
          {t.status}
          <select
            id={id("status")}
            name="status"
            defaultValue={chair?.status ?? "available"}
          >
            {chairStatuses.map((s) => (
              <option key={s} value={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={id("speed")}>
          {t.speed}
          <input
            id={id("speed")}
            name="speed"
            type="number"
            min="0"
            max="20"
            step="0.1"
            aria-describedby={id("speed-hint")}
            defaultValue={chair?.max_speed_kmh ?? ""}
          />
          <span id={id("speed-hint")} className="muted">
            {t.speedHint}
          </span>
        </label>
      </div>
      <label htmlFor={id("battery")}>
        {t.battery}
        <input
          id={id("battery")}
          name="battery"
          maxLength={120}
          defaultValue={chair?.battery}
        />
      </label>
      <label htmlFor={id("storage")}>
        {t.storage}
        <input
          id={id("storage")}
          name="storage"
          maxLength={120}
          list="storage-places"
          defaultValue={chair?.storage}
        />
        <datalist id="storage-places">
          {storages.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </label>
      <div className="form-pair">
        <label htmlFor={id("acquired")}>
          {t.acquired}
          <input
            id={id("acquired")}
            name="acquired"
            type="date"
            defaultValue={chair?.acquired_on ?? ""}
          />
        </label>
        <label htmlFor={id("last")}>
          {t.lastService}
          <input
            id={id("last")}
            name="last"
            type="date"
            defaultValue={chair?.last_service_on ?? ""}
          />
        </label>
      </div>
      <label htmlFor={id("next")}>
        {t.nextService}
        <input
          id={id("next")}
          name="next"
          type="date"
          defaultValue={chair?.next_service_on ?? ""}
        />
      </label>
      <label htmlFor={id("notes")}>
        {t.notes}
        <textarea
          id={id("notes")}
          name="notes"
          maxLength={2000}
          defaultValue={chair?.notes}
        />
      </label>
      <div className="actions">
        <button className="button" disabled={busy}>
          {t.save}
        </button>
        <button className="button secondary" type="button" onClick={onCancel}>
          {t.close}
        </button>
      </div>
    </form>
  );
}
