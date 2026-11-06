import type { Pool } from "pg";
import { AccessError, active, type Principal } from "../access/service";
import { operatorScope } from "../console/service";

/**
 * Console, series B (06/11/2026): an invoice of the platform as a UBL 2.1
 * invoice (Peppol BIS Billing 3.0 shape), the electronic invoice Belgium
 * requires between businesses from 2026. The seller is the platform
 * (PFM_SELLER_* in the configuration); the amount of the invoice is the
 * total to pay, VAT included at PFM_VAT_RATE (21 by default; 0 means not
 * subject). Pure building, so the tests read the XML.
 */
export type Env = Record<string, string | undefined>;
export type UblInvoice = { number: string; issued_on: string; due_on: string; label: string; quantity: number; unit_cents: number; amount_cents: number; period_from: string; period_to: string; paid_on: string | null; customer: { name: string; company_number: string; address: string; country: string } };
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const money = (cents: number) => (cents / 100).toFixed(2);
export function seller(env: Env = process.env) {
  return { name: env.PFM_SELLER_NAME ?? "Powerchair Football Manager", vat: env.PFM_SELLER_VAT ?? "", address: env.PFM_SELLER_ADDRESS ?? "", city: env.PFM_SELLER_CITY ?? "", postal: env.PFM_SELLER_POSTAL ?? "", country: env.PFM_SELLER_COUNTRY ?? "BE", iban: env.PFM_SELLER_IBAN ?? "", email: env.PFM_SELLER_EMAIL ?? "" };
}
export function vatRate(env: Env = process.env) {
  const r = Number(env.PFM_VAT_RATE ?? "21");
  return Number.isFinite(r) && r >= 0 && r <= 100 ? r : 21;
}
/** The company number « 0123.456.789 » as a Belgian VAT number « BE0123456789 ». */
export const beVat = (companyNumber: string) => (companyNumber ? "BE" + companyNumber.replace(/\./g, "") : "");

export function ublXml(inv: UblInvoice, env: Env = process.env) {
  const s = seller(env),
    rate = vatRate(env);
  const total = inv.amount_cents;
  const base = rate > 0 ? Math.round(total / (1 + rate / 100)) : total;
  const tax = total - base;
  const category = rate > 0 ? "S" : "O";
  const party = (name: string, vat: string, address: string, postal: string, city: string, country: string, email = "") =>
    `<cac:Party>${vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}<cac:PostalAddress>${address ? `<cbc:StreetName>${esc(address)}</cbc:StreetName>` : ""}${city ? `<cbc:CityName>${esc(city)}</cbc:CityName>` : ""}${postal ? `<cbc:PostalZone>${esc(postal)}</cbc:PostalZone>` : ""}<cac:Country><cbc:IdentificationCode>${esc(country)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>${esc(name)}</cbc:RegistrationName>${vat ? `<cbc:CompanyID>${esc(vat)}</cbc:CompanyID>` : ""}</cac:PartyLegalEntity>${email ? `<cac:Contact><cbc:ElectronicMail>${esc(email)}</cbc:ElectronicMail></cac:Contact>` : ""}</cac:Party>`;
  const taxBlock = `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${money(tax)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${money(base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${money(tax)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${rate}</cbc:Percent>${rate === 0 ? "<cbc:TaxExemptionReason>Not subject to VAT</cbc:TaxExemptionReason>" : ""}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`;
  const unitBase = rate > 0 ? Math.round(inv.unit_cents / (1 + rate / 100)) : inv.unit_cents;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${esc(inv.number)}</cbc:ID>
<cbc:IssueDate>${inv.issued_on}</cbc:IssueDate>
<cbc:DueDate>${inv.due_on}</cbc:DueDate>
<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
<cbc:Note>${esc(inv.label)}</cbc:Note>
<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${esc(inv.customer.name)}</cbc:BuyerReference>
<cac:InvoicePeriod><cbc:StartDate>${inv.period_from}</cbc:StartDate><cbc:EndDate>${inv.period_to}</cbc:EndDate></cac:InvoicePeriod>
<cac:AccountingSupplierParty>${party(s.name, s.vat, s.address, s.postal, s.city, s.country, s.email)}</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>${party(inv.customer.name, beVat(inv.customer.company_number), inv.customer.address, "", "", inv.customer.country)}</cac:AccountingCustomerParty>
<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${esc(inv.number)}</cbc:PaymentID>${s.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(s.iban)}</cbc:ID><cbc:Name>${esc(s.name)}</cbc:Name></cac:PayeeFinancialAccount>` : ""}</cac:PaymentMeans>
<cac:PaymentTerms><cbc:Note>${inv.paid_on ? `Paid on ${inv.paid_on}` : `Due on ${inv.due_on}`}</cbc:Note></cac:PaymentTerms>
${taxBlock}
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${money(base)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${money(base)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${money(total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${money(total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">${inv.quantity}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">${money(base)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${esc(inv.label)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${money(unitBase)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>
`;
}

const sql = `SELECT i.id,i.number,i.issued_on::text AS issued_on,i.due_on::text AS due_on,i.label,i.quantity,i.unit_cents,i.amount_cents,i.period_from::text AS period_from,i.period_to::text AS period_to,i.paid_on::text AS paid_on,i.state,i.organization_id,
  o.name,o.company_number,o.address,o.country_code AS country FROM billing_invoice i JOIN organization o ON o.id=i.organization_id`;
type Row = UblInvoice & { id: string; state: string; organization_id: string; name: string; company_number: string; address: string; country: string };
const shape = (r: Row): UblInvoice => ({ ...r, customer: { name: r.name, company_number: r.company_number, address: r.address, country: r.country } });
/** For the console: any invoice but a draft. */
export async function ublForOperator(db: Pool, p: Principal, id: string) {
  return operatorScope(db, p, async (c) => {
    const r = (await c.query(`${sql} WHERE i.id=$1 AND i.state<>'draft'`, [id])).rows[0] as Row | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return { number: r.number, xml: ublXml(shape(r)) };
  });
}
/** For the organisation's presidency: its own invoices only. */
export async function ublForOrganization(db: Pool, p: Principal, id: string) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    if (!["club_president", "federation_president"].includes(a.role)) throw new AccessError("FORBIDDEN");
    const r = (await c.query(`${sql} WHERE i.id=$1 AND i.organization_id=$2 AND i.state<>'draft'`, [id, a.organization_id])).rows[0] as Row | undefined;
    if (!r) throw new AccessError("NOT_FOUND", 404);
    return { number: r.number, xml: ublXml(shape(r)) };
  } finally {
    c.release();
  }
}
