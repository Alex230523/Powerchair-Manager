# Vague 17, N1 : finances restructurées (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point N1. Aucune règle de calcul ne change.

## Menu
Le groupe « Argent » devient « Finances » (fr), « Financiën » (nl), « Finances » (en), avec deux entrées : « Finances » et « Cotisations » (consultée souvent, gardée à part). Subsides, sponsors, levée de fonds et affiliations deviennent des onglets. Les réglages financiers restent dans Réglages › Finances (catégorie renommée elle aussi).

## Une page Finances en onglets
Chaque onglet a sa propre adresse, dans cet ordre :
1. Vue d'ensemble (`/funding`) : trésorerie, recettes et dépenses de la saison, échéances à 30 jours, recettes et dépenses par catégorie, budget et réalisé, cinq dernières opérations.
2. Opérations (`/funding/operations`) : le grand livre, avec recherche, filtres et justificatifs par ligne.
3. Budget (`/funding/budget`).
4. Rentrées : une petite rangée d'onglets Cotisations (lien vers la page Cotisations), Sponsors, Subsides, Levée de fonds.
5. Affiliations (`/funding/affiliations`, point N2).
6. Relevés de compte (`/funding/statements`).
7. Comptes annuels et rapports (`/funding/annual-accounts`, et le rapport de saison).

L'en-tête garde un seul bouton principal, « Ajouter une opération », et « … » pour exporter les opérations et ouvrir le rapport annuel.

## Ajouter, supprimer
- « Ajouter une opération » : le choix Dépense ou Recette en grand, puis date, montant, catégorie, équipe facultative, libellé, moyen de paiement, et un justificatif (photo ou PDF) joint dès la création.
- Supprimer : une corbeille sur chaque ligne, avec un motif court. Refusée si l'exercice est approuvé par l'assemblée générale. Une opération créée ailleurs (paiement de cotisation, de sponsor, affiliation en ordre) se supprime depuis son origine : un message l'explique et ouvre la bonne page. La suppression est notée dans le journal avec le montant et le motif, et « Opération supprimée · Annuler » la remet. Une opération supprimée reste en base, annulée et cachée : tous les totaux l'ignorent déjà.

## Relevés de compte
« Déposer un relevé » (PDF ou CSV, compte facultatif, mois, solde de fin de mois facultatif). Pour un CSV, le solde est lu dans la colonne « Solde », « Saldo » ou « Balance ». La liste par mois montre le solde du relevé, la trésorerie de la plateforme au dernier jour du mois et l'écart (badge vert si égal, orange sinon). Les relevés comptent dans le stockage du club. Le rapprochement automatique ligne par ligne reste au lot 09 : seul son emplacement est prévu.

## Données
Migration `0054_finance_sections.sql` (ajout seulement) : colonnes de suppression de `finance_transaction`, table `bank_statement`, vue de stockage complétée, type d'annulation `operationDelete`.

## Tests
- Unitaires : `tests/wave17-finances.test.ts` (menu en trois langues, ordre des onglets, motif obligatoire, lecture du solde CSV, types de fichiers) ; `wave14` et `wave11` suivent les noms.
- Intégration à deux clubs : `tests/integration/wave17-finances.integration.ts` (suppression tracée puis annulée, refus après approbation, opération liée, relevé CSV et écart, isolement, stockage).
- Bout en bout : `tests/e2e/finances.spec.ts` (onglets et adresses, ajout avec justificatif, suppression et annulation, refus après approbation, relevé déposé avec écart, axe, 390 px) ; `finance-dues`, `annual-accounts`, `settings`, `shell` et `new-pages` suivent les noms et les onglets.
