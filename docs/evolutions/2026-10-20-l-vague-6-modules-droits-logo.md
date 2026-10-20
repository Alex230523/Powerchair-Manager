# Vague 6 : nouveau logo, modules, droits par module, journaux, recherche globale (20 octobre 2026)

Reprises de PRÊT (l'application des unités scoutes), adaptées au powerchair football.

## Nouveau logo PCM

- Le logo PCM est redessiné en vecteur (`docs/logo-pcm.svg`, `BrandLogo` dans `icons.tsx`) : les lettres prennent la couleur du texte (blanches dans la barre latérale sombre), le trait orange garde la couleur de la marque.
- Icônes de l'application régénérées : favicon, icônes PWA 192 et 512, icône masquable, icône Apple. Nom court de l'application installée : « PCM ».

## Modules activables

- Réglages, rubrique **Modules** (président) : trésorerie, cotisations, matériel, matchs, licences et calendrier fédéral, relances, messagerie, statistiques.
- Un module décoché disparaît du menu et du tableau de bord pour tout le monde, et ses routes répondent « module désactivé » (`MODULE_OFF`). **Aucune donnée n'est supprimée** : il suffit de recocher.
- Toujours actifs : accueil, joueurs, coachs, inscriptions, présences, calendrier, documents, notifications, réglages, confidentialité.

## Droits par module, sur trois niveaux

- Pour chaque personne, chaque module se règle sur **Rien**, **Lecture** ou **Modification** (là où une lecture existe), plus les options du module (export, données de santé, documents sensibles).
- Nouveau droit **« Consulter cotisations et finances »** : la trésorerie et les cotisations s'ouvrent en lecture seule, sans bouton d'écriture (vérificateur aux comptes, comité).
- Profils tout faits : coach terrain, coach principal, trésorier, secrétaire, responsable matériel, responsable soins, vérificateur aux comptes, aucun accès.
- **Profils du club** : le président crée ses propres profils (« Kiné », « Secrétaire adjoint »…), jamais au-delà de ses propres droits, et les applique en un clic.

## Journal des droits

- Réglages, rubrique **Journal des droits** (droit « Consulter le journal ») : qui a changé quels accès, quand, et ce qui a été ajouté ou retiré ; filtre par personne et par période. Modules, profils, invitations, rôles et membres y figurent aussi.

## Journal des accès aux données de santé

- Chaque lecture par un membre du staff de la fiche santé d'un joueur, des réponses confidentielles des inscriptions ou d'un document médical laisse une ligne.
- La personne elle-même et ses représentants ne sont pas tracés : ce sont leurs données.
- Le journal est réservé au président du club, filtrable par personne et par période.

## Recherche globale

- **Ctrl+K** (ou **⌘K** sur Mac), ou la loupe en haut de l'écran sur tablette et téléphone.
- Trouve les pages du menu, les joueurs et coachs, les équipes et les événements, sans tenir compte des majuscules ni des accents (« lea » trouve « Léa »).
- Chaque résultat respecte les règles de son écran : on ne trouve que ce qu'on pourrait déjà ouvrir.

## Tests

- Unitaires (`tests/wave6.test.ts`) : niveaux de droits, plafond du délégant, profils, modules et routes, recherche sans accents.
- Intégration (`tests/integration/wave6.integration.ts`) : modules coupés et rétablis, lecture seule de la trésorerie, profils du club et journal des droits, journal santé, recherche limitée à ce qu'on peut voir.
- Bout en bout : recherche Ctrl+K avec contrôle axe, module coupé absent du menu.
