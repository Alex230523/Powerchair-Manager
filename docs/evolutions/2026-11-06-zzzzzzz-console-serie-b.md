# Console, série B : paiement en ligne par Mollie, factures électroniques UBL

Suite des neuf améliorations demandées le 06/11/2026 pour la console (points 3 et 4).

## Paiement en ligne (Mollie)

- `MOLLIE_API_KEY` renseignée (`test_…` ou `live_…`) : à l'envoi d'une facture, la console crée un **lien de paiement** Mollie (montant, numéro de facture en description, retour vers la page Abonnement de l'organisation) et l'enregistre sur la facture ; la notification à la présidence porte « Payer en ligne : … » et la page **Abonnement à la plateforme** montre un bouton **Payer en ligne** tant que la facture est à payer.
- Le retour de Mollie (`POST /api/billing/mollie`, sans session) ne croit rien de l'appel : il relit le lien par l'API et, s'il est payé et la facture encore à payer, la passe à **Payée** à la date de Mollie, mention « en ligne » (`paid_via`). Un second appel ne change rien ; un lien inconnu ou mal formé est noté et ignoré ; une erreur de l'API renvoie 502 pour que Mollie réessaie. Chaque appel est consigné dans `billing_webhook`.
- Mollie injoignable à l'envoi : la facture part quand même, par virement ; le journal de la console dit `mollie: error`. Sans clé : rien ne change, les paiements se marquent à la main (mention « virement »). L'onglet Facturation dit l'état du branchement (absent, test, réel).

## Factures électroniques (UBL)

- Chaque facture envoyée, payée ou annulée se télécharge en **UBL 2.1 / Peppol BIS Billing 3.0** (`F-2026-0001.xml`) : vendeur `PFM_SELLER_*`, client (nom, numéro d'entreprise en TVA belge, adresse, pays), période, moyen de paiement 30 avec l'IBAN et le numéro en communication, TVA au taux `PFM_VAT_RATE` (21 par défaut, montant TTC ; 0 : non assujetti, catégorie O), une ligne.
- Console (onglet Facturation, lien **UBL** par facture) et page Abonnement de l'organisation (**Facture électronique (UBL)**), pour ses propres factures seulement ; jamais un brouillon.

## Migrations

`0134_billing_mollie.sql` (additive, idempotente) : `billing_invoice.mollie_link_id`, `pay_url`, `paid_via` ; table `billing_webhook`.

## Permissions

- `billing/mollie` : POST sans session (503 tant que Mollie n'est pas configuré), GET 405 ; `console/billing?ubl=` : opérateurs ; `club/billing?ubl=` : présidence de l'organisation facturée (404 pour une autre).

## Vérification

- `tests/integration/billing-mollie.integration.ts` (envoi sans Mollie, lien avec un faux Mollie, retour inconnu, non payé, payé une fois, erreur sans écriture, UBL des deux côtés et deux clubs), `tests/international-console.test.ts` (XML, TVA 21 et 0, échappement, matrice), e2e (état du branchement, téléchargement UBL de l'opérateur et de la présidence, absence du bouton en ligne sans Mollie), matrice.
