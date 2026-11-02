# Argent : fonds réservés, attestations, levée de fonds, rappels annuels (02/11/2026)

Point 9 de l'avis. Migration `0101_money_reserved_attestations.sql` (additive, idempotente).

## Partie 1 : fonds réservés

- Une affectation (`fund_allocation`) part d'un subside, d'un sponsor, d'un don, d'une collecte ou d'une autre origine : objet (matériel, salaire, formation, déplacement, autre), libellé, montant prévu, date limite, justificatif attendu.
- Les opérations du grand livre se rattachent à une affectation, à la saisie (champ « Fonds réservé ») ou après coup (onglet « Fonds réservés »). Reçu = rentrées rattachées ; dépensé = dépenses rattachées ; reste réservé = reçu moins dépensé ; « à recevoir » = prévu moins reçu, affiché à part.
- Vue d'ensemble des Finances : « Trésorerie totale », « dont réservée », « Disponible », barre empilée et sa légende en texte. Même chiffre « Disponible » sur l'accueil du président.
- Onglet « Fonds réservés » (`/funding/reserved`) : une carte par affectation, export CSV pour le rapport justificatif. Tâche dans la to-do à 60 puis 30 jours de la date limite s'il reste de l'argent, une seule fois (`allocationDeadline`).
- Le rapport financier et les comptes annuels citent les fonds affectés restants à la clôture.

## Partie 2 : attestations de mutuelle

- Réglages › Club : signataire, fonction, signature (PNG transparent téléversé ou dessinée avec le composant de signature), visibles des seuls administrateurs (présidence, gestion des mandats).
- PDF généré sans dépendance (`src/lib/pdf.ts` gagne les images, `src/lib/pdf-image.ts` décode PNG et JPEG) : logo en tête, membre, saison et période, montant et date du paiement complet, signature, nom et fonction du signataire ; pied de page avec nom, adresse, BCE et logo. Numéro unique par club (`AAAA-NNNN`).
- Page Attestations : « Aperçu » (fenêtre avec le PDF), Télécharger, Imprimer, Envoyer ; « Renvoyer » pour le club ; « Télécharger mon attestation » pour le joueur ou le parent. Journal d'envoi (`dues_attestation_send`).
- Réglages › Finances : envoi automatique dès la cotisation de la saison entièrement payée, au joueur adulte ou à ses responsables, une seule fois (index unique), PDF en pièce jointe (la file d'emails accepte désormais des pièces jointes chiffrées avec le message).
- Formulaire propre à une mutuelle : le membre dépose le formulaire vierge ; le club le voit « À compléter », joint le formulaire rempli et signé, le membre est prévenu.

## Partie 3 : levée de fonds et menu

- Menu, groupe Finances : Finances, Cotisations, Subsides & sponsors, Levée de fonds. La rangée « Rentrées » disparaît : ces pages n'ont plus que leurs propres onglets (deux niveaux au plus). La rangée des Finances gagne « Fonds réservés ».
- Levée de fonds : lien web facultatif par action, tâches données à des joueurs et des coachs (to-do centrale, catégorie Collecte de fonds, chacun coche la sienne), objectif par personne (« vendre 20 boîtes ») avec sa progression, que le joueur ou son parent met à jour.
- Subsides et sponsors : « Rappel annuel » crée une tâche qui revient chaque année à la date choisie, avec son responsable ; elle survit à la clôture du dossier, et le subside propose « Préparer l'an prochain ».

## Vérification

- `npx vitest run tests/money9.test.ts` : états d'une affectation, alertes, export, PDF et images, pas de troisième rangée d'onglets, textes fr/nl/en.
- `npm run test:integration` (`tests/integration/money9.integration.ts`) : subside affecté en partie consommé, disponible, accordé non reçu, alerte une fois ; attestation avec logo, BCE et signature, envoyée une fois au paiement complet puis renvoyée, signature refusée au coach ; tâche de collecte à deux joueurs ; rappel annuel recréé l'année suivante ; deux clubs.
- `tests/e2e/money9.spec.ts` à 390 px avec axe.
