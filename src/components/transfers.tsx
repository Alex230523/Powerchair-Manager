"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { sheetView, threadsView, transfersView } from "@/domains/transfers/service";
import { bpcfRules, provinces } from "@/domains/transfers/schema";
import { ageBands } from "@/domains/statistics/club-math";
import { transfersCopy, fill } from "./transfers-copy";
import { statisticsCopy } from "./statistics-copy";
import { classificationCopy } from "./classification-copy";
import { ClassificationBadge } from "./classification-badge";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, Card, EmptyState, PageHeader, Tabs, Toolbar } from "./ui";
import { Icon } from "./icons";

type View = Awaited<ReturnType<typeof transfersView>>;
type Sheet = Awaited<ReturnType<typeof sheetView>>;
type Offer = View["offers"][number];
type Send = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const money = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const statusTone: Record<string, string> = { sent: "info", discussing: "info", accepted: "warning", refused: "danger", withdrawn: "neutral", validated: "success" };

/**
 * Wave 17 (J3): « Bourse aux transferts ». The federation's rules on top,
 * the person's own visibility (adult player or parent), the visible
 * players with their sporting sheet, the requests and their conversation;
 * for the federation, the validations, the rules and the clubs' provinces.
 */
export function Transfers({ locale }: { locale: Locale }) {
  const t = transfersCopy[locale];
  const failure = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, setError, reload } = useData<View>("/api/transfers", failure);
  const { busy, message, post } = usePost("/api/transfers", reload, setError, failure);
  const send: Send = (body, done) => post({ ...body, organizationId: data?.organization_id }, done);
  const [tab, setTab] = useState<"players" | "offers" | "rules" | "provinces">("players");
  const [sheet, setSheet] = useState<{ key: string; name: string } | null>(null);
  const tabs = !data ? [] : data.mode === "federation" ? (["players", "offers", "rules", "provinces"] as const) : data.mode === "club" ? (["players", "offers"] as const) : [];
  return (
    <main id="main" className="access transfers">
      <PageHeader title={t.title} subtitle={t.intro} />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p role="status">{t.loading}</p>}
      {data && (
        <>
          <RulesCard locale={locale} view={data} />
          {data.mine.length > 0 && <Mine locale={locale} view={data} busy={busy} send={send} />}
          {tabs.length > 0 && (
            <>
              <Tabs label={t.tabsLabel} items={tabs.map((k) => ({ id: k, label: t.tabs[k], count: k === "offers" ? data.offers.filter((o) => o.moves.length).length || undefined : undefined }))} value={tab} onChange={(v) => setTab(v as typeof tab)} panelId="transfers-panel" idPrefix="transfers-tab" />
              <div id="transfers-panel" role="tabpanel" aria-labelledby={`transfers-tab-${tab}`}>
                {tab === "players" && <Players locale={locale} view={data} open={setSheet} />}
                {tab === "offers" && <Offers locale={locale} view={data} busy={busy} send={send} />}
                {tab === "rules" && <RulesForm locale={locale} view={data} busy={busy} send={send} />}
                {tab === "provinces" && <Provinces locale={locale} view={data} busy={busy} send={send} />}
              </div>
            </>
          )}
          {sheet && <SheetDialog locale={locale} view={data} who={sheet} busy={busy} send={send} close={() => setSheet(null)} />}
          {/* 24: the conversations between clubs, here since the messaging page is gone. */}
          {data.mode === "club" && <InterclubThreads locale={locale} />}
        </>
      )}
    </main>
  );
}

function RulesCard({ locale, view }: { locale: Locale; view: View }) {
  const t = transfersCopy[locale];
  const r = view.rules;
  return (
    <Card title={t.rulesTitle} labelledBy="transfer-rules" headingId="transfer-rules" className="transfer-rules">
      <p>
        <Badge tone={view.open ? "success" : view.consentedOnly ? "warning" : "danger"}>{view.open ? t.open : view.consentedOnly ? t.consentedOnly : t.closed}</Badge>
      </p>
      {r.rulesText && <p className="transfer-rules-text">{r.rulesText}</p>}
      <ul className="plain-list small">
        <li>
          {t.windows} : {r.windows.length ? r.windows.map((w) => `${day(locale, w.from)} → ${day(locale, w.to)}`).join(" · ") : t.allYear}
        </li>
        <li>
          {t.amounts} : {r.amountsAllowed ? (r.amountCapCents !== null ? fill(t.cap, { amount: money(locale, r.amountCapCents) }) : t.noCap) : t.noAmounts}
        </li>
        {r.maxPerClubSeason !== null && <li>{fill(t.maxPerClub, { n: r.maxPerClubSeason })}</li>}
        {r.maxPerPairSeason !== null && <li>{fill(t.maxPerPair, { n: r.maxPerPairSeason })}</li>}
        {r.consentedAnytime && <li>{t.consentedAnytime}</li>}
        <li>{r.federationValidation ? t.validation : t.noValidation}</li>
      </ul>
    </Card>
  );
}

