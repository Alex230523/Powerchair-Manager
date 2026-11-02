"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { teamsView, teamDetail, TeamCard, RosterRow } from "@/domains/teams/service";
import { teamColors } from "@/domains/teams/colors";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { undoToast } from "./toast";
import { toastCopy } from "./toast-copy";
import { useScope, scopedHref } from "./use-scope";
import { teamsCopy } from "./teams-copy";
import { TeamBoard } from "./team-board";
import { teamBoardCopy } from "./team-board-copy";
import { shellCopy } from "./shell-copy";
import { kindLabels } from "./calendar-copy";
import { Badge, Card, EmptyState, PageHeader, Tabs } from "./ui";
import { ClubIdentity } from "./club-identity";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { initials } from "./app-shell";
import { cssVars } from "./css-vars";

type View = Awaited<ReturnType<typeof teamsView>>;
type Detail = Awaited<ReturnType<typeof teamDetail>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const fillIn = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
/** The places field of a team form: a number, or nothing for no limit. */
const capacityOf = (f: FormData) => {
  const v = String(f.get("capacity") ?? "").trim();
  return v ? Number(v) : null;
};

/** "8 sur 10 places", a fine bar, and a badge at one place left or when full (wave 16, R1). */
export function TeamPlaces({ locale, players, capacity }: { locale: Locale; players: number; capacity: number | null }) {
  const p = (teamsCopy[locale] as (typeof teamsCopy)["fr"]).places;
  if (capacity === null) return null;
  const free = capacity - players;
  return (
    <span className="team-places">
      <span className="team-places-text">
        {fillIn(p.of, { n: players, max: capacity })}
        {free < 0 ? (
          <Badge tone="danger">{fillIn(p.over, { n: -free })}</Badge>
        ) : free === 0 ? (
          <Badge tone="danger">{p.full}</Badge>
        ) : free === 1 ? (
          <Badge tone="warning">{p.lastOne}</Badge>
        ) : null}
      </span>
      <span className="places-bar" aria-hidden="true" data-state={free <= 0 ? "full" : free === 1 ? "last" : "ok"}>
        <span style={cssVars({ fill: `${Math.min(100, Math.round((100 * players) / capacity))}%` })} />
      </span>
    </span>
  );
}

function ColorPicker({ name, value, labels, noColor }: { name: string; value: string | null; labels: Record<string, string>; noColor: string }) {
  const [chosen, setChosen] = useState(value ?? "");
  return (
    <fieldset className="color-picker">
      <legend className="sr-only">{name}</legend>
      <input type="hidden" name="color" value={chosen} />
      <button type="button" className="color-swatch" data-color="none" aria-pressed={chosen === ""} aria-label={noColor} onClick={() => setChosen("")}>
        <span className="team-dot" aria-hidden="true" />
      </button>
      {teamColors.map((c) => (
        <button type="button" key={c} className="color-swatch" data-color={c} aria-pressed={chosen === c} aria-label={labels[c]} onClick={() => setChosen(c)}>
          <span className="team-dot" aria-hidden="true" />
        </button>
      ))}
    </fieldset>
  );
}
function TeamForm({
  locale,
  team,
  people,
  busy,
  onSubmit,
}: {
  locale: Locale;
  team?: TeamCard;
  people: { id: string; full_name: string }[];
  busy: boolean;
  onSubmit: (f: FormData) => void;
}) {
  const t = (teamsCopy[locale] as (typeof teamsCopy)["fr"]).sheet;
  return (
    <form
      className="finance-form"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="form-pair">
        <label>
          {t.teamName}
          <input name="name" required minLength={2} maxLength={100} defaultValue={team?.name ?? ""} />
        </label>
        <label>
          {t.category}
          <input name="category" maxLength={80} defaultValue={team?.category ?? ""} />
        </label>
      </div>
      <div className="form-pair">
        <label>
          {t.level}
          <input name="level" maxLength={80} defaultValue={team?.level ?? ""} />
        </label>
        <label>
          {t.place}
          <input name="homeLocation" maxLength={160} defaultValue={team?.home_location ?? ""} />
        </label>
      </div>
      <div className="form-pair">
        <label>
          {(teamsCopy[locale] as (typeof teamsCopy)["fr"]).places.capacity}
          <input name="capacity" type="number" min={1} max={100} inputMode="numeric" defaultValue={team?.capacity ?? ""} />
        </label>
      </div>
      <p className="muted small">{t.color}</p>
      <ColorPicker name={t.color} value={team?.color ?? null} labels={t.colors} noColor={t.noColor} />
      {team && (
        <>
          <label>
            {t.contact}
            <select name="staffContactId" defaultValue={team.staff_contact_id ?? ""}>
              <option value="">{t.noContact}</option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>{x.full_name}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="archived" defaultChecked={team.archived} />
            {t.archive}
          </label>
        </>
      )}
      <p className="muted small">{t.settingsHint}</p>
      <div className="actions">
        <button className="button" disabled={busy}>{t.save}</button>
      </div>
    </form>
  );
}

