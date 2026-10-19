# Vague 4 : espace fédération, inscription sans compte, signature électronique (19 octobre 2026)

## Licences et classifications

- **Club** (`/licenses`, menu Joueurs) : liste des joueurs actifs avec la licence de la saison et l'état de la classification ; sélection multiple pour demander les licences à la fédération ; « Demander la validation » d'une classification (PF1, PF2 ou évaluation en cours).
- **Fédération** (`/federation/licenses`) : demandes à traiter (délivrance en lot, numéro « 2026-0001 » par saison, ou refus avec commentaire), suspension motivée ; classifications à valider (classe finale PF1/PF2, date de validité, commentaire) ; **transferts** entre clubs affiliés (en attente, accepté, annulé, expiré).
- La fédération ne voit que le nom, l'année de naissance et le club : jamais les coordonnées ni les données de santé.
- Si le club modifie lui-même la classification ou sa validité, elle repasse « non vérifiée ».
- Fiche joueur : licence et état de la classification affichés dans la vue sportive.
- Notifications « Licences » (modèle modifiable) vers la fédération (nouvelles demandes) et le président du club (décisions).

## Calendrier fédéral

`/federal-calendar` (menu Vie du club) : les événements que la fédération publie pour tous ses membres (tournois, stages, réunions) sont visibles des clubs affiliés.

## Inscription sans compte

- Sur le formulaire public, une personne sans compte laisse son nom et son e-mail et reçoit un **lien personnel** valable 30 jours (nouveau modèle de notification « Lien d'inscription par e-mail »).
- Le lien ouvre l'espace candidat de ce formulaire : créer le dossier, répondre, déposer les pièces, soumettre, suivre la décision. Ouvrir le lien confirme l'adresse.
- Sécurité : le lien n'est accepté que par les routes d'inscription (jamais ailleurs dans l'application) ; une adresse appartenant à un compte du personnel ne reçoit pas de lien (connexion avec mot de passe et double authentification) ; trois liens par heure et par adresse, 200 par heure et par formulaire, champ piège anti-robot ; la réponse est la même quelle que soit l'adresse.

## Signature électronique

- Un document généré à partir d'un modèle du club (Documents, « Générer ») peut être signé par la personne concernée ou par un représentant autorisé à agir pour elle.
- Signature : nom du signataire, tracé dans un cadre (souris, doigt ou stylet), case « lu et approuvé ».
- Le texte signé devient une nouvelle version du document, avec le nom, le compte, la date et l'heure de Bruxelles et l'empreinte SHA-256 du texte ; le tracé est conservé à part. Le club vérifie ensuite le document comme un dépôt.
- Il s'agit d'une signature électronique simple (preuve d'acceptation), pas d'une signature qualifiée eID.

## Données

Migration `0024_licenses_guest_signature.sql` : licences, état de classification, liens d'inscription, signatures, deux nouveaux types de notification.

## Démo

- Licences demandées pour cinq joueurs, dont deux délivrées ; classification de Camille validée PF2, celle d'Emma en attente.
- « Tournoi BPCF des jeunes » au calendrier fédéral.
- L'autorisation parentale de Lucas est générée depuis un modèle : Nadia (`parent@demo.pfm`) peut la signer.

## Tests

- `tests/wave4.test.ts` : numéros de licence, validations, formulaire du lien, traductions.
- `tests/integration/wave4.integration.ts` : inscription par lien (création du compte sans mot de passe, refus pour le personnel, dossier soumis et vu par le club), signature d'un parent, licences et classifications, calendrier fédéral.
