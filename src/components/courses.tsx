"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { coursesView } from "@/domains/coaches/service";
import { coursesCopy } from "./courses-copy";
import { errors } from "./access-copy";

type View = Awaited<ReturnType<typeof coursesView>>;
type Course = View["courses"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

/** Federation page: course catalogue and decisions on club requests. */
export function Courses({ locale }: { locale: Locale }) {
  const t = coursesCopy[locale];
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(""),
    [denied, setDenied] = useState(false);
  const failure = useCallback(
    (code: string) => t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable,
    [t, locale],
  );
  const day = (d: string | null) =>
    d
      ? new Intl.DateTimeFormat(tag(locale), {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(d.slice(0, 10) + "T12:00:00Z"))
      : "";
  const load = useCallback(async () => {
    const r = await fetch("/api/courses", { cache: "no-store" });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    setView(v);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!cancelled) setView(v);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (["FEDERATION_ONLY", "FORBIDDEN"].includes(e.message))
          setDenied(true);
        else setError(failure(e.message));
      });
    return () => {
      cancelled = true;
    };
  }, [failure]);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          organizationId: view?.organization_id,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await load();
      setEditing("");
      setMessage(done);
      return true;
    } catch (e) {
      setError(failure(e instanceof Error ? e.message : ""));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const fields = (f: FormData) => {
    const n = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    return {
      title: f.get("title"),
      level: f.get("level") ?? "",
      description: f.get("description") ?? "",
      hours: n("hours"),
      validityYears: n("validity"),
    };
  };
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    void send(
      { action: "createCourse", ...fields(new FormData(form)) },
      t.created,
    ).then((ok) => ok && form.reset());
  }
  function update(e: FormEvent<HTMLFormElement>, k: Course, active = k.active) {
    e.preventDefault();
    void send(
      {
        action: "updateCourse",
        id: k.id,
        version: k.version,
        active,
        ...fields(new FormData(e.currentTarget)),
      },
      t.saved,
    );
  }
  function decide(e: FormEvent<HTMLFormElement>, id: string, decision: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send(
      {
        action: "decide",
        id,
        decision,
        note: f.get("note") ?? "",
        completedOn: (f.get("completed") as string) || null,
      },
      t.decided,
    );
  }
  const courseFields = (prefix: string, k?: Course) => (
    <>
      <div className="form-pair">
        <label htmlFor={`${prefix}-title`}>
          {t.courseTitle}
          <input
            id={`${prefix}-title`}
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={k?.title}
          />
        </label>
        <label htmlFor={`${prefix}-level`}>
          {t.level}
          <input
            id={`${prefix}-level`}
            name="level"
            maxLength={60}
            defaultValue={k?.level}
          />
        </label>
      </div>
      <div className="form-pair">
        <label htmlFor={`${prefix}-hours`}>
          {t.hours}
          <input
            id={`${prefix}-hours`}
            name="hours"
            type="number"
            min={0}
            max={1000}
            step={0.5}
            defaultValue={k?.hours ?? ""}
          />
        </label>
        <label htmlFor={`${prefix}-validity`}>
          {t.validity}
          <input
            id={`${prefix}-validity`}
            name="validity"
            type="number"
            min={1}
            max={20}
            aria-describedby={`${prefix}-validity-hint`}
            defaultValue={k?.validity_years ?? ""}
          />
          <span id={`${prefix}-validity-hint`} className="muted">
            {t.validityHint}
          </span>
        </label>
      </div>
      <label htmlFor={`${prefix}-description`}>
        {t.description}
        <textarea
          id={`${prefix}-description`}
          name="description"
          maxLength={2000}
          defaultValue={k?.description}
        />
      </label>
    </>
  );

  return (
    <main id="main" className="access courses">
      <h1>{t.title}</h1>
      <p className="muted">{t.intro}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {denied && <p className="notice">{t.federationOnly}</p>}
      {!view && !denied && !error && <p role="status">{t.loading}</p>}
      {view && (
        <div className="grid">
          <section className="panel" aria-labelledby="courses-catalogue">
            <h2 id="courses-catalogue">{t.catalogue}</h2>
            {!view.can.manage && <p className="notice">{t.readOnly}</p>}
            {view.courses.length ? (
              <ul className="records course-list">
                {view.courses.map((k) => (
                  <li key={k.id}>
                    <strong>{k.title}</strong>
                    <span className="muted">
                      {k.level ? ` · ${k.level}` : ""}
                      {k.hours ? ` · ${k.hours} h` : ""}
                      {k.validity_years
                        ? ` · ${k.validity_years} ${t.years}`
                        : ""}
                      {` · ${k.approved} ${t.approvedCount} · ${k.pending} ${t.pendingCount}`}
                    </span>
                    <span
                      className="status-tag"
                      data-tone={k.active ? "success" : ""}
                    >
                      {k.active ? t.active : t.inactive}
                    </span>
                    {k.description && (
                      <p className="message-text">{k.description}</p>
                    )}
                    {view.can.manage && (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="text-button"
                          aria-expanded={editing === k.id}
                          onClick={() =>
                            setEditing(editing === k.id ? "" : k.id)
                          }
                        >
                          {editing === k.id ? t.cancel : t.edit}
                          <span className="sr-only"> : {k.title}</span>
                        </button>
                      </div>
                    )}
                    {editing === k.id && (
                      <form
                        className="finance-form"
                        onSubmit={(e) => {
                          const submitter = (e.nativeEvent as SubmitEvent)
                            .submitter as HTMLButtonElement | null;
                          update(
                            e,
                            k,
                            submitter?.name === "toggle" ? !k.active : k.active,
                          );
                        }}
                      >
                        {courseFields(`edit-${k.id}`, k)}
                        <div className="row-actions">
                          <button className="button" disabled={busy}>
                            {t.save}
                          </button>
                          <button
                            className="button secondary"
                            name="toggle"
                            disabled={busy}
                          >
                            {k.active ? t.deactivate : t.activate}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noCourse}</p>
            )}
            {view.can.manage && (
              <form
                className="finance-form"
                onSubmit={create}
                aria-labelledby="courses-new"
              >
                <h3 id="courses-new">{t.newCourse}</h3>
                {courseFields("new")}
                <button className="button" disabled={busy}>
                  {t.create}
                </button>
              </form>
            )}
          </section>

          <section className="panel" aria-labelledby="courses-requests">
            <h2 id="courses-requests">{t.requests}</h2>
            <p className="muted">{t.requestsHint}</p>
            {view.requests.length ? (
              <ul className="records">
                {view.requests.map((q) => (
                  <li key={q.id}>
                    <strong>
                      {q.coach} · {q.course}
                    </strong>
                    <span className="muted">
                      {` · ${t.club} ${q.club} · ${t.requestedBy} ${q.requested_by}`}
                    </span>
                    <span
                      className="status-tag"
                      data-tone={
                        q.status === "approved"
                          ? "success"
                          : q.status === "refused"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {t.statuses[q.status] ?? q.status}
                    </span>
                    {q.note && <p className="message-text">{q.note}</p>}
                    {q.status === "approved" && q.completed_on && (
                      <p className="muted">
                        {day(q.completed_on)}
                        {q.valid_until
                          ? ` · ${t.validUntil} ${day(q.valid_until)}`
                          : ""}
                      </p>
                    )}
                    {q.decision_note && q.status !== "requested" && (
                      <p className="muted">{q.decision_note}</p>
                    )}
                    {view.can.manage && q.status === "requested" && (
                      <form
                        className="finance-form"
                        onSubmit={(e) => {
                          const submitter = (e.nativeEvent as SubmitEvent)
                            .submitter as HTMLButtonElement | null;
                          decide(e, q.id, submitter?.value ?? "approved");
                        }}
                      >
                        <div className="form-pair">
                          <label htmlFor={`done-${q.id}`}>
                            {t.completedOn}
                            <input
                              id={`done-${q.id}`}
                              name="completed"
                              type="date"
                              max={view.today}
                              defaultValue={view.today}
                            />
                          </label>
                          <label htmlFor={`note-${q.id}`}>
                            {t.decisionNote}
                            <input
                              id={`note-${q.id}`}
                              name="note"
                              maxLength={1000}
                            />
                          </label>
                        </div>
                        <div className="row-actions">
                          <button
                            className="button"
                            name="decision"
                            value="approved"
                            disabled={busy}
                          >
                            {t.approve}
                            <span className="sr-only"> : {q.coach}</span>
                          </button>
                          <button
                            className="button secondary"
                            name="decision"
                            value="refused"
                            disabled={busy}
                          >
                            {t.refuse}
                            <span className="sr-only"> : {q.coach}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t.noRequest}</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
