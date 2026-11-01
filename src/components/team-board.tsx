"use client";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import type { teamDetail, PlayerState } from "@/domains/teams/service";
import { teamBoardCopy, squadParts } from "./team-board-copy";
import { fill } from "./fleet-copy";
import { Badge, Card, EmptyState } from "./ui";

/**
 * A6: « mon équipe est-elle en ordre pour samedi ? ». What blocks, at the
 * top and clickable; quick actions; the state of each player (money and
 * care only for those who may see them); the next meetings and their
 * answers, the results and the record, attendance, tasks and staff.
 */
type Detail = Awaited<ReturnType<typeof teamDetail>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function TeamBoard({ locale, data }: { locale: Locale; data: Detail }) {
  const t = teamBoardCopy[locale];
  const { board, roster, team } = data;
  const when = (iso: string) => new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
  const state = (id: string): PlayerState => board.states[id] ?? { licence: "none", chair: null, duesLate: null, care: null };
  const chairIssue = (s: PlayerState) => (s.chair ? (s.chair.status === "maintenance" || s.chair.status === "out_of_service" ? "maintenance" : s.chair.serviceDue ? "service" : null) : null);
  // What blocks, each with the players it names (a link to their line below).
  const blocks = [
    { key: "licence" as const, ids: roster.filter((r) => state(r.profile_id).licence !== "active").map((r) => r.profile_id) },
    { key: "documents" as const, ids: roster.filter((r) => r.documents_due > 0).map((r) => r.profile_id) },
    { key: "noChair" as const, ids: roster.filter((r) => !state(r.profile_id).chair).map((r) => r.profile_id) },
    { key: "chairRepair" as const, ids: roster.filter((r) => chairIssue(state(r.profile_id)) === "maintenance").map((r) => r.profile_id) },
    { key: "chairService" as const, ids: roster.filter((r) => chairIssue(state(r.profile_id)) === "service").map((r) => r.profile_id) },
    ...(data.can.money ? [{ key: "dues" as const, ids: roster.filter((r) => state(r.profile_id).duesLate).map((r) => r.profile_id) }] : []),
  ].filter((b) => b.ids.length > 0);
  const points = board.record ? board.record.won * 3 + board.record.drawn : 0;
  const parts = squadParts[locale];
  return (
    <div className="team-board">
      {roster.length > 0 &&
        (blocks.length ? (
          <section className="team-board-alert notice" aria-labelledby="team-board-blocking">
            <h2 id="team-board-blocking">{t.blocking}</h2>
            <ul>
              {blocks.map((b) => (
                <li key={b.key}>
                  <a href={`#team-player-${b.ids[0]}`}>{fill(t.items[b.key], { n: b.ids.length })}</a>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="team-board-ready">
            <Badge tone="success" dot>
              {t.ready}
            </Badge>
          </p>
        ))}

      {(data.can.convene || data.can.write || data.can.issueDues || (data.can.matches && board.nextMatch)) && (
        <nav className="team-board-actions" aria-label={t.actions}>
          {data.can.convene && (
            <Link className="button secondary" href={`/${locale}/calendar?create=1`}>
              {t.convene}
            </Link>
          )}
          {data.can.write && (
            <Link className="button secondary" href={`/${locale}/communication?create=1`}>
              {t.write}
            </Link>
          )}
          {data.can.issueDues && (
            <Link className="button secondary" href={`/${locale}/dues?team=${team.id}`}>
              {t.issueDues}
            </Link>
          )}
          {data.can.matches && board.nextMatch && (
            <Link className="button secondary" href={`/${locale}/matches/${board.nextMatch.id}`}>
              {t.prepareMatch}
            </Link>
          )}
        </nav>
      )}

      <Card title={t.squad} subtitle={fill(t.squadIntro, { money: data.can.money ? parts.money : "", care: data.can.sensitive ? parts.care : "" })} id="team-board-squad">
        {roster.length ? (
          <ul className="team-board-squad">
            {roster.map((r) => {
              const s = state(r.profile_id),
                issue = chairIssue(s);
              return (
                <li key={r.profile_id} id={`team-player-${r.profile_id}`} tabIndex={-1}>
                  <Link href={`/${locale}/players/${r.profile_id}`}>{r.full_name}</Link>
                  <span className="team-board-pills">
                    <Badge tone={s.licence === "active" ? "success" : s.licence === "requested" ? "warning" : "danger"} dot>
                      {t.licence[s.licence]}
                    </Badge>
                    <Badge tone={r.documents_due ? "warning" : "success"} dot>
                      {r.documents_due ? fill(t.documentsDue, { n: r.documents_due }) : t.documentsOk}
                    </Badge>
                    <Badge tone={!s.chair ? "neutral" : issue ? "warning" : "success"} dot>
                      {s.chair ? `${t.chair} ${s.chair.name} · ${t.chairState[issue ?? "ok"]}` : t.noChair}
                    </Badge>
                    {data.can.money && s.duesLate && (
                      <Badge tone="danger" dot>
                        {t.duesLate}
                      </Badge>
                    )}
                    {data.can.sensitive && s.care && (
                      <Badge tone="info" dot>
                        {t.care}
                      </Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={t.emptySquad} icon="players" />
        )}
      </Card>

      <div className="team-board-grid">
        <Card title={t.events} id="team-board-events">
          {board.events.length ? (
            <ul className="records">
              {board.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/${locale}/calendar?event=${e.id}`}>{e.title}</Link>
                  <span className="muted small">
                    {" "}
                    · {t.kinds[e.kind] ?? e.kind} · {when(e.starts_at)}
                  </span>
                  {e.invited > 0 && (
                    <span className="small">
                      {" "}
                      · {fill(t.answers, { a: e.answered, n: e.invited })} · {fill(t.present, { p: e.present })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noEvent}</p>
          )}
          <p>
            <strong>{t.attendance} : </strong>
            {team.attendance === null ? <span className="muted">{t.noAttendance}</span> : fill(t.attendanceValue, { n: team.attendance })}
          </p>
        </Card>

        {data.can.matches && (
          <Card title={t.results} id="team-board-results">
            {board.results.length ? (
              <ul className="records">
                {board.results.map((m) => (
                  <li key={m.id}>
                    <span>
                      {day(m.starts_at)} · {m.home ? `${team.name} ${m.our_score} - ${m.their_score} ${m.opponent}` : `${m.opponent} ${m.their_score} - ${m.our_score} ${team.name}`}
                    </span>{" "}
                    <Badge tone={m.our_score > m.their_score ? "success" : m.our_score === m.their_score ? "neutral" : "danger"}>{t.kinds[m.kind] ?? m.kind}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noResult}</p>
            )}
            {board.record && board.record.played > 0 && (
              <p>
                <strong>{t.record} : </strong>
                {fill(t.recordLine, { ...board.record, points })}
              </p>
            )}
          </Card>
        )}

        <Card title={t.tasks} id="team-board-tasks">
          {board.tasks.length ? (
            <ul className="records">
              {board.tasks.map((k) => (
                <li key={k.id}>
                  <Link href={`/${locale}/tasks?task=${k.id}`}>{k.title}</Link>
                  <span className="muted small">
                    {k.responsible && ` · ${k.responsible}`}
                    {k.due_on && ` · ${fill(t.due, { date: day(k.due_on) })}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noTask}</p>
          )}
        </Card>

        <Card title={t.staff} id="team-board-staff">
          {data.staff.length ? (
            <ul className="records">
              {data.staff.map((m) => (
                <li key={m.membership_id}>
                  <Link href={`/${locale}/coaches/${m.profile_id}`}>{m.full_name}</Link>
                  <span className="team-board-contacts">
                    {m.email && (
                      <a className="text-button" href={`mailto:${m.email}`} aria-label={fill(t.email, { name: m.full_name })}>
                        {m.email}
                      </a>
                    )}
                    {m.phone && (
                      <a className="text-button" href={`tel:${m.phone.replace(/[^\d+]/g, "")}`} aria-label={fill(t.phone, { name: m.full_name })}>
                        {m.phone}
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.noStaff}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
