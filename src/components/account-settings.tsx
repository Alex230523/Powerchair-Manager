"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { accessCopy, errors } from "./access-copy";
import { contextChanged, DisplayChoice, initials, shellCopy, ThemeChoice } from "./app-shell";
import { settingsHubCopy } from "./settings-hub-copy";
import { Button, Card } from "./ui";
import { LexiconChoice } from "./knowledge";

type Account = {
  user: { name: string };
  avatarVersion: string | null;
  preferences?: { locale?: string; notifications_enabled?: boolean } | null;
};

/**
 * "Mon compte" (wave 15, C13): the profile photo, the language and the theme,
 * moved here from Mon espace so every personal display choice sits together.
 */
export function AccountPanels({ locale }: { locale: Locale }) {
  const t = accessCopy[locale],
    h = settingsHubCopy[locale];
  const router = useRouter();
  const [state, setState] = useState<Account | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Account) : null))
      .then((v) => {
        if (!cancelled) setState(v);
      })
      .catch(() => {
        if (!cancelled) setError(t.unavailable);
      });
    return () => {
      cancelled = true;
    };
  }, [t.unavailable]);
  async function command(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error);
      const fresh = await fetch("/api/workspace", { cache: "no-store" });
      if (fresh.ok) setState(await fresh.json());
      setMessage(t.saved);
      contextChanged();
      window.dispatchEvent(new Event("pfm-workspace"));
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(errors[code]?.[locale] ?? t.unavailable);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function photo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 262144 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(t.invalidPhoto);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void command({ action: "avatar", mediaType: file.type, data: String(reader.result).split(",")[1] ?? "" });
    };
    reader.readAsDataURL(file);
  }
  async function preferences(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next = String(data.get("locale"));
    if (await command({ action: "preferences", locale: next, notificationsEnabled: data.has("notifications") }))
      router.push(`/${next}/settings/account`);
  }
  if (!state) return error ? <p role="alert">{error}</p> : null;
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Card title={t.photo} labelledBy="settings-photo" headingId="settings-photo">
        <p className="muted">{t.photoIntro}</p>
        <div className="avatar-row">
          {state.avatarVersion ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar avatar-large" src={`/api/account/avatar?v=${state.avatarVersion}`} alt={t.photo} />
          ) : (
            <span className="avatar avatar-large" aria-hidden="true">
              {initials(state.user.name)}
            </span>
          )}
          <div className="actions">
            <label className="button secondary file-button">
              {t.choosePhoto}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" data-nodirty="" onChange={photo} />
            </label>
            {state.avatarVersion && (
              <button type="button" className="text-button" disabled={busy} onClick={() => void command({ action: "removeAvatar" })}>
                {t.removePhoto}
              </button>
            )}
          </div>
        </div>
      </Card>
      <Card title={t.preferences} subtitle={h.languageIntro} labelledBy="settings-language" headingId="settings-language">
        <form onSubmit={(e) => void preferences(e)}>
          <label>
            {h.language}
            <select name="locale" defaultValue={state.preferences?.locale ?? locale}>
              <option value="fr">Français</option>
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="check">
            <input name="notifications" type="checkbox" defaultChecked={state.preferences?.notifications_enabled} />
            {t.notifications}
          </label>
          <Button disabled={busy}>{t.save}</Button>
        </form>
      </Card>
      <Card title={h.themeTitle} subtitle={h.themeIntro} labelledBy="settings-theme" headingId="settings-theme">
        <ThemeChoice t={shellCopy[locale]} />
      </Card>
      <Card title={shellCopy[locale].textSize} subtitle={h.displayIntro} labelledBy="settings-display" headingId="settings-display">
        <DisplayChoice t={shellCopy[locale]} />
        {/* G12: the lexicon's dotted words and their definitions. */}
        <LexiconChoice locale={locale} />
      </Card>
    </>
  );
}
