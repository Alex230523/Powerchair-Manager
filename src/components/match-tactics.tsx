"use client";
import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import type { MatchTactic } from "@/domains/exercises/service";
import { exercisesCopy } from "./exercises-copy";
import { Badge, Button, Card } from "./ui";
import { FieldView } from "./field-editor";
import { failure } from "./exercises";

/**
 * 4: the tactic sheets of a match. The staff attaches them (« Ajouter une
 * tactique ») with notes of its own; the invited players and their parents
 * read them, without those notes.
 */
export function MatchTactics({
  locale,
  matchId,
  organizationId,
  tactics,
  options,
  canEdit,
  staff,
  reload,
}: {
  locale: Locale;
  matchId: string;
  organizationId: string;
  tactics: MatchTactic[];
  options: { id: string; title: string; genre: string }[];
  canEdit: boolean;
  staff: boolean;
  reload: () => Promise<void>;
}) {
  const t = exercisesCopy[locale];
  const x4 = t.x4;
  const [choice, setChoice] = useState(""),
    [notes, setNotes] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, matchId, organizationId }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await reload();
      setMessage(done);
    } catch (e) {
      setError(failure(locale, (e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const free = options.filter((o) => !tactics.some((x) => x.id === o.id));
  return (
    <Card title={x4.tactics.title} subtitle={staff ? undefined : x4.tactics.readOnly} id="match-tactics">
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {tactics.length ? (
        <ul className="match-tactics">
          {tactics.map((x) => (
            <li key={x.id}>
              <details>
                <summary>
                  <strong>{x.title}</strong> <Badge tone={x.genre === "tactic" ? "warning" : "success"}>{x4.genres[x.genre as "exercise" | "tactic"]}</Badge>
                </summary>
                {x.goal && (
                  <p>
                    <strong>{x4.goal}</strong> : {x.goal}
                  </p>
                )}
                {x.drawing && <FieldView locale={locale} drawing={x.drawing} title={x.title} />}
                {x.has_diagram &&
                  (x.diagram_type === "application/pdf" ? (
                    <p>
                      <a className="button secondary" href={`/api/matches/journey/tactic?id=${matchId}&exercise=${x.id}`} target="_blank" rel="noopener noreferrer">
                        {t.diagramPdf}
                      </a>
                    </p>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="exercise-diagram" src={`/api/matches/journey/tactic?id=${matchId}&exercise=${x.id}`} alt={t.diagramAlt(x.title)} />
                  ))}
                {x.description && <p className="prewrap">{x.description}</p>}
                {x.safety && (
                  <p className="prewrap">
                    <strong>{t.form.safety}</strong> : {x.safety}
                  </p>
                )}
                {staff && x.notes && <p className="exercise-notes">{x.notes}</p>}
                {staff && (
                  <span className="exercise-actions">
                    <Link className="button secondary sm" href={`/${locale}/exercises/${x.id}`}>
                      {x4.tactics.open(x.title)}
                    </Link>
                    {canEdit && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void post({ action: "tacticRemove", exerciseId: x.id }, t.saved)}>
                        {x4.tactics.remove(x.title)}
                      </Button>
                    )}
                  </span>
                )}
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{x4.tactics.empty}</p>
      )}
      {canEdit && (
        <form
          className="program-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!choice) return;
            void post({ action: "tacticAdd", exerciseId: choice, notes }, t.saved).then(() => {
              setChoice("");
              setNotes("");
            });
          }}
        >
          <label>
            {x4.tactics.choose}
            <select value={choice} onChange={(e) => setChoice(e.target.value)} required>
              <option value="">…</option>
              {free.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} ({x4.genres[o.genre as "exercise" | "tactic"]})
                </option>
              ))}
            </select>
          </label>
          <label>
            {x4.tactics.notes}
            <input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button type="submit" disabled={busy || !choice}>
            {x4.tactics.add}
          </Button>
          <Link className="button secondary" href={`/${locale}/exercises?genre=tactic`}>{x4.tactics.library}</Link>
        </form>
      )}
    </Card>
  );
}
