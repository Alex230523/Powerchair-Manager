# Guide du powerchair football : deux pages à lire (02/11/2026)

Deux pages communes aux clubs d'une fédération, « Le powerchair football en une page » et « Le fauteuil de match », écrites et validées par la fédération, lues par tous. Migration `0091_guide.sql` (additive).

## Rédaction par la fédération

- Qui : la présidence de la fédération, ou une personne de son équipe qui gère les notifications (la communication). Il n'existe pas de compétence « compétitions » ou « communication » séparée : c'est le droit le plus proche.
- « Ajouter les brouillons proposés » crée les deux pages en brouillon, en français, néerlandais et anglais, tirées des Lois du jeu FIPFA 2025 et du Supplément technique FIPFA 2020, avec leurs sources. Les adaptations nationales sont marquées « à confirmer par la fédération » : rien n'est montré aux clubs avant la publication.
- Chaque enregistrement crée une version (historique : numéro, auteur, date). Les lecteurs gardent la version publiée tant que la nouvelle n'est pas publiée.
- Le texte s'écrit dans un balisage simple, jamais en HTML : titres, listes, tableaux, notes, schémas.
- Publier, retirer de la publication, ouvrir une page publique (sans compte, pour les journées découverte et les nouveaux parents).
- Quand un chapitre déjà publié change, les coachs des clubs et les arbitres de la fédération sont prévenus par notification. L'application n'a pas de page « Nouveautés » : la notification en tient lieu.

## Lecture

- Page « Guide du jeu » : dans le menu du compte et dans Ctrl+K pour tous les profils. Les chapitres du rôle du lecteur d'abord, « Tout voir » pour les autres.
- Chapitre : titres courts, une idée par bloc, tableau des règles du fauteuil, date de mise à jour, sources, bouton « Imprimer » (les outils disparaissent à l'impression, une page A4 par chapitre).
- Schémas dessinés en SVG, avec titre et description pour les lecteurs d'écran et en légende : le terrain avec ses cotes (28 × 15 m, zone de but 8 × 5 m, buts de 6 m, penalty à 3,5 m), le 2 contre 1, trois dans la zone de but, le fauteuil de profil et de dessus (protections, hauteurs, ceinture, numéros). Le terrain est un composant réutilisable pour l'éditeur d'exercices.
- Note « Chez nous » : la présidence du club (ou qui gère les mandats) ajoute une courte note sous un chapitre ; seuls les membres du club la voient.
- Liens : fiche de match (« Guide du jeu », et le rappel du contrôle de vitesse au Jour J), espace arbitre (les deux pages), fiche d'un fauteuil (« Le fauteuil de match »).

## Parcours d'accueil

- Une étape « À lire » peut pointer vers un chapitre du guide : elle se coche dès que le chapitre est ouvert (la personne peut aussi la cocher elle-même).
- Les modèles proposés « Nouveau coach », « Nouvel arbitre » et « Nouveau joueur et sa famille » ont les deux pages (la seconde facultative pour la famille).

## Fauteuil « Conforme pour un match »

- Sur la fiche d'un fauteuil : les points de la page 2 (protections, hauteurs, largeur et avancée, ceinture, numéro, arêtes, vitesse contrôlée) cochés lors de l'entretien, avec la date et une remarque ; badge « Conforme » ou « À revoir » avec les points manquants ; les dix derniers contrôles sont gardés.
- Saisie par qui gère le matériel ; lecture par qui voit le fauteuil.

## Limites

- Pas de page « Nouveautés » dans l'application : seules les notifications annoncent une mise à jour.
- Un club sans fédération n'a pas de guide ; les étapes « À lire » se cochent alors à la main.

## Vérification

- `npx vitest run tests/guide.test.ts tests/onboarding.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/guide.integration.ts`, `tests/integration/onboarding.integration.ts`) :
  - brouillons réservés à la fédération, rien chez les clubs avant publication ;
  - lecteurs sur la version publiée pendant qu'une nouvelle est écrite, historique des versions ;
  - mise à jour publiée : coach et arbitre prévenus ;
  - note « Chez nous » visible du seul club ;
  - étape « À lire » cochée après lecture ;
  - page publique seulement sur demande ;
  - contrôle de conformité d'un fauteuil, refusé à un autre club et au coach.
- `tests/e2e/guide.spec.ts` à 390 px avec axe : brouillons, publication, schémas nommés, vue d'impression, note du club, fauteuil conforme.