/** One card per team of the season (wave 12). */
export function Teams({ locale }: { locale: Locale }) {
  const t = teamsCopy[locale] as (typeof teamsCopy)["fr"];
  const s = shellCopy[locale];
  const scope = useScope();
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/teams" + (scope.seasonId ? `?season=${scope.seasonId}` : ""), failure);
  const { busy, message, post } = usePost("/api/teams", reload, setError, failure);
  const [creating, setCreating] = useState(false);
  if (!data)
    return (
      <main id="main" className="access teams">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Brussels" }).format(new Date(d));
  const live = data.teams.filter((x) => !x.archived);
  const subtitle = (live.length === 1 ? t.one : t.subtitle).replace("{season}", data.season?.name ?? "").replace("{n}", String(live.length));
  const link = (base: string, teamId: string) => `/${locale}${scopedHref(base, { seasonId: data.seasonId, teamId }, scope.seasons)}`;
  return (
    <main id="main" className="access teams">
      <PageHeader
        title={t.title}
        subtitle={subtitle}
        actions={
          data.can.manage && (
            <>
              <Link className="button secondary" href={`/${locale}/club/rollover`}>{t.rollover}</Link>
              <button type="button" className="button" onClick={() => setCreating(true)}>{t.newTeam}</button>
            </>
          )
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {data.teams.length ? (
        <ul className="team-grid">
          {data.teams.map((team) => (
            <li key={team.id} className="team-card" data-color={team.color ?? "none"} data-archived={team.archived || undefined}>
              <Link className="team-card-link" href={`/${locale}/teams/${team.id}`} aria-label={`${t.open} : ${team.name}`}>
                <span className="team-card-head">
                  <span className="team-dot" aria-hidden="true" />
                  <span className="team-card-name">{team.name}</span>
                  {team.archived && <Badge tone="neutral">{t.archived}</Badge>}
                </span>
                <span className="team-card-sub">{[team.category, team.level].filter(Boolean).join(" · ") || " "}</span>
              </Link>
              <TeamPlaces locale={locale} players={team.players} capacity={team.capacity} />
              <dl className="team-stats">
                <div>
                  <dt>{t.players}</dt>
                  <dd>{team.players}</dd>
                </div>
                <div>
                  <dt>{t.attendance}</dt>
                  <dd>{team.attendance === null ? <span className="muted small">{t.noAttendance}</span> : `${team.attendance} %`}</dd>
                </div>
                <div>
                  <dt>{t.documents}</dt>
                  <dd data-tone={team.documents_due ? "warn" : "ok"}>{team.documents_due}</dd>
                </div>
                <div>
                  <dt>{t.next}</dt>
                  <dd>
                    {team.next_event ? (
                      <span className="small">{day(team.next_event.starts_at)} · {kindLabels[locale][team.next_event.kind as keyof (typeof kindLabels)["fr"]] ?? team.next_event.kind}</span>
                    ) : (
                      <span className="muted small">{t.noNext}</span>
                    )}
                  </dd>
                </div>
              </dl>
              <div className="team-coaches" aria-label={t.coaches}>
                {team.coaches.length ? (
                  team.coaches.map((c) => (
                    <span key={c.id} className="avatar avatar-small" title={c.full_name}>
                      {initials(c.full_name)}
                      <span className="sr-only">{c.full_name}</span>
                    </span>
                  ))
                ) : (
                  <span className="muted small">{t.noCoach}</span>
                )}
              </div>
              <div className="team-card-foot">
                <Link href={link("/players", team.id)}>{t.roster}</Link>
                <Link href={link("/calendar", team.id)}>{t.calendar}</Link>
                <Link href={link("/attendance", team.id)}>{t.presence}</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.empty} icon="team" action={data.can.manage && <button type="button" className="button" onClick={() => setCreating(true)}>{t.newTeam}</button>} />
      )}
      {creating && data.seasonId && (
        <Modal title={t.newTeam} close={() => setCreating(false)}>
          <TeamForm
            locale={locale}
            people={data.people}
            busy={busy}
            onSubmit={(f) =>
              void post(
                {
                  organizationId: data.organization_id,
                  action: "create",
                  seasonId: data.seasonId,
                  name: String(f.get("name") ?? ""),
                  category: String(f.get("category") ?? ""),
                  level: String(f.get("level") ?? ""),
                  homeLocation: String(f.get("homeLocation") ?? ""),
                  color: String(f.get("color") ?? "") || null,
                  capacity: capacityOf(f),
                },
                t.saved,
              ).then((ok) => ok && setCreating(false))
            }
          />
        </Modal>
      )}
      {/* 12: the teams' colours, here since « Gestion du club » is gone. */}
      {data.can.manage && <ClubIdentity locale={locale} only="teams" />}
      <p className="muted small">
        <Icon name="team" /> {s.teams}
      </p>
    </main>
  );
}

/** The team sheet: roster, staff and settings (wave 12). */
export function TeamSheet({ locale, id }: { locale: Locale; id: string }) {
  const t = teamsCopy[locale] as (typeof teamsCopy)["fr"];
  const sh = t.sheet;
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<Detail>(`/api/teams?id=${id}`, failure);
  const { busy, message, post, postFor } = usePost("/api/teams", reload, setError, failure);
  const [tab, setTab] = useState<"overview" | "roster" | "staff" | "settings">("overview"),
    [moving, setMoving] = useState<RosterRow | null>(null);
  if (!data)
    return (
      <main id="main" className="access team-sheet">
        <PageHeader title={t.title} />
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );
  const team = data.team;
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  // A6: the dashboard first.
  const tabs = (["overview", "roster", "staff", "settings"] as const).filter((k) => k !== "settings" || data.can.manage);
  const tabLabel = (k: (typeof tabs)[number]) => (k === "overview" ? teamBoardCopy[locale].tab : sh.tabs[k]);
  return (
    <main id="main" className="access team-sheet" data-color={team.color ?? "none"}>
      <p>
        <Link href={`/${locale}/teams`}>← {sh.back}</Link>
      </p>
      <PageHeader
        eyebrow={[team.category, team.level].filter(Boolean).join(" · ")}
        title={team.name}
        subtitle={
          <span className="team-sheet-meta">
            <span className="team-chip" data-color={team.color ?? "none"}>
              <span className="team-dot" aria-hidden="true" />
              {team.players} {t.players.toLowerCase()}
            </span>
            {team.staff_contact_name && <span> · {sh.contact} : {team.staff_contact_name}</span>}
            <TeamPlaces locale={locale} players={team.players} capacity={team.capacity} />
          </span>
        }
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Tabs label={team.name} items={tabs.map((k) => ({ id: k, label: tabLabel(k) }))} value={tab} onChange={(id) => setTab(id as typeof tab)} idPrefix="team-tab" panelId={(id) => `team-panel-${id}`} />
      {tab === "overview" && (
        <div role="tabpanel" id="team-panel-overview" aria-labelledby="team-tab-overview">
          <TeamBoard locale={locale} data={data} />
        </div>
      )}
      {tab === "roster" && (
        <div role="tabpanel" id="team-panel-roster" aria-labelledby="team-tab-roster"><Card id="team-panel-roster-card" className="flush" title={sh.tabs.roster}>
          {data.roster.length ? (
            <div className="table-scroll">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th scope="col">{sh.number}</th>
                    <th scope="col">{sh.name}</th>
                    <th scope="col">{sh.position}</th>
                    <th scope="col">{sh.chair}</th>
                    <th scope="col">{sh.documents}</th>
                    <th scope="col">{sh.presence}</th>
                    <th scope="col"><span className="sr-only">{sh.move}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.roster.map((r) => (
                    <tr key={r.membership_id}>
                      <td className="num">{r.jersey_number ?? "…"}</td>
                      <th scope="row">
                        <Link href={`/${locale}/players/${r.profile_id}`}>{r.full_name}</Link>
                      </th>
                      <td>{r.position || r.playing_position}</td>
                      <td>{r.chair ?? <span className="muted">{sh.noChair}</span>}</td>
                      <td>{r.documents_due ? <Badge tone="warning">{r.documents_due}</Badge> : <Badge tone="success">{sh.ok}</Badge>}</td>
                      <td>{r.attendance === null ? "…" : `${r.attendance} %`}</td>
                      <td className="row-actions">
                        {data.can.manage && data.others.length > 0 && (
                          <button type="button" className="text-button" onClick={() => setMoving(r)}>
                            {sh.move}<span className="sr-only"> : {r.full_name}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={sh.emptyRoster} icon="players" />
          )}
        </Card></div>
      )}
      {tab === "staff" && (
        <div role="tabpanel" id="team-panel-staff" aria-labelledby="team-tab-staff"><Card id="team-panel-staff-card" title={sh.tabs.staff}>
          {data.staff.length ? (
            <ul className="records">
              {data.staff.map((m) => (
                <li key={m.membership_id}>
                  <span className="avatar avatar-small" aria-hidden="true">{initials(m.full_name)}</span>{" "}
                  <Link href={`/${locale}/coaches/${m.profile_id}`}>{m.full_name}</Link>
                  <span className="muted"> · {sh.roles[m.role] ?? m.role} · {sh.since} {day(m.starts_on)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={sh.emptyStaff} icon="whistle" />
          )}
        </Card></div>
      )}
      {tab === "settings" && data.can.manage && (
        <div role="tabpanel" id="team-panel-settings" aria-labelledby="team-tab-settings"><Card id="team-panel-settings-card" title={sh.tabs.settings}>
          <TeamForm
            locale={locale}
            team={team}
            people={data.people}
            busy={busy}
            onSubmit={(f) =>
              void post(
                {
                  organizationId: data.organization_id,
                  action: "settings",
                  id: team.id,
                  name: String(f.get("name") ?? ""),
                  category: String(f.get("category") ?? ""),
                  level: String(f.get("level") ?? ""),
                  homeLocation: String(f.get("homeLocation") ?? ""),
                  color: String(f.get("color") ?? "") || null,
                  staffContactId: String(f.get("staffContactId") ?? "") || null,
                  archived: f.get("archived") === "on",
                  capacity: capacityOf(f),
                },
                t.saved,
              )
            }
          />
        </Card></div>
      )}
      {moving && (
        <MoveDialog
          locale={locale}
          player={moving}
          fromTeamId={team.id}
          others={data.others}
          busy={busy}
          close={() => setMoving(null)}
          move={(body) =>
            postFor({ organizationId: data.organization_id, action: "move", ...body }, sh.moved).then((r) => {
              if (!r) return;
              setMoving(null);
              undoToast(locale, (r as { over?: boolean }).over ? t.places.movedOver : toastCopy[locale].moved, r.undo, data.organization_id, reload);
            })
          }
        />
      )}
    </main>
  );
}

/** The small "move to…" window, shared with the player file. */
export function MoveDialog({
  locale,
  player,
  fromTeamId,
  others,
  busy,
  close,
  move,
}: {
  locale: Locale;
  player: { profile_id: string; full_name: string };
  fromTeamId: string | null;
  others: { id: string; name: string; color?: string | null; capacity?: number | null; players?: number }[];
  busy: boolean;
  close: () => void;
  move: (body: { profileId: string; fromTeamId: string | null; toTeamId: string; effectiveOn: string; keep: boolean }) => Promise<unknown>;
}) {
  const sh = (teamsCopy[locale] as (typeof teamsCopy)["fr"]).sheet;
  const places = (teamsCopy[locale] as (typeof teamsCopy)["fr"]).places;
  const [to, setTo] = useState(others[0]?.id ?? "");
  const target = others.find((o) => o.id === to);
  // A full destination is said, never blocked (wave 16, R1).
  const full = target && target.capacity != null && (target.players ?? 0) >= target.capacity;
  return (
    <Modal title={sh.moveTitle.replace("{name}", player.full_name)} close={close}>
      {others.length ? (
        <form
          className="finance-form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void move({
              profileId: player.profile_id,
              fromTeamId,
              toTeamId: String(f.get("to") ?? ""),
              effectiveOn: String(f.get("date") ?? ""),
              keep: f.get("keep") === "on",
            });
          }}
        >
          <label>
            {sh.destination}
            <select name="to" required value={to} onChange={(e) => setTo(e.target.value)}>
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          {full && (
            <p className="notice" role="status">
              {fillIn(places.moveFull, { team: target.name, n: target.players ?? 0, max: target.capacity ?? 0 })}
            </p>
          )}
          <label>
            {sh.effectiveOn}
            <input name="date" type="date" required defaultValue={todayIso()} />
          </label>
          {fromTeamId && (
            <label className="check">
              <input type="checkbox" name="keep" />
              {sh.keep}
            </label>
          )}
          <div className="actions">
            <button className="button" disabled={busy}>{sh.confirmMove}</button>
            <button type="button" className="button secondary" onClick={close}>{sh.cancel}</button>
          </div>
        </form>
      ) : (
        <EmptyState title={sh.noOther} />
      )}
    </Modal>
  );
}
