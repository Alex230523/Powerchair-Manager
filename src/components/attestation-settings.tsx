"use client";
import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { attestationSettings } from "@/domains/dues/attestation-send";
import { attestationCopy } from "./attestation-copy";
import { SignaturePad } from "./signature-pad";
import { useData } from "./use-api";
import { Card } from "./ui";

/**
 * 9, part 2: Réglages › Club, the signatory and the signature of the
 * attestations (administrators only); Réglages › Finances, the automatic
 * sending once the season is paid in full.
 */
type View = Awaited<ReturnType<typeof attestationSettings>>;
const save = (body: unknown) => fetch("/api/dues/attestations/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.ok).catch(() => false);
const asDataUrl = (f: File) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(f);
  });

export function AttestationSignature({ locale }: { locale: Locale }) {
  const t = attestationCopy[locale];
  const failure = useCallback(() => "", []);
  const { data, reload } = useData<View>("/api/dues/attestations/settings", failure);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  if (!data?.can.admin) return null;
  const done = async (ok: boolean) => {
    setBusy(false);
    setStatus(ok ? t.saved : t.errors.INVALID_FILE);
    if (ok) await reload();
  };
  async function signatory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    await done(await save({ action: "signatory", signatory: String(f.get("signatory") ?? ""), signatoryRole: String(f.get("role") ?? ""), organizationId: data!.organization_id }));
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    await done(await save({ action: "signature", png: await asDataUrl(f), organizationId: data!.organization_id }));
  }
  return (
    <Card title={t.signTitle} labelledBy="settings-attestation-sign" headingId="settings-attestation-sign">
      <p className="muted">{t.signIntro}</p>
      <form className="finance-form" onSubmit={signatory} key={data.signatory + data.signatoryRole}>
        <label htmlFor="att-signatory">
          {t.signatory}
          <input id="att-signatory" name="signatory" maxLength={160} placeholder={t.signatoryHint} defaultValue={data.signatory} />
        </label>
        <label htmlFor="att-role">
          {t.signatoryRole}
          <input id="att-role" name="role" maxLength={80} placeholder={t.signatoryRoleHint} defaultValue={data.signatoryRole} />
        </label>
        <p className="actions">
          <button type="submit" className="button secondary" disabled={busy}>
            {t.saveSignatory}
          </button>
        </p>
      </form>
      <h3>{t.current}</h3>
      {data.signature ? (
        <p>
          {/* A data URL, seen by the administrators only. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="signature-preview" src={data.signature} alt={t.current} />
          <br />
          <button type="button" className="text-button" disabled={busy} onClick={() => void save({ action: "signature", png: null, organizationId: data.organization_id }).then(done)}>
            {t.remove}
          </button>
        </p>
      ) : (
        <p className="muted">{t.none}</p>
      )}
      <label htmlFor="att-signature-file">
        {t.upload}
        <input id="att-signature-file" type="file" accept="image/png" onChange={(e) => void upload(e)} />
      </label>
      <SignaturePad
        locale={locale}
        busy={busy}
        defaultName={data.signatory}
        texts={{ title: t.padTitle, intro: t.padIntro, accept: t.padAccept, sign: t.padSign, name: t.padName }}
        onSign={({ signerName, signature }) => {
          setBusy(true);
          void (async () => {
            const ok = await save({ action: "signature", png: signature, organizationId: data.organization_id });
            if (ok && signerName && signerName !== data.signatory) await save({ action: "signatory", signatory: signerName, signatoryRole: data.signatoryRole, organizationId: data.organization_id });
            await done(ok);
          })();
        }}
      />
      <p role="status" className="muted">
        {status}
      </p>
    </Card>
  );
}

export function AttestationAuto({ locale }: { locale: Locale }) {
  const t = attestationCopy[locale];
  const failure = useCallback(() => "", []);
  const { data, reload } = useData<View>("/api/dues/attestations/settings", failure);
  const [status, setStatus] = useState("");
  if (!data || (!data.can.money && !data.can.admin)) return null;
  return (
    <Card title={t.autoTitle} labelledBy="settings-attestation-auto" headingId="settings-attestation-auto">
      <label className="check" htmlFor="att-auto">
        <input
          id="att-auto"
          type="checkbox"
          aria-describedby="att-auto-help"
          checked={data.auto}
          onChange={async (e) => {
            setStatus("");
            if (await save({ action: "auto", on: e.target.checked, organizationId: data.organization_id })) {
              await reload();
              setStatus(t.saved);
            }
          }}
        />
        {t.autoLabel}
      </label>
      <p className="field-help" id="att-auto-help">
        {t.autoHelp}
      </p>
      <p role="status" className="muted">
        {status}
      </p>
    </Card>
  );
}
