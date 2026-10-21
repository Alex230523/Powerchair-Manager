# Tournois : le calendrier fédéral devient « Tournois » (21 octobre 2026)

Demande du porteur du projet après l’essai sur l’aperçu en ligne. Migration additive `0043_tournaments.sql` : `tournament`, `tournament_club`, `tournament_day`, `tournament_match`, `tournament_stat`, `tournament_trophy`.

## Qui fait quoi
- **Créer un tournoi** : le président d’une fédération ou d’un club. Un club organisateur participe d’office.
- **Inviter des clubs** : l’organisateur choisit dans la liste des clubs (ceux de la fédération d’abord). Le président du club invité accepte (avec, s’il le veut, un nom d’équipe) ou refuse, depuis sa page Tournois.
- **Journées de match** : date, intitulé, lieu, club organisateur de la journée, notes. Chaque journée porte ses matchs : heure, phase (championnat, poule, quart, demie, 3e place, finale…), poule, club à domicile et visiteur, arbitre désigné parmi les arbitres de la fédération.
- **Résultats** : le premier qui encode le score l’enregistre (organisateur du tournoi, club organisateur de la journée, arbitre désigné, président ou coach d’un des deux clubs). Ensuite seuls l’organisateur et l’arbitre peuvent le corriger, et ce sont eux qui le valident. Un coach n’encode que les joueurs de son club. Seuls les résultats validés comptent dans les classements, le podium et les statistiques.
- **Clôturer** : l’organisateur fige le tournoi ; le podium devient des trophées.
- **Visibilité** : l’organisateur, les clubs invités, la fédération d’un club organisateur, les clubs d’une fédération organisatrice et les arbitres désignés. Un autre club ne voit rien. Les feuilles de match ne montrent que le nom des joueurs.

## Types de tournoi et règles
Championnat (aller simple ou aller-retour), poules puis phases finales (nombre de poules, qualifiés par poule), élimination directe, règles libres. Pour chacun : points victoire, nul, défaite ; nombre et durée des mi-temps ; premier critère d’égalité (différence de buts, confrontation directe, buts marqués) ; tirs au but en phases finales ; autres règles en texte libre. Le calcul du classement et du podium est dans `src/domains/tournaments/schema.ts` (testé sans base).

## Pages
- **Tournois** (`/tournaments`) : « Ajouter un tournoi », choix de l’année, lien vers la galerie des trophées, invitations reçues, puis une carte par tournoi (organisateur, type, état, dates, clubs, matchs joués, prochaine journée, podium).
- **Un tournoi** : en haut la situation actuelle (podium, classement ou classements par poule, statistiques des joueurs : matchs, buts, passes, cartons), puis les journées de match en menus dépliants avec toutes les informations (lieu, club organisateur, notes, matchs, scores, tirs au but, arbitre, buteurs et cartons, qui a encodé et validé), puis les clubs et les règles.
- **Galerie des trophées** (`/tournaments/trophies`) : les podiums des tournois terminés, année par année ; le club concerné (ou l’organisateur) ajoute une photo (PNG, JPEG ou WebP, 1,5 Mo au plus).
- **Calendrier** : chaque journée de tournoi apparaît comme une pastille d’une journée entière pour les clubs organisateurs et participants et pour l’arbitre, avec un lien vers la journée.
- **Menu** : « Tournois » remplace « Calendrier fédéral » partout (président, coach, joueur, parent, fédération). L’ancienne adresse `/federal-calendar` renvoie vers Tournois.

## Données de démo
`npm run demo:seed` (et les aperçus en ligne, même si le club de démo existe déjà) ajoute quatre clubs affiliés avec leurs joueurs, le championnat de l’année à moitié joué (un résultat en attente de validation), la coupe de l’année (demi-finales jouées), la coupe de l’an dernier terminée (le club de démo l’a gagnée : trophée dans la galerie), un tournoi organisé par le club de démo (poules à venir) et une invitation en attente.

## Limites
- Pas encore de mail à l’invitation ni au résultat : l’invitation apparaît sur la page Tournois du club invité.
- Les matchs ne sont pas générés automatiquement à partir des règles : l’organisateur les ajoute journée par journée.

## Tests
- Unitaires : `tests/tournaments.test.ts` (classements, égalités, poules, podium, tirs au but, règles, textes fr/nl/en, menus, calendrier) ; `tests/wave14.test.ts` adapté.
- Intégration (`tests/integration/tournaments.integration.ts`, une fédération et trois clubs) : création, invitation, refus de visibilité au club non invité, journée et match, premier résultat par un coach limité à ses joueurs, correction et validation par l’arbitre, classement et buteurs, clôture et trophées, photo par le seul club concerné, tournoi organisé par un club.
- Bout en bout (`tests/e2e/tournaments.spec.ts`) : parcours complet à l’écran, pastille dans le calendrier, galerie, axe et largeur à 1280 et 390 px.
