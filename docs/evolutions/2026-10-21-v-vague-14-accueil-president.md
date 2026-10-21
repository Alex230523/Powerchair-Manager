# Vague 14, prompt 2.5 : accueil du président (21 octobre 2026)

Aucune migration de base de données. L'accueil connecté (`src/components/home.tsx`) passe aux composants partagés et gagne une carte financière et une vue semaine, sans perdre ce que la vague 10 avait apporté (tâches, chiffres, événements avec pastilles de présence, échéances administratives).

## En-tête

`PageHeader` avec, en surtitre, le nom du club et le rôle ; le titre « Bonjour Alexandre » ; le sous-titre « mercredi 21 octobre · Saison 2026-27 » (date du serveur, saison en vue dans la barre du haut). Actions : « Statistiques » (secondaire) et « Créer » (principal) qui ouvre un menu : Événement, Joueur, Opération financière, Mail, chaque entrée seulement avec le droit correspondant (`can` du service). Chaque entrée ouvre la fenêtre existante de la page concernée grâce à `?create=1` : l'éditeur du calendrier, la fenêtre « Ajouter un joueur », le formulaire « Ajouter une opération » de Finance du club, une nouvelle newsletter de Communication.

## À faire

Six blocs au plus, trois par ligne (deux sous 1000 px, un sous 640 px), chacun une petite `Card` interactive blanche : `IconTile` du ton de la tâche, nombre en serif 24 px, titre 14 px 600, texte 12 px, chevron. Plus de bordure colorée. Le total passe dans un `Badge` à côté du titre de section. État vide : `EmptyState` « Tout est à jour ».

## Composition 2/3 + 1/3 (empilée sous 1100 px)

- **Prochains événements** (colonne large) : la liste actuelle (événements et échéances mêlés par date) ou, par le `Segmented` « Liste / Semaine » de l'en-tête, une semaine du lundi au dimanche : en-tête des jours sur fond doux, jour courant en pastille primaire, événements en capsules pastel à la couleur de l'équipe (neutre bleu pour le club entier), flèches semaine précédente et suivante, « Aujourd'hui ». La liste reste la vue par défaut ; sous 760 px la semaine s'empile en une colonne. Les pastilles de présence deviennent un `Badge` « 5 joueurs · 2 coachs » avec un point de couleur et, dans le texte accessible, le mot Suffisant, Tendu ou Insuffisant : la couleur n'est jamais le seul indice. Un clic garde le comportement actuel (fiche dans le calendrier via `?event=`). La semaine est chargée à part (`GET /api/dashboard?week=YYYY-MM-DD`) ; une erreur s'affiche dans la carte seulement.
- **Chiffres clés** (colonne étroite) : quatre `StatCard` deux par deux (pour le président : joueurs actifs, événements à 14 jours, réponses en attente, liste d'attente), puis « Tous les chiffres » déplie les autres.
- **Situation financière** (colonne étroite, seulement avec le droit cotisations ou finances et les modules allumés) : trésorerie en grand chiffre serif ; recettes et dépenses de la saison alignées à droite en chiffres tabulaires ; « Cotisations encaissées » avec une barre fine ambre et « 40 % · 100,00 € sur 250,00 € », calculée par `duesTotals()` du domaine des cotisations, la même fonction que la page Cotisations ; « N joueurs en retard » en `Badge` danger vers `/dues?state=late` ; lien « Voir les finances » (ou « Voir les cotisations » si le module Finances est coupé, auquel cas la trésorerie et les lignes de saison disparaissent).

## Données

`src/domains/dashboard/service.ts`, même transaction en lecture seule et mêmes règles d'autorisation : `season` (saison en vue), `can` (droits du menu Créer), `finance` (trésorerie et grand livre de la saison en vue, totaux des cotisations de la saison et de l'équipe en vue), `week` (événements lisibles par l'acteur, filtrés comme le calendrier et par l'équipe en vue). Chargement : squelettes à la forme des cartes (en-tête, trois blocs, deux colonnes).

## Autres rôles

Coach, joueur et parent gardent leurs blocs de la vague 10, dans les nouveaux composants. Un parent voit ses propres échéances de cotisation dans les prochains événements, jamais la carte financière.

## Tests

- Intégration (`tests/integration/home.integration.ts`) : saison et droits du menu Créer ; carte financière du président avec un taux d'encaissement identique à celui de la page Cotisations (mêmes lignes, même fonction), trésorerie et recettes de la saison, compteur de retard ; l'autre club voit ses propres chiffres (vides), un coach sans droit d'argent et un parent n'ont pas de carte ; module Finances coupé (trésorerie absente, cotisations présentes) puis Cotisations coupé (plus de carte) ; semaine demandée (bornes, événements dans l'ordre avec la couleur d'équipe, semaine mal formée ignorée, autre club vide, parent limité aux événements du club entier).
- Bout en bout (`tests/e2e/home.spec.ts`) : titre « Bonjour Alexandre » et saison dans le sous-titre, menu Créer avec ses quatre entrées et l'éditeur du calendrier ouvert par « Événement », bascule Liste/Semaine, sept colonnes, jour courant, capsule à la couleur de l'équipe, semaine suivante vide puis « Aujourd'hui », clic sur la capsule vers la fiche `?event=`, quatre chiffres puis « Tous les chiffres », carte financière avec « Trésorerie » et « Voir les finances », rendu à 390 px sans débordement, axe à chaque étape. Les contrôles d'en-têtes de la vague 10 (`new-pages`) restent valables.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
