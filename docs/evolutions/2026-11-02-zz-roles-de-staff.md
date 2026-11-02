# Rôles de staff (02/11/2026)

Point 7 de l'avis. Un rôle est un modèle de droits posé sur les droits existants (les mêmes codes que les droits délégués) : on donne un rôle à une personne, ses droits se cochent, et on peut encore l'ajuster. Il n'y a toujours qu'un seul modèle d'autorisation : les droits effectifs restent écrits dans le mandat et chaque module vérifie la même chose qu'avant. Migration `0093_staff_roles.sql` (additive).

## Les rôles

- Par club : nom et description d'une phrase (trois langues pour les rôles proposés), icône, droits, portée (toutes les équipes ou ses équipes seulement), archivé.
- Sept rôles proposés, créés pour chaque club à l'ouverture de la page, modifiables : coach principal, coach adjoint, team manager, responsable matériel, responsable transport, trésorier, secrétaire. Aucun ne coche les données de santé, les documents sensibles, l'export ni l'identité des donateurs.
- Portée « ses équipes seulement » : le calendrier, les présences et les joueurs passent par les équipes que la personne entraîne (comme pour tout coach) ; le rôle ne les donne pas pour tout le club. Les autres droits valent pour le club.

## Attribution

- Une personne (mandat de coach ou de staff) peut avoir plusieurs rôles. Droits effectifs = union des droits de ses rôles + ses ajouts − ses retraits ; une personne ajustée porte le badge « Personnalisé ».
- La grille de droits existante, enregistrée à la main, est lue comme des ajouts et des retraits par rapport aux rôles.
- Modifier un rôle utilisé : une fenêtre de confirmation liste chaque personne et les droits gagnés ou perdus ; après confirmation, tout le monde est mis à jour et chaque changement est écrit dans le journal des droits.
- Invitation : on choisit d'abord un rôle, les droits se préremplissent (toujours modifiables) ; à l'acceptation, la personne reçoit le rôle.

## Écrans

- Réglages › Membres et droits › « Rôles » : liste avec description, portée, nombre de personnes et aperçu en clair (« Peut : … »), création et modification avec la grille par module, archivage, rôles de chaque personne.
- Page des coachs (présidence et qui gère les membres) : bouton « Créer un rôle », colonnes « Rôle » (badges), « Tâches » (ouvertes / en retard ; le lien ouvre l'onglet « À faire » de la fiche) et « Formations » (nombre de formations validées ; infobulle Tip au survol et au clavier avec les titres et dates, Échap la ferme, un clic ouvre les formations de la fiche).
- La fiche d'un coach garde son onglet « À faire » pour le président ; un coach ne voit pas les colonnes des autres.

## Limites

- Les droits de la page « Rôles » restent ceux qu'on détient soi-même : on ne donne jamais plus que ce qu'on a.
- La portée « ses équipes » s'appuie sur les équipes entraînées (composition de l'équipe), pas sur une liste d'équipes choisie dans le rôle.

## Vérification

- `npx vitest run tests/staff-roles.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/staff-roles.integration.ts`, deux clubs) :
  - sept rôles par club, aucun droit sensible ;
  - rôle qui donne exactement ses droits, portée « ses équipes » sans droit sur tout le club ;
  - ajustement individuel conservé après modification du rôle, retrait confirmé puis journalisé ;
  - invitation qui apporte son rôle ;
  - colonnes réservées au président.
- `tests/e2e/staff-roles.spec.ts` à 390 px avec axe : rôle donné, confirmation, liste des coachs, infobulle au clavier.
