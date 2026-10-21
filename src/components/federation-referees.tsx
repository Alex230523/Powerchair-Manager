"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { federationRefereesView } from "@/domains/federation/clubs";
import { errors } from "./access-copy";
import { federationCopy } from "./federation-copy";
import { Button } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof federationRefereesView>>;

/** Federation (wave 16, I3): the referees, « Inviter un arbitre », pending invitations to send again or cancel. */
export function RefereeRoster({ locale }: { locale: Locale }) {
  const t = federationCopy[locale].referees,
    c = federationCopy[locale].clubs;
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [inviting, setInviting] = useState(false);
  const load = useCallback(
    () =>
      fetch("/api/federation/referees", { cache: "no-store" })
        .then(async (r) => (r.ok ? setView(await r.json()) : setView(null)))
        .catch(() => setView(null)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/federation/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, organizationId: view?.organization_id }),
      });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await load();
      setMessage(done);
      return true;
    } catch (e) {
      setError(errors[(e as Error).message]?.[locale] ?? c.failed);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    if (await send({ action: "inviteReferee", firstName: get("firstName"), lastName: get("lastName"), email: get("email") }, t.invited)) setInviting(false);
  }
  // Referees themselves, and profiles without access, see only the designations below.
  if (!view) return null;
  return (
    <section className="panel federation-referees" aria-labelledby="referee-roster-title">
      <div className="federation-section-head">
        <h2 id="referee-roster-title">{t.title}</h2>
        {view.can.manage && (
          <Button icon="userPlus" onClick={() => setInviting(true)}>
            {t.invite}
          </Button>
        )}
      </div>
      <p className="muted">{t.intro}</p>
      {error && !inviting && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {view.referees.length ? (
        <div className="table-scroll" role="region" aria-label={t.title} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t.name}</th>
                <th scope="col">{t.email}</th>
                <th scope="col" className="num">
                  {t.available}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.referees.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td>
                    <a href={"mailto:" + r.email}>{r.email}</a>
                  </td>
                  <td className="num">{r.available_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>{t.empty}</p>
      )}
      {view.invitations.length > 0 && (
        <>
          <h3>{t.pendingTitle}</h3>
          <ul className="records">
            {view.invitations.map((i) => (
              <li key={i.id}>
                <span>
                  {i.name || i.email} · {i.email} · {c.invitationStates[i.status]}
                  {i.status === "disputed" && i.note && <> « {i.note} »</>}
                </span>
                {view.can.manage && (
                  <span className="federation-actions">
                    <Button size="sm" variant="ghost" disabled={busy} aria-label={`${c.resend} : ${i.email}`} onClick={() => void send({ action: "resendInvitation", id: i.id }, c.resent)}>
                      {c.resend}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} aria-label={`${c.cancel} : ${i.email}`} onClick={() => void send({ action: "cancelInvitation", id: i.id }, c.cancelled)}>
                      {c.cancel}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {inviting && (
        <Modal title={t.invite} close={() => setInviting(false)}>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void invite(e)}>
            <label>
              {c.form.firstName}
              <input name="firstName" required maxLength={60} autoComplete="off" />
            </label>
            <label>
              {c.form.lastName}
              <input name="lastName" required maxLength={60} autoComplete="off" />
            </label>
            <label>
              {c.form.email}
              <input name="email" type="email" required maxLength={254} autoComplete="off" />
            </label>
            <Button type="submit" loading={busy}>
              {t.send}
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
