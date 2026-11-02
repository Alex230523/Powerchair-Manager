"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { privacyView } from "@/domains/privacy/service";
import { privacyCopy } from "./privacy-copy";
import { errors } from "./access-copy";
import { Badge, PageHeader, Card, EmptyState } from "./ui";

type View = Awaited<ReturnType<typeof privacyView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** Duplicates, GDPR export and anonymisation, retention rules. */
/** 12: also a part of Réglages › Données personnelles (embedded: no page of its own). */
export function Privacy({ locale, embedded = false }: { locale: Locale; embedded?: boolean }) {
  const t = privacyCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false),
    [merging, setMerging] = useState(""),
    [person, setPerson] = useState("");
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const load = useCallback(async () => {
    const r = await fetch("/api/privacy", { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/privacy", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (
          [
            "FORBIDDEN",
            "MFA_REQUIRED",
            "CLUB_ONLY",
            "CONTEXT_REQUIRED",
          ].includes(e.message)
        )
          setDenied(true);
        else setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [failure]);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: view?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(fill(done, { n: v.count ?? 0 }));
      return true;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const day = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat(tag(locale), {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(d.slice(0, 10) + "T12:00:00Z"))
      : "";
  const selected = view?.people.find((p) => p.id === person);

  return (
    <Wrapper embedded={embedded}>
      {embedded ? (
        <h2 id="settings-club-data">{t.title}</h2>
      ) : (
        <PageHeader title={t.title} subtitle={t.intro} />
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.restricted}</p>}
      {!view && !denied && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          <Card title={t.duplicates} labelledBy="privacy-duplicates" headingId="privacy-duplicates">
            <p className="muted">{t.duplicatesIntro}</p>
            {view.duplicates.length ? (
              <ul className="records duplicate-list">
                {view.duplicates.map(({ a, b, reason }) => {
                  const key = a.id + b.id;
                  const describe = (x: typeof a) =>
                    [
                      x.birth_date && `${t.born} ${day(x.birth_date)}`,
                      x.email,
                      x.has_account && t.account,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  return (
                    <li key={key}>
                      <div className="duplicate-pair">
                        <span>
                          <strong>{a.full_name}</strong>
                          <span className="muted"> {describe(a)}</span>
                        </span>
                        <Badge>
                          {reason === "name" ? t.sameName : t.sameEmail}
                        </Badge>
                        <span>
                          <strong>{b.full_name}</strong>
                          <span className="muted"> {describe(b)}</span>
                        </span>
                      </div>
                      <div className="row-actions">
                        {merging === key ? (
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void send(
                                {
                                  action: "merge",
                                  keepId: a.id,
                                  removeId: b.id,
                                },
                                t.merged,
                              ).then(() => setMerging(""))
                            }
                          >
                            {t.confirmMerge}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => setMerging(key)}
                          >
                            {fill(t.merge, { name: a.full_name })}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={t.noDuplicate} />
            )}
          </Card>

          <div className="grid">
            <Card title={t.access} labelledBy="privacy-access" headingId="privacy-access">
              <p className="muted">{t.accessIntro}</p>
              <label htmlFor="privacy-person">
                {t.person}
                <select
                  id="privacy-person"
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  <option value="">{t.choose}</option>
                  {view.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                      {p.birth_date ? ` (${p.birth_date.slice(0, 4)})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <p>
                  <a
                    className="button secondary"
                    href={`/api/privacy/export?id=${selected.id}`}
                  >
                    {t.export}
                  </a>
                </p>
              )}
              <h3>{t.anonymize}</h3>
              <p className="muted">{t.anonymizeIntro}</p>
              {selected && (
                <form
                  className="finance-form"
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    const confirmName = String(
                      new FormData(e.currentTarget).get("confirm") ?? "",
                    );
                    void send(
                      { action: "anonymize", id: selected.id, confirmName },
                      t.anonymized,
                    ).then((ok) => ok && setPerson(""));
                  }}
                >
                  <label htmlFor="privacy-confirm">
                    {t.confirmLabel} : <strong>{selected.full_name}</strong>
                    <input
                      id="privacy-confirm"
                      name="confirm"
                      required
                      autoComplete="off"
                    />
                  </label>
                  <button className="button danger" disabled={busy}>
                    {t.anonymizeButton}
                  </button>
                </form>
              )}
            </Card>

            <Card title={t.retention} labelledBy="privacy-retention" headingId="privacy-retention">
              <p className="muted">{t.retentionIntro}</p>
              <form
                className="finance-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void send(
                    {
                      action: "settings",
                      formerMemberYears: Number(f.get("years")),
                      refusedApplicationMonths: Number(f.get("months")),
                    },
                    t.saved,
                  );
                }}
              >
                <label htmlFor="privacy-years">
                  {t.formerYears}
                  <input
                    id="privacy-years"
                    name="years"
                    type="number"
                    min={1}
                    max={30}
                    required
                    defaultValue={view.settings.former_member_years}
                  />
                </label>
                <label htmlFor="privacy-months">
                  {t.refusedMonths}
                  <input
                    id="privacy-months"
                    name="months"
                    type="number"
                    min={1}
                    max={120}
                    required
                    defaultValue={view.settings.refused_application_months}
                  />
                </label>
                <button className="button secondary" disabled={busy}>
                  {t.save}
                </button>
              </form>
              <h3>{t.toReview}</h3>
              <p>
                <strong>
                  {fill(t.formerList, { n: view.settings.former_member_years })}
                </strong>
              </p>
              {view.retention.former.length ? (
                <ul className="records">
                  {view.retention.former.map((r) => (
                    <li key={r.id}>
                      {r.full_name}
                      <span className="muted">
                        {" "}
                        · {day(String(r.last_activity))}
                      </span>{" "}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setPerson(r.id)}
                      >
                        {t.anonymize}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title={t.noFormer} />
              )}
              <p>{fill(t.applications, { n: view.retention.applications })}</p>
              {view.retention.applications > 0 && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void send({ action: "purgeApplications" }, t.purged)
                  }
                >
                  {t.purge}
                </button>
              )}
            </Card>
          </div>

          {view.history.length > 0 && (
            <Card title={t.history} labelledBy="privacy-history" headingId="privacy-history">
              <ul className="records">
                {view.history.map((h, i) => (
                  <li key={i}>
                    {t.actions[h.action] ?? h.action}
                    {h.count > 1 ? ` (${h.count})` : ""}
                    <span className="muted">
                      {" "}
                      · {h.name} · {day(String(h.created_at))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Wrapper>
  );
}

function Wrapper({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? (
    <section className="privacy embedded" aria-labelledby="settings-club-data">
      {children}
    </section>
  ) : (
    <main id="main" className="access privacy">
      {children}
    </main>
  );
}
