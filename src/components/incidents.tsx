"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { incidentsView } from "@/domains/incidents/service";
import { incidentContexts, incidentKinds, incidentsCopy, insuranceStatuses } from "./incidents-copy";
import { fill } from "./fleet-copy";
import { errors } from "./access-copy";
import { Badge, Button, EmptyState, PageHeader, Panel, Tabs } from "./ui";

/**
 * B5: incidents. A quick report from a phone (facts, people, a chair, the
 * health part apart, photos), the care instructions of the people chosen
 * shown to the reporter, the list (health only for the authorised), and for
 * the managers the insurance follow-up, anonymous statistics, the first-aid
 * kit and the insurer's settings.
 */
type View = Awaited<ReturnType<typeof incidentsView>>;
type Incident = View["incidents"][number];
type Send = (body: Record<string, unknown>) => Promise<{ id: string; parentsTold?: number } | null>;
type Care = { id: string; profile_id: string; full_name: string; moment: string; time: string; title: string; details: string };
type Tab = "list" | "insurance" | "stats" | "settings";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string | null) => (d ? new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z")) : "…");
const when = (l: Locale, local: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(local + ":00Z"));
const cents = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(",", ".").trim();
  return s === "" ? null : Math.round(Number(s) * 100);
};
const stateTones = { ok: "success", soon: "warning", overdue: "danger", done: "neutral" } as const;
/** The local date and time now, for the form's default (read when the window opens, never during render). */
const nowLocal = () => {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
};
function readFile(file: File) {
  return new Promise<{ name: string; type: string; data: string }>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name.slice(0, 160) || "photo", type: file.type, data: String(r.result).split(",")[1] ?? "" });
    r.onerror = () => reject(new Error("INVALID_FILE"));
    r.readAsDataURL(file);
  });
}

