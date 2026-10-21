"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import {
  listBooks,
  openBook,
  removeBook,
  type BookMeta,
} from "@/lib/offline-book";
import { EmptyState, PageHeader, Card } from "./ui";

const copy = {
  fr: {
    title: "Carnet hors ligne",
    intro:
      "Les carnets de déplacement préparés sur cet appareil. Ils s'ouvrent sans réseau, avec le code choisi lors de la préparation.",
    none: "Aucun carnet sur cet appareil. Préparez-le depuis la page du déplacement, avant de partir.",
    code: "Code",
    open: "Ouvrir",
    close: "Fermer le carnet",
    remove: "Effacer de cet appareil",
    wrong: "Code incorrect. Encore {n} essais avant effacement.",
    erased: "Trop d'essais : le carnet a été effacé de cet appareil.",
    expired: "Ce déplacement est terminé : le carnet a été effacé.",
    until: "gardé jusqu'au {d}",
    meeting: "Départ",
    back: "Retour",
    accommodation: "Hébergement",
    emergency: "Urgences sur place",
    contact: "Contact du club",
    people: "Personnes",
    vehicles: "Véhicules",
    schedule: "Planning",
    driver: "Chauffeur",
    passengers: "Passagers",
    needs: "Besoins",
    support: "Accompagnement",
    safety: "Sécurité",
    emergencyContact: "Contact d'urgence",
    care: "Consignes de soin",
    health: "Santé (confidentiel)",
    impairment: "Pathologie",
    medical: "Notes médicales",
    generated: "Préparé le {d}",
    roles: { player: "Joueur", coach: "Coach", staff: "Staff", assistant: "Accompagnant", guardian: "Parent" } as Record<string, string>,
    chairs: { none: "", powerchair: "Fauteuil électrique", manual: "Fauteuil manuel", both: "Fauteuils électrique et manuel" } as Record<string, string>,
    moments: { morning: "Matin", midday: "Midi", evening: "Soir", night: "Nuit", before_play: "Avant le jeu", after_play: "Après le jeu", as_needed: "Au besoin" } as Record<string, string>,
  },
  nl: {
    title: "Offline boekje",
    intro:
      "De verplaatsingsboekjes die op dit toestel werden voorbereid. Ze openen zonder netwerk, met de code die bij de voorbereiding werd gekozen.",
    none: "Geen boekje op dit toestel. Bereid het voor via de pagina van de verplaatsing, voor het vertrek.",
    code: "Code",
    open: "Openen",
    close: "Boekje sluiten",
    remove: "Van dit toestel wissen",
    wrong: "Foute code. Nog {n} pogingen voor het wissen.",
    erased: "Te veel pogingen: het boekje werd van dit toestel gewist.",
    expired: "Deze verplaatsing is voorbij: het boekje werd gewist.",
    until: "bewaard tot {d}",
    meeting: "Vertrek",
    back: "Terugkeer",
    accommodation: "Verblijf",
    emergency: "Noodgevallen ter plaatse",
    contact: "Contact van de club",
    people: "Personen",
    vehicles: "Voertuigen",
    schedule: "Planning",
    driver: "Chauffeur",
    passengers: "Passagiers",
    needs: "Noden",
    support: "Begeleiding",
    safety: "Veiligheid",
    emergencyContact: "Noodcontact",
    care: "Zorginstructies",
    health: "Gezondheid (vertrouwelijk)",
    impairment: "Aandoening",
    medical: "Medische notities",
    generated: "Voorbereid op {d}",
    roles: { player: "Speler", coach: "Coach", staff: "Staf", assistant: "Begeleider", guardian: "Ouder" },
    chairs: { none: "", powerchair: "Elektrische rolstoel", manual: "Manuele rolstoel", both: "Elektrische en manuele rolstoel" },
    moments: { morning: "Ochtend", midday: "Middag", evening: "Avond", night: "Nacht", before_play: "Voor het spel", after_play: "Na het spel", as_needed: "Indien nodig" },
  },
  en: {
    title: "Offline book",
    intro: "Trip books prepared on this device. They open without network, with the code chosen when preparing them.",
    none: "No book on this device. Prepare it from the trip page, before leaving.",
    code: "Code",
    open: "Open",
    close: "Close the book",
    remove: "Erase from this device",
    wrong: "Wrong code. {n} tries left before erasing.",
    erased: "Too many tries: the book was erased from this device.",
    expired: "This trip is over: the book was erased.",
    until: "kept until {d}",
    meeting: "Departure",
    back: "Return",
    accommodation: "Accommodation",
    emergency: "Emergencies on site",
    contact: "Club contact",
    people: "People",
    vehicles: "Vehicles",
    schedule: "Schedule",
    driver: "Driver",
    passengers: "Passengers",
    needs: "Needs",
    support: "Support",
    safety: "Safety",
    emergencyContact: "Emergency contact",
    care: "Care instructions",
    health: "Health (confidential)",
    impairment: "Condition",
    medical: "Medical notes",
    generated: "Prepared on {d}",
    roles: { player: "Player", coach: "Coach", staff: "Staff", assistant: "Assistant", guardian: "Parent" },
    chairs: { none: "", powerchair: "Powerchair", manual: "Manual chair", both: "Powerchair and manual chair" },
    moments: { morning: "Morning", midday: "Midday", evening: "Evening", night: "Night", before_play: "Before play", after_play: "After play", as_needed: "As needed" },
  },
};
type Pack = {
  generatedAt: string;
  trip: {
    id: string;
    title: string;
    starts_on: string;
    ends_on: string;
    destination: string;
    address: string;
    meeting_point: string;
    departure_at: string | null;
    return_at: string | null;
    return_point: string;
    accommodation: string;
    emergency: string;
    contact: string;
  };
  schedule: { id: string; day: string; time: string; title: string; place: string; notes: string }[];
  vehicles: { name: string; legs: string; driver_name: string | null; phone: string | null; passengers: string[] }[];
  people: {
    id: string;
    name: string;
    role: string;
    phone: string;
    chair: string;
    needs: string;
    support_needs: string;
    safety_notes: string;
    emergency_contact: string;
    care: { moment: string; time: string; title: string; details: string }[];
    health?: { impairment: string; medical_notes: string };
  }[];
};
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const tel = (n: string) => <a href={`tel:${n.replace(/\s+/g, "")}`}>{n}</a>;

