"use client";
import { PersonOverview, useOverview } from "./person-overview";
import { overviewCopy } from "./person-overview-copy";
import { DisciplineHistory } from "./discipline";
import { disciplineCopy } from "./discipline-copy";
import { workshopCopy } from "./workshop-copy";
import { BillingSplit } from "./billing-split";
import { CareCard } from "./care-card";
import { PlayerProgress, useProgress } from "./player-progress";
import { NationalCard } from "./national";
import { progressCopy } from "./progress-copy";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { playerProfileView } from "@/domains/player-profile/service";
import { applyPayments } from "@/domains/reminders/schema";
import { bankCopy } from "./bank-copy";
import { TransferQr } from "./transfer-qr";
import {
  classifications,
  controls,
  rate,
} from "@/domains/player-profile/schema";
import { overMatchSpeed } from "@/domains/equipment/schema";
import { playerProfileCopy, matchCopy } from "./player-profile-copy";
import { licensesCopy } from "./licenses-copy";
import { kindLabels } from "./calendar-copy";
import { documentStatuses } from "./documents-copy";
import { errors } from "./access-copy";
import { Icon, type IconName } from "./icons";
import { initials } from "./app-shell";
import { MoveDialog } from "./teams";
import { teamsCopy } from "./teams-copy";
import { TeamMatches } from "./match-cards";
import { ClassificationBadge } from "./classification-badge";
import { Badge, Tabs, EmptyState } from "./ui";
import { undoToast } from "./toast";
import { sheetCopy } from "./player-sheet-copy";
import { peopleCopy } from "./people-copy";
import { toastCopy } from "./toast-copy";
const moveCopy = { fr: "Déplacer vers…", nl: "Verplaatsen naar…", en: "Move to…" };

type View = Awaited<ReturnType<typeof playerProfileView>>;
type Tab = "overview" | "personal" | "sport" | "progress";
type Editing = "" | "support" | "confidential" | "sport" | "identity" | "game";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/**
 * The player's sheet. Wave 17 (J1): one sheet only, shown in a window from
 * the directory (`embedded`) or as a full page (/players/[id]); the identity,
 * the position and number and the team assignment are edited here too.
 */
