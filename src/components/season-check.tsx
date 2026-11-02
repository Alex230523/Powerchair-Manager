"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { myChecks, seasonCheckView } from "@/domains/season-check/service";
import { seasonCheckCopy } from "@/domains/season-check/check-copy";
import { Modal } from "./modal";
import { Badge, Button, Card, EmptyState } from "./ui";

/**
 * 8 (part 2): « Vos informations sont-elles toujours exactes ? » at sign-in,
 * one short block per person in one's care, and the club's follow-up in
 * Réglages › Saisons et équipes.
 */
type Mine = Awaited<ReturnType<typeof myChecks>>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const day = (l: Locale, iso: string) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "long", timeZone: "Europe/Brussels" }).format(new Date(iso));

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/season-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v;
}

/** At sign-in: shown when something is left to check (and not put off). */
export function SeasonCheckPrompt({ locale, contextId }: { locale: Locale; contextId: string | null }) {
  const t = seasonCheckCopy[locale];
  const [data, setData] = useState<Mine | null>(null),
    [closed, setClosed] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    if (!contextId) return;
    let live = true;
    fetch("/api/season-check", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Mine) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [contextId]);
  if (!data || !data.show || closed || !data.people.length) return null;
  async function confirm(profileId: string) {
    setBusy(true);
    try {
      await post({ action: "confirm", profileId });
      setStatus(t.done);
      setData((d) => (d ? ({ ...d, people: d.people.filter((x) => x.profileId !== profileId) } as Mine) : d));
    } catch {
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  async function later() {
    setBusy(true);
    try {
      await post({ action: "postpone" });
      setClosed(true);
    } finally {
      setBusy(false);
    }
  }
  const value = (v: string) => v || t.empty;
  return (
    <Modal title={t.title} close={() => setClosed(true)} className="player-dialog season-check">
      <p className="muted">{t.intro}</p>
      {data.people.map((x) => (
        <section key={x.profileId} className="season-check-person" aria-labelledby={`check-${x.profileId}`}>
          <h3 id={`check-${x.profileId}`}>{fill(t.forPerson, { name: x.name })}</h3>
          <dl className="sheet-facts">
            <dt>{t.contacts}</dt>
            <dd>
              {t.email} : {value(x.contacts.email)}
              <br />
              {t.phone} : {value(x.contacts.phone)}
            </dd>
            <dt>{t.emergency}</dt>
            <dd>{value(x.emergency)}</dd>
            <dt>{t.care}</dt>
            <dd>
              {t.needs} : {value(x.care.needs)}
              <br />
              {t.safety} : {value(x.care.safety)}
            </dd>
            <dt>{t.consent}</dt>
            <dd>{x.consent ? t.consentYes : t.consentNo}</dd>
            <dt>{t.documents}</dt>
            <dd>
              {x.expiring.length ? (
                <ul>
                  {x.expiring.map((d) => (
                    <li key={d.id}>
                      <Link href={`/${locale}/documents`}>{d.name}</Link> · {fill(t.until, { date: day(locale, d.expires_on + "T12:00:00Z") })}
                    </li>
                  ))}
                </ul>
              ) : (
                t.noDocument
              )}
            </dd>
          </dl>
          <p className="actions">
            <Button disabled={busy} onClick={() => void confirm(x.profileId)}>
              {t.stillRight}
            </Button>
            <Link className="button secondary" href={`/${locale}/players/${x.profileId}`} onClick={() => setClosed(true)}>
              {t.change}
            </Link>
          </p>
        </section>
      ))}
      {data.postponable && (
        <p className="actions">
          <Button variant="ghost" disabled={busy} onClick={() => void later()} aria-describedby="season-check-later">
            {t.later}
          </Button>
          <span className="muted small" id="season-check-later">
            {fill(t.laterHint, { date: data.deadline ? day(locale, data.deadline) : "" })}
          </span>
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </Modal>
  );
}

/** The club's follow-up: launch, « Vérifié / Pas encore », reminders. */
export function SeasonCheckPanel({ locale }: { locale: Locale }) {
  const t = seasonCheckCopy[locale];
  const [data, setData] = useState<Awaited<ReturnType<typeof seasonCheckView>> | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/season-check?view=club", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version]);
  if (!data) return null;
  async function run(body: Record<string, unknown>, done: (v: { sent?: number }) => string) {
    setBusy(true);
    try {
      setStatus(done(await post(body)));
      setVersion((v) => v + 1);
    } catch {
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  const waiting = data.players.filter((x) => !x.verifiedAt);
  return (
    <Card title={t.followTitle} labelledBy="settings-season-check" headingId="settings-season-check">
      <p className="muted">{t.followIntro}</p>
      {!data.check ? (
        <EmptyState
          title={t.noCheck}
          action={
            <Button disabled={busy} onClick={() => void run({ action: "launch" }, () => t.launched)}>
              {t.launch}
            </Button>
          }
        />
      ) : (
        <>
          {waiting.length > 0 && (
            <p>
              <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "remind", profileIds: waiting.map((x) => x.id).slice(0, 500) }, (v) => fill(t.reminded, { n: v.sent ?? 0 }))}>
                {t.remindAll}
              </Button>
            </p>
          )}
          <div className="table-scroll" role="region" aria-label={t.followTitle} tabIndex={0}>
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">{t.player}</th>
                  <th scope="col">{t.state}</th>
                  <th scope="col">
                    <span className="sr-only">{t.remind}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((x) => (
                  <tr key={x.id}>
                    <th scope="row">{x.name}</th>
                    <td>
                      {x.verifiedAt ? (
                        <Badge tone="success">{fill(t.verified, { date: day(locale, x.verifiedAt) })}</Badge>
                      ) : (
                        <Badge tone="warning">
                          {t.notYet}
                          {x.postponed ? ` (${t.postponed})` : ""}
                        </Badge>
                      )}
                    </td>
                    <td>
                      {!x.verifiedAt && (
                        <button type="button" className="text-button" disabled={busy} onClick={() => void run({ action: "remind", profileIds: [x.id] }, (v) => fill(t.reminded, { n: v.sent ?? 0 }))}>
                          {t.remind}
                          <span className="sr-only"> : {x.name}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </Card>
  );
}