export function OfflineBook({ locale }: { locale: Locale }) {
  const t = copy[locale] as (typeof copy)["fr"];
  const [books, setBooks] = useState<BookMeta[] | null>(null),
    [opened, setOpened] = useState<Pack | null>(null),
    [message, setMessage] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listBooks()
      .then((b) => {
        if (!cancelled) setBooks(b);
      })
      .catch(() => {
        if (!cancelled) setBooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);
  const date = (d: string, time = false) =>
    new Intl.DateTimeFormat(tag(locale), {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
      timeZone: time ? "Europe/Brussels" : "UTC",
    }).format(new Date(time ? d : d + "T12:00:00Z"));

  async function unlock(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const code = String(new FormData(form).get("code") ?? "");
    setMessage("");
    const r = await openBook<Pack>(id, code);
    form.reset();
    if (r.ok) return setOpened(r.pack);
    setMessage(r.reason === "wrong" ? t.wrong.replace("{n}", String(r.left)) : r.reason === "expired" ? t.expired : t.erased);
    setVersion((v) => v + 1);
  }

  if (opened) {
    const p = opened,
      byId = new Map(p.people.map((x) => [x.id, x.name]));
    return (
      <main id="main" className="access offline-book">
        <PageHeader title={p.trip.title} />
        <p className="muted">
          {date(p.trip.starts_on)} → {date(p.trip.ends_on)} · {p.trip.destination}
          {p.trip.address && ` · ${p.trip.address}`}
        </p>
        <p className="muted small">{t.generated.replace("{d}", date(p.generatedAt, true))}</p>
        <button type="button" className="button secondary" onClick={() => setOpened(null)}>
          {t.close}
        </button>
        <dl className="trip-facts">
          {(p.trip.meeting_point || p.trip.departure_at) && (
            <div>
              <dt>{t.meeting}</dt>
              <dd>{[p.trip.meeting_point, p.trip.departure_at && date(p.trip.departure_at, true)].filter(Boolean).join(" · ")}</dd>
            </div>
          )}
          {(p.trip.return_point || p.trip.return_at) && (
            <div>
              <dt>{t.back}</dt>
              <dd>{[p.trip.return_point, p.trip.return_at && date(p.trip.return_at, true)].filter(Boolean).join(" · ")}</dd>
            </div>
          )}
          {p.trip.accommodation && (
            <div>
              <dt>{t.accommodation}</dt>
              <dd className="pre-line">{p.trip.accommodation}</dd>
            </div>
          )}
          {p.trip.emergency && (
            <div>
              <dt>{t.emergency}</dt>
              <dd className="pre-line">{p.trip.emergency}</dd>
            </div>
          )}
          {p.trip.contact && (
            <div>
              <dt>{t.contact}</dt>
              <dd>{p.trip.contact}</dd>
            </div>
          )}
        </dl>
        <Card title={t.people} labelledBy="book-people" headingId="book-people">
          <ul className="book-people">
            {p.people.map((x) => (
              <li key={x.id}>
                <h3>
                  {x.name} <span className="muted small">{t.roles[x.role]}{x.chair !== "none" && ` · ${t.chairs[x.chair]}`}</span>
                </h3>
                {x.phone && <p>{tel(x.phone)}</p>}
                {x.emergency_contact && <p><strong>{t.emergencyContact}</strong> : {x.emergency_contact}</p>}
                {x.needs && <p><strong>{t.needs}</strong> : {x.needs}</p>}
                {x.support_needs && <p><strong>{t.support}</strong> : {x.support_needs}</p>}
                {x.safety_notes && <p><strong>{t.safety}</strong> : {x.safety_notes}</p>}
                {x.care.length > 0 && (
                  <>
                    <p><strong>{t.care}</strong></p>
                    <ul>
                      {x.care.map((c, i) => (
                        <li key={i}>
                          {t.moments[c.moment]}{c.time && ` ${c.time}`} · {c.title}
                          {c.details && <span className="muted"> · {c.details}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {x.health && (x.health.impairment || x.health.medical_notes) && (
                  <p className="notice">
                    <strong>{t.health}</strong> · {[x.health.impairment, x.health.medical_notes].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {p.vehicles.length > 0 && (
          <Card title={t.vehicles} labelledBy="book-vehicles" headingId="book-vehicles">
            <ul className="book-people">
              {p.vehicles.map((v, i) => (
                <li key={i}>
                  <h3>{v.name}</h3>
                  {(v.driver_name || v.phone) && (
                    <p>
                      {t.driver} : {v.driver_name} {v.phone && tel(v.phone)}
                    </p>
                  )}
                  <p className="small">
                    {t.passengers} : {v.passengers.map((id) => byId.get(id)).filter(Boolean).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {p.schedule.length > 0 && (
          <Card title={t.schedule} labelledBy="book-schedule" headingId="book-schedule">
            <ul className="book-schedule">
              {p.schedule.map((s) => (
                <li key={s.id}>
                  <strong>{date(s.day)} {s.time}</strong> · {s.title}
                  {s.place && <span className="muted"> · {s.place}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    );
  }
  return (
    <main id="main" className="access offline-book">
      <PageHeader title={t.title} subtitle={t.intro} />
      {message && <p role="alert">{message}</p>}
      {books === null ? null : books.length ? (
        <ul className="profile-list">
          {books.map((b) => (
            <li key={b.tripId}>
              <div>
                <strong>{b.title}</strong>
                <p className="muted small">
                  {date(b.startsOn)} → {date(b.endsOn)} · {t.until.replace("{d}", date(b.expiresAt.slice(0, 10)))}
                </p>
                <form className="inline-form" onSubmit={(e) => void unlock(e, b.tripId)}>
                  <label>
                    {t.code}
                    <input name="code" type="password" inputMode="numeric" autoComplete="off" required minLength={6} maxLength={64} />
                  </label>
                  <button className="button">{t.open}<span className="sr-only"> : {b.title}</span></button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void removeBook(b.tripId).then(() => setVersion((v) => v + 1))}
                  >
                    {t.remove}
                    <span className="sr-only"> : {b.title}</span>
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.none} />
      )}
    </main>
  );
}
