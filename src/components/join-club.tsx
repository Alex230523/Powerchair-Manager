"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { Button, Card, Field, PageHeader } from "./ui";
import { joinClubCopy } from "./join-copy";

const countries = ["BE", "NL", "FR", "GB", "US"] as const;

/**
 * 12/11/2026: « Ouvrir mon club sans fédération ». No account yet: the request
 * waits for the address's confirmation, then for the platform's team. The
 * answer never says whether an address is known.
 */
export function JoinClub({ locale, confirm }: { locale: Locale; confirm: string | null }) {
  const t = joinClubCopy[locale];
  const [state, setState] = useState<"form" | "sent" | "confirming" | "confirmed" | "expired">(confirm ? "confirming" : "form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = useRef(false);
  useEffect(() => {
    if (!confirm || done.current) return;
    done.current = true;
    fetch("/api/join/club/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: confirm }) })
      .then((r) => setState(r.ok ? "confirmed" : "expired"))
      .catch(() => setState("expired"));
  }, [confirm]);
  return (
    <main id="main" className="access join join-club">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      {state === "confirming" && (
        <p role="status" className="notice">
          {t.confirming}
        </p>
      )}
      {state === "confirmed" && (
        <p role="status" className="notice">
          {t.confirmed}
        </p>
      )}
      {state === "expired" && (
        <p role="alert" className="notice">
          {t.expired} <Link href={`/${locale}/join/club`} onClick={() => setState("form")}>{t.send}</Link>
        </p>
      )}
      {state === "sent" && (
        <p role="status" className="notice">
          {t.sent}
        </p>
      )}
      {state === "form" && (
        <Card>
          <p>{t.price}</p>
          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const v = (k: string) => String(d.get(k) ?? "").trim();
              setBusy(true);
              setError("");
              fetch("/api/join/club", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  clubName: v("club-name"),
                  countryCode: v("club-country"),
                  city: v("club-city"),
                  presidentName: v("president-name"),
                  presidentEmail: v("president-email"),
                  discountCode: v("club-code").toUpperCase(),
                  message: v("club-message"),
                  locale,
                  acceptTerms: d.get("club-terms") === "on",
                  website: v("club-website") || undefined,
                }),
              })
                .then((r) => {
                  if (r.status === 429) throw new Error(t.tooMany);
                  if (!r.ok) throw new Error(t.error);
                  setState("sent");
                })
                .catch((x: Error) => setError(x.message || t.error))
                .finally(() => setBusy(false));
            }}
          >
            <fieldset className="stack-form">
              <legend>{t.clubSection}</legend>
              <Field id="club-name" label={t.clubName} required>
                <input id="club-name" name="club-name" required minLength={2} maxLength={120} autoComplete="organization" />
              </Field>
              <div className="form-grid">
                <Field id="club-country" label={t.country} required>
                  <select id="club-country" name="club-country" required defaultValue={locale === "nl" ? "NL" : locale === "en" ? "GB" : "BE"}>
                    {countries.map((c) => (
                      <option key={c} value={c}>
                        {t.countries[c]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="club-city" label={t.city}>
                  <input id="club-city" name="club-city" maxLength={120} autoComplete="address-level2" />
                </Field>
              </div>
            </fieldset>
            <fieldset className="stack-form">
              <legend>{t.presidentSection}</legend>
              <Field id="president-name" label={t.presidentName} required>
                <input id="president-name" name="president-name" required minLength={2} maxLength={120} autoComplete="name" />
              </Field>
              <Field id="president-email" label={t.presidentEmail} help={t.presidentEmailHelp} required>
                <input id="president-email" name="president-email" type="email" required maxLength={254} autoComplete="email" aria-describedby="president-email-help" />
              </Field>
            </fieldset>
            <Field id="club-code" label={t.discountCode} help={t.discountHelp}>
              <input id="club-code" name="club-code" maxLength={30} pattern="[A-Za-z0-9\-]{4,30}" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-describedby="club-code-help" />
            </Field>
            <Field id="club-message" label={t.message} help={t.messageHelp}>
              <textarea id="club-message" name="club-message" maxLength={1000} rows={4} aria-describedby="club-message-help" />
            </Field>
            <label className="check" htmlFor="club-terms">
              <input id="club-terms" name="club-terms" type="checkbox" required />
              <span>
                {t.terms} <Link href={`/${locale}/legal/terms`}>{t.termsLink}</Link> {t.and} <Link href={`/${locale}/legal/privacy`}>{t.privacyLink}</Link>
              </span>
            </label>
            <div className="honeypot" aria-hidden="true">
              <label htmlFor="club-website">Website</label>
              <input id="club-website" name="club-website" tabIndex={-1} autoComplete="off" />
            </div>
            <div>
              <Button type="submit" loading={busy} icon="arrow">
                {t.send}
              </Button>
            </div>
            {error && <p role="alert">{error}</p>}
          </form>
        </Card>
      )}
      <p>
        <Link className="button secondary" href={`/${locale}/join`}>{t.back}</Link>
      </p>
    </main>
  );
}
