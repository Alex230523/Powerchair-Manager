"use client";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { venuesView } from "@/domains/venues/service";
import { errors } from "./access-copy";
import { useData, usePost, useShowMore, ShowMore } from "./use-api";

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

export function Venues({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const failure = useCallback(
    (code: string) => errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const { data, error, setError, reload } = useData<View>("/api/venues", failure);
  const { busy, message, post } = usePost("/api/venues", reload, setError, failure);
  const [q, setQ] = useState(""),
    [must, setMust] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null);
  const venues = (data?.venues ?? []).filter(
    (v) =>
      fold(`${v.name} ${v.city} ${v.address}`).includes(fold(q.trim())) &&
      must.every((k) => v[keys.find((x) => x[0] === k)![1]] === true),
  );
  const { visible, more } = useShowMore(venues, 30);
  if (!data)
    return (
      <main id="main" className="access venues">
        <h1>{t.title}</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const day = (d: string) =>
    new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
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
          <input name="floor" maxLength={120} defaultValue={v?.floor} placeholder="Ex. parquet, synthétique" />
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
  return (
    <main id="main" className="access venues">
      <div className="directory-heading">
        <div>
          <h1>{t.title}</h1>
          <p className="muted">{t.intro}</p>
        </div>
        {data.can.edit && editing === null && (
          <button type="button" className="button" onClick={() => setEditing("new")}>{t.add}</button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {editing === "new" && <section className="panel" aria-label={t.add}>{form()}</section>}
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
            <li key={v.id} className="venue-card">
              {editing === v.id ? (
                form(v)
              ) : (
                <>
                  <div className="trip-card-head">
                    <h2>{v.name}</h2>
                    {data.can.edit && (
                      <button type="button" className="text-button" onClick={() => setEditing(v.id)}>
                        {t.edit}
                        <span className="sr-only"> : {v.name}</span>
                      </button>
                    )}
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-directory">{t.none}</p>
      )}
      <ShowMore locale={locale} {...more} />
      {data.places.some((p) => !p.shared) && (
        <section className="panel" aria-labelledby="venues-share">
          <h2 id="venues-share">{t.share}</h2>
          <p className="muted">{t.shareIntro}</p>
          <ul className="profile-list">
            {data.places
              .filter((p) => !p.shared)
              .map((p) => (
                <li key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <p className="muted small">{p.address}</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || p.address.trim().length < 2}
                    onClick={() => void post({ action: "shareFromPlace", placeId: p.id }, t.shared)}
                  >
                    {t.shareOne}
                    <span className="sr-only"> : {p.name}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
