# Vingt améliorations après les retours du 04/11/2026

Liste proposée au propriétaire puis acceptée en entier. Chaque point, ce qui a été fait, et ce qui reste.

## Corrections (points 1 à 5)
1. **Exemples des champs traduits** : les exemples écrits en dur en français (véhicule, déplacement, consignes de soin, profils) passent par les textes fr/nl/en ; un tiret long retiré d'un exemple. Un test refuse désormais tout exemple en dur.
2. **Bulle grise** (`HoverBubble`) : placée contre la fenêtre, elle n'est plus coupée par un tableau qui défile ; Échap, la sortie de la souris ou le défilement la ferment (WCAG 1.4.13).
3. **Score lisible sans couleur** : ▲ gagné, ▼ perdu, = nul, à côté de la couleur (WCAG 1.4.1).
4. **Erreur d'hydratation de l'accueil (#418)** : cherchée à nouveau (préférences, portée, aperçu des invités), cause toujours pas trouvée ; l'exception temporaire de l'audit reste.
5. **Périodes de transfert annuelles** : case « Les mêmes périodes chaque année » (seuls le jour et le mois comptent, y compris à cheval sur le nouvel an) ; le règlement BPCF la coche. Migration 0117.

## Transferts et fédération, règlement BPCF (points 6 à 11)
6. **Indemnité de formation proposée** : la fédération précise le format de chaque club (académie, élite, élite avec entraîneurs diplômés) dans l'onglet Clubs ; la demande de transfert propose saisons jouées × 50, 125 ou 250 €, 500 € au plus.
7. **Type de transfert** : consenti, libre ou force majeure, enregistré à la fin. Une demande pour force majeure (avec sa raison) passe même hors période ; refusée par le club, la fédération peut la valider.
8. **Preuve de paiement** : le club entrant dépose la preuve (PDF ou image, 6 Mo) ; la fédération confirme ; d'ici là, le joueur est bloqué sur la feuille de match (« indemnité de transfert pas encore confirmée »). Route `GET /api/transfers/proof` (les deux clubs et la fédération).
9. **Participation BPCF** : modèle prêt (80 € par joueur, ouverte le 1er septembre, due le 30 septembre), alerte au-delà de 80 € par joueur, et rappel aux présidents une semaine avant chaque échéance.
10. **Amendes** : la fédération donne une amende (retard 25 €, forfait 50 €, journée annulée jusqu'à 500 €, autre), la marque payée ou l'annule ; le club voit les siennes sur sa page Affiliations. Route `/api/fines`.
11. **Transferts internationaux** : la fédération enregistre le départ vers un club étranger ; l'indemnité est calculée (500, 750 ou 1 000 € par année, 250 € de dossier, 3 000 € au plus) et suivie (à recevoir, reçue). Migration 0118.

## Clubs (points 12 à 15)
12. **Fiches envoyées** : la fiche dit à quels clubs elle est partie et leur réponse ; ses étiquettes suivent.
13. **Notifications** (application, mail, téléphone selon les choix de chacun) : fiche reçue (présidence), réponse (expéditeur), composition dévoilée (joueurs et parents, une fois, par la tâche de cinq minutes). Migration 0119.
14. **Corners dans les statistiques** : corners pour et contre dans le bilan par équipe.
15. **Permis** : « Vérifié par le club » et « Jeune conducteur » (moins de deux ans) sur la liste des conducteurs et la fiche du coach.

## Affichage (points 16 à 20)
16. **Fenêtres** : formulaires à 640 px au plus, titre qui reste en haut, boutons en bas à droite.
17. **Listes en cartes** sous 600 px (toutes les listes `DataGrid`) : le nom de la ligne en haut, chaque valeur avec le nom de sa colonne, les tris en boutons ; rôles de tableau explicites pour les lecteurs d'écran.
18. **Bulles au toucher** : sur un écran tactile, le contenu s'affiche sous l'élément au lieu d'une bulle.
19. **Pages vides** : bouton pour commencer sur les fiches, déplacements, matchs, contacts et tâches.
20. **Mode sombre** : bulles, score, cartes et amendes vérifiés en clair et en sombre.

## Corrections de la suite de tests (#129 à #131)
Test du budget d'envoi (le résumé hebdomadaire peut ajouter un mail), accueil du président (ligne « À jour »), cases à cocher revenues à 24 px (cible tactile), tâche faite lisible (plus d'opacité), aperçu des invités seulement quand un coach a choisi l'équipe.

## Permissions
Amendes : la fédération (licences) écrit, la fédération (finances) lit, le club (présidence ou cotisations) lit les siennes. Preuve de paiement : club entrant ; confirmation : fédération. Format et transferts internationaux : fédération.

## Vérification
- `tsx tests/ameliorations-20.test.ts`, `tsx tests/wave17-transfers.test.ts`, `tsx tests/access-matrix.test.ts`
- Intégration : `fines`, `wave17-transfers`, `wave17-affiliations`, `exercises4`, `a5-match-journey`, `wave16-game`, `wave7`, `b7-automations`
- `playwright test tests/e2e/ameliorations-20.spec.ts` (axe, 390 px)
