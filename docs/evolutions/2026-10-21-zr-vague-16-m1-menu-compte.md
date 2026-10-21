# Vague 16, M1 : menu du compte compact (21 octobre 2026)

Revue du 21 octobre au soir : la fenêtre ouverte depuis la photo et le nom, en bas à gauche, débordait de la barre latérale.

- **Largeur** : le menu ne dépasse jamais 240 px (la barre latérale moins ses marges) ; dans le tiroir mobile, il prend la largeur du tiroir. Aucun élément ne force la largeur (textes longs tronqués).
- **Une ligne par réglage**, libellé à gauche, commande compacte à droite :
  - Langue : une liste qui affiche la langue choisie (« Français ») ; chaque langue est écrite dans sa propre langue, avec son attribut `lang`. Choisir mène à la même page dans cette langue.
  - Thème : deux boutons ronds de 32 px, soleil et lune seulement, avec un nom pour les lecteurs d’écran et une infobulle (« Thème clair », « Thème sombre »).
  - Taille du texte : une liste (Normal, Grand, Très grand) au lieu des trois boutons.
  - Contraste renforcé : sur sa propre ligne, case de 18 px ; toute l’étiquette reste une cible de 44 px.
- **Ordre** : changer de profil, Mon compte, Réglages ; séparateur ; langue, thème, taille du texte, contraste ; séparateur ; Se déconnecter. Le lien « Mon espace » quitte le menu (doublon de Mon compte et Réglages).
- Réglages > Mon compte réutilise les mêmes commandes compactes.
- Tests : `tests/wave16-shell.test.ts` ; `tests/e2e/shell.spec.ts` (largeur, langue par la liste, thème par les icônes, axe) et `tests/e2e/display-size.spec.ts` (taille par la liste, case de contraste, menu dans la barre latérale à 1440 et 1024 px en très grand texte, axe menu ouvert).
