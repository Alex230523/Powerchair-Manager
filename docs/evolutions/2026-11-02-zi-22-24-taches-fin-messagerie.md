# 22 et 24. Tâches dans tous les menus, fin de la messagerie (02/11/2026)

## 22. « Tâches » pour toute personne qui peut en recevoir

- Joueurs et parents : « Tâches » dans « Mon espace » (`src/components/menu.ts`). Le coach, l'arbitre, le permanent et la présidence fédérale l'avaient déjà.
- Pastille sur l'entrée : nombre de tâches ouvertes données à la personne, rouge s'il y en a en retard (`GET /api/tasks?count=mine`, `myTaskCount` dans `src/domains/tasks/service.ts`).
- Barre du bas sur téléphone : dès qu'une tâche est ouverte, « Tâches » prend la place du troisième raccourci.
- Test : les pages vers lesquelles mènent les rappels (tâches, documents, cotisations, calendrier, fiche) sont dans le menu de chaque destinataire.

## 24. Messagerie retirée

- Supprimés : la page `/messages`, la route `/api/messages`, `src/domains/messages`, `messages.tsx`, ses textes, le lien de la page Documents, l'annulation « message masqué », le libellé du menu, les tests de la messagerie.
- Les conversations entre clubs sur les transferts, qui s'affichaient sur la page Messages, sont maintenant sur la page Transferts.
- Le module de droits « messages » devient « communication » (`/communication` et `/api/communication`) ; un club qui l'avait désactivé le garde désactivé (migration `0079_messaging_retired.sql`).
- Une ancienne adresse `/messages` renvoie à l'accueil avec « La messagerie a été retirée… ».
- Avant la suppression des données : la tâche quotidienne prévient une fois les présidents de chaque club qui a des échanges, avec la date (14 jours plus tard) et un lien vers le PDF de leurs échanges (`GET /api/messaging-archive`, présidence du club seulement). Table `messaging_retirement`.
- Les tables `message_thread`, `message_participant`, `internal_message` et `message_report` restent jusque-là. Une PR séparée les supprime, avec le PDF : à fusionner 14 jours après la mise en ligne de celle-ci. La migration 0080 lui est réservée.

Rien de la messagerie n'apparaissait dans l'export RGPD, la recherche Ctrl+K, les statistiques ni la démo : rien à retirer là.

## Vérification

- `npx vitest run tests/t22-24-menu-messaging.test.ts tests/wave15-undo.test.ts tests/wave15-palette.test.ts tests/wave9.test.ts`
- `npm run test:integration` (dont `tests/integration/t22-24-menu-messaging.integration.ts` : module renommé, tâches comptées, présidents prévenus une fois, PDF réservé à la présidence, deux clubs)
