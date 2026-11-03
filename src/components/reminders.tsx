"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { remindersView } from "@/domains/reminders/service";
import { errors } from "./access-copy";
import { Badge, PageHeader, Card, EmptyState } from "./ui";
import { TemplateChoice } from "./mail-templates";
import { useScope } from "./use-scope";

type View = Awaited<ReturnType<typeof remindersView>>;
type Kind = "dues" | "documents";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

const copy = {
  fr: {
    title: "Relances",
    intro:
      "Cochez les personnes qui ne sont pas en ordre et envoyez-leur un rappel par e-mail et dans l'application (à la personne et à ses représentants).",
    loading: "Chargement…",
    restricted:
      "Les relances sont réservées aux personnes qui gèrent les cotisations ou les documents (avec la double authentification).",
    dues: "Cotisations",
    documents: "Documents",
    duesHint:
      "Échéances passées ou dans les 14 jours. Les paiements seront suivis automatiquement avec le lot bancaire : en attendant, décochez ceux qui ont déjà payé.",
    docsHint: "Documents à fournir, refusés ou expirés.",
    person: "Personne",
    situation: "Situation",
    recipients: "Destinataires",
    last: "Dernier rappel",
    never: "Jamais",
    none: "Aucune adresse",
    overdue: "en retard",
    next: "prochaine échéance",
    selectAll: "Tout cocher",
    selectLate: "Cocher tous les retards",
    selectNone: "Tout décocher",
    send: "Envoyer le rappel ({n})",
    sent: "{people} personne(s) relancée(s), {messages} message(s) envoyé(s).",
    empty: "Tout le monde est en ordre.",
    template: "Modèle du message",
    templateHint:
      "Variables disponibles : {name}, {person}, {amount}, {due}, {details}, {organization}, {url}. Un même rappel n'est envoyé qu'une fois par jour.",
    language: "Langue",
    subject: "Objet",
    body: "Message",
    save: "Enregistrer le modèle",
    saved: "Modèle enregistré.",
    readOnlyTemplate:
      "Seules les personnes qui gèrent les notifications peuvent modifier ce modèle.",
    statuses: {
      missing: "à fournir",
      requested: "demandé",
      refused: "refusé",
      expired: "expiré",
    } as Record<string, string>,
  },
  nl: {
    title: "Herinneringen",
    intro:
      "Vink de personen aan die niet in orde zijn en stuur hen een herinnering per e-mail en in de app (aan de persoon en zijn vertegenwoordigers).",
    loading: "Laden…",
    restricted:
      "Herinneringen zijn voorbehouden aan wie lidgelden of documenten beheert (met tweestapsverificatie).",
    dues: "Lidgelden",
    documents: "Documenten",
    duesHint:
      "Vervaldagen voorbij of binnen 14 dagen. Betalingen worden automatisch opgevolgd met de bankmodule: vink tot dan wie al betaalde uit.",
    docsHint: "Te bezorgen, geweigerde of vervallen documenten.",
    person: "Persoon",
    situation: "Situatie",
    recipients: "Ontvangers",
    last: "Laatste herinnering",
    never: "Nooit",
    none: "Geen adres",
    overdue: "achterstallig",
    next: "volgende vervaldag",
    selectAll: "Alles aanvinken",
    selectLate: "Alle achterstallen aanvinken",
    selectNone: "Alles uitvinken",
    send: "Herinnering versturen ({n})",
    sent: "{people} persoon/personen herinnerd, {messages} bericht(en) verstuurd.",
    empty: "Iedereen is in orde.",
    template: "Sjabloon van het bericht",
    templateHint:
      "Beschikbare variabelen: {name}, {person}, {amount}, {due}, {details}, {organization}, {url}. Eenzelfde herinnering wordt maar één keer per dag verstuurd.",
    language: "Taal",
    subject: "Onderwerp",
    body: "Bericht",
    save: "Sjabloon opslaan",
    saved: "Sjabloon opgeslagen.",
    readOnlyTemplate: "Enkel wie meldingen beheert, kan dit sjabloon wijzigen.",
    statuses: {
      missing: "te bezorgen",
      requested: "gevraagd",
      refused: "geweigerd",
      expired: "vervallen",
    } as Record<string, string>,
  },
  en: {
    title: "Reminders",
    intro:
      "Tick the people who are not up to date and send them a reminder by email and in the app (to the person and their representatives).",
    loading: "Loading…",
    restricted:
      "Reminders are reserved for people who manage dues or documents (with two-factor authentication).",
    dues: "Dues",
    documents: "Documents",
    duesHint:
      "Instalments past due or due within 14 days. Payments will be tracked automatically with the bank module: until then, untick those who already paid.",
    docsHint: "Documents to provide, refused or expired.",
    person: "Person",
    situation: "Situation",
    recipients: "Recipients",
    last: "Last reminder",
    never: "Never",
    none: "No address",
    overdue: "overdue",
    next: "next instalment",
    selectAll: "Tick all",
    selectLate: "Tick everyone late",
    selectNone: "Untick all",
    send: "Send reminder ({n})",
    sent: "{people} person(s) reminded, {messages} message(s) sent.",
    empty: "Everyone is up to date.",
    template: "Message template",
    templateHint:
      "Available variables: {name}, {person}, {amount}, {due}, {details}, {organization}, {url}. The same reminder is sent at most once a day.",
    language: "Language",
    subject: "Subject",
    body: "Message",
    save: "Save template",
    saved: "Template saved.",
    readOnlyTemplate:
      "Only people who manage notifications can edit this template.",
    statuses: {
      missing: "to provide",
      requested: "requested",
      refused: "refused",
      expired: "expired",
    } as Record<string, string>,
  },
};

