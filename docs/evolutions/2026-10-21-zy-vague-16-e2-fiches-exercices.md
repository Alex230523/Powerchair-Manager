# Vague 16, E2 : bibliothèque de fiches exercices (21 octobre 2026)

Revue du 21 octobre au soir : une vraie bibliothèque d'exercices pour les coachs, réutilisable d'un entraînement à l'autre.

## Données
Migration additive `0049_exercises.sql` :
- `exercise` : titre, objectif (technique, tactique, conduite du fauteuil, échauffement, jeu, autre), déroulé, consignes de sécurité, durée, joueurs minimum et maximum, niveau (débutant, intermédiaire, confirmé), adapté à PF1, PF2 ou les deux, matériel, variantes, lien vidéo (https), étiquettes, auteur, partagée ou privée, archivée.
- `exercise_diagram` : le schéma (PNG, JPEG, WebP ou PDF, 2 Mo maximum, signature du fichier vérifiée), à part pour garder les listes légères.
- `calendar_event_exercise` : le programme d'un entraînement (ordre, durée prévue, notes du coach).

## Page « Fiches exercices » (`/[locale]/exercises`, menu Équipes)
- En-tête avec « Nouvelle fiche » ; filtres : recherche, objectif, niveau, PF1 ou PF2, durée, étiquette, « Mes fiches », fiches archivées.
- Grille de cartes : schéma en vignette (ou pictogramme), titre en serif, durée, joueurs, niveau et PF1/PF2 en badges, objectif, « Utilisée dans 6 entraînements ».
- La fiche (`/[locale]/exercises/[id]`) : tout le contenu, les entraînements où elle a servi, Modifier, Dupliquer (schéma compris), Imprimer (A4 propre, sans menus), Archiver ou Restaurer.

## Dans l'entraînement
- Formulaire d'un événement de famille entraînement : section « Fiches exercices » (choix dans la bibliothèque, ordre, durée prévue, notes du coach, durée totale).
- Fiche de l'événement : « Programme » dans l'ordre avec la durée totale et « Imprimer le programme » (toutes les fiches de la séance, une par page). Les joueurs voient le titre et la durée, pas les notes du coach.
- Une fiche archivée reste dans les anciens entraînements mais ne s'ajoute plus aux nouveaux.

## Droits
Lecture : président, coachs et personnes avec le droit calendrier. Création et modification : président et personnes avec le droit calendrier. Une fiche privée n'est visible que par son auteur. Toute requête filtre par club.

## Tests
- Unitaires : `tests/wave16-exercises.test.ts` ; `tests/wave14.test.ts` place « Fiches exercices » après Présences.
- Intégration à deux clubs : `tests/integration/wave16-exercises.integration.ts` (droits, fiche privée, autre club, schéma vérifié, duplication, programme vu par le staff et par un joueur, impression refusée au joueur, fiche archivée).
- Bout en bout : `tests/e2e/exercises.spec.ts` (fiche avec schéma, bibliothèque à 390 px, fiche, programme et impression, axe).
