"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { tournamentsView } from "@/domains/tournaments/service";
import { clubTournamentsCopy } from "./club-tournaments-copy";
import { Badge, Button, Card } from "./ui";
import { Modal } from "./modal";
import { showToast } from "./toast";

const shortDate = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
type Trips = NonNullable<Awaited<ReturnType<typeof tournamentsView>>["clubTrips"]>;

/** Wave 16 (E3): the club's own tournaments (its trips of type tournament) on the tournaments page. */
export function ClubTournaments({ locale, trips, organizationId, reload }: { locale: Locale; trips: Trips; organizationId: string; reload: () => unknown }) {
  const t = clubTournamentsCopy[locale];
  const [preparing, setPreparing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const when = (a: string, b: string) => (a === b ? shortDate(locale, a) : `${shortDate(locale, a)} · ${shortDate(locale, b)}`);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v as { id: string };
  }
  async function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = trips.prepare!;
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const from = get("from"),
      to = get("to") || from;
    setBusy(true);
    setError("");
    try {
      // One event in the calendar (the club's tournament type), the team invited with an answer…
      const event = await post({
        action: "create",
        title: get("name"),
        kind: "tournament",
        customType: "",
        ...(p.typeId ? { eventTypeId: p.typeId } : {}),
        timezone: "Europe/Brussels",
        localStart: `${from}T09:00`,
        localEnd: `${to < from ? from : to}T18:00`,
        fold: "reject",
        teamId: get("team"),
        placeId: null,
        sharedVenueId: null,
        freeLocation: get("place"),
        responsibleId: p.userId,
        visibility: "team",
        equipment: "",
        instructions: "",
        participants: [],
        documents: [],
        invite: { ask: true, deadline: null, groups: [{ kind: "team", ref: get("team") }] },
        intervalDays: 0,
        occurrences: 1,
        requestId: crypto.randomUUID(),
      });
      // …then its trip of type tournament, linked to it.
      await post({ action: "createTrip", eventId: event.id });
      setPreparing(false);
      showToast({ message: t.prepared, icon: "trophy" });
      await reload();
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }
  const list = (rows: Trips["upcoming"], past: boolean) => (
    <ul className="club-tournaments">
      {rows.map((r) => (
        <li key={r.id}>
          <Card title={r.title} subtitle={[when(r.starts_on, r.ends_on), r.place, r.team].filter(Boolean).join(" · ")} icon="trophy" className="club-tournament">
            {past ? (
              <>
                <p className="tournament-badges">
                  <Badge tone={r.final_rank && r.final_rank <= 3 ? "success" : r.final_rank ? "info" : "warning"}>{r.final_rank ? t.rank(r.final_rank, r.teams_count) : t.noRank}</Badge>
                  {r.result_note && <span className="muted">{r.result_note}</span>}
                </p>
                {r.matches.length > 0 && (
                  <>
                    <h3 className="small">{t.matches}</h3>
                    <ul className="plain-list">
                      {r.matches.map((m) => (
                        <li key={m.id}>{t.score(m.our, m.their, m.opponent)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="tournament-badges">
                {r.vehicles > 0 ? (
                  <>
                    <Badge tone="info">{t.vehicles(r.vehicles)}</Badge>
                    <Badge>{t.wheelchairs(r.wheelchair_places)}</Badge>
                  </>
                ) : (
                  <Badge tone="warning">{t.noTransport}</Badge>
                )}
              </p>
            )}
            <p className="actions">
              <Link className="button secondary" href={`/${locale}/trips/${r.id}`}>{past && !r.final_rank ? t.enterResult : t.openTrip}</Link>
              {past && trips.award && !r.awarded && r.final_rank !== null && r.final_rank <= 3 && <Link className="button secondary" href={`/${locale}/statistics/club#hall-of-fame`}>{t.addAward}</Link>}
              {r.event_id && <Link className="button secondary" href={`/${locale}/calendar?event=${r.event_id}`}>{t.openEvent}</Link>}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="club-tournaments-section" aria-labelledby="club-tournaments-title">
      <div className="federation-section-head">
        <h2 id="club-tournaments-title">{t.title}</h2>
        {trips.prepare && (
          <Button icon="plus" variant="secondary" onClick={() => setPreparing(true)}>
            {t.prepare}
          </Button>
        )}
      </div>
      <p className="muted">{t.intro}</p>
      {!trips.upcoming.length && !trips.past.length && <p>{t.none}</p>}
      {trips.upcoming.length > 0 && (
        <>
          <h3>{t.upcoming}</h3>
          {list(trips.upcoming, false)}
        </>
      )}
      {trips.past.length > 0 && (
        <>
          <h3>{t.past}</h3>
          {list(trips.past, true)}
        </>
      )}
      {preparing && trips.prepare && (
        <Modal title={t.prepare} close={() => setPreparing(false)}>
          <p className="muted">{t.prepareIntro}</p>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void prepare(e)}>
            <label>
              {t.name}
              <input name="name" required minLength={2} maxLength={120} />
            </label>
            <label>
              {t.team}
              <select name="team" required>
                {trips.prepare.teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-pair">
              <label>
                {t.from}
                <input name="from" type="date" required />
              </label>
              <label>
                {t.to}
                <input name="to" type="date" />
              </label>
            </div>
            <label>
              {t.place}
              <input name="place" maxLength={300} />
            </label>
            <Button type="submit" loading={busy}>
              {t.create}
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
