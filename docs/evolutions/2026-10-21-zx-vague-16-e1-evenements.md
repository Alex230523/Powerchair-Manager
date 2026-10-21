# Vague 16, E1 : créer et gérer un événement (21 octobre 2026)

Revue du 21 octobre au soir : la création d'événement doit être évidente et complète, avec des types définis par le club, des invitations par groupe avec réponse, la suppression et le lien avec les déplacements.

## Bouton
- « Nouvel événement » est le bouton principal de l'en-tête du calendrier, en dernier, après Documents, Déplacements, Salles et le nouveau lien « Tournois ». Le doublon de la carte disparaît. Visible pour qui peut planifier.
- Un « + » sur chaque jour du mois (existant) et désormais de la semaine ouvre le formulaire à ce jour. Raccourci clavier N (annoncé dans l'infobulle et `aria-keyshortcuts`), sauf pendant une saisie.

## Types d'événement du club
- Migration `0048_event_types_invitations.sql` : table `event_type` (nom, famille entraînement, match, réunion ou autre, couleur de la palette des types, icône, réponse demandée par défaut, groupes invités par défaut, registre par défaut, ordre, archivage). Neuf types proposés à chaque club existant et à chaque nouveau club (déclencheur) : Entraînement, Match amical, Match de championnat, Tournoi, Teambuilding, Réunion administrative, Assemblée générale, Stage, Autre.
- `calendar_event.event_type_id` ; reprise de l'existant par la valeur de `kind`. `kind` reste rempli (valeur héritée de la famille) : seuils, registres, statistiques, flux ICS et résumé continuent de fonctionner. Changer la famille d'un type met ses événements à jour.
- Réglages, Activités, « Types d'événement » : liste ordonnée (monter, descendre), fenêtre de modification, archivage (un type utilisé reste sur ses événements).

## Formulaire en sections
L'essentiel (titre, type, début et fin, répétition ou portée de la modification, équipe) ; Lieu (lieu du club, annuaire, adresse libre, « Ouvrir dans une carte ») ; Invitations ; Pour tous (« Commentaire visible par tous les invités » et matériel) ; Transport ; Avancé replié (responsable, visibilité, fait marquant, fiche d'exercice, documents joints).

## Invitations par groupe
- Cases : l'équipe de l'événement, ses coachs, les parents des joueurs invités, et pour la gestion du club tous les joueurs, tous les coachs, le staff, les autres équipes et les groupes de destinataires du module Communication ; plus des personnes à l'unité. Les groupes par défaut du type sont précochés. « 14 personnes invitées » est calculé par le serveur, avec la liste dépliable.
- « Demander une réponse » et une date limite facultative (sinon deux heures avant le début, même écart sur une série) : les invitations sont celles du module Présences (`attendance_invitation`), sans second système ; les réponses déjà données sont gardées.
- Les invités (et les parents choisis) deviennent participants : l'événement apparaît dans leur calendrier et leur flux ICS ; un parent répond pour son enfant. Un coach invite dans son équipe seulement.
- Les groupes choisis sont gardés (`calendar_invite_group`) pour modifier l'invitation plus tard.

## Transport
`trip.calendar_event_id` (même club). Relier un déplacement existant, ou « Créer un déplacement » depuis un événement enregistré (titre, dates, lieu repris, déplacement relié). La fiche de l'événement montre le déplacement (départ, point de rendez vous, véhicules).

## Fiche de l'événement
Réponses (oui, non, sans réponse) et « Rappeler ceux qui n'ont pas répondu » ; Modifier, Dupliquer, « Inviter d'autres personnes », Annuler (avec « Annuler » pendant 8 secondes, nouveau type `eventCancel` du système C10), Supprimer (avec confirmation) seulement sans réponse, sans présence relevée, sans match ni courriel lié ; sinon le serveur répond qu'il faut annuler. Les changements de date, d'heure ou de lieu préviennent les invités (notifications existantes).

## Limites
- Les noms des types proposés sont en français (le club les renomme) ; les fiches exercices de la bibliothèque arrivent avec E2 (la fiche document reste dans « Avancé »).
- La suppression est définitive : elle n'offre pas d'annulation (règle C10), d'où la confirmation.

## Tests
- Unitaires : `tests/wave16-events.test.ts` ; `tests/wave15-undo.test.ts` lit la nouvelle liste des types d'annulation.
- Intégration à deux clubs : `tests/integration/wave16-events.integration.ts` (types et familles, invitations par équipe et parents, parent qui répond, suppression refusée après réponse, groupe Communication et personnes, coach limité à son équipe, suppression d'un événement sans réponse, déplacement d'un autre club refusé, déplacement créé depuis l'événement, annulation puis retour).
- Bout en bout : `tests/e2e/events.spec.ts` (bouton à 1440 et 390 px, entraînement pour l'Équipe A avec réponse, déplacement relié, fiche, suppression, axe).
