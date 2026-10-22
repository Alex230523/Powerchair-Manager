"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { labels, type Role } from "@/domains/access/policy";
import { Button, Field, describedBy } from "./ui";
import { welcomeCopy } from "./welcome-copy";
import { errors } from "./access-copy";

type View =
  | { state: "invalid" | "used" | "disputed" }
  | {
      state: "valid";
      organization: string;
      role: Role;
      team: string | null;
      child: string | null;
      email: string;
      greeting: string;
      existing: "none" | "password" | "passwordless";
      prefill: { firstName: string; lastName: string; birthDate: string | null; phone: string };
      sport: boolean;
    };

type Draft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  locale: Locale;
  classification: "" | "PF1" | "PF2" | "pending";
  chair: "" | "own" | "club";
  care: string;
  transferVisible: boolean;
};

/** « Créer mon compte » from an invitation (wave 16, I2): who invites you, then three short steps. */
export function Welcome({ locale, token, signedIn }: { locale: Locale; token: string; signedIn: boolean }) {
  const t = welcomeCopy[locale];
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState("");
  const [step, setStep] = useState(0);
  const [disputing, setDisputing] = useState(false);
  const [disputed, setDisputed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({ firstName: "", lastName: "", birthDate: "", phone: "", locale, classification: "", chair: "", care: "", transferVisible: false });
  const [missing, setMissing] = useState<string[]>([]);
  const [password, setPassword] = useState({ first: "", second: "", privacy: false });
  const [passwordError, setPasswordError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  useEffect(() => {
    let live = true;
    fetch(`/api/welcome/${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v: View) => {
        if (!live) return;
        setView(v);
        if (v.state === "valid")
          setDraft((d) => ({ ...d, firstName: v.prefill.firstName, lastName: v.prefill.lastName, birthDate: v.prefill.birthDate ?? "", phone: v.prefill.phone }));
      })
      .catch(() => live && setFailed(t.failed));
    return () => {
      live = false;
    };
  }, [token, t.failed]);

  // Moving between steps takes the focus to the new step's title (WCAG 2.4.3).
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  const message = (code: string) => errors[code]?.[locale] ?? t.failed;

  async function post(body: unknown, url = `/api/welcome/${token}`) {
    setBusy(true);
    setFailed("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFailed(message(data.error ?? ""));
        return null;
      }
      return data;
    } catch {
      setFailed(t.failed);
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!view)
    return (
      <main id="main" className="access welcome">
        <section className="access-card card" aria-labelledby="welcome-title">
          <h1 id="welcome-title">{t.title}</h1>
          {failed ? <p role="alert">{failed}</p> : <p aria-live="polite">{t.loading}</p>}
        </section>
      </main>
    );

  if (view.state !== "valid")
    return (
      <main id="main" className="access welcome">
        <section className="access-card card" aria-labelledby="welcome-title">
          <h1 id="welcome-title">{t.title}</h1>
          <p>{t[view.state]}</p>
          {view.state === "used" && (
            <Link className="button" href={`/${locale}/access`}>
              {t.signIn}
            </Link>
          )}
        </section>
      </main>
    );

  const role = labels[view.role][locale].toLowerCase();
  const steps = view.sport ? t.steps : [t.steps[0], t.steps[1], t.steps[3]];
  const current = steps[step];
  const last = step === steps.length - 1;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function details(e: FormEvent) {
    e.preventDefault();
    const empty = (["firstName", "lastName"] as const).filter((k) => !draft[k].trim());
    if (view?.state === "valid" && view.role === "player" && !draft.birthDate) empty.push("birthDate" as never);
    setMissing(empty);
    if (!empty.length) setStep(step + 1);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (password.first.length < 12) return setPasswordError(t.tooShort);
    if (password.first !== password.second) return setPasswordError(t.mismatch);
    setPasswordError("");
    const done = await post({
      action: "create",
      firstName: draft.firstName,
      lastName: draft.lastName,
      birthDate: draft.birthDate || null,
      phone: draft.phone,
      locale: draft.locale,
      password: password.first,
      privacy: password.privacy,
      classification: draft.classification || null,
      chair: draft.chair || null,
      care: draft.care,
      transferVisible: draft.transferVisible,
    });
    if (done?.home) window.location.assign(done.home);
  }

  const intro = (
    <div className="welcome-intro">
      <p className="welcome-hello">{t.hello(view.greeting)}</p>
      <p>{t.invites(view.organization, role)}</p>
      {(view.team || view.child) && (
        <ul className="welcome-facts">
          {view.team && <li>{t.team(view.team)}</li>}
          {view.child && <li>{t.child(view.child)}</li>}
        </ul>
      )}
      <p className="muted">
        {t.email} <strong>{view.email}</strong>
      </p>
    </div>
  );

  // An account with a password already exists: sign in, then accept here.
  if (view.existing === "password")
    return (
      <main id="main" className="access welcome">
        <section className="access-card card" aria-labelledby="welcome-title">
          <h1 id="welcome-title">{t.title}</h1>
          {intro}
          {signedIn ? (
            <Button
              loading={busy}
              onClick={async () => {
                if (await post({ action: "accept", token }, "/api/workspace")) window.location.assign(`/${locale}`);
              }}
            >
              {t.accept}
            </Button>
          ) : (
            <>
              <p>{t.hasAccount}</p>
              <Link className="button" href={`/${locale}/access?next=${encodeURIComponent(`/${locale}/welcome/${token}`)}`}>
                {t.signIn}
              </Link>
            </>
          )}
          {failed && <p role="alert">{failed}</p>}
        </section>
      </main>
    );

  return (
    <main id="main" className="access welcome">
      <section className="access-card card welcome-card" aria-labelledby="welcome-title">
        <p className="welcome-progress" id="welcome-progress">
          {t.stepOf(step + 1, steps.length)}
        </p>
        <ol className="welcome-steps" aria-label={t.title}>
          {steps.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} data-done={i < step || undefined}>
              {s}
            </li>
          ))}
        </ol>
        <h1 id="welcome-title" ref={heading} tabIndex={-1}>
          {current}
        </h1>

        {step === 0 &&
          (disputed ? (
            <p role="status">{t.disputeDone}</p>
          ) : disputing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const note = String(new FormData(e.currentTarget).get("note") ?? "");
                if (await post({ action: "dispute", note })) setDisputed(true);
              }}
            >
              {intro}
              <Field id="welcome-note" label={t.disputeLabel}>
                <textarea id="welcome-note" name="note" maxLength={500} rows={3} />
              </Field>
              <div className="welcome-actions">
                <Button type="button" variant="secondary" onClick={() => setDisputing(false)}>
                  {t.back}
                </Button>
                <Button type="submit" loading={busy}>
                  {t.disputeSend}
                </Button>
              </div>
            </form>
          ) : (
            <>
              {intro}
              <div className="welcome-actions">
                <Button variant="secondary" onClick={() => setDisputing(true)}>
                  {t.notMe}
                </Button>
                <Button onClick={() => setStep(1)}>{t.isMe}</Button>
              </div>
            </>
          ))}

        {step === 1 && (
          <form onSubmit={details} noValidate>
            {(["firstName", "lastName"] as const).map((k) => (
              <Field key={k} id={`welcome-${k}`} label={t[k]} required error={missing.includes(k) ? t.required : undefined}>
                <input
                  id={`welcome-${k}`}
                  autoComplete={k === "firstName" ? "given-name" : "family-name"}
                  value={draft[k]}
                  onChange={(e) => set(k, e.target.value)}
                  required
                  aria-invalid={missing.includes(k) || undefined}
                  aria-describedby={describedBy(`welcome-${k}`, false, missing.includes(k))}
                />
              </Field>
            ))}
            {view.role === "player" && (
              <Field id="welcome-birthDate" label={t.birthDate} required error={missing.includes("birthDate") ? t.required : undefined}>
                <input
                  id="welcome-birthDate"
                  type="date"
                  autoComplete="bday"
                  value={draft.birthDate}
                  onChange={(e) => set("birthDate", e.target.value)}
                  required
                  aria-invalid={missing.includes("birthDate") || undefined}
                  aria-describedby={describedBy("welcome-birthDate", false, missing.includes("birthDate"))}
                />
              </Field>
            )}
            <Field id="welcome-phone" label={t.phone}>
              <input id="welcome-phone" type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field id="welcome-locale" label={t.language}>
              <select id="welcome-locale" value={draft.locale} onChange={(e) => set("locale", e.target.value as Locale)}>
                <option value="fr">Français</option>
                <option value="nl">Nederlands</option>
                <option value="en">English</option>
              </select>
            </Field>
            <div className="welcome-actions">
              <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                {t.back}
              </Button>
              <Button type="submit">{t.next}</Button>
            </div>
          </form>
        )}

        {view.sport && step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(3);
            }}
          >
            {view.child && <p className="muted">{t.about(view.child)}</p>}
            <Field id="welcome-classification" label={t.classification} help={t.classificationHelp}>
              <select
                id="welcome-classification"
                value={draft.classification}
                onChange={(e) => set("classification", e.target.value as Draft["classification"])}
                aria-describedby={describedBy("welcome-classification", true)}
              >
                <option value="">{t.unknown}</option>
                {(["PF1", "PF2", "pending"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t.classes[c]}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="welcome-choice">
              <legend>{t.chair}</legend>
              {(["own", "club", ""] as const).map((c) => (
                <label key={c || "unknown"}>
                  <input type="radio" name="chair" value={c} checked={draft.chair === c} onChange={() => set("chair", c)} />
                  {c ? t.chairs[c] : t.unknown}
                </label>
              ))}
            </fieldset>
            <Field id="welcome-care" label={t.care} help={t.careHelp}>
              <textarea
                id="welcome-care"
                rows={3}
                maxLength={1000}
                value={draft.care}
                onChange={(e) => set("care", e.target.value)}
                aria-describedby={describedBy("welcome-care", true)}
              />
            </Field>
            {/* Wave 17 (J3): the player's or the parent's own choice, off by default. */}
            <label className="check">
              <input type="checkbox" checked={draft.transferVisible} onChange={(e) => set("transferVisible", e.target.checked)} aria-describedby="welcome-transfer-help" />
              {t.transferVisible}
            </label>
            <p className="field-help" id="welcome-transfer-help">
              {t.transferHelp}
            </p>
            <div className="welcome-actions">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                {t.back}
              </Button>
              <Button type="submit">{t.next}</Button>
            </div>
          </form>
        )}

        {last && step > 0 && (
          <form onSubmit={create} noValidate>
            <Field id="welcome-password" label={t.password} required error={passwordError || undefined}>
              <input
                id="welcome-password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={password.first}
                onChange={(e) => setPassword((p) => ({ ...p, first: e.target.value }))}
                required
                aria-invalid={Boolean(passwordError) || undefined}
                aria-describedby={describedBy("welcome-password", false, passwordError)}
              />
            </Field>
            <Field id="welcome-confirm" label={t.confirm} required>
              <input
                id="welcome-confirm"
                type="password"
                autoComplete="new-password"
                value={password.second}
                onChange={(e) => setPassword((p) => ({ ...p, second: e.target.value }))}
                required
              />
            </Field>
            <label className="welcome-privacy">
              <input type="checkbox" checked={password.privacy} onChange={(e) => setPassword((p) => ({ ...p, privacy: e.target.checked }))} required />
              {t.privacy}
            </label>
            <p>
              <Link href={`/${locale}/privacy`} target="_blank">
                {t.privacyLink}
              </Link>
            </p>
            <div className="welcome-actions">
              <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
                {t.back}
              </Button>
              <Button type="submit" loading={busy} disabled={!password.privacy}>
                {t.create}
              </Button>
            </div>
          </form>
        )}
        {failed && <p role="alert">{failed}</p>}
      </section>
    </main>
  );
}