/** Dues and document reminders: pick who is not up to date, edit the template, send. */
export function Reminders({
  locale,
  initial,
  embedded,
}: {
  locale: Locale;
  initial?: Kind;
  /** Inside Settings > Notifications (wave 17, G3): a section, hidden when the profile may not remind. */
  embedded?: boolean;
}) {
  const t = copy[locale];
  const [view, setView] = useState<View | null>(null),
    [kind, setKind] = useState<Kind>(initial ?? "dues"),
    [picked, setPicked] = useState<Set<string>>(new Set()),
    [lang, setLang] = useState<"fr" | "nl" | "en">(locale),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? code,
    [locale],
  );
  const money = (c: number) =>
    new Intl.NumberFormat(tag(locale), {
      style: "currency",
      currency: "EUR",
    }).format(c / 100);
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/Brussels",
    }).format(new Date(d.length === 10 ? d + "T12:00:00Z" : d));
  const fill = (s: string, v: Record<string, number>) =>
    s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

  async function load() {
    const r = await fetch("/api/reminders", { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reminders", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (cancelled) return;
        setView(v);
        if (!v.can.dues) setKind("documents");
        // Everyone late on their dues is ticked from the start.
        else
          setPicked(
            new Set(
              (v.dues as { profile_id: string; overdueCents: number }[])
                .filter((r) => r.overdueCents > 0)
                .map((r) => r.profile_id),
            ),
          );
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (["FORBIDDEN", "MFA_REQUIRED", "CLUB_ONLY", "MODULE_OFF", "CONTEXT_REQUIRED"].includes(e.message))
          setDenied(true);
        else setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [failure]);

  // The team chosen in the top bar (wave 15): only its late payers are listed, ticked and reminded.
  const scopeTeam = useScope().teamId;
  const duesRows = (view?.dues ?? []).filter((r) => !scopeTeam || r.team_ids.includes(scopeTeam));
  const rows = view ? (kind === "dues" ? duesRows : view.documents) : [];
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  const chosen = ids.filter((id) => picked.has(id));
  const template = view?.templates.find(
    (x) =>
      x.kind === (kind === "dues" ? "dues_reminder" : "document_reminder") &&
      x.locale === lang,
  );

  async function send() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          kind,
          profileIds: chosen,
          organizationId: view?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setPicked(new Set());
      await load();
      setMessage(fill(t.sent, { people: v.people, messages: v.messages }));
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  async function saveTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!template) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "template",
          kind: template.kind,
          locale: template.locale,
          subject: f.get("subject"),
          body: f.get("body"),
          expectedVersion: template.version,
          organizationId: view?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(t.saved);
    } catch (e2) {
      setError(failure(e2 instanceof Error ? e2.message : ""));
    } finally {
      setBusy(false);
    }
  }

  if (embedded && denied) return null;
  const Shell = embedded ? "section" : "main";
  return (
    <Shell {...(embedded ? { "aria-labelledby": "settings-reminders" } : { id: "main" })} className="access reminders">
      {embedded ? (
        <header className="reminders-head">
          <h2 id="settings-reminders">{t.title}</h2>
          <p className="muted">{t.intro}</p>
        </header>
      ) : (
        <PageHeader title={t.title} subtitle={t.intro} />
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.restricted}</p>}
      {!view && !denied && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          <div className="section-nav" role="group" aria-label={t.title}>
            {(["dues", "documents"] as const)
              .filter((k) => view.can[k])
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  className={kind === k ? "button" : "button secondary"}
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setPicked(new Set());
                  }}
                >
                  {k === "dues" ? t.dues : t.documents} (
                  {k === "dues"
                    ? new Set(duesRows.map((r) => r.profile_id)).size
                    : view.documents.length}
                  )
                </button>
              ))}
          </div>
          <div className="grid reminders-grid">
            <Card title={kind === "dues" ? t.dues : t.documents} labelledBy="reminders-list" headingId="reminders-list">
              <p className="muted">
                {kind === "dues" ? t.duesHint : t.docsHint}
              </p>
              {rows.length ? (
                <>
                  <div className="row-actions">
                    {kind === "dues" && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          setPicked(
                            new Set(
                              duesRows
                                .filter((r) => r.overdueCents > 0)
                                .map((r) => r.profile_id),
                            ),
                          )
                        }
                      >
                        {t.selectLate}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setPicked(new Set(ids))}
                    >
                      {t.selectAll}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setPicked(new Set())}
                    >
                      {t.selectNone}
                    </button>
                  </div>
                  <div
                    className="table-scroll"
                    role="region"
                    aria-label={t.title}
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">
                            <span className="sr-only">{t.selectAll}</span>
                          </th>
                          <th scope="col">{t.person}</th>
                          <th scope="col">{t.situation}</th>
                          <th scope="col">{t.recipients}</th>
                          <th scope="col">{t.last}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kind === "dues"
                          ? view.dues.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={r.full_name}
                                    checked={picked.has(r.profile_id)}
                                    onChange={(e) => {
                                      const next = new Set(picked);
                                      if (e.target.checked)
                                        next.add(r.profile_id);
                                      else next.delete(r.profile_id);
                                      setPicked(next);
                                    }}
                                  />
                                </td>
                                <td>{r.full_name}</td>
                                <td>
                                  {r.category} · {money(r.net_cents)}
                                  {r.overdueCents > 0 && (
                                    <Badge tone="danger">
                                      {money(r.overdueCents)} {t.overdue}
                                    </Badge>
                                  )}
                                  {r.next && (
                                    <span className="muted">
                                      {" "}
                                      · {t.next} {day(r.next.due_on)} (
                                      {money(r.next.amount_cents)})
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {r.recipients.length ? (
                                    r.recipients.join(", ")
                                  ) : (
                                    <span className="muted">{t.none}</span>
                                  )}
                                </td>
                                <td>
                                  {r.last_sent ? (
                                    day(r.last_sent)
                                  ) : (
                                    <span className="muted">{t.never}</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          : view.documents.map((r) => (
                              <tr key={r.profile_id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={r.full_name}
                                    checked={picked.has(r.profile_id)}
                                    onChange={(e) => {
                                      const next = new Set(picked);
                                      if (e.target.checked)
                                        next.add(r.profile_id);
                                      else next.delete(r.profile_id);
                                      setPicked(next);
                                    }}
                                  />
                                </td>
                                <td>{r.full_name}</td>
                                <td>
                                  <ul className="plain-list">
                                    {r.documents.map((d) => (
                                      <li key={d.name}>
                                        {d.name}{" "}
                                        <Badge tone={
                                            d.status === "refused" ||
                                            d.status === "expired"
                                              ? "danger"
                                              : "warning"
                                          }>
                                          {t.statuses[d.status] ?? d.status}
                                        </Badge>
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                                <td>
                                  {r.recipients.length ? (
                                    r.recipients.join(", ")
                                  ) : (
                                    <span className="muted">{t.none}</span>
                                  )}
                                </td>
                                <td>
                                  {r.last_sent ? (
                                    day(r.last_sent)
                                  ) : (
                                    <span className="muted">{t.never}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="button"
                    disabled={busy || !chosen.length}
                    onClick={() => void send()}
                  >
                    {fill(t.send, { n: chosen.length })}
                  </button>
                </>
              ) : (
                <EmptyState title={t.empty} />
              )}
            </Card>
            <Card title={t.template} labelledBy="reminders-template" headingId="reminders-template">
              <p className="muted">{t.templateHint}</p>
              {/* 10: a template of the club's library instead of the text below. */}
              <TemplateChoice locale={locale} target={kind === "dues" ? "dues_reminder" : "documents_reminder"} usage={kind === "dues" ? "dues_reminder" : "document_reminder"} />
              <label htmlFor="template-lang">
                {t.language}
                <select
                  id="template-lang"
                  value={lang}
                  onChange={(e) =>
                    setLang(e.target.value as "fr" | "nl" | "en")
                  }
                >
                  <option value="fr">Français</option>
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </select>
              </label>
              {template && (
                <form
                  key={template.kind + template.locale + template.version}
                  onSubmit={saveTemplate}
                  className="finance-form"
                >
                  <label htmlFor="template-subject">
                    {t.subject}
                    <input
                      id="template-subject"
                      name="subject"
                      required
                      minLength={2}
                      maxLength={180}
                      defaultValue={template.subject}
                      readOnly={!view.can.templates}
                    />
                  </label>
                  <label htmlFor="template-body">
                    {t.body}
                    <textarea
                      id="template-body"
                      name="body"
                      rows={10}
                      required
                      minLength={5}
                      maxLength={5000}
                      defaultValue={template.body}
                      readOnly={!view.can.templates}
                    />
                  </label>
                  {view.can.templates ? (
                    <button className="button secondary" disabled={busy}>
                      {t.save}
                    </button>
                  ) : (
                    <p className="muted">{t.readOnlyTemplate}</p>
                  )}
                </form>
              )}
            </Card>
          </div>
        </>
      )}
    </Shell>
  );
}
