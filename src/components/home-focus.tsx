"use client";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import type { CoachFocus, EventFocus, FederationFocus, Focus, MemberFocus } from "@/domains/dashboard/focus";
import { focusCopy } from "./home-focus-copy";
import { cssVars } from "./css-vars";
import { Button, Card, EmptyState } from "./ui";

/**
 * 15: the home by role. Each card: a title, a figure or a short list (5 lines
 * at most), and its way forward (« Voir tout », a button); an empty card says
 * « Rien à faire » or is not shown.
 */
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const when = (l: Locale, iso: string) =>
  new Intl.DateTimeFormat(tag(l), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

export function HomeFocus({ locale, focus, organizationId, href, reload }: { locale: Locale; focus: Focus; organizationId: string | null; href: (route: string) => string; reload: () => void }) {
  if (focus.kind === "member") return <Member locale={locale} focus={focus} organizationId={organizationId} href={href} reload={reload} />;
  if (focus.kind === "coach") return <Coach locale={locale} focus={focus} href={href} />;
  return <Federation locale={locale} focus={focus} href={href} />;
}

function Member({ locale, focus, organizationId, href, reload }: { locale: Locale; focus: MemberFocus; organizationId: string | null; href: (route: string) => string; reload: () => void }) {
  const t = focusCopy[locale];
  const [busy, setBusy] = useState(""),
    [status, setStatus] = useState("");
  async function answer(n: NonNullable<MemberFocus["people"][number]["next"]>, response: "present" | "absent") {
    setBusy(n.invitationId);
    setStatus("");
    try {
      const r = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "respond", id: n.invitationId, expectedVersion: n.version, response, comment: "", ...(response === "absent" ? { absenceReason: "other" } : {}) }),
      });
      if (!r.ok) throw new Error();
      setStatus(t.saved);
      reload();
    } catch {
      setStatus(t.failed);
    } finally {
      setBusy("");
    }
  }
  const several = focus.people.length > 1;
  return (
    <div className="dash-section focus-grid">
      {focus.people.map((p) => (
        <Card key={p.profileId} title={several ? fill(t.nextFor, { name: p.name }) : t.next} labelledBy={`focus-${p.profileId}`} headingId={`focus-${p.profileId}`} actions={<Link className="button secondary" href={href("/calendar")}>{t.seeCalendar}</Link>}>
          {p.next ? (
            <div className="focus-next">
              <p className="focus-title">
                <Link href={href(`/calendar?event=${p.next.eventId}`)}>{p.next.title}</Link>
              </p>
              <p>
                {when(locale, p.next.startsAt)}
                {p.next.place ? ` · ${p.next.place}` : ""}
              </p>
              <p className="muted">{t.answered[p.next.response] ?? t.answered.none}</p>
              {p.next.open ? (
                <p className="actions">
                  <Button variant={p.next.response === "present" ? "primary" : "secondary"} disabled={!!busy} aria-pressed={p.next.response === "present"} onClick={() => void answer(p.next!, "present")}>
                    {t.present}
                  </Button>
                  <Button variant={p.next.response === "absent" ? "primary" : "secondary"} disabled={!!busy} aria-pressed={p.next.response === "absent"} onClick={() => void answer(p.next!, "absent")}>
                    {t.absent}
                  </Button>
                </p>
              ) : (
                <p className="muted">{t.closed}</p>
              )}
            </div>
          ) : (
            <EmptyState title={t.noNext} />
          )}
          <h3 className="focus-sub">{t.results}</h3>
          {p.results.length ? (
            <ul className="focus-list">
              {p.results.map((m) => (
                <li key={m.id}>
                  <span>{day(locale, m.date.slice(0, 10))}</span> <strong>{m.opponent}</strong>{" "}
                  <span className="score" data-outcome={m.ours > m.theirs ? "win" : m.ours < m.theirs ? "loss" : "draw"}>
                    {m.ours} - {m.theirs}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noResults}</p>
          )}
        </Card>
      ))}
      {/* 19: a breakdown reported from the home, chair by chair. */}
      {!!focus.chairs?.length && (
        <Card title={t.chairs} labelledBy="focus-chairs" headingId="focus-chairs">
          <ul className="focus-list">
            {focus.chairs.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>{" "}
                <Link className="button secondary sm" href={href(`/equipment/${c.id}?report=1`)}>
                  {t.reportChair}
                  <span className="sr-only"> : {c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

function Answers({ locale, e }: { locale: Locale; e: EventFocus }) {
  const t = focusCopy[locale];
  return (
    <p className="muted">
      {e.invited ? fill(t.answers, { answered: e.answered, invited: e.invited, present: e.present }) : ""}
    </p>
  );
}

function Coach({ locale, focus, href }: { locale: Locale; focus: CoachFocus; href: (route: string) => string }) {
  const t = focusCopy[locale];
  if (!focus.teams.length) return null;
  return (
    <div className="dash-section focus-grid">
      {(focus.callToday || focus.matchToday) && (
        <p className="actions focus-today">
          {focus.callToday && (
            <Link className="button" href={href("/attendance")}>
              {t.call}
            </Link>
          )}
          {focus.matchToday && (
            <Link className="button" href={href(`/matches/${focus.matchToday}`)}>
              {t.openMatch}
            </Link>
          )}
        </p>
      )}
      {/* 19: a chair's breakdown, from the equipment of the coach's players. */}
      <p className="actions">
        <Link className="button secondary" href={href("/equipment#report")}>
          {t.reportChairs}
        </Link>
      </p>
      {focus.teams.map((team) => (
        <Card key={team.id} title={fill(t.team, { name: team.name })} labelledBy={`focus-team-${team.id}`} headingId={`focus-team-${team.id}`} actions={<Link className="button secondary" href={href(`/teams/${team.id}`)}>{t.seeAll}</Link>}>
          {(
            [
              [t.nextTraining, team.nextTraining],
              [t.nextMatch, team.nextMatch],
            ] as const
          ).map(([label, e]) => (
            <div key={label} className="focus-next">
              <h3 className="focus-sub">{label}</h3>
              {e ? (
                <>
                  <p>
                    <Link href={href(`/calendar?event=${e.id}`)}>{e.title}</Link> · {when(locale, e.startsAt)}
                    {e.place ? ` · ${e.place}` : ""}
                  </p>
                  <Answers locale={locale} e={e} />
                </>
              ) : (
                <p className="muted">{t.nothingPlanned}</p>
              )}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

function Federation({ locale, focus, href }: { locale: Locale; focus: FederationFocus; href: (route: string) => string }) {
  const t = focusCopy[locale];
  const pending = [
    ...(focus.pending.places ? [{ text: fill(t.pendingPlaces, { n: focus.pending.places }), route: "/venues" }] : []),
    ...(focus.pending.models ? [{ text: fill(t.pendingModels, { n: focus.pending.models }), route: "/equipment" }] : []),
    ...(focus.pending.courses ? [{ text: fill(t.pendingCourses, { n: focus.pending.courses }), route: "/federation/courses" }] : []),
  ];
  // 32: what this person handles, each line leading to its list.
  const toDo = [
    ...(focus.classificationsToDo ? [{ text: fill(t.classificationsToDo, { n: focus.classificationsToDo }), route: "/federation/licenses" }] : []),
    ...(focus.matchesWithoutReferee ? [{ text: fill(t.matchesWithoutReferee, { n: focus.matchesWithoutReferee }), route: "/federation/referees" }] : []),
    ...(focus.reportsPending ? [{ text: fill(t.reportsPending, { n: focus.reportsPending }), route: "/federation/referees" }] : []),
    ...(focus.discipline?.proposed ? [{ text: fill(t.disciplineProposed, { n: focus.discipline.proposed }), route: "/federation/discipline" }] : []),
    ...(focus.discipline?.appeals ? [{ text: fill(t.disciplineAppeals, { n: focus.discipline.appeals }), route: "/federation/discipline" }] : []),
  ];
  const seasons = [...new Set(focus.licences.map((l) => l.season))].slice(0, 4);
  return (
    <div className="dash-section focus-grid">
      {focus.can.licences && (
        <Card title={t.clubs} labelledBy="focus-clubs" headingId="focus-clubs" actions={<Link className="button secondary" href={href("/federation/clubs")}>{t.seeAll}</Link>}>
          <p>{fill(t.clubsLine, { affiliated: focus.clubs.affiliated, pending: focus.clubs.pending })}</p>
        </Card>
      )}
      {focus.can.licences && (
        <Card title={t.licences} labelledBy="focus-licences" headingId="focus-licences" actions={<Link className="button secondary" href={href("/federation/licenses")}>{t.seeAll}</Link>}>
          {seasons.length ? (
            <ul className="focus-list focus-bars">
              {seasons.map((season) => {
                const rows = focus.licences.filter((l) => l.season === season);
                const total = rows.reduce((a, r) => a + r.n, 0);
                const max = Math.max(1, ...seasons.map((x) => focus.licences.filter((l) => l.season === x).reduce((a, r) => a + r.n, 0)));
                return (
                  <li key={season}>
                    <span>{season}</span>
                    <span className="focus-bar" style={cssVars({ value: Math.round((total * 100) / max) })} aria-hidden="true" />
                    <span>
                      {total} ({rows.map((r) => `${r.n} ${t.licenceCategories[r.category] ?? r.category}`).join(", ")})
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">{t.licencesNone}</p>
          )}
        </Card>
      )}
      {focus.can.licences && (
        <Card title={t.lateClubs} labelledBy="focus-late" headingId="focus-late" actions={<Link className="button secondary" href={href("/federation/affiliations")}>{t.seeAll}</Link>}>
          {focus.lateClubs ? <p className="focus-figure">{focus.lateClubs}</p> : <p className="muted">{t.lateClubsNone}</p>}
        </Card>
      )}
      {(focus.can.classification || focus.can.referees || focus.can.discipline) && (
        <Card title={t.toDo} labelledBy="focus-todo" headingId="focus-todo">
          {toDo.length ? (
            <ul className="focus-list">
              {toDo.map((x) => (
                <li key={x.text}>
                  <Link href={href(x.route)}>{x.text}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.nothingToDo}</p>
          )}
        </Card>
      )}
      <Card title={t.pending} labelledBy="focus-pending" headingId="focus-pending">
        {pending.length ? (
          <ul className="focus-list">
            {pending.map((x) => (
              <li key={x.route}>
                <Link href={href(x.route)}>{x.text}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.nothingPending}</p>
        )}
      </Card>
      {focus.classificationDays.length > 0 && (
        <Card title={t.classificationDays} labelledBy="focus-classification" headingId="focus-classification" actions={<Link className="button secondary" href={href("/federation/licenses")}>{t.seeAll}</Link>}>
          <ul className="focus-list">
            {focus.classificationDays.map((d) => (
              <li key={d.id}>
                {day(locale, d.day)}
                {d.place ? ` · ${d.place}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {focus.tournamentDays.length > 0 && (
        <Card title={t.tournamentDays} labelledBy="focus-tournaments" headingId="focus-tournaments" actions={<Link className="button secondary" href={href("/tournaments")}>{t.seeAll}</Link>}>
          <ul className="focus-list">
            {focus.tournamentDays.map((d) => (
              <li key={d.id}>
                <Link href={href(`/tournaments/${d.tournamentId}`)}>{d.name}</Link> · {day(locale, d.day)}
                {d.place ? ` · ${d.place}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
