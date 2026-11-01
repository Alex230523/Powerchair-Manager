"use client";
import { useCallback, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { DuesRules } from "@/domains/dues/rules";
import { errors } from "./access-copy";
import { useData, usePost } from "./use-api";
import { Badge, Card, EmptyState } from "./ui";
import { Modal } from "./modal";
import { duesSettingsCopy } from "./dues-settings-copy";
import { duesIssueCopy } from "./dues-issue-copy";
export { duesSettingsCopy };

type Plan = {
  id: string;
  season_id: string;
  season_name: string;
  category: string;
  amount_cents: number;
  max_installments: number;
  first_due: string;
  archived: boolean;
  sibling_second_percent: number;
  sibling_next_percent: number;
  issued_count: number;
  team_id: string | null;
  team_name: string | null;
};
type View = { manage: boolean; autoPlanId: string | null; plans: Plan[]; seasons: { id: string; name: string }[]; teams: { id: string; name: string; season_id: string }[] };
type Post = (url: string, body: Record<string, unknown>, done: string) => Promise<void | boolean>;

export function DuesSettingsPanel({
  locale,
  organizationId,
  rules,
  busy: outerBusy,
  post: postGovernance,
}: {
  locale: Locale;
  organizationId: string;
  rules: DuesRules;
  busy: boolean;
  post: Post;
}) {
  const t = duesSettingsCopy[locale] as (typeof duesSettingsCopy)["fr"];
  const failure = useCallback((code: string) => errors[code]?.[locale] ?? t.unavailable, [locale, t.unavailable]);
  const { data, error, setError, reload } = useData<View>("/api/dues", failure);
  const { busy, message, post } = usePost("/api/dues", reload, setError, failure);
  const [editing, setEditing] = useState<Plan | "new" | null>(null),
    [pending, setPending] = useState<{ body: Record<string, unknown>; issued: number } | null>(null);
  const money = (v: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { style: "currency", currency: "EUR" }).format(v / 100);
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));

  async function sendPlan(body: Record<string, unknown>, issued: number) {
    if (body.action === "updatePlan" && issued > 0 && !body.confirm) {
      // The season is underway: the president confirms before the rate changes.
      setPending({ body, issued });
      return;
    }
    const ok = await post({ organizationId, ...body }, t.saved);
    if (ok) {
      setPending(null);
      setEditing(null);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const cur = editing === "new" ? null : editing;
    const body: Record<string, unknown> = cur
      ? {
          action: "updatePlan",
          id: cur.id,
          category: String(f.get("category") ?? ""),
          amountCents: Math.round(Number(String(f.get("amount") ?? "0").replace(",", ".")) * 100),
          maxInstallments: Number(f.get("max") || 1),
          firstDue: String(f.get("due") ?? ""),
          teamId: String(f.get("team") ?? "") || null,
        }
      : {
          action: "plan",
          seasonId: String(f.get("season") ?? ""),
          category: String(f.get("category") ?? ""),
          amountCents: Math.round(Number(String(f.get("amount") ?? "0").replace(",", ".")) * 100),
          maxInstallments: Number(f.get("max") || 1),
          firstDue: String(f.get("due") ?? ""),
          teamId: String(f.get("team") ?? "") || null,
        };
    const second = Number(f.get("second") || 0),
      next = Number(f.get("next") || 0);
    void (async () => {
      if (cur && (second !== cur.sibling_second_percent || next !== cur.sibling_next_percent))
        await post({ organizationId, action: "siblingRule", planId: cur.id, secondPercent: second, nextPercent: next }, t.saved);
      await sendPlan(body, cur?.issued_count ?? 0);
    })();
  }
  return (
    <>
      <Card title={t.title} subtitle={t.intro} id="settings-dues"
        actions={
          <button type="button" className="button secondary" onClick={() => setEditing("new")} disabled={!data || !data.seasons.length}>
            {t.newPlan}
          </button>
        }
      >
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {data && !data.plans.some((p) => !p.archived) && <EmptyState title={t.empty} />}
        {data && data.plans.some((p) => !p.archived) && (
          <div className="table-scroll">
            <table className="compact-table">
              <thead>
                <tr>
                  <th scope="col">{t.category}</th>
                  <th scope="col">{t.season}</th>
                  <th scope="col" className="num">{t.amount}</th>
                  <th scope="col">{t.max}</th>
                  <th scope="col">{t.firstDue}</th>
                  <th scope="col">{t.second} · {t.next}</th>
                  <th scope="col"><span className="sr-only">{t.edit}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.plans.filter((p) => !p.archived).map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      {p.category}
                      {p.team_name && <span className="muted small"> · {p.team_name}</span>}
                      <span className="muted small"> · {p.issued_count ? t.issued.replace("{n}", String(p.issued_count)) : t.none}</span>
                    </th>
                    <td>{p.season_name}</td>
                    <td className="num">{money(p.amount_cents)}</td>
                    <td>{p.max_installments}</td>
                    <td>{day(p.first_due)}</td>
                    <td>{p.sibling_second_percent} % · {p.sibling_next_percent} %</td>
                    <td className="row-actions">
                      <button type="button" className="text-button" onClick={() => setEditing(p)}>
                        {t.edit}<span className="sr-only"> : {p.category}</span>
                      </button>
                      <button type="button" className="text-button" disabled={busy} onClick={() => void post({ organizationId, action: "archivePlan", id: p.id }, t.saved)}>
                        {t.archive}<span className="sr-only"> : {p.category}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* A3: the fee issued by itself when a registration is accepted. */}
        {data && (
          <form
            className="auto-reminders"
            onSubmit={(e) => {
              e.preventDefault();
              const plan = String(new FormData(e.currentTarget).get("autoPlan") ?? "");
              void post({ organizationId, action: "autoIssue", planId: plan || null }, t.saved);
            }}
          >
            <h3>{duesIssueCopy[locale].autoTitle}</h3>
            <p className="muted small">{duesIssueCopy[locale].autoIntro}</p>
            <label>
              {duesIssueCopy[locale].autoLabel}
              <select name="autoPlan" key={data.autoPlanId ?? "none"} defaultValue={data.autoPlanId ?? ""}>
                <option value="">{duesIssueCopy[locale].autoNone}</option>
                {data.plans
                  .filter((p) => !p.archived)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.category} · {p.season_name} · {money(p.amount_cents)}
                    </option>
                  ))}
              </select>
            </label>
            <button className="button secondary" disabled={busy}>
              {duesIssueCopy[locale].autoSave}
            </button>
          </form>
        )}
        <form
          className="auto-reminders"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void postGovernance(
              "/api/governance",
              {
                action: "duesRules",
                organizationId,
                rules: {
                  auto: f.get("auto") === "on",
                  daysBefore: Number(f.get("before") || 0),
                  daysAfter: Number(f.get("after") || 0),
                  repeatDays: Number(f.get("repeat") || 14),
                },
              },
              t.auto.saved,
            );
          }}
        >
          <h3>{t.auto.title}</h3>
          <p className="muted small">{t.auto.intro}</p>
          <label className="check">
            <input type="checkbox" name="auto" defaultChecked={rules.auto} />
            {t.auto.on}
          </label>
          <div className="form-pair">
            <label>
              {t.auto.before}
              <input name="before" type="number" min={0} max={60} defaultValue={rules.daysBefore} />
            </label>
            <label>
              {t.auto.after}
              <input name="after" type="number" min={0} max={60} defaultValue={rules.daysAfter} />
            </label>
            <label>
              {t.auto.repeat}
              <input name="repeat" type="number" min={7} max={90} defaultValue={rules.repeatDays} />
            </label>
          </div>
          <button className="button secondary" disabled={outerBusy}>{t.auto.save}</button>
        </form>
      </Card>
      {editing && data && (
        <Modal title={editing === "new" ? t.newPlan : `${t.editPlan} · ${editing.category}`} close={() => setEditing(null)}>
          <form className="finance-form" onSubmit={submit}>
            {editing !== "new" && editing.issued_count > 0 && (
              <p className="notice">
                <Badge tone="warning">{t.issued.replace("{n}", String(editing.issued_count))}</Badge>
              </p>
            )}
            <div className="form-pair">
              <label>
                {t.season}
                {editing === "new" ? (
                  <select name="season" required defaultValue={data.seasons[0]?.id}>
                    {data.seasons.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input value={editing.season_name} readOnly />
                )}
              </label>
              <label>
                {t.category}
                <input name="category" required minLength={2} maxLength={80} defaultValue={editing === "new" ? "" : editing.category} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {t.amount}
                <input name="amount" required inputMode="decimal" defaultValue={editing === "new" ? "" : String(editing.amount_cents / 100)} />
              </label>
              <label>
                {t.max}
                <input name="max" type="number" min={1} max={12} required defaultValue={editing === "new" ? 4 : editing.max_installments} />
              </label>
            </div>
            <div className="form-pair">
              <label>
                {t.firstDue}
                <input name="due" type="date" required defaultValue={editing === "new" ? "" : editing.first_due} />
              </label>
              <label>
                {t.team}
                <select name="team" defaultValue={editing === "new" ? "" : (editing.team_id ?? "")}>
                  <option value="">{t.wholeClub}</option>
                  {data.teams
                    .filter((x) => editing === "new" || x.season_id === editing.season_id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                </select>
              </label>
            </div>
            <p className="muted small">{t.nextDues}</p>
            {editing !== "new" && (
              <>
                <p className="muted small">{t.sibling}</p>
                <div className="form-pair">
                  <label>
                    {t.second}
                    <input name="second" type="number" min={0} max={100} defaultValue={editing.sibling_second_percent} />
                  </label>
                  <label>
                    {t.next}
                    <input name="next" type="number" min={0} max={100} defaultValue={editing.sibling_next_percent} />
                  </label>
                </div>
              </>
            )}
            <div className="actions">
              <button className="button" disabled={busy}>{t.save}</button>
              <button type="button" className="button secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
            </div>
          </form>
        </Modal>
      )}
      {pending && (
        <Modal title={t.confirmTitle} close={() => setPending(null)} className="player-dialog confirm-dialog">
          <p role="alert">{t.confirmText.replace("{n}", String(pending.issued))}</p>
          <div className="actions">
            <button type="button" className="button" disabled={busy} onClick={() => void sendPlan({ ...pending.body, confirm: true }, pending.issued)}>
              {t.confirm}
            </button>
            <button type="button" className="button secondary" onClick={() => setPending(null)}>{t.cancel}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
