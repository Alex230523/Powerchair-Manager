# Vague 16, R1 : places disponibles par équipe (21 octobre 2026)

Revue du 21 octobre au soir : « pouvoir définir le nombre de places disponibles par équipe ».

- **Donnée** : migration `0044_team_capacity.sql`, `team.capacity` (1 à 100, vide = sans limite).
- **Réglages > Activités > « Places par équipe »** : un tableau des équipes de la saison (pastille, nom, places, joueurs actuels, places libres), modifiable en ligne, « Enregistrer ». Le même champ est dans l’onglet Réglages de la fiche équipe et à la création d’une équipe. Droit : gestion des équipes. Entrée trouvable par la recherche des réglages.
- **Carte et fiche de l’équipe** : « 8 sur 10 places » avec une barre fine ; badge orange à une place libre, rouge quand c’est complet ou au-delà.
- **Inscriptions** : accepter un dossier vers une équipe complète est refusé avec le message « mettez le dossier en liste d’attente, ou cochez Accepter même si l’équipe est complète » ; la liste des équipes indique les places et « complète ».
- **Déplacer vers…** (fiche équipe et fiche joueur) : avertissement si l’équipe d’arrivée est complète, sans bloquer ; après le déplacement, le message dit que l’équipe dépasse ses places.
- **Passage de saison** : la capacité (et la couleur) suivent l’équipe.
- **Accueil** : nouvelle tâche « Équipes au-delà de leurs places » pour ceux qui gèrent les équipes.
- **Non fait** : l’affichage automatique « Liste d’attente » sur le formulaire public quand toutes les équipes d’une catégorie sont pleines. Les formulaires ne sont pas encore reliés à une catégorie d’équipes ; à prévoir avec I2 (formulaire d’inscription sans compte).
- Tests : `tests/wave16-places.test.ts` ; intégration à deux clubs `tests/integration/wave16-places.integration.ts` (sans limite par défaut, enregistrement limité au club et au droit, déplacement au-delà signalé, tâche de l’accueil, inscription refusée puis acceptée avec confirmation, recopie au passage de saison) ; Playwright `tests/e2e/team-places.spec.ts` (réglages, cartes, avertissement de déplacement, axe).
