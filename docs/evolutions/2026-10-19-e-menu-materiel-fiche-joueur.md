# Menu par thèmes, matériel et fiche joueur (19 octobre 2026)

## Menu

Le menu de gauche est regroupé en entrées dépliables (flèche) :

| Groupe          | Contenu                                       |
| --------------- | --------------------------------------------- |
| Joueurs         | Joueurs, Présences                            |
| Vie du club     | Calendrier, Documents, Messagerie             |
| Finance du club | Financement, Cotisations                      |
| Gestion du club | Gestion du club, Gestion des coachs, Matériel |
| Administration  | Inscriptions, Notifications, Mon espace       |

Le groupe de la page ouverte se déplie seul ; les autres restent fermés. Les statistiques ne sont plus dans le menu : un bouton « Statistiques » se trouve en haut du tableau de bord.

## Matériel (`/equipment`)

Module centré sur les fauteuils de sport (cahier des charges, module 15).

- Fiche fauteuil : nom, marque, modèle, numéro de série, propriété (club, joueur, prêt), état (disponible, en service, en maintenance, retiré), vitesse maximale, batteries, dates d'acquisition et de révision, remarques.
- Un fauteuil peut être lié à **plusieurs joueurs** (fauteuil de club partagé) et un joueur à plusieurs fauteuils. Un lien peut être marqué « fauteuil principal ». Les liens terminés restent dans l'historique.
- Alerte au-dessus de 10 km/h (limite de match FIPFA) : signalée, jamais bloquée, le fauteuil peut servir à l'entraînement.
- Rappel de révision : en retard, sous 14 jours, ou à jour. Les fauteuils à réviser apparaissent dans le « À faire » du tableau de bord.
- Droits : `equipment.manage` (nouvelle permission délégable, incluse pour le président) pour créer, modifier et lier. Un joueur ou un parent voit les fauteuils liés à son profil ou à son enfant, sans le nom des autres utilisateurs (seulement leur nombre). Un coach voit les fauteuils des joueurs de ses équipes.

## Fiche joueur (`/players/[id]`)

Accessible depuis le répertoire (« Fiche complète ») et depuis le matériel.

**Vue personnelle**

| Bloc                                                                               | Visible par                                                                                              | Modifiable par                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Informations personnelles                                                          | la personne, ses représentants, les responsables du répertoire                                           | (répertoire, inchangé)                                                             |
| Besoins et accompagnement : transferts, communication, sécurité, contact d'urgence | idem + les coachs du joueur                                                                              | `people.manage`, la personne adulte, un représentant autorisé à modifier           |
| Handicap et santé (chiffré en base)                                                | la personne, ses représentants, le personnel ayant la nouvelle habilitation explicite `people.sensitive` | la personne adulte, un représentant autorisé, `people.sensitive` + `people.manage` |
| Personnes responsables                                                             | comme les informations personnelles                                                                      | module Personnes                                                                   |
| Historique au club                                                                 | qui voit le joueur                                                                                       | affectations d'équipe                                                              |
| Présences, documents, cotisations                                                  | selon les droits de chaque module                                                                        | dans chaque module                                                                 |

**Vue sportive** : équipe, poste, numéro, classification sportive (PF1, PF2, évaluation en cours, non classé, avec date de validité), commande du fauteuil (main droite, main gauche, menton, tête, autre), notes sportives, fauteuils liés, statistiques de présence (entraînements, matchs, réponses aux convocations). Modifiable par les responsables d'équipes et les coachs du joueur.

Les statistiques de match (buts, temps de jeu) arriveront avec le module compétitions ; la fiche le dit au lieu d'afficher des chiffres inventés.

## Données

- Migrations additives : `0018_equipment.sql`, `0019_player_profiles.sql` (avec mise à jour des contraintes `grants`).
- Les notes confidentielles sont chiffrées (AES-256-GCM, clé dérivée de `BETTER_AUTH_SECRET`) et liées au joueur : elles ne peuvent pas être recopiées sur une autre fiche.
- Chaque modification est versionnée (`STALE_VERSION` en cas de conflit) et journalisée dans `audit_log` sans le contenu.

## Démo

Le club de démo contient quatre fauteuils (dont un partagé, un à réviser sous 7 jours, un en maintenance à 11 km/h), les profils sportifs des cinq joueurs, des besoins d'accompagnement et des notes confidentielles fictives pour Camille et Lucas, et un historique de séances pointées. Le compte président possède l'habilitation `people.sensitive`.

## Tests

- `tests/equipment-profile.test.ts` : révisions, vitesse, statistiques de présence, schémas, parité des traductions.
- `tests/integration/equipment-profile.integration.ts` : fauteuil partagé et historique, visibilité joueur / coach / autre club, séparation sport / accompagnement / confidentiel, chiffrement, refus sans habilitation, conflits de version.

## À valider

- Les classes PF1/PF2 et la limite de 10 km/h reprennent les règles FIPFA en vigueur ; à confirmer avec la fédération belge.
- Qui, au club, doit recevoir l'habilitation `people.sensitive` (président, référent médical) est une décision du club.
