"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { circularDetail, circularsView } from "@/domains/circulars/service";
import { circularAudiences } from "@/domains/circulars/schema";
import { circularsCopy } from "./circulars-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, Field, PageHeader, describedBy } from "./ui";
import { FederationTeam } from "./staff-roles";

/**
 * 33: the circulars page. Every member of an affiliated club and every
 * referee sees what he received (« J'ai lu » when a receipt is asked); the
 * federation's communication writes, sends, follows club by club, reminds
 * and exports.
 */
type View = Awaited<ReturnType<typeof circularsView>>;
type Detail = Awaited<ReturnType<typeof circularDetail>>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const when = (l: Locale, d: string | null) => (d ? new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d)) : "");

async function post(organizationId: string, body: Record<string, unknown>) {
  const r = await fetch("/api/circulars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...body }) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v as Record<string, unknown>;
}
const failText = (locale: Locale, e: unknown) => {
  const code = (e as Error).message;
  return errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code;
};

export function CircularsPage({ locale }: { locale: Locale }) {
  const t = circularsCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [composing, setComposing] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/circulars", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version]);
  const act = useCallback(
    async (body: Record<string, unknown>, done: (v: Record<string, unknown>) => string) => {
      if (!data) return null;
      setFailed("");
      try {
        const v = await post(data.organization_id, body);
        setStatus(done(v));
        setVersion((n) => n + 1);
        return v;
      } catch (e) {
        setFailed(failText(locale, e));
        return null;
      }
    },
    [data, locale],
  );
  return (
    <main id="main" className="circulars">
      <PageHeader title={t.title} subtitle={t.intro} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {data?.can.write && (
        <Card title={t.compose} labelledBy="circular-compose" headingId="circular-compose">
          {!composing ? (
            <Button type="button" icon="plus" onClick={() => setComposing(true)}>
              {t.newOne}
            </Button>
          ) : (
            <Compose locale={locale} data={data} act={act} done={() => setComposing(false)} />
          )}
        </Card>
      )}
      <Card title={t.mine} labelledBy="circular-mine" headingId="circular-mine">
        {!data ? null : !data.mine.length ? (
          <EmptyState title={t.none} />
        ) : (
          <ul className="plain-list circular-list">
            {data.mine.map((c) => (
              <li key={c.id}>
                <Link href={`/${locale}/circulars/${c.id}`}>
                  <strong>{c.title}</strong>
                </Link>{" "}
                <span className="small muted">
                  {c.federation} · {when(locale, c.sent_at)}
                </span>{" "}
                {!c.read_at && <Badge tone="info">{t.unread}</Badge>} {c.ack_required && !c.acknowledged_at && <Badge tone="warning">{t.toAck}</Badge>}
                {c.acknowledged_at && <Badge tone="success">{t.acked}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data?.can.write && (
        <Card title={t.sentList} labelledBy="circular-sent" headingId="circular-sent">
          {!data.circulars.length ? (
            <EmptyState title={t.none} />
          ) : (
            <ul className="plain-list circular-list">
              {data.circulars.map((c) => (
                <li key={c.id}>
                  <p>
                    <Link href={`/${locale}/circulars/${c.id}`}>
                      <strong>{c.title}</strong>
                    </Link>{" "}
                    <Badge tone={c.status === "sent" ? "success" : c.status === "scheduled" ? "info" : "neutral"}>{t.status[c.status as "draft" | "scheduled" | "sent"]}</Badge>
                  </p>
                  <p className="small muted">
                    {c.audiences.map((a) => t.audience[a as (typeof circularAudiences)[number]]).join(", ")}
                    {c.status === "sent" && <> · {fill(t.rate, { read: c.read, total: c.recipients })}</>}
                    {c.ack_required && c.status === "sent" && <> · {fill(t.ackRate, { n: c.acknowledged })}</>}
                  </p>
                  {c.status !== "sent" && (
                    <p className="actions">
                      <Button type="button" size="sm" onClick={() => void act({ action: "send", id: c.id }, (v) => (v.scheduled ? t.scheduled : fill(t.sent, { n: Number(v.sent ?? 0) })))}>
                        {t.send}
                        <span className="sr-only"> : {c.title}</span>
                      </Button>
                      <Attach locale={locale} id={c.id} act={act} />
                      <Button type="button" size="sm" variant="ghost" onClick={() => void act({ action: "delete", id: c.id }, () => t.saved)}>
                        {t.remove}
                        <span className="sr-only"> : {c.title}</span>
                      </Button>
                    </p>
                  )}
                  {c.files.length > 0 && (
                    <p className="small">
                      {t.files} : {c.files.map((f) => f.filename).join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </main>
  );
}

function Attach({ locale, id, act }: { locale: Locale; id: string; act: (b: Record<string, unknown>, done: (v: Record<string, unknown>) => string) => Promise<unknown> }) {
  const t = circularsCopy[locale];
  async function change(file: File | undefined) {
    if (!file) return;
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("INVALID_FILE"));
      r.readAsDataURL(file);
    });
    await act({ action: "addFile", id, filename: file.name, mediaType: file.type, data }, () => t.saved);
  }
  const fid = `circular-file-${id}`;
  return (
    <label className="button secondary sm file-button" htmlFor={fid}>
      {t.attach}
      <input id={fid} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => void change(e.target.files?.[0])} />
    </label>
  );
}

function Compose({ locale, data, act, done }: { locale: Locale; data: View; act: (b: Record<string, unknown>, done: (v: Record<string, unknown>) => string) => Promise<unknown>; done: () => void }) {
  const t = circularsCopy[locale];
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const at = String(f.get("sendAt") ?? "");
    const ok = await act(
      {
        action: "save",
        title: f.get("title"),
        body: f.get("body"),
        audiences: f.getAll("audience"),
        clubs: f.getAll("club"),
        ackRequired: f.get("ack") === "on",
        sendAt: at ? new Date(at).toISOString() : null,
      },
      () => t.saved,
    );
    if (ok) done();
  }
  return (
    <form className="stack" onSubmit={(e) => void save(e)}>
      <Field id="circular-title" label={t.subject} required>
        <input id="circular-title" name="title" required minLength={3} maxLength={160} />
      </Field>
      <Field id="circular-body" label={t.body} required>
        <textarea id="circular-body" name="body" required rows={8} maxLength={20000} />
      </Field>
      <fieldset>
        <legend>{t.audiences}</legend>
        {circularAudiences.map((a) => (
          <label className="check" key={a}>
            <input type="checkbox" name="audience" value={a} defaultChecked={a === "presidents"} /> {t.audience[a]}
          </label>
        ))}
      </fieldset>
      {data.clubs.length > 0 && (
        <fieldset aria-describedby="circular-clubs-help">
          <legend>{t.clubs}</legend>
          <p className="small muted" id="circular-clubs-help">
            {t.clubsHelp}
          </p>
          {data.clubs.map((c) => (
            <label className="check" key={c.id}>
              <input type="checkbox" name="club" value={c.id} /> {c.name}
            </label>
          ))}
        </fieldset>
      )}
      <label className="check">
        <input type="checkbox" name="ack" /> {t.ackRequired}
      </label>
      <Field id="circular-at" label={t.sendAt} help={t.sendAtHelp}>
        <input id="circular-at" name="sendAt" type="datetime-local" aria-describedby={describedBy("circular-at", true)} />
      </Field>
      <p className="actions">
        <Button type="button" variant="ghost" onClick={done}>
          {circularsCopy[locale].back}
        </Button>
        <Button type="submit">{t.save}</Button>
      </p>
    </form>
  );
}

export function CircularPage({ locale, id }: { locale: Locale; id: string }) {
  const t = circularsCopy[locale];
  const [data, setData] = useState<Detail | null>(null),
    [missing, setMissing] = useState(false),
    [version, setVersion] = useState(0),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/circulars?id=${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setMissing(true);
        setData((await r.json()) as Detail);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, version]);
  async function act(body: Record<string, unknown>, done: (v: Record<string, unknown>) => string) {
    if (!data) return;
    setFailed("");
    try {
      const v = await post(data.organization_id, body);
      setStatus(done(v));
      setVersion((n) => n + 1);
    } catch (e) {
      setFailed(failText(locale, e));
    }
  }
  if (missing)
    return (
      <main id="main">
        <EmptyState title={t.none} action={<Link href={`/${locale}/circulars`}>{t.back}</Link>} />
      </main>
    );
  if (!data) return <main id="main" />;
  const c = data.circular;
  return (
    <main id="main" className="circulars">
      <PageHeader title={c.title} subtitle={`${c.federation} · ${when(locale, c.sent_at)}`} crumbs={[{ label: t.title, href: `/${locale}/circulars` }, { label: c.title }]} crumbsLabel={t.title} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      <div className="circular-body pre-line">{c.body}</div>
      {data.files.length > 0 && (
        <section aria-labelledby="circular-files">
          <h2 id="circular-files">{t.files}</h2>
          <ul className="plain-list">
            {data.files.map((f) => (
              <li key={f.id}>
                <a href={`/api/circulars/file?id=${f.id}`}>{f.filename}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.me && c.ack_required && (
        <p className="actions">
          {data.me.acknowledged ? (
            <Badge tone="success">{t.acked}</Badge>
          ) : (
            <Button type="button" onClick={() => void act({ action: "ack", id: c.id }, () => t.ackDone)}>
              {t.ack}
            </Button>
          )}
        </p>
      )}
      {data.can.write && c.status === "sent" && (
        <Card title={t.followUp} labelledBy="circular-follow" headingId="circular-follow">
          <p className="actions">
            <Button type="button" variant="secondary" onClick={() => void act({ action: "remind", id: c.id }, (v) => fill(t.reminded, { n: Number(v.sent ?? 0) }))}>
              {t.remind}
            </Button>
            <a className="button secondary" href={`/api/circulars?export=${c.id}`}>
              {t.export}
            </a>
          </p>
          <ul className="plain-list">
            {data.followUp.map((o) => (
              <li key={o.id}>
                <strong>{o.name}</strong> · {fill(t.rate, { read: o.read, total: o.recipients })}
                {c.ack_required && <> · {fill(t.ackRate, { n: o.acknowledged })}</>}
                {o.waiting.length > 0 && <p className="small muted">{fill(t.waiting, { names: o.waiting.join(", ") })}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}

/** 32: the « Équipe fédérale » page. */
export function FederationTeamPage({ locale }: { locale: Locale }) {
  const t = circularsCopy[locale];
  return (
    <main id="main" className="federation-team">
      <PageHeader title={t.teamTitle} subtitle={t.teamIntro} />
      <FederationTeam locale={locale} />
    </main>
  );
}
