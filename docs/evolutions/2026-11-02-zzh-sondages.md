# Mini-sondages du club et de la fédération (02/11/2026)

Point H3 de l'avis. Une page « Sondages » (`/sondages`) pour poser une question courte à un groupe existant, et une page publique `/sondage/[jeton]` pour répondre sans se connecter. Migration `0100_polls.sql` (additive) : `poll`, `poll_option`, `poll_recipient`, `poll_answer`.

## Types et destinataires

- Choix de dates (oui, si besoin, non pour chaque date), choix unique, choix multiple.
- Club : les joueurs d'une équipe, les parents d'une équipe, les coachs, le staff et le comité, tous les membres. Fédération : les présidents des clubs affiliés, le staff de la fédération.
- Un parent répond pour lui-même ou, si le sondage le demande, une fois par enfant. Un joueur mineur ne répond jamais à la place de son parent (il n'est pas destinataire d'un sondage aux parents).
- Peut créer : présidence, coachs, ceux qui écrivent aux membres ou planifient ; à la fédération, la compétence communication. Les destinataires d'un autre club ne sont jamais inclus ; une équipe d'un autre club est refusée.

## Répondre

- Dans l'application (« À répondre ») ou par le lien personnel de la notification : jeton aléatoire, seule son empreinte est gardée, le lien répond une seule fois. Connecté, on peut changer d'avis jusqu'à la clôture.
- Le lien ne montre que la question, les options et, pour un parent, le prénom de l'enfant concerné.

## Suivre et clore

- Résultats en direct : barres et chiffres en toutes lettres (« Samedi : 3 oui, 1 si besoin, 0 non »), option en tête signalée.
- Sondage anonyme : le créateur ne voit que les totaux, jamais un nom.
- Une seule relance, 24 heures avant la clôture, vers ceux qui n'ont pas répondu (tâche planifiée `reminders`, clé `polls`) ; à la date, le sondage se clôt.
- Clos, un sondage de dates devient l'événement (réunion à la date retenue, ceux qui ont dit oui invités) ; un choix devient une tâche dans la to-do.

## Points d'entrée

Menu (à côté des circulaires, pour tous les profils), Ctrl+K « Nouveau sondage », fiche d'équipe (équipe préremplie), page Communication (liée à l'événement en préparation via `?event=`).

## Vérification

- `npx vitest run tests/polls.test.ts` : réponses valides par type, résultats et option en tête, relance unique, textes fr/nl/en.
- `npm run test:integration` (`tests/integration/polls.integration.ts`) : sondage de dates transformé en événement, lien personnel à usage unique, anonymat côté créateur, relance unique, autre club exclu.
- `tests/e2e/polls.spec.ts` à 390 px avec axe : création, réponse par le lien, résultats, événement.
