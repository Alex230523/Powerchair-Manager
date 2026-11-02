"use client";
import { useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { attestationsView } from "@/domains/dues/attestation";
import { errors } from "./access-copy";
import { attestationCopy, fill } from "./attestation-copy";
import { Modal } from "./modal";
import { Badge, Card, EmptyState } from "./ui";

/**
 * 9, part 2: on each attestation, a preview of the PDF in a window, then
 * Télécharger, Imprimer, Envoyer; « Renvoyer » on the club's lines and
 * « Télécharger mon attestation » for the player or the parent. Below, the
 * mutuals' own forms.
 */
type View = Awaited<ReturnType<typeof attestationsView>>;
type Person = View["people"][number];
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const day = (l: Locale, d: string) => new Intl.DateTimeFormat(tag(l), { dateStyle: "medium", timeZone: "Europe/Brussels" }).format(new Date(d));
const message = (l: Locale, code: string) => attestationCopy[l].errors[code] ?? errors[code]?.[l] ?? code;
const asBase64 = (f: File) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => ko(r.error);
    r.readAsDataURL(f);
  });
const post = async (body: unknown) => {
  const r = await fetch("/api/dues/attestations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const v = r ? await r.json().catch(() => ({})) : {};
  return { ok: !!r?.ok, code: (v.error as string) ?? "", value: v };
};

export function AttestationActions({ locale, data, person, reload, say }: { locale: Locale; data: View; person: Person; reload: () => Promise<void>; say: (s: string) => void }) {
  const t = attestationCopy[locale];
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  if (!person.eligible || !data.season) return null;
  const pdf = `/api/dues/attestations/pdf?profile=${person.profile_id}&season=${data.season.id}&locale=${locale}`;
  async function send() {
    setBusy(true);
    const r = await post({ action: "send", profileId: person.profile_id, seasonId: data.season!.id, organizationId: data.organization_id });
    setBusy(false);
    say(r.ok ? (r.value.sent ? fill(t.sentOk, { n: r.value.sent }) : t.noRecipient) : message(locale, r.code));
    if (r.ok) await reload();
  }
  return (
    <span className="attestation-actions">
      {person.sent && <span className="muted small">{person.sent.last ? fill(t.sentOn, { number: person.sent.number, count: person.sent.count, date: day(locale, person.sent.last) }) : fill(t.numbered, { number: person.sent.number })}</span>}
      <button type="button" className="text-button" onClick={() => setOpen(true)}>
        {t.preview}
        <span className="sr-only"> : {person.full_name}</span>
      </button>
      {data.can.all ? null : (
        <a className="text-button" href={`${pdf}&download=1`} download>
          {t.downloadMine}
          <span className="sr-only"> : {person.full_name}</span>
        </a>
      )}
      {data.can.send && (
        <button type="button" className="text-button" disabled={busy} onClick={() => void send()}>
          {person.sent?.count ? t.resend : t.send}
          <span className="sr-only"> : {person.full_name}</span>
        </button>
      )}
      {open && (
        <Modal title={fill(t.previewOf, { name: person.full_name })} close={() => setOpen(false)} className="player-dialog attestation-preview">
          <iframe ref={frame} src={pdf} title={t.pdfFrame} className="attestation-frame" />
          <p className="actions">
            <a className="button secondary" href={`${pdf}&download=1`} download>
              {t.download}
            </a>
            <button type="button" className="button secondary" onClick={() => frame.current?.contentWindow?.print()}>
              {t.printPdf}
            </button>
            {data.can.send && (
              <button type="button" className="button" disabled={busy} onClick={() => void send()}>
                {person.sent?.count ? t.resend : t.send}
              </button>
            )}
          </p>
        </Modal>
      )}
    </span>
  );
}

export function MutualForms({ locale, data, reload, say }: { locale: Locale; data: View; reload: () => Promise<void>; say: (s: string) => void }) {
  const t = attestationCopy[locale];
  const [busy, setBusy] = useState(false);
  if (!data.season) return null;
  const season = data.season;
  const todo = data.forms.filter((f) => !f.done_at);
  async function send(body: Record<string, unknown>, file: File | undefined) {
    if (!file) return;
    if (file.size > 5242880) return say(t.tooBig);
    setBusy(true);
    const r = await post({ ...body, file: { name: file.name, type: file.type, base64: await asBase64(file) }, organizationId: data.organization_id });
    setBusy(false);
    say(r.ok ? attestationCopy[locale].saved : message(locale, r.code));
    if (r.ok) await reload();
  }
  function drop(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({ action: "upload", profileId: String(f.get("profile")), seasonId: season.id }, (f.get("file") as File) || undefined).then(() => (e.target as HTMLFormElement).reset());
  }
  return (
    <Card title={t.formsTitle} labelledBy="mutual-forms" headingId="mutual-forms">
      <p className="muted">{t.formsIntro}</p>
      {data.can.send && todo.length > 0 && <h3>{t.formsTodo}</h3>}
      {data.forms.length ? (
        <ul className="plain-list mutual-forms">
          {data.forms.map((f) => (
            <li key={f.id}>
              <strong>{f.full_name}</strong> · <a href={`/api/dues/attestations/form?id=${f.id}&which=blank`}>{t.formBlank}</a>
              {f.done_at ? (
                <>
                  {" "}
                  · <a href={`/api/dues/attestations/form?id=${f.id}&which=filled`}>{t.formFilled}</a> <Badge tone="success">{fill(t.formDone, { date: day(locale, f.done_at) })}</Badge>
                </>
              ) : data.can.send ? (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send({ action: "fill", id: f.id }, (new FormData(e.currentTarget).get("file") as File) || undefined);
                  }}
                >
                  <label htmlFor={`fill-${f.id}`}>
                    {t.formFill}
                    <input id={`fill-${f.id}`} name="file" type="file" required accept="application/pdf,image/png,image/jpeg" />
                  </label>
                  <button type="submit" className="button secondary sm" disabled={busy}>
                    {t.formFillButton}
                  </button>
                </form>
              ) : (
                <>
                  {" "}
                  <Badge tone="warning">{t.formWaiting}</Badge>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t.formsNone} />
      )}
      {!data.can.all && data.people.length > 0 && (
        <form className="inline-form" onSubmit={drop}>
          <label htmlFor="mutual-person">
            {t.formFor}
            <select id="mutual-person" name="profile">
              {data.people.map((x) => (
                <option key={x.profile_id} value={x.profile_id}>
                  {x.full_name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="mutual-file">
            {t.formFile}
            <input id="mutual-file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" />
          </label>
          <button type="submit" className="button secondary" disabled={busy}>
            {t.formDrop}
          </button>
        </form>
      )}
    </Card>
  );
}
