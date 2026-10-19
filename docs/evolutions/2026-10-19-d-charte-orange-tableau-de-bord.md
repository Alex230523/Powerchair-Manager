# Charte orange, navigation et tableau de bord (19 octobre 2026)

Cette livraison ne touche pas au lot 09 (banque, QR, rapprochement) et n'ajoute aucune migration.

## Charte graphique

- Toutes les couleurs sont des variables CSS dans `src/app/globals.css` (`:root`). Changer d'orange se fait à un seul endroit.
- `--brand-500` (#f97316) sert uniquement aux éléments décoratifs (barres, indicateurs, logo).
- `--accent` / `--accent-solid` (#c2410c en clair, #fb923c en sombre) servent au texte, aux liens et aux boutons. Contrastes vérifiés : 4,9:1 minimum pour les liens, 5,2:1 pour le texte blanc des boutons, 7,7:1 en mode sombre.
- Mode sombre automatique (préférence système) et bouton soleil/lune dans la barre du haut. Le choix est mémorisé dans le navigateur (`pfm-theme`), appliqué avant l'affichage pour éviter le flash.
- Les styles globaux `header`, `nav` et `footer` ont été retirés : ils s'appliquaient à toutes les balises (par exemple aux en-têtes de jours du calendrier) et obligeaient à des corrections en cascade.
- Les étiquettes de développement « Lot 01 », « Lot 03 », « Lot 04 », « Lot 05 » ont été retirées des titres de page.

## Navigation

- `src/components/app-shell.tsx` : barre latérale sombre avec logo, icônes SVG par module (`src/components/icons.tsx`), groupes repliables, profil de l'utilisateur en pied.
- Les libellés sont centralisés dans `src/components/shell-copy.ts` (FR/NL/EN). Les libellés et la visibilité des liens sont inchangés, les tests E2E existants qui cliquent sur « Dues » ou « Cotisations » restent valables.
- Barre du haut : organisation active, rôle, sélecteur de profil, thème.
- Mobile (≤ 760 px) : bouton « Navigation » qui ouvre le menu, refermé automatiquement après navigation.

## Tableau de bord (accueil)

Visiteur non connecté : page d'accueil de présentation avec accès à l'espace.

Utilisateur connecté : `GET /api/dashboard` → `src/domains/dashboard/service.ts`.

| Bloc | Contenu | Condition |
| --- | --- | --- |
| À faire | Inscriptions à examiner | `registrations.manage` |
| | Documents à vérifier, expirés, manquants, expirant sous 30 j | gestion des documents ; pièces sensibles seulement avec `documents.sensitive` |
| | Admissions à finaliser (documents/cotisation) | gestion documents ou cotisations |
| | Registres de présence à clôturer | gestion des présences ou coach de l'équipe |
| | Mes présences à confirmer, mes documents à fournir | profils propres ou enfants représentés |
| | Mes dossiers d'inscription à compléter | candidat |
| Chiffres | Événements à 14 jours, réponses en attente, membres, joueurs, équipes, liste d'attente, acceptées 14 j, échéances à 30 jours, ma prochaine échéance | selon les mêmes droits que les modules |
| Agenda | 6 prochains événements visibles, avec « Réponse attendue » | règles de lecture du calendrier |

Principes :

- Chaque chiffre réutilise les fonctions d'autorisation du module source (`docAccess`, `canRead`, `mayRespond`, `manages`…). Le tableau de bord ne montre jamais plus que le module.
- Rien n'est stocké : les alertes disparaissent dès que leur cause est résolue.
- Lecture seule, une transaction `REPEATABLE READ READ ONLY`, sans verrou sur l'organisation : le tableau de bord ne ralentit pas les modules.
- Cotisations : seules les échéances prévues sont affichées. Aucun montant n'est présenté comme payé ou en retard tant que le lot 09 n'est pas livré.
- Les dates sont formatées à partir de l'heure serveur renvoyée (`generatedAt`).

## PWA

- `public/manifest.webmanifest`, icônes `public/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.
- `theme-color` clair/sombre déclaré dans `src/app/[locale]/layout.tsx`.
- Pas de service worker : le mode hors ligne reste au lot 11.

## Tests

- `tests/dashboard.test.ts` : tri et filtrage des tâches, formats, parité FR/NL/EN des libellés.
- `tests/integration/dashboard.integration.ts` : président, joueur, second club isolé, disparition d'une alerte résolue, absence de profil actif, session expirée.

## Vérification

Les dépendances npm n'étaient pas installables dans l'environnement de développement utilisé (registre bloqué). Ont été vérifiés : syntaxe TypeScript de tous les fichiers modifiés, un contrôle de types approché sur les nouveaux fichiers, les tests unitaires purs, les contrastes et le rendu (clair, sombre, 375 px et 320 px sans défilement horizontal) sur des maquettes statiques utilisant la feuille de style réelle.

À lancer avant validation :

```sh
npm run check
npm run db:migrate
npm run test:integration
npm run test:e2e:db
```

## Pistes suivantes

- Les vues documents, cotisations et inscriptions posent un verrou `FOR UPDATE` sur l'organisation même en lecture. C'est cohérent mais sérialise les lectures d'un même club ; à revoir si le pilote ressent des lenteurs.
- Les titres d'onglet (`metadata.title`) sont en français dans toutes les langues ; une `generateMetadata` par langue serait plus juste.
- Tâches manuelles avec responsable et échéance (module 01, exigence 04) : nécessitent une table dédiée, à cadrer avec le lot 10.
