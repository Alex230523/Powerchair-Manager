# Inscriptions, coachs, réglages et finances du club (19 octobre 2026)

## Menu

| Groupe          | Contenu                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| Joueurs         | Joueurs, Inscriptions (ou Mes inscriptions), Présences                               |
| Vie du club     | Calendrier, Documents, Messagerie                                                    |
| Gestion du club | Gestion du club, Gestion des coachs, Matériel                                        |
| Finance du club | Financement, Cotisations                                                             |
| Administration  | Notifications, Réglages, Mon espace                                                  |
| Fédération      | Formations des coachs, Calendrier, Documents, Messagerie (profil fédéral uniquement) |

Gestion du club passe au-dessus de Finance du club. Le logo du club apparaît dans la barre du haut.

## Gestion du club (`/club/manage`)

- Identité : nom, e-mail de contact, logo (PNG, JPEG ou WebP, 512 Ko maximum, signature du fichier vérifiée). Le logo est servi par `/api/club/logo?org=…` (public, comme sur un formulaire d'inscription).
- Équipes : un club peut avoir plusieurs équipes dans la même saison ; chaque carte montre le nombre de joueurs et les coachs.
- Droits : `mandates.manage` (président) avec double authentification.

## Financement (`/funding`)

- Quatre cadres en haut : trésorerie (solde de toutes les opérations), recettes de la saison, dépenses de la saison (avec le résultat), cotisations prévues (et montant attendu dans les 30 jours).
- Saisie d'une recette ou dépense (catégorie, moyen de paiement, tiers, référence). Pas de date future.
- Répartition par catégorie, historique filtrable, export CSV. Une opération n'est jamais supprimée : elle est annulée avec un motif et reste visible, barrée.
- Droits : `dues.manage` + double authentification. La fédération ne voit pas les finances des clubs.
- Le rapprochement bancaire viendra avec le lot 09 (non modifié ici).

## Réglages (`/settings`)

- Le président coche, pour chaque coach ou membre, les droits délégables (regroupés par thème) avec trois préréglages : coach terrain, coach principal, aucun accès. Il ne peut déléguer que ce qu'il possède ; un administrateur ou lui-même ne sont pas modifiables.
- Équipe suivie par un coach (périmètre de son mandat).
- « Je suis aussi coach » : la fiche existante du président reçoit le rôle de coach (et éventuellement une équipe). Aucune fiche en double : si une fiche sans compte porte déjà son nom, l'action est refusée (`DUPLICATE`) et il faut lier le compte à cette fiche.

## Gestion des coachs

- Liste : « Fiche complète » ouvre `/coaches/[id]`.
- Fiche coach : coordonnées (gestion du club), équipes encadrées (en cours et passées), prochains matchs et entraînements de ses équipes avec sa réponse, présences par type (entraînements, matchs) sur les registres clôturés, formations.
- Formations : la fédération crée le catalogue (`/federation/courses`) ; le président de club demande l'ajout d'une formation pour un coach ; le président fédéral valide (date d'obtention, validité calculée) ou refuse. Un travailleur fédéral consulte sans décider.

## Inscriptions

- Bouton « Partir du modèle Tigerstorm » : 18 questions inspirées du formulaire public du club (adresse, représentant, fauteuil et modèle, commande, expérience, transferts, accompagnement, séance d'essai, disponibilité du samedi, certificat médical, droit à l'image, RGPD, règlement et cotisation de 250 €, signature). À relire avant publication : le formulaire d'origine n'a pas pu être lu automatiquement.
- Cliquer sur un formulaire ouvre une fenêtre avec l'aperçu des questions, le lien public et deux codes à copier : `iframe` et bouton qui ouvre le formulaire dans une fenêtre (`window.open`).
- La demande affiche une fiche complète : candidat, naissance et âge, statut, formulaire, type de dossier, date de soumission, déposant (nom et e-mail) et toutes les réponses, y compris « Non renseigné » et les pièces.

## Import de joueurs (Excel)

- Bouton « Importer (Excel) » sur la page Joueurs (gestionnaires du répertoire).
- Fichier `.xlsx` (première feuille) ou `.csv` (virgule, point-virgule ou tabulation) lu dans le navigateur ; aperçu avant envoi, lignes en erreur listées et ignorées.
- Titres reconnus en français, néerlandais et anglais (nom complet ou prénom + nom, date de naissance, e-mail, téléphone, date d'arrivée, poste, numéro). Dates JJ/MM/AAAA, AAAA-MM-JJ ou date Excel.
- 300 joueurs maximum par import, équipe facultative ; les joueurs déjà présents (même nom et même date de naissance) sont ignorés.

## Données

- Migration additive `0020_club_identity_finance_courses.sql` : `organization_logo`, `finance_transaction`, `training_course`, `training_request`.
- Toutes les actions sont journalisées dans `audit_log` (`finance.*`, `organization.*`, `mandate.grants`, `training.*`, `people.selfCoach`, `people.importPlayers`).

## Démo

- Le président (Alex Martin) est aussi coach de l'Équipe B, deuxième équipe du club.
- Neuf opérations financières fictives sur la saison.
- Formulaire d'inscription basé sur le modèle Tigerstorm et une demande remplie.
- Nouveau compte `federation@demo.pfm` (Fédération démo Powerchair) avec trois formations, une formation validée et une demande en attente pour le coach Sam Leroy.

## Tests

- `tests/club-coaches-finance.test.ts` : soldes et saison, schémas, validité des formations, présences des coachs, modèle d'inscription, lecture CSV/XLSX et dates, couverture des droits, parité des traductions.
- `tests/integration/club-coaches.integration.ts` : grand livre et refus, identité et logo, délégation des droits, président coach sans doublon, import avec doublons, circuit des formations.