/** The person's own choice, and the requests waiting for their agreement. */
function Mine({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const t = transfersCopy[locale];
  return (
    <Card title={t.mineTitle} subtitle={t.mineIntro} labelledBy="transfer-mine" headingId="transfer-mine">
      <ul className="plain-list">
        {view.mine.map((m) => (
          <li key={m.person_id}>
            <label className="check">
              <input
                type="checkbox"
                checked={m.visible}
                disabled={!m.can || busy}
                aria-describedby={m.can ? undefined : `only-${m.person_id}`}
                onChange={(e) => void send({ action: "visibility", personId: m.person_id, visible: e.target.checked }, transfersCopy[locale].saved)}
              />
              {fill(t.visibleOf, { name: m.full_name })}
              {m.minor && <span className="muted small"> ({t.minor})</span>}
            </label>
            {!m.can && (
              <p className="field-help" id={`only-${m.person_id}`}>
                {t.onlyThem}
              </p>
            )}
          </li>
        ))}
      </ul>
      {view.consents.length > 0 && (
        <>
          <h3>{t.consentTitle}</h3>
          <ul className="records">
            {view.consents.map((o) => (
              <li key={o.id}>
                <p>{fill(t.consentAsk, { club: o.to_club, name: o.full_name, season: o.season })}</p>
                {o.player_consent === "pending" ? (
                  <p className="actions">
                    <button type="button" className="button" disabled={busy} onClick={() => void send({ action: "consent", id: o.id, consent: "given" }, t.saved)}>
                      {t.give}
                      <span className="sr-only"> : {o.to_club}</span>
                    </button>
                    <button type="button" className="button secondary" disabled={busy} onClick={() => void send({ action: "consent", id: o.id, consent: "refused" }, t.saved)}>
                      {t.refuseConsent}
                      <span className="sr-only"> : {o.to_club}</span>
                    </button>
                  </p>
                ) : (
                  <Badge tone={o.player_consent === "given" ? "success" : "danger"}>{t.consent[o.player_consent]}</Badge>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Players({ locale, view, open }: { locale: Locale; view: View; open: (who: { key: string; name: string }) => void }) {
  const t = transfersCopy[locale],
    ages = statisticsCopy[locale].headcount.ages,
    classes = classificationCopy[locale].classes;
  const [q, setQ] = useState(""),
    [club, setClub] = useState(""),
    [klass, setKlass] = useState(""),
    [province, setProvince] = useState(""),
    [age, setAge] = useState("");
  const clubs = useMemo(() => [...new Map(view.players.filter((p) => p.club_id).map((p) => [p.club_id!, p.club!])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [view.players]);
  const shown = view.players.filter(
    (p) =>
      (!q || p.full_name.toLocaleLowerCase().includes(q.toLocaleLowerCase())) &&
      (!club || (club === "none" ? !p.club_id : p.club_id === club)) &&
      (!klass || p.classification === klass) &&
      (!province || p.province === province) &&
      (!age || p.age === age),
  );
  return (
    <>
      <Toolbar label={t.tabs.players}>
        <label className="compact-field">
          {t.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="compact-field">
          {t.club}
          <select value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">{t.allClubs}</option>
            <option value="none">{t.noClub}</option>
            {clubs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          {t.classification}
          <select value={klass} onChange={(e) => setKlass(e.target.value)}>
            <option value="">{t.allClasses}</option>
            {(["PF1", "PF2", "pending", "not_classified"] as const).map((k) => (
              <option key={k} value={k}>
                {classes[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          {t.province}
          <select value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">{t.allProvinces}</option>
            {provinces.map((k) => (
              <option key={k} value={k}>
                {t.provinces[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          {t.age}
          <select value={age} onChange={(e) => setAge(e.target.value)}>
            <option value="">{t.allAges}</option>
            {ageBands.map((k) => (
              <option key={k} value={k}>
                {ages[k]}
              </option>
            ))}
          </select>
        </label>
      </Toolbar>
      <p role="status" className="muted">
        {fill(t.count, { n: shown.length })}
      </p>
      {shown.length ? (
        <div className="table-scroll" role="region" aria-label={t.tabs.players} tabIndex={0}>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.cols.name}</th>
                <th scope="col">{t.cols.club}</th>
                <th scope="col">{t.cols.province}</th>
                <th scope="col">{t.cols.classification}</th>
                <th scope="col">{t.cols.age}</th>
                <th scope="col" className="num">
                  {t.cols.seasons}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.key}>
                  <th scope="row">
                    <button type="button" className="text-button" aria-label={fill(t.openSheet, { name: p.full_name })} onClick={() => open({ key: p.key, name: p.full_name })}>
                      {p.full_name}
                    </button>
                    {p.own && <span className="muted small"> · {t.ownPlayer}</span>}
                  </th>
                  <td>{p.club ? [p.club, p.team].filter(Boolean).join(" · ") : <Badge tone="neutral">{t.noClub}</Badge>}</td>
                  <td>{t.provinces[p.province] ?? ""}</td>
                  <td>
                    <ClassificationBadge locale={locale} value={p.classification} />
                  </td>
                  <td>{ages[p.age]}</td>
                  <td className="num">{p.seasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t.noPlayers} />
      )}
    </>
  );
}

function SheetDialog({ locale, view, who, busy, send, close }: { locale: Locale; view: View; who: { key: string; name: string }; busy: boolean; send: Send; close: () => void }) {
  const t = transfersCopy[locale],
    ages = statisticsCopy[locale].headcount.ages;
  const ref = useRef<HTMLDialogElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null),
    [error, setError] = useState(""),
    [asking, setAsking] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    fetch(`/api/transfers?person=${who.key}`, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (live) setSheet(v);
      })
      .catch((e: Error) => live && setError(t.errors[e.message] ?? errors[e.message]?.[locale] ?? t.unavailable));
    return () => {
      live = false;
    };
  }, [who.key, t, locale]);
  const p = sheet?.player;
  return (
    <dialog ref={ref} className="player-dialog sheet-dialog" aria-labelledby="transfer-sheet-title" onCancel={close}>
      <div className="dialog-heading sheet-heading">
        <h2 id="transfer-sheet-title">{who.name}</h2>
        <div className="sheet-tools">
          {sheet?.canRequest && !asking && (
            <button type="button" className="button sm" onClick={() => setAsking(true)}>
              {t.request}
            </button>
          )}
          <button type="button" className="button secondary sm" onClick={close}>
            <Icon name="close" size={16} />
            {t.close}
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!sheet && !error && <p role="status">{t.loading}</p>}
      {p && sheet && (
        <div className="transfer-sheet">
          <dl className="chair-key">
            <div>
              <dt>{t.cols.club}</dt>
              <dd>{p.club ? [p.club, p.team].filter(Boolean).join(" · ") : t.noClub}</dd>
            </div>
            <div>
              <dt>{t.cols.province}</dt>
              <dd>{t.provinces[p.province] ?? ""}</dd>
            </div>
            <div>
              <dt>{t.cols.classification}</dt>
              <dd>
                <ClassificationBadge locale={locale} value={p.classification} />
              </dd>
            </div>
            <div>
              <dt>{t.cols.age}</dt>
              <dd>{ages[p.age]}</dd>
            </div>
            <div>
              <dt>{t.cols.seasons}</dt>
              <dd>{p.seasons}</dd>
            </div>
          </dl>
          {asking && (
            <form
              className="stack-form panel"
              aria-label={fill(t.requestOf, { name: who.name })}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const amount = String(d.get("amount") ?? "").replace(",", ".").trim();
                void send({ action: "request", personId: who.key, season: d.get("season"), amountCents: amount ? Math.round(Number(amount) * 100) : null, message: String(d.get("message") ?? "") }, t.sent).then(
                  (ok) => ok && close(),
                );
              }}
            >
              <h3>{fill(t.requestOf, { name: who.name })}</h3>
              <div className="form-grid">
                <label>
                  {t.season}
                  <select name="season" defaultValue={view.seasons[0]}>
                    {view.seasons.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {view.rules.amountsAllowed && (
                  <label>
                    {t.amount}
                    <input name="amount" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" aria-describedby={view.rules.amountCapCents !== null ? "transfer-cap" : undefined} />
                    {view.rules.amountCapCents !== null && (
                      <span className="field-help" id="transfer-cap">
                        {fill(t.amountCap, { amount: money(locale, view.rules.amountCapCents) })}
                      </span>
                    )}
                  </label>
                )}
              </div>
              <label>
                {t.message}
                <textarea name="message" rows={3} maxLength={2000} />
              </label>
              <p>
                <button className="button" disabled={busy}>
                  {t.send}
                </button>
              </p>
            </form>
          )}
          <h3>{t.sheetStats}</h3>
          {sheet.stats.length ? (
            <div className="table-scroll" role="region" aria-label={t.sheetStats} tabIndex={0}>
              <table className="ledger">
                <thead>
                  <tr>
                    {(["season", "club", "matches", "minutes", "goals", "assists"] as const).map((k) => (
                      <th key={k} scope="col" className={["matches", "minutes", "goals", "assists"].includes(k) ? "num" : undefined}>
                        {t.statCols[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.stats.map((r) => (
                    <tr key={r.season + r.club}>
                      <th scope="row">{r.season}</th>
                      <td>{r.club}</td>
                      <td className="num">{r.matches}</td>
                      <td className="num">{r.minutes}</td>
                      <td className="num">{r.goals}</td>
                      <td className="num">{r.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t.noStats}</p>
          )}
          <h3>{t.sheetClubs}</h3>
          <ul className="plain-list">
            {sheet.clubs.map((c) => (
              <li key={c.club}>
                <strong>{c.club}</strong>
                {c.seasons && <span className="muted"> · {c.seasons}</span>}
              </li>
            ))}
          </ul>
          <h3>{t.sheetPrizes}</h3>
          {sheet.prizes.length ? (
            <ul className="plain-list">
              {sheet.prizes.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  {a.competition && ` · ${a.competition}`}
                  {a.place !== null && ` · ${fill(t.place, { n: a.place })}`}
                  <span className="muted">
                    {" "}
                    · {a.club} · {day(locale, a.awarded_on)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noPrizes}</p>
          )}
        </div>
      )}
    </dialog>
  );
}

function Offers({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const t = transfersCopy[locale];
  const [talk, setTalk] = useState("");
  if (!view.offers.length) return <EmptyState title={t.noOffers} />;
  return (
    <div className="table-scroll" role="region" aria-label={t.tabs.offers} tabIndex={0}>
      <table className="ledger">
        <thead>
          <tr>
            {(["player", "move", "season", "amount", "status", "consent", "actions"] as const).map((k) => (
              <th key={k} scope="col">
                {t.offerCols[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.offers.map((o) => (
            <OfferRow key={o.id} locale={locale} view={view} o={o} busy={busy} send={send} talking={talk === o.id} talk={() => setTalk(talk === o.id ? "" : o.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfferRow({ locale, view, o, busy, send, talking, talk }: { locale: Locale; view: View; o: Offer; busy: boolean; send: Send; talking: boolean; talk: () => void }) {
  const t = transfersCopy[locale];
  const who = `${o.full_name} · ${o.to_club}`;
  const decide = (form: HTMLFormElement, decision: string) => {
    const note = String(new FormData(form).get("note") ?? "");
    return o.moves.includes("validate")
      ? send({ action: "validate", id: o.id, decision, note }, t.saved)
      : send({ action: "answer", id: o.id, decision, note }, t.saved);
  };
  return (
    <>
      <tr>
        <th scope="row">{o.full_name}</th>
        <td>
          {o.from_club ?? t.noClub} → {o.to_club}
        </td>
        <td>{o.season}</td>
        <td>{o.amount_cents !== null ? money(locale, o.amount_cents) : "…"}</td>
        <td>
          <Badge tone={statusTone[o.status]}>{t.status[o.status]}</Badge>
          {o.decision_note && <span className="muted small"> · {o.decision_note}</span>}
          {o.federation_note && <span className="muted small"> · {o.federation_note}</span>}
        </td>
        <td>
          <Badge tone={o.player_consent === "given" ? "success" : o.player_consent === "refused" ? "danger" : "warning"}>{t.consent[o.player_consent]}</Badge>
        </td>
        <td>
          {o.message && <p className="small">{o.message}</p>}
          {(o.moves.includes("accept") || o.moves.includes("refuse") || o.moves.includes("validate")) && (
            <form className="inline-form" onSubmit={(e) => e.preventDefault()}>
              <label>
                {t.note}
                <input name="note" maxLength={1000} />
              </label>
              {(o.moves.includes("accept") || o.moves.includes("validate")) && (
                <button type="button" className="button sm" disabled={busy} onClick={(e) => void decide(e.currentTarget.form!, o.moves.includes("validate") ? "validated" : "accepted")}>
                  {o.moves.includes("validate") ? t.validate : t.accept}
                  <span className="sr-only"> : {who}</span>
                </button>
              )}
              <button type="button" className="button secondary sm" disabled={busy} onClick={(e) => void decide(e.currentTarget.form!, "refused")}>
                {o.moves.includes("validate") ? t.refuseValidation : t.refuse}
                <span className="sr-only"> : {who}</span>
              </button>
            </form>
          )}
          {o.moves.includes("withdraw") && (
            <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "withdraw", id: o.id }, t.saved)}>
              {t.withdraw}
              <span className="sr-only"> : {who}</span>
            </button>
          )}
          {view.mode === "club" && o.from_organization_id && (
            <button type="button" className="text-button" aria-expanded={talking} onClick={talk}>
              {fill(t.conversation, { n: o.messages })}
              <span className="sr-only"> : {who}</span>
            </button>
          )}
        </td>
      </tr>
      {talking && (
        <tr>
          <td colSpan={7}>
            <Conversation locale={locale} offerId={o.id} organizationId={view.organization_id} />
          </td>
        </tr>
      )}
    </>
  );
}

type Thread = Awaited<ReturnType<typeof threadsView>>["threads"][number];
/** The conversation of one offer between the two clubs. */
export function Conversation({ locale, offerId, organizationId, initial }: { locale: Locale; offerId: string; organizationId: string; initial?: Thread }) {
  const t = transfersCopy[locale];
  const [thread, setThread] = useState<Thread | null>(initial ?? null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/transfers/threads?offer=${offerId}`, { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setThread(v.threads[0] ?? null);
  }, [offerId]);
  // The first load inside the effect, its state set in the promise only (React rule: no synchronous setState in an effect).
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch(`/api/transfers/threads?offer=${offerId}`, { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setThread(v.threads[0] ?? null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(t.errors[e.message] ?? t.unavailable);
      });
    return () => {
      cancelled = true;
    };
  }, [offerId, initial, t]);
  const title = thread ? fill(t.conversationOf, { from: thread.from_club ?? "", to: thread.to_club }) : t.conversation.replace(" ({n})", "");
  return (
    <section className="transfer-thread" aria-label={title}>
      {error && <p role="alert">{error}</p>}
      {thread &&
        (thread.messages.length ? (
          <ol className="transfer-messages">
            {thread.messages.map((m) => (
              <li key={m.id} data-mine={m.mine || undefined}>
                <p className="muted small">
                  {m.sender} · {m.club} · {new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(m.created_at))}
                </p>
                <p>{m.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t.noMessages}</p>
        ))}
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", id: offerId, body, organizationId }) });
            const v = await r.json();
            if (!r.ok) throw new Error(v.error);
            setBody("");
            await load();
          } catch (err) {
            setError(t.errors[(err as Error).message] ?? errors[(err as Error).message]?.[locale] ?? t.unavailable);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {t.write}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={5000} required />
        </label>
        <p>
          <button className="button sm" disabled={busy || !body.trim()}>
            {t.post}
          </button>
        </p>
      </form>
    </section>
  );
}

/** The conversations between clubs about transfer requests (on the transfers page since 24). */
export function InterclubThreads({ locale }: { locale: Locale }) {
  const t = transfersCopy[locale];
  const [view, setView] = useState<Awaited<ReturnType<typeof threadsView>> | null>(null),
    [open, setOpen] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/transfers/threads", { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((v) => live && setView(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!view?.threads.length) return null;
  return (
    <Card title={t.threadsTitle} subtitle={t.threadsIntro} labelledBy="interclub-threads" headingId="interclub-threads">
      <ul className="records">
        {view.threads.map((th) => (
          <li key={th.id}>
            <button type="button" className="text-button" aria-expanded={open === th.id} onClick={() => setOpen(open === th.id ? "" : th.id)}>
              {fill(t.conversationOf, { from: th.from_club ?? "", to: th.to_club })} · {th.full_name} ({th.messages.length})
            </button>{" "}
            <Badge tone={statusTone[th.status]}>{t.status[th.status]}</Badge>
            {open === th.id && <Conversation locale={locale} offerId={th.id} organizationId={view.organization_id} initial={th} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RulesForm({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const t = transfersCopy[locale],
    f = t.rulesForm;
  // 04/11/2026: « Reprendre le règlement BPCF 2025 » fills the form; the federation checks, then saves.
  const [r, setR] = useState(view.rules),
    [round, setRound] = useState(0);
  const [windows, setWindows] = useState(r.windows.length ? r.windows : []);
  return (
    <>
    <div className="transfer-bpcf">
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          const b = bpcfRules(view.today, t.bpcf.text);
          setR(b);
          setWindows(b.windows);
          setRound(round + 1);
        }}
      >
        {t.bpcf.apply}
      </button>
      <p className="muted small">{t.bpcf.hint}</p>
    </div>
    <form
      key={round}
      className="stack-form"
      aria-label={t.tabs.rules}
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const euros = (k: string) => {
          const v = String(d.get(k) ?? "").replace(",", ".").trim();
          return v ? Math.round(Number(v) * 100) : null;
        };
        const max = String(d.get("max") ?? "").trim(),
          pair = String(d.get("pair") ?? "").trim();
        void send(
          {
            action: "rules",
            rules: {
              windows: windows.map((_, i) => ({ from: d.get(`from-${i}`), to: d.get(`to-${i}`) })),
              amountsAllowed: d.get("amounts") === "on",
              amountCapCents: euros("cap"),
              maxPerClubSeason: max ? Number(max) : null,
              federationValidation: d.get("validation") === "on",
              rulesText: String(d.get("text") ?? ""),
              consentedAnytime: d.get("consented") === "on",
              maxPerPairSeason: pair ? Number(pair) : null,
            },
          },
          t.saved,
        );
      }}
    >
      <fieldset className="transfer-windows">
        <legend>{t.windows}</legend>
        {windows.map((w, i) => (
          <div key={i} className="form-grid" role="group" aria-label={fill(f.windowOf, { n: i + 1 })}>
            <label>
              {f.from}
              <input type="date" name={`from-${i}`} defaultValue={w.from} required />
            </label>
            <label>
              {f.to}
              <input type="date" name={`to-${i}`} defaultValue={w.to} required />
            </label>
            <p>
              <button type="button" className="text-button" onClick={() => setWindows(windows.filter((_, j) => j !== i))}>
                {f.removeWindow}
                <span className="sr-only"> {i + 1}</span>
              </button>
            </p>
          </div>
        ))}
        {!windows.length && <p className="muted">{t.allYear}</p>}
        <button type="button" className="button secondary sm" onClick={() => setWindows([...windows, { from: view.today, to: view.today }])}>
          {f.addWindow}
        </button>
      </fieldset>
      <label className="check">
        <input type="checkbox" name="amounts" defaultChecked={r.amountsAllowed} />
        {f.amountsAllowed}
      </label>
      <div className="form-grid">
        <label>
          {f.cap}
          <input name="cap" inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" defaultValue={r.amountCapCents !== null ? String(r.amountCapCents / 100) : ""} />
        </label>
        <label>
          {f.max}
          <input name="max" type="number" min={0} max={100} defaultValue={r.maxPerClubSeason ?? ""} />
        </label>
        <label>
          {f.maxPair}
          <input name="pair" type="number" min={0} max={100} defaultValue={r.maxPerPairSeason ?? ""} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="consented" defaultChecked={r.consentedAnytime} />
        {f.consentedAnytime}
      </label>
      <label className="check">
        <input type="checkbox" name="validation" defaultChecked={r.federationValidation} />
        {f.validation}
      </label>
      <label>
        {f.text}
        <textarea name="text" rows={4} maxLength={5000} defaultValue={r.rulesText} />
      </label>
      <p>
        <button className="button" disabled={busy}>
          {f.save}
        </button>
      </p>
    </form>
    </>
  );
}

function Provinces({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const t = transfersCopy[locale];
  return (
    <ul className="plain-list transfer-provinces">
      {view.clubs.map((c) => (
        <li key={c.id}>
          <label>
            {fill(t.provinceOf, { name: c.name })}
            <select value={c.province} disabled={busy} onChange={(e) => void send({ action: "province", clubId: c.id, province: e.target.value }, t.saved)}>
              {["", ...provinces].map((k) => (
                <option key={k} value={k}>
                  {t.provinces[k]}
                </option>
              ))}
            </select>
          </label>
        </li>
      ))}
    </ul>
  );
}
