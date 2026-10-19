# Joueurs, coachs et navigation — 19 octobre 2026

## Périmètre

Après validation de la version précédente, adaptation demandée à partir de la seconde capture : tableau aéré, initiales, filtres, boutons arrondis et fiche en fenêtre. Aucun regroupement scout, donnée de démonstration, taux de présence ou état de paiement fictif n’est ajouté.

L’audit du module Personnes existant a confirmé la disponibilité des identités privées, équipes, affectations, statuts, droits familiaux, exports et inscriptions. Ces services sont réutilisés ; pas de nouvelle dépendance. Les chemins ajoutés existent en FR/NL/EN : `/players`, `/players/former`, `/coaches`, `/coaches/former`, `/club/manage`, `/funding`.

## Joueurs et fiches

Recherche, équipe, poste principal et âge minimum selon les droits. Tableau : nom, équipe, poste, numéro de maillot, âge accessible et actions. Cliquer sur le nom ou Voir le profil ouvre une fenêtre native avec retour au clavier et fermeture par Échap. Informations personnelles en premier, puis informations de jeu : poste principal libre avec suggestions Powerchair, numéro de 0 à 99, équipes et historique. Le numéro n’est pas une inscription officielle ni une contrainte d’unicité entre équipes. Les affectations gardent leurs propres postes et périodes.

Les liens Gestion des inscriptions (ou Mes inscriptions selon les droits), Anciens joueurs et Cotisations sont disponibles depuis la liste ; inscriptions et cotisations également dans la fiche. L’export CSV réutilise le service sécurisé et les filtres. Aucun import Excel ni export PDF nouveau n’est prétendu fonctionnel.

Créer une fiche joueur/coach n’accorde aucun accès de connexion. Une personne existante peut être ajoutée au répertoire sans doublon d’identité. Une même personne peut être joueur et coach. Les admissions acceptées réactivent la catégorie joueur, conformément à la réactivation de fiche existante dans le module Inscriptions.

## Anciens et permissions

« Vers les anciens joueurs » demande une confirmation dans la ligne, conserve les informations et clôture uniquement les affectations de joueur. La fonction coach et les autres fonctions ne sont pas supprimées, les créances restent conservées. Réintégrer enlève le marqueur d’ancien mais ne rouvre pas les affectations terminées. Une nouvelle affectation d’un ancien est refusée tant qu’il n’est pas réintégré.

La gestion des personnes reste soumise à `people.manage` ; les informations de jeu et affectations à `teams.manage`. Les coordonnées et dates de naissance restent filtrées selon les autorisations existantes ; les contacts personnels/familiaux autorisés peuvent être modifiés sans octroyer de droits administratifs. Un classement sportif n’est pas un rôle de connexion. Les dates et révocations des accès restent contrôlées côté serveur.

## Espaces dédiés

Le menu latéral déroulant mène aux joueurs, coachs, gestion du club et financement. La gestion du club regroupe les formulaires existants de saisons, équipes, familles et transferts. Le périmètre des accès coachs se gère avec les autorisations existantes ; les comptes/invitations restent dans Mon espace.

Financement est une page d’entrée vers les cotisations du lot 08. Virements, QR, imports et rapprochement du lot 09 ne sont pas livrés par cette évolution. Sponsors, dons et subventions ne sont pas simulés.

## Migration

0015 ajoute `directory_roles`, `former_roles`, `playing_position` et `jersey_number` à `club_person`. Reprise des fonctions joueur/coach déjà présentes dans l’historique d’équipe ; les autres personnes ne sont pas classées arbitrairement comme joueurs. L’API conserve ses anciens contrats d’entrée : la catégorie est facultative lors d’une création classique.

Sauvegarder PostgreSQL avant déploiement partagé puis exécuter `npm run db:migrate`. Retour arrière par correction additive ; ne pas supprimer des colonnes déjà utilisées. Les migrations précédentes restent inchangées, et `sources/` reste en lecture seule.

## Recette

Contrôles de types et lint, régression des services et parcours navigateur : création, modification du poste/numéro, fermeture de la fiche au clavier, archivage/réintégration, conservation d’une double fonction, droits inter-clubs, affichage mobile et écrans FR/NL/EN. Résultats exécutés :

- `npm run check` : lint et TypeScript réussis, 33 tests unitaires réussis.
- `npm run test:integration` : 154 tests réussis, dont conservation joueur/coach, versions obsolètes et autorisations des nouvelles actions.
- `npm run test:e2e:db` : compilation de production et 17 parcours réussis. Total : 204 tests distincts.
- Contrôles axe ciblant WCAG 2.2 AA sur la fiche française et le répertoire anglais, contrôle de largeur à 375 px. Captures `player-list.png`, `player-profile.png`, `player-mobile.png` inspectées ; cela ne constitue pas une certification.
- Toutes les créations de recette sont confinées à des bases/schémas temporaires. Aucun faux joueur ajouté au club pilote.

Les premiers essais ont nécessité de corriger une assertion de casse dans un libellé et d’utiliser des comptes de test indépendants des précédents scénarios de révocation. Les résultats ci-dessus correspondent aux exécutions réussies après correction.
