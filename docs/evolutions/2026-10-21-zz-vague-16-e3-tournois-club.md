# Vague 16, E3 : tournois du club sur la page Tournois (21 octobre 2026)

Revue du 21 octobre au soir, point E3, adapté à la page Tournois livrée le même jour (#41 : tournois fédéraux et de club, journées, classements, trophées). Le bouton « Tournois » de l'en-tête du calendrier et l'entrée du menu Activités y mènent déjà (E1).

## Ce qui s'ajoute
Sur `/[locale]/tournaments`, sous les tournois, une section « Tournois du club » pour le staff du club (président, coachs, droit calendrier ou équipes), quand le module Déplacements est actif. Aucune nouvelle table : elle réunit les déplacements de type tournoi.
- À venir : date, lieu, équipe (de l'événement relié), véhicules et places fauteuil, ou « Transport à organiser » ; liens vers le déplacement et l'événement du calendrier.
- Passés : place finale (« 2e sur 8 », depuis `trip.final_rank` et `teams_count`), note de résultat, matchs de type tournoi joués ces jours-là avec les scores ; « Saisir le résultat » ouvre le déplacement quand la place manque.
- Suit l'année choisie en haut de la page.
- « Préparer un tournoi » : crée en une fois l'événement (type Tournoi du club, l'équipe invitée avec réponse) puis le déplacement de type tournoi relié, avec les commandes du calendrier (E1).

## Limite
« Ajouter au Hall of fame » viendra avec le palmarès des statistiques du club (S1).

## Tests
- Unitaires : `tests/wave16-club-tournaments.test.ts`.
- Intégration à deux clubs : `tests/integration/wave16-club-tournaments.integration.ts` (à venir et passés, place et matchs, isolement, joueur exclu, module coupé).
- Bout en bout : `tests/e2e/club-tournaments.spec.ts` (place affichée, préparer un tournoi, événement et invitations créés, axe, 390 px).
