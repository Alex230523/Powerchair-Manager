# Vague 15, observation C12 : comptes annuels générés depuis la plateforme (21 octobre 2026)

Migration `0036_annual_accounts.sql` (ajouts seulement) : `organization.fiscal_year_start`, tables `accounts_mapping` et `annual_accounts`.

Précaution reprise de la revue : la plateforme prépare un **projet** de comptes d'une petite ASBL en comptabilité simplifiée (état des recettes et des dépenses, état du patrimoine) ; le modèle doit être relu une fois par le trésorier ou un comptable, et le document reste un projet jusqu'à l'approbation par l'assemblée générale. Le bandeau de la page le rappelle en permanence.

## Exercice comptable

Réglages > Argent : « Début de l'exercice comptable », 1er janvier (défaut) ou 1er juillet comme la saison. Le rapport financier garde la saison ; les comptes annuels suivent l'exercice.

## Page « Comptes annuels » (`/funding/annual-accounts`)

Bouton dans l'en-tête de Finance du club. Droit Argent en lecture pour voir, en gestion pour compléter, vérifier, approuver et déposer. Le dernier exercice clos s'ouvre par défaut ; un menu choisit les autres.

- **État des recettes et des dépenses** : les catégories du grand livre regroupées dans les rubriques du schéma légal (recettes : cotisations, dons et legs, subsides, marchandises, autres ; dépenses : marchandises, rémunérations, services et biens divers, autres), avec l'exercice précédent dans une colonne à côté. Les opérations annulées ne comptent pas.
- **Correspondance des catégories** : chaque catégorie (recette ou dépense) va dans une rubrique ; valeurs par défaut fournies (dons et sponsors en « Dons et legs », salle, déplacements, compétitions et assurances en « Services et biens divers »…), réglables par le club.
- **État du patrimoine** au dernier jour : trésorerie (solde du grand livre), créances de cotisations (émises et non payées à la clôture), subsides accordés non versés, matériel (valeur d'achat des fauteuils de C2) ; les lignes que la plateforme ne connaît pas (compte d'épargne, facture à payer, avance) se saisissent à la main, côté avoir ou dette, avec un commentaire.
- **Droits et engagements importants** : texte libre, avec des suggestions (fauteuil prêté au club, convention de sponsoring qui court après la clôture, de C1).
- **Contrôles** en Badge : recettes moins dépenses égalent la variation de trésorerie ; aucune opération laissée en « Autre » ; aucune opération datée après aujourd'hui ; soldes d'ouverture égaux aux soldes de clôture de l'exercice précédent approuvé (« sans objet » s'il n'y en a pas).
- **Statuts** : Projet, Vérifié (nom et date), Approuvé par l'AG (date de l'assemblée, pas avant la clôture), Déposé (date). À l'approbation, les chiffres, les lignes manuelles et les engagements sont figés dans une copie ; une correction crée une nouvelle version (l'ancienne reste dans l'historique). Une version vérifiée peut revenir au projet.
- **Échéances** : assemblée générale au plus tard six mois après la clôture, dépôt au greffe trente jours après l'approbation. Elles s'affichent sur la page, dans la couche « Échéances » du calendrier (et son abonnement ICS, libellé en français faute de langue dans le flux), et dans « Prochains événements » de l'accueil des personnes qui ont le droit Argent.
- **Exports** : impression ou PDF (en-tête avec logo, nom, numéro d'entreprise et siège du club, exercice ; cadres de signature du conseil d'administration ; les commandes ne s'impriment pas) et Excel pour le comptable (les deux états, les engagements, les contrôles, puis le grand livre de l'exercice en annexe, sur une feuille).

## Tests

- Unitaires (`tests/wave15-accounts.test.ts`) : exercice au 1er janvier et au 1er juillet, exercice précédent, six mois et trente jours, rubriques par défaut, totaux avec la correspondance du club, contrôles, textes fr/nl/en.
- Intégration (`tests/integration/wave15-accounts.integration.ts`, deux clubs) : totaux égaux au grand livre de l'exercice, opération annulée et autre club exclus, avoirs (trésorerie, subside, matériel), correspondance et début d'exercice propres au club, lecture seule avec le droit en lecture et refus sans droit, ordre des statuts, version approuvée figée et non modifiable, correction en version 2, échéance de l'assemblée dans la couche.
- Bout en bout (`tests/e2e/annual-accounts.spec.ts`) : du bouton de Finance au projet, ligne saisie à la main, vérification puis approbation et version figée, export Excel, impression avec en-tête et signatures, exercice dans Réglages > Argent, 390 px, axe.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
