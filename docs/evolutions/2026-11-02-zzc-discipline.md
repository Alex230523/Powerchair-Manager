# Discipline et suspensions (02/11/2026)

Point 34 de l'avis. Un carton n'est plus sans suite : les rapports d'arbitre validés et les résultats de tournoi validés alimentent la discipline de la fédération, et un joueur suspendu ne peut plus être aligné. Migration `0096_discipline.sql` (additive).

## Règles

- Par fédération et par saison, versionnées : chaque enregistrement ajoute une version, une saison passée garde les siennes.
- Réglages : nombre de jaunes qui déclenche une suspension, matchs de suspension pour ce cumul et pour un rouge, compétitions concernées (championnat, coupe, tournoi, amical), remise à zéro des cumuls (à chaque saison ou jamais), amendes facultatives au club pour un cumul et pour un rouge, délai de recours.
- Sans règle enregistrée : trois jaunes pour un match, un rouge pour un match, championnat, coupe et tournoi, recours sous 7 jours.

## Calcul et décision

- Chaque carton d'un rapport validé (point 25) ou d'un résultat de tournoi validé est compté une fois, sous les règles de la saison du match.
- Un rouge, ou un jaune qui complète une série, propose une sanction. La fédération (ou un délégué « discipline ») la confirme, la confirme avec d'autres valeurs (motif obligatoire) ou l'annule (motif obligatoire).
- Décision manuelle : incident grave, sanction d'un coach ou du club.

## Notifications et recours

- À la décision : la présidence du club, le joueur ou ses parents, et ses coachs reçoivent la décision, avec la date limite du recours.
- La présidence du club introduit un recours (motif, pièce PDF, PNG ou JPEG) depuis la page « Discipline » du club. La fédération l'accepte (la sanction et l'amende non payée sont annulées) ou le rejette avec un motif ; le club est prévenu.

## Effet

- Un joueur suspendu est bloqué à la composition du match (« suspendu, encore N match(s) ») et ne peut pas figurer dans les chiffres d'un résultat de tournoi.
- La suspension se décompte à chaque match joué par son équipe dans les compétitions concernées, matchs de tournoi du club compris.

## Amendes

- Une amende crée une somme due par le club à sa fédération, visible des deux côtés, et une tâche « Payer l'amende » pour la présidence. Le club la marque payée (date) ; la tâche se ferme seule.

## Tableau fédéral et historique

- Page « Discipline » de la fédération : sanctions à décider, suspensions en cours, joueurs à un carton du seuil, recours ouverts, amendes, décision manuelle, règles et leurs versions.
- L'accueil fédéral compte les sanctions à décider et les recours ouverts.
- Fiche joueur : l'historique disciplinaire (cartons par saison, sanctions) est visible de la présidence et des coachs de son club, et de sa fédération. Ni le joueur, ni un autre club ne le voient.

## Droits

- Bureau fédéral : compétence `federation.discipline`.
- Page du club : présidence et coachs ; recours et paiement par la présidence.

## Limites

- Une amende n'entre pas encore dans les finances de la fédération (point 35).
- La suspension d'un coach ou du club est enregistrée, notifiée et décomptée, mais ne bloque rien : il n'existe pas de composition de staff.
- Les cartons notés par le club en mode bord de terrain ne comptent pas : seul le rapport de l'arbitre validé fait foi (et le résultat validé d'un tournoi).

## Vérification

- `npx vitest run tests/discipline.test.ts tests/wave14.test.ts`
- `npm run test:integration` (`tests/integration/discipline.integration.ts`, deux fédérations) :
  - règles d'une ancienne saison inchangées ;
  - cumul de jaunes qui déclenche la suspension, compté une seule fois ;
  - rouge direct, joueur bloqué à la composition puis débloqué après deux matchs de son équipe ;
  - recours accepté qui annule la sanction et l'amende ;
  - amende payée, tâche fermée ;
  - sanction d'un coach, historique visible du club et de la fédération seulement ;
  - autre fédération isolée.
- `tests/e2e/discipline.spec.ts` à 390 px avec axe.
