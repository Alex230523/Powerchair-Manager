# 1. Lot de corrections d'interface et écran de connexion (02/11/2026)

Aucune règle métier ne change.

## Alignements : une règle commune

- `--control-height` (44 px) : champs, menus et boutons d'une même rangée ont la même hauteur ; un menu sous son libellé se place exactement comme un champ texte (même écart, même largeur).
- `--check-size` (20 px) : cases à cocher et boutons radio d'une taille fixe partout (avant, la règle des champs texte les étirait), posés sur la première ligne de leur libellé, avec un espace sous le texte au-dessus.
- Corrigés par cette règle : formulaire d'inscription (édition et formulaire public), Hall of fame, recherche des cotisations, recherche et filtre « État » du matériel, « Lieu du club » d'un lieu de stockage.

## Points

1. Accueil, « Chiffres clés » : cases de la même taille sur une grille régulière, indices sur une ligne, plus d'indice sous « Matchs joués ».
2. Formulaire d'inscription : chaque question se replie et se déplie (numéro et libellé toujours visibles, état annoncé), « Tout replier / Tout déplier » ; une question repliée qui contient un champ obligatoire vide se rouvre à l'enregistrement.
3. à 5. Voir la règle commune.
6. Tournois : le menu « Année » garde sa largeur et la hauteur des boutons voisins.
7. Joueurs : le menu « Équipe » ne liste que les équipes de la saison choisie dans la barre du haut, chacune une fois (la même équipe revenait pour chaque saison).
8. Calendrier : un événement s'ouvre dans une fenêtre centrée (plein écran sur téléphone, « Fermer » en haut) ; l'adresse garde `?event=` ; Échap ferme et le focus revient sur l'événement.
9. Lieu d'un événement : un seul champ de recherche (combobox ARIA 1.2) : « Nos lieux », « Annuaire partagé », « Utiliser ‹texte› comme lieu libre », « + Créer ce lieu » (la fenêtre de création s'ouvre avec le nom tapé, le lieu est choisi au retour).
10. Invitations d'un événement : « Toutes les équipes » ; un joueur de deux équipes n'est invité qu'une fois.
11. Matchs : un seul « Nouveau match », qui demande d'abord Amical ou Compétition ; l'amical garde son déroulé entre clubs.
12. « Licences » devient « Classification » (menu et page `/classification`) : la classification des joueurs et les journées de classification. Les frais de licence restent dans Finances › Affiliations ; le numéro de licence reste sur la fiche joueur. `/licenses` redirige.
13. Documents : retrait de « Licences et transferts » et « Fiches exercices » de l'en-tête ; la catégorie « Carte d'identité » (« Identité administrative ») n'est plus proposée. Les documents déjà déposés restent lisibles, marqués « catégorie retirée » ; le président peut les supprimer (action `purgeRetired`, journalisée).
14. Carnet de contacts : les étiquettes se choisissent aussi dans la création rapide d'un contact (« Choisir ou créer un contact »).
15. Page des coachs : plus de boutons « Gestion des inscriptions » ni « Cotisations » ; « Exporter » en haut à droite ; « Colonnes » sur la barre du tableau, avec le nombre de coachs.

## Écran de connexion

- « Réessayer » apparaissait toujours pour un visiteur : la lecture de l'espace de travail répond 401 sans session, ce qui n'est pas une erreur. Il n'apparaît plus que si le serveur est injoignable, dans la carte, avec « Impossible de joindre le serveur. Vérifiez votre connexion. ».
- Les erreurs de connexion s'affichent dans la carte, au-dessus du formulaire.
- Tous les éléments de la carte sur le même bord gauche et la même largeur ; les liens (« Récupérer mon accès », « Se connecter ») centrés sous le bouton, pour tous les modes.
- Barre du haut : logo et nom centrés, jamais coupés. Carte centrée sur ordinateur, pleine largeur à 16 px des bords sur téléphone.

## Limites

- Les captures avant et après ne sont pas jointes ici : le rapport de l'audit visuel (point 23, artefact « audit-report » de la CI) les produit pour chaque page à 1440 et 390 px, clair et sombre, texte « Très grand ».
- Tests Playwright : écran de connexion (trois tailles et thèmes, erreur réseau simulée, alignement à 1 px, logo, axe), redirection `/licenses`, recherche de lieu, nouveau match. Les autres points sont couverts par des tests unitaires et par l'audit visuel.

## Vérification

- `npx vitest run tests/t01-interface.test.ts tests/wave14.test.ts`
- `npm run test:integration` (`tests/integration/t01-interface.integration.ts` : catégorie retirée, suppression par le président seul, deux clubs)
- `npm run test:e2e:db -- interface-lot1 places calendar friendlies`
