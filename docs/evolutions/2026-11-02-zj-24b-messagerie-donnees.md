# 24 (suite). Suppression des données de la messagerie

**À fusionner seulement 14 jours après la mise en ligne de la PR 22 et 24**, quand chaque club a été prévenu et a pu télécharger ses échanges (table `messaging_retirement`, colonne `delete_after`).

- Migration `0080_messaging_dropped.sql` : supprime `message_report`, `internal_message`, `message_participant`, `message_thread` et `messaging_retirement`.
- Retire le PDF des anciens échanges (`/api/messaging-archive`) et l'avis aux présidents de la tâche quotidienne.

Avant de fusionner, sur la base de production : `SELECT max(delete_after) FROM messaging_retirement;` doit être une date passée.

## Vérification

- `npx vitest run tests/t22-24-menu-messaging.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/t22-24-menu-messaging.integration.ts` : tables supprimées)
