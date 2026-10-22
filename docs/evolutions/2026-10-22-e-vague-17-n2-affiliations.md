# Vague 17, N2 : affiliations et cotisations fédérales (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point N2.

## Données
Migration `0053_affiliations.sql` (ajout seulement) :
- `affiliation_fee` : la définition, propriété d'une fédération ou d'un club. Nom, description, personne de contact du carnet (facultative), base de calcul (par club ou par joueur licencié), fréquence (annuelle ou mensuelle), montant, jour d'ouverture (par exemple le 1er août), date limite (un délai en jours après l'ouverture, ou une date fixe pour une affiliation annuelle), portée d'une définition fédérale (tous les clubs ou clubs choisis, table `affiliation_fee_club`), archivage.
- `affiliation_due` : ce qu'un club doit pour une période (« 2026-27 », ou « 2026-10 » pour une affiliation mensuelle) : ouverture, date limite, nombre de joueurs licenciés retenu, montant calculé, payée le, marquée par, dépense liée du grand livre.
- Une catégorie « Affiliations » dans le grand livre (comptée en services dans les comptes annuels) et le type d'annulation `affiliationPaid`.

## Fédération (Affiliations, dans son espace)
- Créer une affiliation pour tous les clubs ou pour des clubs choisis ; deux exemples sont proposés à compléter : « Affiliation BPCF » (par club, annuelle) et « Sportéa » (par joueur, annuelle).
- Un tableau de suivi par club : affiliation, période, montant, date limite, statut (À payer, En retard, En ordre). Le bouton « Relancer les clubs en retard » écrit aux présidents des clubs en retard (une fois par jour au plus). La fédération ne voit que ce que les clubs lui doivent, rien d'autre de leurs finances.

## Club (Finances › Affiliations)
- La liste des affiliations dues (fédérales et du club) : nom et qui la définit, période, montant (avec le détail « 3 joueurs × 25 € » par joueur), date limite, statut en badge, et à droite un grand bouton rond vert « Marquer en ordre » (44 px, nom complet pour les lecteurs d'écran).
- Le clic demande la date de paiement (aujourd'hui par défaut) et propose de créer la dépense dans le grand livre (cochée par défaut, avec le moyen de paiement). « Affiliation en ordre · Annuler » : l'annulation remet la somme à payer et annule la dépense créée.
- « Ajouter une affiliation du club » : les mêmes champs. Le club archive ses propres définitions, jamais celles de la fédération.
- Le montant par joueur compte les joueurs licenciés pour la saison du jour d'ouverture (ceux de la saison précédente tant qu'aucun n'est encore licencié).

## Ouverture, échéances et statut du club
- Chaque période crée sa ligne dans « Statut du club » (source automatique `affiliation`) ; « Marquer en ordre » la coche (« Coché par l'affiliation en ordre ») et peut rendre le carré de l'accueil vert. « Préparer l'année suivante » ne recopie pas ces lignes : elles reviennent seules à l'ouverture suivante.
- Comme toute ligne du statut du club, la date limite apparaît dans la couche Échéances du calendrier, dans les échéances de l'accueil et dans le résumé hebdomadaire.
- Le jour de l'ouverture, le travailleur prévient une fois les présidents : « Renouvellement : Affiliation BPCF 2026-27 », avec la date limite.
- Pas encore fait : l'affiliation n'apparaît pas comme tâche dans la page Tâches (qui ne liste que les tâches de sponsors et de subsides) ; la ligne du statut du club joue ce rôle pour l'instant.

## Tests
- Unitaires : `tests/wave17-affiliations.test.ts` (périodes annuelles et mensuelles, dates limites, montants, états, catégorie, textes FR/NL/EN) ; `tests/wave14.test.ts` suit le menu.
- Intégration à trois clubs : `tests/integration/wave17-affiliations.integration.ts` (définition fédérale pour des clubs choisis, montant par joueur, en ordre avec dépense et ligne du statut cochée, annulation, définitions du club, avertissement à l'ouverture une seule fois, relance des clubs en retard, isolement).
- Bout en bout : `tests/e2e/affiliations.spec.ts` (fédération puis club, en ordre avec dépense, annulation, axe, 390 px).
