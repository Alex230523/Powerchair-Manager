# B1 : paiements par QR de virement et rapprochement bancaire (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B1 (lot 09, module 09 du cahier des charges). Aucun paiement en ligne : le QR prépare un virement, le relevé de la banque dit ce qui est payé.

## Décisions
- **Comptes** : plusieurs IBAN par club (contrôle par `src/lib/iban.ts`), un seul « compte des cotisations », celui que voient les familles. Un compte s'archive, il ne se supprime pas.
- **Communication structurée** belge (`+++123/4567/89012+++`, contrôle modulo 97) donnée par une séquence de la base : une par créance et une par échéance, jamais réutilisée. Elle reste la même quand l'échéancier change (gardée par rang) et d'une saison à l'autre la créance garde la sienne ; la nouvelle saison a des références nouvelles.
- **QR de virement** EPC069-12 (version 002, SEPA Credit Transfer) dessiné par `src/lib/qr.ts` : sur la fiche du joueur (lui, ses parents, le trésorier), sur une page imprimable (une échéance par QR) et, en clair, dans l'email « Cotisation émise » (`{iban}`, `{reference}`, et la communication de chaque échéance). Partout la même phrase : le QR ne confirme pas le paiement.
- **Import** lu sur l'appareil (rien ne part avant l'aperçu) : CSV et Excel de Belfius, BNP Paribas Fortis, ING et KBC (banque reconnue à ses en-têtes, colonnes devinées puis retenues par banque), CODA (Febelfin) et camt.053. Aperçu : nouvelles lignes, déjà importées, rangées toutes seules. Empreinte (compte, date, montant, contrepartie, communication, référence de la banque) unique par club : réimporter le même relevé ne crée rien.
- **Rapprochement automatique** seulement si la communication structurée correspond exactement à une créance ouverte (ou à une de ses échéances) et que le montant ne dépasse pas le restant dû. Sinon, **suggestions classées** (référence, montant égal au restant ou à une échéance, nom de la contrepartie proche de la personne ou d'un parent) qu'une personne confirme.
- **Répartition** : un mouvement peut payer plusieurs créances (fratrie), une créance ne reçoit jamais plus que son restant ; le surplus va en **crédit** pour la famille, utilisé ensuite pour une cotisation ou **remboursé** (date, motif). Un mouvement peut aussi aller à une cagnotte, un sponsor (date de paiement), une tranche de subside accordé ou une autre recette ou dépense.
- **Une écriture par part** dans les finances du club, liée au mouvement (`finance_transaction.bank_line_id`), jamais en double. **Annuler** un rapprochement demande un motif et annule l'écriture (et le don, la tranche ou le paiement du sponsor) ; l'historique de la cotisation et le journal d'audit gardent la trace. Un mouvement s'ignore (frais, virement interne) et se reprend.
- **Répercussions** : tout ce qui lisait déjà les paiements de la créance (page Cotisations, CollectionBar, accueil, relances qui s'arrêtent quand le restant est nul, attestations de mutuelle limitées au payé, résumé hebdomadaire, statistiques) voit les paiements rapprochés sans autre changement.
- **Droits** : import et rapprochement avec `dues.manage` ; `dues.read` voit. Un parent ne voit que les créances de ses enfants et leur QR (règles de la fiche joueur). Chaque requête nomme le club.

## Écran
Finances › Relevés de compte, sous les relevés mensuels : comptes bancaires, « Importer un relevé » (fichier, colonnes, aperçu, import), « À rapprocher » (propositions, Affecter…, Ignorer), crédits des familles (Utiliser, Rembourser), rapprochés et ignorés (Annuler avec motif), derniers imports. Fiche joueur : « Payer par virement » avec le QR de la prochaine échéance, « Copier la communication » et « Imprimer ».

## Code
- Migration `0069` : `bank_account`, séquence `payment_reference_seq` et fonction `payment_reference()`, colonne `reference` sur les créances et les échéances, `bank_import`, `bank_line` (empreinte unique par club), `bank_allocation`, `finance_transaction.bank_line_id` et `credit_profile_id`, `bank_mapping`.
- `src/domains/bank/` : `reference.ts` (modulo 97, EPC), `parse.ts` (CSV/XLSX, CODA, camt.053), `match.ts` (suggestions, répartition), `samples.ts` (relevés d'exemple par format), `schema.ts`, `service.ts` ; route `/api/bank` (module Finances).
- Composants : `bank-reconcile.tsx`, `transfer-qr.tsx`, `payment-sheet.tsx` (page `/[locale]/players/[id]/payment/[receivable]`), textes dans `bank-copy.ts`.
- `dues/core.ts` garde la communication de chaque échéance quand l'échéancier change ; `dues/issue.ts` ajoute le compte et les communications à l'email.

## Données de démonstration
Le club démo a son compte des cotisations et un relevé de chaque format : CSV Belfius (une échéance rangée toute seule, une dépense), Excel KBC (un virement « Famille … » sans référence, à rapprocher depuis sa proposition), CODA (une échéance rangée toute seule) et camt.053 (un don à affecter).

## Limites connues
- Pas de connexion directe à la banque (PSD2) : le relevé est exporté par le trésorier.
- Les CSV d'autres banques passent par le choix des colonnes ; un relevé compte au plus 5000 lignes par import.

## Tests
- Unitaires (`tests/b1-bank.test.ts`) : modulo 97 et recherche de la référence, charge utile EPC lisible par le QR, montants à la belge, CSV et Excel des quatre banques, CODA et camt.053, lignes incomplètes, suggestions et répartition, commandes, textes dans les trois langues.
- Intégration (`tests/integration/b1-bank.integration.ts`) : 250 € en 4 échéances de 62,50 € (une seule créance, cinq références), IBAN, rapprochement automatique et paiement incomplet, double import du même relevé, paiement sans référence et fratrie, dépense, trop-perçu puis crédit utilisé et remboursé, annulation motivée, passage de saison, deux clubs isolés, droits (coach, parent).
- Bout en bout (`tests/e2e/bank.spec.ts`) : compte, import camt.053 avec aperçu, réimport sans effet, rapprochement depuis la proposition, QR sur la fiche ; axe et 390 px.
