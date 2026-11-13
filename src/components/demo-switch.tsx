"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/locale";
import { Icon } from "./icons";

type Account = { key: string; email: string; label: Record<Locale, string> };
const copy = {
  fr: { title: "Profil de démo", hint: "Aperçu seulement : ouvrir un autre compte de démo.", choose: "Changer de profil de démo", failed: "Ce profil de démo n'a pas pu s'ouvrir." },
  nl: { title: "Demoprofiel", hint: "Alleen in de preview: een ander demo-account openen.", choose: "Van demoprofiel wisselen", failed: "Dit demoprofiel kon niet openen." },
  en: { title: "Demo profile", hint: "Preview only: open another demo account.", choose: "Switch demo profile", failed: "This demo profile could not open." },
};

/**
 * 12/11/2026, previews only: a demo account opens another demo account in one
 * choice (the server refuses it anywhere else). Nothing shows in production.
 */
export function DemoSwitch({ locale, email }: { locale: Locale; email: string | null }) {
  const t = copy[locale];
  const [accounts, setAccounts] = useState<Account[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/demo/switch", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { enabled: boolean; accounts: Account[] }) : null))
      .then((v) => {
        if (live && v?.enabled) setAccounts(v.accounts);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!accounts.length) return null;
  const current = accounts.find((a) => a.email === email?.toLowerCase())?.key ?? "";
  return (
    <div className="demo-switch">
      <label>
        <span className="menu-heading">
          <Icon name="userRound" size={16} /> {t.title}
        </span>
        <select
          aria-label={t.choose}
          value={current}
          disabled={busy}
          onChange={(e) => {
            const account = e.target.value;
            if (!account || account === current) return;
            setBusy(true);
            setError("");
            fetch("/api/demo/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) })
              .then((r) => {
                if (!r.ok) throw new Error();
                window.location.assign(`/${locale}`);
              })
              .catch(() => {
                setError(t.failed);
                setBusy(false);
              });
          }}
        >
          <option value="" disabled>
            {t.choose}
          </option>
          {accounts.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label[locale]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{t.hint}</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
