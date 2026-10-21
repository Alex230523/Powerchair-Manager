# Vague 16, A : accueil du président (21 octobre 2026)

Revue du 21 octobre au soir : des carrés « À faire » qui passent au vert au lieu de disparaître, un carré « Statut du club », les prochains événements à gauche et les chiffres à droite, des pastilles de présence lisibles et des chiffres clés choisis.

## « À faire » en carrés fixes
- Six carrés pour le président, toujours dans cet ordre : Documents (expirés et manquants en un seul nombre, « N expirent sous 30 jours » en détail sans compter comme un problème), Présences à remplir, Inscriptions à examiner, Cotisations en retard (même chiffre que la page), Sponsors et subsides (conditions et étapes), Statut du club.
- À zéro, le carré reste, en vert (« À jour »), toujours cliquable ; son nom accessible dit « Documents : à jour ».
- Un carré dont le module est désactivé ou sans droit laisse sa place au suivant disponible (entretien de fauteuil, suivi d'inscription, documents à valider…). Les autres chiffres non nuls s'affichent dessous : « Aussi : 2 entretiens de fauteuil · … », chaque élément est un lien.
- Coach, joueur et parent : leurs propres carrés (mes présences, mes documents, mes inscriptions) suivent la même règle.
- Calcul pur dans `buildBoard` (`src/domains/dashboard/summary.ts`), testé ; la liste `todos` existante ne change pas (résumé hebdomadaire, cloche).

## Statut du club
- Réglages, Club : nouveau champ « Forme du club » (ASBL, association de fait, autre ; colonne `organization.legal_form` de 0046). Choisir une forme propose la liste de l'année.
- Migration additive `0047_club_obligations.sql` : une ligne par obligation et par année (les années passées restent), intitulé, précisions, périodicité, échéance, fait le, lien de preuve, responsable, source automatique, ordre, archivage.
- Liste proposée, entièrement modifiable : ASBL (affiliations BPCF et Sportéa, assurance, AG, comptes approuvés et déposés, registre UBO, conseil d'administration, liste des membres) ; association de fait (affiliations, assurance, réunion annuelle, comptes présentés aux membres) ; autre (affiliations et assurance). « Comptes approuvés par l'AG » et « Comptes déposés » se cochent seuls depuis la page Comptes annuels (date d'approbation ou de dépôt dans l'année).
- Réglages, Club, « Statut et obligations » : tableau (échéance, fait le, responsable, preuve, À faire / En retard / Fait), ajouter, modifier, marquer comme fait, retirer (avec confirmation), « Ajouter la liste proposée », « Préparer l'année suivante » (obligations annuelles recopiées décochées, échéances un an plus tard), choix de l'année pour l'historique.
- Carré de l'accueil : « 4 sur 7 », une barre fine et les deux prochaines obligations ; vert quand tout est fait. Les échéances non faites rejoignent la couche Échéances du calendrier et le résumé hebdomadaire.
- Droits : le président et les profils avec gestion du club ou l'argent du club (côté serveur) ; la catégorie Réglages, Club reste celle du président et de la gestion du club.
- Limite : la preuve est un lien (https) ; le dépôt d'un fichier viendra avec le stockage des documents.

## Mise en page et pastilles
- Deux colonnes (événements à gauche, chiffres et argent à droite) jusqu'à 860 px au lieu de 1100 px, puis empilées, événements d'abord.
- Deux badges séparés « 5 joueurs » et « 2 coachs », chacun avec son seuil (Réglages, Activités), un point de 8 px, 6 px d'écart, sans retour à la ligne dans un badge ; lu « Joueurs : 5, suffisant. Coachs : 1, tendu. ».

## Chiffres clés du président (saison de la capsule)
Trésorerie (pleine largeur, en premier), Joueurs (personnes distinctes dans au moins une équipe : un joueur dans deux équipes compte une fois), Équipes, Coachs (coachs et assistants distincts), Fauteuils du club (« dont 2 en entretien »), Entraînements faits (passés, non annulés), Matchs joués (lignes du module Matchs, jamais les journées). Les autres chiffres restent derrière « Tous les chiffres ». Chaque tuile mène à la page concernée.

## Tests
- Unitaires : `tests/wave16-home.test.ts` (vert à zéro, fusion des documents, remplacement d'un module coupé, propositions selon la forme, statut, année suivante, textes, mise en page, comptage des matchs).
- Intégration à deux clubs : `tests/integration/wave16-home.integration.ts` (propositions selon la forme, cloisonnement, coach refusé, coche automatique par les comptes annuels, carré vert, année suivante, carré remplacé si le module Cotisations est coupé, joueurs et coachs distincts, matchs et non journées).
- Bout en bout : `tests/e2e/home-president.spec.ts` (forme du club, « 4 sur 7 » puis vert, Documents à jour, deux colonnes à 900 px, 390 px sans défilement horizontal, axe).
