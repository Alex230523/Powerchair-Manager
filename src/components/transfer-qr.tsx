"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/locale";
import { formatIban } from "@/lib/iban";
import { qrMatrix, qrPath } from "@/lib/qr";
import { epcPayload, formatReference } from "@/domains/bank/reference";
import { bankCopy } from "./bank-copy";
import { fill } from "./fleet-copy";
import { Button } from "./ui";

/**
 * B1: the transfer QR (EPC069-12) of a fee or an instalment, with the
 * account, the amount and the structured communication written out, and a
 * clear line that it does not confirm the payment.
 */
export function TransferQr({
  locale,
  payment,
  cents,
  reference,
  printHref,
}: {
  locale: Locale;
  payment: { iban: string; bic: string; holder: string };
  cents: number;
  reference: string;
  printHref?: string;
}) {
  const t = bankCopy[locale];
  const [copied, setCopied] = useState(false);
  const tag = locale === "en" ? "en-GB" : `${locale}-BE`;
  const amount = new Intl.NumberFormat(tag, { style: "currency", currency: "EUR" }).format(cents / 100);
  const qr = useMemo(() => {
    try {
      const m = qrMatrix(epcPayload({ name: payment.holder, iban: payment.iban, bic: payment.bic, cents, reference }));
      return m ? qrPath(m) : null;
    } catch {
      return null;
    }
  }, [payment.holder, payment.iban, payment.bic, cents, reference]);
  const label = fill(t.qrAlt, { amount, name: payment.holder });
  return (
    <figure className="bank-qr">
      {qr && (
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
          <rect width={qr.size} height={qr.size} fill="var(--qr-paper)" />
          <path d={qr.d} fill="var(--qr-ink)" />
        </svg>
      )}
      <dl>
        <dt>{t.beneficiary}</dt>
        <dd>{payment.holder}</dd>
        <dt>{t.iban}</dt>
        <dd>{formatIban(payment.iban)}</dd>
        <dt>{t.toPay}</dt>
        <dd>{amount}</dd>
        <dt>{t.reference}</dt>
        <dd>{formatReference(reference)}</dd>
      </dl>
      <figcaption className="notice">{t.qrWarning}</figcaption>
      <p className="actions">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(formatReference(reference))
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {t.copy}
        </Button>
        {printHref && (
          <Link className="button secondary sm" href={printHref} target="_blank" rel="noopener">
            {t.print}
          </Link>
        )}
      </p>
      <p role="status" className="sr-only">
        {copied ? t.copied : ""}
      </p>
    </figure>
  );
}
