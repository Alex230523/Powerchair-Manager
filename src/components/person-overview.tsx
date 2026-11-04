"use client";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { personOverview } from "@/domains/player-profile/service";
import type { Blocking } from "@/domains/player-profile/overview";
import { overviewCopy, fill } from "./person-overview-copy";
import { useData } from "./use-api";
import { Badge, Card } from "./ui";
import { Icon, type IconName } from "./icons";

/**
 * 40: « Vue d'ensemble » of a person's sheet. One block per subject the
 * reader may see, each with a readable state (icon and words, never colour
 * alone) and a « Voir » link to its tab or page; on top, what blocks the
 * person and quick actions.
 */
export type Overview = Awaited<ReturnType<typeof personOverview>>;
type Tone = "success" | "warning" | "danger" | "neutral";
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const money = (l: Locale, cents: number) => new Intl.NumberFormat(tag(l), { style: "currency", currency: "EUR" }).format(cents / 100);
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));
const icon: Record<Tone, IconName> = { success: "check", warning: "clock", danger: "alert", neutral: "help" };

/** The overview's data, loaded once for the sheet (it also decides the first tab). */
export function useOverview(id: string) {
  const failure = useCallback(() => "", []);
  return useData<Overview>(`/api/player-profile/overview?id=${id}`, failure);
}

function State({ tone, text }: { tone: Tone; text: string }) {
  return (
    <Badge tone={tone}>
      <Icon name={icon[tone]} size={14} /> {text}
    </Badge>
  );
}
function Block({ title, id, tone, state, see, children }: { title: string; id: string; tone: Tone; state: string; see: ReactNode; children?: ReactNode }) {
  return (
    <Card title={title} labelledBy={`ovw-${id}`} headingId={`ovw-${id}`} actions={see}>
      <p>
        <State tone={tone} text={state} />
      </p>
      {children}
    </Card>
  );
}

