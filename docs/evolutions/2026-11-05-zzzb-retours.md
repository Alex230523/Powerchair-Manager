# Retours du 05/11 (après-midi) : chiffre des échéances, cartes d'équipes, questions du formulaire

## Périmètre

Trois retours d'usage sur l'accueil, « Mes équipes » et l'éditeur de formulaire d'inscription.

1. **Échéances à 30 jours** : le chiffre quitte la grille « Chiffres clés » de l'accueil et se lit dans la carte « Situation financière », sous les cotisations encaissées, avec un lien vers les cotisations. Le chiffre reste dans la grille quand le module Finances est éteint (pas de carte argent).
2. **Mes équipes** : la ligne grise « catégorie · niveau » sous le nom de chaque équipe disparaît des cartes ; elle reste en surtitre de la fiche d'équipe.
3. **Questions du formulaire d'inscription** : le titre de chaque question (« Question 1 · Nom du joueur ») est désormais le bouton qui replie ou déplie la question, avec un chevron à gauche (vers la droite replié, vers le bas déplié), cible de 44 px, `aria-expanded` et `aria-controls`. Le petit bouton chevron parmi les outils disparaît (un seul contrôle). Une question repliée ne garde plus d'espace vide sous ses outils. « Tout replier / Tout déplier » inchangé.

## Migrations

Aucune.

## Permissions

Aucun changement.

## Vérification

- `tests/dashboard.test.ts`, `tests/registrations.test.ts` (inchangés, verts).
- Rendu statique à 390 px des deux cartes (question dépliée, question repliée, carte argent).
