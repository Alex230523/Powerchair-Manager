# Vague 17, J3 : bourse aux transferts entre clubs (22 octobre 2026)

Revue du 21 octobre, point J3. Les règles de consentement ont été validées telles quelles.

## Pages
- `/[locale]/transfers` : « Bourse aux transferts ». Elle est dans le menu des clubs (droit de lecture des joueurs), dans « Mon espace » des joueurs et des parents (pour leur visibilité) et dans celui de la fédération.
- L'ancienne page « Transferts » s'appelle maintenant « Licences » (licences et classifications).

## Consentement
Le réglage « Visible par les autres clubs de la fédération » est décoché par défaut (table `transfer_visibility`, par personne).
- Seul le joueur adulte, ou un parent pour un mineur, peut le cocher ; une date de naissance inconnue compte comme mineur.
- Le club ne peut pas le cocher à sa place.
- On le coche depuis la bourse (« Ma visibilité ») ou pendant la création de compte (I2).
- Le retrait est immédiat.
- Un joueur sans club (profil inactif, départ) reste visible sous « Sans club » s'il l'a choisi.

## Liste
Toolbar : recherche, club (avec « Sans club »), classification, province, catégorie d'âge.

Chaque ligne donne : nom, club et équipe actuels, province du club, classification (badge et infobulle J4), catégorie d'âge, saisons jouées.

Jamais de date de naissance, photo, adresse, email, téléphone, donnée de santé ni document : l'API ne les renvoie pas. La province d'un club (`organization.province`) est réglée par la fédération dans l'onglet « Provinces des clubs ».

## Fiche sportive
Une fenêtre avec l'identité ci-dessus, puis :
- les statistiques par saison (matchs, minutes, buts, passes, depuis `match_player`) ;
- l'historique des clubs ;
- les tournois et places obtenues (palmarès).

Le bouton « Demander un transfert » apparaît pour le président ou une personne qui gère les joueurs, jamais pour un joueur de son propre club.

## Demande de transfert
La demande précise la saison visée, un montant (si les règles l'autorisent, sous le plafond) et un message. Table `transfer_offer`, statuts : envoyée, en discussion, acceptée, refusée, retirée, validée par la fédération.

À l'envoi :
- **Conversation** entre les deux clubs (`transfer_message`), un fil d'un type à part. Elle est lisible seulement par les présidents et les personnes qui gèrent les joueurs des deux clubs, droits vérifiés à chaque lecture. On la retrouve dans la bourse et dans Messagerie (« Conversations entre clubs »).
- **Accord du joueur** : le joueur, ou un parent, est prévenu et doit donner son accord avant toute acceptation.
- **Acceptation** par le club actuel, qui part à la fédération. Sa validation déplace le joueur comme le transfert par lien existant (`moveProfile`, partagé avec `people/service.ts`) et apparaît dans la liste des transferts de ses licences. La page Licences de la fédération affiche le nombre de transferts à valider.
- **Joueur « Sans club »** : son accord vaut acceptation, puis la fédération valide.

Notifications aux clubs, au joueur ou à ses parents, à chaque étape.

## Règles de la fédération
Dans la bourse, onglet « Règles » (table `transfer_rules`) :
- périodes d'ouverture (sans période : ouverte toute l'année) ;
- montant autorisé ou non, avec plafond ;
- nombre maximum de transferts par saison et par club ;
- validation obligatoire par la fédération (oui par défaut) ;
- texte des règles, affiché en tête de la bourse.

Une demande hors période est refusée.

## Tests
- Unitaires (`tests/wave17-transfers.test.ts`) : consentement par défaut, majorité, règles, étapes, commandes, libellés et textes en trois langues.
- Intégration (`tests/integration/wave17-transfers.integration.ts`) :
  - joueur non consentant invisible ;
  - mineur visible seulement avec l'accord du parent ;
  - aucune donnée personnelle dans l'API ;
  - demande hors période ou au-delà du plafond refusée ;
  - conversation réservée aux deux clubs ;
  - accord du joueur obligatoire ;
  - validation fédérale ;
  - joueur sans club ;
  - maximum par saison.
- Bout en bout (`tests/e2e/transfer-market.spec.ts`) : visibilité, fiche, demande, conversation (bourse et Messagerie), accord, acceptation, validation, axe et 390 px.
- Libellés de menu mis à jour dans les tests des vagues 11 et 14 et `new-pages.spec.ts`.
