"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { obligationsView } from "@/domains/club/obligations";
import { errors } from "./access-copy";
import { obligationsCopy } from "./club-obligations-copy";
import { Badge, Button, Card } from "./ui";
import { Modal } from "./modal";
import { cssVars } from "./css-vars";

type View = Awaited<ReturnType<typeof obligationsView>>;
type Row = View["rows"][number];
const tone = { done: "success", late: "danger", todo: "warning" } as const;

/** Settings > Club (wave 16, A): the club's obligations of a year, proposed from its legal form. */
export function ClubObligations({ locale }: { locale: Locale }) {
  const t = obligationsCopy[locale];
  const [year, setYear] = useState<number | null>(null),
    [view, setView] = useState<View | null>(null),
    [hidden, setHidden] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Row | "new" | null>(null),
    [removing, setRemoving] = useState("");
  const load = useCallback(
    (y: number | null) =>
      fetch(`/api/club/obligations${y ? `?year=${y}` : ""}`, { cache: "no-store" })
        .then(async (r) => {
          if (r.status === 403) return setHidden(true);
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setView(v);
        })
        .catch(() => setError(t.failed)),
    [t.failed],
  );
  useEffect(() => {
    void load(year);
  }, [load, year]);

  async function send(body: Record<string, unknown>, done: (v: { added?: number }) => string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/club/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, organizationId: view?.organization_id }),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await load(year);
      setMessage(done(v));
      return true;
    } catch (e) {
      const code = (e as Error).message;
      if (code === "STALE_VERSION") await load(year);
      setError(code === "STALE_VERSION" ? t.stale : (errors[code]?.[locale] ?? t.failed));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const values = (row: Row | null, f: FormData) => {
    const get = (k: string) => String(f.get(k) ?? "").trim();
    return {
      title: get("title"),
      description: get("description"),
      periodicity: get("periodicity") || "annual",
      dueOn: get("dueOn") || null,
      doneOn: get("doneOn") || null,
      proofUrl: get("proofUrl"),
      responsibleId: get("responsibleId") || null,
      ...(row ? { action: "update", id: row.id, version: row.version } : { action: "add", year: view?.year }),
    };
  };
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const row = editing === "new" ? null : editing;
    if (await send(values(row, new FormData(e.currentTarget)), () => t.saved)) setEditing(null);
  }
  const markDone = (r: Row) =>
    send(
      {
        action: "update",
        id: r.id,
        version: r.version,
        title: r.title,
        description: r.description,
        periodicity: r.periodicity,
        dueOn: r.due_on,
        doneOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()),
        proofUrl: r.proof_url,
        responsibleId: r.responsible_profile_id,
      },
      () => t.saved,
    );
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")) : "");

  if (hidden) return null;
  const row = editing && editing !== "new" ? editing : null;
  return (
    <Card title={t.title} labelledBy="settings-obligations" headingId="settings-obligations" className="obligations-card">
      <p className="muted">{t.intro}</p>
      {!view && !error && <p role="status">{t.loading}</p>}
      {error && !editing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {view && (
        <>
          <div className="obligations-tools">
            <label className="compact-field">
              {t.year}
              <select value={view.year} onChange={(e) => setYear(Number(e.target.value))}>
                {[...new Set([view.year + 1, ...view.years])]
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>
            </label>
            <span className="obligations-progress">
              <span>{t.progress(view.summary.done, view.summary.total)}</span>
              {view.summary.total > 0 && (
                <span className="progress-bar" aria-hidden="true">
                  <span style={cssVars({ progress: `${Math.round((view.summary.done / view.summary.total) * 100)}%` })} />
                </span>
              )}
            </span>
            <span className="obligations-actions">
              {view.legalForm && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "propose", year: view.year, locale }, (v) => t.proposed(v.added ?? 0))}>
                  {t.propose}
                </Button>
              )}
              {view.rows.some((r) => r.periodicity === "annual") && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send({ action: "nextYear", year: view.year }, (v) => t.nextDone(v.added ?? 0, view.year + 1))}>
                  {t.nextYear}
                </Button>
              )}
              <Button size="sm" icon="plus" disabled={busy} onClick={() => setEditing("new")}>
                {t.add}
              </Button>
            </span>
          </div>
          {!view.legalForm && <p className="notice">{t.noForm}</p>}
          {view.rows.length ? (
            <div className="table-scroll" role="region" aria-label={t.title} tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t.obligation}</th>
                    <th scope="col">{t.due}</th>
                    <th scope="col">{t.done}</th>
                    <th scope="col">{t.responsible}</th>
                    <th scope="col">{t.proof}</th>
                    <th scope="col">{t.status}</th>
                    <th scope="col">{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        {r.title}
                        {r.description && <span className="muted obligation-detail">{r.description}</span>}
                      </th>
                      <td>{date(r.due_on)}</td>
                      <td>
                        {date(r.done_on)}
                        {r.automatic && r.done_on && <span className="muted obligation-detail">{r.auto_source === "affiliation" ? t.automaticAffiliation : t.automatic}</span>}
                      </td>
                      <td>{r.responsible ?? ""}</td>
                      <td>
                        {r.proof_url && (
                          <a href={r.proof_url} target="_blank" rel="noopener noreferrer">
                            {t.openProof}
                          </a>
                        )}
                      </td>
                      <td>
                        <Badge tone={tone[r.state]}>{t.states[r.state]}</Badge>
                      </td>
                      <td>
                        <span className="obligations-row-actions">
                          {r.state !== "done" && (
                            <Button size="sm" variant="secondary" disabled={busy} aria-label={`${t.markDone} : ${r.title}`} onClick={() => void markDone(r)}>
                              {t.markDone}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={busy} aria-label={`${t.edit} : ${r.title}`} onClick={() => setEditing(r)}>
                            {t.edit}
                          </Button>
                          <Button
                            size="sm"
                            variant={removing === r.id ? "danger" : "ghost"}
                            disabled={busy}
                            aria-label={`${removing === r.id ? t.confirmRemove : t.remove} : ${r.title}`}
                            onClick={() => {
                              if (removing !== r.id) return setRemoving(r.id);
                              setRemoving("");
                              void send({ action: "archive", id: r.id }, () => t.removed);
                            }}
                          >
                            {removing === r.id ? t.confirmRemove : t.remove}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{t.empty}</p>
          )}
        </>
      )}
      {editing && view && (
        <Modal title={row ? row.title : t.add} close={() => setEditing(null)}>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void save(e)}>
            <label>
              {t.form.titleLabel}
              <input name="title" required minLength={2} maxLength={160} defaultValue={row?.title ?? ""} />
            </label>
            <label>
              {t.form.description}
              <textarea name="description" rows={2} maxLength={1000} defaultValue={row?.description ?? ""} />
            </label>
            <label>
              {t.form.periodicity}
              <select name="periodicity" defaultValue={row?.periodicity ?? "annual"}>
                <option value="annual">{t.form.periodicities.annual}</option>
                <option value="once">{t.form.periodicities.once}</option>
              </select>
            </label>
            <label>
              {t.form.due}
              <input name="dueOn" type="date" defaultValue={row?.due_on ?? ""} />
            </label>
            <label>
              {t.form.done}
              <input name="doneOn" type="date" defaultValue={row && !row.automatic ? (row.done_on ?? "") : ""} />
            </label>
            <label>
              {t.form.proof}
              <input name="proofUrl" type="url" pattern="https://.*" maxLength={500} defaultValue={row?.proof_url ?? ""} />
            </label>
            <label>
              {t.form.responsible}
              <select name="responsibleId" defaultValue={row?.responsible_profile_id ?? ""}>
                <option value="">{t.form.nobody}</option>
                {view.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" loading={busy}>
              {t.form.save}
            </Button>
          </form>
        </Modal>
      )}
    </Card>
  );
}
