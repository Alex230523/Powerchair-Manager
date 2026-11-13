# Réactivité : moins d'attente, moins d'actualisations

Retour du 13/11/2026 : « la plateforme répond mal en général, pas mal d'actualisations pour que ça apparaisse bien, pas très réactive », et une photo de la page Coachs où la loupe de « Rechercher un nom » passait sur le texte.

## La loupe sur le texte

La règle « un seul aspect pour tous les champs » (04/11/2026) était plus précise que celle des champs de recherche (12/11/2026) : elle gagnait sur la marge intérieure, la loupe restait et recouvrait le texte. La règle des champs de recherche passe maintenant devant ; les menus à côté reprennent aussi leur forme arrondie.

## Ce qui ralentissait

- **À chaque page**, le menu relisait l'espace de travail complet (membres, invitations et journal compris), le tableau de bord entier (pour les pastilles du menu), la cloche, les nouveautés et le compteur de tâches : cinq lectures avant même celles de la page. L'accueil relisait en plus le tableau de bord pour lui-même, et encore une fois pour la semaine affichée.
- **Deux écrans** (équipes nationales, progression d'un joueur) relisaient leurs données en boucle, sans fin, tant que la page était ouverte.
- **Après une action**, seule la carte concernée se mettait à jour : la pastille du menu, les autres cartes de l'accueil, la cloche gardaient l'ancien chiffre jusqu'à un changement de page ou une actualisation.

## Ce qui change

- Le menu lit une version courte de l'espace de travail (`/api/workspace?brief=1`, sans les membres, invitations et journal des réglages), une fois, partagée entre les pages.
- Les compteurs du menu (pastilles, cloche, nouveautés, tâches) sont gardés une minute d'une page à l'autre, et relus après chaque changement ou au retour sur l'onglet.
- L'accueil et le menu partagent la même lecture du tableau de bord ; la semaine de l'accueil ne lit plus que la semaine (`/api/dashboard?week=…&only=week`).
- Après toute action réussie (enregistrer, cocher, répondre, déplacer…), un signal `pfm-changed` relit les compteurs du menu, l'accueil et les autres vues ouvertes de la page. Plus besoin d'actualiser pour voir le bon chiffre.
- Les lectures en boucle sont corrigées pour tous les écrans (`useData`).

## Ce qui reste hors du code

Sur l'aperçu, la base Neon se met en veille après quelques minutes sans visite, et les fonctions Vercel aussi : la première page après une pause attend leur réveil (une à deux secondes). En production, une base sans mise en veille règle ce point.

## Tests

- `tests/shared-fetch.test.ts` : une seule lecture tant qu'elle est fraîche, relue après un changement, un signal pour une rafale, pas de signal pour une lecture de nouveauté ; le menu lit la version courte ; pas de lecture en boucle.
- `tests/search-field.test.ts` : la règle des champs de recherche passe devant.
- `tests/integration/home.integration.ts` : la semaine seule donne les mêmes événements, sous les mêmes règles, que le tableau de bord complet.
