"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { integrationsView } from "@/domains/integrations/public";
import { apiScopes, publicBlocks, publicCopy } from "./public-copy";
import { fill } from "./fleet-copy";
import { errors } from "./access-copy";
import { Badge, Button, PageHeader, Panel, Tabs } from "./ui";

/**
 * B6: Club › Page publique. The page and its blocks, the public calendar,
 * the tournaments' pages, the widgets' snippets, the minors' names, the API
 * keys and the webhooks with their journal.
 */
type View = Awaited<ReturnType<typeof integrationsView>>;
type Send = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
type Tab = "page" | "widgets" | "consents" | "api" | "webhooks";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
const stateTones = { pending: "warning", sent: "success", failed: "danger" } as const;

export function Integrations({ locale }: { locale: Locale }) {
  const t = publicCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState<Tab>("page"),
    [origin, setOrigin] = useState(""),
    [secret, setSecret] = useState<{ kind: "key" | "hook"; value: string } | null>(null);
  const failure = (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;
  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) {
          setView(v);
          setOrigin(window.location.origin);
        }
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
      const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setMessage(t.saved);
      setRevision((n) => n + 1);
      return v;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const tabs: Tab[] = ["page", "widgets", "consents", "api", "webhooks"];
  return (
    <main id="main" className="access integrations">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          <Tabs label={t.tabsLabel} items={tabs.map((k) => ({ id: k, label: t.tabs[k] }))} value={tab} onChange={(v) => setTab(v as Tab)} panelId="integrations-panel" idPrefix="integrations-tab" />
          <div id="integrations-panel" role="tabpanel" aria-labelledby={`integrations-tab-${tab}`}>
            {secret && (
              <div className="notice" role="status">
                <p>
                  <strong>{secret.kind === "key" ? t.newKey : t.newSecret}</strong> {secret.kind === "key" && t.newKeyHint}
                </p>
                <code className="secret-value">{secret.value}</code>
              </div>
            )}
            {tab === "page" && <PageTab key={JSON.stringify(view.page)} locale={locale} view={view} origin={origin} busy={busy} send={send} />}
            {tab === "widgets" && <WidgetsTab locale={locale} view={view} origin={origin} />}
            {tab === "consents" && (
              <Panel title={t.consents} id="integrations-consents">
                <p className="field-help">{t.consentsHint}</p>
                {view.minors.length ? (
                  <ul className="records">
                    {view.minors.map((m) => (
                      <li key={m.id}>
                        <label className="check">
                          <input type="checkbox" checked={m.consent} disabled={busy} onChange={(e) => void send({ action: "consent", profileId: m.id, consent: e.target.checked })} />
                          {fill(t.consentLabel, { name: m.full_name })}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{t.noMinors}</p>
                )}
              </Panel>
            )}
            {tab === "api" && (
              <Panel title={t.keys} id="integrations-keys">
                <p className="field-help">{t.keysHint}</p>
                <form
                  className="stack-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const d = new FormData(form);
                    void send({ action: "createKey", name: String(d.get("name") ?? "").trim(), scopes: d.getAll("scopes") }).then((r) => {
                      if (r?.key) {
                        setSecret({ kind: "key", value: String(r.key) });
                        form.reset();
                      }
                    });
                  }}
                >
                  <label htmlFor="key-name">
                    {t.keyName}
                    <input id="key-name" name="name" required minLength={2} maxLength={80} />
                  </label>
                  <fieldset>
                    <legend>{t.scopes}</legend>
                    {apiScopes.map((s) => (
                      <label key={s} className="check">
                        <input type="checkbox" name="scopes" value={s} defaultChecked={s !== "read:events"} />
                        {t.scopeLabels[s]}
                      </label>
                    ))}
                  </fieldset>
                  <p className="actions">
                    <button className="button" disabled={busy}>
                      {t.createKey}
                    </button>
                    <a className="button secondary" href="/api/v1/openapi.json" target="_blank" rel="noopener">
                      {t.docs}
                    </a>
                  </p>
                </form>
                {view.keys.length ? (
                  <ul className="records">
                    {view.keys.map((k) => (
                      <li key={k.id} className="link-row">
                        <span>
                          <strong>{k.name}</strong> <code>pfm_{k.prefix}_…</code> {k.revoked_at && <Badge tone="neutral">{t.revoked}</Badge>}
                          <span className="muted small">
                            {" "}
                            · {k.scopes.map((s) => t.scopeLabels[s as keyof typeof t.scopeLabels] ?? s).join(", ")} · {k.last_used_at ? fill(t.lastUsed, { date: when(locale, k.last_used_at) }) : t.never}
                          </span>
                        </span>
                        {!k.revoked_at && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "revokeKey", id: k.id })}>
                            {t.revoke}
                            <span className="sr-only"> : {k.name}</span>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{t.noKeys}</p>
                )}
              </Panel>
            )}
            {tab === "api" && (
              <Panel title={t.mcp} id="integrations-mcp">
                <p className="field-help">{t.mcpHint}</p>
                <form
                  className="stack-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const d = new FormData(form);
                    void send({ action: "createMcpKey", name: String(d.get("name") ?? "").trim(), scopes: d.getAll("scopes") }).then((r) => {
                      if (r?.key) {
                        setSecret({ kind: "key", value: String(r.key) });
                        form.reset();
                      }
                    });
                  }}
                >
                  <label htmlFor="mcp-key-name">
                    {t.keyName}
                    <input id="mcp-key-name" name="name" required minLength={2} maxLength={80} />
                  </label>
                  <fieldset>
                    <legend>{t.scopes}</legend>
                    {(["club:read", "calendar:read", "dues:read"] as const).map((s) => (
                      <label key={s} className="check">
                        <input type="checkbox" name="scopes" value={s} defaultChecked={s !== "dues:read"} />
                        {t.mcpScopes[s]}
                      </label>
                    ))}
                  </fieldset>
                  <p className="actions">
                    <button className="button" disabled={busy}>
                      {t.mcpCreate}
                    </button>
                  </p>
                </form>
                <p className="muted small">{t.mcpHowTo}</p>
                <code className="secret-value">{`${origin}${view.mcpEndpoint}`}</code>
                <p className="muted small">{t.mcpTools}</p>
                {view.mcpKeys.length ? (
                  <ul className="records">
                    {view.mcpKeys.map((k) => (
                      <li key={k.id} className="link-row">
                        <span>
                          <strong>{k.name}</strong> <code>pfmorg_{k.prefix}_…</code> {k.revoked_at && <Badge tone="neutral">{t.revoked}</Badge>}
                          <span className="muted small">
                            {" "}
                            · {k.scopes.map((s) => t.mcpScopes[s]).join(", ")} · {fill(t.mcpBy, { name: k.created_by_name })} · {k.last_used_at ? fill(t.lastUsed, { date: when(locale, k.last_used_at) }) : t.never}
                          </span>
                        </span>
                        {!k.revoked_at && (
                          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "revokeMcpKey", id: k.id })}>
                            {t.revoke}
                            <span className="sr-only"> : {k.name}</span>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{t.mcpNone}</p>
                )}
              </Panel>
            )}
            {tab === "webhooks" && <HooksTab locale={locale} view={view} busy={busy} send={send} shown={(value) => setSecret({ kind: "hook", value })} />}
          </div>
        </>
      )}
    </main>
  );
}

