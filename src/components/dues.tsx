"use client";
import { authorizationSettingsCopy } from "./family-copy";
import { useClubChildFilter } from "./child-switcher";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { ApplyScope, useScope, useScopedTeam, useSeeded } from "./use-scope";
import { Button, Badge, Card, EmptyState, ExportButton, PageHeader, StatCard, Toolbar, type Tone } from "./ui";
import { Modal } from "./modal";
import { Icon } from "./icons";
import { CollectionBar } from "./collection-bar";
import { collectionCopy } from "./collection-copy";
import { duesTotals } from "@/domains/dues/schema";
import { DataGrid, postCommand } from "./data-grid";
import { eachRow } from "./table-state";
import { bulkCopy } from "./bulk-copy";
import { undoToast } from "./toast";
import { toastCopy } from "./toast-copy";
import { IssueWizard } from "./dues-issue";
import { duesIssueCopy } from "./dues-issue-copy";
const copy = {
  fr: {
    collected: "Encaissé",
    remaining: "Reste à payer",
    nextDue: "Prochaine échéance",
    state: "Statut",
    states: { paid: "Payée", late: "En retard", due_soon: "Échéance proche", on_track: "En ordre", cancelled: "Annulée", exempt: "Exonérée" } as Record<string, string>,
    pay: "Encaisser",
    payNext: "Encaisser la prochaine échéance de {name}",
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
    exemptAction: "Exonération",
  },
  nl: {
    collected: "Ontvangen",
    remaining: "Nog te betalen",
    nextDue: "Volgende vervaldag",
    state: "Status",
    states: { paid: "Betaald", late: "Te laat", due_soon: "Vervalt binnenkort", on_track: "In orde", cancelled: "Geannuleerd", exempt: "Vrijgesteld" },
    pay: "Innen",
    payNext: "De volgende termijn van {name} innen",
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
    exemptAction: "Vrijstelling",
  },
  en: {
    collected: "Collected",
    remaining: "Still due",
    nextDue: "Next instalment",
    state: "Status",
    states: { paid: "Paid", late: "Late", due_soon: "Due soon", on_track: "On track", cancelled: "Cancelled", exempt: "Exempt" },
    pay: "Collect",
    payNext: "Collect the next instalment of {name}",
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
    exemptAction: "Exemption",
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
  profile_id: string;
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
  payments: { id: string; occurred_on: string; amount_cents: number; method: string; reference: string; cancelled_at: string | null; payer_name?: string | null }[];
  /** 29: two homes. The club's split, who may be recorded as payer, the viewer's share. */
  split?: { id: string; full_name: string; percent: number }[];
  payers?: { id: string; full_name: string }[];
  myPercent?: number | null;
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
export function Dues({ locale, issueTeam }: { locale: Locale; /** A6: « Émettre les cotisations de l'équipe » from a team's page. */ issueTeam?: string }) {
  const t = copy[locale] as (typeof copy)["fr"],
    sc = authorizationSettingsCopy[locale],
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [q, setQ] = useState(""),
    [detailId, setDetailId] = useState(""),
    [payId, setPayId] = useState(""),
    [issuing, setIssuing] = useState(!!issueTeam);
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
  // ?pay=<player> (Ctrl+K "Encaisser la cotisation de …", wave 15 C6) opens that player's payment once.
  const urlPay = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("pay") ?? "",
    () => "",
  );
  const [autoPay, setAutoPay] = useState(true);
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
      const v = (await r.json().catch(() => ({}))) as { error?: string; undo?: string; id?: string };
      if (!r.ok) throw new Error(v.error);
      await load();
      setMessage(t.saved);
      setConfirmation("");
      // The payment can be undone for a moment, ledger line included (wave 15, C10).
      if (body.action === "pay" && v.undo) undoToast(locale, toastCopy[locale].paid.replace("{amount}", money(Number(body.amountCents))), v.undo, view?.organizationId, load);
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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const tone: Record<Debt["state"], Tone> = { paid: "success", late: "danger", due_soon: "warning", on_track: "neutral", cancelled: "neutral", exempt: "info" };
  const inTeam = (d: Debt) => !team || (d.team_ids ?? []).includes(team);
  // 27: a family keeps one child at a time if it chose so (« Tous » by default).
  const family = useClubChildFilter(locale, view?.organizationId, !!view && !view.readOnly && !view.manage);
  const rows = (view?.debts ?? []).filter(
    (d) =>
      inTeam(d) &&
      (!family.child || d.profile_id === family.child) &&
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
  const nextOpen = (d: Debt) => d.settled.find((i) => i.left_cents > 0);
  const paying =
    view?.debts.find((d) => d.id === payId) ??
    (autoPay && urlPay && view?.manage ? view.debts.find((d) => d.profile_id === urlPay && d.status === "open" && nextOpen(d)) : undefined);
  const closePay = () => {
    setPayId("");
    setAutoPay(false);
  };
  const b = bulkCopy[locale];
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
                <Link className="button secondary" href={`/${locale}/settings/notifications?kind=dues#settings-reminders`}>
                  {remindLabel[locale]}
                </Link>
                <Link className="button secondary" href={`/${locale}/settings/money#settings-dues-title`}>
                  {settingsLabel[locale]}
                </Link>
                {/* A3: always there for dues.manage; without a rate the wizard starts by creating one. */}
                <button type="button" className="button" onClick={() => setIssuing(true)}>
                  {duesIssueCopy[locale].open}
                </button>
              </>
            )}
          </>
        }
      />
      {family.node}
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
          {(view.manage || view.readOnly) && (
            <Card title={collectionCopy[locale].title} id="dues-collection" className="dues-collection">
              <CollectionBar locale={locale} totals={totals} />
            </Card>
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
                {/* Wave 17 (G2): the dues shown, with their season, team and state filters. */}
                <ExportButton
                  locale={locale}
                  organizationId={view.organizationId}
                  dataset="dues"
                  subject={t.title}
                  period={view.debts.find((d) => d.season_id === filter)?.season_name ?? ""}
                  rows={rows}
                  columns={[
                    { id: "person", label: t.person, value: (d) => d.full_name },
                    { id: "team", label: t.team, value: (d) => (d.team_ids ?? []).map((id) => teams.find((v) => v.id === id)?.name ?? "").filter(Boolean).join(", ") },
                    { id: "plan", label: t.plan, value: (d) => d.category },
                    { id: "season", label: t.season, value: (d) => d.season_name },
                    { id: "net", label: t.net, type: "money", value: (d) => d.net_cents / 100 },
                    { id: "collected", label: t.collected, type: "money", value: (d) => Math.min(d.paid_cents, d.net_cents) / 100 },
                    { id: "remaining", label: t.remaining, type: "money", value: (d) => Math.max(0, d.net_cents - d.paid_cents) / 100 },
                    { id: "next", label: t.nextDue, type: "date", value: (d) => (d.status === "open" ? (nextOpen(d)?.due_on ?? null) : null) },
                    { id: "state", label: t.state, value: (d) => t.states[d.state] },
                  ]}
                />
              </Toolbar>
            }
          >
            {!rows.length ? (
              <EmptyState
                title={seasonRows.length || q || stateFilter ? t.empty : duesIssueCopy[locale].emptySeason}
                icon="dues"
                action={
                  view.manage && !seasonRows.length ? (
                    <button type="button" className="button" onClick={() => setIssuing(true)}>
                      {duesIssueCopy[locale].open}
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <DataGrid
                locale={locale}
                label={t.debts}
                className="dues-table"
                storageKey="dues"
                rows={rows}
                rowId={(d) => d.id}
                rowName={(d) => d.full_name}
                rowState={(d) => d.state}
                onDone={load}
                reasons={b.reasons}
                columns={[
                  { key: "person", header: t.person, rowHeader: true, hideable: false, sort: (d) => d.full_name, cell: (d) => d.full_name },
                  ...(teamColumn
                    ? [
                        {
                          key: "team",
                          header: t.team,
                          sort: (d: Debt) => (d.team_ids ?? []).map((id) => teams.find((v) => v.id === id)?.name ?? "").join(", "),
                          cell: (d: Debt) =>
                            (d.team_ids ?? []).map((id) => {
                              const x = teams.find((v) => v.id === id);
                              return x ? (
                                <span key={id} className="team-chip" data-color={x.color ?? "none"}>
                                  <span className="team-dot" aria-hidden="true" />
                                  {x.name}
                                </span>
                              ) : null;
                            }),
                        },
                      ]
                    : []),
                  {
                    key: "plan",
                    header: t.plan,
                    sort: (d) => d.category,
                    cell: (d) => (
                      <>
                        {d.category} <span className="muted small">· {d.season_name}</span>
                      </>
                    ),
                  },
                  { key: "net", header: t.net, className: "num", sort: (d) => d.net_cents, cell: (d) => money(d.net_cents) },
                  { key: "collected", header: t.collected, className: "num", sort: (d) => Math.min(d.paid_cents, d.net_cents), cell: (d) => money(Math.min(d.paid_cents, d.net_cents)) },
                  {
                    key: "remaining",
                    header: t.remaining,
                    className: "num",
                    sort: (d) => Math.max(0, d.net_cents - d.paid_cents),
                    cell: (d) => <strong>{money(Math.max(0, d.net_cents - d.paid_cents))}</strong>,
                  },
                  {
                    key: "next",
                    header: t.nextDue,
                    sort: (d) => (d.status === "open" ? nextOpen(d)?.due_on : null),
                    cell: (d) => {
                      const next = nextOpen(d);
                      return d.status === "open" && next ? (
                        next.due_on < today ? (
                          <span className="danger-ink">
                            <Icon name="alert" size={14} /> {day(next.due_on)} · {money(next.left_cents)}
                            <span className="sr-only"> · {t.overdue}</span>
                          </span>
                        ) : (
                          <>
                            {day(next.due_on)} · {money(next.left_cents)}
                          </>
                        )
                      ) : (
                        <span className="muted">…</span>
                      );
                    },
                  },
                  {
                    key: "state",
                    header: t.state,
                    sort: (d) => ["late", "due_soon", "on_track", "paid", "exempt", "cancelled"].indexOf(d.state),
                    cell: (d) => (
                      <Badge tone={tone[d.state]} dot>
                        {t.states[d.state]}
                      </Badge>
                    ),
                  },
                  {
                    key: "actions",
                    header: t.details,
                    hideable: false,
                    className: "dues-actions",
                    cell: (d) => {
                      const next = nextOpen(d);
                      return (
                        <div className="row-actions">
                          {view.manage && d.status === "open" && next && (
                            <button
                              type="button"
                              className="icon-button round tick"
                              disabled={busy}
                              title={`${t.payNext.replace("{name}", d.full_name)} · ${money(next.left_cents)}`}
                              aria-label={`${t.payNext.replace("{name}", d.full_name)}, ${money(next.left_cents)}`}
                              onClick={() => setPayId(d.id)}
                            >
                              <Icon name="check" size={16} />
                            </button>
                          )}
                          <button type="button" className="text-button" onClick={() => setDetailId(d.id)}>
                            {t.details}
                            <span className="sr-only"> : {d.full_name}</span>
                          </button>
                        </div>
                      );
                    },
                  },
                ]}
                actions={[
                  {
                    id: "remind",
                    label: b.remind,
                    icon: "bell",
                    hidden: !view.manage,
                    confirm: b.remindConfirm,
                    run: (chosen) =>
                      eachRow(chosen, (d) => d.id, async (d) => {
                        const r = await postCommand("/api/reminders", { organizationId: view.organizationId, action: "send", kind: "dues", profileIds: [d.profile_id] });
                        if (!r.people) throw new Error("NOT_CONCERNED");
                        if (!r.messages) throw new Error("NO_EMAIL");
                      }),
                  },
                  {
                    id: "exempt",
                    label: b.exempt,
                    icon: "badgeCheck",
                    hidden: !view.manage,
                    confirm: b.exemptConfirm,
                    run: (chosen) =>
                      eachRow(chosen, (d) => d.id, async (d) => {
                        await postCommand("/api/dues", { organizationId: view.organizationId, action: "exempt", id: d.id, version: d.version, reason: b.exemptReason });
                      }),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
      {view?.manage && issuing && (
        <IssueWizard
          locale={locale}
          organizationId={view.organizationId}
          plans={view.plans}
          seasons={view.seasons}
          teams={view.teams}
          profiles={view.profiles}
          team={issueTeam && view.teams.some((x) => x.id === issueTeam) ? issueTeam : undefined}
          close={() => setIssuing(false)}
          done={(m) => {
            setIssuing(false);
            void load().then(() => setMessage(m));
          }}
        />
      )}
      {paying && (
        <Modal title={`${t.payTitle} · ${paying.full_name}`} close={closePay}>
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
                ...(d.get("payer") ? { payerProfileId: d.get("payer") } : {}),
              })).then((ok) => ok && closePay())
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
            {(paying.payers?.length ?? 0) > 0 && (
              <label>
                {sc.payer}
                <select name="payer" defaultValue="">
                  <option value="">{sc.payerNone}</option>
                  {paying.payers!.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="actions">
              <Button disabled={busy}>{t.pay}</Button>
              <button type="button" className="button secondary" onClick={closePay}>{t.close}</button>
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
          {/* 29: the share of each home. */}
          {detail.myPercent != null && <p>{sc.yourShare.replace("{percent}", String(detail.myPercent))} · {money(Math.round((detail.net_cents * detail.myPercent) / 100))}</p>}
          {view?.manage && (detail.split?.length ?? 0) > 0 && <p className="muted small">{detail.split!.map((x) => `${x.full_name} ${x.percent} %`).join(" · ")}</p>}
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
                <li key={x.id}>{day(x.occurred_on)} · {money(x.amount_cents)} · {t.methods[x.method] ?? x.method}{x.reference && ` · ${x.reference}`}{x.payer_name && ` · ${sc.paidBy.replace("{name}", x.payer_name)}`}</li>
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
                {new Date(h.created_at).toLocaleString(locale)} · {({ issue: t.issueAction, cancel: t.cancelAction, exempt: t.exemptAction, schedule: t.scheduleAction, payment: t.pay } as Record<string, string>)[h.action] ?? h.action} {h.reason}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </main>
  );
}
