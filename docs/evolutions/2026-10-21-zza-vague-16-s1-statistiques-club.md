# Vague 16, S1 : statistiques du club (21 octobre 2026)

Revue du 21 octobre au soir, point S1. La page Statistiques passe en onglets ; l'onglet « Club » est construit ici, l'onglet « Jeu » suit avec S2.

## Adresses
- `/[locale]/statistics` redirige vers `/[locale]/statistics/club` en gardant `?season=` et `?team=`.
- En-tête « Statistiques », sous-titre « Saison 2026-27 · toutes les équipes » (ou le nom de l'équipe, ou « mes équipes » pour un coach limité). Actions : « Rapport d'activité » et « Export CSV » (toutes les cartes affichées dans un fichier). Le bouton Présences et la barre de filtres disparaissent : la saison et l'équipe viennent des capsules de la barre du haut.
- Onglets sous l'en-tête (`nav.page-tabs`, liens avec `aria-current="page"`).

## Menu « ... » de chaque graphique
Bouton rond « Options du graphique » : période (saison en cours, saison précédente, 3 ou 5 dernières saisons, depuis le début, période personnalisée avec deux dates), voir les données (tableau), export CSV, export PNG. La période s'affiche sous le titre et se garde dans l'adresse, une par graphique (`?p-attendance=last3`, `?p-headcount=…`, `?p-results=custom:2025-09-01:2026-06-30`). Les saisons se comptent à partir de celle de la barre du haut. Échap ou un clic à côté ferme le menu et rend le focus au bouton. Le PNG redessine les SVG avec les couleurs calculées de la page (thème clair ou sombre) et les textes marqués `data-export-text`.

## Cartes
- Tuiles : Joueurs, Coachs (coachs et assistants, sans doublon), Entraînements (faits, non annulés), Matchs (joués), Solde total (grand livre, avec le droit Argent et le module Finances) ou sinon « Taux de présence ». Une seule fonction, `seasonKeyFigures` (`src/domains/statistics/key-figures.ts`), sert l'accueil du président (A) et ces tuiles.
- « Évolution des présences » (pleine largeur) : une courbe par équipe (couleur de l'équipe, équipes regroupées par nom d'une saison à l'autre) et le Club en `--primary` 3 px ; avec une équipe choisie, sa courbe et la moyenne du club en pointillé. « Par mois / Par semaine » : semaines ISO (lundi), « sem. 42 », une graduation toutes les 4 semaines. Taux = présents (retards et départs anticipés compris) sur convoqués, registres clôturés seulement ; une période sans séance reste vide.
- « Effectif par année » : 5 dernières saisons par défaut. Vue Équipes en barres groupées (une barre par équipe, total de la saison au-dessus ; une personne dans deux équipes compte dans chacune, une fois dans le total, et le tableau le précise ; le tableau garde aussi restés, arrivés, partis et le taux de réinscription). Vue Âge en barres empilées (âge au 1er septembre de la saison, sept tranches dont « âge inconnu »). Vue Classification (PF1, PF2, en attente, non classé). Vue Coachs (barres groupées).
- « Résultats par équipe » : un anneau par équipe (`DonutChart`), victoires en `--success`, nuls en `--warning`, défaites en `--danger`, 1 px de fond entre les segments ; au centre le nombre de matchs (serif) ; dessous le nom, la pastille et « 1 victoire(s) · 0 nul(s) · 1 défaite(s) » ; gris et « Aucun match joué » pour une équipe sans match. Un clic ouvre les matchs de l'équipe (`/matches?season=&team=`) ; S2 le dirigera vers l'onglet Jeu.
- « Stockage » (président) : barre empilée sur le quota, « 312 Mo utilisés sur 1 Go (31 %) », taille par catégorie. Dès 80 % : badge « Bientôt plein » et « Voir les plus gros fichiers » (les 20 plus gros, avec un lien vers leur page). Au-delà du quota : nouveaux envois refusés (`STORAGE_FULL`, message clair dans chaque module).
- « Hall of fame » (pleine largeur) : frise par saison, la plus récente en haut, les trois dernières par défaut (le menu « ... » montre les plus anciennes). Chaque prix : médaille or, argent, bronze ou étoile, toujours avec « 1re place », « 2e place » ou « Distinction » en toutes lettres ; titre en serif, compétition, équipe, personne, date, photo. « Ajouter un prix » ; les tournois terminés à la 1re, 2e ou 3e place sont proposés (« Ajouter au Hall of fame », formulaire prérempli), jamais ajoutés d'office, et le lien apparaît aussi sur la page Tournois.
- Disposition : tuiles ; présences ; effectif | résultats ; stockage ; Hall of fame. Une colonne sous 960 px.

## Page publique du Hall of fame
Réglages › Club : « Publier la page publique » donne une adresse `/[locale]/hall-of-fame-widget/[id]` (identifiant aléatoire, retiré à la désactivation, l'ancienne adresse ne montre plus rien) et le code iframe à copier. Même en-tête que le formulaire d'inscription (`frame-ancestors *`), aucun compte. Elle ne montre jamais le prix d'une personne, ni une photo, sans la case « Peut être publié » (droit à l'image, mineurs), ni les notes internes. Rien n'est servi quand le module Statistiques est coupé.

## Données (migration 0050, additive)
- `size_bytes` calculé par la base (`GENERATED ALWAYS AS (octet_length(...)) STORED`) sur `document_version`, `registration_attachment`, `finance_receipt`, `funding_task_proof`, `organization_logo`, `tournament_trophy`, `exercise_diagram`, `document_signature` et `award` : rempli à chaque envoi et une fois pour l'existant.
- Vues `storage_file` (fichiers par organisation, catégorie et page d'origine) et `storage_usage` (somme par catégorie). Les justificatifs retirés ne comptent pas.
- `organization.storage_quota_bytes` (1 Go par défaut) : aucun écran ne le modifie, seul l'administrateur de la plateforme le change en base.
- `classification_history` (personne, classification, statut, du, au), écrite par un déclencheur sur `player_sport_profile` à chaque changement, d'où qu'il vienne, et amorcée avec l'état du jour. Pour une saison antérieure à l'historique, la vue Classification prend la classification actuelle et l'écrit : « Classification actuelle, l'historique n'existe que depuis le JJ/MM/AAAA ».
- `award` (organisation, saison, date, titre, compétition, type, place, équipe, personne, photo, note, source manuel ou tournoi, déplacement d'origine unique, « Peut être publié »).
- `organization.hall_of_fame_widget` : l'adresse de la page publique quand elle est active.

## Droits
- Onglet Club : comme le menu (gestion des présences, du calendrier, ou lecture de l'annuaire). Un coach sans l'annuaire ne voit que ses équipes (tuiles, courbes, effectif, résultats), sans l'argent ni le stockage.
- Stockage : le président.
- Hall of fame : lecture pour tous les membres du club ; écriture pour le président et le droit Équipes ; page publique : le président.

## Ce qui disparaît
L'ancienne page (filtres, tableau par personne, carte de fidélisation) : le détail par personne reste dans Présences, la fidélisation passe dans le tableau de « Effectif par année ». La route `/api/statistics/retention` est remplacée par `/api/statistics/club?chart=headcount`.

## Corrections au passage
Trois tests comparaient le jour UTC au jour de Bruxelles et échouaient entre 22:00 et minuit UTC (rappel des tâches sponsors, déplacement d'un joueur, déplacement d'un événement) : corrigés sur les branches A et E1.

## Tests
- Unitaires : `tests/wave16-statistics.test.ts` (semaines ISO, tranches d'âge, comptage distinct, segments des anneaux, périodes, stockage, médailles et règles de publication), `tests/wave15-charts.test.ts` et `tests/statistics.test.ts` allégés.
- Intégration à deux clubs : `tests/integration/wave16-statistics.integration.ts` (tuiles égales à l'accueil, coach limité, mois et semaines, effectif, classification avec et sans historique, anneaux, stockage et quota refusé, prix suggéré depuis un tournoi, page publique sans prix individuel non publiable), `tests/integration/wave15-charts.integration.ts` adapté.
- Bout en bout : `tests/e2e/statistics-club.spec.ts` (onglets, menu « ... » et période gardée dans l'adresse, mois et semaines, vue Âge, anneaux avec leur texte, stockage, prix ajouté depuis un tournoi et à la main, exports CSV et PNG, axe en clair et en sombre, 390 px) ; `tests/e2e/attendance.spec.ts` adapté.