export function PersonOverview({ locale, data, go }: { locale: Locale; data: Overview; go: (tab: "personal" | "sport" | "todo") => void }) {
  const t = overviewCopy[locale];
  const b = data.blocks;
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const blocking = data.blocking.map((x) => line(locale, x)).join(", ");
  const tab = (to: "personal" | "sport" | "todo", label: string) => (
    <button type="button" className="text-button" onClick={() => go(to)}>
      {t.see}
      <span className="sr-only"> : {label}</span>
    </button>
  );
  const page = (href: string, label: string) => (
    <Link href={`/${locale}${href}`}>
      {t.see}
      <span className="sr-only"> : {label}</span>
    </Link>
  );
  async function task() {
    setBusy(true);
    setMessage("");
    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", category: "admin", title: fill(t.taskTitle, { name: data.name }).slice(0, 200), detail: blocking, organizationId: data.organization_id }),
    }).catch(() => null);
    setBusy(false);
    setMessage(r?.ok ? t.taskCreated : t.failed);
  }
  return (
    <div className="person-overview">
      <section className="overview-blocking" aria-labelledby="ovw-blocking">
        <h2 id="ovw-blocking">{t.blocking}</h2>
        {data.blocking.length ? (
          <>
            <p>
              <State tone="danger" text={blocking} />
            </p>
            <p className="actions">
              {data.can.remind && b.dues && b.dues.late > 0 && (
                <Link className="button secondary sm" href={`/${locale}/dues`}>
                  {t.remind}
                </Link>
              )}
              {data.can.task && (
                <button type="button" className="button secondary sm" disabled={busy} onClick={() => void task()}>
                  {t.createTask}
                </button>
              )}
              {data.can.email && data.email && (
                <a className="button secondary sm" href={`mailto:${data.email}?subject=${encodeURIComponent(fill(t.mailSubject, { name: data.name }))}&body=${encodeURIComponent(fill(t.mailBody, { name: data.name, list: blocking }))}`}>
                  {t.email}
                </a>
              )}
            </p>
          </>
        ) : (
          <p>
            <State tone="success" text={t.nothing} />
          </p>
        )}
        <p role="status" className="muted">
          {message}
        </p>
      </section>
      <div className="grid">
        {b.mandates && (
          <Block title={t.mandates} id="mandates" tone="neutral" state={b.mandates.length ? fill(t.mandatesCount, { n: b.mandates.length }) : t.noMandate} see={tab("personal", t.mandates)}>
            {b.mandates.length > 0 && (
              <ul className="plain-list">
                {b.mandates.map((m, i) => (
                  <li key={i}>
                    {t.roles[m.role] ?? m.role}
                    {m.valid_until ? ` · ${fill(t.until, { date: m.valid_until })}` : ` · ${t.open}`}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}
        {b.teams && (
          <Block title={t.teams} id="teams" tone={b.teams.length ? "success" : "warning"} state={b.teams.length ? b.teams.map((x) => x.name).join(", ") : t.noTeam} see={tab("sport", t.teams)} />
        )}
        {b.tasks && (
          <Block title={t.tasks} id="tasks" tone={b.tasks.late ? "danger" : b.tasks.open ? "warning" : "success"} state={fill(t.tasksState, { open: b.tasks.open, late: b.tasks.late })} see={data.kind === "coach" ? tab("todo", t.tasks) : page("/tasks", t.tasks)} />
        )}
        {b.documents && (
          <Block
            title={t.documents}
            id="documents"
            tone={b.documents.missing || b.documents.expired ? "danger" : b.documents.review ? "warning" : "success"}
            state={fill(t.documentsState, { missing: b.documents.missing, review: b.documents.review, expired: b.documents.expired })}
            see={tab("personal", t.documents)}
          />
        )}
        {b.dues && (
          <Block title={t.dues} id="dues" tone={b.dues.late ? "danger" : b.dues.due > b.dues.paid ? "warning" : "success"} state={fill(t.duesState, { due: money(locale, b.dues.due), paid: money(locale, b.dues.paid), late: money(locale, b.dues.late) })} see={tab("personal", t.dues)} />
        )}
        {b.chairs && (
          <Block
            title={t.chairs}
            id="chairs"
            tone={!b.chairs.length ? "neutral" : b.chairs.some((c) => c.status === "maintenance" || c.status === "out_of_service") ? "danger" : "success"}
            state={b.chairs.length ? b.chairs.map((c) => `${c.name} : ${t.chairStatus[c.status] ?? c.status}`).join(", ") : t.noChair}
            see={tab("sport", t.chairs)}
          />
        )}
        {b.attendance && (
          <Block title={t.attendance} id="attendance" tone={b.attendance.absent > b.attendance.present ? "warning" : "success"} state={fill(t.attendanceState, b.attendance)} see={tab("sport", t.attendance)} />
        )}
        {b.next && (
          <Block title={t.next} id="next" tone="neutral" state={b.next.length ? fill(t.nextCount, { n: b.next.length }) : t.noNext} see={page("/calendar", t.next)}>
            {b.next.length > 0 && (
              <ul className="plain-list">
                {b.next.map((e) => (
                  <li key={e.id}>
                    {e.title} · {when(locale, e.starts_at)} · {t.answers[e.response] ?? e.response}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        )}
        {b.authorizations && (
          <Block
            title={t.authorizations}
            id="authorizations"
            tone={b.authorizations.some((a) => a.status === "requested") ? "warning" : "success"}
            state={fill(t.authorizationsState, { waiting: b.authorizations.filter((a) => a.status === "requested").length, signed: b.authorizations.filter((a) => a.status === "signed").length })}
            see={page("/family", t.authorizations)}
          />
        )}
        {b.trainings && (
          <Block
            title={t.trainings}
            id="trainings"
            tone={b.trainings.some((x) => x.status === "approved") ? "success" : "warning"}
            state={
              b.trainings.find((x) => x.status === "approved")?.title ??
              (b.trainings.some((x) => x.status === "requested") ? t.trainingWaiting : t.noTraining)
            }
            see={tab("personal", t.trainings)}
          >
            <p className="muted">{b.permit ? (b.permit.valid_until ? fill(t.permitUntil, { date: b.permit.valid_until }) : t.permitOk) : t.noPermit}</p>
          </Block>
        )}
        {b.guardians && b.guardians.length > 0 && (
          <Block title={t.guardians} id="guardians" tone="neutral" state={b.guardians.map((g) => g.full_name).join(", ")} see={page(`/players/${b.guardians[0].id}`, t.guardians)} />
        )}
        {b.children && b.children.length > 0 && (
          <Block title={t.children} id="children" tone="neutral" state={fill(t.childrenCount, { n: b.children.length })} see={null}>
            <ul className="plain-list">
              {b.children.map((c) => (
                <li key={c.id}>
                  <Link href={`/${locale}/players/${c.id}`}>{c.full_name}</Link>
                </li>
              ))}
            </ul>
          </Block>
        )}
        {b.health && (
          <Block title={t.health} id="health" tone={b.health.support || b.health.safety ? "warning" : "neutral"} state={b.health.support || b.health.safety ? t.healthSome : t.healthNone} see={tab("personal", t.health)} />
        )}
      </div>
    </div>
  );
}

function line(locale: Locale, x: Blocking) {
  const t = overviewCopy[locale].lines;
  switch (x.key) {
    case "licence":
      return t.licence;
    case "duesLate":
      return fill(t.duesLate, { n: x.months });
    case "documentsMissing":
      return fill(t.documentsMissing, { n: x.n });
    case "documentsExpired":
      return fill(t.documentsExpired, { n: x.n });
    case "chairBroken":
      return fill(t.chairBroken, { chair: x.chair });
    case "authorization":
      return fill(t.authorization, { n: x.n });
    case "permitExpired":
      return t.permitExpired;
  }
}