export function Incidents({ locale }: { locale: Locale }) {
  const t = incidentsCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState<Tab>("list"),
    [declaring, setDeclaring] = useState<string | null>(null);
  const failure = (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;
  useEffect(() => {
    let cancelled = false;
    fetch("/api/incidents", { cache: "no-store" })
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
  }, [revision]);
  const send: Send = async (body) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setMessage(body.action === "declare" ? (v.parentsTold ? t.declaredMinor : t.declared) : t.saved);
      setRevision((n) => n + 1);
      return v;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const tabs: Tab[] = view?.can.manage ? ["list", "insurance", "stats", "settings"] : ["list"];
  return (
    <main id="main" className="access incidents">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          view?.can.declare ? (
            <Button
              onClick={() => {
                setMessage("");
                setDeclaring(nowLocal());
              }}
            >
              {t.declare}
            </Button>
          ) : undefined
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          {tabs.length > 1 && <Tabs label={t.tabsLabel} items={tabs.map((k) => ({ id: k, label: t.tabs[k] }))} value={tab} onChange={(v) => setTab(v as Tab)} panelId="incidents-panel" idPrefix="incidents-tab" />}
          <div id="incidents-panel" role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `incidents-tab-${tab}` : undefined}>
            {tab === "list" && (
              <>
                {view.can.manage && (
                  <Panel title={t.firstAidKit} id="incidents-first-aid">
                    {view.firstAid.length ? (
                      <ul className="records">
                        {view.firstAid.map((x) => (
                          <li key={x.id}>
                            <strong>{x.name}</strong> <Badge tone={x.expires_on < view.today ? "danger" : "warning"}>{fill(x.expires_on < view.today ? t.expiredOn : t.expiresOn, { date: day(locale, x.expires_on) })}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">{t.firstAidOk}</p>
                    )}
                  </Panel>
                )}
                {view.incidents.length ? (
                  <ul className="incident-list">
                    {view.incidents.map((i) => (
                      <IncidentCard key={i.id + i.version} locale={locale} incident={i} canHealth={view.can.health} busy={busy} send={send} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState title={t.empty} />
                )}
              </>
            )}
            {tab === "insurance" && (
              <div className="incident-insurance">
                {view.incidents.filter((i) => i.insurance).length ? (
                  view.incidents.map((i) => i.insurance && <InsuranceCard key={i.id + i.version + i.insurance.pieces.length} locale={locale} incident={i} busy={busy} send={send} />)
                ) : (
                  <EmptyState title={t.empty} />
                )}
              </div>
            )}
            {tab === "stats" && view.stats && <Stats locale={locale} stats={view.stats} />}
            {tab === "settings" && view.settings && <Settings key={JSON.stringify(view.settings)} locale={locale} settings={view.settings} busy={busy} send={send} />}
          </div>
          {declaring && view.choices && <DeclareDialog locale={locale} choices={view.choices} at={declaring} busy={busy} send={send} close={() => setDeclaring(null)} />}
        </>
      )}
    </main>
  );
}

function IncidentCard({ locale, incident: i, canHealth, busy, send }: { locale: Locale; incident: Incident; canHealth: boolean; busy: boolean; send: Send }) {
  const t = incidentsCopy[locale];
  const head = `incident-${i.id}`;
  const h = i.health?.value;
  return (
    <li className="card incident-card" aria-labelledby={head}>
      <h2 id={head} className="incident-title">
        {t.kinds[i.kind as keyof typeof t.kinds]} <span className="muted small">· {when(locale, i.occurred_at)}</span>
      </h2>
      <p>
        {i.people.map((x, n) => (
          <span key={x.id}>
            {n > 0 && ", "}
            <strong>{x.full_name}</strong>
            {x.minor && (
              <>
                {" "}
                <Badge tone="info">{t.minor}</Badge>
              </>
            )}
          </span>
        ))}
        {i.insurance && (
          <>
            {" "}
            <Badge tone={stateTones[i.insurance.state]}>{t.statuses[i.insurance.status as keyof typeof t.statuses]}</Badge>
          </>
        )}
      </p>
      <dl className="chair-facts">
        <dt>{t.context}</dt>
        <dd>
          {t.contexts[i.context as keyof typeof t.contexts]}
          {i.event ? ` · ${i.event}` : ""}
        </dd>
        {i.place && (
          <>
            <dt>{t.place}</dt>
            <dd>{i.place}</dd>
          </>
        )}
        <dt>{t.circumstances}</dt>
        <dd>{i.circumstances}</dd>
        {i.witnesses && (
          <>
            <dt>{t.witnesses}</dt>
            <dd>{i.witnesses}</dd>
          </>
        )}
        {i.chair && (
          <>
            <dt>{t.chair}</dt>
            <dd>
              {i.chair}
              {i.intervention ? ` · ${t.chairLog}` : ""}
            </dd>
          </>
        )}
      </dl>
      <p className="muted small">{fill(t.by, { name: i.reporter })}</p>
      <section className="incident-health" aria-label={t.health}>
        <h3>{t.health}</h3>
        {i.health ? (
          <>
            {h ? (
              <dl className="chair-facts">
                {h.injuries && (
                  <>
                    <dt>{t.injuries}</dt>
                    <dd>{h.injuries}</dd>
                  </>
                )}
                {h.firstAid && (
                  <>
                    <dt>{t.firstAid}</dt>
                    <dd>{h.firstAid}</dd>
                  </>
                )}
                {h.care && (
                  <>
                    <dt>{t.care}</dt>
                    <dd>{h.care}</dd>
                  </>
                )}
                {h.hospital && (
                  <>
                    <dt>{t.hospital}</dt>
                    <dd>✓</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="muted">{t.noHealth}</p>
            )}
            {i.health.photos.length > 0 && (
              <ul className="plain-list">
                {i.health.photos.map((f) => (
                  <li key={f.id}>
                    <a href={`/api/incidents/file?id=${f.id}`} target="_blank" rel="noopener">
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {canHealth && <HealthForm locale={locale} incident={i} busy={busy} send={send} />}
          </>
        ) : (
          <p className="muted">{t.healthHidden}</p>
        )}
      </section>
      {i.insurance && (
        <p className="actions">
          <a className="button secondary" href={`/api/incidents/pdf?id=${i.id}`} target="_blank" rel="noopener">
            {t.pdf}
          </a>
        </p>
      )}
    </li>
  );
}

function HealthFields({ locale, prefix, value }: { locale: Locale; prefix: string; value?: { injuries: string; firstAid: string; care: string; hospital: boolean } | null }) {
  const t = incidentsCopy[locale];
  return (
    <>
      <label htmlFor={`${prefix}-injuries`}>
        {t.injuries}
        <textarea id={`${prefix}-injuries`} name="injuries" rows={2} maxLength={2000} defaultValue={value?.injuries} />
      </label>
      <label htmlFor={`${prefix}-firstAid`}>
        {t.firstAid}
        <textarea id={`${prefix}-firstAid`} name="firstAid" rows={2} maxLength={2000} defaultValue={value?.firstAid} />
      </label>
      <label htmlFor={`${prefix}-care`}>
        {t.care}
        <textarea id={`${prefix}-care`} name="care" rows={2} maxLength={2000} defaultValue={value?.care} />
      </label>
      <label className="check">
        <input type="checkbox" name="hospital" defaultChecked={value?.hospital} />
        {t.hospital}
      </label>
    </>
  );
}
const healthOf = (d: FormData) => ({ injuries: String(d.get("injuries") ?? "").trim(), firstAid: String(d.get("firstAid") ?? "").trim(), care: String(d.get("care") ?? "").trim(), hospital: d.get("hospital") === "on" });

function HealthForm({ locale, incident, busy, send }: { locale: Locale; incident: Incident; busy: boolean; send: Send }) {
  const t = incidentsCopy[locale];
  return (
    <details className="inline-details">
      <summary>
        {t.healthTitle} · {t.save}
      </summary>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ action: "health", id: incident.id, health: healthOf(new FormData(e.currentTarget)) });
        }}
      >
        <HealthFields locale={locale} prefix={`h-${incident.id}`} value={incident.health?.value} />
        <p>
          <button className="button" disabled={busy}>
            {t.save}
          </button>
        </p>
      </form>
    </details>
  );
}

function DeclareDialog({ locale, choices, at, busy, send, close }: { locale: Locale; choices: NonNullable<View["choices"]>; at: string; busy: boolean; send: Send; close: () => void }) {
  const t = incidentsCopy[locale];
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<string[]>([]),
    [filter, setFilter] = useState(""),
    [care, setCare] = useState<Care[] | null>(null),
    [kind, setKind] = useState<(typeof incidentKinds)[number]>("fall"),
    [photoError, setPhotoError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  function toggle(id: string, on: boolean) {
    const next = on ? [...picked, id] : picked.filter((x) => x !== id);
    setPicked(next);
    setCare(null);
    if (next.length)
      fetch(`/api/incidents/care?profiles=${next.join(",")}`, { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as Care[]) : []))
        .then(setCare)
        .catch(() => setCare([]));
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const v = (k: string) => String(d.get(k) ?? "").trim();
    const files = (d.getAll("photos") as File[]).filter((f) => f.size > 0);
    if (files.some((f) => f.size > 1048576)) {
      setPhotoError(t.photoTooBig);
      return;
    }
    setPhotoError("");
    const photos = await Promise.all(files.slice(0, 3).map(readFile));
    const health = healthOf(d);
    const r = await send({
      action: "declare",
      occurredAt: v("at"),
      context: v("context"),
      eventId: v("event") || null,
      kind,
      place: v("place"),
      circumstances: v("circumstances"),
      witnesses: v("witnesses"),
      profileIds: picked,
      chairId: v("chair") || null,
      health: health.injuries || health.firstAid || health.care || health.hospital ? health : null,
      photos,
    });
    if (r) {
      ref.current?.close();
      close();
    }
  }
  const shown = choices.people.filter((x) => picked.includes(x.id) || x.full_name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).slice(0, 60);
  return (
    <dialog ref={ref} className="player-dialog sheet-dialog" aria-labelledby="declare-title" onCancel={close}>
      <div className="dialog-heading sheet-heading">
        <h2 id="declare-title">{t.declareTitle}</h2>
        <button
          type="button"
          className="button secondary sm"
          onClick={() => {
            ref.current?.close();
            close();
          }}
        >
          {t.close}
        </button>
      </div>
      <form className="stack-form" onSubmit={(e) => void submit(e)}>
        {photoError && <p role="alert">{photoError}</p>}
        <div className="form-grid">
          <label htmlFor="incident-at">
            {t.occurredAt}
            <input id="incident-at" name="at" type="datetime-local" required defaultValue={at} max={at} />
          </label>
          <label htmlFor="incident-context">
            {t.context}
            <select id="incident-context" name="context" defaultValue="training">
              {incidentContexts.map((c) => (
                <option key={c} value={c}>
                  {t.contexts[c]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="incident-event">
            {t.event}
            <select id="incident-event" name="event" defaultValue="">
              <option value="">{t.noEvent}</option>
              {choices.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {`${e.title} · ${new Intl.DateTimeFormat(tag(locale), { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(e.starts_at))}`}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="incident-kind">
            {t.kind}
            <select id="incident-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {incidentKinds.map((k) => (
                <option key={k} value={k}>
                  {t.kinds[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>{t.people}</legend>
          <p className="field-help">{t.peopleHint}</p>
          {choices.people.length > 10 && (
            <label htmlFor="incident-filter">
              <span className="sr-only">{t.people}</span>
              <input id="incident-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="…" aria-label={t.people} />
            </label>
          )}
          <div className="incident-people">
            {shown.map((x) => (
              <label key={x.id} className="check">
                <input type="checkbox" checked={picked.includes(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} />
                {x.full_name}
                {x.minor && <span className="muted small"> ({t.minor})</span>}
              </label>
            ))}
          </div>
        </fieldset>
        {picked.length > 0 && care && (
          <section className="notice" aria-labelledby="incident-care">
            <h3 id="incident-care">{t.careTitle}</h3>
            {care.length ? (
              <ul className="plain-list">
                {care.map((c) => (
                  <li key={c.id}>
                    <strong>{c.full_name}</strong> · {t.careMoments[c.moment] ?? c.moment}
                    {c.time ? ` ${c.time}` : ""} · {c.title}
                    {c.details && <p className="small">{c.details}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.careNone}</p>
            )}
          </section>
        )}
        <label htmlFor="incident-place">
          {t.place}
          <input id="incident-place" name="place" maxLength={200} />
        </label>
        <label htmlFor="incident-circumstances">
          {t.circumstances}
          <textarea id="incident-circumstances" name="circumstances" rows={4} required minLength={5} maxLength={4000} aria-describedby="incident-circumstances-help" />
          <span id="incident-circumstances-help" className="field-help">
            {t.circumstancesHint}
          </span>
        </label>
        <label htmlFor="incident-witnesses">
          {t.witnesses}
          <input id="incident-witnesses" name="witnesses" maxLength={1000} />
        </label>
        {(kind === "chair_damage" || kind === "collision" || kind === "fall") && (
          <label htmlFor="incident-chair">
            {t.chair}
            <select id="incident-chair" name="chair" defaultValue="" aria-describedby="incident-chair-help">
              <option value="">{t.none}</option>
              {choices.chairs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span id="incident-chair-help" className="field-help">
              {t.chairHint}
            </span>
          </label>
        )}
        <fieldset>
          <legend>{t.healthTitle}</legend>
          <p className="field-help">{t.healthHint}</p>
          <HealthFields locale={locale} prefix="incident" />
          <label htmlFor="incident-photos">
            {t.photos}
            <input id="incident-photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="incident-photos-help" />
            <span id="incident-photos-help" className="field-help">
              {t.photosHint}
            </span>
          </label>
        </fieldset>
        <p className="actions">
          <button className="button" disabled={busy || !picked.length}>
            {t.declare}
          </button>
        </p>
      </form>
    </dialog>
  );
}

function InsuranceCard({ locale, incident: i, busy, send }: { locale: Locale; incident: Incident; busy: boolean; send: Send }) {
  const t = incidentsCopy[locale];
  const ins = i.insurance!;
  const id = (k: string) => `ins-${i.id}-${k}`;
  return (
    <section className="card incident-card" aria-labelledby={id("head")}>
      <h2 id={id("head")} className="incident-title">
        {t.kinds[i.kind as keyof typeof t.kinds]} · {i.people.map((x) => x.full_name).join(", ")} <span className="muted small">· {when(locale, i.occurred_at)}</span>
      </h2>
      <p>
        {fill(t.deadline, { date: day(locale, ins.deadline) })} <Badge tone={stateTones[ins.state]}>{t.states[ins.state]}</Badge>
      </p>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void send({
            action: "insurance",
            id: i.id,
            expectedVersion: i.version,
            status: d.get("status"),
            claimReference: String(d.get("claim") ?? "").trim(),
            sentOn: d.get("sent") || null,
            claimedCents: cents(d.get("claimed")),
            reimbursedCents: cents(d.get("reimbursed")),
          });
        }}
      >
        <div className="form-grid">
          <label htmlFor={id("status")}>
            {t.status}
            <select id={id("status")} name="status" defaultValue={ins.status}>
              {insuranceStatuses.map((s) => (
                <option key={s} value={s}>
                  {t.statuses[s]}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={id("claim")}>
            {t.claim}
            <input id={id("claim")} name="claim" maxLength={80} defaultValue={ins.claim_reference} />
          </label>
          <label htmlFor={id("sent")}>
            {t.sentOn}
            <input id={id("sent")} name="sent" type="date" defaultValue={ins.sent_on ?? ""} />
          </label>
          <label htmlFor={id("claimed")}>
            {t.claimed}
            <input id={id("claimed")} name="claimed" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={ins.claimed_cents === null ? "" : String(ins.claimed_cents / 100)} />
          </label>
          <label htmlFor={id("reimbursed")}>
            {t.reimbursed}
            <input id={id("reimbursed")} name="reimbursed" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={ins.reimbursed_cents === null ? "" : String(ins.reimbursed_cents / 100)} />
          </label>
        </div>
        <p className="actions">
          <button className="button" disabled={busy}>
            {t.save}
          </button>
          <a className="button secondary" href={`/api/incidents/pdf?id=${i.id}`} target="_blank" rel="noopener">
            {t.pdf}
          </a>
        </p>
      </form>
      <h3>{t.pieces}</h3>
      {ins.pieces.length ? (
        <ul className="records">
          {ins.pieces.map((f) => (
            <li key={f.id} className="link-row">
              <a href={`/api/incidents/file?id=${f.id}`} target="_blank" rel="noopener">
                {f.name}
              </a>
              <button type="button" className="button secondary sm" disabled={busy} onClick={() => void send({ action: "removeFile", id: f.id })}>
                {t.remove}
                <span className="sr-only"> : {f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.noPieces}</p>
      )}
      <label htmlFor={id("piece")}>
        {t.addPiece}
        <input
          id={id("piece")}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file).then((f) => send({ action: "file", id: i.id, kind: "piece", ...f }));
          }}
        />
      </label>
    </section>
  );
}

function Stats({ locale, stats }: { locale: Locale; stats: NonNullable<View["stats"]> }) {
  const t = incidentsCopy[locale];
  const table = (title: string, rows: [string, number][]) => (
    <div className="table-scroll" role="region" aria-label={title} tabIndex={0}>
      <table className="data-table">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col" className="num">
              {t.total}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, n]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className="num">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Panel title={t.stats} id="incidents-stats">
      <p className="field-help">{t.statsHint}</p>
      {stats.total ? (
        <>
          <p>
            {t.total} : <strong>{stats.total}</strong> · {t.minors} : <strong>{stats.minors}</strong>
          </p>
          {table(
            t.byKind,
            Object.entries(stats.byKind).map(([k, n]) => [t.kinds[k as keyof typeof t.kinds] ?? k, n]),
          )}
          {table(
            t.byContext,
            Object.entries(stats.byContext).map(([k, n]) => [t.contexts[k as keyof typeof t.contexts] ?? k, n]),
          )}
          {table(
            t.byMonth,
            Object.entries(stats.byMonth)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, n]) => [new Intl.DateTimeFormat(tag(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(k + "-15T12:00:00Z")), n]),
          )}
        </>
      ) : (
        <p className="muted">{t.noData}</p>
      )}
      <p className="muted small">{t.retention}</p>
    </Panel>
  );
}

function Settings({ locale, settings, busy, send }: { locale: Locale; settings: NonNullable<View["settings"]>; busy: boolean; send: Send }) {
  const t = incidentsCopy[locale];
  return (
    <Panel title={t.insurance} id="incidents-settings">
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const v = (k: string) => String(d.get(k) ?? "").trim();
          void send({ action: "settings", insurerName: v("insurer"), insurerPolicy: v("policy"), insurerEmail: v("email"), days: Number(v("days")) });
        }}
      >
        <div className="form-grid">
          <label htmlFor="ins-insurer">
            {t.insurer}
            <input id="ins-insurer" name="insurer" maxLength={120} defaultValue={settings.insurer_name} />
          </label>
          <label htmlFor="ins-policy">
            {t.policy}
            <input id="ins-policy" name="policy" maxLength={80} defaultValue={settings.insurer_policy} />
          </label>
          <label htmlFor="ins-email">
            {t.insurerEmail}
            <input id="ins-email" name="email" type="email" maxLength={200} defaultValue={settings.insurer_email} />
          </label>
          <label htmlFor="ins-days">
            {t.days}
            <input id="ins-days" name="days" type="number" min="1" max="90" required defaultValue={settings.days} aria-describedby="ins-days-help" />
            <span id="ins-days-help" className="field-help">
              {t.daysHint}
            </span>
          </label>
        </div>
        <p>
          <button className="button" disabled={busy}>
            {t.save}
          </button>
        </p>
      </form>
      <p className="muted small">{t.retention}</p>
    </Panel>
  );
}
