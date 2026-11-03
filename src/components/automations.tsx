"use client";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { automationsView } from "@/domains/automations/service";
import type { PlannedLine } from "@/domains/automations/engine";
import { automationsCopy } from "./automations-copy";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, Button, Card, EmptyState } from "./ui";
import { TemplateChoice } from "./mail-templates";

type View = Awaited<ReturnType<typeof automationsView>>;
type Rule = View["rules"][number];
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));
const when = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(d));

/**
 * B7: the club's automations (Réglages › Notifications). A predefined
 * catalogue, each rule switched on, paused and simulated; a global stop;
 * the run log. No free builder and no SMS.
 */
export function Automations({ locale }: { locale: Locale }) {
  const t = automationsCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, denied, reload } = useData<View>("/api/automations", failure);
  const { busy, message, post } = usePost("/api/automations", reload, setError, failure);
  const [simulation, setSimulation] = useState<PlannedLine[] | null>(null),
    [simulating, setSimulating] = useState(false);
  // Not the president nor a notifications manager: no panel at all.
  if (denied) return null;
  if (!data) return error ? <p role="alert">{error}</p> : null;
  const send = (body: Record<string, unknown>, done: string) => post({ ...body, organizationId: data.organization_id }, done);
  const simulate = async () => {
    setSimulating(true);
    try {
      const r = await fetch("/api/automations?simulate=1", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setSimulation((v as View).simulation ?? []);
    } catch (e) {
      setError(failure((e as Error).message));
    } finally {
      setSimulating(false);
    }
  };
  return (
    <section className="settings-section automations" aria-labelledby="settings-automations" id="settings-automations">
      <h2 id="settings-automations">{t.title}</h2>
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <div className={`automation-stop${data.stopped ? " is-stopped" : ""}`}>
        <p>
          <Badge tone={data.stopped ? "danger" : "success"} dot>
            {data.stopped ? t.stopped : t.running}
          </Badge>
        </p>
        <Button variant={data.stopped ? "primary" : "danger"} disabled={busy} aria-describedby="automation-stop-hint" onClick={() => void send({ action: "stop", stopped: !data.stopped }, data.stopped ? t.running : t.stopped)}>
          {data.stopped ? t.resume : t.stop}
        </Button>
        <p className="muted small" id="automation-stop-hint">
          {t.stopHint}
        </p>
      </div>
      <ul className="automation-list">
        {data.rules.map((r) => (
          <RuleCard key={r.rule} locale={locale} rule={r} busy={busy} send={send} />
        ))}
      </ul>
      <Card title={t.simulation}>
        <p className="muted">{t.simulateHint}</p>
        <Button variant="secondary" disabled={simulating} onClick={() => void simulate()}>
          {t.simulate}
        </Button>
        {simulation &&
          (simulation.length ? (
            <div className="table-scroll" role="region" aria-label={t.simulation} tabIndex={0}>
              <table className="compact-table">
                <thead>
                  <tr>
                    <th scope="col">{t.colRule}</th>
                    <th scope="col">{t.colAbout}</th>
                    <th scope="col">{t.colRecipient}</th>
                    <th scope="col">{t.colActions}</th>
                    <th scope="col">{t.colState}</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.map((l, i) => (
                    <tr key={i}>
                      <th scope="row">{t.rules[l.rule].name}</th>
                      <td>{l.about}</td>
                      <td>{l.recipient || "…"}</td>
                      <td>{l.actions.map((a) => t.actionLabels[a]).join(", ")}</td>
                      <td>{l.already ? <Badge>{t.already}</Badge> : <Badge tone="info">{t.toDo}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status">{t.simulationEmpty}</p>
          ))}
      </Card>
      <Card title={t.journal}>
        {data.journal.length ? (
          <div className="table-scroll" role="region" aria-label={t.journal} tabIndex={0}>
            <table className="compact-table">
              <thead>
                <tr>
                  <th scope="col">{t.colWhen}</th>
                  <th scope="col">{t.colRule}</th>
                  <th scope="col">{t.colAbout}</th>
                  <th scope="col">{t.colRecipient}</th>
                  <th scope="col">{t.colResult}</th>
                </tr>
              </thead>
              <tbody>
                {data.journal.map((j) => (
                  <tr key={j.id}>
                    <th scope="row">{when(locale, j.created_at)}</th>
                    <td>{t.rules[j.rule]?.name ?? j.rule}</td>
                    <td>{j.about}</td>
                    <td>{j.recipient_label}</td>
                    <td>
                      <Badge tone={j.result === "error" ? "danger" : j.result === "sent" ? "success" : "neutral"}>{t.results[j.result as keyof typeof t.results] ?? j.result}</Badge>
                      {j.error_code && <span className="muted small"> {j.error_code}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t.journalEmpty} />
        )}
      </Card>
    </section>
  );
}

function RuleCard({ locale, rule: r, busy, send }: { locale: Locale; rule: Rule; busy: boolean; send: (b: Record<string, unknown>, done: string) => Promise<boolean> }) {
  const t = automationsCopy[locale];
  const id = `automation-${r.rule}`;
  const name = t.rules[r.rule].name;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const messages = Object.fromEntries(
      (["fr", "nl", "en"] as const)
        .map((l) => [l, { subject: String(f.get(`subject-${l}`) ?? "").trim(), body: String(f.get(`body-${l}`) ?? "").trim() }] as const)
        .filter(([, m]) => m.subject.length >= 2 && m.body.length >= 2),
    );
    void send(
      {
        action: "rule",
        rule: r.rule,
        enabled: f.get("enabled") === "on",
        paused: f.get("paused") === "on",
        ...(r.def.delay ? { delayDays: Number(f.get("delay")) } : {}),
        ...(r.def.recipients.length > 1 ? { recipients: String(f.get("recipients")) } : {}),
        actions: r.def.actions.filter((a) => (r.def.actions.length > 1 ? f.get(`action-${a}`) === "on" : true)),
        ...(r.defaults ? { messages } : {}),
      },
      t.saved,
    );
  };
  return (
    <li className="automation-rule" data-on={r.settings.enabled && !r.settings.paused ? "true" : "false"}>
      <form onSubmit={submit} aria-labelledby={`${id}-name`}>
        <div className="automation-head">
          <h3 id={`${id}-name`}>{name}</h3>
          {r.def.builtin && <Badge tone="info">{t.builtin}</Badge>}
          {r.moduleOff && <Badge tone="warning">{t.moduleOff}</Badge>}
        </div>
        <p className="muted small">{t.rules[r.rule].when}</p>
        {r.def.builtin && <p className="muted small">{t.builtinHint}</p>}
        <div className="automation-switches">
          <label className="check">
            <input type="checkbox" name="enabled" defaultChecked={r.settings.enabled} />
            {t.enabled}
          </label>
          <label className="check">
            <input type="checkbox" name="paused" defaultChecked={r.settings.paused} />
            {t.paused}
          </label>
        </div>
        {r.def.delay && (
          <label htmlFor={`${id}-delay`}>
            {t.delay} ({t.delayUnit[r.rule]})
            <input id={`${id}-delay`} name="delay" type="number" min={r.def.delay.min} max={r.def.delay.max} defaultValue={r.settings.delay ?? r.def.delay.value} required />
          </label>
        )}
        {r.def.recipients.length > 1 && (
          <label htmlFor={`${id}-recipients`}>
            {t.recipients}
            <select id={`${id}-recipients`} name="recipients" defaultValue={r.settings.recipients}>
              {r.def.recipients.map((x) => (
                <option key={x} value={x}>
                  {t.recipientLabels[x]}
                </option>
              ))}
            </select>
          </label>
        )}
        {r.def.actions.length > 1 && (
          <fieldset className="automation-actions">
            <legend>{t.actions}</legend>
            {r.def.actions.map((a) => (
              <label key={a} className="check">
                <input type="checkbox" name={`action-${a}`} defaultChecked={r.settings.actions.includes(a)} />
                {t.actionLabels[a]}
              </label>
            ))}
          </fieldset>
        )}
        {r.defaults && (
          <details className="automation-message">
            <summary>{t.message}</summary>
            <p className="muted small">{t.messageHint}</p>
            {/* 10: or one of the club's templates. */}
            <TemplateChoice locale={locale} target={`automation:${r.rule}`} />
            {(["fr", "nl", "en"] as const).map((l) => (
              <fieldset key={l}>
                <legend>{t.languages[l]}</legend>
                <label htmlFor={`${id}-subject-${l}`}>
                  {t.subject}
                  <input id={`${id}-subject-${l}`} name={`subject-${l}`} maxLength={200} defaultValue={r.settings.messages[l]?.subject ?? ""} placeholder={r.defaults![l].subject} />
                </label>
                <label htmlFor={`${id}-body-${l}`}>
                  {t.body}
                  <textarea id={`${id}-body-${l}`} name={`body-${l}`} rows={3} maxLength={4000} defaultValue={r.settings.messages[l]?.body ?? ""} placeholder={r.defaults![l].body} />
                </label>
              </fieldset>
            ))}
          </details>
        )}
        <Button size="sm" disabled={busy} aria-label={fill(t.saveOf, { rule: name })}>
          {t.save}
        </Button>
      </form>
    </li>
  );
}
