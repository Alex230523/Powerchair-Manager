"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Locale } from "@/lib/locale";
import type { peopleView } from "@/domains/people/service";
import { rosterRoles, ageOn } from "@/domains/people/schema";
import { labels } from "@/domains/access/policy";
import { peopleCopy, peopleErrors } from "./people-copy";
import { errors } from "./access-copy";
import { Panel, Button } from "./ui";
import { DataGrid, downloadCsv, postCommand } from "./data-grid";
import { eachRow } from "./table-state";
import { bulkCopy } from "./bulk-copy";
import { undoToast } from "./toast";
import { toastCopy } from "./toast-copy";
type View = Awaited<ReturnType<typeof peopleView>>;
type Profile = View["profiles"][number];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
export function People({
  locale,
  management = false,
  children,
}: {
  locale: Locale;
  management?: boolean;
  /** Extra sections shown under the title (club identity on the management page). */
  children?: React.ReactNode;
}) {
  const t = peopleCopy[locale],
    day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const [data, setData] = useState<View | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [token, setToken] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const errorText = useCallback(
    (code: string) =>
      peopleErrors[code]?.[locale] ?? errors[code]?.[locale] ?? t.unavailable,
    [locale, t.unavailable],
  );
  const load = useCallback(async () => {
    const response = await fetch("/api/people" + (query ? "?" + query : ""), {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setData(body);
  }, [query]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/people" + (query ? "?" + query : ""), { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body;
      })
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setFailure("");
        }
      })
      .catch((e) => {
        if (!cancelled) setFailure(errorText(e.message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, errorText]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setFailure(errorText(e instanceof Error ? e.message : "UNAVAILABLE"));
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void task(() => fn(form));
  }
  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, organizationId: data?.context.id }),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    await load();
    setMessage(t.saved);
    return value;
  }
  async function confirm(key: string, body: Record<string, unknown>) {
    if (confirmation !== key) {
      setConfirmation(key);
      setMessage(t.confirm);
      return;
    }
    await send(body);
    setConfirmation("");
  }
  const p = data?.profiles.find((profile) => profile.id === selected),
    pm = !!data?.capabilities.peopleManage,
    tm = !!data?.capabilities.teamsManage;
  const teamName = (id: string) =>
    data?.teams.find((team) => team.id === id)?.name ?? t.team;
  const personName = (id: string) =>
    data?.profiles.find((profile) => profile.id === id)?.full_name ?? t.person;
  const statusName = (status: string) =>
    t[status as "active" | "inactive" | "archived" | "transferred"] ?? status;
  const teamsLabel = (profile: Profile) => [...new Set(profile.assignments.map((a) => teamName(a.team_id)))].join(", ");
  const b = bulkCopy[locale];
  function profileFields(profile?: Profile) {
    return (
      <>
        <Field label={t.name}>
          <input
            name="fullName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={profile?.full_name}
            autoComplete="name"
          />
        </Field>
        <Field label={t.birth}>
          <input
            name="birthDate"
            type="date"
            max={day}
            defaultValue={profile?.birth_date ?? ""}
          />
        </Field>
        <Field label={t.email}>
          <input
            name="email"
            type="email"
            maxLength={254}
            defaultValue={profile?.email ?? ""}
            autoComplete="email"
          />
        </Field>
        <Field label={t.phone}>
          <input
            name="phone"
            type="tel"
            maxLength={40}
            defaultValue={profile?.phone ?? ""}
            autoComplete="tel"
          />
        </Field>
        <Field label={t.joined}>
          <input
            name="joinedOn"
            type="date"
            required
            max={day}
            defaultValue={profile?.joined_on ?? day}
          />
        </Field>
      </>
    );
  }
  const formProfile = (f: FormData) => ({
    fullName: String(f.get("fullName")),
    birthDate: f.get("birthDate") || null,
    email: String(f.get("email") ?? ""),
    phone: String(f.get("phone") ?? ""),
    joinedOn: String(f.get("joinedOn")),
  });
  const profileOptions = () =>
    data?.profiles
      .filter((profile) => profile.status === "active")
      .map((profile) => (
        <option value={profile.id} key={profile.id}>
          {profile.full_name}
        </option>
      ));
  const teamOptions = () =>
    data?.teams
      .filter((team) => !team.archived && !team.season_archived)
      .map((team) => (
        <option key={team.id} value={team.id}>
          {team.name} ·{" "}
          {data.seasons.find((s) => s.id === team.season_id)?.name}
        </option>
      ));
  return (
    <>
      <main id="main" className="access club">
        <h1>
          {management
            ? locale === "fr"
              ? "Gestion du club"
              : locale === "nl"
                ? "Club beheren"
                : "Club management"
            : t.title}
        </h1>
        <p>{t.intro}</p>
        <div role="status" aria-live="polite">
          {loading ? t.loading : message}
        </div>
        {failure && (
          <p role="alert" className="error-message">
            {failure}
          </p>
        )}
        {children}
        {!data && !loading && (
          <p>
            <Link href={`/${locale}/access`}>{t.missing}</Link>
          </p>
        )}
        {data && (
          <>
            <p className="notice">
              <strong>{data.context.name}</strong> ·{" "}
              {labels[data.context.role][locale]}
            </p>
            <div className="actions section-nav">
              {!management && <a href="#directory">{t.people}</a>}
              <a href="#teams">{t.teams}</a>
              {!management && <a href="#families">{t.family}</a>}
            </div>
            {!management && (
              <section id="directory">
                {data.capabilities.canExport && (
                  <p>
                    <a
                      href={`/api/people/export?organizationId=${data.context.id}&${query}`}
                    >
                      {t.exportCsv}
                    </a>
                  </p>
                )}
                <Panel title={t.people}>
                  <form
                    className="filters"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget),
                        params = new URLSearchParams();
                      for (const [key, value] of form)
                        if (String(value)) params.set(key, String(value));
                      setQuery(params.toString());
                    }}
                  >
                    <Field label={t.search}>
                      <input name="q" type="search" maxLength={120} />
                    </Field>
                    <Field label={t.status}>
                      <select name="status">
                        {[
                          "active",
                          "inactive",
                          "archived",
                          "transferred",
                          "all",
                        ].map((status) => (
                          <option key={status} value={status}>
                            {status === "all" ? t.all : statusName(status)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t.team}>
                      <select name="team">
                        <option value="">{t.all}</option>
                        {data.teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t.season}>
                      <select name="season">
                        <option value="">{t.all}</option>
                        {data.seasons.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t.sportRole}>
                      <select name="sportRole">
                        <option value="">{t.all}</option>
                        {rosterRoles.map((role) => (
                          <option key={role} value={role}>
                            {t[role]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {data.capabilities.peopleRead && (
                      <>
                        <Field label={t.minAge}>
                          <input
                            name="minAge"
                            type="number"
                            min={0}
                            max={120}
                          />
                        </Field>
                        <Field label={t.maxAge}>
                          <input
                            name="maxAge"
                            type="number"
                            min={0}
                            max={120}
                          />
                        </Field>
                        <Field label={t.joinedBefore}>
                          <input name="joinedBefore" type="date" />
                        </Field>
                      </>
                    )}
                    <Button disabled={busy}>{t.filter}</Button>
                  </form>
                  <DataGrid
                    locale={locale}
                    label={t.people}
                    caption={`${t.people} · ${data.total}`}
                    storageKey="club-directory"
                    rows={data.profiles}
                    rowId={(r) => r.id}
                    rowName={(r) => r.full_name}
                    onDone={load}
                    columns={[
                      { key: "name", header: t.name, rowHeader: true, hideable: false, sort: (r) => r.full_name, cell: (r) => r.full_name },
                      { key: "status", header: t.status, sort: (r) => statusName(r.status), cell: (r) => statusName(r.status) },
                      { key: "team", header: t.team, sort: (r) => teamsLabel(r), cell: (r) => teamsLabel(r) || "—" },
                      {
                        key: "actions",
                        header: t.actions,
                        hideable: false,
                        cell: (r) => (
                          <button className="text-button" onClick={() => setSelected(r.id)} aria-label={`${t.open} : ${r.full_name}`}>
                            {t.open}
                          </button>
                        ),
                      },
                    ]}
                    actions={[
                      {
                        id: "status",
                        label: b.status,
                        icon: "user",
                        hidden: !data.capabilities.peopleManage,
                        choose: { label: b.newStatus, options: (["active", "inactive", "archived"] as const).map((v) => ({ value: v, label: statusName(v) })) },
                        run: (rows, status) =>
                          eachRow(rows, (r) => r.id, async (r) => {
                            await postCommand("/api/people", { organizationId: data.context.id, action: "status", id: r.id, status });
                          }),
                      },
                      {
                        id: "export",
                        label: b.export,
                        icon: "document",
                        hidden: !data.capabilities.canExport,
                        run: async (rows) => downloadCsv(`club-${day}`, [t.name, t.status, t.team], rows.map((r) => [r.full_name, statusName(r.status), teamsLabel(r)])),
                      },
                    ]}
                  />
                  {!data.profiles.length && <p>{t.empty}</p>}
                  {!data.capabilities.peopleRead && (
                    <p className="muted">{t.readonly}</p>
                  )}
                </Panel>
              </section>
            )}
            {!management && pm && (
              <details className="panel">
                <summary>{t.addPerson}</summary>
                <form
                  onSubmit={(e) =>
                    submit(e, async (f) => {
                      const result = await send({
                        action: "createPerson",
                        ...formProfile(f),
                        ...(f.get("accountUserId")
                          ? { accountUserId: f.get("accountUserId") }
                          : {}),
                      });
                      setSelected(result.id);
                    })
                  }
                >
                  {profileFields()}
                  <Field label={t.account}>
                    <select name="accountUserId">
                      <option value="">{t.noAccount}</option>
                      {data.accounts.map((account) => (
                        <option value={account.id} key={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button disabled={busy}>{t.create}</Button>
                </form>
              </details>
            )}
            {!management && p && (
              <Panel title={`${t.profile} · ${p.full_name}`}>
                <button className="text-button" onClick={() => setSelected("")}>
                  {t.close}
                </button>
                {p.detailed ? (
                  <>
                    {p.birth_date && (
                      <p>
                        {t.age} : {ageOn(p.birth_date, day)}
                      </p>
                    )}
                    {pm ? (
                      <form
                        key={`${p.id}-${p.version}`}
                        onSubmit={(e) =>
                          submit(e, async (f) => {
                            await send({
                              action: "updatePerson",
                              id: p.id,
                              version: p.version,
                              ...formProfile(f),
                            });
                          })
                        }
                      >
                        {profileFields(p)}
                        <Button disabled={busy}>{t.save}</Button>
                      </form>
                    ) : (
                      <>
                        <dl>
                          <dt>{t.email}</dt>
                          <dd>{p.email || "—"}</dd>
                          <dt>{t.phone}</dt>
                          <dd>{p.phone || "—"}</dd>
                          <dt>{t.joined}</dt>
                          <dd>{p.joined_on}</dd>
                        </dl>
                        {p.can_edit && (
                          <form
                            key={`${p.id}-${p.version}`}
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await send({
                                  action: "contacts",
                                  id: p.id,
                                  version: p.version,
                                  email: f.get("email"),
                                  phone: f.get("phone"),
                                });
                              })
                            }
                          >
                            <Field label={t.email}>
                              <input
                                name="email"
                                type="email"
                                defaultValue={p.email ?? ""}
                              />
                            </Field>
                            <Field label={t.phone}>
                              <input
                                name="phone"
                                type="tel"
                                defaultValue={p.phone ?? ""}
                                maxLength={40}
                              />
                            </Field>
                            <Button disabled={busy}>{t.save}</Button>
                          </form>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p>{t.restricted}</p>
                )}
                <p className="muted">{t.sensitive}</p>
                <h3>{t.history}</h3>
                <ul className="records">
                  {p.assignments.map((a) => (
                    <li key={a.id}>
                      {teamName(a.team_id)} ·{" "}
                      {
                        t[
                          a.role as
                            | "player"
                            | "coach"
                            | "assistant"
                            | "volunteer"
                        ]
                      }{" "}
                      · {a.position}
                      <p className="muted">
                        {a.starts_on} → {a.ends_on ?? "—"}
                        {a.cancelled ? ` · ${t.cancelled}` : ""}
                      </p>
                      {tm &&
                        !a.closed_at &&
                        !a.cancelled &&
                        (!a.ends_on || a.ends_on >= day) && (
                          <form
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                const r = await send({
                                  action: "endAssignment",
                                  id: a.id,
                                  endsOn: f.get("endDate"),
                                });
                                undoToast(locale, toastCopy[locale].assignmentEnded, r.undo, data?.context.id, load);
                              })
                            }
                          >
                            <Field label={t.ends}>
                              <input
                                name="endDate"
                                type="date"
                                required
                                defaultValue={day}
                                min={a.starts_on}
                              />
                            </Field>
                            <Button disabled={busy}>{t.end}</Button>
                          </form>
                        )}
                    </li>
                  ))}
                </ul>
                {!p.assignments.length && <p>{t.empty}</p>}
                {pm && (
                  <>
                    <div className="actions">
                      {p.status !== "transferred" &&
                        (["active", "inactive", "archived"] as const)
                          .filter((status) => status !== p.status)
                          .map((status) => (
                            <Button
                              disabled={busy}
                              key={status}
                              onClick={() =>
                                void task(() =>
                                  confirm(p.id + status, {
                                    action: "status",
                                    id: p.id,
                                    status,
                                  }),
                                )
                              }
                            >
                              {status === "active"
                                ? t.restore
                                : status === "archived"
                                  ? t.archive
                                  : t.pause}
                            </Button>
                          ))}
                    </div>
                    {!p.has_account && (
                      <details>
                        <summary>{t.link}</summary>
                        <p className="muted">{t.linkHint}</p>
                        <form
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              await send({
                                action: "linkAccount",
                                id: p.id,
                                userId: f.get("userId"),
                              });
                            })
                          }
                        >
                          <Field label={t.account}>
                            <select name="userId" required>
                              {data.accounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Button disabled={busy || !data.accounts.length}>
                            {t.link}
                          </Button>
                        </form>
                      </details>
                    )}
                    {p.status === "active" && (
                      <details>
                        <summary>{t.transfer}</summary>
                        <p>{t.transferHint}</p>
                        <form
                          onSubmit={(e) =>
                            submit(e, async (f) => {
                              const result = await send({
                                action: "transfer",
                                id: p.id,
                                authorizationNote: f.get("authorizationNote"),
                              });
                              setToken(result.token);
                            })
                          }
                        >
                          <Field label={t.transferConsent}>
                            <input
                              name="authorizationNote"
                              required
                              minLength={5}
                              maxLength={300}
                            />
                          </Field>
                          <Button disabled={busy}>{t.issue}</Button>
                        </form>
                      </details>
                    )}
                  </>
                )}
              </Panel>
            )}
            <section id="teams">
              <Panel title={t.seasons}>
                <ul className="records">
                  {data.seasons.map((season) => (
                    <li key={season.id}>
                      <strong>{season.name}</strong> · {season.starts_on} →{" "}
                      {season.ends_on} ·{" "}
                      {season.archived ? t.archived : t.active}
                      {tm && (
                        <details>
                          <summary>
                            {t.edit} · {season.name}
                          </summary>
                          <form
                            key={`${season.id}-${season.starts_on}-${season.ends_on}`}
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await send({
                                  action: "updateSeason",
                                  id: season.id,
                                  name: f.get("name"),
                                  startsOn: f.get("startsOn"),
                                  endsOn: f.get("endsOn"),
                                });
                              })
                            }
                          >
                            <Field label={t.name}>
                              <input
                                name="name"
                                required
                                minLength={2}
                                maxLength={80}
                                defaultValue={season.name}
                              />
                            </Field>
                            <Field label={t.starts}>
                              <input
                                name="startsOn"
                                type="date"
                                required
                                defaultValue={season.starts_on}
                              />
                            </Field>
                            <Field label={t.ends}>
                              <input
                                name="endsOn"
                                type="date"
                                required
                                defaultValue={season.ends_on}
                              />
                            </Field>
                            <Button disabled={busy}>{t.save}</Button>
                          </form>
                        </details>
                      )}
                      {tm && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void task(async () => {
                              // Reversible: no confirmation, a message with "Annuler" instead (wave 15, C10).
                              const r = await send({
                                action: "seasonArchive",
                                id: season.id,
                                archived: !season.archived,
                              });
                              undoToast(locale, season.archived ? toastCopy[locale].seasonRestored : toastCopy[locale].seasonArchived, r.undo, data?.context.id, load);
                            })
                          }
                        >
                          {season.archived ? t.restore : t.archive}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {!data.seasons.length && <p>{t.empty}</p>}
                {tm && (
                  <details>
                    <summary>{t.addSeason}</summary>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          await send({
                            action: "season",
                            name: f.get("name"),
                            startsOn: f.get("startsOn"),
                            endsOn: f.get("endsOn"),
                          });
                        })
                      }
                    >
                      <Field label={t.name}>
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={80}
                        />
                      </Field>
                      <Field label={t.starts}>
                        <input name="startsOn" type="date" required />
                      </Field>
                      <Field label={t.ends}>
                        <input name="endsOn" type="date" required />
                      </Field>
                      <Button disabled={busy}>{t.create}</Button>
                    </form>
                  </details>
                )}
              </Panel>
              <Panel title={t.teams}>
                <ul className="records">
                  {data.teams.map((team) => (
                    <li key={team.id}>
                      <strong>{team.name}</strong> ·{" "}
                      {data.seasons.find((s) => s.id === team.season_id)?.name}
                      <p>
                        {[team.category, team.level, team.home_location]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {tm && (
                        <details>
                          <summary>
                            {t.edit} · {team.name}
                          </summary>
                          <form
                            key={`${team.id}-${team.name}`}
                            onSubmit={(e) =>
                              submit(e, async (f) => {
                                await send({
                                  action: "updateTeam",
                                  id: team.id,
                                  name: f.get("name"),
                                  category: f.get("category"),
                                  level: f.get("level"),
                                  homeLocation: f.get("homeLocation"),
                                });
                              })
                            }
                          >
                            <Field label={t.teamName}>
                              <input
                                name="name"
                                required
                                minLength={2}
                                maxLength={100}
                                defaultValue={team.name}
                              />
                            </Field>
                            <Field label={t.category}>
                              <input
                                name="category"
                                maxLength={80}
                                defaultValue={team.category}
                              />
                            </Field>
                            <Field label={t.level}>
                              <input
                                name="level"
                                maxLength={80}
                                defaultValue={team.level}
                              />
                            </Field>
                            <Field label={t.location}>
                              <input
                                name="homeLocation"
                                maxLength={160}
                                defaultValue={team.home_location}
                              />
                            </Field>
                            <Button disabled={busy}>{t.save}</Button>
                          </form>
                        </details>
                      )}
                      {tm && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void task(async () => {
                              // Reversible: no confirmation, a message with "Annuler" instead (wave 15, C10).
                              const r = await send({
                                action: "teamArchive",
                                id: team.id,
                                archived: !team.archived,
                              });
                              undoToast(locale, team.archived ? toastCopy[locale].teamRestored : toastCopy[locale].teamArchived, r.undo, data?.context.id, load);
                            })
                          }
                        >
                          {team.archived ? t.restore : t.archive}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {!data.teams.length && <p>{t.empty}</p>}
                {tm && (
                  <>
                    <details>
                      <summary>{t.addTeam}</summary>
                      <form
                        onSubmit={(e) =>
                          submit(e, async (f) => {
                            await send({
                              action: "team",
                              seasonId: f.get("seasonId"),
                              name: f.get("name"),
                              category: f.get("category"),
                              level: f.get("level"),
                              homeLocation: f.get("homeLocation"),
                            });
                          })
                        }
                      >
                        <Field label={t.season}>
                          <select name="seasonId" required>
                            {data.seasons
                              .filter((s) => !s.archived)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label={t.teamName}>
                          <input
                            name="name"
                            required
                            minLength={2}
                            maxLength={100}
                          />
                        </Field>
                        <Field label={t.category}>
                          <input name="category" maxLength={80} />
                        </Field>
                        <Field label={t.level}>
                          <input name="level" maxLength={80} />
                        </Field>
                        <Field label={t.location}>
                          <input name="homeLocation" maxLength={160} />
                        </Field>
                        <Button
                          disabled={
                            busy || !data.seasons.some((s) => !s.archived)
                          }
                        >
                          {t.create}
                        </Button>
                      </form>
                    </details>
                    <details>
                      <summary>{t.assign}</summary>
                      <form
                        onSubmit={(e) =>
                          submit(e, async (f) => {
                            await send({
                              action: "assign",
                              teamId: f.get("teamId"),
                              profileId: f.get("profileId"),
                              role: f.get("role"),
                              position: f.get("position"),
                              startsOn: f.get("startsOn"),
                              endsOn: f.get("endsOn") || null,
                            });
                          })
                        }
                      >
                        <Field label={t.team}>
                          <select name="teamId" required>
                            {teamOptions()}
                          </select>
                        </Field>
                        <Field label={t.person}>
                          <select name="profileId" required>
                            {profileOptions()}
                          </select>
                        </Field>
                        <Field label={t.sportRole}>
                          <select name="role">
                            {rosterRoles.map((role) => (
                              <option key={role} value={role}>
                                {t[role]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t.position}>
                          <input name="position" maxLength={80} />
                        </Field>
                        <Field label={t.from}>
                          <input
                            name="startsOn"
                            type="date"
                            defaultValue={day}
                            required
                          />
                        </Field>
                        <Field label={t.until}>
                          <input name="endsOn" type="date" />
                        </Field>
                        <Button
                          disabled={
                            busy || !data.teams.length || !data.profiles.length
                          }
                        >
                          {t.save}
                        </Button>
                      </form>
                    </details>
                    <details>
                      <summary>{t.scope}</summary>
                      <form
                        onSubmit={(e) =>
                          submit(e, async (f) => {
                            await send({
                              action: "coachScope",
                              mandateId: f.get("mandateId"),
                              teamId: f.get("teamId") || null,
                            });
                          })
                        }
                      >
                        <Field label={t.mandate}>
                          <select name="mandateId" required>
                            {data.coachMandates.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={t.team}>
                          <select name="teamId">
                            <option value="">{t.ownTeams}</option>
                            {teamOptions()}
                          </select>
                        </Field>
                        <Button disabled={busy || !data.coachMandates.length}>
                          {t.scopeSave}
                        </Button>
                      </form>
                    </details>
                  </>
                )}
              </Panel>
            </section>
            <section id="families">
              <Panel title={t.family}>
                <p>{t.majority}</p>
                <ul className="records">
                  {data.relationships.map((r) => (
                    <li key={r.id}>
                      {personName(r.guardian_profile_id)} →{" "}
                      {personName(r.subject_profile_id)}
                      <p>
                        {t[r.kind]} · {r.starts_on} → {r.ends_on ?? "—"}
                        {r.revoked_at ? ` · ${t.cancelled}` : ""}
                      </p>
                      {pm && !r.revoked_at && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void task(() =>
                              confirm("relation" + r.id, {
                                action: "revokeGuardian",
                                id: r.id,
                              }),
                            )
                          }
                        >
                          {t.revoke}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {!data.relationships.length && <p>{t.empty}</p>}
                {pm && (
                  <details>
                    <summary>{t.addRelation}</summary>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (f) => {
                          await send({
                            action: "guardian",
                            guardianId: f.get("guardianId"),
                            subjectId: f.get("subjectId"),
                            kind: f.get("kind"),
                            canView: f.has("canView"),
                            canEdit: f.has("canEdit"),
                            startsOn: f.get("startsOn"),
                            endsOn: f.get("endsOn") || null,
                            authorizationNote: f.get("authorizationNote"),
                          });
                        })
                      }
                    >
                      <Field label={t.guardian}>
                        <select name="guardianId" required>
                          {profileOptions()}
                        </select>
                      </Field>
                      <Field label={t.subject}>
                        <select name="subjectId" required>
                          {profileOptions()}
                        </select>
                      </Field>
                      <Field label={t.kind}>
                        <select name="kind">
                          {(
                            [
                              "declared",
                              "legal_verified",
                              "delegated_aid",
                            ] as const
                          ).map((kind) => (
                            <option key={kind} value={kind}>
                              {t[kind]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="check">
                        <input name="canView" type="checkbox" />
                        {t.canView}
                      </label>
                      <label className="check">
                        <input name="canEdit" type="checkbox" />
                        {t.canEdit}
                      </label>
                      <Field label={t.from}>
                        <input
                          name="startsOn"
                          type="date"
                          required
                          defaultValue={day}
                        />
                      </Field>
                      <Field label={t.until}>
                        <input name="endsOn" type="date" />
                      </Field>
                      <Field label={t.proof}>
                        <input name="authorizationNote" maxLength={300} />
                      </Field>
                      <Button disabled={busy || data.profiles.length < 2}>
                        {t.addRelation}
                      </Button>
                    </form>
                  </details>
                )}
              </Panel>
            </section>
            {pm && (
              <Panel title={t.transfers}>
                {token && (
                  <Field label={t.token}>
                    <textarea
                      rows={3}
                      value={token}
                      readOnly
                      autoComplete="off"
                    />
                  </Field>
                )}
                <ul className="records">
                  {data.transfers.map((transfer) => (
                    <li key={transfer.id}>
                      {personName(transfer.source_profile_id)} ·{" "}
                      {transfer.accepted_at
                        ? t.accepted
                        : transfer.revoked_at
                          ? t.cancelled
                          : new Date(transfer.expires_at) < new Date()
                            ? t.expired
                            : t.pending}
                      {!transfer.accepted_at && !transfer.revoked_at && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void task(async () => {
                              await send({
                                action: "cancelTransfer",
                                id: transfer.id,
                              });
                              setToken("");
                            })
                          }
                        >
                          {t.cancel}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>{t.acceptTransfer}</summary>
                  <form
                    onSubmit={(e) =>
                      submit(e, async (f) => {
                        const result = await send({
                          action: "acceptTransfer",
                          token: f.get("token"),
                        });
                        setSelected(result.id);
                        setToken("");
                      })
                    }
                  >
                    <Field label={t.token}>
                      <input
                        name="token"
                        required
                        pattern="[a-f0-9]{64}"
                        maxLength={64}
                        autoComplete="off"
                      />
                    </Field>
                    <Button disabled={busy}>{t.accept}</Button>
                  </form>
                </details>
              </Panel>
            )}
          </>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void task(load)}
        >
          {t.retry}
        </button>
      </main>
    </>
  );
}