function PageTab({ locale, view, origin, busy, send }: { locale: Locale; view: View; origin: string; busy: boolean; send: Send }) {
  const t = publicCopy[locale];
  const page = view.page;
  return (
    <>
      <Panel title={t.tabs.page} id="integrations-page">
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            void send({ action: "page", enabled: d.get("enabled") === "on", slug: String(d.get("slug") ?? "").trim(), intro: String(d.get("intro") ?? "").trim(), blocks: d.getAll("blocks") });
          }}
        >
          <label className="check">
            <input type="checkbox" name="enabled" defaultChecked={page.enabled} aria-describedby="public-enabled-help" />
            {t.enabled}
          </label>
          <p id="public-enabled-help" className="field-help">
            {t.enabledHint}
          </p>
          <label htmlFor="public-slug">
            {t.slug}
            <input id="public-slug" name="slug" required pattern="[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])" defaultValue={page.slug} aria-describedby="public-slug-help" />
            <span id="public-slug-help" className="field-help">
              {t.slugHint} {origin && `${origin}/${locale}/c/${page.slug}`}
            </span>
          </label>
          <label htmlFor="public-intro">
            {t.introText}
            <textarea id="public-intro" name="intro" rows={3} maxLength={2000} defaultValue={page.intro} />
          </label>
          <fieldset>
            <legend>{t.blocks}</legend>
            {publicBlocks.map((b) => (
              <label key={b} className="check">
                <input type="checkbox" name="blocks" value={b} defaultChecked={page.blocks.includes(b)} />
                {t.blockLabels[b]}
              </label>
            ))}
            <p className="field-help">{t.sponsorsHint}</p>
          </fieldset>
          <p className="actions">
            <button className="button" disabled={busy}>
              {t.save}
            </button>
            {page.enabled && page.saved && (
              <Link className="button secondary" href={`/${locale}/c/${page.slug}`} target="_blank" rel="noopener">
                {t.view}
              </Link>
            )}
          </p>
        </form>
      </Panel>
      <Panel title={t.ics} id="integrations-ics">
        <p className="field-help">{t.icsHint}</p>
        {page.ics ? <code className="secret-value">{`${origin}/api/public/ics/${page.ics}`}</code> : <p className="muted">{t.icsNone}</p>}
        <p className="actions">
          <Button variant={page.ics ? "secondary" : "primary"} disabled={busy} onClick={() => void send({ action: "ics", enabled: true })}>
            {t.icsCreate}
          </Button>
          {page.ics && (
            <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "ics", enabled: false })}>
              {t.icsRevoke}
            </Button>
          )}
        </p>
      </Panel>
      <Panel title={t.tournaments} id="integrations-tournaments">
        <p className="field-help">{t.tournamentsHint}</p>
        {view.tournaments.length ? (
          <ul className="records">
            {view.tournaments.map((x) => (
              <li key={x.id} className="link-row">
                <label className="check">
                  <input type="checkbox" checked={x.public_page} disabled={busy} onChange={(e) => void send({ action: "tournament", id: x.id, public: e.target.checked })} />
                  {`${x.name} ${x.year}`}
                </label>
                {x.public_page && (
                  <Link href={`/${locale}/t/${x.id}`} target="_blank" rel="noopener">
                    {t.view}
                    <span className="sr-only"> : {x.name}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noTournaments}</p>
        )}
      </Panel>
    </>
  );
}

function WidgetsTab({ locale, view, origin }: { locale: Locale; view: View; origin: string }) {
  const t = publicCopy[locale];
  const live = view.page.enabled && view.page.saved;
  const frame = (src: string, title: string, height: number) => `<iframe src="${src}" title="${title}" width="100%" height="${height}" style="border:0" loading="lazy"></iframe>`;
  const items = live
    ? (["next", "results", "standings"] as const).map((k) => ({ id: k, label: t.widgetKinds[k], code: frame(`${origin}/${locale}/c/${view.page.slug}/widget/${k}`, t.widgetKinds[k], k === "next" ? 220 : 420) }))
    : [];
  const forms = view.registrationForms.map((f) => ({ id: f.id, label: `${t.widgetKinds.registration} · ${f.title}`, code: frame(`${origin}/${locale}/registration-widget/${f.id}`, f.title, 640) }));
  return (
    <Panel title={t.widgets} id="integrations-widgets">
      <p className="field-help">{t.widgetsHint}</p>
      {!live && <p className="notice">{t.needsPage}</p>}
      {[...items, ...forms].map((w) => (
        <label key={w.id} htmlFor={`widget-${w.id}`}>
          {w.label} · {t.snippet}
          <textarea id={`widget-${w.id}`} readOnly rows={3} value={w.code} onFocus={(e) => e.target.select()} />
        </label>
      ))}
    </Panel>
  );
}

function HooksTab({ locale, view, busy, send, shown }: { locale: Locale; view: View; busy: boolean; send: Send; shown: (secret: string) => void }) {
  const t = publicCopy[locale];
  return (
    <>
      <Panel title={t.hooks} id="integrations-hooks">
        <p className="field-help">{t.hooksHint}</p>
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            void send({ action: "createHook", url: String(d.get("url") ?? "").trim(), events: d.getAll("events") }).then((r) => {
              if (r?.secret) {
                shown(String(r.secret));
                form.reset();
              }
            });
          }}
        >
          <label htmlFor="hook-url">
            {t.url}
            <input id="hook-url" name="url" type="url" required pattern="https://.*" maxLength={500} />
          </label>
          <fieldset>
            <legend>{t.events}</legend>
            {(Object.keys(t.eventLabels) as (keyof typeof t.eventLabels)[]).map((ev) => (
              <label key={ev} className="check">
                <input type="checkbox" name="events" value={ev} defaultChecked />
                {t.eventLabels[ev]}
              </label>
            ))}
          </fieldset>
          <p>
            <button className="button" disabled={busy}>
              {t.createHook}
            </button>
          </p>
        </form>
        {view.hooks.length ? (
          <ul className="records">
            {view.hooks.map((h) => (
              <li key={h.id} className="link-row">
                <span>
                  <strong>{h.url}</strong>
                  <span className="muted small"> · {h.events.map((ev) => t.eventLabels[ev as keyof typeof t.eventLabels] ?? ev).join(", ")}</span>
                </span>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "removeHook", id: h.id })}>
                  {t.remove}
                  <span className="sr-only"> : {h.url}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noHooks}</p>
        )}
      </Panel>
      <Panel title={t.journal} id="integrations-journal">
        {view.deliveries.length ? (
          <ul className="records">
            {view.deliveries.map((d) => (
              <li key={d.id} className="link-row">
                <span>
                  <Badge tone={stateTones[d.state]}>{t.states[d.state]}</Badge> {t.eventLabels[d.event as keyof typeof t.eventLabels] ?? d.event}
                  <span className="muted small">
                    {" "}
                    · {when(locale, d.created_at)} · {d.attempts}
                    {d.last_status ? ` · HTTP ${d.last_status}` : ""}
                    {d.last_error ? ` · ${d.last_error}` : ""}
                  </span>
                </span>
                {d.state !== "pending" && (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "replay", id: d.id })}>
                    {t.replay}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noDeliveries}</p>
        )}
      </Panel>
    </>
  );
}
