# Vague 15, observation C6 : actions rapides dans la recherche Ctrl+K (21 octobre 2026)

Pas de migration.

## Ce qui change

- **Sections, dans cet ordre** : Actions (si la saisie y correspond, ou toutes quand le champ est vide), Personnes, Équipes, Événements, Pages. Chaque section a un titre de 12 px `--muted`.
- **Actions**, visibles seulement avec le droit de la page qu’elles ouvrent (et le module activé), calculées par `paletteActions()` (`src/components/palette.ts`) :
  - Créer un événement (`/calendar?create=1`), Ajouter un joueur (`/players?create=1`), Importer des joueurs (`/players?import=1`, qui ouvre directement l’import Excel), Enregistrer une dépense (`/funding?create=1`), Envoyer un mail à une équipe (`/communication?create=1`) : les mêmes liens que le menu « Créer » de l’accueil ;
  - Encaisser une cotisation (Cotisations) et, pour un joueur trouvé, « Encaisser la cotisation de … » qui ouvre directement la fenêtre de paiement de sa ligne (`/dues?pay=<joueur>`) ;
  - Remplir les présences du jour (Présences) ;
  - Changer de saison, Changer d’équipe : la capsule correspondante de la barre du haut prend le focus et ouvre sa liste.
- **Résultats** : icône dans une tuile de 28 px, titre 14 px, détail 12 px `--muted` (équipe, date), « Entrée » affiché à droite de l’élément actif. Une équipe trouvée ouvre maintenant sa page.
- **Récents** : les 5 derniers éléments ouverts reviennent quand le champ est vide (mémorisés sur l’appareil, try/catch). Chaque ouverture repart d’un champ vide.
- **Apparence** : fenêtre de 640 px centrée à 15 % du haut, arrondi 20 px, `--shadow-pop`, champ sans bordure en 16 px, voile `--backdrop` plus léger.
- Textes déplacés dans `command-palette-copy.ts` (fr, nl, en).

## Tests

- Unitaires (`tests/wave15-palette.test.ts`) : actions selon les droits et les modules, liens identiques au menu « Créer », correspondance sans accents, cinq récents sans doublon, textes fr/nl/en sans tirets.
- Bout en bout (`tests/e2e/command-actions.spec.ts`) : actions du président à vide, axe, navigation au clavier avec « Entrée », action d’import ouverte directement, joueur et encaissement, récents, coach sans droit d’agenda sans l’action.

## Vérification

`npm run check`, `npm run test:e2e:db`.
