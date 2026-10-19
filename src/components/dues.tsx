"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { Panel, Button } from "./ui";
const copy = {
  fr: {
    title: "Cotisations",
    intro: "Barèmes par saison, créances individuelles et échéanciers.",
    limits:
      "Les encaissements, virements, QR et rapprochements seront disponibles au lot 09. Aucun paiement n’est enregistré ici.",
    plans: "Barèmes",
    season: "Saison",
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
    title: "Bijdragen",
    intro: "Seizoenstarieven, individuele vorderingen en termijnen.",
    limits:
      "Betalingen, overschrijvingen, QR en afstemming volgen in fase 09. Hier worden geen betalingen geboekt.",
    plans: "Tarieven",
    season: "Seizoen",
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
    title: "Dues",
    intro: "Season rates, individual receivables and instalments.",
    limits:
      "Payments, bank transfers, QR codes and reconciliation will follow in lot 09. No payments are recorded here.",
    plans: "Rates",
    season: "Season",
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
type Plan = {
  id: string;
  season_id: string;
  category: string;
  amount_cents: number;
  max_installments: number;
  first_due: string;
  archived: boolean;
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
  history: { action: string; reason: string; created_at: string }[];
};
type View = {
  organizationId: string;
  manage: boolean;
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
};
const remindLabel = {
  fr: "Relancer ceux qui ne sont pas en ordre",
  nl: "Wie niet in orde is herinneren",
  en: "Remind those not up to date",
};
export function Dues({ locale }: { locale: Locale }) {
  const t = copy[locale],
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState(""),
    [planId, setPlanId] = useState(""),
    [applicationId, setApplicationId] = useState(""),
    [confirmation, setConfirmation] = useState("");
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
      if (!r.ok) throw new Error();
      await load();
      setMessage(t.saved);
      setConfirmation("");
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (d: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    void command(fn(new FormData(e.currentTarget)));
  }
  const plan = view?.plans.find((p) => p.id === planId),
    admission = view?.followups.find((a) => a.id === applicationId);
  return (
    <main id="main" className="access dues">
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      <p className="notice">{t.limits}</p>
      {view?.manage && (
        <p>
          <Link
            className="button secondary"
            href={`/${locale}/reminders?kind=dues`}
          >
            {remindLabel[locale]}
          </Link>
        </p>
      )}
      {error && (
        <p role="alert">
          {error} <Link href={`/${locale}/access`}>{t.access}</Link>
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void load().catch(() => setError(t.error))}
      >
        {t.refresh}
      </button>
      {!view && !error && <p>{t.loading}</p>}
      {view && (
        <>
          {view.manage && (
            <div className="grid">
              <Panel title={t.plans}>
                <form
                  onSubmit={(e) =>
                    submit(e, (d) => ({
                      action: "plan",
                      seasonId: d.get("season"),
                      category: d.get("category"),
                      amountCents: Math.round(Number(d.get("amount")) * 100),
                      maxInstallments: Number(d.get("count")),
                      firstDue: d.get("due"),
                    }))
                  }
                >
                  <label>
                    {t.season}
                    <select name="season" required>
                      {view.seasons.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.category}
                    <input
                      name="category"
                      required
                      minLength={2}
                      maxLength={80}
                    />
                  </label>
                  <label>
                    {t.amount}
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      required
                    />
                  </label>
                  <label>
                    {t.max}
                    <input
                      name="count"
                      type="number"
                      min="1"
                      max="12"
                      defaultValue="4"
                      required
                    />
                  </label>
                  <label>
                    {t.due}
                    <input name="due" type="date" required />
                  </label>
                  <Button disabled={busy || !view.seasons.length}>
                    {t.create}
                  </Button>
                </form>
                <ul>
                  {view.plans
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <li key={p.id}>
                        {p.category} ·{" "}
                        {view.seasons.find((s) => s.id === p.season_id)?.name} ·{" "}
                        {money(p.amount_cents)}{" "}
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void command({ action: "archivePlan", id: p.id })
                          }
                        >
                          {t.archive}
                        </button>
                      </li>
                    ))}
                </ul>
              </Panel>
              <Panel title={t.issue}>
                <form
                  onSubmit={(e) =>
                    submit(e, (d) => ({
                      action: "issue",
                      planId,
                      profileId: d.get("person"),
                      discountCents: Math.round(
                        Number(d.get("discount")) * 100,
                      ),
                      reason: d.get("reason"),
                      installments: Number(d.get("count")),
                      firstDue: d.get("due"),
                      ...(applicationId ? { applicationId } : {}),
                    }))
                  }
                >
                  <label>
                    {t.followups}
                    <select
                      value={applicationId}
                      onChange={(e) => {
                        setApplicationId(e.target.value);
                        setPlanId("");
                      }}
                    >
                      <option value="">{t.manual}</option>
                      {view.followups.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.subject_name} ·{" "}
                          {view.seasons.find((s) => s.id === a.season_id)?.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.plan}
                    <select
                      value={planId}
                      required
                      onChange={(e) => setPlanId(e.target.value)}
                    >
                      <option value="" disabled>
                        {t.plan}
                      </option>
                      {view.plans
                        .filter(
                          (p) =>
                            !p.archived &&
                            (!admission || p.season_id === admission.season_id),
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.category} ·{" "}
                            {
                              view.seasons.find((s) => s.id === p.season_id)
                                ?.name
                            }{" "}
                            · {money(p.amount_cents)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {t.person}
                    <select
                      name="person"
                      key={applicationId}
                      defaultValue={admission?.profile_id}
                      required
                    >
                      {view.profiles
                        .filter(
                          (p) => !admission || p.id === admission.profile_id,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {t.discount}
                    <input
                      name="discount"
                      type="number"
                      min="0"
                      max={(plan?.amount_cents ?? 0) / 100}
                      step="0.01"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <label>
                    {t.reason}
                    <input name="reason" maxLength={500} />
                  </label>
                  <label>
                    {t.count}
                    <input
                      name="count"
                      key={planId + applicationId + "count"}
                      type="number"
                      min="1"
                      max={plan?.max_installments ?? 1}
                      defaultValue={Math.min(
                        admission?.installments ?? 1,
                        plan?.max_installments ?? 1,
                      )}
                      required
                    />
                  </label>
                  <label>
                    {t.due}
                    <input
                      name="due"
                      key={planId}
                      type="date"
                      defaultValue={plan?.first_due}
                      required
                    />
                  </label>
                  <Button disabled={busy || !planId || !view.profiles.length}>
                    {t.issue}
                  </Button>
                </form>
              </Panel>
            </div>
          )}
          <Panel title={t.debts}>
            <label>
              {t.season}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">{t.all}</option>
                {[
                  ...new Map(
                    view.debts.map((d) => [d.season_id, d.season_name]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {!view.debts.length && <p>{t.empty}</p>}
            {view.debts
              .filter((d) => !filter || d.season_id === filter)
              .map((d) => (
                <details key={d.id}>
                  <summary>
                    {d.full_name} · {d.category} · {d.season_name} —{" "}
                    {money(d.net_cents)} ·{" "}
                    {d.status === "cancelled"
                      ? t.cancelled
                      : d.net_cents === 0
                        ? t.exempt
                        : t.open}
                  </summary>
                  <p>
                    {t.net}: {money(d.net_cents)} · {t.overdue}:{" "}
                    {money(d.overdue_cents)}
                  </p>
                  {d.discount_cents > 0 && (
                    <p>
                      {t.discount}: {money(d.discount_cents)} · {d.reason}
                    </p>
                  )}
                  <div className="table-scroll">
                    <table>
                      <caption>
                        {d.full_name} · {t.count}
                      </caption>
                      <thead>
                        <tr>
                          <th>{t.ordinal}</th>
                          <th>{t.date}</th>
                          <th>{t.amount}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.installments.map((i) => (
                          <tr key={i.ordinal}>
                            <td>{i.ordinal}</td>
                            <td>{i.due_on}</td>
                            <td>{money(i.amount_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {view.manage && d.status === "open" && (
                    <>
                      <form
                        onSubmit={(e) =>
                          submit(e, (f) => ({
                            action: "schedule",
                            id: d.id,
                            version: d.version,
                            installments: Number(f.get("count")),
                            firstDue: f.get("due"),
                            reason: f.get("reason"),
                          }))
                        }
                      >
                        <h3>{t.schedule}</h3>
                        <label>
                          {t.count}
                          <input
                            name="count"
                            type="number"
                            min="1"
                            max={d.plan_snapshot.max_installments}
                            defaultValue={d.installments.length}
                            required
                          />
                        </label>
                        <label>
                          {t.due}
                          <input
                            name="due"
                            type="date"
                            defaultValue={d.installments[0]?.due_on}
                            required
                          />
                        </label>
                        <label>
                          {t.reason}
                          <input
                            name="reason"
                            minLength={5}
                            maxLength={500}
                            required
                          />
                        </label>
                        <Button disabled={busy}>{t.save}</Button>
                      </form>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (confirmation !== d.id) {
                            setConfirmation(d.id);
                            return;
                          }
                          void command({
                            action: "cancel",
                            id: d.id,
                            version: d.version,
                            reason: new FormData(e.currentTarget).get("reason"),
                          });
                        }}
                      >
                        <label>
                          {t.reason}
                          <input
                            name="reason"
                            minLength={5}
                            maxLength={500}
                            required
                          />
                        </label>
                        <Button disabled={busy}>
                          {confirmation === d.id ? t.confirm : t.cancel}
                        </Button>
                      </form>
                    </>
                  )}
                  <h3>{t.history}</h3>
                  <ul>
                    {d.history.map((h, i) => (
                      <li key={i}>
                        {new Date(h.created_at).toLocaleString(locale)} ·{" "}
                        {(
                          {
                            issue: t.issueAction,
                            cancel: t.cancelAction,
                            schedule: t.scheduleAction,
                          } as Record<string, string>
                        )[h.action] ?? h.action}{" "}
                        {h.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
          </Panel>
        </>
      )}
    </main>
  );
}
