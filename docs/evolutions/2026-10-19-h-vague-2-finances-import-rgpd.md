# Vague 2 : finances, import enrichi, doublons et RGPD (19 octobre 2026)

## Finances (`/funding`)

- **Paiement de cotisation** : en saisissant une recette, on peut choisir la cotisation d'un joueur. La ligne est enregistrée en « Cotisations » et liée à sa créance ; les relances ne réclament plus le montant payé (les échéances les plus anciennes sont soldées en premier). Le cadre « Cotisations prévues » indique ce qui est déjà encaissé. Le lot 09 (banque) pourra créer ces mêmes lignes automatiquement.
- **Justificatifs** : chaque opération peut recevoir une facture ou un ticket (PDF, PNG, JPEG ou WebP, 5 Mo, signature du fichier vérifiée), ouvert dans un onglet isolé, retirable.
- **Budget de la saison** : montants prévus par catégorie (recettes et dépenses), comparés au réel avec l'écart (positif = favorable au club) et le pourcentage utilisé.
- **Rapport annuel** (`/funding/report?season=2026-27`) : soldes d'ouverture et de clôture, recettes et dépenses, budget, détail des opérations. Bouton « Imprimer ou enregistrer en PDF » (mise en page d'impression dédiée) et export CSV pour le comptable (cellules commençant par =, +, -, @ neutralisées).

## Import Excel enrichi

- Colonne **Équipe** par ligne (nom de l'équipe, majuscules et accents tolérés) ; une équipe inconnue reçoit l'équipe choisie dans la fenêtre et le nombre est signalé.
- Colonnes **Parent**, **Email parent**, **Téléphone parent** : le représentant est créé (ou retrouvé par son nom) et lié au joueur comme contact déclaré, sans aucun accès tant que le club ne vérifie pas la relation.
- **Import de coachs** depuis la page Gestion des coachs.
- Le modèle CSV téléchargeable contient ces nouvelles colonnes.

## Données personnelles (`/privacy`, menu Administration)

Réservé à `people.manage` avec double authentification.

- **Doublons** : fiches au même nom (accents ignorés, dates de naissance compatibles) ou au même e-mail. La fusion déplace équipes, familles, documents, présences, convocations, cotisations, fauteuils, formations, inscriptions et relances ; complète les champs vides ; fait suivre le compte de connexion ; ré-chiffre les notes de santé pour la fiche gardée. Refus si les deux fiches ont un compte, des dates de naissance différentes, un transfert en cours ou deux cotisations ouvertes de même catégorie.
- **Droit d'accès** : export JSON de tout ce que le club conserve sur une personne (notes de santé déchiffrées seulement avec l'habilitation données sensibles).
- **Anonymisation** : nom, naissance, coordonnées, notes de santé, contenus des documents et réponses d'inscription effacés ; statistiques conservées sans nom. Confirmation par le nom retapé ; refusée tant que la personne a un compte actif.
- **Conservation** : durées réglables (anciens membres, défaut 5 ans ; candidatures refusées ou retirées, défaut 12 mois). La page liste ce qui dépasse ces durées et anonymise les candidatures en un clic. Le traitement reste déclenché par une personne, jamais en silence.
- Journal des actions (export, fusion, anonymisation, purge).

## Données

Migration `0022_finance_budget_privacy.sql` : lien opération → cotisation, justificatifs, budget, fusion et anonymisation des fiches, règles de conservation, journal.

## Démo

Camille a payé sa première échéance (liée au grand livre), un budget de saison est saisi, et une fiche « Yanis El Amrani » en double permet d'essayer la fusion.

## Tests

- `tests/wave2.test.ts` : budget, signatures de fichiers, saisons, paiements et relances, doublons, import (équipe, parent, coachs), traductions.
- `tests/integration/wave2.integration.ts` : paiement de cotisation et relances, budget et rapport, justificatifs, import enrichi, fusion avec ré-chiffrement, export, anonymisation et purge.
