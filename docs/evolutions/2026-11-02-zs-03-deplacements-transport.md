# 3. Déplacements : de « séjour » à logistique de transport (02/11/2026)

Le module Déplacements est repensé autour de la tournée de chaque véhicule, sans perdre les déplacements existants. Migration `0086_trip_transport.sql` (additive, idempotente).

## 1. Deux modes

- « Transport » (par défaut) : un aller-retour dans la journée.
- « Séjour » : plusieurs jours, avec hébergement, programme et budget comme avant.
- Reprise des déplacements existants : plus d'un jour devient « Séjour », sinon « Transport ». Un déplacement créé depuis l'Agenda prend le mode de ses dates.
- En mode Transport, l'hébergement est masqué (gardé) et le programme ne s'affiche que s'il a des lignes.

## 2. Rattachement

- Un déplacement sert une activité de l'Agenda, un match ou une journée de tournoi (`tournament_day`), pas le tournoi entier.
- Le choisir reprend sa date, son heure et son lieu, toujours modifiables.
- Seules les journées des tournois où le club joue (ou qu'il organise) sont proposées.
- La liste montre la journée servie, l'heure de départ et d'arrivée, le nombre de véhicules. Un clic ouvre une fenêtre de détail, avec le lien vers la fiche complète et la feuille de route.

## 3. Véhicules

Plusieurs véhicules par déplacement, chacun d'un type :

- **Véhicule du club** (flotte existante).
- **Location** :
  - loueur choisi dans le carnet de contacts, nouvelle étiquette « Loueur », créable sur place ;
  - adresse de retrait et de retour, numéro de réservation, coût prévu, caution.
- **Véhicule d'un particulier** :
  - propriétaire (membre ou contact), places, places fauteuil, rampe ;
  - option « indemnité kilométrique », au taux réglé dans Réglages › Activités › Déplacements.

Les anciens véhicules sans véhicule de la flotte deviennent des véhicules de particulier.

## 4. Tournée

- Chaque véhicule a une liste ordonnée d'étapes : retrait du véhicule, chargement du matériel, prise des passagers, trajet, arrivée, rechargement, déchargement au local, retour du véhicule, autre.
- Chaque étape porte un lieu (lieu du club ou adresse), un jour et une heure, une durée de trajet et des personnes responsables.
- Un nouveau véhicule reçoit les étapes de son type :
  - location : retrait et retour à l'agence ;
  - véhicule du club : pas d'agence ;
  - particulier : départ de chez le conducteur.
- Les heures suivent le départ et le retour du déplacement quand ils sont connus.
- Les étapes s'ajoutent, se suppriment et se réordonnent librement : glisser, ou boutons Monter et Descendre au clavier.

## 5. Chargement

- Passagers : les participants du déplacement. « Ajouter les invités de l'activité » reprend les personnes invitées à l'activité liée (joueurs, coachs, accompagnants), sauf celles qui ont répondu absent.
- Fauteuils transportés : ceux du module Matériel (du club et des joueurs).
- Autre matériel : ballons, chargeurs, batteries, trousse, chaises.
- Contrôle, avec un message clair :
  - places assises ;
  - places fauteuil : un joueur qui voyage dans son fauteuil et chaque fauteuil transporté en prennent une ;
  - rampe ou lift nécessaire dès qu'un fauteuil est à bord.

## 6. Chauffeurs

- Plusieurs chauffeurs par véhicule, chacun pour l'aller, le retour ou les deux.
- La recherche propose d'abord les personnes dont le permis déclaré ou vérifié couvre celui du véhicule (badge « Permis vérifié » d'abord), puis les autres membres, avec l'avertissement « Sans le permis … ».

## 7. Tâches

- La case « Créer les tâches » ouvre la liste des tâches tirées des étapes : réserver le véhicule (une semaine avant, pour une location), aller le chercher, charger, prendre les passagers, conduire, recharger, décharger, le rendre.
- Chaque tâche a une ou plusieurs personnes, une date et une heure, et peut être modifiée ou écartée.
- « Envoyer dans la to-do » les crée dans la to-do centrale, catégorie Sport, liées au déplacement (et au match), avec l'avis aux personnes et les rappels habituels.
- Chaque tâche n'existe qu'une fois : envoyer à nouveau la met à jour.
- Modifier une étape (jour, heure, personnes) met à jour sa tâche ; supprimer l'étape retire sa tâche si elle n'est pas faite.
- Dans la to-do, une tâche de déplacement ouvre le déplacement.

## 8. Temps de trajet

- Un lien « Itinéraire » vers Google Maps et Waze pour chaque trajet, sans clé ni coût.
- Interface `RouteEstimator`, désactivée par défaut, avec une implémentation OpenRouteService activable par la variable `OPENROUTESERVICE_API_KEY` (clé gratuite). Sans clé, la durée se saisit à la main.
- L'estimation se fait hors transaction : lecture des adresses, appel, puis écriture de la durée.

## 9. Feuille de route

- Page `/trips/[id]/roadsheet`, imprimable et lisible sur téléphone.
- Chaque chauffeur et passager voit son véhicule, ses étapes, ses heures et les téléphones utiles : chauffeurs, loueur, et propriétaire pour le chauffeur.
- Un passager ne voit que son propre nom parmi les passagers. Les chauffeurs et ceux qui préparent le déplacement voient tous les passagers.
- Les consignes de soin des passagers n'apparaissent que pour qui a le droit sensible (`people.sensitive`), et leur lecture est journalisée.

## 10. Coûts

- Location, carburant et indemnités kilométriques prévus s'affichent dans la section Transport pour ceux qui voient l'argent.
- Les dépenses réelles restent liées par `finance_transaction.trip_id`.

## 11. Ligne de match

- Le statut transport (« En ordre », « À organiser ») suit la tournée : le déplacement lié au match (ou à son activité) doit avoir au moins un véhicule, chacun avec un chauffeur et un chargement qui tient.

## Droits

- Inchangés pour préparer un déplacement (président, gestion de l'agenda ou des équipes).
- Le taux kilométrique : président ou gestion des mandats.
- Toutes les requêtes filtrent par organisation ; une personne, un fauteuil, un contact, un lieu, un match ou une journée d'un autre club est refusé.

## Limites

- L'estimation intégrée n'est branchée que si la clé est fournie ; ses quotas sont à vérifier.
- L'indemnité kilométrique se calcule sur la distance saisie ; elle n'est pas encore versée automatiquement.

## Vérification

- `npx vitest run tests/t03-trips.test.ts tests/wave7.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/t03-trips.integration.ts`) :
  - location avec retrait et retour proposés, véhicule du club sans agence ;
  - capacité fauteuil dépassée signalée, chauffeur sans le bon permis averti ;
  - tâches créées une seule fois puis mises à jour, tâche à deux personnes, étape déplacée qui déplace sa tâche ;
  - déplacement lié à une journée de tournoi ;
  - reprise des anciens déplacements (migration rejouée deux fois) ;
  - feuille de route d'un passager sans données de santé des autres ;
  - deux clubs.
- `npm run test:e2e:db` (`tests/e2e/trip-transport.spec.ts`) : 390 px, axe.
