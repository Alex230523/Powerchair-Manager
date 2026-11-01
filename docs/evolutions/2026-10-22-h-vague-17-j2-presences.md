# Vague 17, J2 : présences, une séance à la fois et statistiques par joueur (22 octobre 2026)

Revue du 21 octobre, point J2. Les règles restent les mêmes :
- clôture du registre ;
- correction tracée avec motif ;
- droits des coachs ;
- pointages hors ligne gardés sur l'appareil.

## Trois onglets
La page Présences a trois onglets :
- « Appel » : ouvert d'office pour le président et les coachs ;
- « Saison » : la grille, une colonne par séance, avec la séance ouverte en dessous (invitations, réponses, historique) ;
- « Statistiques ».

Les joueurs et les parents arrivent sur « Saison », où ils répondent comme avant. Les absences annoncées restent sous les onglets.

## Appel
L'appel porte sur la saison de la barre du haut et sur l'équipe choisie.

En-tête de la séance :
- le titre en serif, avec la date, le lieu, l'équipe et le type ;
- à droite, « Tout présent » : il marque présents tous ceux qui ne sont pas encore pointés.

Rangée « Séance » :
- les 8 dernières séances commencées, en pastilles ;
- la séance affichée est entourée en couleur principale ;
- des flèches permettent de remonter plus loin.

Une ligne par joueur invité :
- les initiales (la plateforme ne garde pas de photo de joueur) et le nom ;
- « Moyenne 83 % » sur les appels clôturés de la saison ;
- la réponse donnée à l'invitation : « A répondu : présent » en vert, « A répondu : absent » en rouge, « Pas de réponse » en neutre.

Sur chaque ligne, quatre choix : Présent, Absent, Excusé, Non pointé.
- C'est un groupe de boutons radio : les flèches choisissent.
- Le choix actif est sur fond vert, rouge ou gris foncé.
- Chaque clic est enregistré aussitôt. Le message « Annuler » (type `attendanceMark` de C10) remet la valeur d'avant, coachs compris.
- Le bouton « … » propose « En retard » et « Parti plus tôt », affichés ensuite en badge sur la ligne.
- « Clôturer l'appel » se trouve sous la liste. Après la clôture, chaque correction ouvre une fenêtre qui demande le motif.

Sur téléphone, les choix passent sous le nom et ne montrent que leurs icônes. Le mot reste le nom accessible.

## Excusé
Nouvel état « Excusé » pour une absence prévenue. Une absence annoncée (vague 8) le préremplit à l'invitation. L'annuler remet « Non pointé » tant que la séance n'a pas commencé. Il n'est pas compté comme une présence, et il est compté à part dans les statistiques.

## Statistiques
Une carte par joueur, en grille de 3, 2 ou 1 colonnes. Chaque carte montre :
- « Entraînements : 18 / 22 » et « Matchs : 6 / 7 » ;
- les excusés ;
- le pourcentage moyen en grand chiffre serif, avec une barre fine.

On peut trier par pourcentage ou par nom. La période est la saison de la barre du haut.

## Données
Migration `0056_attendance_excused.sql` : l'état `excused` et le type d'annulation `attendanceMark`. Nouvelle commande `markAll`. L'historique note `mark_all` et `undo`.

## Tests
- Unitaires (`tests/wave17-attendance.test.ts`) :
  - quatre choix ;
  - séances proposées ;
  - comptes par joueur avec Excusé à part ;
  - tri ;
  - textes en trois langues.
- Intégration à deux clubs (`tests/integration/wave17-attendance.integration.ts`) :
  - Excusé prérempli ;
  - Tout présent et clic annulés ;
  - isolement ;
  - correction après clôture avec motif ;
  - statistiques justes.
- Bout en bout (`tests/e2e/roll-call.spec.ts`) :
  - réponse affichée sur la ligne ;
  - appel au clavier ;
  - annulation, Tout présent, En retard ;
  - clôture et correction tracée ;
  - statistiques ;
  - axe et 390 px.

  `attendance.spec` passe par l'onglet « Saison » et lit les statistiques dans leur onglet.
