# `db` : schéma PostgreSQL

`migrations/NNNN_sujet.sql` sont appliquées dans l'ordre par `npm run db:migrate` (`scripts/migrate.mjs`), chacune dans la même transaction que son enregistrement dans `schema_migrations`, avec une somme de contrôle.

Règles :

- Ne jamais modifier un fichier déjà appliqué : la migration suivante échouerait (`Migration modified`). Ajouter un nouveau fichier.
- Toute table métier porte `organization_id` et des clés étrangères composites `(id, organization_id)` pour rendre impossible le mélange de deux clubs.
- Les permissions délégables sont aussi listées dans les contraintes `CHECK` de `role_assignment.grants` et `invitation.grants` : les mettre à jour avec `src/domains/access/policy.ts`.
- Montants en centimes (`integer`), dates en `timestamptz` ou `date`.
