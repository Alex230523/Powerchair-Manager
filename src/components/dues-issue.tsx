"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { duesIssueCopy, fill } from "./dues-issue-copy";
import { errors } from "./access-copy";
import { Modal } from "./modal";

type Plan = { id: string; season_id: string; category: string; amount_cents: number; max_installments: number; first_due: string; archived: boolean; team_id?: string | null };
type Line = { profile_id: string; full_name: string; covered: boolean; gross: number; included: boolean; discount: number; net: number; reason: string; installments: number | null };
type Target = { kind: "person"; profileId: string } | { kind: "team"; teamId: string } | { kind: "season" } | { kind: "admitted" };

/**
 * A3: « Émettre des cotisations » in three steps: the rate (an existing one,
 * or created on the spot), who (a person, a team, the season's players or
 * the newly admitted, with a preview line by line), then confirmation with
 * an optional email to each family. Covered people are left out.
 */
export function IssueWizard({
  locale,
  organizationId,
  plans,
  seasons,
  teams,
  profiles,
  team,
  close,
  done,
}: {
  locale: Locale;
  organizationId: string;
  plans: Plan[];
  seasons: { id: string; name: string }[];
  teams: { id: string; name: string; season_id: string }[];
  profiles: { id: string; full_name: string }[];
  /** Opened from a team's page (A6): that team, preselected. */
  team?: string;
  close: () => void;
  done: (message: string) => void;
}) {
  const t = duesIssueCopy[locale];
  const live = plans.filter((p) => !p.archived);
  const [step, setStep] = useState(1),
    [planId, setPlanId] = useState(live[0]?.id ?? "new"),
    [created, setCreated] = useState<Plan | null>(null),
    [kind, setKind] = useState<Target["kind"]>(team ? "team" : "season"),
    [profileId, setProfileId] = useState(profiles[0]?.id ?? ""),
    [teamId, setTeamId] = useState(team ?? ""),
    [lines, setLines] = useState<Line[] | null>(null),
    [excluded, setExcluded] = useState<string[]>([]),
    [exempt, setExempt] = useState<Record<string, string>>({}),
    [installments, setInstallments] = useState(1),
    [firstDue, setFirstDue] = useState(""),
    [notify, setNotify] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const plan = created ?? live.find((p) => p.id === planId) ?? null;
  const money = (v: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { style: "currency", currency: "EUR" }).format(v / 100);
  const seasonName = (id: string) => seasons.find((s) => s.id === id)?.name ?? "";
  const target: Target = kind === "person" ? { kind, profileId } : kind === "team" ? { kind, teamId } : { kind };
  const fail = (code: string) => setError(t.errors[code] ?? errors[code]?.[locale] ?? t.unavailable);

  async function call(body: Record<string, unknown>) {
    const r = await fetch("/api/dues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v;
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      fail(e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  const heading = fill(t.stepOf, { n: step, name: t.steps[step - 1] });
  const kept = (lines ?? []).filter((l) => l.included && !excluded.includes(l.profile_id));
  const exemptions = Object.entries(exempt).filter(([id]) => kept.some((l) => l.profile_id === id));
  return (
    <Modal title={t.title} close={close} className="player-dialog issue-wizard">
      <ol className="wizard-steps" aria-label={t.title}>
        {t.steps.map((name, i) => (
          <li key={name} aria-current={i + 1 === step ? "step" : undefined}>
            {name}
          </li>
        ))}
      </ol>
      <h3>{heading}</h3>
      {error && <p role="alert">{error}</p>}

      {step === 1 && (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (planId !== "new") {
              setInstallments(1);
              setFirstDue(plan?.first_due ?? "");
              return setStep(2);
            }
            const d = new FormData(e.currentTarget);
            void run(async () => {
              const body = {
                action: "plan",
                seasonId: String(d.get("season")),
                category: String(d.get("category") ?? "").trim(),
                amountCents: Math.round(Number(String(d.get("amount")).replace(",", ".")) * 100),
                maxInstallments: Number(d.get("max")),
                firstDue: String(d.get("due")),
              };
              const { id } = await call(body);
              const second = Number(d.get("second") || 0),
                next = Number(d.get("next") || 0);
              if (second || next) await call({ action: "siblingRule", planId: id, secondPercent: second, nextPercent: next });
              setCreated({ id, season_id: body.seasonId, category: body.category, amount_cents: body.amountCents, max_installments: body.maxInstallments, first_due: body.firstDue, archived: false });
              setPlanId(id);
              setFirstDue(body.firstDue);
              setStep(2);
            });
          }}
        >
          <fieldset>
            <legend>{t.planStep}</legend>
            {!live.length && <p className="muted">{t.noPlanYet}</p>}
            {live.map((p) => (
              <label key={p.id} className="check">
                <input type="radio" name="plan" checked={planId === p.id} onChange={() => setPlanId(p.id)} />
                {fill(t.existing, { category: p.category, season: seasonName(p.season_id), amount: money(p.amount_cents) })}
              </label>
            ))}
            <label className="check">
              <input type="radio" name="plan" checked={planId === "new"} onChange={() => setPlanId("new")} />
              {t.createPlan}
            </label>
          </fieldset>
          {planId === "new" && (
            <div className="form-grid">
              <label>
                {t.season}
                <select name="season" required>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.category}
                <input name="category" required minLength={2} maxLength={80} />
              </label>
              <label>
                {t.amount}
                <input name="amount" required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" />
              </label>
              <label>
                {t.maxInstallments}
                <input name="max" type="number" min={1} max={12} defaultValue={1} required />
              </label>
              <label>
                {t.firstDue}
                <input name="due" type="date" required />
              </label>
              <label>
                {t.second}
                <input name="second" type="number" min={0} max={100} defaultValue={0} />
              </label>
              <label>
                {t.following}
                <input name="next" type="number" min={0} max={100} defaultValue={0} />
              </label>
            </div>
          )}
          <p className="actions">
            <button className="button" disabled={busy || (planId === "new" && !seasons.length)}>
              {t.next}
            </button>
            <button type="button" className="button secondary" onClick={close}>
              {t.cancel}
            </button>
          </p>
        </form>
      )}

      {step === 2 && plan && (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const v = await call({ action: "preview", planId: plan.id, target });
              setLines(v.lines);
              setExcluded([]);
              setExempt({});
            });
          }}
        >
          <fieldset>
            <legend>{t.whoStep}</legend>
            {(["person", "team", "season", "admitted"] as const).map((k) => (
              <label key={k} className="check">
                <input
                  type="radio"
                  name="who"
                  checked={kind === k}
                  onChange={() => {
                    setKind(k);
                    setLines(null);
                  }}
                />
                {t.who[k]}
              </label>
            ))}
          </fieldset>
          {kind === "person" && (
            <label>
              {t.person}
              <select value={profileId} onChange={(e) => (setProfileId(e.target.value), setLines(null))} required>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "team" &&
            (teams.some((x) => x.season_id === plan.season_id) ? (
              <label>
                {t.team}
                <select value={teamId} onChange={(e) => (setTeamId(e.target.value), setLines(null))} required>
                  <option value="" disabled>
                    {t.team}
                  </option>
                  {teams
                    .filter((x) => x.season_id === plan.season_id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <p className="muted">{t.noTeam}</p>
            ))}
          <div className="form-grid">
            <label>
              {t.installments}
              <input type="number" min={1} max={plan.max_installments} value={installments} onChange={(e) => setInstallments(Number(e.target.value) || 1)} required />
            </label>
            <label>
              {t.firstDue}
              <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} required />
            </label>
          </div>
          <p>
            <button className="button secondary" disabled={busy || (kind === "team" && !teamId)}>
              {t.showPreview}
            </button>
          </p>
          {lines &&
            (lines.length ? (
              <div className="table-scroll" role="region" aria-label={t.whoStep} tabIndex={0}>
                <table className="ledger">
                  <thead>
                    <tr>
                      {(["include", "name", "gross", "discount", "net", "exempt"] as const).map((k) => (
                        <th key={k} scope="col" className={["gross", "discount", "net"].includes(k) ? "num" : undefined}>
                          {t.cols[k]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const on = l.included && !excluded.includes(l.profile_id);
                      const reason = exempt[l.profile_id];
                      return (
                        <tr key={l.profile_id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={fill(t.includeOf, { name: l.full_name })}
                              checked={on}
                              disabled={!l.included}
                              onChange={(e) => setExcluded(e.target.checked ? excluded.filter((x) => x !== l.profile_id) : [...excluded, l.profile_id])}
                            />
                          </td>
                          <th scope="row">
                            {l.full_name}
                            {l.covered && <span className="muted small"> · {t.covered}</span>}
                          </th>
                          <td className="num">{money(l.gross)}</td>
                          <td className="num">{reason !== undefined ? money(l.gross) : money(l.discount)}</td>
                          <td className="num">{reason !== undefined ? money(0) : money(l.net)}</td>
                          <td>
                            {l.included && (
                              <>
                                <input
                                  type="checkbox"
                                  aria-label={fill(t.exemptOf, { name: l.full_name })}
                                  checked={reason !== undefined}
                                  disabled={!on}
                                  onChange={(e) => {
                                    const next = { ...exempt };
                                    if (e.target.checked) next[l.profile_id] = "";
                                    else delete next[l.profile_id];
                                    setExempt(next);
                                  }}
                                />
                                {reason !== undefined && (
                                  <input
                                    aria-label={fill(t.reasonOf, { name: l.full_name })}
                                    aria-describedby="exempt-help"
                                    value={reason}
                                    minLength={5}
                                    maxLength={500}
                                    required
                                    onChange={(e) => setExempt({ ...exempt, [l.profile_id]: e.target.value })}
                                  />
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {Object.keys(exempt).length > 0 && (
                  <p className="field-help" id="exempt-help">
                    {t.reasonHelp}
                  </p>
                )}
              </div>
            ) : (
              <p className="muted">{kind === "admitted" ? t.noAdmitted : t.nobody}</p>
            ))}
          <p className="actions">
            <button type="button" className="button secondary" onClick={() => setStep(1)}>
              {t.back}
            </button>
            <button type="button" className="button" disabled={!kept.length || exemptions.some(([, r]) => r.trim().length < 5)} onClick={() => setStep(3)}>
              {t.next}
            </button>
          </p>
        </form>
      )}

      {step === 3 && plan && lines && (
        <div className="stack-form">
          <p>{fill(t.summary, { n: kept.length, skipped: lines.length - kept.length })}</p>
          <p>
            <strong>{fill(t.total, { amount: money(kept.reduce((sum, l) => sum + (exempt[l.profile_id] !== undefined ? 0 : l.net), 0)) })}</strong>
          </p>
          <label className="check">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} aria-describedby="notify-help" />
            {t.notify}
          </label>
          <p className="field-help" id="notify-help">
            {t.notifyHelp}
          </p>
          <p className="actions">
            <button type="button" className="button secondary" onClick={() => setStep(2)}>
              {t.back}
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const v = await call({
                    action: "issueMany",
                    planId: plan.id,
                    target,
                    installments,
                    firstDue,
                    exemptions: exemptions.map(([profileId, reason]) => ({ profileId, reason: reason.trim() })),
                    excluded,
                    notify,
                  });
                  done(fill(t.issued, { n: v.issued }));
                })
              }
            >
              {t.issue}
            </button>
          </p>
        </div>
      )}
    </Modal>
  );
}
