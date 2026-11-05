"use client";
import type { Locale } from "@/lib/locale";
import type { tripDetail } from "@/domains/trips/service";
import { tripCarpoolCopy } from "./trip-carpool-copy";
import { Badge, Button, Card, EmptyState } from "./ui";

type Detail = Awaited<ReturnType<typeof tripDetail>>;
type Send = (body: Record<string, unknown>, done?: string) => Promise<boolean>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

/** Lot 4 (05/11/2026): a parent or an adult player offers seats; the organiser accepts or declines. */
export function Carpool({ locale, d, busy, send }: { locale: Locale; d: Detail; busy: boolean; send: Send }) {
  const t = tripCarpoolCopy[locale];
  if (!d.can.carpool && !d.carpool.offers.length) return null;
  const mine = d.carpool.mine[0];
  return (
    <Card title={t.title} labelledBy="trip-carpool" headingId="trip-carpool">
      {d.can.full && (
        <>
          <p className="muted">{t.organiserIntro}</p>
          {d.carpool.offers.length ? (
            <ul className="profile-list">
              {d.carpool.offers.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.full_name}</strong>
                    <p className="muted small">
                      {[fill(t.seatsOf, { seats: o.seats, chairs: o.wheelchair_places }), t.legsOptions[o.legs as "both"], o.phone, o.note].filter(Boolean).join(" · ")}
                    </p>
                    <Badge tone={o.status === "accepted" ? "success" : "info"}>{t.statuses[o.status]}</Badge>
                  </div>
                  {o.status === "offered" && d.can.manage && (
                    <span className="row-actions">
                      <Button disabled={busy} onClick={() => void send({ action: "carpoolDecide", id: o.id, accept: true }, t.placed)}>
                        {t.accept}
                        <span className="sr-only"> : {o.full_name}</span>
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "carpoolDecide", id: o.id, accept: false })}>
                        {t.decline}
                        <span className="sr-only"> : {o.full_name}</span>
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.none} />
          )}
        </>
      )}
      {d.can.carpool && !d.can.full && <p className="muted">{t.intro}</p>}
      {d.can.carpool && mine && (
        <div className="carpool-mine">
          <p>
            <strong>{t.mine}</strong> · {fill(t.seatsOf, { seats: mine.seats, chairs: mine.wheelchair_places })} · <Badge tone={mine.status === "accepted" ? "success" : "info"}>{t.statuses[mine.status]}</Badge>
          </p>
          {mine.status === "offered" && (
            <Button variant="secondary" disabled={busy} onClick={() => void send({ action: "carpoolWithdraw", id: mine.id })}>
              {t.withdraw}
            </Button>
          )}
        </div>
      )}
      {d.can.carpool && !mine && (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void send(
              {
                action: "carpoolOffer",
                tripId: d.trip.id,
                seats: Number(f.get("seats")),
                wheelchairPlaces: Number(f.get("chairs")),
                legs: String(f.get("legs")),
                phone: String(f.get("phone") ?? ""),
                note: String(f.get("note") ?? ""),
              },
              t.offered,
            );
          }}
        >
          <div className="form-grid">
            <label>
              {t.seats}
              <input name="seats" type="number" min={1} max={8} required defaultValue={2} />
            </label>
            <label>
              {t.wheelchairPlaces}
              <input name="chairs" type="number" min={0} max={4} required defaultValue={0} />
            </label>
            <label>
              {t.legs}
              <select name="legs" defaultValue="both">
                {(["both", "out", "back"] as const).map((l) => (
                  <option key={l} value={l}>
                    {t.legsOptions[l]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.phone}
              <input name="phone" type="tel" maxLength={60} />
            </label>
          </div>
          <label>
            {t.note}
            <input name="note" maxLength={500} />
          </label>
          <div className="actions">
            <Button disabled={busy}>{t.offer}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
