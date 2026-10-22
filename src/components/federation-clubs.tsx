"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { federationClubsView } from "@/domains/federation/clubs";
import { errors } from "./access-copy";
import { federationCopy } from "./federation-copy";
import { Badge, Button, EmptyState, PageHeader } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof federationClubsView>>;
type Club = View["clubs"][number];

/** Federation (wave 16, I3): clubs and presidents; create a club, invite or change its president. */
export function FederationClubs({ locale }: { locale: Locale }) {
  const t = federationCopy[locale].clubs;
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [inviting, setInviting] = useState<Club | null>(null);
  const explain = useCallback(
    (code: string) => (["FEDERATION_ONLY", "FORBIDDEN"].includes(code) ? t.federationOnly : (errors[code]?.[locale] ?? t.failed)),
    [locale, t.federationOnly, t.failed],
  );
  const load = useCallback(
    () =>
      fetch("/api/federation/clubs", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setView(v);
        })
        .catch((e: Error) => setError(explain(e.message))),
    [explain],
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
      setError(explain((e as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await send(
      {
        action: "createClub",
        name: field(f, "name"),
        city: field(f, "city"),
        affiliationNumber: field(f, "affiliation"),
        companyNumber: field(f, "company"),
        legalForm: field(f, "legal") || null,
        contactEmail: field(f, "contact"),
        president: { firstName: field(f, "firstName"), lastName: field(f, "lastName"), email: field(f, "email") },
      },
      t.created(field(f, "name")),
    );
    if (ok) setCreating(false);
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inviting) return;
    const f = new FormData(e.currentTarget);
    const ok = await send({ action: "invitePresident", clubId: inviting.id, firstName: field(f, "firstName"), lastName: field(f, "lastName"), email: field(f, "email") }, t.invited);
    if (ok) setInviting(null);
  }
  const person = (
    <>
      <label>
        {t.form.firstName}
        <input name="firstName" required maxLength={60} autoComplete="off" />
      </label>
      <label>
        {t.form.lastName}
        <input name="lastName" required maxLength={60} autoComplete="off" />
      </label>
      <label>
        {t.form.email}
        <input name="email" type="email" required maxLength={254} autoComplete="off" />
      </label>
    </>
  );
  const manage = !!view?.can.manage;
  const pending = (c: Club) => c.invitation && ["pending", "expired", "disputed"].includes(c.invitation.status);

  return (
    <main id="main" className="access federation-clubs">
      <PageHeader
        title={t.title}
        subtitle={t.intro}
        actions={
          manage && (
            <Button icon="plus" onClick={() => setCreating(true)}>
              {t.add}
            </Button>
          )
        }
      />
      {error && !creating && !inviting && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!view && !error && <p role="status">{t.loading}</p>}
      {view &&
        (view.clubs.length ? (
          <div className="table-scroll" role="region" aria-label={t.title} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.club}</th>
                  <th scope="col">{t.affiliation}</th>
                  <th scope="col">{t.president}</th>
                  <th scope="col" className="num">
                    {t.teams}
                  </th>
                  <th scope="col" className="num">
                    {t.licensed}
                  </th>
                  <th scope="col">{t.status}</th>
                  {manage && <th scope="col">{t.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {view.clubs.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.name}
                      {c.city && <span className="muted federation-city">{c.city}</span>}
                    </th>
                    <td>{c.affiliation_number}</td>
                    <td>
                      {c.president ? (
                        <>
                          {c.president.name}
                          <span className="muted federation-city">
                            <a href={"mailto:" + c.president.email}>{c.president.email}</a>
                          </span>
                        </>
                      ) : (
                        <span className="muted">{t.noPresident}</span>
                      )}
                      {pending(c) && (
                        <span className="federation-invitation">
                          {c.invitation!.succession ? t.succession : t.invitationStates[c.invitation!.status]} · {c.invitation!.email}
                          {c.invitation!.status === "disputed" && c.invitation!.note && <> « {c.invitation!.note} »</>}
                        </span>
                      )}
                    </td>
                    <td className="num">{c.teams}</td>
                    <td className="num">{c.licensed}</td>
                    <td>
                      <Badge tone={c.status === "active" ? "success" : "warning"}>{t.statuses[c.status]}</Badge>
                    </td>
                    {manage && (
                      <td>
                        <div className="federation-actions">
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setInviting(c)} aria-label={`${c.president ? t.change : t.invite} : ${c.name}`}>
                            {c.president ? t.change : t.invite}
                          </Button>
                          {pending(c) && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`${t.resend} : ${c.name}`}
                                onClick={() => void send({ action: "resendInvitation", id: c.invitation!.id }, t.resent)}
                              >
                                {t.resend}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`${t.cancel} : ${c.name}`}
                                onClick={() => void send({ action: "cancelInvitation", id: c.invitation!.id }, t.cancelled)}
                              >
                                {t.cancel}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t.total}</th>
                  <td />
                  <td />
                  <td className="num">{view.clubs.reduce((n, c) => n + c.teams, 0)}</td>
                  <td className="num">{view.clubs.reduce((n, c) => n + c.licensed, 0)}</td>
                  <td />
                  {manage && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState title={t.empty} />
        ))}
      {creating && (
        <Modal title={t.add} close={() => setCreating(false)}>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void create(e)}>
            <fieldset>
              <legend>{t.form.identity}</legend>
              <label>
                {t.form.name}
                <input name="name" required minLength={2} maxLength={120} />
              </label>
              <label>
                {t.form.cityLabel}
                <input name="city" maxLength={80} />
              </label>
              <label>
                {t.form.affiliationLabel}
                <input name="affiliation" maxLength={40} />
              </label>
              <label>
                {t.form.company}
                <input name="company" pattern="[01][0-9]{3}\.[0-9]{3}\.[0-9]{3}" maxLength={12} inputMode="numeric" />
              </label>
              <label>
                {t.form.legal}
                <select name="legal" defaultValue="">
                  <option value="">{t.form.notSaid}</option>
                  <option value="asbl">{t.form.legalForms.asbl}</option>
                  <option value="de_facto">{t.form.legalForms.de_facto}</option>
                  <option value="other">{t.form.legalForms.other}</option>
                </select>
              </label>
              <label>
                {t.form.contact}
                <input name="contact" type="email" maxLength={254} />
              </label>
            </fieldset>
            <fieldset>
              <legend>{t.form.presidentTitle}</legend>
              <p className="muted">{t.form.inviteHelp}</p>
              {person}
            </fieldset>
            <Button type="submit" loading={busy}>
              {t.form.create}
            </Button>
          </form>
        </Modal>
      )}
      {inviting && (
        <Modal title={`${inviting.president ? t.change : t.invite} : ${inviting.name}`} close={() => setInviting(null)}>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void invite(e)}>
            <p className="muted">{inviting.president ? t.form.changeHelp : t.form.inviteHelp}</p>
            {person}
            <Button type="submit" loading={busy}>
              {t.form.sendInvite}
            </Button>
          </form>
        </Modal>
      )}
    </main>
  );
}
