import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locale";
import { PaymentSheet } from "@/components/payment-sheet";
export const metadata = { title: "Invitation à payer · Powerchair Football Manager" };
/** B1: a fee's transfer QR on a printable page (one per unpaid instalment). */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string; receivable: string }> }) {
  const { locale, id, receivable } = await params;
  if (!isLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(receivable)) notFound();
  return <PaymentSheet locale={locale} id={id} receivable={receivable} />;
}
