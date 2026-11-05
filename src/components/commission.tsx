"use client";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { commissionView } from "@/domains/commission/service";
import { decisionKinds } from "@/domains/commission/schema";
import { commissionCopy } from "./commission-copy";
import { errors } from "./access-copy";
import { brusselsToday } from "./chair-sheet";
import { Badge, Button, Card, EmptyState, PageHeader } from "./ui";
import { Modal } from "./modal";
import { useData, usePost } from "./use-api";

type View = Awaited<ReturnType<typeof commissionView>>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/** Lot 6 (05/11/2026): the commission's journal, each decision signed by its members. */
export function Commission({ locale }: { locale: Locale }) {
  const t = commissionCopy[locale];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? code, [locale]);
  const { data, error, setError, denied, reload } = useData<View>("/api/federation/commission", failure);
  const { busy, message, post } = usePost("/api/federation/commission", reload, setError, failure);
  const [adding, setAdding] = useState(false);
  const day = (d: string) => new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  if (denied) return <main id="main" className="access commission"><EmptyState title={errors.FORBIDDEN?.[locale] ?? t.title} /></main>;
  const send = (body: Record<string, unknown>, done = t.saved) => post({ ...body, organizationId: data?.organization_id }, done);
  return (
    <main id="main" className="access commission">
      <PageHeader title={t.title} subtitle={t.intro} actions={data?.canManage ? <Button icon="plus" onClick={() => setAdding(true)}>{t.record}</Button> : undefined} />
      {error && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      {data && (
        <Card title={t.title} id="commission-journal">
          <p className="muted small">{fill(t.members, { names: data.members.map((m) => m.name).join(", ") })}</p>
          {data.decisions.length ? (
            <ul className="profile-list decisions">
              {data.decisions.map((d) => {
                const all = data.members.length > 0 && data.members.every((m) => d.signatures.some((g) => g.user_id === m.id));
                return (
                  <li key={d.id}>
                    <div>
                      <p className="small muted">
                        <Badge tone="info">{t.kinds[d.kind]}</Badge> {day(d.decided_on)} · {fill(t.by, { name: d.author })}
                      </p>
                      <strong>{d.subject}</strong>
                      <p className="prewrap">{d.decision}</p>
                      <p className="small">
                        <Badge tone={all ? "success" : d.signatures.length ? "warning" : "neutral"}>
                          {all ? t.signedAll : d.signatures.length ? fill(t.signedBy, { names: d.signatures.map((g) => g.name).join(", ") }) : t.signedNone}
                        </Badge>
                      </p>
                    </div>
                    {data.canManage && (
                      <Button variant={d.mine ? "ghost" : "secondary"} size="sm" disabled={busy} onClick={() => void send({ action: d.mine ? "unsign" : "sign", id: d.id })}>
                        {d.mine ? t.unsign : t.sign}
                        <span className="sr-only"> : {d.subject}</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t.none} />
          )}
        </Card>
      )}
      {adding && data && (
        <Modal title={t.record} close={() => setAdding(false)}>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send({ action: "record", kind: f.get("kind"), subject: f.get("subject"), decision: f.get("decision"), reference: f.get("reference") ?? "", decidedOn: f.get("decidedOn") }).then((ok) => ok && setAdding(false));
            }}
          >
            <div className="form-grid">
              <label>
                {t.kind}
                <select name="kind" defaultValue="other">
                  {decisionKinds.map((k) => (
                    <option key={k} value={k}>
                      {t.kinds[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.decidedOn}
                <input name="decidedOn" type="date" required defaultValue={brusselsToday()} />
              </label>
            </div>
            <label>
              {t.subject}
              <input name="subject" required minLength={2} maxLength={200} />
            </label>
            <label>
              {t.decision}
              <textarea name="decision" required minLength={2} maxLength={2000} rows={4} />
            </label>
            <label>
              {t.reference}
              <input name="reference" maxLength={120} />
            </label>
            <div className="actions">
              <Button disabled={busy}>{t.save}</Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                {t.cancel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
