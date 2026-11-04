"use client";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { venuesView } from "@/domains/venues/service";
import { errors } from "./access-copy";
import { useData, usePost, useShowMore, ShowMore } from "./use-api";
import { Badge, Button, EmptyState, PageHeader, Card, Tabs } from "./ui";
import { VenueBookings } from "./venue-bookings";
import { Modal } from "./modal";
import { PlaceDialog } from "./place-dialog";
import { placesCopy } from "./places-copy";
import { currentRates, type PlaceCategory, type PlaceRow } from "@/domains/venues/schema";

const copy = {
  fr: {
    title: "Annuaire des salles",
    intro:
      "Les salles où l'on joue au powerchair football, partagées entre tous les clubs : accès de plain-pied, toilettes adaptées, vestiaires, recharge des fauteuils. Avant un déplacement, on sait à quoi s'attendre.",
    loading: "Chargement…",
    unavailable: "Annuaire indisponible pour le moment.",
    search: "Rechercher (nom, ville)",
    filters: "Doit avoir",
    add: "Ajouter une salle",
    close: "Fermer",
    edit: "Compléter",
    save: "Enregistrer",
    saved: "Salle enregistrée.",
    none: "Aucune salle ne correspond.",
    yes: "oui",
    no: "non",
    unknown: "inconnu",
    unknownHint: "« Inconnu » ne veut pas dire « non » : complétez si vous savez.",
    name: "Nom",
    address: "Adresse",
    city: "Ville",
    phone: "Téléphone",
    website: "Site web",
    door: "Largeur de porte la plus étroite (cm)",
    floor: "Sol",
    court: "Terrain (dimensions, marquage)",
    notes: "Remarques (accès, horaires, clé…)",
    checkedOn: "Vérifié sur place le",
    checked: "vérifié le {d}",
    addedBy: "ajoutée par {c}",
    share: "Partager nos lieux",
    shareIntro: "Vos lieux du calendrier qui ne sont pas encore dans l'annuaire.",
    shareOne: "Partager",
    shared: "Lieu partagé dans l'annuaire.",
    criteria: {
      stepFree: "Accès de plain-pied",
      adaptedToilets: "Toilettes adaptées",
      changingRooms: "Vestiaires accessibles",
      showers: "Douches accessibles",
      lift: "Ascenseur",
      hoist: "Lève-personne",
      parking: "Parking adapté",
      charging: "Recharge des fauteuils",
    } as Record<string, string>,
  },
  nl: {
    title: "Zalengids",
    intro:
      "De zalen waar powerchair football gespeeld wordt, gedeeld tussen alle clubs: drempelvrije toegang, aangepaste toiletten, kleedkamers, laden van de rolstoelen. Voor een verplaatsing weet u wat u kunt verwachten.",
    loading: "Laden…",
    unavailable: "Gids momenteel niet beschikbaar.",
    search: "Zoeken (naam, stad)",
    filters: "Moet hebben",
    add: "Zaal toevoegen",
    close: "Sluiten",
    edit: "Aanvullen",
    save: "Opslaan",
    saved: "Zaal opgeslagen.",
    none: "Geen zaal gevonden.",
    yes: "ja",
    no: "nee",
    unknown: "onbekend",
    unknownHint: "„Onbekend” betekent niet „nee”: vul aan als u het weet.",
    name: "Naam",
    address: "Adres",
    city: "Stad",
    phone: "Telefoon",
    website: "Website",
    door: "Smalste deurbreedte (cm)",
    floor: "Vloer",
    court: "Terrein (afmetingen, belijning)",
    notes: "Opmerkingen (toegang, uren, sleutel…)",
    checkedOn: "Ter plaatse nagekeken op",
    checked: "nagekeken op {d}",
    addedBy: "toegevoegd door {c}",
    share: "Onze locaties delen",
    shareIntro: "Uw kalenderlocaties die nog niet in de gids staan.",
    shareOne: "Delen",
    shared: "Locatie gedeeld in de gids.",
    criteria: {
      stepFree: "Drempelvrije toegang",
      adaptedToilets: "Aangepaste toiletten",
      changingRooms: "Toegankelijke kleedkamers",
      showers: "Toegankelijke douches",
      lift: "Lift",
      hoist: "Tillift",
      parking: "Aangepaste parking",
      charging: "Laden van de rolstoelen",
    },
  },
  en: {
    title: "Hall directory",
    intro:
      "Halls where powerchair football is played, shared by every club: step-free access, adapted toilets, changing rooms, chair charging. Before a trip, you know what to expect.",
    loading: "Loading…",
    unavailable: "Directory unavailable right now.",
    search: "Search (name, city)",
    filters: "Must have",
    add: "Add a hall",
    close: "Close",
    edit: "Complete",
    save: "Save",
    saved: "Hall saved.",
    none: "No hall matches.",
    yes: "yes",
    no: "no",
    unknown: "unknown",
    unknownHint: "\"Unknown\" does not mean \"no\": fill it in if you know.",
    name: "Name",
    address: "Address",
    city: "City",
    phone: "Phone",
    website: "Website",
    door: "Narrowest door width (cm)",
    floor: "Floor",
    court: "Court (size, markings)",
    notes: "Notes (access, opening hours, key…)",
    checkedOn: "Checked on site on",
    checked: "checked on {d}",
    addedBy: "added by {c}",
    share: "Share our places",
    shareIntro: "Your calendar places not yet in the directory.",
    shareOne: "Share",
    shared: "Place shared in the directory.",
    criteria: {
      stepFree: "Step-free access",
      adaptedToilets: "Adapted toilets",
      changingRooms: "Accessible changing rooms",
      showers: "Accessible showers",
      lift: "Lift",
      hoist: "Hoist",
      parking: "Adapted parking",
      charging: "Chair charging",
    },
  },
};
type View = Awaited<ReturnType<typeof venuesView>>;
type Venue = View["venues"][number];
const keys = [
  ["stepFree", "step_free"],
  ["adaptedToilets", "adapted_toilets"],
  ["changingRooms", "changing_rooms"],
  ["showers", "showers"],
  ["lift", "lift"],
  ["hoist", "hoist"],
  ["parking", "parking"],
  ["charging", "charging"],
] as const;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr");

