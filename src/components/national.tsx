"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { nationalView, playerNational } from "@/domains/national/service";
import { ageCategory, gatheringKinds, pf2Allowed, selectionStatuses, staffRoles, teamCategories } from "@/domains/national/schema";
import { errors } from "./access-copy";
import { nationalCopy } from "./national-copy";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";
import { useData } from "./use-api";

type View = Awaited<ReturnType<typeof nationalView>>;
type Team = View["teams"][number];
type Player = Awaited<ReturnType<typeof playerNational>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const fail = (locale: Locale, code: string) => nationalCopy[locale].errors[code] ?? errors[code]?.[locale] ?? nationalCopy[locale].failed;

/** One national team: staff, squad (with filters, the PF2 rule), gatherings, tournament and honours. */
function TeamCard({ locale, data, team, busy, send }: { locale: Locale; data: View; team: Team; busy: boolean; send: (b: Record<string, unknown>) => Promise<Record<string, unknown> | null> }) {
  const t = nationalCopy[locale];
  const [q, setQ] = useState(""),
    [club, setClub] = useState(""),
    [cls, setCls] = useState(""),
    [age, setAge] = useState(""),
    [licensed, setLicensed] = useState(true);
  const chosen = new Set(team.players.map((x: { profile_id: string }) => x.profile_id));
  const found = data.candidates.filter(
    (x) =>
      !chosen.has(x.id) &&
      (!q || fold(x.full_name).includes(fold(q))) &&
      (!club || x.club_id === club) &&
      (!cls || x.classification === cls) &&
      (!age || ageCategory(x.birth_date, team.season) === age) &&
      (!licensed || x.licensed),
  );
  const selected = team.players.filter((x: { status: string }) => x.status === "selected");
  const pf2 = pf2Allowed(selected, team.max_pf2);
  const clubs = [...new Map(data.candidates.map((x) => [x.club_id, x.club])).entries()];
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
  return (
    <Card title={`${team.name} · ${team.season}`} subtitle={t.categories[team.category]} labelledBy={`team-${team.id}`} headingId={`team-${team.id}`}>
      <h3>{t.staff}</h3>
      <ul className="plain-list">
        {team.staff.map((x: { id: string; role: string; name: string; trainings: string[] }) => (
          <li key={x.id}>
            <strong>{x.name}</strong> · {t.roles[x.role]} · <span className="muted small">{x.trainings.length ? t.trainings(x.trainings.join(", ")) : t.noTraining}</span>{" "}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send({ action: "staffRemove", id: x.id })}>
              {t.remove(x.name)}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="exercise-tag-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const who = String(f.get("who") ?? "");
          void send({ action: "staffAdd", teamId: team.id, role: f.get("role"), ...(who.startsWith("u:") ? { userId: who.slice(2) } : { profileId: who.slice(2) }) });
        }}
      >
        <select name="role" aria-label={t.staff} defaultValue="head_coach">
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </select>
        <select name="who" aria-label={t.addStaff} required defaultValue="">
          <option value="">…</option>
          <optgroup label={t.coachOf}>
            {(data.coaches as { id: string; full_name: string; club: string }[]).map((c) => (
              <option key={c.id} value={`p:${c.id}`}>
                {c.full_name} ({c.club})
              </option>
            ))}
          </optgroup>
          <optgroup label={t.accountOf}>
            {(data.accounts as { id: string; name: string }[]).map((u) => (
              <option key={u.id} value={`u:${u.id}`}>
                {u.name}
              </option>
            ))}
          </optgroup>
        </select>
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          {t.addStaff}
        </Button>
      </form>

      <h3>{t.composition}</h3>
      <p className={pf2.ok ? "muted small" : "notice"}>{t.pf2(pf2.count, team.max_pf2)}</p>
      {team.players.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t.colPlayer}</th>
                <th scope="col">{t.club}</th>
                <th scope="col">{t.classification}</th>
                <th scope="col">{t.colStatus}</th>
                <th scope="col">{t.answer}</th>
              </tr>
            </thead>
            <tbody>
              {team.players.map((x: { id: string; profile_id: string; full_name: string; club: string; classification: string; status: string; availability: string; availability_note: string }) => (
                <tr key={x.id}>
                  <th scope="row">{x.full_name}</th>
                  <td>{x.club}</td>
                  <td>{x.classification}</td>
                  <td>
                    <select aria-label={t.statusOf(x.full_name)} value={x.status} disabled={busy} onChange={(e) => void send({ action: "select", teamId: team.id, profileId: x.profile_id, status: e.target.value })}>
                      {selectionStatuses.map((st) => (
                        <option key={st} value={st}>
                          {t.statuses[st]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Badge tone={x.availability === "available" ? "success" : x.availability === "unavailable" ? "danger" : "neutral"}>{t.availability[x.availability]}</Badge>
                    {x.availability_note && <span className="muted small"> · {x.availability_note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="tag-filter">
        <summary>{t.search}</summary>
        <div className="toolbar-filters">
          <label className="compact-field">
            {t.search}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="compact-field">
            {t.club}
            <select value={club} onChange={(e) => setClub(e.target.value)}>
              <option value="">{t.all}</option>
              {clubs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="compact-field">
            {t.classification}
            <select value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">{t.all}</option>
              <option value="PF1">PF1</option>
              <option value="PF2">PF2</option>
            </select>
          </label>
          <label className="compact-field">
            {t.ageCategory}
            <select value={age} onChange={(e) => setAge(e.target.value)}>
              <option value="">{t.all}</option>
              {(["u18", "u23", "senior"] as const).map((a) => (
                <option key={a} value={a}>
                  {t.ages[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} />
            {t.licensed}
          </label>
        </div>
        <ul className="plain-list">
          {found.slice(0, 50).map((x) => (
            <li key={x.id}>
              {x.full_name} · {x.club} · {x.classification}{" "}
              <Button size="sm" variant="secondary" disabled={busy || !x.licensed} onClick={() => void send({ action: "select", teamId: team.id, profileId: x.id, status: "preselected" })}>
                {t.add(x.full_name)}
              </Button>
            </li>
          ))}
        </ul>
      </details>

      <h3>{t.gatherings}</h3>
      <ul className="plain-list">
        {team.gatherings.map((g: { id: string; kind: string; title: string; starts_at: string; place: string }) => (
          <li key={g.id}>
            {t.kinds[g.kind]} · <strong>{g.title}</strong> · {day(g.starts_at)}
            {g.place ? ` · ${g.place}` : ""}
          </li>
        ))}
      </ul>
      <form
        className="stack-form"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const iso = (v: FormDataEntryValue | null) => new Date(String(v)).toISOString();
          void send({ action: "gathering", teamId: team.id, kind: f.get("kind"), title: f.get("title"), startsAt: iso(f.get("starts")), endsAt: iso(f.get("ends")), place: f.get("place") ?? "" }).then((r) => r && form.reset());
        }}
      >
        <div className="form-grid">
          <label>
            {t.kind}
            <select name="kind" defaultValue="camp">
              {gatheringKinds.map((k) => (
                <option key={k} value={k}>
                  {t.kinds[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.titleLabel}
            <input name="title" required minLength={2} maxLength={120} />
          </label>
          <label>
            {t.starts}
            <input name="starts" type="datetime-local" required />
          </label>
          <label>
            {t.ends}
            <input name="ends" type="datetime-local" required />
          </label>
          <label>
            {t.place}
            <input name="place" maxLength={200} />
          </label>
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {t.newGathering}
        </Button>
      </form>

      {data.tournaments.length > 0 && (
        <>
          <h3>{t.tournament}</h3>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const guest = String(f.get("guest") ?? "").trim();
              void send(guest ? { action: "guestTeam", tournamentId: f.get("tournament"), name: guest } : { action: "enterTournament", tournamentId: f.get("tournament"), teamId: team.id });
            }}
          >
            <div className="form-grid">
              <label>
                {t.tournament}
                <select name="tournament" required>
                  {(data.tournaments as { id: string; name: string }[]).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.guest}
                <input name="guest" maxLength={80} />
              </label>
            </div>
            <Button type="submit" variant="secondary" disabled={busy}>
              {t.enterOrGuest}
            </Button>
          </form>
        </>
      )}
      <h3>{t.award}</h3>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void send({ action: "award", teamId: team.id, title: f.get("title"), competition: f.get("competition") ?? "", place: f.get("rank") ? Number(f.get("rank")) : null, awardedOn: f.get("on") });
        }}
      >
        <div className="form-grid">
          <label>
            {t.awardTitle}
            <input name="title" required minLength={2} maxLength={120} />
          </label>
          <label>
            {t.competition}
            <input name="competition" maxLength={120} />
          </label>
          <label>
            {t.rank}
            <input name="rank" type="number" min={1} max={500} />
          </label>
          <label>
            {t.awardedOn}
            <input name="on" type="date" required />
          </label>
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {t.award}
        </Button>
      </form>
    </Card>
  );
}

/** 6: /federation/national, for the presidency and the competitions officers. */
export function NationalTeams({ locale }: { locale: Locale }) {
  const t = nationalCopy[locale];
  const { data, error, setError, reload, denied } = useData<View>("/api/national", (code) => fail(locale, code));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/national", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data?.federation_id }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await reload();
      setMessage(typeof v.told === "number" ? t.told(v.told) : t.saved);
      return v as Record<string, unknown>;
    } catch (e) {
      setError(fail(locale, (e as Error).message));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="access national">
      <PageHeader title={t.title} subtitle={t.intro} />
      {denied && <p>{t.forbidden}</p>}
      {error && <p role="alert">{error}</p>}
      <p role="status">{!data && !error && !denied ? t.loading : message}</p>
      {data && (
        <>
          <Card title={t.newTeam} labelledBy="national-new" headingId="national-new">
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                void send({ action: "team", name: f.get("name"), category: f.get("category"), season: f.get("season"), maxPf2: f.get("maxPf2") ? Number(f.get("maxPf2")) : null }).then((r) => r && form.reset());
              }}
            >
              <div className="form-grid">
                <label>
                  {t.name}
                  <input name="name" required minLength={2} maxLength={80} />
                </label>
                <label>
                  {t.category}
                  <select name="category" defaultValue="senior">
                    {teamCategories.map((c) => (
                      <option key={c} value={c}>
                        {t.categories[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.season}
                  <input name="season" required pattern="\d{4}-\d{2}" defaultValue={data.season} />
                </label>
                <label>
                  {t.maxPf2}
                  <input name="maxPf2" type="number" min={0} max={20} />
                </label>
              </div>
              <Button type="submit" disabled={busy}>
                {t.save}
              </Button>
            </form>
          </Card>
          {data.teams.length ? data.teams.map((team) => <TeamCard key={team.id} locale={locale} data={data} team={team} busy={busy} send={send} />) : <EmptyState icon="medal" title={t.title} />}
        </>
      )}
    </main>
  );
}

/** 6: « Sélection nationale » on a player's sheet (club, player and parent); the player or the parent answers. */
export function NationalCard({ locale, profileId }: { locale: Locale; profileId: string }) {
  const t = nationalCopy[locale];
  const [data, setData] = useState<Player | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      fetch(`/api/national/player?id=${profileId}`, { cache: "no-store" })
        .then(async (r) => (r.ok ? setData(await r.json()) : setData(null)))
        .catch(() => setData(null)),
    [profileId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data?.selections.length) return null;
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/national/player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await load();
      setMessage(t.saved);
    } catch (e) {
      setError(fail(locale, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
  return (
    <section className="card national-card" aria-labelledby={`national-${profileId}`}>
      <h2 id={`national-${profileId}`}>
        {t.sheet} <Badge tone="primary">{t.badge}</Badge>
      </h2>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data.selections.map((x) => (
        <article key={x.id} className="progress-note">
          <p>
            <strong>
              {x.team} · {x.season}
            </strong>{" "}
            <Badge tone={x.status === "selected" ? "success" : "info"}>{t.statuses[x.status]}</Badge> · {t.caps(x.caps, x.goals)}
          </p>
          <p className="small">
            {t.answer} : <Badge tone={x.availability === "available" ? "success" : x.availability === "unavailable" ? "danger" : "neutral"}>{t.availability[x.availability]}</Badge>
          </p>
          {data.can.answer && (
            <form
              className="exercise-tag-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send({ action: "availability", selectionId: x.id, availability: f.get("availability"), note: String(f.get("note") ?? "") });
              }}
            >
              <select name="availability" aria-label={t.answer} defaultValue={x.availability === "unavailable" ? "unavailable" : "available"}>
                <option value="available">{t.available}</option>
                <option value="unavailable">{t.unavailable}</option>
              </select>
              <input name="note" aria-label={t.note} maxLength={500} placeholder={t.note} defaultValue={x.availability_note} />
              <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                {t.send}
              </Button>
            </form>
          )}
          {x.gatherings.length > 0 && (
            <ul className="plain-list">
              {x.gatherings.map((g: { id: string; title: string; kind: string; starts_at: string; place: string; response: string }) => (
                <li key={g.id}>
                  {t.kinds[g.kind]} · {g.title} · {day(g.starts_at)} · {t.responses[g.response]}
                  {data.can.answer && (
                    <>
                      {" "}
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "gathering", gatheringId: g.id, selectionId: x.id, response: "present" })}>
                        {t.present}
                      </Button>{" "}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send({ action: "gathering", gatheringId: g.id, selectionId: x.id, response: "absent" })}>
                        {t.absent}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {x.honours.length > 0 && (
            <p className="small">
              <strong>{t.honours}</strong> : {x.honours.map((h: { title: string; place: number | null }) => (h.place ? `${h.title} (${h.place})` : h.title)).join(", ")}
            </p>
          )}
          {data.can.answer && (
            <details>
              <summary>{t.consent}</summary>
              <p className="muted small">{t.consentIntro}</p>
              {x.consent ? (
                <p>
                  {t.consentActive(day(x.consent.starts_on), day(x.consent.ends_on))}{" "}
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void send({ action: "revoke", consentId: x.consent.id })}>
                    {t.consentRevoke}
                  </Button>
                </p>
              ) : (
                <form
                  className="exercise-tag-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void send({ action: "consent", selectionId: x.id, startsOn: f.get("from"), endsOn: f.get("to") });
                  }}
                >
                  <label>
                    {t.consentFrom}
                    <input name="from" type="date" required />
                  </label>
                  <label>
                    {t.consentTo}
                    <input name="to" type="date" required />
                  </label>
                  <Button type="submit" size="sm" disabled={busy}>
                    {t.consentGive}
                  </Button>
                </form>
              )}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}

/** 6: the club's calendar shows the national gatherings of its players, read only. */
export function NationalGatherings({ locale, items }: { locale: Locale; items: { id: string; kind: string; title: string; starts_at: string; place: string; team: string; players: string[] }[] }) {
  const t = nationalCopy[locale];
  if (!items.length) return null;
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
  return (
    <section className="card national-calendar" aria-labelledby="national-calendar">
      <h2 id="national-calendar">
        {t.calendar} <Badge tone="primary">{t.badge}</Badge>
      </h2>
      <p className="muted small">{t.calendarIntro}</p>
      <ul className="plain-list">
        {items.map((g) => (
          <li key={g.id}>
            <strong>{g.title}</strong> · {g.team} · {t.kinds[g.kind]} · {day(g.starts_at)}
            {g.place ? ` · ${g.place}` : ""}
            <span className="muted small"> · {t.players(g.players.join(", "))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
