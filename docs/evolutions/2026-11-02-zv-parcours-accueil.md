# Parcours d'accueil personnalisables (02/11/2026)

Un parcours est une liste d'étapes donnée à un nouveau venu selon son rôle : le club la crée pour ses coachs, joueurs et parents ; la fédération pour ses arbitres et son équipe. Chaque étape réutilise une brique existante. Migration `0089_onboarding.sql` (additive).

Un parcours ne donne jamais de droits : il n'utilise que ce que le rôle de la personne permet déjà.

## Types d'étapes

| Type | Exemple | Terminée quand |
| --- | --- | --- |
| Message | Mot du président | « J'ai lu » |
| À lire | Règlement des arbitres | « J'ai lu » |
| À signer | Charte du club | Signé (nom et horodatage) |
| Profil | Téléphone, date de naissance, permis, photo, disponibilités d'arbitre | Le champ est rempli |
| Document | Certificat de bonne vie et mœurs | Document déposé (il est demandé sur la fiche à l'arrivée) |
| Formation | Formation de coach ou d'arbitre | « Demande de validation envoyée » |
| Tâche | Observer un entraînement | La tâche de la to-do est cochée |
| Rencontre | Café avec le président | Cochée par les deux personnes dans leur to-do |
| Visite guidée | Découvrir l'espace coach | Visite terminée |

## Modèles

- Modèle : nom, public (coachs, joueurs, parents ; arbitres, équipe fédérale), démarrage (à l'acceptation de l'invitation ou à la main), étapes ordonnées avec leur texte en français, néerlandais et anglais, contenu lié, délai en jours après l'arrivée, obligatoire ou facultative, personne côté club pour une rencontre.
- Modèles proposés, modifiables une fois ajoutés : « Nouveau coach » et « Nouveau joueur et sa famille » (club), « Nouvel arbitre » (fédération).
- Modifier, archiver, réactiver ; l'éditeur change le texte dans la langue de la page et garde les autres.

## Assignation et suivi

- Une personne qui accepte une invitation dans le rôle visé reçoit le parcours, avec ses échéances calculées depuis son arrivée. Tâches et rencontres partent dans la to-do (la rencontre dans celle des deux personnes, chacune coche sa part).
- Les étapes se cochent seules quand leur brique est faite ; la vérification tourne à l'ouverture de l'accueil et chaque jour.
- Côté nouveau venu : carte « Bienvenue » en tête de l'accueil, avec la barre de progression, la prochaine étape et toutes les étapes (ce qu'il faut faire et où), jusqu'à la fin du parcours. Rappel doux par email pour les étapes obligatoires en retard, au plus une fois par semaine.
- Côté club ou fédération : Réglages › Membres et droits › « Parcours d'accueil » : les modèles, le suivi (qui en est où, étapes en retard, parcours terminés), « Relancer les retards », « Lancer un parcours » à la main, une étape marquée faite par le club, un parcours arrêté.
- La présidence d'une fédération voit maintenant la catégorie Membres et droits.

## Visite guidée

La visite guidée devient un type d'étape ; elle a maintenant ses textes pour le joueur et pour l'arbitre (quatre étapes chacun), en trois langues.

## Limites

- La signature d'une charte est une signature électronique simple (nom et horodatage).
- Une étape « document » n'est demandée sur la fiche que si le club a une saison en cours ; sinon elle se marque à la main.

## Vérification

- `npx vitest run tests/onboarding.test.ts tests/wave15-settings.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/onboarding.integration.ts`) :
  - coach invité qui reçoit le parcours du club à l'acceptation ;
  - arbitre qui reçoit celui de la fédération ;
  - étape cochée seule après le dépôt du document ;
  - rencontre dans la to-do des deux personnes ;
  - rappel d'une étape en retard ;
  - suivi côté club ;
  - parcours d'un autre club invisible.
- `npm run test:e2e:db` (`tests/e2e/onboarding.spec.ts`) : 390 px, axe.
