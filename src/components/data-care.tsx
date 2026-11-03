"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { securityView, myDataRequests } from "@/domains/legal/service";
import { retentionCategories } from "@/domains/legal/schema";
import { legalDocs } from "@/domains/legal/texts";
import { errors } from "./access-copy";
import { dataCareCopy } from "./data-care-copy";
import { Badge, Button, Card, EmptyState } from "./ui";

type View = Awaited<ReturnType<typeof securityView>>;
type Mine = Awaited<ReturnType<typeof myDataRequests>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fail = (locale: Locale, code: string) => dataCareCopy[locale].errors[code] ?? errors[code]?.[locale] ?? dataCareCopy[locale].failed;

/** One retention period, within its bounds. */
function RetentionRow({ locale, category, months, bounds, busy, send }: { locale: Locale; category: (typeof retentionCategories)[number]; months: number; bounds: { min: number; max: number }; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = dataCareCopy[locale];
  const [value, setValue] = useState(String(months));
  return (
    <li>
      <form
        className="exercise-tag-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ action: "retention", category, months: Number(value) });
        }}
      >
        <label>
          {t.monthsOf(t.categories[category], bounds.min, bounds.max)}
          <input type="number" min={bounds.min} max={bounds.max} required value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={busy || Number(value) === months}>
          {t.save}
        </Button>
      </form>
    </li>
  );
}
/** A request of a person, its deadline, and the answer. */
function RequestRow({ locale, r, busy, send }: { locale: Locale; r: View["requests"][number]; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = dataCareCopy[locale];
  const [response, setResponse] = useState(r.response);
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const open = r.status === "received" || r.status === "in_progress";
  return (
    <li className="progress-note">
      <p className="exercise-badges">
        <Badge tone="info">{t.kinds[r.kind]}</Badge>
        <Badge tone={r.status === "done" ? "success" : r.status === "refused" ? "danger" : "warning"}>{t.statuses[r.status]}</Badge>
        {open && <span className="small">{t.due(day(r.due_on))}</span>}
      </p>
      <p>
        <strong>{r.person ?? r.requester}</strong>
        {r.details && <span className="prewrap"> · {r.details}</span>}
      </p>
      {open ? (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <label>
            {t.response}
            <textarea rows={2} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)} />
          </label>
          <span className="exercise-actions">
            {(["in_progress", "done", "refused"] as const).map((st) => (
              <Button key={st} type="button" size="sm" variant={st === "done" ? "primary" : "secondary"} disabled={busy} onClick={() => void send({ action: "request", id: r.id, status: st, response })}>
                {t.set(t.statuses[st])}
              </Button>
            ))}
          </span>
        </form>
      ) : (
        r.response && <p className="muted small prewrap">{r.response}</p>
      )}
    </li>
  );
}

