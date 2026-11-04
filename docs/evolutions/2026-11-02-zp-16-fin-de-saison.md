# 16. Assistant de fin de saison (02/11/2026)

« Préparer la saison suivante » : un seul endroit qui enchaîne, une fois par an et dans l'ordre, ce que le club sait déjà faire, sans rien dupliquer.

## Où

- Réglages › Saisons et équipes : « Préparer la saison suivante » (page `/club/season-plan`).
- Une carte sur l'accueil du président, à partir de 45 jours avant la fin de la saison, jusqu'au lancement.
- Réservé à la présidence du club.

## Les neuf étapes

Chaque étape est « À faire », « Fait » ou « Ignoré ». Les choix sont enregistrés étape par étape : on peut quitter l'assistant et le reprendre plus tard.

1. Bilan de la saison : joueurs, équipes, activités, cotisations encore dues, documents expirés, fauteuils à réviser, lien vers le rapport d'activité.
2. Nouvelle saison : nom et dates proposés (un an plus tard), équipes à recopier.
3. Joueurs : par équipe, la liste cochée des joueurs reconduits ; les départs prévus sont signalés, les anciens joueurs accessibles.
4. Cotisations : barèmes recopiés, montants ajustables, date d'émission automatique (l'émission A3, sur toute la saison).
5. Affiliations : les affiliations de la nouvelle période (montants prévus), une tâche chacune.
6. Rappels annuels : subsides à redemander, sponsors à renouveler, assurance du club, une tâche chacun.
7. Vérification des données (point 8) : date de lancement.
8. Email « Nouvelle saison » : objet et message proposés dans la langue du président, date d'envoi.
9. Récapitulatif : tout ce qui sera créé ou envoyé, avec les dates, puis « Lancer ».

## Lancement

- Tout de suite :
  - la saison, ses équipes et ses joueurs, par le passage de saison existant (`performRollover`, extrait de `rolloverExecute`) ;
  - les barèmes recopiés aux montants choisis ;
  - les tâches (clé `season-plan:…`, une seule fois).
- À leur date, par la tâche quotidienne `seasonPlanTick` :
  - l'émission des cotisations (`issueMany` puis `tellFamilies`) ;
  - l'ouverture de la vérification ;
  - l'envoi de l'email (un brouillon dans Communication, envoyé par `sendNewsletterNow`, extrait de l'envoi existant).
- Chaque envoi programmé peut être annulé tant qu'il n'est pas parti. Chacun laisse une trace dans le journal (`seasonPlan.*`), avec son résultat ou son échec.
- Relancer après une modification ne crée que ce qui manque : rien n'est créé deux fois.

Migration `0083_season_plan.sql` (additive) : `season_plan` et `season_plan_action`.

## Limites

- Les envois programmés sont tenus par l'assistant (avec leur journal), pas par le moteur des automatisations B7, dont les règles sont récurrentes.
- Les licences des joueurs ne sont pas renouvelées ici : l'étape 5 couvre les affiliations du club.
- L'ancienne saison n'est pas archivée par l'assistant (le passage de saison le propose toujours).

## Vérification

- `npx vitest run tests/t16-season-plan.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/t16-season-plan.integration.ts`) :
  - assistant interrompu puis repris ;
  - page périmée refusée ;
  - étape ignorée respectée ;
  - lancé deux fois sans doublon ;
  - seul le joueur gardé suit l'équipe ;
  - email annulé avant son envoi ;
  - émission et vérification faites à leur date ;
  - réservé à la présidence ;
  - deux clubs.
- `tests/e2e/season-plan.spec.ts` à 390 px avec axe : carte d'accueil, étape faite, étape ignorée retrouvée après rechargement, lancement, annulation.
