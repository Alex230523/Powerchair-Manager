"use client";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { ApplyScope, useScope, useScopedTeam, useSeeded } from "./use-scope";
import { Button, Badge, Card, EmptyState, PageHeader, StatCard, Toolbar, type Tone } from "./ui";
import { Modal } from "./modal";
import { duesTotals } from "@/domains/dues/schema";
const copy = {
  fr: {
    collected: "Encaissé",
    remaining: "Reste à payer",
    nextDue: "Prochaine échéance",
    state: "Statut",
    states: { paid: "Payée", late: "En retard", due_soon: "Échéance proche", on_track: "En ordre", cancelled: "Annulée", exempt: "Exonérée" } as Record<string, string>,
    pay: "Encaisser",
    payTitle: "Encaisser un paiement",
    payHint: "Le montant est écrit dans la trésorerie (recette « cotisations ») et rattaché à cette cotisation.",
    method: "Moyen de paiement",
    methods: { transfer: "Virement", cash: "Espèces", card: "Carte", other: "Autre" } as Record<string, string>,
    reference: "Référence (facultatif)",
    paidOn: "Reçu le",
    details: "Détails",
    payments: "Paiements reçus",
    noPayment: "Aucun paiement reçu.",
    installment: "Échéance {n}",
    paidTag: "payée",
    partTag: "partiellement payée",
    totalDue: "Cotisations de la saison",
    totalCollected: "Encaissées",
    totalLate: "En retard",
    playersLate: "Joueurs en retard",
    filters: "Filtrer",
    search: "Rechercher un joueur",
    newPlan: "Nouveau barème",
    plansHint: "Un barème par saison et par catégorie. Le formulaire d'inscription reprend ce montant.",
    issueShort: "Émettre",
    close: "Fermer",
    stateAll: "Tous les statuts",
    overpaid: "Le montant dépasse ce qui reste dû sur cette cotisation.",
    title: "Cotisations",
    intro: "Barèmes par saison, créances individuelles et échéanciers.",
    limits:
      "Les encaissements, virements, QR et rapprochements seront disponibles au lot 09. Aucun paiement n’est enregistré ici.",
    plans: "Barèmes",
    season: "Saison",
    team: "Équipe",
    allTeams: "Toutes les équipes",
    category: "Catégorie du barème",
    amount: "Montant (€)",
    count: "Nombre d’échéances",
    max: "Maximum d’échéances",
    due: "Première échéance",
    create: "Créer le barème",
    archive: "Archiver le barème",
    issue: "Émettre une cotisation",
    person: "Personne",
    plan: "Barème",
    discount: "Réduction / exemption (€)",
    reason: "Motif (au moins 5 caractères)",
    save: "Enregistrer",
    empty: "Aucun élément.",
    debts: "Créances",
    net: "Montant dû",
    overdue: "En retard",
    cancelled: "Annulée",
    exempt: "Exonérée",
    open: "À régler",
    schedule: "Modifier l’échéancier",
    cancel: "Annuler la créance",
    history: "Historique",
    followups: "Admissions à traiter",
    manual: "Sans lien avec une admission",
    all: "Toutes les saisons",
    saved: "Enregistré.",
    error:
      "Action refusée. Vérifiez les champs, les doublons et votre profil, puis actualisez.",
    access: "Mon espace",
    loading: "Chargement…",
    refresh: "Actualiser",
    confirm: "Confirmer l’annulation",
    ordinal: "Échéance",
    date: "Date",
    issueAction: "Émission",
    planAction: "Barème créé",
    archiveAction: "Barème archivé",
    scheduleAction: "Échéancier modifié",
    cancelAction: "Créance annulée",
  },
  nl: {
    collected: "Ontvangen",
    remaining: "Nog te betalen",
    nextDue: "Volgende vervaldag",
    state: "Status",
    states: { paid: "Betaald", late: "Te laat", due_soon: "Vervalt binnenkort", on_track: "In orde", cancelled: "Geannuleerd", exempt: "Vrijgesteld" },
    pay: "Innen",
    payTitle: "Een betaling innen",
    payHint: "Het bedrag wordt in de boekhouding geschreven (inkomst « lidgeld ») en aan dit lidgeld gekoppeld.",
    method: "Betaalwijze",
    methods: { transfer: "Overschrijving", cash: "Contant", card: "Kaart", other: "Andere" },
    reference: "Referentie (optioneel)",
    paidOn: "Ontvangen op",
    details: "Details",
    payments: "Ontvangen betalingen",
    noPayment: "Nog geen betaling ontvangen.",
    installment: "Termijn {n}",
    paidTag: "betaald",
    partTag: "deels betaald",
    totalDue: "Lidgelden van het seizoen",
    totalCollected: "Ontvangen",
    totalLate: "Te laat",
    playersLate: "Spelers te laat",
    filters: "Filteren",
    search: "Een speler zoeken",
    newPlan: "Nieuw tarief",
    plansHint: "Eén tarief per seizoen en per categorie. Het inschrijvingsformulier neemt dit bedrag over.",
    issueShort: "Aanmaken",
    close: "Sluiten",
    stateAll: "Alle statussen",
    overpaid: "Het bedrag is hoger dan wat nog verschuldigd is.",
    title: "Bijdragen",
    intro: "Seizoenstarieven, individuele vorderingen en termijnen.",
    limits:
      "Betalingen, overschrijvingen, QR en afstemming volgen in fase 09. Hier worden geen betalingen geboekt.",
    plans: "Tarieven",
    season: "Seizoen",
    team: "Team",
    allTeams: "Alle teams",
    category: "Tariefcategorie",
    amount: "Bedrag (€)",
    count: "Aantal termijnen",
    max: "Maximumtermijnen",
    due: "Eerste vervaldatum",
    create: "Tarief maken",
    archive: "Tarief archiveren",
    issue: "Bijdrage aanmaken",
    person: "Persoon",
    plan: "Tarief",
    discount: "Korting / vrijstelling (€)",
    reason: "Reden (minstens 5 tekens)",
    save: "Opslaan",
    empty: "Geen gegevens.",
    debts: "Vorderingen",
    net: "Verschuldigd",
    overdue: "Achterstallig",
    cancelled: "Geannuleerd",
    exempt: "Vrijgesteld",
    open: "Te betalen",
    schedule: "Termijnen wijzigen",
    cancel: "Vordering annuleren",
    history: "Geschiedenis",
    followups: "Te verwerken toelatingen",
    manual: "Zonder koppeling aan toelating",
    all: "Alle seizoenen",
    saved: "Opgeslagen.",
    error:
      "Actie geweigerd. Controleer velden, duplicaten en profiel, en vernieuw.",
    access: "Mijn ruimte",
    loading: "Laden…",
    refresh: "Vernieuwen",
    confirm: "Annulering bevestigen",
    ordinal: "Termijn",
    date: "Datum",
    issueAction: "Aangemaakt",
    planAction: "Tarief gemaakt",
    archiveAction: "Tarief gearchiveerd",
    scheduleAction: "Termijnen gewijzigd",
    cancelAction: "Vordering geannuleerd",
  },
  en: {
    collected: "Collected",
    remaining: "Still due",
    nextDue: "Next instalment",
    state: "Status",
    states: { paid: "Paid", late: "Late", due_soon: "Due soon", on_track: "On track", cancelled: "Cancelled", exempt: "Exempt" },
    pay: "Collect",
    payTitle: "Record a payment",
    payHint: "The amount is written in the ledger (income, dues) and linked to this receivable.",
    method: "Payment method",
    methods: { transfer: "Transfer", cash: "Cash", card: "Card", other: "Other" },
    reference: "Reference (optional)",
    paidOn: "Received on",
    details: "Details",
    payments: "Payments received",
    noPayment: "No payment received yet.",
    installment: "Instalment {n}",
    paidTag: "paid",
    partTag: "partly paid",
    totalDue: "Dues of the season",
    totalCollected: "Collected",
    totalLate: "Late",
    playersLate: "Players late",
    filters: "Filter",
    search: "Search a player",
    newPlan: "New rate",
    plansHint: "One rate per season and category. The registration form shows this amount.",
    issueShort: "Issue",
    close: "Close",
    stateAll: "All statuses",
    overpaid: "The amount exceeds what is still due on this receivable.",
    title: "Dues",
    intro: "Season rates, individual receivables and instalments.",
    limits:
      "Payments, bank transfers, QR codes and reconciliation will follow in lot 09. No payments are recorded here.",
    plans: "Rates",
    season: "Season",
    team: "Team",
    allTeams: "All teams",
    category: "Rate category",
    amount: "Amount (€)",
    count: "Number of instalments",
    max: "Maximum instalments",
    due: "First due date",
    create: "Create rate",
    archive: "Archive rate",
    issue: "Issue dues",
    person: "Person",
    plan: "Rate",
    discount: "Discount / exemption (€)",
    reason: "Reason (at least 5 characters)",
    save: "Save",
    empty: "No items.",
    debts: "Receivables",
    net: "Amount due",
    overdue: "Overdue",
    cancelled: "Cancelled",
    exempt: "Exempt",
    open: "Due",
    schedule: "Change instalments",
    cancel: "Cancel receivable",
    history: "History",
    followups: "Admissions to process",
    manual: "No admission linked",
    all: "All seasons",
    saved: "Saved.",
    error:
      "Action refused. Check fields, duplicates and your profile, then refresh.",
    access: "My space",
    loading: "Loading…",
    refresh: "Refresh",
    confirm: "Confirm cancellation",
    ordinal: "Instalment",
    date: "Date",
    issueAction: "Issued",
    planAction: "Rate created",
    archiveAction: "Rate archived",
    scheduleAction: "Instalments changed",
    cancelAction: "Receivable cancelled",
  },
};
/** Sibling discount and attestation link (wave 8). */
const siblingCopy = {
  fr: {
    title: "Réduction fratrie : l'aîné paie le plein tarif.",
    second: "2e enfant (%)",
    next: "3e et suivants (%)",
    save: "Appliquer",
    attestations: "Attestations pour la mutuelle",
  },
  nl: {
    title: "Gezinskorting: het oudste kind betaalt het volle tarief.",
    second: "2e kind (%)",
    next: "3e en volgende (%)",
    save: "Toepassen",
    attestations: "Attesten voor het ziekenfonds",
  },
  en: {
    title: "Sibling discount: the eldest pays the full price.",
    second: "2nd child (%)",
    next: "3rd and next (%)",
    save: "Apply",
    attestations: "Mutual insurance attestations",
  },
};
/** Rates moved to Réglages (wave 11); the page keeps a shortcut. */
const settingsLabel = { fr: "Réglages des cotisations", nl: "Instellingen lidgeld", en: "Dues settings" };
type Plan = {
  id: string;
  season_id: string;
  category: string;
  amount_cents: number;
  max_installments: number;
  first_due: string;
  archived: boolean;
  sibling_second_percent: number;
  sibling_next_percent: number;
};
type Debt = {
  id: string;
  full_name: string;
  season_id: string;
  season_name: string;
  category: string;
  net_cents: number;
  discount_cents: number;
  reason: string;
  overdue_cents: number;
  status: string;
  version: number;
  plan_snapshot: Plan;
  installments: { ordinal: number; due_on: string; amount_cents: number }[];
  settled: { ordinal: number; due_on: string; amount_cents: number; paid_cents: number; left_cents: number }[];
  paid_cents: number;
  state: "paid" | "late" | "due_soon" | "on_track" | "cancelled" | "exempt";
  payments: { id: string; occurred_on: string; amount_cents: number; method: string; reference: string; cancelled_at: string | null }[];
  history: { action: string; reason: string; created_at: string }[];
  /** Teams the line belongs to (wave 15): its rate's team, or the player's current teams. */
  team_ids: string[];
};
type View = {
  organizationId: string;
  manage: boolean;
  readOnly: boolean;
  plans: Plan[];
  seasons: { id: string; name: string }[];
  profiles: { id: string; full_name: string }[];
  followups: {
    id: string;
    profile_id: string;
    season_id: string;
    subject_name: string;
    /** Number of payments chosen on the registration form, if asked. */
    installments: number | null;
  }[];
  debts: Debt[];
  teams: { id: string; name: string; season_id: string; color: string | null }[];
};
const remindLabel = {
  fr: "Relancer ceux qui ne sont pas en ordre",
  nl: "Wie niet in orde is herinneren",
  en: "Remind those not up to date",
};
export function Dues({ locale }: { locale: Locale }) {
  const t = copy[locale] as (typeof copy)["fr"],
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [planId, setPlanId] = useState(""),
    [applicationId, setApplicationId] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [q, setQ] = useState(""),
    [detailId, setDetailId] = useState(""),
    [payId, setPayId] = useState(""),
    [issuing, setIssuing] = useState(false);
  // The season chosen in the top bar (wave 12) seeds the season filter.
  const scope = useScope();
  const [filter, setFilter] = useSeeded(scope.seasonId ?? "");
  // The team chosen in the top bar (wave 15): tiles, table and search follow it; a local choice can be applied everywhere.
  const { team, setTeam, differs: teamDiffers, apply: applyTeam } = useScopedTeam();
  // ?state=late (from the dashboard and the sidebar counter) seeds the state filter.
  const urlState = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("state") ?? "",
    () => "",
  );
  const [stateFilter, setStateFilter] = useSeeded(urlState);
  const money = (v: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(v / 100);
  async function load() {
    const r = await fetch("/api/dues", { cache: "no-store" });
    if (!r.ok) throw new Error();
    setView(await r.json());
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dues", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch(() => {
        if (!cancelled) setError(t.error);
      });
    return () => {
      cancelled = true;
    };
  }, [t.error]);
  async function command(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/dues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, organizationId: view?.organizationId }),
      });
      if (!r.ok) {
        const v = await r.json().catch(() => ({}));
        throw new Error(v.error);
      }
      await load();
      setMessage(t.saved);
      setConfirmation("");
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(code === "OVERPAID" ? t.overpaid : t.error);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (d: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    return command(fn(new FormData(e.currentTarget)));
  }
  const plan = view?.plans.find((p) => p.id === planId),
    admission = view?.followups.find((a) => a.id === applicationId);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const tone: Record<Debt["state"], Tone> = { paid: "success", late: "danger", due_soon: "warning", on_track: "neutral", cancelled: "neutral", exempt: "info" };
  const inTeam = (d: Debt) => !team || (d.team_ids ?? []).includes(team);
  const rows = (view?.debts ?? []).filter(
    (d) =>
      inTeam(d) &&
      (!filter || d.season_id === filter) &&
      (!stateFilter || d.state === stateFilter) &&
      (!q || d.full_name.toLowerCase().includes(q.toLowerCase())),
  );
  const seasonRows = (view?.debts ?? []).filter((d) => (!filter || d.season_id === filter) && d.status === "open");
  // The same totals as the dashboard and the sidebar counter (domain function, no second calculation).
  const totals = duesTotals(seasonRows, new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()), team || null);
  const teams = view?.teams ?? [];
  const teamColumn = !team && teams.length > 0;
  const detail = view?.debts.find((d) => d.id === detailId);
  const paying = view?.debts.find((d) => d.id === payId);
  const nextOpen = (d: Debt) => d.settled.find((i) => i.left_cents > 0);
  return (
    <main id="main" className="access dues">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          <>
            <Link className="button secondary" href={`/${locale}/dues/attestations`}>
              {siblingCopy[locale].attestations}
            </Link>
            {view?.manage && (
              <>
                <Link className="button secondary" href={`/${locale}/reminders?kind=dues`}>
                  {remindLabel[locale]}
                </Link>
                <Link className="button secondary" href={`/${locale}/settings/money#settings-dues-title`}>
                  {settingsLabel[locale]}
                </Link>
                <button type="button" className="button" onClick={() => setIssuing(true)} disabled={!view.plans.some((p) => !p.archived)}>
                  {t.issue}
                </button>
              </>
            )}
          </>
        }
      />
      {error && (
        <p role="alert">
          {error} <Link href={`/${locale}/access`}>{t.access}</Link>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view && (
        <>
          {(view.manage || view.readOnly) && (
            <ul className="stat-row-grid" data-cols="4">
              <li><StatCard label={t.totalDue} value={money(totals.due)} icon="dues" tone="brand" /></li>
              <li><StatCard label={t.totalCollected} value={money(totals.collected)} icon="check" tone="success" hint={totals.due ? `${Math.round((totals.collected / totals.due) * 100)} %` : undefined} /></li>
              <li><StatCard label={t.totalLate} value={money(totals.late)} icon="alert" tone={totals.late ? "danger" : "neutral"} /></li>
              <li><StatCard label={t.playersLate} value={String(totals.playersLate)} icon="players" tone={totals.playersLate ? "warning" : "neutral"} /></li>
            </ul>
          )}
          <Card title={t.debts} id="dues-table" className="flush"
            actions={
              <Toolbar label={t.filters}>
                {(view.manage || view.readOnly) && (
                  <label>
                    {t.search}
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
                  </label>
                )}
                {teams.length > 0 && (
                  <>
                    <label>
                      {t.team}
                      <select value={team} onChange={(e) => setTeam(e.target.value)}>
                        <option value="">{t.allTeams}</option>
                        {teams.map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                    </label>
                    <ApplyScope locale={locale} differs={teamDiffers} apply={applyTeam} />
                  </>
                )}
                <label>
                  {t.season}
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="">{t.all}</option>
                    {[...new Map(view.debts.map((d) => [d.season_id, d.season_name])).entries()].map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.state}
                  <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                    <option value="">{t.stateAll}</option>
                    {Object.entries(t.states).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
              </Toolbar>
            }
          >
            {!rows.length ? (
              <EmptyState title={t.empty} icon="dues" />
            ) : (
              <div className="table-scroll">
                <table className="dues-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.person}</th>
                      {teamColumn && <th scope="col">{t.team}</th>}
                      <th scope="col">{t.plan}</th>
                      <th scope="col" className="num">{t.net}</th>
                      <th scope="col" className="num">{t.collected}</th>
                      <th scope="col" className="num">{t.remaining}</th>
                      <th scope="col">{t.nextDue}</th>
                      <th scope="col">{t.state}</th>
                      <th scope="col"><span className="sr-only">{t.details}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => {
                      const next = nextOpen(d);
                      return (
                        <tr key={d.id} data-state={d.state}>
                          <th scope="row">{d.full_name}</th>
                          {teamColumn && (
                            <td>
                              {(d.team_ids ?? []).map((id) => {
                                const x = teams.find((v) => v.id === id);
                                return x ? (
                                  <span key={id} className="team-chip" data-color={x.color ?? "none"}>
                                    <span className="team-dot" aria-hidden="true" />
                                    {x.name}
                                  </span>
                                ) : null;
                              })}
                            </td>
                          )}
                          <td>{d.category} <span className="muted small">· {d.season_name}</span></td>
                          <td className="num">{money(d.net_cents)}</td>
                          <td className="num">{money(Math.min(d.paid_cents, d.net_cents))}</td>
                          <td className="num"><strong>{money(Math.max(0, d.net_cents - d.paid_cents))}</strong></td>
                          <td>
                            {d.status === "open" && next ? (
                              <>
                                {day(next.due_on)} · {money(next.left_cents)}
                                {next.due_on < today && <Badge tone="danger">{t.overdue}</Badge>}
                              </>
                            ) : (
                              <span className="muted">…</span>
                            )}
                          </td>
                          <td><Badge tone={tone[d.state]} dot>{t.states[d.state]}</Badge></td>
                          <td>
                            <div className="row-actions">
                              {view.manage && d.status === "open" && next && (
                                <button
                                  type="button"
                                  className="button tick"
                                  disabled={busy}
                                  title={`${t.pay} · ${money(next.left_cents)}`}
                                  aria-label={`${t.pay} : ${d.full_name}, ${money(next.left_cents)}`}
                                  onClick={() => setPayId(d.id)}
                                >
                                  ✓
                                </button>
                              )}
                              <button type="button" className="text-button" onClick={() => setDetailId(d.id)}>
                                {t.details}
                                <span className="sr-only"> : {d.full_name}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {view && issuing && (
        <Modal title={t.issue} close={() => setIssuing(false)}>
          <form
            onSubmit={(e) =>
              submit(e, (d) => ({
                action: "issue",
                planId,
                profileId: d.get("person"),
                discountCents: Math.round(Number(d.get("discount")) * 100),
                reason: d.get("reason"),
                installments: Number(d.get("count")),
                firstDue: d.get("due"),
                ...(applicationId ? { applicationId } : {}),
              })).then((ok) => ok && setIssuing(false))
            }
          >
            <label>
              {t.followups}
              <select value={applicationId} onChange={(e) => { setApplicationId(e.target.value); setPlanId(""); }}>
                <option value="">{t.manual}</option>
                {view.followups.map((a) => (
                  <option key={a.id} value={a.id}>{a.subject_name} · {view.seasons.find((s) => s.id === a.season_id)?.name}</option>
                ))}
              </select>
            </label>
            <label>
              {t.plan}
              <select value={planId} required onChange={(e) => setPlanId(e.target.value)}>
                <option value="" disabled>{t.plan}</option>
                {view.plans.filter((p) => !p.archived && (!admission || p.season_id === admission.season_id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.category} · {view.seasons.find((s) => s.id === p.season_id)?.name} · {money(p.amount_cents)}</option>
                ))}
              </select>
            </label>
            <label>
              {t.person}
              <select name="person" key={applicationId} defaultValue={admission?.profile_id} required>
                {view.profiles.filter((p) => !admission || p.id === admission.profile_id).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </label>
            <div className="form-pair">
              <label>
                {t.discount}
                <input name="discount" type="number" min="0" max={(plan?.amount_cents ?? 0) / 100} step="0.01" defaultValue="0" required />
              </label>
              <label>
                {t.reason}
                <input name="reason" maxLength={500} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {t.count}
                <input name="count" key={planId + applicationId + "count"} type="number" min="1" max={plan?.max_installments ?? 1} defaultValue={Math.min(admission?.installments ?? 1, plan?.max_installments ?? 1)} required />
              </label>
              <label>
                {t.due}
                <input name="due" key={planId} type="date" defaultValue={plan?.first_due} required />
              </label>
            </div>
            <div className="actions">
              <Button disabled={busy || !planId || !view.profiles.length}>{t.issueShort}</Button>
              <button type="button" className="button secondary" onClick={() => setIssuing(false)}>{t.close}</button>
            </div>
          </form>
        </Modal>
      )}
      {paying && (
        <Modal title={`${t.payTitle} · ${paying.full_name}`} close={() => setPayId("")}>
          <p className="muted">{t.payHint}</p>
          <form
            onSubmit={(e) =>
              submit(e, (d) => ({
                action: "pay",
                id: paying.id,
                amountCents: Math.round(Number(String(d.get("amount")).replace(",", ".")) * 100),
                method: d.get("method"),
                occurredOn: d.get("date"),
                reference: d.get("reference"),
              })).then((ok) => ok && setPayId(""))
            }
          >
            <div className="form-pair">
              <label>
                {t.amount}
                <input name="amount" inputMode="decimal" required defaultValue={String((nextOpen(paying)?.left_cents ?? 0) / 100)} />
              </label>
              <label>
                {t.paidOn}
                <input name="date" type="date" required defaultValue={today} max={today} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {t.method}
                <select name="method" defaultValue="transfer">
                  {Object.entries(t.methods).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                {t.reference}
                <input name="reference" maxLength={160} />
              </label>
            </div>
            <div className="actions">
              <Button disabled={busy}>{t.pay}</Button>
              <button type="button" className="button secondary" onClick={() => setPayId("")}>{t.close}</button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={`${detail.full_name} · ${detail.category} · ${detail.season_name}`} close={() => setDetailId("")}>
          <p>
            <Badge tone={tone[detail.state]} dot>{t.states[detail.state]}</Badge> {t.net} : {money(detail.net_cents)} · {t.collected} : {money(Math.min(detail.paid_cents, detail.net_cents))}
            {detail.discount_cents > 0 && <> · {t.discount} : {money(detail.discount_cents)} {detail.reason}</>}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>{t.ordinal}</th><th>{t.date}</th><th className="num">{t.amount}</th><th>{t.state}</th></tr>
              </thead>
              <tbody>
                {detail.settled.map((i) => (
                  <tr key={i.ordinal}>
                    <td>{i.ordinal}</td>
                    <td>{day(i.due_on)}</td>
                    <td className="num">{money(i.amount_cents)}</td>
                    <td>
                      {i.left_cents === 0 ? <Badge tone="success">{t.paidTag}</Badge> : i.paid_cents > 0 ? <Badge tone="warning">{t.partTag} · {money(i.left_cents)}</Badge> : i.due_on < today && detail.status === "open" ? <Badge tone="danger">{t.overdue}</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{t.payments}</h3>
          {detail.payments.filter((x) => !x.cancelled_at).length ? (
            <ul className="plain-list">
              {detail.payments.filter((x) => !x.cancelled_at).map((x) => (
                <li key={x.id}>{day(x.occurred_on)} · {money(x.amount_cents)} · {t.methods[x.method] ?? x.method}{x.reference && ` · ${x.reference}`}</li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noPayment} />
          )}
          {view?.manage && detail.status === "open" && (
            <>
              <form
                onSubmit={(e) =>
                  submit(e, (f) => ({ action: "schedule", id: detail.id, version: detail.version, installments: Number(f.get("count")), firstDue: f.get("due"), reason: f.get("reason") }))
                }
              >
                <h3>{t.schedule}</h3>
                <div className="form-pair">
                  <label>
                    {t.count}
                    <input name="count" type="number" min="1" max={detail.plan_snapshot.max_installments} defaultValue={detail.installments.length} required />
                  </label>
                  <label>
                    {t.due}
                    <input name="due" type="date" defaultValue={detail.installments[0]?.due_on} required />
                  </label>
                </div>
                <label>
                  {t.reason}
                  <input name="reason" minLength={5} maxLength={500} required />
                </label>
                <Button disabled={busy}>{t.save}</Button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (confirmation !== detail.id) { setConfirmation(detail.id); return; }
                  void command({ action: "cancel", id: detail.id, version: detail.version, reason: new FormData(e.currentTarget).get("reason") }).then((ok) => ok && setDetailId(""));
                }}
              >
                <h3>{t.cancel}</h3>
                <label>
                  {t.reason}
                  <input name="reason" minLength={5} maxLength={500} required />
                </label>
                <button className="button secondary" disabled={busy}>{confirmation === detail.id ? t.confirm : t.cancel}</button>
              </form>
            </>
          )}
          <h3>{t.history}</h3>
          <ul className="plain-list muted small">
            {detail.history.map((h, i) => (
              <li key={i}>
                {new Date(h.created_at).toLocaleString(locale)} · {({ issue: t.issueAction, cancel: t.cancelAction, schedule: t.scheduleAction, payment: t.pay } as Record<string, string>)[h.action] ?? h.action} {h.reason}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </main>
  );
}
