import type { Locale } from "@/lib/locale";

/** Console, step 4 (05/11/2026): the organisation's subscription to the platform and its invoices. */
type Copy = {
  title: string;
  intro: string;
  plan: string;
  noPlan: string;
  periods: Record<"month" | "year", string>;
  bases: Record<"organization" | "player", string>;
  since: string;
  until: string;
  open: string;
  invoices: string;
  none: string;
  columns: { number: string; label: string; amount: string; issued: string; due: string; state: string };
  states: Record<"draft" | "sent" | "paid" | "cancelled", string>;
  late: string;
  reminders: string;
  howToPay: string;
  payOnline: string;
  ubl: string;
  paidVia: Record<"manual" | "mollie", string>;
};
const fr: Copy = {
  title: "Abonnement à la plateforme",
  intro: "Ce que votre organisation paie pour utiliser Powerchair Football Manager, et vos factures. Les paiements sont confirmés par l'exploitant de la plateforme.",
  plan: "Formule",
  noPlan: "Aucun abonnement enregistré pour votre organisation.",
  periods: { month: "par mois", year: "par an" },
  bases: { organization: "par organisation", player: "par joueur actif" },
  since: "depuis le {day}",
  until: "jusqu'au {day}",
  open: "Reste à payer : {amount}",
  invoices: "Factures",
  none: "Aucune facture.",
  columns: { number: "Numéro", label: "Objet", amount: "Montant", issued: "Émise le", due: "Échéance", state: "État" },
  states: { draft: "Brouillon", sent: "À payer", paid: "Payée", cancelled: "Annulée" },
  late: "En retard",
  reminders: "{n} rappel(s)",
  howToPay: "Le virement se fait avec le numéro de la facture en communication ; l'exploitant confirme la réception. Quand un bouton « Payer en ligne » est proposé, le paiement est confirmé tout seul.",
  payOnline: "Payer en ligne",
  ubl: "Facture électronique (UBL)",
  paidVia: { manual: "virement", mollie: "en ligne" },
};
const nl: Copy = {
  title: "Abonnement op het platform",
  intro: "Wat uw organisatie betaalt om Powerchair Football Manager te gebruiken, en uw facturen. De betalingen worden bevestigd door de beheerder van het platform.",
  plan: "Formule",
  noPlan: "Geen abonnement geregistreerd voor uw organisatie.",
  periods: { month: "per maand", year: "per jaar" },
  bases: { organization: "per organisatie", player: "per actieve speler" },
  since: "sinds {day}",
  until: "tot {day}",
  open: "Nog te betalen: {amount}",
  invoices: "Facturen",
  none: "Geen factuur.",
  columns: { number: "Nummer", label: "Omschrijving", amount: "Bedrag", issued: "Uitgereikt op", due: "Vervaldag", state: "Toestand" },
  states: { draft: "Ontwerp", sent: "Te betalen", paid: "Betaald", cancelled: "Geannuleerd" },
  late: "Te laat",
  reminders: "{n} herinnering(en)",
  howToPay: "De overschrijving gebeurt met het factuurnummer als mededeling; de beheerder bevestigt de ontvangst. Als een knop « Online betalen » wordt aangeboden, wordt de betaling vanzelf bevestigd.",
  payOnline: "Online betalen",
  ubl: "Elektronische factuur (UBL)",
  paidVia: { manual: "overschrijving", mollie: "online" },
};
const en: Copy = {
  title: "Platform subscription",
  intro: "What your organisation pays to use Powerchair Football Manager, and your invoices. Payments are confirmed by the platform's operator.",
  plan: "Plan",
  noPlan: "No subscription recorded for your organisation.",
  periods: { month: "per month", year: "per year" },
  bases: { organization: "per organisation", player: "per active player" },
  since: "since {day}",
  until: "until {day}",
  open: "Left to pay: {amount}",
  invoices: "Invoices",
  none: "No invoice.",
  columns: { number: "Number", label: "Subject", amount: "Amount", issued: "Issued on", due: "Due", state: "State" },
  states: { draft: "Draft", sent: "To pay", paid: "Paid", cancelled: "Cancelled" },
  late: "Late",
  reminders: "{n} reminder(s)",
  howToPay: "The transfer carries the invoice number as reference; the operator confirms its receipt. When a \"Pay online\" button is offered, the payment is confirmed by itself.",
  payOnline: "Pay online",
  ubl: "Electronic invoice (UBL)",
  paidVia: { manual: "transfer", mollie: "online" },
};
export const organizationBillingCopy: Record<Locale, Copy> = { fr, nl, en };
