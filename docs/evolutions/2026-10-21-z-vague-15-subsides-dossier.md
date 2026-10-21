# Vague 15, observation C2 : subsides, dossier complet, check-list attribuée, organismes et année suivante (21 octobre 2026)

Migration `0034_grant_files.sql` (ajouts seulement). La page Subsides de la vague 11 garde ses champs, statuts, tuiles et droits ; elle devient un vrai dossier, sur le modèle de la fiche partenaire (C1), et partage la même liste de tâches et la même couche « Échéances ».

## Organismes

- Nouvelle table `grant_funder` : un organisme par club (ADEPS, COCOF, commune…), avec site internet, email général, téléphone, adresse, notes et personne de contact choisie dans le carnet. Ses coordonnées servent à tous ses dossiers, d'une année à l'autre.
- La migration crée un organisme par nom déjà écrit dans les demandes de chaque club (sans tenir compte des majuscules ni des espaces) et y relie les demandes existantes. Rien n'est perdu : la colonne texte `funder` reste et suit le nom de l'organisme.
- Dans la fenêtre de demande, le champ « Organisme » propose les organismes connus ; un nom nouveau crée l'organisme, un nom connu (quelle que soit la casse) le réutilise.
- Un contact relié à un organisme ou à un dossier reçoit l'étiquette « Pouvoirs publics ». Dans le carnet, chaque contact affiche des liens vers ses dossiers (subsides, partenaires, organismes) au lieu d'un simple nombre.

## Liste

Colonnes : subside (ouvre la fiche, avec l'objet et la saison), date limite (badge « Dans moins de 14 jours » ou « Date dépassée » tant que le dossier n'est pas déposé, avec une icône en plus de la couleur), demandé / accordé, statut, check-list (« 3 sur 8 » et une barre fine), contact (lien vers le carnet), prochaine étape. Filtres : statut, saison, organisme, « Mes tâches » (dossiers où j'ai une étape).

## Fiche (panneau latéral, onglets Détail, Check-list, Historique)

- **Détail** : objet, montants, toutes les dates (dont la fin de la période couverte et la date « À revérifier le »), contact, lien vers l'appel, conditions du programme, explication pour l'équipe, notes. Boutons « Modifier », « Dossier de l'année précédente », « Préparer l'année prochaine » ou « Ouvrir le dossier de l'année prochaine ».
- **L'organisme** : coordonnées, personne de contact, autres dossiers chez cet organisme (ouvrables), « Modifier l'organisme ».
- **Équipement financé** : les fauteuils du module Équipement, à cocher avec leur valeur d'achat ; un fauteuil financé par un autre subside n'est pas cochable. « Exporter en Excel » télécharge la liste avec le total, pour le justificatif.
- **Check-list** : « Ajouter la check-list type » ajoute, dans la langue de l'utilisateur, huit étapes habituelles (lire l'appel, réunir les statuts et les comptes, rédiger, faire signer, déposer, suivre la décision, récolter les factures, rendre le justificatif), sans doublon si on clique deux fois. Chaque étape est une tâche C1 : date, responsable parmi les personnes du club qui ont un compte, preuve par lien ou fichier, case cochée tout de suite à l'écran.
- **Historique** : création, modifications, organisme, check-list, étapes, équipement, année suivante, avec l'auteur.

## Année suivante

« Préparer l'année prochaine » crée une seule fois le dossier suivant : même organisme, programme, lien, conditions et explication, statut « Idée », dates décalées d'un an (le 29 février devient le 28), saison suivante si elle existe, check-list recopiée sans les coches ni les responsables. Les deux dossiers se renvoient l'un à l'autre. Supprimer un dossier garde le dossier suivant et les fauteuils ; ils perdent seulement le lien.

## Tâches, calendrier, accueil, rappels

- Page des tâches (`/tasks`) : nouveau filtre Tout, Sponsor, Subside ; `/tasks?kind=grant` ouvre directement les subsides.
- Accueil : nouvelle tâche « Tâches de subsides » (dans les 14 jours ou en retard : toutes pour le président, les siennes pour un responsable). Les dates de subsides de « Prochains événements » ouvrent la fiche.
- Couche « Échéances » du calendrier (et abonnement ICS) : en plus de la date limite et du justificatif, la fin de la période couverte et la date « À revérifier ».
- Rappels : le responsable d'une étape reçoit le rappel de C1 7 jours avant ; le président reçoit en plus un rappel 14 jours avant la date limite d'un dossier encore à l'état « Idée » (une seule fois par dossier).

## Droits

Lecture : droit Argent en lecture ; modification, organismes, check-list, année suivante et équipement : droit Argent en gestion. Un responsable d'étape sans droit Argent voit et coche ses étapes seulement. Toutes les requêtes filtrent par organisation ; un organisme, un dossier ou un fauteuil d'un autre club est refusé.

## Tests

- Unitaires (`tests/wave15-grants.test.ts`) : huit étapes en trois langues, badge de date limite, dates de l'année suivante, liens web seulement, textes fr/nl/en identiques et sans tiret long, place de la tâche à l'accueil.
- Intégration (`tests/integration/wave15-grants.integration.ts`, deux clubs) : organismes créés par la migration et propres à chaque club, nom réutilisé quelle que soit la casse, champs gardés à la modification, organisme d'un autre club refusé, organisme modifié et contact étiqueté, check-list ajoutée une seule fois, étape du coach visible sur son accueil et sa couche seulement, autre club vide, année suivante créée une fois avec les étapes décochées, fauteuil d'un autre club refusé, export Excel, suppression qui garde les liens.
- Bout en bout (`tests/e2e/grants.spec.ts`) : dossier ADEPS, check-list type, étape donnée au coach, accueil et page des tâches du coach, année suivante, 390 px, axe à chaque étape.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
