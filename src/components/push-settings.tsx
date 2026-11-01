"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { pushView } from "@/domains/notifications/push";
import { pushCopy, pushTopics } from "./push-copy";
import { fill } from "./fleet-copy";
import { errors } from "./access-copy";
import { Badge, Button, Panel } from "./ui";

/**
 * B4: « Notifications sur ce téléphone » in Settings › Notifications. A
 * guided activation (with the iPhone steps: the application must be added
 * to the home screen), the devices of the account, a test, and the topics
 * that reach the phone for each club.
 */
type View = Awaited<ReturnType<typeof pushView>>;
type Support = "checking" | "unsupported" | "denied" | "ready";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const key = (b64: string) => {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
/** A short name for the device, from its browser (no fingerprint kept). */
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, browser].filter(Boolean).join(" · ");
}
async function registration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function PushSettings({ locale }: { locale: Locale }) {
  const t = pushCopy[locale].page;
  const [view, setView] = useState<View | null>(null),
    [support, setSupport] = useState<Support>("checking"),
    [endpoint, setEndpoint] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const failure = (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;
  useEffect(() => {
    let cancelled = false;
    fetch("/api/push", { cache: "no-store" })
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
  // What this browser can do, and whether this device is already on (read in a promise: no state set during the effect itself).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(async () => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return { s: "unsupported" as const, e: null };
        if (Notification.permission === "denied") return { s: "denied" as const, e: null };
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        return { s: "ready" as const, e: sub?.endpoint ?? null };
      })
      .then((r) => {
        if (cancelled) return;
        setSupport(r.s);
        setEndpoint(r.e);
      })
      .catch(() => {
        if (!cancelled) setSupport("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    return v;
  }
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await fn());
      setRevision((n) => n + 1);
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  const enable = () =>
    run(async () => {
      if (!view?.publicKey) throw new Error("PUSH_NOT_CONFIGURED");
      if ((await Notification.requestPermission()) !== "granted") {
        setSupport("denied");
        throw new Error("PERMISSION_DENIED");
      }
      const reg = await registration();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(view.publicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await post({ action: "subscribe", subscription: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() } });
      return t.enabled;
    });
  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await post({ action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      return t.disabled;
    });
  const here = !!endpoint && !!view?.devices.some((d) => d.endpoint === endpoint);
  return (
    <Panel id="notif-push" title={t.title}>
      <p>{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {view && !view.publicKey && <p className="notice">{t.notConfigured}</p>}
      {view?.publicKey && support === "unsupported" && <p className="notice">{t.unsupported}</p>}
      {view?.publicKey && support === "denied" && <p className="notice">{t.denied}</p>}
      <p className="field-help">{t.iphone}</p>
      {view?.publicKey && support === "ready" && (
        <p className="actions">
          {here ? (
            <Button variant="secondary" disabled={busy} onClick={() => void disable()}>
              {t.disable}
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => void enable()}>
              {t.enable}
            </Button>
          )}
          {view.devices.length > 0 && (
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => {
                await post({ action: "test" });
                return t.testSent;
              })}>
              {t.test}
            </Button>
          )}
        </p>
      )}
      {view && (
        <>
          <h3>{t.devices}</h3>
          {view.devices.length ? (
            <ul className="records">
              {view.devices.map((d) => (
                <li key={d.id} className="link-row">
                  <span>
                    <strong>{d.label || "…"}</strong>{" "}
                    <span className="muted small">{fill(t.since, { date: new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium" }).format(new Date(d.created_at)) })}</span>
                    {d.endpoint === endpoint && (
                      <>
                        {" "}
                        <Badge tone="success">{t.thisDevice}</Badge>
                      </>
                    )}
                  </span>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(async () => {
                      await post({ action: "remove", id: d.id });
                      return t.saved;
                    })}>
                    {t.remove}
                    <span className="sr-only"> : {d.label || "…"}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noDevices}</p>
          )}
          {view.clubs.length > 0 && (
            <>
              <h3>{t.topics}</h3>
              <p className="field-help">{t.topicsHint}</p>
              {view.clubs.map((c) => (
                <fieldset key={c.id} className="push-topics">
                  <legend>{c.name}</legend>
                  {pushTopics.map((topic) => (
                    <label key={topic} className="check">
                      <input
                        type="checkbox"
                        checked={c.topics[topic]}
                        disabled={busy}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          void run(async () => {
                            await post({ action: "preference", organizationId: c.id, topic, enabled });
                            return t.saved;
                          });
                        }}
                      />
                      <span>
                        {t.topicLabels[topic]}
                        {t.topicHints[topic] && <span className="field-help"> · {t.topicHints[topic]}</span>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </>
          )}
        </>
      )}
    </Panel>
  );
}
