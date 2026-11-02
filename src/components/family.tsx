"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { familyView } from "@/domains/family/service";
import { authorizationCopy } from "@/domains/authorizations/authorization-copy";
import { familyCopy } from "./family-copy";
import { ChildSwitcher, chooseChild, initialOf, useChildChoice } from "./child-switcher";
import { contextChanged } from "./app-shell";
import { Modal } from "./modal";
import { SignaturePad } from "./signature-pad";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";

/**
 * 27 to 29: « Ma famille ». Every child of every club, each club's data in its
 * own group. An answer, a signature or a refusal goes through that club's
 * usual command, in its context (switched first when it is another club).
 */
type View = Awaited<ReturnType<typeof familyView>>;
type Club = View["clubs"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

async function send(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v;
}

export function Family({ locale }: { locale: Locale }) {
  const t = familyCopy[locale];
  const a = authorizationCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [failed, setFailed] = useState(false),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [signing, setSigning] = useState<{ club: Club; id: string; documentId: string; version: number; text: string } | null>(null),
    [refusing, setRefusing] = useState<{ club: Club; id: string } | null>(null),
    [feedUrl, setFeedUrl] = useState("");
  const chosen = useChildChoice();
  useEffect(() => {
    let live = true;
    fetch("/api/family", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return (await r.json()) as View;
      })
      .then((v) => {
        if (live) {
          setData(v);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [version]);

  if (!data)
    return (
      <main id="main" className="access family">
        <PageHeader title={t.title} subtitle={t.intro} />
        {failed ? <p role="alert">{t.error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );

  const children = data.clubs.flatMap((c) => c.children.map((k) => ({ ...k, organizationId: c.organizationId, club: c.name })));
  const child = children.some((k) => k.id === chosen) ? chosen : "";
  const several = data.clubs.length > 1;
  const date = (iso: string | Date, time = false) =>
    new Intl.DateTimeFormat(tag(locale), { weekday: time ? "short" : undefined, day: "numeric", month: "long", hour: time ? "2-digit" : undefined, minute: time ? "2-digit" : undefined, timeZone: "Europe/Brussels" }).format(new Date(iso));
  const money = (cents: number) => new Intl.NumberFormat(tag(locale), { style: "currency", currency: "EUR" }).format(cents / 100);
  const nameOf = (club: Club, id: string) => club.children.find((k) => k.id === id);

  /** Acts in the club's context: switches to it first when it is another one. */
  async function inClub(club: Club, act: () => Promise<unknown>, done = t.saved) {
    setBusy(true);
    setError("");
    try {
      let switched = false;
      if (!club.current) {
        await send("/api/workspace", { action: "context", mandateId: club.mandateId });
        contextChanged();
        window.dispatchEvent(new Event("pfm-workspace"));
        switched = true;
      }
      await act();
      setStatus(switched ? `${fill(t.switched, { club: club.name })} ${done}` : done);
      setVersion((v) => v + 1);
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(t.errors[code] ?? t.error);
      setVersion((v) => v + 1);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openSign(club: Club, r: Club["authorizations"][number]) {
    if (!r.document_id || !r.document_version || !r.current_version_id) return;
    const documentId = r.document_id,
      versionId = r.current_version_id,
      version = r.document_version;
    await inClub(
      club,
      async () => {
        const res = await fetch(`/api/documents/file/${versionId}?organizationId=${club.organizationId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("FORBIDDEN");
        setSigning({ club, id: r.id, documentId, version, text: await res.text() });
      },
      "",
    );
  }
  const shown = (ids: string[]) => !child || ids.includes(child);

  return (
    <main id="main" className="access family">
      <PageHeader title={t.title} subtitle={t.intro} />
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {!children.length ? (
        <EmptyState title={t.none} text={t.noneText} />
      ) : (
        <>
          {children.length > 1 && <ChildSwitcher locale={locale} items={children} value={child} onChange={chooseChild} showClub={several} />}
          {data.clubs.map((club) => {
            const events = club.events.filter((e) => shown(e.children.map((k) => k.id)));
            const auths = club.authorizations.filter((r) => shown([r.profile_id]));
            const dues = club.dues.filter((d) => shown([d.profile_id]));
            if (child && !club.children.some((k) => k.id === child)) return null;
            return (
              <section key={club.organizationId} className="family-club" aria-labelledby={`family-${club.organizationId}`}>
                {several && (
                  <h2 id={`family-${club.organizationId}`} className="family-club-name">
                    {club.name}
                  </h2>
                )}
                <Card title={t.upcoming} headingId={several ? undefined : `family-${club.organizationId}`}>
                  {!events.length ? (
                    <p className="muted">{t.noEvent}</p>
                  ) : (
                    <ul className="plain-list family-events">
                      {events.map((e) => {
                        const kids = e.children.filter((k) => !child || k.id === child);
                        const open = kids.filter((k) => k.invitation?.canRespond);
                        return (
                          <li key={e.id} className="family-event">
                            <p className="family-event-when">{date(e.startsAt, true)}</p>
                            <h3>{e.title}</h3>
                            {(e.team || e.place) && <p className="muted small">{[e.team, e.place].filter(Boolean).join(" · ")}</p>}
                            <ul className="plain-list">
                              {kids.map((k) => {
                                const who = nameOf(club, k.id);
                                const i = k.invitation;
                                return (
                                  <li key={k.id} className="family-child-line">
                                    <span className="child-tag">
                                      <span className="child-initial" aria-hidden="true">
                                        {initialOf(who?.first ?? "")}
                                      </span>
                                      {who?.first}
                                    </span>
                                    {i ? (
                                      <>
                                        <Badge tone={i.response === "present" ? "success" : i.response === "absent" ? "danger" : "warning"}>{t.states[i.response as keyof typeof t.states] ?? i.response}</Badge>
                                        {i.response !== "none" && i.respondedBy && <span className="muted small">{fill(t.answeredBy, { name: i.respondedBy })}</span>}
                                        {i.canRespond && (
                                          <span className="family-answer">
                                            {(["present", "absent"] as const).map((v) => (
                                              <button
                                                key={v}
                                                type="button"
                                                className="text-button"
                                                aria-pressed={i.response === v}
                                                disabled={busy}
                                                onClick={() => void inClub(club, () => send("/api/attendance", { action: "respond", id: i.id, expectedVersion: i.version, response: v, comment: i.comment ?? "" }))}
                                              >
                                                {v === "present" ? t.present : t.absent}
                                                <span className="sr-only"> {fill(t.forChild, { name: who?.first ?? "" })}</span>
                                              </button>
                                            ))}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="muted small">{t.notInvited}</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {open.length > 1 && (
                              <p className="actions">
                                {(["present", "absent"] as const).map((v) => (
                                  <Button
                                    key={v}
                                    variant={v === "present" ? "primary" : "secondary"}
                                    disabled={busy}
                                    onClick={() =>
                                      void inClub(club, () =>
                                        send("/api/attendance", {
                                          action: "respondMany",
                                          items: open.map((k) => ({ id: k.invitation!.id, expectedVersion: k.invitation!.version })),
                                          response: v,
                                          comment: "",
                                        }),
                                      )
                                    }
                                  >
                                    {v === "present" ? (open.length === 2 ? t.bothPresent : t.allPresent) : open.length === 2 ? t.bothAbsent : t.allAbsent}
                                  </Button>
                                ))}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
                <Card title={t.authorizations}>
                  {!auths.length ? (
                    <p className="muted">{t.noAuthorization}</p>
                  ) : (
                    <ul className="plain-list family-authorizations">
                      {auths.map((r) => (
                        <li key={r.id}>
                          <p>
                            <strong>{a.kinds[r.kind]}</strong> · {nameOf(club, r.profile_id)?.name}
                          </p>
                          <p className="muted small">{r.trip ? fill(t.forTrip, { trip: r.trip }) : t.forSeason}</p>
                          <p>
                            <Badge tone={r.status === "signed" ? "success" : r.status === "refused" ? "danger" : "warning"}>{t.status[r.status]}</Badge>{" "}
                            {r.answered_at && r.answered_by && <span className="muted small">{fill(r.status === "signed" ? t.signedOn : t.refusedOn, { date: date(r.answered_at), name: r.answered_by })}</span>}
                          </p>
                          {r.status === "requested" && (
                            <p className="actions">
                              {r.document_id && (
                                <Button disabled={busy} onClick={() => void openSign(club, r)}>
                                  {t.readSign}
                                </Button>
                              )}
                              <Button variant="ghost" disabled={busy} onClick={() => setRefusing({ club, id: r.id })}>
                                {t.refuse}
                              </Button>
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                {club.dues.length > 0 && (
                  <Card title={t.dues}>
                    {!dues.length ? (
                      <p className="muted">{t.noDues}</p>
                    ) : (
                      <ul className="plain-list">
                        {dues.map((d) => (
                          <li key={d.id}>
                            <p>
                              <strong>{nameOf(club, d.profile_id)?.name}</strong> · {d.category} ({d.season})
                            </p>
                            <p className="muted small">
                              {fill(t.share, { percent: d.percent, amount: money(d.shareCents) })}
                              {d.split && (
                                <>
                                  <br />
                                  {fill(t.paidByMe, { amount: money(d.paid_by_me_cents) })}
                                </>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                    {club.current && (
                      <p>
                        <Link href={`/${locale}/dues`}>{t.seeDues}</Link>
                      </p>
                    )}
                  </Card>
                )}
                {club.me && <Contacts locale={locale} club={club} busy={busy} save={(body) => inClub(club, () => send("/api/family", { action: "contacts", organizationId: club.organizationId, ...body }))} />}
              </section>
            );
          })}
          <Card title={t.feedTitle}>
            <p className="muted">{t.feedText}</p>
            {data.feed && !feedUrl && <p>{fill(t.feedActive, { date: date(data.feed.expires_at) })}</p>}
            {feedUrl ? (
              <>
                <p>{t.feedReady}</p>
                <p className="family-feed-url">
                  <code>{feedUrl}</code>
                </p>
                <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(feedUrl).then(() => setStatus(t.copied))}>
                  {t.copy}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const club = data.clubs.find((c) => c.current) ?? data.clubs[0];
                  void inClub(
                    club,
                    async () => {
                      const v = await send("/api/calendar", { action: "feed", name: t.feedName, teamId: null, family: true });
                      setFeedUrl(v.url);
                    },
                    "",
                  );
                }}
              >
                {t.feedCreate}
              </Button>
            )}
          </Card>
        </>
      )}
      {signing && (
        <Modal title={a.kinds[signing.club.authorizations.find((r) => r.id === signing.id)!.kind]} close={() => setSigning(null)} className="player-dialog">
          <h3>{t.documentText}</h3>
          <pre className="authorization-text">{signing.text}</pre>
          <SignaturePad
            locale={locale}
            busy={busy}
            onSign={(input) =>
              void inClub(signing.club, async () => {
                await send(`/api/documents/sign/${signing.documentId}`, { ...input, accept: true, version: signing.version, organizationId: signing.club.organizationId });
                setSigning(null);
              })
            }
          />
        </Modal>
      )}
      {refusing && (
        <Modal title={t.refuse} close={() => setRefusing(null)} className="player-dialog">
          <p>{a.kinds[refusing.club.authorizations.find((r) => r.id === refusing.id)!.kind]}</p>
          <p className="actions">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void inClub(refusing.club, async () => {
                  await send("/api/authorizations", { action: "refuse", id: refusing.id });
                  setRefusing(null);
                })
              }
            >
              {t.refuseConfirm}
            </Button>
            <Button variant="ghost" onClick={() => setRefusing(null)}>
              {t.close}
            </Button>
          </p>
        </Modal>
      )}
    </main>
  );
}

function Contacts({ locale, club, busy, save }: { locale: Locale; club: Club; busy: boolean; save: (body: { email: string; phone: string; address: string }) => Promise<boolean> }) {
  const t = familyCopy[locale];
  const me = club.me!;
  const id = club.organizationId;
  return (
    <Card title={t.contactsTitle}>
      <p className="muted">{t.contactsText}</p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save({ email: String(f.get("email") ?? ""), phone: String(f.get("phone") ?? ""), address: String(f.get("address") ?? "") });
        }}
      >
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" defaultValue={me.email} maxLength={200} id={`family-email-${id}`} />
        </label>
        <label>
          {t.phone}
          <input name="phone" type="tel" autoComplete="tel" defaultValue={me.phone} maxLength={40} id={`family-phone-${id}`} />
        </label>
        <label className="wide">
          {t.address}
          <textarea name="address" autoComplete="street-address" defaultValue={me.address} maxLength={300} rows={2} id={`family-address-${id}`} />
        </label>
        <p className="actions">
          <Button disabled={busy}>{t.save}</Button>
        </p>
      </form>
      <p className="muted small">
        {t.settingsLinks} <Link href={`/${locale}/settings/account`}>{t.languageLink}</Link> · <Link href={`/${locale}/settings/notifications`}>{t.notificationsLink}</Link>
      </p>
    </Card>
  );
}
