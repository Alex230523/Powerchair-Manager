# Fiche de la personne : « Vue d'ensemble » (02/11/2026)

Point 40 de l'avis. Pas de nouvelle page : la fiche existante d'un joueur (J1) et celle d'un coach gagnent un onglet « Vue d'ensemble » en tête, qui résume tout ce qui concerne la personne, avec un lien « Voir » vers chaque détail. Aucune migration.

## Blocs, chacun selon le droit du lecteur

- Rôles et mandats (avec leur durée) ; tâches ouvertes ou en retard : présidence et responsables des personnes, la personne et ses responsables.
- Équipes, documents (manquants, à vérifier, expirés, jamais les sensibles), présences sur 30 jours, prochains événements, licence : en plus, les coachs de la personne.
- Fauteuil attribué et son état : tout lecteur de la fiche.
- Cotisations (dû, payé, en retard) : droit argent, ou la personne et ses responsables. Jamais pour un coach.
- Autorisations parentales : présidence et responsables des personnes, parents.
- Formations et permis : pour un coach, lisibles par la présidence et le coach lui-même.
- Responsables (mineur) ou enfants (parent), chacun vers sa fiche.
- Santé et consignes de soin : seulement avec `people.sensitive` ; le parent ne voit pas les notes internes du club.

## Lecture

- Chaque bloc a un état lisible (pastille avec icône et texte, pas seulement une couleur) et un lien « Voir » vers l'onglet ou la page détaillée.
- En tête : « Ce qui bloque » (« Licence manquante, cotisation en retard de 2 mois, fauteuil indisponible… »), avec des actions rapides : relancer la cotisation (page Cotisations), créer une tâche de suivi dans la to-do, écrire un email prérempli.
- Ouvert par défaut pour la présidence et ceux qui gèrent les personnes ; les autres lecteurs gardent l'onglet habituel.

## Tests adaptés

Les tests E2E qui ouvrent une fiche en tant que présidence cliquent d'abord sur l'onglet du détail (`bank`, `coaches`, `offboarding`, `season-schedule`, `player-directory`).

## Vérification

- `npx vitest run tests/person-overview.test.ts`
- `npm run test:integration` (`tests/integration/person-overview.integration.ts`) : blocs par droit, coach sans argent ni santé, parent sans notes du club, autre club refusé.
- `tests/e2e/person-overview.spec.ts` à 390 px avec axe.
