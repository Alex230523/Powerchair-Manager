"use client";
import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { Prospect, recruitmentView } from "@/domains/recruitment/service";
import { prospectSources, prospectStages } from "@/domains/recruitment/schema";
import { errors } from "./access-copy";
import { recruitmentCopy, fill } from "./recruitment-copy";
import { useData } from "./use-api";
import { Modal } from "./modal";
import { Badge, Card, DataTable, EmptyState, PageHeader, Segmented } from "./ui";

/**
 * H1: « Recrutement ». The prospects by stage (a board whose cards move with
 * a select, so by keyboard too, or a list), the trial session with a club
 * chair, « Inscrire », the partners with their counters, the indicators by
 * source, the deletion delay.
 */
type View = Awaited<ReturnType<typeof recruitmentView>>;
type Act = (body: Record<string, unknown>, done?: string) => Promise<{ ok: boolean; value: Record<string, unknown> }>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(d));
const when = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(d));

export function Recruitment({ locale }: { locale: Locale }) {
  const t = recruitmentCopy[locale];
  const message = useCallback((code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable, [t, locale]);
  const { data, error, denied, reload } = useData<View>("/api/recruitment", message);
  const [view, setView] = useState("board"),
    [editing, setEditing] = useState<Prospect | "new" | null>(null),
    [trialFor, setTrialFor] = useState<Prospect | null>(null),
    [status, setStatus] = useState("");
  const act: Act = async (body, done = t.saved) => {
    const r = await fetch("/api/recruitment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data?.organization_id }) }).catch(() => null);
    const value = r ? await r.json().catch(() => ({})) : {};
    setStatus(r?.ok ? done : message((value.error as string) ?? ""));
    if (r?.ok) await reload();
    return { ok: !!r?.ok, value };
  };
  return (
    <main id="main" className="access recruitment">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          data ? (
            <button type="button" className="button" onClick={() => setEditing("new")}>
              {t.add}
            </button>
          ) : null
        }
      />
      {denied ? <EmptyState icon="lock" title={errors.FORBIDDEN?.[locale] ?? t.unavailable} /> : error ? <p role="alert">{error}</p> : !data ? <p role="status">{t.loading}</p> : null}
      <p role="status" className="muted">
        {status}
      </p>
      {data && (
        <>
          <Segmented label={t.views} items={[{ id: "board", label: t.board }, { id: "list", label: t.list }]} value={view} onChange={setView} />
          {!data.prospects.length ? (
            <EmptyState title={t.empty} />
          ) : view === "board" ? (
            <div className="prospect-board">
              {prospectStages.map((st) => {
                const mine = data.prospects.filter((x) => x.stage === st);
                return (
                  <section key={st} className="prospect-column" aria-labelledby={`col-${st}`}>
                    <h2 id={`col-${st}`}>
                      {t.stages[st]} <Badge>{mine.length}</Badge>
                    </h2>
                    {mine.length ? (
                      <ul className="plain-list">
                        {mine.map((x) => (
                          <li key={x.id}>
                            <ProspectCard locale={locale} data={data} x={x} act={act} edit={() => setEditing(x)} trial={() => setTrialFor(x)} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted small">{t.emptyColumn}</p>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <ul className="plain-list prospect-list">
              {data.prospects.map((x) => (
                <li key={x.id}>
                  <ProspectCard locale={locale} data={data} x={x} act={act} edit={() => setEditing(x)} trial={() => setTrialFor(x)} />
                </li>
              ))}
            </ul>
          )}
          <Partners locale={locale} data={data} act={act} />
          <Indicators locale={locale} data={data} />
          <form
            className="inline-form"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              void act({ action: "retention", months: Number(new FormData(e.currentTarget).get("months")) });
            }}
          >
            <label htmlFor="rec-retention">
              {t.retention}
              <input id="rec-retention" name="months" type="number" min={6} max={60} defaultValue={data.retention} aria-describedby="rec-retention-help" />
            </label>
            <button type="submit" className="button secondary sm">
              {t.retentionSave}
            </button>
            <p className="field-help" id="rec-retention-help">
              {t.retentionHelp}
            </p>
          </form>
          {editing && <ProspectForm locale={locale} data={data} x={editing === "new" ? null : editing} close={() => setEditing(null)} act={act} />}
          {trialFor && <TrialForm locale={locale} data={data} x={trialFor} close={() => setTrialFor(null)} act={act} />}
        </>
      )}
    </main>
  );
}

function ProspectCard({ locale, data, x, act, edit, trial }: { locale: Locale; data: View; x: Prospect; act: Act; edit: () => void; trial: () => void }) {
  const t = recruitmentCopy[locale];
  const name = `${x.first_name} ${x.last_name}`.trim();
  return (
    <Card title={name} labelledBy={`pr-${x.id}`} headingId={`pr-${x.id}`}>
      <p className="muted small">
        {t.sources[x.source]}
        {x.origin_name ? ` · ${x.origin_name}` : ""}
        {x.approx_age ? ` · ${fill(t.age, { n: x.approx_age })}` : ""}
      </p>
      {x.minor && <p className="small">{fill(t.childOf, { parent: x.parent_name })}</p>}
      {x.trial_at && <p className="small">{fill(t.trialOn, { date: when(locale, x.trial_at) })}</p>}
      {x.trial_chair && <p className="small">{fill(t.chairBooked, { chair: x.trial_chair })}</p>}
      <p className="muted small">{fill(t.since, { date: day(locale, x.last_contact_at) })}</p>
      {x.stage !== "registered" && (
        <label htmlFor={`stage-${x.id}`}>
          {fill(t.moveTo, { name: x.first_name })}
          <select id={`stage-${x.id}`} value={x.stage} onChange={(e) => void act({ action: "stage", id: x.id, stage: e.target.value })}>
            {prospectStages
              .filter((s) => s !== "registered")
              .map((s) => (
                <option key={s} value={s}>
                  {t.stages[s]}
                </option>
              ))}
          </select>
        </label>
      )}
      <p className="actions">
        <button type="button" className="text-button" onClick={edit}>
          {t.edit}
          <span className="sr-only"> : {name}</span>
        </button>
        {x.stage !== "registered" && (
          <>
            <button type="button" className="text-button" onClick={trial}>
              {t.trial}
              <span className="sr-only"> : {name}</span>
            </button>
            <button type="button" className="text-button" onClick={() => void act({ action: "contacted", id: x.id })}>
              {t.contacted}
              <span className="sr-only"> : {name}</span>
            </button>
            {data.can.register && (
              <button type="button" className="button secondary sm" onClick={() => void act({ action: "register", id: x.id }, t.registered)}>
                {t.register}
                <span className="sr-only"> : {name}</span>
              </button>
            )}
          </>
        )}
        {x.profile_id && <Link href={`/${locale}/players/${x.profile_id}`}>{t.openPlayer}</Link>}
      </p>
    </Card>
  );
}

const tri = (v: FormDataEntryValue | null) => (v === "yes" ? true : v === "no" ? false : null);
function ProspectForm({ locale, data, x, close, act }: { locale: Locale; data: View; x: Prospect | null; close: () => void; act: Act }) {
  const t = recruitmentCopy[locale];
  const [minor, setMinor] = useState(x?.minor ?? false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const r = await act({
      action: x ? "update" : "create",
      ...(x ? { id: x.id } : {}),
      firstName: v("firstName"),
      lastName: v("lastName"),
      minor,
      approxAge: v("age") ? Number(v("age")) : null,
      email: minor ? "" : v("email"),
      phone: minor ? "" : v("phone"),
      parentName: v("parentName"),
      parentEmail: v("parentEmail"),
      parentPhone: v("parentPhone"),
      source: v("source"),
      originOrganizationId: v("origin") || null,
      ownChair: tri(f.get("ownChair")),
      needsTransport: tri(f.get("transport")),
      notes: v("notes"),
      consent: f.get("consent") === "on",
    });
    if (r.ok) close();
  }
  const triSelect = (name: string, label: string, value: boolean | null | undefined) => (
    <label htmlFor={`pf-${name}`}>
      {label}
      <select id={`pf-${name}`} name={name} defaultValue={value === true ? "yes" : value === false ? "no" : ""}>
        <option value="">{t.unknown}</option>
        <option value="yes">{t.yes}</option>
        <option value="no">{t.no}</option>
      </select>
    </label>
  );
  return (
    <Modal title={x ? `${x.first_name} ${x.last_name}`.trim() : t.add} close={close}>
      <form className="finance-form" onSubmit={submit}>
        <label htmlFor="pf-first">
          {t.firstName}
          <input id="pf-first" name="firstName" required maxLength={80} defaultValue={x?.first_name ?? ""} />
        </label>
        <label htmlFor="pf-last">
          {t.lastName}
          <input id="pf-last" name="lastName" maxLength={80} defaultValue={x?.last_name ?? ""} />
        </label>
        <label className="check" htmlFor="pf-minor">
          <input id="pf-minor" type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} />
          {t.minor}
        </label>
        <label htmlFor="pf-age">
          {t.approxAge}
          <input id="pf-age" name="age" type="number" min={3} max={99} defaultValue={x?.approx_age ?? ""} />
        </label>
        {minor ? null : (
          <>
            <label htmlFor="pf-email">
              {t.email}
              <input id="pf-email" name="email" type="email" maxLength={254} defaultValue={x?.email ?? ""} />
            </label>
            <label htmlFor="pf-phone">
              {t.phone}
              <input id="pf-phone" name="phone" type="tel" maxLength={40} defaultValue={x?.phone ?? ""} />
            </label>
          </>
        )}
        <label htmlFor="pf-parent">
          {t.parentName}
          <input id="pf-parent" name="parentName" required={minor} minLength={minor ? 2 : undefined} maxLength={120} defaultValue={x?.parent_name ?? ""} />
        </label>
        <label htmlFor="pf-parent-email">
          {t.parentEmail}
          <input id="pf-parent-email" name="parentEmail" type="email" maxLength={254} defaultValue={x?.parent_email ?? ""} />
        </label>
        <label htmlFor="pf-parent-phone">
          {t.parentPhone}
          <input id="pf-parent-phone" name="parentPhone" type="tel" maxLength={40} defaultValue={x?.parent_phone ?? ""} />
        </label>
        <label htmlFor="pf-source">
          {t.source}
          <select id="pf-source" name="source" defaultValue={x?.source ?? "rehab"}>
            {prospectSources.map((s) => (
              <option key={s} value={s}>
                {t.sources[s]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="pf-origin">
          {t.originOrganization}
          <select id="pf-origin" name="origin" defaultValue={x?.origin_organization_id ?? ""}>
            <option value="">{t.none}</option>
            {data.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {triSelect("ownChair", t.ownChair, x?.own_chair)}
        {triSelect("transport", t.needsTransport, x?.needs_transport)}
        <label htmlFor="pf-notes">
          {t.notes}
          <textarea id="pf-notes" name="notes" maxLength={1000} defaultValue={x?.notes ?? ""} />
        </label>
        <label className="check" htmlFor="pf-consent">
          <input id="pf-consent" name="consent" type="checkbox" defaultChecked={x?.consent ?? false} />
          {t.consent}
        </label>
        <p className="actions">
          <button type="button" className="button secondary" onClick={close}>
            {t.cancel}
          </button>
          <button type="submit" className="button">
            {t.save}
          </button>
          {x && !x.profile_id && (
            <button
              type="button"
              className="text-button danger"
              onClick={() => {
                if (window.confirm(t.removeConfirm)) void act({ action: "delete", id: x.id }).then((r) => r.ok && close());
              }}
            >
              {t.remove}
            </button>
          )}
        </p>
      </form>
    </Modal>
  );
}

function TrialForm({ locale, data, x, close, act }: { locale: Locale; data: View; x: Prospect; close: () => void; act: Act }) {
  const t = recruitmentCopy[locale];
  const [kind, setKind] = useState<"existing" | "new">(data.sessions.length ? "existing" : "new"),
    [eventId, setEventId] = useState(data.sessions[0]?.id ?? ""),
    [dayValue, setDayValue] = useState(""),
    [chairs, setChairs] = useState<{ id: string; name: string }[] | null>(null);
  async function loadChairs(q: string) {
    const r = await fetch(`/api/recruitment?chairs=1&${q}`).catch(() => null);
    setChairs(r?.ok ? await r.json() : []);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await act({
      action: "trial",
      id: x.id,
      eventId: kind === "existing" ? eventId || null : null,
      startsAt: kind === "new" && dayValue ? new Date(dayValue).toISOString() : null,
      teamId: kind === "new" ? String(f.get("team") ?? "") || null : null,
      chairId: String(f.get("chair") ?? "") || null,
      bring: String(f.get("bring") ?? ""),
      locale,
    });
    if (r.ok) {
      close();
      if (!r.value.sent) await act({ action: "contacted", id: x.id }, t.trialNoMail);
    }
  }
  return (
    <Modal title={fill(t.trialTitle, { name: x.first_name })} close={close}>
      <form className="finance-form" onSubmit={submit}>
        <fieldset>
          <legend>{t.trial}</legend>
          {(["existing", "new"] as const).map((k) => (
            <label className="check" key={k} htmlFor={`tr-${k}`}>
              <input id={`tr-${k}`} type="radio" name="kind" checked={kind === k} disabled={k === "existing" && !data.sessions.length} onChange={() => {
                  setKind(k);
                  setChairs(null);
                }} />
              {k === "existing" ? t.trialExisting : t.trialNew}
            </label>
          ))}
        </fieldset>
        {kind === "existing" ? (
          <label htmlFor="tr-session">
            {t.session}
            <select
              id="tr-session"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                void loadChairs(`event=${e.target.value}`);
              }}
              onFocus={() => chairs === null && eventId && void loadChairs(`event=${eventId}`)}
            >
              {data.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {when(locale, s.starts_at)} · {s.title}
                  {s.team ? ` · ${s.team}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label htmlFor="tr-at">
              {t.startsAt}
              <input
                id="tr-at"
                type="datetime-local"
                required
                value={dayValue}
                onChange={(e) => {
                  setDayValue(e.target.value);
                  if (e.target.value) void loadChairs(`day=${e.target.value.slice(0, 10)}`);
                }}
              />
            </label>
            <label htmlFor="tr-team">
              {t.team}
              <select id="tr-team" name="team" defaultValue="">
                <option value="">{t.noTeam}</option>
                {data.teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label htmlFor="tr-chair">
          {t.chair}
          <select id="tr-chair" name="chair" defaultValue="" onFocus={() => chairs === null && kind === "existing" && eventId && void loadChairs(`event=${eventId}`)}>
            <option value="">{t.noChair}</option>
            {(chairs ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {chairs !== null && !chairs.length && <p className="muted small">{t.noFreeChair}</p>}
        <label htmlFor="tr-bring">
          {t.bring}
          <input id="tr-bring" name="bring" maxLength={500} placeholder={t.bringHint} />
        </label>
        <p className="actions">
          <button type="button" className="button secondary" onClick={close}>
            {t.cancel}
          </button>
          <button type="submit" className="button">
            {t.sendTrial}
          </button>
        </p>
      </form>
    </Modal>
  );
}

function Partners({ locale, data, act }: { locale: Locale; data: View; act: Act }) {
  const t = recruitmentCopy[locale];
  return (
    <Card title={t.partners} labelledBy="rec-partners" headingId="rec-partners">
      <p className="muted">{t.partnersIntro}</p>
      {data.partners.length ? (
        <ul className="plain-list">
          {data.partners.map((o) => (
            <li key={o.id} className="partner-line">
              <strong>{o.name}</strong> · {fill(t.partnerLine, { prospects: o.prospects, registered: o.registered })}
              <details>
                <summary>{t.presentClub}</summary>
                <form
                  className="inline-form"
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault();
                    void act({ action: "presentReminder", organizationId: o.id, dueOn: String(new FormData(e.currentTarget).get("due")) });
                  }}
                >
                  <label htmlFor={`present-${o.id}`}>
                    {fill(t.presentDate, { name: o.name })}
                    <input id={`present-${o.id}`} name="due" type="date" required />
                  </label>
                  <button type="submit" className="button secondary sm">
                    {t.presentSave}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t.partnersNone}</p>
      )}
    </Card>
  );
}

function Indicators({ locale, data }: { locale: Locale; data: View }) {
  const t = recruitmentCopy[locale];
  const rate = (n: number | null) => (n === null ? t.noRate : fill(t.rate, { n }));
  if (!data.indicators.length) return null;
  return (
    <section aria-labelledby="rec-indicators">
      <h2 id="rec-indicators">{t.indicators}</h2>
      <DataTable label={t.indicators}>
        <thead>
          <tr>
            <th scope="col">{t.colSource}</th>
            <th scope="col">{t.colProspects}</th>
            <th scope="col">{t.colTrial}</th>
            <th scope="col">{t.colRegistered}</th>
            <th scope="col">{t.colKept}</th>
          </tr>
        </thead>
        <tbody>
          {data.indicators.map((r) => (
            <tr key={r.source}>
              <th scope="row">{t.sources[r.source] ?? r.source}</th>
              <td>{r.prospects}</td>
              <td>
                {r.trial} ({rate(r.trialRate)})
              </td>
              <td>
                {r.registered} ({rate(r.registerRate)})
              </td>
              <td>{r.keptOf ? `${r.kept}/${r.keptOf} (${rate(r.keptRate)})` : t.noRate}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}