export function PlayerProfile({ locale, id, embedded = false, onChanged, initialTab }: { locale: Locale; id: string; embedded?: boolean; onChanged?: () => void; initialTab?: string }) {
  const t = playerProfileCopy[locale],
    sc = sheetCopy[locale],
    pc = peopleCopy[locale];
  const Root = embedded ? "div" : "main";
  const rootId = embedded ? undefined : "main";
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [chosenTab, setTab] = useState<Tab | null>(initialTab === "progress" ? "progress" : null),
    [editing, setEditing] = useState<Editing>("");
  // 40: the overview, and the first tab it decides (the overview for the presidency, « Personnel » otherwise).
  const { data: overview } = useOverview(id);
  // 31: « Mon suivi » for the player and his parents, « Suivi » for his coaches and the presidency.
  const { data: progress, reload: reloadProgress } = useProgress(locale, id);
  const tab: Tab = chosenTab ?? (overview?.overviewFirst ? "overview" : "personal");
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

  const [moving, setMoving] = useState(false);
  /** Identity, position and team go through the directory's commands. */
  async function send(body: Record<string, unknown>, endpoint = "/api/player-profile") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body, organizationId: view?.context.id }),
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
      onChanged?.();
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Record<string, unknown>,
    endpoint?: string,
  ) {
    e.preventDefault();
    void send(fn(new FormData(e.currentTarget)), endpoint);
  }

  if (!view)
    return (
      <Root id={rootId} className="access player-profile">
        {!embedded && (
          <p>
            <Link href={`/${locale}/players`}>← {t.back}</Link>
          </p>
        )}
        {error ? <p role="alert">{error}</p> : <p role="status">{t.loading}</p>}
      </Root>
    );

  const p = view.player;
  const currentTeams = view.teams.filter(
    (a) => a.current && a.role === "player",
  );
  const moveTargets = currentTeams.length
    ? view.otherTeams.filter((o) => o.season_id === currentTeams[0].season_id && o.id !== currentTeams[0].team_id)
    : [];
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
    <Root id={rootId} className={`access player-profile ${embedded ? "embedded" : ""}`.trim()}>
      {!embedded && (
        <p className="back-link">
          <Link href={`/${locale}/players`}>
            <Icon name="back" size={16} />
            {t.back}
          </Link>
        </p>
      )}
      <div className="profile-hero">
        <span className="avatar avatar-xl" aria-hidden="true">
          {initials(p.full_name)}
        </span>
        <div className="profile-title">
          {/* In the window, the dialog's title already says the name. */}
          {!embedded && <h1>{p.full_name}</h1>}
          <ul className="profile-tags">
            {currentTeams.map((a) => (
              <li key={a.id}>{a.team}</li>
            ))}
            {p.playing_position && <li>{p.playing_position}</li>}
            {p.jersey_number !== null && <li>#{p.jersey_number}</li>}
            <li className="profile-tag-badge">
              <ClassificationBadge locale={locale} value={view.sport.classification} />
            </li>
            {former && <li data-tone="muted">{t.formerPlayer}</li>}
            {p.departure_status === "deceased" && <li data-tone="muted">{sc.inMemoriam}</li>}
          </ul>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <Tabs label={p.full_name} items={([...(overview ? (["overview"] as const) : []), "personal", "sport", ...(progress ? (["progress"] as const) : [])] as Tab[]).map((key) => ({
          id: key,
          label: (
            <>
              <Icon name={key === "overview" ? "eye" : key === "personal" ? "user" : key === "progress" ? "star" : "chart"} />
              {key === "overview"
                ? overviewCopy[locale].tab
                : key === "personal"
                  ? t.personalTab
                  : key === "progress"
                    ? progress?.access === "self" || progress?.access === "parent"
                      ? progressCopy[locale].tabSelf
                      : progressCopy[locale].tabStaff
                    : t.sportTab}
            </>
          ),
        }))} value={tab} onChange={(id) => setTab(id as Tab)} idPrefix="tab" panelId={(id) => `panel-${id}`} />

      {/* 40: « Vue d'ensemble », first for the presidency and those who manage the players. */}
      {overview && (
        <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
          {tab === "overview" && <PersonOverview locale={locale} data={overview} go={(to) => setTab(to === "todo" ? "personal" : to)} />}
        </section>
      )}

      <section
        id="panel-personal"
        role="tabpanel"
        aria-labelledby="tab-personal"
        hidden={tab !== "personal"}
        className="profile-grid"
      >
        <Card title={t.identity} action={view.can.details && view.can.managePeople ? editButton("identity", t.identity) : null}>
          {editing === "identity" && view.can.details ? (
            <form
              onSubmit={(e) =>
                submit(
                  e,
                  (f) => ({
                    action: "updatePerson",
                    version: p.version,
                    fullName: f.get("fullName"),
                    birthDate: f.get("birthDate") || null,
                    email: f.get("email") || "",
                    phone: f.get("phone") || "",
                    joinedOn: f.get("joinedOn"),
                  }),
                  "/api/people",
                )
              }
            >
              <label htmlFor="sheet-name">
                {pc.name}
                <input id="sheet-name" name="fullName" required minLength={2} maxLength={120} defaultValue={p.full_name} />
              </label>
              <label htmlFor="sheet-birth">
                {pc.birth}
                <input id="sheet-birth" name="birthDate" type="date" max={view.today} defaultValue={p.birth_date ?? ""} />
              </label>
              <label htmlFor="sheet-email">
                {pc.email}
                <input id="sheet-email" name="email" type="email" defaultValue={p.email ?? ""} />
              </label>
              <label htmlFor="sheet-phone">
                {pc.phone}
                <input id="sheet-phone" name="phone" maxLength={40} defaultValue={p.phone ?? ""} />
              </label>
              <label htmlFor="sheet-joined">
                {pc.joined}
                <input id="sheet-joined" name="joinedOn" type="date" required max={view.today} defaultValue={p.joined_on ?? view.today} />
              </label>
              <button className="button" disabled={busy}>
                {t.save}
              </button>
            </form>
          ) : view.can.details ? (
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
            <EmptyState title={t.noDetails} />
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

        {view.care && (
          <CareCard
            locale={locale}
            care={view.care}
            canEdit={view.can.editSupport}
            busy={busy}
            send={send}
          />
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
              <EmptyState title={t.noGuardians} />
            )}
            {/* 29: two homes, who receives the dues and the attestations. */}
            {view.can.managePeople && view.guardians.length > 1 && <BillingSplit locale={locale} subjectId={id} />}
          </Card>
        )}

        <Card
          title={t.history}
          action={
            view.can.editPosition && currentTeams.length > 0 && view.otherTeams.some((o) => o.season_id === currentTeams[0].season_id && o.id !== currentTeams[0].team_id) && (
              <button type="button" className="button secondary" onClick={() => setMoving(true)}>
                {moveCopy[locale]}
              </button>
            )
          }
        >
          <ol className="timeline">
            {view.teams.map((a) => (
              <li key={a.id} data-current={a.current || undefined}>
                <strong>
                  <span className="team-chip" data-color={a.team_color ?? "none"}>
                    <span className="team-dot" aria-hidden="true" />
                    {a.team}
                  </span>{" "}
                  · {a.season}
                </strong>
                <span>
                  {t.roles[a.role] ?? a.role}
                  {a.position ? ` · ${a.position}` : ""} · {day(a.starts_on)}
                  {a.ends_on ? ` → ${day(a.ends_on)}` : ""}
                </span>
                <Badge tone={a.current ? "success" : ""}>
                  {a.current ? t.current : t.ended}
                </Badge>
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
                    <Badge tone={
                        r.status === "cancelled"
                          ? "danger"
                          : r.closed
                            ? ["present", "late", "early"].includes(r.actual)
                              ? "success"
                              : "danger"
                            : r.response === "none"
                              ? "warning"
                              : ""
                      }>
                      {r.status === "cancelled"
                        ? t.cancelled
                        : r.closed
                          ? t.actuals[r.actual as keyof typeof t.actuals]
                          : t.responses[r.response as keyof typeof t.responses]}
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState title={t.noAttendance} />
          )}
        </Card>

        {view.documents.length > 0 && (
          <Card title={t.documents}>
            <ul className="records compact">
              {view.documents.map((d) => (
                <li key={d.id}>
                  <span>{d.name}</span>
                  <Badge tone={
                      ["valid"].includes(d.status)
                        ? "success"
                        : ["expired", "refused", "missing"].includes(d.status)
                          ? "danger"
                          : "warning"
                    }>
                    {statuses[d.status] ?? d.status}
                    {d.expires_on ? ` · ${day(d.expires_on)}` : ""}
                  </Badge>
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
                  reference: string;
                  paid_cents: number;
                  installments: { due_on: string; amount_cents: number; reference: string }[];
                }) => {
                  // B1: the next unpaid instalment (the payments recorded cover the oldest first).
                  const unpaid = d.installments.length ? applyPayments(d.installments, d.paid_cents) : d.net_cents > d.paid_cents ? [{ due_on: "", amount_cents: d.net_cents - d.paid_cents, reference: d.reference }] : [];
                  const next = unpaid[0] as { due_on: string; amount_cents: number; reference?: string } | undefined;
                  return (
                    <li key={d.id} className="profile-due">
                      <span>
                        <strong>{d.category}</strong> · {money(d.net_cents)}
                      </span>
                      {next && next.due_on && (
                        <span className="muted">
                          {t.nextDue} : {money(next.amount_cents)} ·{" "}
                          {day(next.due_on)}
                        </span>
                      )}
                      {next && view.payment && (
                        <details>
                          <summary>{bankCopy[locale].pay}</summary>
                          <p className="muted small">{bankCopy[locale].payIntro}</p>
                          <TransferQr locale={locale} payment={view.payment} cents={next.amount_cents} reference={next.reference ?? d.reference} printHref={`/${locale}/players/${id}/payment/${d.id}`} />
                        </details>
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
        {/* 5: the player's matches, the same line as everywhere. */}
        {tab === "sport" && currentTeams.length > 0 && <TeamMatches locale={locale} teamIds={currentTeams.map((a) => a.team_id)} />}
        {/* 6: « Sélection nationale »: teams, status, gatherings, caps; the player or the parent answers. */}
        {tab === "sport" && <NationalCard locale={locale} profileId={id} />}
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
                <ClassificationBadge locale={locale} value={view.sport.classification} />
                {view.sport.classification_valid_until &&
                  ` · ${t.validUntil.toLocaleLowerCase()} ${day(view.sport.classification_valid_until)}`}{" "}
                <Badge tone={
                    view.sport.classification_status === "validated"
                      ? "success"
                      : view.sport.classification_status === "refused"
                        ? "danger"
                        : view.sport.classification_status === "requested"
                          ? "warning"
                          : ""
                  }>
                  {
                    licensesCopy[locale].classStatus[
                      view.sport.classification_status ?? "unverified"
                    ]
                  }
                </Badge>
              </dd>
              <dt>{t.identityCode}</dt>
              <dd>
                <code>{view.identity_code}</code> <span className="muted small">{t.identityHint}</span>
              </dd>
              <dt>{t.registry}</dt>
              <dd>
                {view.registry
                  ? `${t.registryLine.replace("{classification}", view.registry.classification).replace("{federation}", view.registry.federation).replace("{day}", day(view.registry.decided_on))}${view.registry.valid_until ? ` · ${t.validUntil.toLocaleLowerCase()} ${day(view.registry.valid_until)}` : ""}${view.registry.international ? ` · ${t.registryInternational}` : ""}`
                  : t.registryNone}
              </dd>
              <dt>{licensesCopy[locale].license}</dt>
              <dd>
                {view.license
                  ? `${licensesCopy[locale].licenseStatus[view.license.status]} · ${view.license.season}${view.license.number ? " · " + view.license.number : ""}`
                  : licensesCopy[locale].licenseStatus.none}{" "}
                <Link href={`/${locale}/licenses`}>→</Link>
              </dd>
              <dt>{t.control}</dt>
              <dd>{t.controls[view.sport.control] ?? "—"}</dd>
              <dt>{t.sportNotes}</dt>
              <dd>{text(view.sport.sport_notes)}</dd>
            </dl>
          )}
        </Card>

        {view.can.editPosition && !former && (
          <Card title={sc.teamCard} icon="team" action={editButton("game", sc.positionEdit)}>
            {editing === "game" ? (
              <form
                onSubmit={(e) =>
                  submit(
                    e,
                    (f) => ({
                      action: "gameInfo",
                      version: p.version,
                      position: f.get("position") ?? "",
                      jerseyNumber: f.get("number") === "" ? null : Number(f.get("number")),
                    }),
                    "/api/people",
                  )
                }
              >
                <label htmlFor="sheet-position">
                  {t.position}
                  <input id="sheet-position" name="position" maxLength={80} defaultValue={p.playing_position} />
                </label>
                <label htmlFor="sheet-number">
                  {t.jersey}
                  <input id="sheet-number" name="number" type="number" min={0} max={99} defaultValue={p.jersey_number ?? ""} />
                </label>
                <button className="button" disabled={busy}>
                  {t.save}
                </button>
              </form>
            ) : (
              <dl className="facts">
                <dt>{t.position}</dt>
                <dd>{p.playing_position || "—"}</dd>
                <dt>{t.jersey}</dt>
                <dd>{p.jersey_number ?? "—"}</dd>
              </dl>
            )}
            <h3 className="card-subtitle">{sc.assignTitle}</h3>
            {view.otherTeams.length ? (
              <form
                className="sheet-assign"
                onSubmit={(e) =>
                  submit(
                    e,
                    (f) => ({ action: "assign", profileId: p.id, teamId: f.get("team"), role: "player", position: p.playing_position ?? "", startsOn: f.get("from"), endsOn: null }),
                    "/api/people",
                  )
                }
              >
                <label htmlFor="sheet-team">
                  {pc.team}
                  <select id="sheet-team" name="team" required>
                    {view.otherTeams
                      .filter((o) => !currentTeams.some((a) => a.team_id === o.id))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label htmlFor="sheet-from">
                  {sc.startsOn}
                  <input id="sheet-from" name="from" type="date" required defaultValue={view.today} />
                </label>
                <button className="button secondary" disabled={busy}>
                  {sc.assign}
                </button>
              </form>
            ) : (
              <p className="muted">{sc.noOpenTeam}</p>
            )}
          </Card>
        )}

        <Card title={t.chairs} icon="wheelchair">
          {view.chairs.length ? (
            <ul className="mini-chairs">
              {view.chairs.map((c) => {
                const link = c.links[0];
                return (
                  <li key={c.id}>
                    {/* 11: « Nom du fauteuil · Marque Modèle ». */}
                    <strong>{c.label ?? c.name}</strong>
                    {link?.is_primary && (
                      <Badge tone="success">
                        {t.primary}
                      </Badge>
                    )}
                    <span className="muted">
                      {[c.brand, c.model].filter(Boolean).join(" · ") || "—"}
                      {c.max_speed_kmh &&
                        ` · ${t.speed} ${Number(c.max_speed_kmh)} km/h`}
                      {c.others > 0 && ` · ${t.shared} ${c.others}`}
                    </span>
                    {overMatchSpeed(c.max_speed_kmh) && (
                      <Badge tone="warning">
                        &gt; 10 km/h
                      </Badge>
                    )}
                    {/* 19: a breakdown reported from the player's sheet. */}
                    <Link className="button secondary sm" href={`/${locale}/equipment/${c.id}?report=1`}>
                      {workshopCopy[locale].reportButton}
                      <span className="sr-only"> : {c.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t.noChair} />
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
        </Card>

        <Card title={matchCopy[locale].title} icon="chart" wide>
          {view.matches.totals.matches ? (
            <>
              <dl className="report-totals match-totals">
                <div>
                  <dt>{matchCopy[locale].played}</dt>
                  <dd>
                    {view.matches.totals.matches}
                    <span className="muted">
                      {" "}
                      · {view.matches.totals.starts} {matchCopy[locale].starts}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>{matchCopy[locale].minutes}</dt>
                  <dd>{view.matches.totals.minutes}</dd>
                </div>
                <div>
                  <dt>{matchCopy[locale].goals}</dt>
                  <dd>{view.matches.totals.goals}</dd>
                </div>
                <div>
                  <dt>{matchCopy[locale].assists}</dt>
                  <dd>{view.matches.totals.assists}</dd>
                </div>
                <div>
                  <dt>{matchCopy[locale].cards}</dt>
                  <dd>
                    {view.matches.totals.yellow} / {view.matches.totals.red}
                  </dd>
                </div>
              </dl>
              <h3>{matchCopy[locale].recent}</h3>
              <ul className="records">
                {view.matches.recent.map((m) => (
                  <li key={m.id}>
                    <strong>
                      {m.team} {m.our_score}-{m.their_score}{" "}
                      {m.home ? matchCopy[locale].vs : matchCopy[locale].at}{" "}
                      {m.opponent}
                    </strong>
                    <span className="muted">
                      {" "}
                      · {day(String(m.starts_at))} · {m.minutes} min
                      {m.goals
                        ? ` · ${m.goals} ${matchCopy[locale].goals.toLowerCase()}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">{matchCopy[locale].none}</p>
          )}
          <Link href={`/${locale}/matches`}>{matchCopy[locale].link} →</Link>
        </Card>
        {/* 34: the disciplinary history, for the club's presidency and coaches. */}
        {view.can.discipline && (
          <Card title={disciplineCopy[locale].history} icon="shield" wide>
            <DisciplineHistory locale={locale} profileId={id} />
          </Card>
        )}
      </section>
      {progress && (
        <section id="panel-progress" role="tabpanel" aria-labelledby="tab-progress" hidden={tab !== "progress"}>
          {tab === "progress" && <PlayerProgress locale={locale} data={progress} reload={reloadProgress} />}
        </section>
      )}
    {moving && currentTeams.length > 0 && (
        <MoveDialog
          locale={locale}
          player={{ profile_id: p.id, full_name: p.full_name }}
          fromTeamId={currentTeams[0].team_id}
          others={moveTargets}
          busy={busy}
          close={() => setMoving(false)}
          move={async (body) => {
            const r = await fetch("/api/teams", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizationId: view.context.id, action: "move", ...body }),
            });
            const v = await r.json();
            if (!r.ok) {
              setError(failure(v.error));
              return;
            }
            setMoving(false);
            const refresh = async () => {
              const fresh = await fetch("/api/player-profile?id=" + encodeURIComponent(id), { cache: "no-store" });
              if (fresh.ok) setView(await fresh.json());
            };
            await refresh();
            setMessage(t.saved);
            // Over its places after the move (wave 16, R1): said, never blocked.
            undoToast(locale, v.over ? teamsCopy[locale].places.movedOver : toastCopy[locale].moved, v.undo, view.context.id, refresh);
          }}
        />
      )}
      </Root>
  );
}

export function Card({
  title,
  icon,
  tone,
  action,
  wide,
  children,
  id,
}: {
  title: string;
  icon?: IconName;
  tone?: "confidential";
  action?: ReactNode;
  wide?: boolean;
  children: ReactNode;
  /** An anchor for links to this card (7: the coach's courses). */
  id?: string;
}) {
  return (
    <article
      id={id}
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

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="stat stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value === null ? "…" : `${value} %`}</span>
      {value !== null && (
        <meter min={0} max={100} value={value} aria-label={label}>
          {value} %
        </meter>
      )}
      <span className="stat-hint">{hint}</span>
    </div>
  );
}
