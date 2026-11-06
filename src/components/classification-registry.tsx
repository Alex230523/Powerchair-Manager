"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { RegistryView } from "@/domains/classification/registry";
import { classificationRegistryCopy } from "./classification-registry-copy";
import { classificationCopy } from "./classification-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";
import { ClassificationBadge } from "./classification-badge";
import { useData, usePost } from "./use-api";

const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));

/** International, step 3 (06/11/2026): the federation's registry of classifications. */
export function ClassificationRegistry({ locale }: { locale: Locale }) {
  const t = classificationRegistryCopy[locale],
    cc = classificationCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const [q, setQ] = useState(""),
    [sent, setSent] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setSent(q), 300);
    return () => clearTimeout(h);
  }, [q]);
  const { data, error, setError, denied, reload } = useData<RegistryView>(`/api/federation/registry?q=${encodeURIComponent(sent)}`, failure);
  const { busy, message, post } = usePost("/api/federation/registry", reload, setError, failure);
  const [who, setWho] = useState<"player" | "code">("player");
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso.slice(0, 10) + "T12:00:00Z"));
  if (denied) return <main id="main" className="access registry"><EmptyState title={errors.FORBIDDEN?.[locale] ?? t.title} /></main>;
  const send = (body: Record<string, unknown>, done: string) => post({ ...body, organizationId: data?.organization_id }, done);
  const line = (r: NonNullable<RegistryView["players"][number]["current"]>) => fill(t.recordLine, { classification: r.classification, federation: r.federation, day: day(r.decided_on) }) + (r.valid_until ? ` · ${fill(t.until, { day: day(r.valid_until) })}` : "");
  return (
    <main id="main" className="access registry">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data && (
        <>
          {!data.canManage && <p className="muted">{t.readOnly}</p>}
          <div className="toolbar-filters" role="search">
            <label>
              {t.search}
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <Card title={t.players}>
            {data.players.length ? (
              <div className="table-scroll" tabIndex={0}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.columns.player}</th>
                      <th scope="col">{t.columns.club}</th>
                      <th scope="col">{t.columns.identity}</th>
                      <th scope="col">{t.columns.sheet}</th>
                      <th scope="col">{t.columns.registry}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.players.map((x) => (
                      <tr key={x.profile_id}>
                        <th scope="row">{x.full_name}</th>
                        <td>{x.club}</td>
                        <td>
                          <code>{x.identity_code}</code>
                        </td>
                        <td>
                          <ClassificationBadge locale={locale} value={x.classification} />
                        </td>
                        <td>
                          {x.current ? (
                            <>
                              {line(x.current)}{" "}
                              {x.current.international && <Badge tone="info">{t.international}</Badge>}
                              {x.expiring && <Badge tone="warning">{t.expiring}</Badge>}
                            </>
                          ) : (
                            <span className="muted">{t.noRecord}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{t.playersNone}</p>
            )}
          </Card>
          {data.canManage && (
            <Card title={t.add}>
              <p className="muted">{t.addIntro}</p>
              <form
                className="stack-form"
                aria-label={t.add}
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget),
                    form = e.currentTarget;
                  void send(
                    {
                      action: "record",
                      ...(who === "player" ? { profileId: String(d.get("profile")) } : { identityCode: String(d.get("code") ?? "").trim().toUpperCase() }),
                      classification: String(d.get("classification")),
                      decidedOn: String(d.get("decidedOn")),
                      validUntil: String(d.get("validUntil") ?? "") || null,
                      classifier: String(d.get("classifier") ?? ""),
                      international: d.get("international") === "on",
                      note: String(d.get("note") ?? ""),
                    },
                    t.saved,
                  ).then((ok) => ok && form.reset());
                }}
              >
                <fieldset className="policy-group">
                  <legend>{t.who}</legend>
                  <label className="check">
                    <input type="radio" name="who" checked={who === "player"} onChange={() => setWho("player")} /> {t.whoPlayer}
                  </label>
                  <label className="check">
                    <input type="radio" name="who" checked={who === "code"} onChange={() => setWho("code")} /> {t.whoCode}
                  </label>
                  {who === "player" ? (
                    <label>
                      {t.whoPlayer}
                      <select name="profile" required defaultValue="">
                        <option value="" disabled>
                          {t.whoPlayer}
                        </option>
                        {data.players.map((x) => (
                          <option key={x.profile_id} value={x.profile_id}>
                            {x.full_name} · {x.club}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      {t.whoCode}
                      <input name="code" required pattern="[Pp][Ff][Mm]-[0-9A-Fa-f]{10}" placeholder="PFM-XXXXXXXXXX" />
                      <span className="muted small">{t.codeHint}</span>
                    </label>
                  )}
                </fieldset>
                <div className="form-grid">
                  <label>
                    {t.classification}
                    <select name="classification" defaultValue="PF1">
                      <option value="PF1">{cc.classes.PF1}</option>
                      <option value="PF2">{cc.classes.PF2}</option>
                    </select>
                  </label>
                  <label>
                    {t.decidedOn}
                    <input name="decidedOn" type="date" required defaultValue={data.today} max={data.today} />
                  </label>
                  <label>
                    {t.validUntil}
                    <input name="validUntil" type="date" />
                  </label>
                  <label>
                    {t.classifier}
                    <input name="classifier" maxLength={160} />
                  </label>
                  <label className="check">
                    <input type="checkbox" name="international" /> {t.internationalFlag}
                  </label>
                </div>
                <label>
                  {t.note}
                  <textarea name="note" rows={2} maxLength={1000} />
                </label>
                <p>
                  <Button disabled={busy}>{t.save}</Button>
                </p>
              </form>
            </Card>
          )}
          <Card title={t.records}>
            {data.records.length ? (
              <ul className="plain-list">
                {data.records.map((r) => (
                  <li key={r.id} className="console-plan">
                    <span>
                      <strong>{r.full_name || r.identity_code}</strong> <code>{r.identity_code}</code> · {line(r)} · {t.sources[r.source]}
                      {r.classifier ? ` · ${r.classifier}` : ""}
                      {r.note ? ` · ${r.note}` : ""} {r.international && <Badge tone="info">{t.international}</Badge>}
                    </span>
                    {data.canManage && r.source === "manual" && r.federation_id === data.organization_id && (
                      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "remove", id: r.id }, t.removed)}>
                        {t.remove}
                        <span className="sr-only"> : {r.full_name || r.identity_code}</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.recordsNone}</p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
