"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { complianceView } from "@/domains/equipment/compliance";
import { guideCopy } from "./guide-copy";
import { errors } from "./access-copy";
import { Badge, Button, Field } from "./ui";

/** « Conforme pour un match »: the lines of « Le fauteuil de match », ticked at a service, with the date. */
type View = Awaited<ReturnType<typeof complianceView>>;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

export function ChairCompliance({ locale, chairId, today }: { locale: Locale; chairId: string; today: string }) {
  const t = guideCopy[locale].compliance;
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/equipment/compliance?chair=${chairId}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [chairId, version]);
  if (!data) return null;
  const last = data.checks[0];
  const day = (d: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setFailed("");
    try {
      const r = await fetch("/api/equipment/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: data.organization_id, chairId, checkedOn: f.get("checkedOn"), items: data.items.filter((i) => f.get(i) === "on"), note: f.get("note") ?? "" }),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      setStatus(t.saved);
      setVersion((n) => n + 1);
    } catch (err) {
      const code = (err as Error).message;
      setFailed(errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code);
    } finally {
      setBusy(false);
    }
  }
  const base = `compliance-${chairId}`;
  return (
    <section className="chair-compliance" aria-labelledby={`${base}-title`}>
      <h3 id={`${base}-title`}>
        {t.title} {last ? <Badge tone={data.compliant ? "success" : "warning"}>{data.compliant ? t.ok : t.missing}</Badge> : null}
      </h3>
      <p className="small muted">
        {last ? fill(t.last, { date: day(last.checked_on), by: last.by }) : t.never} <Link href={`/${locale}/guide/chair`}>{t.guide}</Link>
      </p>
      {last && !data.compliant && (
        <ul className="small">
          {data.items
            .filter((i) => !last.items.includes(i))
            .map((i) => (
              <li key={i}>{t.items[i]}</li>
            ))}
        </ul>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {data.can.edit && (
        <details>
          <summary>{t.save}</summary>
          <form className="stack" onSubmit={(e) => void save(e)}>
            <p className="small muted">{t.intro}</p>
            {data.items.map((i) => (
              <label className="check" key={i}>
                <input type="checkbox" name={i} defaultChecked={last?.items.includes(i)} /> {t.items[i]}
              </label>
            ))}
            <Field id={`${base}-date`} label={t.date} required>
              <input id={`${base}-date`} name="checkedOn" type="date" required max={today} defaultValue={today} />
            </Field>
            <Field id={`${base}-note`} label={t.note}>
              <input id={`${base}-note`} name="note" maxLength={300} />
            </Field>
            <p className="actions">
              <Button type="submit" loading={busy}>
                {t.save}
              </Button>
            </p>
          </form>
        </details>
      )}
    </section>
  );
}
