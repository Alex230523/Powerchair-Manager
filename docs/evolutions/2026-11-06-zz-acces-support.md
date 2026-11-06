# Console, étape 3b : accès de support (ouvrir une organisation comme son président)

Suite de `2026-11-06-mcp-console.md`, d'après la note `claude/console-gestionnaire.md` (« emprunt de contexte »).

## Ce que ça fait

- Depuis la fiche d'une organisation, un opérateur Support ou Propriétaire ouvre **un accès de support** : raison obligatoire (lue par la présidence), durée de 5 à 120 minutes (30 par défaut).
- Un **mandat de président limité dans le temps** est écrit pour l'opérateur (`role_assignment.valid_until`), avec l'adhésion correspondante. Il apparaît dans son sélecteur de contexte ; « Passer dans l'organisation » l'y place. Il voit et fait ce qu'un président voit et fait, et chaque action va dans le journal d'audit de l'organisation sous son nom.
- La présidence (hors opérateurs) est prévenue par notification (application, e-mail, téléphone) avec le nom de l'opérateur, la durée et la raison, lien vers le journal. L'ouverture et la fin sont dans le journal de l'organisation (`platform.borrow`, `platform.borrow.end`) et dans `platform_action`.
- Un mandat de support n'est jamais compté comme président de l'organisation (la règle « au moins un président » regarde les mandats sans fin), et il figure dans la liste des mandats que la présidence consulte, avec sa fin.
- « Terminer l'accès » révoque le mandat, désactive l'adhésion et ferme le contexte tout de suite ; la tâche horaire ferme de même les accès arrivés à leur heure. Un seul accès ouvert par opérateur et par organisation.

## Migrations

`0129_context_borrow.sql` (additive, idempotente).

## Permissions

Inchangées : la commande passe par `console` (opérateurs Support et Propriétaire).

## Vérification

- `tests/integration/borrow.integration.ts` (ouverture, notice à la présidence, journal, contexte, fin anticipée, fermeture par la tâche), `tests/e2e/international-console.spec.ts` (ouverture, passage dans l'organisation, fin, journal).
