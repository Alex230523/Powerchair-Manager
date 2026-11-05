"use client";
import { brusselsToday } from "./chair-sheet";
import { PotExtras } from "./fundraising-goals";
import { goalsCopy } from "./fundraising-goals-copy";
import Link from "next/link";
import { ContactPicker } from "./contact-picker";
import { crmCopy } from "./crm-copy";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { useScope } from "./use-scope";
import { sponsorsCopy } from "./sponsors-copy";
import type { fundraisingView } from "@/domains/fundraising/service";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, EmptyState, PageHeader, Card } from "./ui";

export const fundraisingCopy = {
  fr: {
    playersJoin: "Les joueurs y participent",
    playersJoinHint: "Chaque joueur (ou sa famille) voit la cagnotte dans son espace, voit qui a rapporté quoi et note lui-même ce qu'il a récolté.",
    withPlayers: "Avec les joueurs",
    team: "Équipe",
    wholeClub: "Club entier",
    teamHint: "Une cagnotte d’équipe n’est proposée qu’aux joueurs de cette équipe.",
    collectors: "Qui a rapporté quoi",
    noCollector: "Personne n'a encore noté de récolte.",
    collector: "Récolté par",
    mine: "Ce que j'ai récolté",
    collect: "Noter ce que j'ai récolté",
    forWhom: "Pour",
    collectHint: "Un don reçu, un sponsor trouvé, une vente : notez-le ici, le club le voit tout de suite.",
    collected: "Noté.",
    potsForMe: "Mes cagnottes",
    potsForMeIntro: "Les cagnottes du club auxquelles les joueurs participent. Notez ce que vous avez récolté, et voyez où en est l'équipe.",
    nothingForMe: "Aucune cagnotte ouverte aux joueurs pour l'instant.",
    title: "Levée de fonds",
    intro:
      "Des cagnottes avec un objectif (nouveaux fauteuils, tournoi à l'étranger), rangées par groupement (comité de soutien, projet). C'est à part de la trésorerie : noter un don ici n'écrit rien dans les comptes du club, le trésorier l'encode de son côté.",
    loading: "Chargement…",
    unavailable: "Levée de fonds indisponible pour le moment.",
    newGroup: "Nouveau groupement",
    groupName: "Nom du groupement",
    groupNameHint: "Ex. Comité de soutien, Projet fauteuils 2027",
    description: "Description",
    newPot: "Nouvelle cagnotte",
    potName: "Nom de la cagnotte",
    goal: "Objectif (€)",
    deadline: "Échéance",
    status: "Statut",
    open: "Ouverte",
    closed: "Clôturée",
    save: "Enregistrer",
    cancel: "Annuler",
    edit: "Modifier",
    close: "Fermer",
    saved: "Enregistré.",
    noGroup: "Aucun groupement pour l'instant.",
    noPot: "Aucune cagnotte dans ce groupement.",
    raised: "{raised} récoltés sur {goal}",
    left: "Reste {left}",
    reached: "Objectif atteint",
    spent: "{spent} de dépenses déduites",
    until: "jusqu'au {d}",
    movements: "Mouvements",
    addMovement: "Noter un mouvement",
    date: "Date",
    kind: "Type",
    kinds: {
      donation: "Don",
      sponsor: "Sponsor",
      action: "Action (vente, souper…)",
      subsidy: "Subside",
      expense: "Dépense de l'action",
    } as Record<string, string>,
    label: "Libellé",
    amount: "Montant (€)",
    donor: "Donateur (facultatif)",
    anonymous: "Ne pas afficher le nom",
    anonymousName: "Anonyme",
    remove: "Annuler",
    cancelled: "annulé",
    publicTitle: "Page publique",
    publicHint:
      "Une page à partager avec les sponsors : l'objectif et la progression, jamais les donateurs.",
    publish: "Publier la page",
    unpublish: "Retirer la page",
    copyLink: "Copier le lien",
    copied: "Lien copié.",
    actions: "Actions menées",
    archived: "Archivé",
  },
  nl: {
    playersJoin: "De spelers doen mee",
    playersJoinHint: "Elke speler (of zijn gezin) ziet de pot in zijn omgeving, ziet wie wat binnenbracht en noteert zelf wat hij inzamelde.",
    withPlayers: "Met de spelers",
    team: "Team",
    wholeClub: "Hele club",
    teamHint: "Een teampot wordt alleen aan de spelers van dat team aangeboden.",
    collectors: "Wie bracht wat binnen",
    noCollector: "Nog niemand noteerde een inzameling.",
    collector: "Ingezameld door",
    mine: "Wat ik inzamelde",
    collect: "Noteren wat ik inzamelde",
    forWhom: "Voor",
    collectHint: "Een gift, een sponsor, een verkoop: noteer het hier, de club ziet het meteen.",
    collected: "Genoteerd.",
    potsForMe: "Mijn potten",
    potsForMeIntro: "De potten van de club waaraan de spelers meedoen. Noteer wat u inzamelde en volg waar het team staat.",
    nothingForMe: "Nog geen pot open voor de spelers.",
    title: "Fondsenwerving",
    intro:
      "Potten met een doel (nieuwe rolstoelen, toernooi in het buitenland), per groepering (steuncomité, project). Los van de boekhouding: een gift hier noteren schrijft niets in de rekeningen van de club, de penningmeester boekt het zelf.",
    loading: "Laden…",
    unavailable: "Fondsenwerving momenteel niet beschikbaar.",
    newGroup: "Nieuwe groepering",
    groupName: "Naam van de groepering",
    groupNameHint: "Bv. Steuncomité, Project rolstoelen 2027",
    description: "Beschrijving",
    newPot: "Nieuwe pot",
    potName: "Naam van de pot",
    goal: "Doel (€)",
    deadline: "Einddatum",
    status: "Status",
    open: "Open",
    closed: "Afgesloten",
    save: "Opslaan",
    cancel: "Annuleren",
    edit: "Wijzigen",
    close: "Sluiten",
    saved: "Opgeslagen.",
    noGroup: "Nog geen groepering.",
    noPot: "Geen pot in deze groepering.",
    raised: "{raised} ingezameld van {goal}",
    left: "Nog {left}",
    reached: "Doel bereikt",
    spent: "{spent} aan kosten afgetrokken",
    until: "tot {d}",
    movements: "Bewegingen",
    addMovement: "Beweging noteren",
    date: "Datum",
    kind: "Type",
    kinds: {
      donation: "Gift",
      sponsor: "Sponsor",
      action: "Actie (verkoop, eetfestijn…)",
      subsidy: "Subsidie",
      expense: "Kost van de actie",
    },
    label: "Omschrijving",
    amount: "Bedrag (€)",
    donor: "Schenker (optioneel)",
    anonymous: "Naam niet tonen",
    anonymousName: "Anoniem",
    remove: "Annuleren",
    cancelled: "geannuleerd",
    publicTitle: "Openbare pagina",
    publicHint:
      "Een pagina om met sponsors te delen: het doel en de vooruitgang, nooit de schenkers.",
    publish: "Pagina publiceren",
    unpublish: "Pagina intrekken",
    copyLink: "Link kopiëren",
    copied: "Link gekopieerd.",
    actions: "Gevoerde acties",
    archived: "Gearchiveerd",
  },
  en: {
    playersJoin: "The players take part",
    playersJoinHint: "Each player (or their family) sees the pot in their space, sees who brought what and notes what they collected themselves.",
    withPlayers: "With the players",
    team: "Team",
    wholeClub: "Whole club",
    teamHint: "A team pot is offered to that team’s players only.",
    collectors: "Who brought what",
    noCollector: "Nobody has noted a collection yet.",
    collector: "Collected by",
    mine: "What I collected",
    collect: "Note what I collected",
    forWhom: "For",
    collectHint: "A gift received, a sponsor found, a sale: note it here, the club sees it at once.",
    collected: "Noted.",
    potsForMe: "My pots",
    potsForMeIntro: "The club pots the players take part in. Note what you collected and see where the team stands.",
    nothingForMe: "No pot open to the players yet.",
    title: "Fundraising",
    intro:
      "Pots with a goal (new chairs, a tournament abroad), grouped by committee or project. Kept apart from the accounts: noting a gift here writes nothing in the club ledger; the treasurer books it on their side.",
    loading: "Loading…",
    unavailable: "Fundraising unavailable right now.",
    newGroup: "New group",
    groupName: "Group name",
    groupNameHint: "E.g. Support committee, Chairs project 2027",
    description: "Description",
    newPot: "New pot",
    potName: "Pot name",
    goal: "Goal (€)",
    deadline: "Deadline",
    status: "Status",
    open: "Open",
    closed: "Closed",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    close: "Close",
    saved: "Saved.",
    noGroup: "No group yet.",
    noPot: "No pot in this group.",
    raised: "{raised} raised of {goal}",
    left: "{left} to go",
    reached: "Goal reached",
    spent: "{spent} of expenses deducted",
    until: "until {d}",
    movements: "Movements",
    addMovement: "Note a movement",
    date: "Date",
    kind: "Type",
    kinds: {
      donation: "Gift",
      sponsor: "Sponsor",
      action: "Event (sale, dinner…)",
      subsidy: "Subsidy",
      expense: "Event expense",
    },
    label: "Label",
    amount: "Amount (€)",
    donor: "Donor (optional)",
    anonymous: "Do not show the name",
    anonymousName: "Anonymous",
    remove: "Cancel",
    cancelled: "cancelled",
    publicTitle: "Public page",
    publicHint: "A page to share with sponsors: goal and progress, never the donors.",
    publish: "Publish the page",
    unpublish: "Withdraw the page",
    copyLink: "Copy link",
    copied: "Link copied.",
    actions: "Events held",
    archived: "Archived",
  },
};
type View = Awaited<ReturnType<typeof fundraisingView>>;
type Pot = View["pots"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
export const euro = (l: Locale, cents: number) =>
  new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const cents = (v: FormDataEntryValue | null) =>
  Math.round(Number(String(v ?? "").replace(",", ".") || 0) * 100);

export function PotProgress({
  locale,
  goal,
  progress,
}: {
  locale: Locale;
  goal: number;
  progress: { net: number; spent: number; left: number; percent: number; reached: boolean };
}) {
  const t = fundraisingCopy[locale] as (typeof fundraisingCopy)["fr"];
  return (
    <div className="pot-progress">
      <progress max={100} value={progress.percent} aria-label={`${progress.percent} %`} />
      <p>
        <strong>
          {t.raised.replace("{raised}", euro(locale, Math.max(0, progress.net))).replace("{goal}", euro(locale, goal))}
        </strong>{" "}
        · {progress.reached ? <Badge tone="success">{t.reached}</Badge> : t.left.replace("{left}", euro(locale, progress.left))}
      </p>
      {progress.spent > 0 && <p className="muted small">{t.spent.replace("{spent}", euro(locale, progress.spent))}</p>}
    </div>
  );
}

function Collectors({ pot, t, locale }: { pot: Pot; t: (typeof fundraisingCopy)["fr"]; locale: Locale }) {
  return (
    <div className="collectors">
      <h4 className="card-subtitle">{t.collectors}</h4>
      {pot.collectors.length ? (
        <ol className="collector-list">
          {pot.collectors.map((c, i) => (
            <li key={c.profile_id}>
              <span className="collector-rank" aria-hidden="true">{i + 1}</span>
              <span className="collector-name">{c.name}</span>
              <strong className="num">{euro(locale, c.cents)}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">{t.noCollector}</p>
      )}
    </div>
  );
}
function CollectForm({
  pot,
  t,
  locale,
  busy,
  send,
  own,
}: {
  pot: Pot;
  t: (typeof fundraisingCopy)["fr"];
  locale: Locale;
  busy: boolean;
  send: (body: Record<string, unknown>, done?: string) => Promise<boolean>;
  own: { id: string; full_name: string }[];
}) {
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const mine = pot.own_movements.filter((m) => !m.cancelled_at);
  return (
    <details className="collect-box" open={mine.length === 0}>
      <summary>{t.mine} · {euro(locale, mine.reduce((n, m) => n + m.amount_cents, 0))}</summary>
      {mine.length > 0 && (
        <ul className="movement-list">
          {mine.map((m) => (
            <li key={m.id}>
              <span>
                {day(m.occurred_on)} · {t.kinds[m.kind]} · {m.label}
                {m.donor && ` · ${m.donor}`}
                {own.length > 1 && m.collector && ` · ${m.collector}`}
              </span>
              <strong className="num">{euro(locale, m.amount_cents)}</strong>
              <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "cancelMovement", id: m.id })}>
                {t.remove}
                <span className="sr-only"> : {m.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t.collectHint}</p>
      <form
        className="inline-form movement-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          void send(
            {
              action: "collect",
              potId: pot.id,
              profileId: String(f.get("profile") ?? own[0]?.id),
              occurredOn: String(f.get("date")),
              kind: String(f.get("kind")),
              label: String(f.get("label") ?? ""),
              amountCents: cents(f.get("amount")),
              donor: String(f.get("donor") ?? ""),
            },
            t.collected,
          ).then((ok) => ok && form.reset());
        }}
      >
        {own.length > 1 && (
          <label>
            {t.forWhom}
            <select name="profile" defaultValue={own[0].id}>
              {own.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t.date}
          <input name="date" type="date" required defaultValue={brusselsToday()} />
        </label>
        <label>
          {t.kind}
          <select name="kind" defaultValue="donation">
            {(["donation", "sponsor", "action"] as const).map((k) => (
              <option key={k} value={k}>{t.kinds[k]}</option>
            ))}
          </select>
        </label>
        <label>
          {t.label}
          <input name="label" required minLength={2} maxLength={160} />
        </label>
        <label>
          {t.amount}
          <input name="amount" required inputMode="decimal" />
        </label>
        <label>
          {t.donor}
          <input name="donor" maxLength={160} />
        </label>
        <button className="button" disabled={busy}>{t.collect}</button>
      </form>
    </details>
  );
}

export function Fundraising({ locale }: { locale: Locale }) {
  const t = fundraisingCopy[locale] as (typeof fundraisingCopy)["fr"];
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const { data, error, setError, reload } = useData<View>("/api/fundraising", failure);
  const { busy, message, post } = usePost("/api/fundraising", reload, setError, failure);
  const [editing, setEditing] = useState<string | null>(null),
    [copied, setCopied] = useState("");
  // The team chosen in the top bar (wave 15): its pots and the whole-club ones.
  const team = useScope().teamId;
  if (!data)
    return (
      <main id="main" className="access fundraising">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const org = data.organization_id;
  const send = (body: Record<string, unknown>) => post({ organizationId: org, ...body }, t.saved);
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

  function groupForm(g?: View["groups"][number]) {
    return (
      <form
        className="inline-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send({
            action: "group",
            ...(g ? { id: g.id } : {}),
            name: String(f.get("name") ?? ""),
            description: String(f.get("description") ?? ""),
            archived: f.get("archived") === "on",
          }).then((ok) => ok && setEditing(null));
        }}
      >
        <label>
          {t.groupName}
          <input name="name" required minLength={2} maxLength={120} defaultValue={g?.name} placeholder={t.groupNameHint} />
        </label>
        <label>
          {t.description}
          <input name="description" maxLength={2000} defaultValue={g?.description} />
        </label>
        {g && (
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={g.archived} />
            {t.archived}
          </label>
        )}
        <button className="button" disabled={busy}>{t.save}</button>
        <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
      </form>
    );
  }
  function potForm(groupId: string, pot?: Pot) {
    return (
      <form
        className="pot-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send({
            action: "pot",
            ...(pot ? { id: pot.id } : {}),
            groupId,
            name: String(f.get("name") ?? ""),
            description: String(f.get("description") ?? ""),
            goalCents: cents(f.get("goal")),
            deadline: String(f.get("deadline") ?? "") || null,
            status: String(f.get("status") ?? "open"),
            playersJoin: f.get("playersJoin") === "on",
            linkUrl: String(f.get("linkUrl") ?? "").trim(),
            ...(data?.teams.length ? { teamId: String(f.get("teamId") ?? "") || null } : {}),
          }).then((ok) => ok && setEditing(null));
        }}
      >
        <div className="form-grid">
          <label>
            {t.potName}
            <input name="name" required minLength={2} maxLength={120} defaultValue={pot?.name} />
          </label>
          <label>
            {t.goal}
            <input name="goal" required inputMode="decimal" defaultValue={pot ? String(pot.goal_cents / 100) : ""} />
          </label>
          <label>
            {t.deadline}
            <input name="deadline" type="date" defaultValue={pot?.deadline ?? ""} />
          </label>
          <label>
            {t.status}
            <select name="status" defaultValue={pot?.status ?? "open"}>
              <option value="open">{t.open}</option>
              <option value="closed">{t.closed}</option>
            </select>
          </label>
          {(data?.teams.length ?? 0) > 0 && (
            <div>
              <label>
                {t.team}
                <select name="teamId" defaultValue={pot?.team_id ?? ""} aria-describedby="pot-team-hint">
                  <option value="">{t.wholeClub}</option>
                  {data?.teams.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </label>
              <p className="muted small" id="pot-team-hint">{t.teamHint}</p>
            </div>
          )}
        </div>
        <label>
          {t.description}
          <textarea name="description" rows={2} maxLength={2000} defaultValue={pot?.description} />
        </label>
        <label>
          {goalsCopy[locale].linkField}
          <input name="linkUrl" type="url" maxLength={500} placeholder="https://" defaultValue={pot?.link_url ?? ""} />
        </label>
        <label className="check">
          <input type="checkbox" name="playersJoin" defaultChecked={pot?.players_join} />
          {t.playersJoin}
        </label>
        <p className="muted small">{t.playersJoinHint}</p>
        <div className="actions">
          <button className="button" disabled={busy}>{t.save}</button>
          <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
        </div>
      </form>
    );
  }
  function movementForm(pot: Pot) {
    return (
      <form
        className="inline-form movement-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          void send({
            action: "movement",
            potId: pot.id,
            occurredOn: String(f.get("date")),
            kind: String(f.get("kind")),
            label: String(f.get("label") ?? ""),
            amountCents: cents(f.get("amount")),
            donor: String(f.get("donor") ?? ""),
            anonymous: f.get("anonymous") === "on",
            profileId: String(f.get("collector") ?? "") || null,
            // A4: the donor in the contact book, when the book is reachable.
            ...(f.has("donorContact") ? { contactId: String(f.get("donorContact") ?? "") || null } : {}),
          }).then((ok) => ok && form.reset());
        }}
      >
        <label>
          {t.date}
          <input name="date" type="date" required defaultValue={brusselsToday()} />
        </label>
        <label>
          {t.kind}
          <select name="kind" defaultValue="donation">
            {Object.entries(t.kinds).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          {t.label}
          <input name="label" required minLength={2} maxLength={160} />
        </label>
        <label>
          {t.amount}
          <input name="amount" required inputMode="decimal" />
        </label>
        <label>
          {t.donor}
          <input name="donor" maxLength={160} />
        </label>
        <ContactPicker locale={locale} name="donorContact" value={null} label={crmCopy[locale].donor} none={crmCopy[locale].nobody} />
        <label className="check">
          <input type="checkbox" name="anonymous" />
          {t.anonymous}
        </label>
        {pot.players_join && data && (
          <label>
            {t.collector}
            <select name="collector" defaultValue="">
              <option value="">…</option>
              {data.players
                .filter((p) => !pot.team_id || pot.team_members.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
            </select>
          </label>
        )}
        <button className="button secondary" disabled={busy}>{t.addMovement}</button>
      </form>
    );
  }
  return (
    <main id="main" className="access fundraising">
      <PageHeader title={t.title} subtitle={t.intro} actions={data.can.manage && editing !== "group" && (
          <button type="button" className="button" onClick={() => setEditing("group")}>{t.newGroup}</button>
        )} />
      {error && <p role="alert">{error}</p>}
      {(message || copied) && <p role="status">{copied || message}</p>}
      {editing === "group" && <Card label={t.newGroup}>{groupForm()}</Card>}
      {!data.can.manage && !data.can.detail && (
        <p className="muted">{t.potsForMeIntro}</p>
      )}
      {!data.groups.length && <EmptyState title={t.noGroup} />}
      {!data.can.manage && !data.can.detail && data.groups.length > 0 && !data.pots.some((p) => p.players_join) && (
        <EmptyState title={t.nothingForMe} />
      )}
      {data.groups.map((g) => {
        const pots = data.pots.filter(
          (p) => p.group_id === g.id && (data.can.manage || data.can.detail || p.players_join) && (!team || !p.team_id || p.team_id === team),
        );
        if (!pots.length && !data.can.manage) return null;
        return (
          <section key={g.id} className="panel" aria-labelledby={`group-${g.id}`}>
            <div className="panel-head">
              <h2 id={`group-${g.id}`}>
                {g.name}
                {g.archived && <span className="muted"> · {t.archived}</span>}
              </h2>
              {data.can.manage && (
                <div className="row-actions">
                  <button type="button" className="text-button" onClick={() => setEditing(`edit-${g.id}`)}>
                    {t.edit}
                    <span className="sr-only"> : {g.name}</span>
                  </button>
                  <button type="button" className="button secondary" onClick={() => setEditing(`pot-${g.id}`)}>
                    {t.newPot}
                    <span className="sr-only"> : {g.name}</span>
                  </button>
                </div>
              )}
            </div>
            {g.description && <p className="muted">{g.description}</p>}
            {editing === `edit-${g.id}` && groupForm(g)}
            {editing === `pot-${g.id}` && potForm(g.id)}
            {pots.length ? (
              <ul className="pot-list">
                {pots.map((pot) => (
                  <Card as="li" key={pot.id} className="pot-card" data={{ status: pot.status }}>
                    {editing === `potedit-${pot.id}` ? (
                      potForm(g.id, pot)
                    ) : (
                      <>
                        <div className="trip-card-head">
                          <h3>{pot.name}</h3>
                          <span>
                            {pot.team_name && (
                              <span className="team-chip" data-color={pot.team_color ?? "none"}>
                                <span className="team-dot" aria-hidden="true" />
                                {pot.team_name}
                              </span>
                            )}
                            {pot.players_join && <Badge tone="success">{t.withPlayers}</Badge>}
                            <Badge>{pot.status === "open" ? t.open : t.closed}</Badge>
                          </span>
                        </div>
                        {pot.deadline && <p className="muted small">{t.until.replace("{d}", day(pot.deadline))}</p>}
                        {pot.description && <p className="small pre-line">{pot.description}</p>}
                        <PotProgress locale={locale} goal={pot.goal_cents} progress={pot.progress} />
                        {pot.players_join && <Collectors pot={pot} t={t} locale={locale} />}
                        {/* 9: the action's link, the goals per person, the tasks given. */}
                        <PotExtras locale={locale} pot={pot} data={data} busy={busy} send={send} />
                        {pot.players_join && pot.status === "open" && data.ownProfiles.length > 0 && (
                          <CollectForm pot={pot} t={t} locale={locale} busy={busy} send={send} own={data.ownProfiles} />
                        )}
                        {data.can.detail ? (
                          <details>
                            <summary>
                              {t.movements} ({pot.movements.length})
                            </summary>
                            <ul className="movement-list">
                              {pot.movements.map((m) => (
                                <li key={m.id} data-cancelled={m.cancelled_at ? true : undefined}>
                                  <span>
                                    {day(m.occurred_on)} · {t.kinds[m.kind]} · {m.label}
                                    {m.donor && ` · ${m.anonymous ? `${t.anonymousName} (${m.donor})` : m.donor}`}
                                    {m.collector && ` · ${t.collector} ${m.collector}`}
                                    {m.cancelled_at && <span className="muted"> · {t.cancelled}</span>}
                                  </span>
                                  <strong className="num">
                                    {m.kind === "expense" ? "−" : ""}
                                    {euro(locale, m.amount_cents ?? 0)}
                                  </strong>
                                  {data.can.manage && !m.cancelled_at && m.kind === "sponsor" && (
                                    // Wave 15: a sponsor brought to a pot can be followed as a partner (sheet prefilled).
                                    <Link
                                      className="text-button"
                                      href={`/${locale}/funding/grants-sponsors?vue=sponsoring&new=1&name=${encodeURIComponent((m.donor || m.label).slice(0, 160))}&note=${encodeURIComponent(
                                        sponsorsCopy[locale].fromPot.replace("{name}", m.collector ?? "").replace("{pot}", pot.name),
                                      )}`}
                                    >
                                      {sponsorsCopy[locale].followAsPartner}
                                      <span className="sr-only"> : {m.donor || m.label}</span>
                                    </Link>
                                  )}
                                  {data.can.manage && !m.cancelled_at && (
                                    <button type="button" className="text-button" disabled={busy} onClick={() => void send({ action: "cancelMovement", id: m.id })}>
                                      {t.remove}
                                      <span className="sr-only"> : {m.label}</span>
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          pot.movements.length > 0 && (
                            <p className="small muted">
                              {t.actions} : {pot.movements.map((m) => m.label).join(", ")}
                            </p>
                          )
                        )}
                        {data.can.manage && (
                          <>
                            {pot.status === "open" && movementForm(pot)}
                            <div className="pot-public">
                              <p className="small muted">
                                <strong>{t.publicTitle}</strong> · {t.publicHint}
                              </p>
                              <div className="row-actions">
                                <button type="button" className="button secondary" disabled={busy} onClick={() => void send({ action: "publish", potId: pot.id, public: !pot.public_token })}>
                                  {pot.public_token ? t.unpublish : t.publish}
                                </button>
                                {pot.public_token && (
                                  <button
                                    type="button"
                                    className="button secondary"
                                    onClick={() => {
                                      const url = `${window.location.origin}/${locale}/cagnotte/${pot.public_token}`;
                                      void navigator.clipboard?.writeText(url).then(() => setCopied(t.copied));
                                    }}
                                  >
                                    {t.copyLink}
                                  </button>
                                )}
                                <button type="button" className="text-button" onClick={() => setEditing(`potedit-${pot.id}`)}>
                                  {t.edit}
                                  <span className="sr-only"> : {pot.name}</span>
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </Card>
                ))}
              </ul>
            ) : (
              <EmptyState title={t.noPot} />
            )}
          </section>
        );
      })}
    </main>
  );
}

/** Public page of a pot, shared with sponsors: no account, no donor. */
export function PublicPot({ locale, token }: { locale: Locale; token: string }) {
  const t = fundraisingCopy[locale] as (typeof fundraisingCopy)["fr"];
  const failure = useCallback(() => t.unavailable, [t.unavailable]);
  const { data, error } = useData<{
    name: string;
    description: string;
    goal_cents: number;
    deadline: string | null;
    status: string;
    club: string;
    group_name: string;
    progress: { net: number; spent: number; left: number; percent: number; reached: boolean };
  }>(`/api/fundraising/public?t=${encodeURIComponent(token)}`, failure);
  if (!data)
    return (
      <main id="main" className="access public-pot">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  return (
    <main id="main" className="access public-pot">
      <p className="muted">
        {data.club} · {data.group_name}
      </p>
      <h1>{data.name}</h1>
      {data.description && <p className="pre-line">{data.description}</p>}
      <PotProgress locale={locale} goal={data.goal_cents} progress={data.progress} />
      {data.deadline && (
        <p className="muted">
          {t.until.replace(
            "{d}",
            new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.deadline + "T12:00:00Z")),
          )}
        </p>
      )}
    </main>
  );
}
