# Documents en dossiers et modèles d'emails (02/11/2026)

Point 10 de l'avis. Migration `0108_folders_mail_templates.sql`.

## Documents en dossiers

- La page Documents s'ouvre sur l'onglet « Dossiers » (vue « drive ») ; l'ancienne vue reste dans l'onglet « Liste détaillée ».
- Une grille de grands dossiers : un par type de document (la carte d'identité n'est plus proposée ; son dossier n'apparaît que s'il reste des documents de cette catégorie retirée), plus « Documents du club » (les documents sans propriétaire). Chaque dossier montre son nombre de fichiers et des pastilles « à vérifier » et « expirés ».
- Dans un dossier : sous-dossiers par saison (la plus récente en haut), puis les fichiers avec propriétaire, statut et date d'expiration ; fil d'Ariane (Documents › Assurance › 2026-2027) ; vue liste ou vignettes ; recherche globale sur tous les documents visibles.
- Dossiers libres (`document_folder`, avec sous-dossiers) pour les documents du club : statuts, PV, contrats, modèles. Visibilité : présidence (président et gestion des documents), staff (tous les mandats sauf joueurs et parents) ou tous les membres.
- Un dossier ne change jamais les droits (`docAccess`, `src/domains/documents/access.ts`) : hors du cercle d'un dossier libre, rien de ce qu'il contient n'est visible ; dans ce cercle, seul un document du club sans propriétaire, non sensible et déposé y est lu en plus. Un document sensible reste réservé à `documents.sensitive`, un joueur ou un parent ne voit que ses propres documents. La même règle sert à la liste, à la vue « drive » et au téléchargement.
- Déplacer un document : glisser sur un dossier, ou « Déplacer Statuts vers… » au clavier (liste + bouton).
- Dépôt par glisser-déposer (ou bouton « Ajouter un fichier ici ») dans un dossier de saison ou un dossier libre : le type et la saison sont préremplis.

## Modèles d'emails

- `mail_template` par club : nom, usage (rappel de cotisation, invitation à un événement, rappel de document, nouvelle saison, bienvenue à une nouvelle recrue, invitation à un match, remerciement sponsor, libre), objet et corps en fr, nl et en ; variables insérées par un menu ({prénom}, {équipe}, {événement}, {date}, {lieu}, {montant}, {échéance}, {lien}, {club}), refus d'une variable inconnue.
- Sept modèles proposés à chaque club (créés à la première ouverture de la bibliothèque, puis modifiables), au ton chaleureux, dans les trois langues ; le modèle de match parle de joueurs attendus.
- Page `/communication/templates` (lien « Modèles d'emails » dans Communication) : aperçu avec une vraie personne du club et un événement, dans la langue de cette personne ; « M'envoyer un test » ; « Envoyer » à des groupes de destinataires existants ou aux invités d'un événement ; dupliquer, archiver ; historique des envois par modèle (`mail_template_send`).
- Depuis un événement (fiche de l'événement, section des invitations) : « Envoyer une invitation » ouvre la fenêtre avec le modèle d'invitation déjà rempli avec l'événement, modifiable avant l'envoi.
- Relances de cotisation et de documents (manuelles et automatiques) et automatisations B7 : « Modèle d'email » dans leur réglage (`mail_template_binding`) ; sans modèle choisi, le texte par défaut reste.
- Chaque destinataire reçoit le message dans sa langue ; les messages non obligatoires (nouvelle saison, bienvenue, remerciement, libre) portent le lien « Ne plus recevoir ces messages » (même page `/desinscription/[id]` que les newsletters) et ne partent plus vers une adresse désinscrite ; tout passe par la file d'emails existante, avec un plafond de 2000 emails par jour et par club pour les modèles.
- Droits : la gestion des messages du club (`notifications.manage`) écrit les modèles et envoie aux groupes ; ceux qui planifient le calendrier (et les coachs) envoient une invitation aux invités d'un événement.

## Vérification

- `npx vitest run tests/drive-templates10.test.ts`.
- `npm run test:integration` (`tests/integration/drive-templates10.integration.ts`) : dossiers par type et saison, dossier libre de la présidence, document sensible invisible sans droit dans un dossier partagé, déplacement, modèle rempli avec une vraie personne, invitation depuis un événement dans la langue du destinataire, relance avec un modèle modifié, test, désinscription, deux clubs.
- `tests/e2e/drive-templates.spec.ts` avec axe et à 390 px ; `tests/e2e/documents.spec.ts` passe par l'onglet « Liste détaillée ».