const shareTone = { private: "neutral", pending: "warning", approved: "success", refused: "danger" } as const;
const euro = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * Wave 17 (C4): « Lieux ». Two tabs by category; in each, the club's places
 * (private sheet, dated rates, sharing) then the federation's shared
 * directory. The federation sees the clubs' proposals and decides.
 */
export function Venues({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const pc = placesCopy[locale];
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const { data, error, setError, reload } = useData<View>("/api/venues", failure);
  const { busy, message, post } = usePost("/api/venues", reload, setError, failure);
  const [q, setQ] = useState(""),
    [must, setMust] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [tab, setTab] = useState<PlaceCategory>("training"),
    [dialog, setDialog] = useState<PlaceRow | "new" | null>(null),
    [rateFor, setRateFor] = useState<PlaceRow | null>(null),
    [deciding, setDeciding] = useState<null | { kind: "refuse" | "withdraw"; id: string; name: string }>(null);
  const venues = (data?.venues ?? []).filter(
    (v) =>
      v.category === tab &&
      fold(`${v.name} ${v.city} ${v.address}`).includes(fold(q.trim())) &&
      must.every((k) => v[keys.find((x) => x[0] === k)![1]] === true),
  );
  const { visible, more } = useShowMore(venues, 30);
  if (!data)
    return (
      <main id="main" className="access venues">
        <PageHeader title={pc.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const send = (body: Record<string, unknown>, done: string) => post({ ...body, organizationId: data.organization_id }, done);
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
  const club = data.kind === "club";
  const federation = data.kind === "federation";
  function submit(e: FormEvent<HTMLFormElement>, v?: Venue) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const tri = (k: string) => (s(k) === "yes" ? true : s(k) === "no" ? false : null);
    void post(
      {
        action: "save",
        ...(v ? { id: v.id, version: v.version } : {}),
        name: s("name"),
        address: s("address"),
        city: s("city"),
        phone: s("phone"),
        website: s("website"),
        ...Object.fromEntries(keys.map(([k]) => [k, tri(k)])),
        doorWidthCm: s("door") ? Number(s("door")) : null,
        floor: s("floor"),
        court: s("court"),
        notes: s("notes"),
        checkedOn: s("checkedOn") || null,
      },
      t.saved,
    ).then((ok) => ok && setEditing(null));
  }
  const form = (v?: Venue) => (
    <form className="venue-form" onSubmit={(e) => submit(e, v)}>
      <div className="form-grid">
        <label>
          {t.name}
          <input name="name" required minLength={2} maxLength={120} defaultValue={v?.name} />
        </label>
        <label>
          {t.address}
          <input name="address" required minLength={2} maxLength={500} defaultValue={v?.address} />
        </label>
        <label>
          {t.city}
          <input name="city" maxLength={120} defaultValue={v?.city} />
        </label>
        <label>
          {t.phone}
          <input name="phone" maxLength={60} defaultValue={v?.phone} />
        </label>
        <label>
          {t.website}
          <input name="website" type="url" maxLength={300} defaultValue={v?.website} placeholder="https://" />
        </label>
        <label>
          {t.door}
          <input name="door" type="number" min={40} max={400} defaultValue={v?.door_width_cm ?? ""} />
        </label>
        <label>
          {t.floor}
          <input name="floor" maxLength={120} defaultValue={v?.floor} />
        </label>
        <label>
          {t.court}
          <input name="court" maxLength={200} defaultValue={v?.court} />
        </label>
        <label>
          {t.checkedOn}
          <input name="checkedOn" type="date" defaultValue={v?.checked_on ?? ""} />
        </label>
      </div>
      <fieldset className="access-answers">
        <legend>{t.unknownHint}</legend>
        {keys.map(([k, col]) => (
          <label key={k}>
            {t.criteria[k]}
            <select name={k} defaultValue={v?.[col] === true ? "yes" : v?.[col] === false ? "no" : ""}>
              <option value="">{t.unknown}</option>
              <option value="yes">{t.yes}</option>
              <option value="no">{t.no}</option>
            </select>
          </label>
        ))}
      </fieldset>
      <label>
        {t.notes}
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={v?.notes} />
      </label>
      <div className="actions">
        <button className="button" disabled={busy}>{t.save}</button>
        <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.close}</button>
      </div>
    </form>
  );
  const answer = (v: boolean | null) => (v === true ? t.yes : v === false ? t.no : t.unknown);
  const ours = data.places.filter((p) => p.category === tab);
  const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
  return (
    <main id="main" className="access venues">
      <PageHeader
        title={pc.title}
        subtitle={pc.intro}
        actions={
          club && data.can.edit ? (
            <Button icon="plus" onClick={() => setDialog("new")}>
              {pc.add}
            </Button>
          ) : federation && data.can.edit && editing === null ? (
            <button type="button" className="button" onClick={() => setEditing("new")}>{t.add}</button>
          ) : undefined
        }
      />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {federation && (
        <Card title={pc.proposals} labelledBy="venue-proposals" headingId="venue-proposals">
          <p className="muted">{pc.proposalsIntro}</p>
          {data.proposals.length ? (
            <ul className="profile-list proposal-list">
              {data.proposals.map((x) => (
                <li key={x.id}>
                  <div>
                    <strong>{x.name}</strong>
                    <p className="muted small">
                      {x.address} · {pc.categories[x.category as PlaceCategory]} · {fill(pc.fromClub, { club: x.club })}
                    </p>
                    <p className="small">
                      {(["accessible", "toilets", "parking", "charging"] as const)
                        .filter((k) => x[k])
                        .map((k) => pc.access[k])
                        .join(" · ")}
                    </p>
                  </div>
                  {data.can.decide && (
                    <div className="row-actions">
                      <Button size="sm" icon="check" disabled={busy} aria-label={fill(pc.approveOf, { name: x.name })} onClick={() => void send({ action: "decide", placeId: x.id, approve: true }, pc.decided)}>
                        {pc.approve}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busy} aria-label={fill(pc.refuseOf, { name: x.name })} onClick={() => setDeciding({ kind: "refuse", id: x.id, name: x.name })}>
                        {pc.refuse}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={pc.noProposal} />
          )}
        </Card>
      )}
      {editing === "new" && <Card label={t.add}>{form()}</Card>}
      <Tabs
        label={pc.tabs}
        items={(["training", "other"] as const).map((c) => ({ id: c, label: pc.categories[c] }))}
        value={tab}
        onChange={(v) => setTab(v as PlaceCategory)}
        idPrefix="places-tab"
        panelId={(v) => `places-panel-${v}`}
      />
      <div role="tabpanel" id={`places-panel-${tab}`} aria-labelledby={`places-tab-${tab}`} className="places-panel">
        <p className="muted">{pc.categoryHints[tab]}</p>
        {club && (
          <section aria-labelledby="places-ours">
            <h2 id="places-ours">{pc.ours}</h2>
            {ours.length ? (
              <ul className="venue-list">
                {ours.map((x) => {
                  const now = currentRates(x.rates, data.today);
                  return (
                    <Card as="li" key={x.id} className="venue-card place-card">
                      <div className="trip-card-head">
                        <h3>{x.name}</h3>
                        <span className="place-badges">
                          {x.home && <Badge tone="info">{pc.homeBadge}</Badge>}
                          <Badge tone={shareTone[x.share_status]}>{pc.share[x.share_status]}</Badge>
                          {x.archived && <Badge tone="neutral">{pc.archived}</Badge>}
                        </span>
                      </div>
                      <p className="muted">{x.address}</p>
                      {x.share_status === "refused" && x.share_reason && <p className="small">{fill(pc.refusedBecause, { reason: x.share_reason })}</p>}
                      <p className="small">
                        {(["accessible", "toilets", "parking", "storage", "charging"] as const)
                          .filter((k) => x[k])
                          .map((k) => pc.access[k])
                          .join(" · ")}
                        {x.capacity ? ` · ${pc.capacity.split(" (")[0]} : ${x.capacity}` : ""}
                      </p>
                      {data.can.edit && (
                        <dl className="facts">
                          <dt>{pc.contact}</dt>
                          <dd>{x.contact_name ? [x.contact_name, x.contact_phone, x.contact_email].filter(Boolean).join(" · ") : x.contact || pc.noContact}</dd>
                          {x.food_policy && (
                            <>
                              <dt>{pc.food}</dt>
                              <dd>{x.food_policy}</dd>
                            </>
                          )}
                          {x.notes && (
                            <>
                              <dt>{pc.notes}</dt>
                              <dd className="pre-line">{x.notes}</dd>
                            </>
                          )}
                        </dl>
                      )}
                      {data.can.edit && (
                        <div className="place-rates">
                          <h4>{pc.rates}</h4>
                          {x.rates.length ? (
                            <ul className="plain-list">
                              {x.rates.map((r) => (
                                <li key={r.id} data-current={now.has(r.id) || undefined}>
                                  <strong>{r.label}</strong> · {euro(locale, r.amount_cents)}
                                  {r.unit ? ` / ${r.unit}` : ""} · {pc.rateFrom.toLowerCase()} {day(r.valid_from)}{" "}
                                  {now.has(r.id) && <Badge tone="success">{pc.current}</Badge>}
                                  <span className="muted small"> · {fill(pc.rateAdded, { date: day(r.created_at), name: r.created_by_name })}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted small">{pc.noRate}</p>
                          )}
                        </div>
                      )}
                      {data.can.edit && (
                        <div className="row-actions">
                          <Button size="sm" variant="secondary" aria-label={fill(pc.editOf, { name: x.name })} onClick={() => setDialog(x)}>
                            {pc.edit}
                          </Button>
                          <Button size="sm" variant="secondary" aria-label={fill(pc.addRateOf, { name: x.name })} onClick={() => setRateFor(x)}>
                            {pc.addRate}
                          </Button>
                          {(x.share_status === "private" || x.share_status === "refused") && data.federation && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy || x.address.trim().length < 2}
                              aria-label={fill(pc.proposeOf, { name: x.name })}
                              title={pc.sharedHint}
                              onClick={() => void send({ action: "proposeShare", placeId: x.id }, pc.proposed)}
                            >
                              {pc.propose}
                            </Button>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={pc.noPlace} />
            )}
          </section>
        )}
        <section aria-labelledby="places-directory">
          <h2 id="places-directory">{pc.directory}</h2>
          <p className="muted">{pc.directoryIntro}</p>
          <div className="filters venue-filters">
            <label htmlFor="venue-q">
              {t.search}
              <input id="venue-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <fieldset>
              <legend>{t.filters}</legend>
              {(["stepFree", "adaptedToilets", "changingRooms", "charging", "parking", "hoist"] as const).map((k) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={must.includes(k)} onChange={() => setMust(must.includes(k) ? must.filter((x) => x !== k) : [...must, k])} />
                  {t.criteria[k]}
                </label>
              ))}
            </fieldset>
          </div>
          {visible.length ? (
            <ul className="venue-list">
              {visible.map((v) => (
                <Card as="li" key={v.id} className="venue-card">
                  {editing === v.id ? (
                    form(v)
                  ) : (
                    <>
                      <div className="trip-card-head">
                        <h3>{v.name}</h3>
                        <span className="row-actions">
                          {data.can.edit && (federation || v.own) && (
                            <button type="button" className="text-button" onClick={() => setEditing(v.id)}>
                              {t.edit}
                              <span className="sr-only"> : {v.name}</span>
                            </button>
                          )}
                          {data.can.decide && (
                            <button type="button" className="text-button" aria-label={fill(pc.withdrawOf, { name: v.name })} onClick={() => setDeciding({ kind: "withdraw", id: v.id, name: v.name })}>
                              {pc.withdraw}
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="muted">
                        {[v.address, v.city].filter(Boolean).join(", ")}
                        {v.phone && ` · ${v.phone}`}
                        {v.website && (
                          <>
                            {" · "}
                            <a href={v.website} rel="noopener noreferrer" target="_blank">{t.website}</a>
                          </>
                        )}
                      </p>
                      <ul className="access-badges" aria-label={t.filters}>
                        {keys.map(([k, col]) => (
                          <li key={k} data-ok={v[col] === null ? undefined : String(v[col])}>
                            {t.criteria[k]} : {answer(v[col])}
                          </li>
                        ))}
                      </ul>
                      <p className="small muted">
                        {[
                          v.door_width_cm && `${t.door.split(" (")[0]} : ${v.door_width_cm} cm`,
                          v.floor && `${t.floor} : ${v.floor}`,
                          v.court && `${t.court.split(" (")[0]} : ${v.court}`,
                          v.checked_on && t.checked.replace("{d}", day(v.checked_on)),
                          v.added_by && t.addedBy.replace("{c}", v.added_by),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {v.notes && <p className="small pre-line">{v.notes}</p>}
                    </>
                  )}
                </Card>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.none} />
          )}
          <ShowMore locale={locale} {...more} />
        </section>
      </div>
      {dialog && (
        <PlaceDialog
          locale={locale}
          place={dialog === "new" ? undefined : dialog}
          category={tab}
          close={() => setDialog(null)}
          saved={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}
      {rateFor && (
        <Modal title={fill(pc.addRateOf, { name: rateFor.name })} close={() => setRateFor(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send(
                {
                  action: "addRate",
                  placeId: rateFor.id,
                  label: String(f.get("label") ?? ""),
                  amountCents: Math.round(Number(String(f.get("amount") ?? "0").replace(",", ".")) * 100),
                  unit: String(f.get("unit") ?? ""),
                  validFrom: String(f.get("from") ?? ""),
                },
                pc.saved,
              ).then((ok) => ok && setRateFor(null));
            }}
          >
            <label>
              {pc.rateLabel}
              <input name="label" required minLength={2} maxLength={120} />
            </label>
            <label>
              {pc.rateAmount}
              <input name="amount" required inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" />
            </label>
            <label>
              {pc.rateUnit}
              <input name="unit" maxLength={40} />
            </label>
            <label>
              {pc.rateFrom}
              <input name="from" type="date" required defaultValue={data.today} />
            </label>
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {pc.addRate}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setRateFor(null)}>
                {pc.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {deciding && (
        <Modal title={fill(deciding.kind === "refuse" ? pc.refuseOf : pc.withdrawOf, { name: deciding.name })} close={() => setDeciding(null)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
              void send(
                deciding.kind === "refuse" ? { action: "decide", placeId: deciding.id, approve: false, reason } : { action: "withdraw", venueId: deciding.id, reason },
                deciding.kind === "refuse" ? pc.decided : pc.withdrawn,
              ).then((ok) => ok && setDeciding(null));
            }}
          >
            <label>
              {pc.reason}
              <textarea name="reason" required minLength={3} maxLength={1000} />
            </label>
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {deciding.kind === "refuse" ? pc.refuse : pc.withdraw}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDeciding(null)}>
                {pc.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {/* 18: the halls' bookings of the season, worked out from the calendar. */}
      {club && data.can.edit && <VenueBookings locale={locale} />}
    </main>
  );
}
