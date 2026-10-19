"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { playerProfileView } from "@/domains/player-profile/service";
import {
  classifications,
  controls,
  rate,
} from "@/domains/player-profile/schema";
import { overMatchSpeed } from "@/domains/equipment/schema";
import { playerProfileCopy } from "./player-profile-copy";
import { kindLabels } from "./calendar-copy";
import { documentStatuses } from "./documents-copy";
import { errors } from "./access-copy";
import { Icon } from "./icons";
import { initials } from "./app-shell";

type View = Awaited<ReturnType<typeof playerProfileView>>;
type Tab = "personal" | "sport";
type Editing = "" | "support" | "confidential" | "sport";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function PlayerProfile({ locale, id }: { locale: Locale; id: string }) {
  const t = playerProfileCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("personal"),
    [editing, setEditing] = useState<Editing>("");
  const failure = (code: string) =>
    t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable;
  const day = (d: string | null | undefined) =>
    d
      ? new Intl.DateTimeFormat(tag(locale), {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(d.slice(0, 10) + "T12:00:00Z"))
      : "—";
  const money = (cents: number) =>
    new Intl.NumberFormat(tag(locale), {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/player-profile?id=" + encodeURIComponent(id), {
      cache: "no-store",
    })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
    // Reloaded only when the player changes; the locale change reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/player-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, id, organizationId: view?.context.id }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      const fresh = await fetch(
        "/api/player-profile?id=" + encodeURIComponent(id),
        {
          cache: "no-store",
        },
      );
      if (fresh.ok) setView(await fresh.json());
      setEditing("");
      setMessage(t.saved);
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    void send(fn(new FormData(e.currentTarget)));
  }

  if (!view)
    return (
      <main id="main" className="access player-profile">
        <p>
          <Link href={`/${locale}/players`}>← {t.back}</Link>
        </p>
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </main>
    );

  const p = view.player;
  const currentTeams = view.teams.filter(
    (a) => a.current && a.role === "player",
  );
  const former = p.status !== "active" || p.former_roles.includes("player");
  const kinds = kindLabels[locale] as Record<string, string>;
  const statuses = documentStatuses[locale] as Record<string, string>;
  const total = view.attendance.total;
  const games = view.attendance.byKind.filter((k) =>
    ["friendly", "tournament"].includes(k.kind),
  );
  const sum = (rows: typeof games) =>
    rows.reduce(
      (acc, k) => ({
        closed: acc.closed + k.closed,
        attended: acc.attended + k.attended,
      }),
      { closed: 0, attended: 0 },
    );
  const training = view.attendance.byKind.find((k) => k.kind === "training");
  const match = sum(games);
  const editButton = (key: Editing, label: string) => (
    <button
      type="button"
      className="text-button"
      aria-expanded={editing === key}
      onClick={() => {
        setEditing(editing === key ? "" : key);
        setMessage("");
      }}
    >
      {editing === key ? t.cancel : `${t.edit}`}
      <span className="sr-only"> : {label}</span>
    </button>
  );
  const text = (v: string | null | undefined) =>
    v ? (
      <span className="message-text">{v}</span>
    ) : (
      <span className="muted">{t.empty}</span>
    );

  return (
    <main id="main" className="access player-profile">
      <p className="back-link">
        <Link href={`/${locale}/players`}>
          <Icon name="back" size={16} />
          {t.back}
        </Link>
      </p>
      <div className="profile-hero">
        <span className="avatar avatar-xl" aria-hidden="true">
          {initials(p.full_name)}
        </span>
        <div className="profile-title">
          <h1>{p.full_name}</h1>
          <ul className="profile-tags">
            {currentTeams.map((a) => (
              <li key={a.id}>{a.team}</li>
            ))}
            {p.playing_position && <li>{p.playing_position}</li>}
            {p.jersey_number !== null && <li>#{p.jersey_number}</li>}
            <li data-tone="accent">
              {
                t.classifications[
                  view.sport.classification as keyof typeof t.classifications
                ]
              }
            </li>
            {former && <li data-tone="muted">{t.formerPlayer}</li>}
          </ul>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <div className="tabs" role="tablist" aria-label={p.full_name}>
        {(["personal", "sport"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                const next = tab === "personal" ? "sport" : "personal";
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            <Icon name={key === "personal" ? "user" : "chart"} />
            {key === "personal" ? t.personalTab : t.sportTab}
          </button>
        ))}
      </div>

      <section
        id="panel-personal"
        role="tabpanel"
        aria-labelledby="tab-personal"
        hidden={tab !== "personal"}
        className="profile-grid"
      >
        <Card title={t.identity}>
          {view.can.details ? (
            <dl className="facts">
              <dt>{t.birth}</dt>
              <dd>
                {day(p.birth_date)}
                {p.age !== null &&
                  p.age !== undefined &&
                  ` · ${p.age} ${t.years}`}
              </dd>
              <dt>{t.email}</dt>
              <dd>{p.email || "—"}</dd>
              <dt>{t.phone}</dt>
              <dd>{p.phone || "—"}</dd>
              <dt>{t.joined}</dt>
              <dd>{day(p.joined_on)}</dd>
              <dt>{t.account}</dt>
              <dd>{p.has_account ? t.yes : t.no}</dd>
            </dl>
          ) : (
            <p className="muted">{t.noDetails}</p>
          )}
        </Card>

        {view.support && (
          <Card
            title={t.support}
            action={
              view.can.editSupport ? editButton("support", t.support) : null
            }
          >
            <p className="muted">{t.supportHint}</p>
            {editing === "support" ? (
              <form
                onSubmit={(e) =>
                  submit(e, (f) => ({
                    action: "support",
                    version: view.supportVersion,
                    supportNeeds: f.get("needs"),
                    safetyNotes: f.get("safety"),
                    emergencyContact: f.get("emergency"),
                  }))
                }
              >
                <label htmlFor="support-needs">
                  {t.supportNeeds}
                  <textarea
                    id="support-needs"
                    name="needs"
                    maxLength={2000}
                    defaultValue={view.support.support_needs}
                  />
                </label>
                <label htmlFor="support-safety">
                  {t.safety}
                  <textarea
                    id="support-safety"
                    name="safety"
                    maxLength={2000}
                    defaultValue={view.support.safety_notes}
                  />
                </label>
                <label htmlFor="support-emergency">
                  {t.emergency}
                  <input
                    id="support-emergency"
                    name="emergency"
                    maxLength={300}
                    defaultValue={view.support.emergency_contact}
                  />
                </label>
                <button className="button" disabled={busy}>
                  {t.save}
                </button>
              </form>
            ) : (
              <dl className="facts stacked">
                <dt>{t.supportNeeds}</dt>
                <dd>{text(view.support.support_needs)}</dd>
                <dt>{t.safety}</dt>
                <dd>{text(view.support.safety_notes)}</dd>
                <dt>{t.emergency}</dt>
                <dd>{text(view.support.emergency_contact)}</dd>
              </dl>
            )}
          </Card>
        )}

        <Card
          title={t.confidential}
          icon="lock"
          tone="confidential"
          action={
            view.confidential && view.can.editConfidential
              ? editButton("confidential", t.confidential)
              : null
          }
        >
          {view.confidential ? (
            <>
              <p className="muted">{t.confidentialHint}</p>
              {editing === "confidential" ? (
                <form
                  onSubmit={(e) =>
                    submit(e, (f) => ({
                      action: "confidential",
                      version: view.supportVersion,
                      impairment: f.get("impairment"),
                      medicalNotes: f.get("medical"),
                    }))
                  }
                >
                  <label htmlFor="confidential-impairment">
                    {t.impairment}
                    <textarea
                      id="confidential-impairment"
                      name="impairment"
                      maxLength={2000}
                      defaultValue={view.confidential.impairment}
                    />
                  </label>
                  <label htmlFor="confidential-medical">
                    {t.medical}
                    <textarea
                      id="confidential-medical"
                      name="medical"
                      maxLength={2000}
                      defaultValue={view.confidential.medical_notes}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    {t.save}
                  </button>
                </form>
              ) : (
                <dl className="facts stacked">
                  <dt>{t.impairment}</dt>
                  <dd>{text(view.confidential.impairment)}</dd>
                  <dt>{t.medical}</dt>
                  <dd>{text(view.confidential.medical_notes)}</dd>
                </dl>
              )}
            </>
          ) : (
            <p className="muted">{t.restricted}</p>
          )}
        </Card>

        {view.can.details && (
          <Card title={t.guardians}>
            {view.guardians.length ? (
              <ul className="records">
                {view.guardians.map((g) => (
                  <li key={g.id}>
                    <strong>{g.name}</strong>
                    <span className="muted">
                      {" "}
                      ·{" "}
                      {t.relationKinds[g.kind as keyof typeof t.relationKinds]}
                      {g.can_edit
                        ? ` · ${t.canEdit}`
                        : g.can_view
                          ? ` · ${t.canView}`
                          : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noGuardians}</p>
            )}
          </Card>
        )}

        <Card title={t.history}>
          <ol className="timeline">
            {view.teams.map((a) => (
              <li key={a.id} data-current={a.current || undefined}>
                <strong>
                  {a.team} · {a.season}
                </strong>
                <span>
                  {t.roles[a.role] ?? a.role}
                  {a.position ? ` · ${a.position}` : ""} · {day(a.starts_on)}
                  {a.ends_on ? ` → ${day(a.ends_on)}` : ""}
                </span>
                <span
                  className="status-tag"
                  data-tone={a.current ? "success" : ""}
                >
                  {a.current ? t.current : t.ended}
                </span>
              </li>
            ))}
            {p.joined_on && (
              <li>
                <strong>{t.joinedClub}</strong>
                <span>{day(p.joined_on)}</span>
              </li>
            )}
          </ol>
        </Card>

        <Card title={t.attendance}>
          {total.invited ? (
            <>
              <div className="stat-row">
                <Stat
                  label={t.attendanceRate}
                  value={rate(total.attended, total.closed)}
                  hint={`${total.closed} ${t.closedSessions}`}
                />
                <Stat
                  label={t.answerRate}
                  value={rate(total.answered, total.invited)}
                  hint={`${total.invited} ${t.invitations}`}
                />
              </div>
              <h3 className="card-subtitle">{t.recent}</h3>
              <ul className="records compact">
                {view.attendance.recent.map((r) => (
                  <li key={r.id}>
                    <span>
                      <strong>{r.title}</strong>
                      <span className="muted">
                        {" "}
                        · {day(String(r.starts_at))} · {kinds[r.kind] ?? r.kind}
                      </span>
                    </span>
                    <span
                      className="status-tag"
                      data-tone={
                        r.status === "cancelled"
                          ? "danger"
                          : r.closed
                            ? ["present", "late", "early"].includes(r.actual)
                              ? "success"
                              : "danger"
                            : r.response === "none"
                              ? "warning"
                              : ""
                      }
                    >
                      {r.status === "cancelled"
                        ? t.cancelled
                        : r.closed
                          ? t.actuals[r.actual as keyof typeof t.actuals]
                          : t.responses[r.response as keyof typeof t.responses]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">{t.noAttendance}</p>
          )}
        </Card>

        {view.documents.length > 0 && (
          <Card title={t.documents}>
            <ul className="records compact">
              {view.documents.map((d) => (
                <li key={d.id}>
                  <span>{d.name}</span>
                  <span
                    className="status-tag"
                    data-tone={
                      ["valid"].includes(d.status)
                        ? "success"
                        : ["expired", "refused", "missing"].includes(d.status)
                          ? "danger"
                          : "warning"
                    }
                  >
                    {statuses[d.status] ?? d.status}
                    {d.expires_on ? ` · ${day(d.expires_on)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <Link href={`/${locale}/documents`}>{t.documents} →</Link>
          </Card>
        )}

        {view.can.viewMoney && view.dues.length > 0 && (
          <Card title={t.dues}>
            <ul className="records compact">
              {view.dues.map(
                (d: {
                  id: string;
                  category: string;
                  net_cents: number;
                  installments: { due_on: string; amount_cents: number }[];
                }) => {
                  const next = d.installments.find(
                    (i) => i.due_on >= view.today,
                  );
                  return (
                    <li key={d.id}>
                      <span>
                        <strong>{d.category}</strong> · {money(d.net_cents)}
                      </span>
                      {next && (
                        <span className="muted">
                          {t.nextDue} : {money(next.amount_cents)} ·{" "}
                          {day(next.due_on)}
                        </span>
                      )}
                    </li>
                  );
                },
              )}
            </ul>
          </Card>
        )}
      </section>

      <section
        id="panel-sport"
        role="tabpanel"
        aria-labelledby="tab-sport"
        hidden={tab !== "sport"}
        className="profile-grid"
      >
        <Card
          title={t.game}
          action={view.can.editSport ? editButton("sport", t.game) : null}
        >
          {editing === "sport" ? (
            <form
              onSubmit={(e) =>
                submit(e, (f) => ({
                  action: "sport",
                  version: view.sport.version,
                  classification: f.get("classification"),
                  classificationValidUntil: f.get("until") || null,
                  control: f.get("control"),
                  sportNotes: f.get("notes"),
                }))
              }
            >
              <label htmlFor="sport-classification">
                {t.classification}
                <select
                  id="sport-classification"
                  name="classification"
                  defaultValue={view.sport.classification}
                >
                  {classifications.map((c) => (
                    <option key={c} value={c}>
                      {t.classifications[c]}
                    </option>
                  ))}
                </select>
                <span className="muted">{t.classificationHint}</span>
              </label>
              <label htmlFor="sport-until">
                {t.validUntil}
                <input
                  id="sport-until"
                  name="until"
                  type="date"
                  defaultValue={view.sport.classification_valid_until ?? ""}
                />
              </label>
              <label htmlFor="sport-control">
                {t.control}
                <select
                  id="sport-control"
                  name="control"
                  defaultValue={view.sport.control}
                >
                  {controls.map((c) => (
                    <option key={c} value={c}>
                      {t.controls[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="sport-notes">
                {t.sportNotes}
                <textarea
                  id="sport-notes"
                  name="notes"
                  maxLength={2000}
                  defaultValue={view.sport.sport_notes}
                />
              </label>
              <button className="button" disabled={busy}>
                {t.save}
              </button>
            </form>
          ) : (
            <dl className="facts">
              <dt>{t.team}</dt>
              <dd>{currentTeams.map((a) => a.team).join(", ") || "—"}</dd>
              <dt>{t.position}</dt>
              <dd>{p.playing_position || "—"}</dd>
              <dt>{t.jersey}</dt>
              <dd>{p.jersey_number ?? "—"}</dd>
              <dt>{t.classification}</dt>
              <dd>
                {
                  t.classifications[
                    view.sport.classification as keyof typeof t.classifications
                  ]
                }
                {view.sport.classification_valid_until &&
                  ` · ${t.validUntil.toLocaleLowerCase()} ${day(view.sport.classification_valid_until)}`}
              </dd>
              <dt>{t.control}</dt>
              <dd>{t.controls[view.sport.control] ?? "—"}</dd>
              <dt>{t.sportNotes}</dt>
              <dd>{text(view.sport.sport_notes)}</dd>
            </dl>
          )}
          {view.can.editPosition && (
            <p className="muted">
              <Link href={`/${locale}/players`}>{t.positionLink}</Link>
            </p>
          )}
        </Card>

        <Card title={t.chairs} icon="wheelchair">
          {view.chairs.length ? (
            <ul className="mini-chairs">
              {view.chairs.map((c) => {
                const link = c.links[0];
                return (
                  <li key={c.id}>
                    <strong>{c.name}</strong>
                    {link?.is_primary && (
                      <span className="status-tag" data-tone="success">
                        {t.primary}
                      </span>
                    )}
                    <span className="muted">
                      {[c.brand, c.model].filter(Boolean).join(" · ") || "—"}
                      {c.max_speed_kmh &&
                        ` · ${t.speed} ${Number(c.max_speed_kmh)} km/h`}
                      {c.others > 0 && ` · ${t.shared} ${c.others}`}
                    </span>
                    {overMatchSpeed(c.max_speed_kmh) && (
                      <span className="status-tag" data-tone="warning">
                        &gt; 10 km/h
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">{t.noChair}</p>
          )}
          <Link href={`/${locale}/equipment`}>{t.equipmentLink} →</Link>
        </Card>

        <Card title={t.stats} icon="chart" wide>
          <div className="stat-row">
            <Stat
              label={kinds.training ?? "Training"}
              value={training ? rate(training.attended, training.closed) : null}
              hint={`${training?.attended ?? 0} ${t.presences} / ${training?.closed ?? 0}`}
            />
            <Stat
              label={`${kinds.friendly ?? ""} · ${kinds.tournament ?? ""}`}
              value={rate(match.attended, match.closed)}
              hint={`${match.attended} ${t.presences} / ${match.closed}`}
            />
            <Stat
              label={t.answerRate}
              value={rate(total.answered, total.invited)}
              hint={`${total.invited} ${t.invitations}`}
            />
            <Stat
              label={t.allEvents}
              value={rate(total.attended, total.closed)}
              hint={`${total.closed} ${t.closedSessions}`}
            />
          </div>
          <p className="notice">{t.matchStatsSoon}</p>
        </Card>
      </section>
    </main>
  );
}

function Card({
  title,
  icon,
  tone,
  action,
  wide,
  children,
}: {
  title: string;
  icon?: "lock" | "wheelchair" | "chart";
  tone?: "confidential";
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className="profile-card"
      data-tone={tone}
      data-wide={wide || undefined}
    >
      <div className="profile-card-head">
        <h2>
          {icon && <Icon name={icon} size={18} />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </article>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="stat">
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value === null ? "—" : `${value} %`}
      </span>
      {value !== null && (
        <meter min={0} max={100} value={value} aria-label={label}>
          {value} %
        </meter>
      )}
      <span className="metric-hint">{hint}</span>
    </div>
  );
}
