"use client";
import { shellCopy, contextChanged } from "./app-shell";
import { clearOfflineData } from "@/lib/offline-queue";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import {
  labels,
  roles,
  roleAllowed,
  type Role,
  type Permission,
} from "@/domains/access/policy";
import type { Locale } from "@/lib/locale";
import { accessCopy, errors, auditLabels } from "./access-copy";
import { Panel, Button } from "./ui";
type Member = {
  id: string;
  user_id: string;
  name: string;
  role: Role;
  grants: string[];
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  active: boolean;
};
type State = {
  profiles: {
    id: string;
    mandate_id: string;
    name: string;
    is_default: boolean;
  }[];
  mfaRequired: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  };
  contexts: {
    id: string;
    role: Role;
    organization_id: string;
    name: string;
    kind: "club" | "federation";
  }[];
  selected?: {
    id: string;
    role: Role;
    organization_id: string;
    organization_name: string;
    kind: "club" | "federation";
  };
  permissions: Permission[];
  members: Member[];
  invitations: {
    id: string;
    email: string;
    role: Role;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }[];
  audit: { id: string; action: string; name: string; created_at: string }[];
  preferences: { locale: Locale; notifications_enabled: boolean };
};
export function Access({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = accessCopy[locale],
    st = shellCopy[locale];
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(
    "login",
  );
  const [challenge, setChallenge] = useState(false),
    [setup, setSetup] = useState<{
      secret: string;
      backupCodes: string[];
    } | null>(null);
  const [invitationToken, setInvitationToken] = useState(""),
    [invitationLink, setInvitationLink] = useState(""),
    [resetToken, setResetToken] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (response.status === 401) {
        setState(null);
        window.dispatchEvent(new Event("pfm-workspace"));
        return;
      }
      if (!response.ok) throw new Error("UNAVAILABLE");
      setState(await response.json());
      window.dispatchEvent(new Event("pfm-workspace"));
    } catch {
      setFailure(t.unavailable);
    } finally {
      setLoading(false);
    }
  }, [t.unavailable]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("UNAVAILABLE");
        return response.json() as Promise<State>;
      })
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setFailure(t.unavailable);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    Promise.resolve().then(() => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get(
        "invitation",
      );
      if (token) {
        setInvitationToken(token);
        history.replaceState(null, "", window.location.pathname);
      }
      const reset = new URLSearchParams(window.location.search).get("token");
      if (reset) {
        setResetToken(reset);
        setMode("reset");
        history.replaceState(null, "", window.location.pathname);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [t.unavailable]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error ? e.message : "UNAVAILABLE";
      setFailure(
        errors[code]?.[locale] ??
          (code === "UNAVAILABLE"
            ? t.unavailable
            : locale === "en"
              ? "Action refused. Check the details and try again."
              : locale === "fr"
                ? "Opération refusée. Vérifiez les informations et réessayez."
                : "Actie geweigerd. Controleer de gegevens en probeer opnieuw."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function command(body: Record<string, unknown>) {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    await load();
    setMessage(t.saved);
    return data;
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (data: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void task(() => fn(data));
  }
  async function authenticate(data: FormData) {
    const email = String(data.get("email") ?? ""),
      password = String(data.get("password") ?? "");
    if (mode === "forgot") {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `/${locale}/access`,
      });
      if (result.error) throw new Error(result.error.code);
      setMessage(t.mail);
      return;
    }
    if (mode === "reset") {
      const result = await authClient.resetPassword({
        newPassword: password,
        token: resetToken,
      });
      if (result.error) throw new Error(result.error.code);
      setMode("login");
      setResetToken("");
      setMessage(t.saved);
      return;
    }
    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(data.get("name")),
            callbackURL: `/${locale}/access`,
          })
        : await authClient.signIn.email({ email, password });
    if (result.error) throw new Error(result.error.code);
    if (
      result.data &&
      "twoFactorRedirect" in result.data &&
      result.data.twoFactorRedirect
    ) {
      setChallenge(true);
      return;
    }
    await load();
    if (mode === "signup") setMessage(t.verifyHint);
  }
  async function confirm(id: string, body: Record<string, unknown>) {
    if (confirmation !== id) {
      setConfirmation(id);
      setMessage(t.confirm);
      return;
    }
    await command(body);
    setConfirmation("");
  }
  const secured = state && (!state.mfaRequired || state.user.twoFactorEnabled);
  const roleText = (role: Role) => labels[role][locale];
  const grantLabels = {
    "equipment.manage":
      locale === "en"
        ? "Manage equipment and chairs"
        : locale === "fr"
          ? "Gérer le matériel et les fauteuils"
          : "Materiaal en rolstoelen beheren",
    "people.sensitive":
      locale === "en"
        ? "Explicit access to players' impairment and health information"
        : locale === "fr"
          ? "Habilitation explicite aux informations de handicap et de santé"
          : "Expliciete toegang tot beperkings- en gezondheidsgegevens",
    "dues.manage":
      locale === "en"
        ? "Manage dues"
        : locale === "fr"
          ? "Gérer les cotisations"
          : "Bijdragen beheren",
    "attendance.manage":
      locale === "en"
        ? "Manage invitations and attendance"
        : locale === "fr"
          ? "Gérer convocations et présences"
          : "Oproepen en aanwezigheid beheren",
    "calendar.read":
      locale === "en"
        ? "Read the entire organisation calendar"
        : locale === "fr"
          ? "Lire tout le calendrier de l’organisation"
          : "De volledige organisatiekalender lezen",
    "calendar.manage":
      locale === "en"
        ? "Manage calendar and venues"
        : locale === "fr"
          ? "Gérer le calendrier et les lieux"
          : "Kalender en locaties beheren",
    "documents.read":
      locale === "en"
        ? "Read club documents"
        : locale === "fr"
          ? "Lire les documents du club"
          : "Clubdocumenten lezen",
    "documents.manage":
      locale === "en"
        ? "Manage and approve documents"
        : locale === "fr"
          ? "Gérer et valider les documents"
          : "Documenten beheren en goedkeuren",
    "documents.sensitive":
      locale === "en"
        ? "Explicit access to sensitive documents"
        : locale === "fr"
          ? "Habilitation explicite aux documents sensibles"
          : "Expliciete toegang tot gevoelige documenten",
    "registrations.manage":
      locale === "en"
        ? "Manage registrations"
        : locale === "fr"
          ? "Gérer les inscriptions"
          : "Inschrijvingen beheren",
    "notifications.manage":
      locale === "en"
        ? "Manage templates and deliveries"
        : locale === "fr"
          ? "Gérer les modèles et envois"
          : "Sjablonen en verzendingen beheren",
    "people.export":
      locale === "en"
        ? "Export directory"
        : locale === "fr"
          ? "Exporter le répertoire"
          : "Personenregister exporteren",
    "members.read": t.memberRead,
    "invitations.create": t.inviteCreate,
    "audit.read": t.auditRead,
    "people.read":
      locale === "en"
        ? "Read directory"
        : locale === "fr"
          ? "Consulter le répertoire"
          : "Personenregister bekijken",
    "people.manage":
      locale === "en"
        ? "Manage people and families"
        : locale === "fr"
          ? "Gérer les personnes et familles"
          : "Personen en families beheren",
    "teams.manage":
      locale === "en"
        ? "Manage teams and seasons"
        : locale === "fr"
          ? "Gérer les équipes et saisons"
          : "Teams en seizoenen beheren",
  };
  return (
    <>
      <main id="main" className="access">
        {!state && (
          <label>
            {locale === "en"
              ? "Language"
              : locale === "fr"
                ? "Langue"
                : locale === "nl"
                  ? "Taal"
                  : "Language"}
            <select
              aria-label={
                locale === "en"
                  ? "Language"
                  : locale === "fr"
                    ? "Langue"
                    : locale === "nl"
                      ? "Taal"
                      : "Language"
              }
              value={locale}
              onChange={(e) => router.push(`/${e.target.value}/access`)}
            >
              <option value="fr">Français</option>
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
            </select>
          </label>
        )}
        <h1>{t.title}</h1>
        <p className="intro">{t.intro}</p>
        <div aria-live="polite" role="status">
          {loading ? t.loading : message}
        </div>
        {failure && (
          <p role="alert" className="error-message">
            {failure}
          </p>
        )}
        {!loading && !state && !challenge && (
          <Panel key={mode} title={t[mode]}>
            <form onSubmit={(e) => submit(e, authenticate)}>
              {mode === "signup" && (
                <label>
                  {t.name}
                  <input
                    name="name"
                    required
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>
              )}
              {mode !== "reset" && (
                <label>
                  {t.email}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    maxLength={254}
                  />
                </label>
              )}
              {mode !== "forgot" && (
                <label>
                  {t.password}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </label>
              )}
              <Button disabled={busy}>{t[mode]}</Button>
            </form>
            <div className="actions">
              {(["login", "signup", "forgot"] as const)
                .filter((m) => m !== mode)
                .map((m) => (
                  <button
                    className="text-button"
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setFailure("");
                    }}
                  >
                    {t[m]}
                  </button>
                ))}
            </div>
            <p className="muted">{t.verifyHint}</p>
          </Panel>
        )}
        {challenge && (
          <Panel title={t.security}>
            <form
              onSubmit={(e) =>
                submit(e, async (data) => {
                  const result = await authClient.twoFactor.verifyTotp({
                    code: String(data.get("code")),
                    trustDevice: false,
                  });
                  if (result.error) throw new Error(result.error.code);
                  setChallenge(false);
                  await load();
                })
              }
            >
              <label>
                {t.code}
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                />
              </label>
              <Button disabled={busy}>{t.check}</Button>
            </form>
            <form
              onSubmit={(e) =>
                submit(e, async (data) => {
                  const result = await authClient.twoFactor.verifyBackupCode({
                    code: String(data.get("backup")),
                    trustDevice: false,
                  });
                  if (result.error) throw new Error(result.error.code);
                  setChallenge(false);
                  await load();
                })
              }
            >
              <label>
                {t.backup}
                <input name="backup" required autoComplete="off" />
              </label>
              <Button disabled={busy}>{t.backupCheck}</Button>
            </form>
          </Panel>
        )}
        {state && (
          <>
            <p>
              <Link href={`/${locale}/notifications`}>
                {locale === "en"
                  ? "Notifications"
                  : locale === "fr"
                    ? "Notifications"
                    : "Meldingen"}
              </Link>
            </p>
            <div className="account-bar">
              <p>
                {state.user.name} · {state.user.email}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await authClient.signOut();
                    clearOfflineData();
                    setMode("login");
                    setChallenge(false);
                    setSetup(null);
                    setInvitationLink("");
                    await load();
                  })
                }
              >
                {t.signout}
              </Button>
            </div>
            {state.selected?.kind === "club" && (
              <p>
                <Link className="button" href={`/${locale}/club`}>
                  {locale === "en"
                    ? "People, families and teams"
                    : locale === "fr"
                      ? "Personnes, familles et équipes"
                      : "Personen, families en teams"}
                </Link>
              </p>
            )}
            <Panel title={st.save}>
              <form
                onSubmit={(e) =>
                  submit(e, async (data) => {
                    await command({
                      action: "saveProfile",
                      mandateId: data.get("mandate"),
                      name: data.get("profileName"),
                      isDefault: data.has("default"),
                    });
                  })
                }
              >
                <label>
                  {t.choose}
                  <select
                    name="mandate"
                    required
                    defaultValue={state.selected?.id ?? ""}
                  >
                    <option value="" disabled>
                      {t.choose}
                    </option>
                    {state.contexts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {roleText(c.role)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {st.name}
                  <input
                    name="profileName"
                    minLength={2}
                    maxLength={80}
                    required
                    placeholder="Club pilote — Président"
                  />
                </label>
                <label className="check">
                  <input name="default" type="checkbox" />
                  {st.default}
                </label>
                <Button disabled={busy || !state.contexts.length}>
                  {t.save}
                </Button>
              </form>
              <ul>
                {state.profiles.map((p) => (
                  <li key={p.id}>
                    <strong>{p.name}</strong>
                    {p.is_default && ` · ${st.default}`}
                    {!state.contexts.some((c) => c.id === p.mandate_id) &&
                      ` · ${st.unavailable}`}{" "}
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void task(async () => {
                          await command({ action: "deleteProfile", id: p.id });
                        })
                      }
                    >
                      {st.remove}
                    </button>
                  </li>
                ))}
              </ul>
              {!state.contexts.length && <p>{t.none}</p>}
            </Panel>
            {state.mfaRequired && !state.user.twoFactorEnabled && (
              <Panel title={t.security}>
                <p>{t.mfa}</p>
                {!setup ? (
                  <form
                    onSubmit={(e) =>
                      submit(e, async (data) => {
                        const result = await authClient.twoFactor.enable({
                          password: String(data.get("password")),
                        });
                        if (result.error) throw new Error(result.error.code);
                        if (result.data && "totpURI" in result.data)
                          setSetup({
                            secret:
                              new URL(result.data.totpURI).searchParams.get(
                                "secret",
                              ) ?? "",
                            backupCodes: result.data.backupCodes,
                          });
                      })
                    }
                  >
                    <label htmlFor="mfa-password">{t.password}</label>
                    <input
                      id="mfa-password"
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                    <Button disabled={busy}>{t.enable}</Button>
                  </form>
                ) : (
                  <>
                    <label>
                      {t.secret}
                      <input value={setup.secret} readOnly autoComplete="off" />
                    </label>
                    <p>{t.codes}</p>
                    <ul>
                      {setup.backupCodes.map((code) => (
                        <li key={code}>
                          <code>{code}</code>
                        </li>
                      ))}
                    </ul>
                    <form
                      onSubmit={(e) =>
                        submit(e, async (data) => {
                          const result = await authClient.twoFactor.verifyTotp({
                            code: String(data.get("code")),
                            trustDevice: false,
                          });
                          if (result.error) throw new Error(result.error.code);
                          setSetup(null);
                          if (state.selected)
                            await command({
                              action: "context",
                              mandateId: state.selected.id,
                            });
                          else await load();
                          setMessage(t.saved);
                        })
                      }
                    >
                      <label>
                        {t.code}
                        <input
                          name="code"
                          required
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          autoComplete="one-time-code"
                          maxLength={6}
                        />
                      </label>
                      <Button disabled={busy}>{t.check}</Button>
                    </form>
                  </>
                )}
              </Panel>
            )}
            <details className="panel">
              <summary>{t.accept}</summary>
              <form
                onSubmit={(e) =>
                  submit(e, async (data) => {
                    await command({
                      action: "accept",
                      token: data.get("token"),
                    });
                    setInvitationToken("");
                  })
                }
              >
                <label>
                  {t.token}
                  <input
                    name="token"
                    required
                    value={invitationToken}
                    onChange={(e) => setInvitationToken(e.target.value)}
                    autoComplete="off"
                    pattern="[a-f0-9]{64}"
                    maxLength={64}
                  />
                </label>
                <Button disabled={busy}>{t.accept}</Button>
              </form>
            </details>
            {secured &&
              state.selected &&
              state.permissions.includes("invitations.create") && (
                <Panel title={t.invite}>
                  <form
                    onSubmit={(e) =>
                      submit(e, async (data) => {
                        const until = String(data.get("until") ?? "");
                        const result = await command({
                          action: "invite",
                          email: data.get("email"),
                          role: data.get("role"),
                          grants: data.getAll("grants"),
                          ...(data.get("from")
                            ? {
                                validFrom: new Date(
                                  String(data.get("from")) + "T00:00:00Z",
                                ).toISOString(),
                              }
                            : {}),
                          validUntil: until
                            ? new Date(until + "T23:59:59Z").toISOString()
                            : null,
                        });
                        setInvitationLink(
                          `${window.location.origin}/${locale}/access#invitation=${result.token}`,
                        );
                      })
                    }
                  >
                    <label>
                      {t.email}
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      {t.role}
                      <select
                        name="role"
                        defaultValue={
                          state.selected.kind === "club"
                            ? "player"
                            : "federation_worker"
                        }
                      >
                        {roles
                          .filter(
                            (role) =>
                              roleAllowed(role, state.selected!.kind) &&
                              (![
                                "club_president",
                                "federation_president",
                              ].includes(role) ||
                                state.permissions.includes("mandates.manage")),
                          )
                          .map((role) => (
                            <option key={role} value={role}>
                              {roleText(role)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <fieldset>
                      <legend>{t.grants}</legend>
                      {Object.entries(grantLabels)
                        .filter(([value]) =>
                          state.permissions.includes(value as Permission),
                        )
                        .map(([value, label]) => (
                          <label className="check" key={value}>
                            <input
                              type="checkbox"
                              name="grants"
                              value={value}
                            />
                            {label}
                          </label>
                        ))}
                    </fieldset>
                    <label>
                      {t.from}
                      <input name="from" type="date" />
                    </label>
                    <label>
                      {t.until}
                      <input name="until" type="date" />
                    </label>
                    <Button disabled={busy}>{t.create}</Button>
                  </form>
                  {invitationLink && (
                    <label>
                      {t.link}
                      <textarea readOnly value={invitationLink} rows={3} />
                    </label>
                  )}
                </Panel>
              )}
            {secured && state.permissions.includes("members.read") && (
              <Panel title={t.members}>
                <ul className="records">
                  {state.members.map((m) => (
                    <li key={m.id}>
                      <strong>{m.name}</strong> · {roleText(m.role)}
                      <p className="muted">
                        {t.status} :{" "}
                        {!m.active || m.revoked_at
                          ? t.revoked
                          : m.valid_until &&
                              new Date(m.valid_until) <= new Date()
                            ? t.expired
                            : t.active}
                        {m.valid_until &&
                          ` · ${new Date(m.valid_until).toLocaleDateString(locale)}`}
                      </p>
                      {state.permissions.includes("mandates.manage") && (
                        <div className="actions">
                          {!m.revoked_at && (
                            <>
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void task(() =>
                                    confirm("revoke" + m.id, {
                                      action: "revoke",
                                      id: m.id,
                                    }),
                                  )
                                }
                              >
                                {t.revoke}
                              </Button>
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  void task(async () => {
                                    await command({
                                      action: "renew",
                                      id: m.id,
                                      validUntil: null,
                                    });
                                  })
                                }
                              >
                                {t.renew}
                              </Button>
                            </>
                          )}
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void task(() =>
                                confirm("member" + m.user_id, {
                                  action: "membership",
                                  userId: m.user_id,
                                  active: !m.active,
                                }),
                              )
                            }
                          >
                            {m.active ? t.deactivate : t.activate}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {!state.members.length && <p>{t.empty}</p>}
              </Panel>
            )}
            {secured && state.permissions.includes("invitations.create") && (
              <Panel title={t.invites}>
                <ul className="records">
                  {state.invitations.map((i) => (
                    <li key={i.id}>
                      {i.email} · {roleText(i.role)}
                      <p>
                        {i.accepted_at
                          ? t.used
                          : i.revoked_at
                            ? t.revoked
                            : new Date(i.expires_at) < new Date()
                              ? t.expired
                              : t.pending}
                      </p>
                      {!i.accepted_at &&
                        !i.revoked_at &&
                        state.permissions.includes("mandates.manage") && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void task(async () => {
                                await command({
                                  action: "cancelInvitation",
                                  id: i.id,
                                });
                              })
                            }
                          >
                            {t.cancel}
                          </Button>
                        )}
                    </li>
                  ))}
                </ul>
                {!state.invitations.length && <p>{t.empty}</p>}
              </Panel>
            )}
            {secured && state.permissions.includes("audit.read") && (
              <Panel title={t.audit}>
                <ul className="records">
                  {state.audit.map((a) => (
                    <li key={a.id}>
                      {a.name} ·{" "}
                      <span>{auditLabels[a.action]?.[locale] ?? a.action}</span>
                      <p className="muted">
                        {new Date(a.created_at).toLocaleString(locale)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {state.selected && !state.permissions.includes("members.read") && (
              <p>{t.readonly}</p>
            )}
            <Panel title={t.preferences}>
              <form
                onSubmit={(e) =>
                  submit(e, async (data) => {
                    await command({
                      action: "preferences",
                      locale: data.get("locale"),
                      notificationsEnabled: data.has("notifications"),
                    });
                    contextChanged();
                    router.push(`/${String(data.get("locale"))}/access`);
                  })
                }
              >
                <label>
                  {locale === "en"
                    ? "Language"
                    : locale === "fr"
                      ? "Langue"
                      : "Taal"}
                  <select
                    name="locale"
                    defaultValue={state.preferences?.locale ?? locale}
                  >
                    <option value="fr">Français</option>
                    <option value="nl">Nederlands</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    name="notifications"
                    type="checkbox"
                    defaultChecked={state.preferences?.notifications_enabled}
                  />
                  {t.notifications}
                </label>
                <Button disabled={busy}>{t.save}</Button>
              </form>
            </Panel>
          </>
        )}
        {loading || state ? null : (
          <button className="text-button" onClick={() => void load()}>
            {t.retry}
          </button>
        )}
      </main>
    </>
  );
}
