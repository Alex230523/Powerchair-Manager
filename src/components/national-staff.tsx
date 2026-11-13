"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { nationalCare, nationalStaffView } from "@/domains/national/service";
import { nationalStaffCopy } from "./national-staff-copy";
import { nationalCopy } from "./national-copy";
import { classificationCopy } from "./classification-copy";
import { tripsCopy } from "./trips-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";
import { useData } from "./use-api";

type View = Awaited<ReturnType<typeof nationalStaffView>>;
type Team = View["teams"][number];
type Care = Awaited<ReturnType<typeof nationalCare>>;
type Answer = { name: string; response: string };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] === undefined ? m : String(v[k])));
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/**
 * 13/11/2026: « Mon équipe nationale ». The national staff (a club's coach, a
 * federation account) sees, read only, the teams it is on: the others of the
 * staff, the players and their answers, the gatherings and who comes. The
 * care instructions load only on demand, for the roles that read them, and
 * each reading is journaled in the player's club.
 */
export function NationalStaff({ locale }: { locale: Locale }) {
  const t = nationalStaffCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error } = useData<View>("/api/national/staff", failure);
  return (
    <main id="main" className="national-staff">
      <PageHeader title={t.title} subtitle={t.intro} />
      {!data ? (
        error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">{t.loading}</p>
        )
      ) : data.teams.length ? (
        data.teams.map((team) => <TeamCard key={team.id} locale={locale} team={team} />)
      ) : (
        <EmptyState icon="medal" title={t.none} />
      )}
    </main>
  );
}

function TeamCard({ locale, team }: { locale: Locale; team: Team }) {
  const t = nationalStaffCopy[locale],
    n = nationalCopy[locale],
    classes = classificationCopy[locale].classes as Record<string, string>;
  const when = (iso: string) => new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));
  const roles = team.roles.map((r: string) => n.roles[r] ?? r).join(", ");
  return (
    <Card
      as="section"
      id={`national-${team.id}`}
      className="national-staff-team"
      title={team.name}
      subtitle={`${team.federation} · ${n.categories[team.category] ?? team.category} · ${team.season}`}
      actions={<Badge tone="info">{fill(t.myRoles, { roles })}</Badge>}
    >
      <h3>{t.staff}</h3>
      <ul className="national-staff-list">
        {team.staff.map((s: { id: string; role: string; name: string }) => (
          <li key={s.id}>
            <strong>{s.name}</strong> <span className="muted small">{n.roles[s.role] ?? s.role}</span>
          </li>
        ))}
      </ul>

      <h3>{t.players}</h3>
      {team.players.length ? (
        // At 390 px the table scrolls in its frame: reachable with the keyboard.
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`${t.players} : ${team.name}`}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t.colPlayer}</th>
                <th scope="col">{t.colClub}</th>
                <th scope="col">{t.colClass}</th>
                <th scope="col">{t.colStatus}</th>
                <th scope="col">{t.colAnswer}</th>
                <th scope="col">{t.colCare}</th>
              </tr>
            </thead>
            <tbody>
              {team.players.map((x: { id: string; full_name: string; club: string; classification: string; status: string; availability: string; availability_note: string; care_shared: boolean }) => (
                <tr key={x.id}>
                  <th scope="row">{x.full_name}</th>
                  <td>{x.club}</td>
                  <td>{classes[x.classification] ?? x.classification}</td>
                  <td>{n.statuses[x.status] ?? x.status}</td>
                  <td>
                    <Badge tone={x.availability === "available" ? "success" : x.availability === "unavailable" ? "danger" : "neutral"}>{n.availability[x.availability]}</Badge>
                    {x.availability_note && <span className="muted small"> {x.availability_note}</span>}
                  </td>
                  <td>{x.care_shared ? t.careShared : <span className="muted">{t.careNotShared}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t.noPlayers}</p>
      )}

      <h3>{t.gatherings}</h3>
      {team.gatherings.length ? (
        <ul className="national-staff-gatherings">
          {team.gatherings.map((g: { id: string; kind: string; title: string; starts_at: string; ends_at: string; place: string; answers: Answer[] }) => {
            const count = (r: string) => g.answers.filter((a) => a.response === r).length;
            return (
              <li key={g.id}>
                <div>
                  <strong>{g.title}</strong> <Badge>{n.kinds[g.kind] ?? g.kind}</Badge>
                </div>
                <p className="muted small">
                  {when(g.starts_at)}
                  {g.place ? ` · ${g.place}` : ""}
                </p>
                {g.answers.length > 0 && (
                  <details>
                    <summary>{fill(t.answers, { present: count("present"), absent: count("absent"), none: count("none") })}</summary>
                    <ul aria-label={fill(t.whoComes, { title: g.title })} className="national-staff-answers">
                      {g.answers.map((a) => (
                        <li key={a.name}>
                          {a.name} <Badge tone={a.response === "present" ? "success" : a.response === "absent" ? "danger" : "neutral"}>{t.responses[a.response] ?? a.response}</Badge>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{t.noGatherings}</p>
      )}

      {team.readsCare && <CareBlock locale={locale} teamId={team.id} />}
    </Card>
  );
}

function CareBlock({ locale, teamId }: { locale: Locale; teamId: string }) {
  const t = nationalStaffCopy[locale],
    moments = tripsCopy[locale].moments;
  const [care, setCare] = useState<Care | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", timeZone: "Europe/Brussels" }).format(new Date(d + "T12:00:00Z"));
  async function toggle() {
    if (open) return setOpen(false);
    setBusy(true);
    setFailed(false);
    try {
      // Each opening reads again (and is journaled): nothing kept in the page once hidden.
      const r = await fetch("/api/national/care?" + new URLSearchParams({ team: teamId }), { cache: "no-store" });
      if (!r.ok) throw new Error();
      setCare((await r.json()) as Care);
      setOpen(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  const byPlayer = new Map<string, Care>();
  for (const c of open ? (care ?? []) : []) byPlayer.set(c.full_name, [...(byPlayer.get(c.full_name) ?? []), c]);
  return (
    <section className="national-staff-care" aria-labelledby={`care-${teamId}`}>
      <h3 id={`care-${teamId}`}>{t.care}</h3>
      <p className="muted small">{t.careIntro}</p>
      <Button variant="secondary" aria-expanded={open} aria-controls={`care-list-${teamId}`} disabled={busy} onClick={() => void toggle()}>
        {open ? t.careHide : t.careShow}
      </Button>
      {failed && <p role="alert">{t.careFailed}</p>}
      <div id={`care-list-${teamId}`} hidden={!open}>
        {open &&
          (byPlayer.size ? (
            <ul className="national-staff-care-list">
              {[...byPlayer].map(([name, items]) => (
                <li key={name}>
                  <strong>{name}</strong> <span className="muted small">{fill(t.careUntil, { day: day(items[0].shared_until) })}</span>
                  <ul>
                    {items.map((c) => (
                      <li key={c.id}>
                        <span className="small">
                          {moments[c.moment] ?? c.moment}
                          {c.time ? ` · ${c.time}` : ""}
                        </span>{" "}
                        <strong>{c.title}</strong>
                        {c.details && <p className="small">{c.details}</p>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t.careNone}</p>
          ))}
      </div>
    </section>
  );
}
