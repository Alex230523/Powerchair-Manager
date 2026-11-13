# Navigation : plus de sélecteur d'équipe en haut, une page Fédération

Demande du 12/11/2026.

## Le sélecteur d'équipe quitte la barre du haut

Choisir une équipe en haut de l'écran filtrait toutes les pages, parfois sans qu'on s'en rende compte. La barre du haut ne garde que la saison. Les pages où l'équipe compte ont leur propre filtre, qui ne suit pas la personne ailleurs :

- Présences, Calendrier, Matchs, Joueurs et Cotisations gardent leur filtre « Équipe » ;
- les Statistiques (onglets Club et Jeu) ont une rangée d'onglets « Toutes les équipes », puis une par équipe ;
- les boutons d'une carte d'équipe (Effectif, Calendrier, Présences) ouvrent la page déjà filtrée sur cette équipe, par son adresse.

Le navigateur ne retient plus d'équipe choisie : aucune page n'est filtrée en cachette. Le bouton « Appliquer à toute la plateforme » et l'action « Changer d'équipe » de la recherche rapide disparaissent. La visite guidée des coachs parle de la saison.

## « Gestion des coachs » devient « Coachs »

Dans le menu, le titre de la page et les textes qui y renvoient (Coaches en néerlandais et en anglais).

## La page Fédération

Une entrée « Fédération » dans le menu des clubs affiliés, pour tous leurs membres. Elle remplace « Circulaires » et « Discipline », qui quittent le menu ; leurs pages complètes restent à un clic.

- **Circulaires** : les cinq dernières reçues par la personne, les non lues marquées, l'accusé de réception demandé ou fait.
- **Tournois de la fédération** : les tournois ouverts, avec leur prochaine journée et sa salle.
- **Actualités des transferts** : les transferts que la fédération a validés ces six derniers mois.
- **Discipline du club** : pour la présidence et les coachs seulement, les sanctions sur 12 mois, celles encore en délai d'appel et les amendes à payer.
- **Les clubs de la fédération** : une carte par club affilié, avec son logo, sa ville, son année de création, sa présidence, sa salle de domicile et, discrètement, ses titres (seulement ceux que le club a rendus publics dans son Hall of fame).

L'année de création se renseigne dans Réglages, Club (migration `0145_club_founded.sql`). Un club sans fédération voit une invitation à demander une affiliation ; une fédération n'a pas cette page.

## Garde-fous

- `tests/integration/club-federation.integration.ts` : club A et club C dans la fédération 1, club B dans la fédération 2. Club A voit sa fédération, ses circulaires, son tournoi, sa discipline et les clubs A et C, jamais le club B ni le tournoi de la fédération 2 ; un joueur ne voit pas la discipline ; un club sans fédération ne voit rien ; une fédération est refusée ; l'année de création s'enregistre dans ses bornes.
- `tests/e2e/club-federation.spec.ts` (390 px, axe) : le menu, la barre du haut sans équipe, chaque cadre de la page.
- Les tests du menu, de la visite guidée et de la barre du haut suivent ces changements ; `tests/e2e/teams.spec.ts` vérifie qu'une page n'est jamais filtrée en cachette.
