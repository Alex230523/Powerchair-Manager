# A6 : la page équipe comme tableau de bord (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point A6. Répondre tout de suite à « mon équipe est-elle en ordre pour samedi ? », sans ouvrir présences, cotisations, documents et matériel un par un. Aucune nouvelle donnée : tout est lu dans les modules existants.

## Décisions
- La fiche équipe (`/teams/[id]`) s'ouvre sur un onglet **Tableau de bord** ; Effectif, Staff et Réglages restent les onglets suivants.
- **Alerte en tête** : ce qui bloque, compté et cliquable (joueurs sans licence valide de la saison, documents à fournir, sans fauteuil, fauteuil en réparation, révision dépassée, cotisations en retard pour qui a un droit argent). Chaque ligne mène à la ligne du premier joueur concerné. Sans blocage : « l'équipe est en ordre ». Équipe vide : un état honnête, sans alerte.
- **Effectif** : une ligne par joueur avec ses pastilles : licence (valide, demandée, suspendue, refusée, aucune), documents, fauteuil et son état, cotisation en retard (**seulement avec un droit argent**), consignes de soin (**seulement avec le droit sensible**). Les autres profils ne reçoivent même pas ces deux informations du serveur.
- **Rendez-vous** : les cinq prochains avec le nombre de réponses aux convocations et de présents ; **résultats** : les cinq derniers matchs joués et le bilan du championnat (victoires, nuls, défaites, buts, points) ; **présence sur 30 jours**.
- **Tâches de l'équipe** (to-do A1) : celles liées à ses rendez-vous ou à ses matchs, ou confiées à son staff ou à ses joueurs. **Staff** avec e-mail et téléphone.
- **Actions rapides** selon les droits : convoquer (nouveau rendez-vous), écrire à l'équipe, émettre les cotisations de l'équipe (l'assistant A3 s'ouvre sur l'équipe, `/dues?team=`), préparer le prochain match.

## Code
- `teams/service.ts` : `teamDetail` renvoie `board` (états par joueur, rendez-vous, résultats, bilan, prochain match, tâches) et les droits `money`, `sensitive`, `issueDues`, `convene`, `write`, `matches` ; le staff reçoit ses contacts.
- Composants : `team-board.tsx` et `team-board-copy.ts` ; `teams.tsx` ajoute l'onglet ; `dues.tsx` et la page Cotisations ouvrent l'assistant sur `?team=`.

## Tests
- Intégration (`tests/integration/a6-team-board.integration.ts`) : présidente qui voit tout, coach qui ne voit ni argent ni santé, équipe vide, joueur déplacé d'équipe, deux clubs.
- Bout en bout (`tests/e2e/team-board.spec.ts`) : alerte cliquable, pastilles, actions rapides, assistant des cotisations sur l'équipe, équipe vide ; axe et 390 px. `teams.spec` et `team-places.spec` ouvrent l'onglet Effectif.
