"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { PolicyView } from "@/domains/federation/policy-service";
import { trainingFormats } from "@/domains/federation/policy";
import { federationPolicyCopy } from "./federation-policy-copy";
import { errors } from "./access-copy";
import { Button, Card, EmptyState, PageHeader } from "./ui";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";

const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const euros = (cents: number) => (cents / 100).toFixed(2);
const centsOf = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".")) * 100);
const fineKinds = ["late", "forfeit", "forfeit_day"] as const;

/** International, step 2 (05/11/2026): the federation's rulebook (amounts) and country, every save versioned. */
export function FederationPolicy({ locale }: { locale: Locale }) {
  const t = federationPolicyCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, denied, reload } = useData<PolicyView>("/api/federation/policy", failure);
  const { busy, message, post } = usePost("/api/federation/policy", reload, setError, failure);
  const [resetting, setResetting] = useState(false);
  const day = (iso: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date(iso));
  const name = (c: PolicyView["countries"][number]) => (locale === "nl" ? c.name_nl : locale === "en" ? c.name_en : c.name_fr);
  if (denied) return <main id="main" className="access federation-policy"><EmptyState title={errors.FORBIDDEN?.[locale] ?? t.title} /></main>;
  const send = (body: Record<string, unknown>, done: string) => post({ ...body, organizationId: data?.organization_id }, done);
  return (
    <main id="main" className="access federation-policy">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data && (
        <>
          {!data.canManage && <p className="muted">{t.readOnly}</p>}
          <Card title={t.country} id="policy-country">
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                void send({ action: "country", code: new FormData(e.currentTarget).get("code") }, t.countrySaved);
              }}
            >
              <label>
                {t.country}
                <select name="code" defaultValue={data.country} disabled={!data.canManage}>
                  {data.countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {name(c)} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">{t.countryHint}</p>
              {data.canManage && (
                <p>
                  <Button disabled={busy}>{t.countrySave}</Button>
                </p>
              )}
            </form>
          </Card>
          <Card title={t.amounts} id="policy-amounts">
            <p className="muted">{t.amountsIntro}</p>
            <p className="muted small">{data.isDefault ? t.isDefault : fill(t.version, { n: String(data.version), day: day(data.updated_at!), name: data.updated_by ?? "" })}</p>
            <form
              key={data.version ?? "default"}
              className="stack-form"
              aria-label={t.amounts}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const rates = (scope: "national" | "international") => Object.fromEntries(trainingFormats.map((f) => [f, centsOf(d.get(`${scope}-${f}`))]));
                void send(
                  {
                    action: "save",
                    policy: {
                      trainingRates: { national: rates("national"), international: rates("international") },
                      internationalFileFeeCents: centsOf(d.get("fileFee")),
                      indemnityCaps: { national: centsOf(d.get("cap-national")), international: centsOf(d.get("cap-international")) },
                      fineDefaults: Object.fromEntries(fineKinds.map((k) => [k, centsOf(d.get(`fine-${k}`))])),
                    },
                  },
                  t.saved,
                );
              }}
            >
              <fieldset className="policy-group">
                <legend>{t.rates}</legend>
                {(["national", "international"] as const).map((scope) => (
                  <div key={scope} className="form-grid" role="group" aria-label={t[scope]}>
                    <p className="policy-scope">{t[scope]}</p>
                    {trainingFormats.map((f) => (
                      <label key={f}>
                        {t.formats[f]} <span className="muted small">({t.perYear})</span>
                        <input name={`${scope}-${f}`} inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={euros(data.policy.trainingRates[scope][f])} disabled={!data.canManage} />
                      </label>
                    ))}
                  </div>
                ))}
              </fieldset>
              <fieldset className="policy-group">
                <legend>{t.caps}</legend>
                <div className="form-grid">
                  <label>
                    {t.fileFee}
                    <input name="fileFee" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={euros(data.policy.internationalFileFeeCents)} disabled={!data.canManage} />
                  </label>
                  <label>
                    {t.capNational}
                    <input name="cap-national" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={euros(data.policy.indemnityCaps.national)} disabled={!data.canManage} />
                  </label>
                  <label>
                    {t.capInternational}
                    <input name="cap-international" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={euros(data.policy.indemnityCaps.international)} disabled={!data.canManage} />
                  </label>
                </div>
              </fieldset>
              <fieldset className="policy-group">
                <legend>{t.fines}</legend>
                <div className="form-grid">
                  {fineKinds.map((k) => (
                    <label key={k}>
                      {t.fineKinds[k]}
                      <input name={`fine-${k}`} inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={euros(data.policy.fineDefaults[k])} disabled={!data.canManage} />
                    </label>
                  ))}
                </div>
              </fieldset>
              {data.canManage && (
                <p className="actions">
                  <Button disabled={busy}>{t.save}</Button>
                  {!data.isDefault && (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => setResetting(true)}>
                      {t.reset}
                    </Button>
                  )}
                </p>
              )}
            </form>
          </Card>
          <Card title={t.history} id="policy-history">
            {data.history.length ? (
              <ul className="plain-list">
                {data.history.map((h) => (
                  <li key={h.version}>{fill(t.historyLine, { n: String(h.version), day: day(h.changed_at), name: h.changed_by })}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.historyNone}</p>
            )}
          </Card>
        </>
      )}
      {resetting && (
        <Modal title={t.reset} close={() => setResetting(false)}>
          <p>{t.resetConfirm}</p>
          <p className="actions">
            <Button type="button" disabled={busy} onClick={() => void send({ action: "reset" }, t.resetDone).then((ok) => ok && setResetting(false))}>
              {t.reset}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setResetting(false)}>
              {t.cancel}
            </Button>
          </p>
        </Modal>
      )}
    </main>
  );
}
