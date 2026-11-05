"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { LicenceView } from "@/domains/licences/service";
import { licenceCategories } from "@/domains/licences/schema";
import { youngDriver } from "@/domains/trips/schema";
import { coachSpaceCopy } from "./coach-space-copy";
import { errors } from "./access-copy";
import { Badge, Button, EmptyState } from "./ui";
import { Card } from "./player-profile";
import { useData, usePost } from "./use-api";
import { Modal } from "./modal";

const dayOf = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const in30 = (today: string) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
};

/**
 * Wave 17 (O1): « Permis de conduire » on a coach's profile. The coach
 * declares it (categories, validity, an optional copy); the club sees
 * « Déclaré » until a trip organiser marks it « Vérifié par le club ».
 */
export function DriverLicence({ locale, profileId }: { locale: Locale; profileId: string }) {
  const t = coachSpaceCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.none, [locale, t.none]);
  const url = `/api/licences?profile=${encodeURIComponent(profileId)}`;
  const { data, error, setError, reload } = useData<LicenceView>(url, failure);
  const { busy, message, post } = usePost("/api/licences", reload, setError, failure);
  const [editing, setEditing] = useState(false),
    [uploading, setUploading] = useState(false);
  if (!data)
    return (
      <Card title={t.licence} icon="bus" wide>
        {error ? <p role="alert">{error}</p> : <p role="status">…</p>}
      </Card>
    );
  const l = data.licence;
  const send = (body: Record<string, unknown>) => post({ ...body, profileId, organizationId: data.organization_id }, t.saved);
  async function save(form: HTMLFormElement) {
    const f = new FormData(form);
    const categories = f.getAll("category");
    if (!categories.length) {
      setError(t.pickOne);
      return;
    }
    const ok = await send({ action: "save", categories, validUntil: f.get("validUntil") || null, obtainedOn: f.get("obtainedOn") || null });
    const file = f.get("file");
    if (ok && file instanceof File && file.size > 0) {
      setUploading(true);
      const body = new FormData();
      body.set("file", file);
      body.set("profileId", profileId);
      body.set("organizationId", data!.organization_id);
      const r = await fetch("/api/licences", { method: "POST", body });
      setUploading(false);
      if (!r.ok) setError(failure((await r.json()).error));
      await reload();
    }
    if (ok) setEditing(false);
  }
  const expired = l?.valid_until && l.valid_until < data.today;
  const soon = l?.valid_until && !expired && l.valid_until <= in30(data.today);
  return (
    <Card title={t.licence} icon="bus" wide>
      <p className="muted">{t.licenceHint}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {/* 04/11/2026: declaring or changing the licence opens in a window. */}
      {editing && (
        <Modal title={l ? t.edit : t.declare} close={() => setEditing(false)}>
        <form
          className="stack-form licence-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget);
          }}
        >
          <fieldset className="check-row">
            <legend>{t.categories}</legend>
            {licenceCategories.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" name="category" value={c} defaultChecked={l?.categories.includes(c)} />
                {c}
              </label>
            ))}
          </fieldset>
          <div className="form-grid">
            <label>
              {t.since}
              <input type="date" name="obtainedOn" defaultValue={l?.obtained_on ?? ""} />
            </label>
            <label>
              {t.validUntil}
              <input type="date" name="validUntil" defaultValue={l?.valid_until ?? ""} />
            </label>
          </div>
          <label>
            {t.copy}
            <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" />
          </label>
          <div className="form-actions">
            <Button type="submit" loading={busy || uploading}>
              {t.save}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              {t.cancel}
            </Button>
          </div>
        </form>
        </Modal>
      )}
      {l ? (
        <>
          <dl className="facts">
            <dt>{t.categories}</dt>
            <dd>{l.categories.join(", ")}</dd>
            {l.obtained_on && (
              <>
                <dt>{t.since}</dt>
                <dd>{dayOf(locale, l.obtained_on)}</dd>
              </>
            )}
            <dt>{t.validUntil}</dt>
            <dd>
              {l.valid_until ? dayOf(locale, l.valid_until) : t.noDate}{" "}
              {expired && <Badge tone="danger">{t.expired}</Badge>}
              {soon && <Badge tone="warning">{t.soon}</Badge>}
              {youngDriver(l.obtained_on, data.today) && <Badge tone="warning">{t.young}</Badge>}
            </dd>
          </dl>
          <p className="licence-state">
            {l.verified_on ? (
              <Badge tone="success">
                {t.verified} · {dayOf(locale, l.verified_on)}
                {l.verified_by_name ? ` · ${l.verified_by_name}` : ""}
              </Badge>
            ) : (
              <Badge tone="neutral">{t.declared}</Badge>
            )}
          </p>
          {l.copy_filename && (
            <p>
              <a href={`/api/licences/copy?profile=${encodeURIComponent(profileId)}`} target="_blank" rel="noreferrer">
                {t.copyOf.replace("{name}", l.copy_filename)}
              </a>{" "}
              <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "removeCopy" })}>
                {t.removeCopy}
              </button>
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" icon="document" onClick={() => setEditing(true)}>
              {t.edit}
            </Button>
            {data.can.verify && (
              <Button variant="secondary" icon="check" disabled={busy} onClick={() => void send({ action: "verify", verified: !l.verified_on })}>
                {l.verified_on ? t.unverify : t.verify}
              </Button>
            )}
            <Button variant="ghost" icon="trash" disabled={busy} onClick={() => void send({ action: "remove" })}>
              {t.remove}
            </Button>
          </div>
        </>
      ) : (
        <>
          <EmptyState title={t.none} />
          <Button icon="plus" onClick={() => setEditing(true)}>
            {t.declare}
          </Button>
        </>
      )}
    </Card>
  );
}
