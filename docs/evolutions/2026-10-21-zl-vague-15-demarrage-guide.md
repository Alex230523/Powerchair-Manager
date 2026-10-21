# Vague 15, observation C3 : démarrage guidé d’un nouveau club (21 octobre 2026)

Migration `0040_setup.sql` (ajout) : `organization.setup_hidden` (la carte masquée par le président).

## Carte « Bien démarrer »

En haut du tableau de bord du président d’un club, tant que le club n’est pas configuré et que la carte n’est pas masquée. Chaque étape est calculée à partir des données (`setupState`, `src/domains/setup/service.ts`), jamais cochée à la main :

1. ajouter le logo et l’identité du club (un logo existe) ;
2. créer la saison en cours (une saison non archivée couvre aujourd’hui) ;
3. créer au moins une équipe (dans cette saison) ;
4. inviter un coach (un mandat de coach, ou une invitation de coach acceptée ou en cours) ;
5. ajouter ou importer les joueurs (un joueur actif dans l’annuaire) ;
6. créer un barème de cotisation ;
7. choisir les modules utiles (le choix des modules a été enregistré au moins une fois) ;
8. régler l’effectif attendu aux séances (seuils enregistrés).

Le prompt 2.9 ajoute une neuvième étape : choisir la palette du club (enregistrée au moins une fois).

Apparence : titre serif, fine barre de progression `--primary` avec « 3 sur 8 » (`role="progressbar"`), étapes avec une icône ronde (coche verte une fois faite), titre, une phrase d’aide et un bouton « Commencer » qui ouvre directement le bon formulaire (Réglages > Club, Gestion du club, invitation de l’accès, import Excel, Réglages > Argent, Réglages > Activités). Lien « Masquer », mémorisé pour le club ; la carte reste dans Réglages > Club (trouvable par la recherche) avec « Afficher à nouveau sur l’accueil ».

## États vides

Les pages vides proposent leur première action, à qui en a le droit :

- Joueurs : « Importer vos joueurs depuis Excel » (ouvre l’import) ;
- Calendrier : « Créer le premier entraînement » ;
- Finances : « Enregistrer la première opération » ;
- Matériel : « Ajouter le premier fauteuil ».

## Tests

- Unitaires (`tests/wave15-setup.test.ts`) : comptage, affichage, liens vers des ancres existantes, textes fr/nl/en sans tirets.
- Intégration (`tests/integration/wave15-setup.integration.ts`, deux clubs) : 0 sur 8 pour un club neuf, chaque donnée fait progresser, l’autre club reste à zéro, réservé au président, masquer et réafficher, disparition une fois tout fait (comme le club de démonstration complet).
- Bout en bout (`tests/e2e/setup.spec.ts`) : 0 sur 8, « Commencer », progression, masquer, réafficher depuis les Réglages, import depuis la page Joueurs vide, axe.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