/** 21: Réglages › Club › « Sécurité et données ». */
export function ClubSecurity({ locale }: { locale: Locale }) {
  const t = dataCareCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [hidden, setHidden] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [checked, setChecked] = useState(false),
    [link, setLink] = useState(""),
    [name, setName] = useState(""),
    [reason, setReason] = useState("");
  const load = useCallback(
    () =>
      fetch("/api/club/security", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (r.status === 403 || v.error === "CLUB_ONLY") return setHidden(true);
          if (!r.ok) throw new Error(v.error);
          setData(v);
        })
        .catch(() => setError(t.failed)),
    [t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/club/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data?.organization_id }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      if (v.token) setLink(`/api/club/export/${v.token}`);
      await load();
      setMessage(v.token ? t.exportAsked : t.saved);
      return true;
    } catch (e) {
      setError(fail(locale, (e as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (hidden) return null;
  if (!data) return <p role={error ? "alert" : "status"}>{error || t.loading}</p>;
  const date = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(d));
  const president = data.can.president;
  return (
    <section id="security" className="data-care" aria-labelledby="security-title">
      <h2 id="security-title">{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <p className="notice">{t.review}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {message && link && (
        <p className="notice">
          {t.exportAsked} <a href={link}>{t.exportLink}</a>
        </p>
      )}

      <Card title={t.dpa} labelledBy="security-dpa" headingId="security-dpa">
        <p>
          <Link href={`/${locale}/legal/dpa`}>{t.dpaRead}</Link>
        </p>
        {data.dpa.accepted && <p>{t.dpaAccepted(data.dpa.accepted.version, data.dpa.accepted.accepted_by, date(data.dpa.accepted.accepted_at))}</p>}
        {!data.dpa.required && !data.dpa.accepted && <p className="muted">{t.dpaNone}</p>}
        {!data.dpa.upToDate && <p className="notice">{data.dpa.accepted ? t.dpaNew(data.dpa.current) : t.dpaNeeded(data.dpa.current)}</p>}
        {president && data.dpa.accepted?.version !== data.dpa.current && (
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (checked) void send({ action: "acceptDpa", version: data.dpa.current });
            }}
          >
            <label className="check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              {t.dpaCheck}
            </label>
            <Button type="submit" disabled={busy || !checked}>
              {t.dpaAccept}
            </Button>
          </form>
        )}
      </Card>

      <Card title={t.hosting} labelledBy="security-hosting" headingId="security-hosting">
        <p>{t.region}</p>
        <h3>{t.subprocessors}</h3>
        <ul className="plain-list">
          {data.hosting.subprocessors.map((x) => (
            <li key={x.name.fr}>
              <strong>{x.name[locale]}</strong> · {x.role[locale]} · {typeof x.region === "string" ? x.region : x.region[locale]}
            </li>
          ))}
        </ul>
        <h3>{t.publicPages}</h3>
        <ul className="plain-list">
          {legalDocs.map((d) => (
            <li key={d}>
              <Link href={`/${locale}/legal/${d}`}>{t.docs[d]}</Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t.access} labelledBy="security-access" headingId="security-access">
        <ul className="plain-list">
          {data.access.map((a, i) => (
            <li key={i}>
              {a.name} · {t.roles[a.role] ?? a.role}
              {a.grants.length > 0 && ` · ${t.grants(a.grants.length)}`}
            </li>
          ))}
        </ul>
        <h3>{t.health}</h3>
        {data.health.length ? (
          <ul className="plain-list">
            {data.health.map((h, i) => (
              <li key={i}>
                {date(h.created_at)} · {h.actor}
                {h.person ? ` · ${h.person}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noHealth}</p>
        )}
      </Card>

      <Card title={t.retention} subtitle={t.retentionIntro} labelledBy="security-retention" headingId="security-retention">
        {president ? (
          <ul className="exercise-tag-rows">
            {retentionCategories.map((k) => (
              <RetentionRow key={`${k}-${data.retention[k]}`} locale={locale} category={k} months={data.retention[k]} bounds={data.bounds[k]} busy={busy} send={send} />
            ))}
          </ul>
        ) : (
          <ul className="plain-list">
            {retentionCategories.map((k) => (
              <li key={k}>
                {t.categories[k]} · {t.months(data.retention[k])}
              </li>
            ))}
          </ul>
        )}
        {data.purges.length > 0 && (
          <>
            <h3>{t.purges}</h3>
            <ul className="plain-list">
              {data.purges.map((x: { category: string; removed: number; run_at: string }, i: number) => (
                <li key={i}>
                  {date(x.run_at)} · {t.categories[x.category as keyof typeof t.categories] ?? x.category} · {t.removed(x.removed)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title={t.requests} subtitle={t.requestsIntro} labelledBy="security-requests" headingId="security-requests">
        {data.requests.length ? (
          <ul className="progress-feedback">
            {data.requests.map((r) => (
              <RequestRow key={`${r.id}-${r.status}`} locale={locale} r={r} busy={busy} send={send} />
            ))}
          </ul>
        ) : (
          <EmptyState icon="shield" title={t.noRequests} />
        )}
      </Card>

      {president && (
        <>
          <Card title={t.export} subtitle={t.exportIntro} labelledBy="security-export" headingId="security-export">
            <Button disabled={busy} onClick={() => void send({ action: "export" })}>
              {t.exportAsk}
            </Button>
            {data.exports.length > 0 && (
              <ul className="plain-list">
                {data.exports.map((x) => (
                  <li key={x.id}>
                    {date(x.requested_at)} · {x.requested_by} · <Badge tone={x.status === "ready" ? "success" : x.status === "failed" ? "danger" : "neutral"}>{t.exportStatus[x.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t.closure} subtitle={t.closureIntro} labelledBy="security-closure" headingId="security-closure">
            {data.closure ? (
              <>
                <p className="notice">{t.closurePlanned(new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.closure.effective_on + "T12:00:00Z")))}</p>
                <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "cancelClose" })}>
                  {t.closureCancel}
                </Button>
              </>
            ) : (
              <form
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send({ action: "close", confirmName: name, reason });
                }}
              >
                <label>
                  {t.closureName}
                  <input value={name} required onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  {t.closureReason}
                  <textarea rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <Button type="submit" variant="danger" disabled={busy || name.trim().length < 2}>
                  {t.closureAsk}
                </Button>
              </form>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

/** 21: « Mes données »: a request to the club that holds one's data. */
export function MyDataRequests({ locale }: { locale: Locale }) {
  const t = dataCareCopy[locale];
  const [data, setData] = useState<Mine | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetch("/api/privacy/requests", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setData(v);
        })
        .catch(() => setError(t.failed)),
    [t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return error ? <p role="alert">{error}</p> : null;
  if (!data.clubs.length && !data.requests.length) return null;
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
  return (
    <Card title={t.myTitle} subtitle={t.myIntro} labelledBy="my-data-requests" headingId="my-data-requests">
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      {data.clubs.length > 0 && (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            setBusy(true);
            setError("");
            void fetch("/api/privacy/requests", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizationId: f.get("club"), kind: f.get("kind"), details: String(f.get("details") ?? "") }),
            })
              .then(async (r) => {
                const v = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
                form.reset();
                setMessage(t.sent);
                await load();
              })
              .catch((err: Error) => setError(fail(locale, err.message)))
              .finally(() => setBusy(false));
          }}
        >
          <div className="form-grid">
            <label>
              {t.club}
              <select name="club" required defaultValue={data.clubs[0].id}>
                {data.clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.kind}
              <select name="kind" defaultValue="access">
                {(["access", "rectification", "erasure"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {t.details}
            <textarea name="details" rows={2} maxLength={2000} />
          </label>
          <Button type="submit" disabled={busy}>
            {t.send}
          </Button>
        </form>
      )}
      {data.requests.length > 0 && (
        <>
          <h3>{t.mine}</h3>
          <ul className="plain-list">
            {data.requests.map((r) => (
              <li key={r.id}>
                {day(r.created_at)} · {r.club} · {t.kinds[r.kind]} · <Badge tone={r.status === "done" ? "success" : r.status === "refused" ? "danger" : "warning"}>{t.statuses[r.status]}</Badge>
                {r.response && <span className="muted small"> · {r.response}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
