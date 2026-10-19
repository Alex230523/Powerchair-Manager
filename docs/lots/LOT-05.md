# Lot 05 — Documents et retrait de la vérification email

## Autorisation, audit et périmètre

Le lot 04 a été accepté par « continue (+ enleve la vérification par email) ». Le « continue » reçu pendant le travail confirme la poursuite de ce lot ; il ne vaut pas validation d’un lot non encore livré.

Audit avant modification : règles AGENTS, routes et services comptes/personnes/inscriptions/notifications, contrôles email, permissions, migrations 0000–0009, tests et exigences Documents du PDF. La stack Next.js/TypeScript/PostgreSQL/Better Auth est conservée, sans nouvelle dépendance. Les références sous sources/ sont inchangées. Le plan annoncé couvre bibliothèque privée, versions, validation, échéances, règles saisonnières et partage fédéral révocable.

Le PDF demande aussi des règles par compétition/règlement : ces sources métier n’existent pas encore. Elles ne sont pas simulées ; la configuration actuelle porte sur saison, rôle sportif et tranche d’âge. Le dashboard et son moteur général de tâches restent au lot 10.

## Nouvelle politique de compte

La vérification d’email n’est plus requise, pour les comptes existants comme pour les nouveaux. L’inscription n’envoie plus d’email de vérification. Le bouton correspondant et les barrières côté serveur sont retirés des mandats, invitations, personnes, inscriptions et notifications. Les anciens messages de vérification encore en attente sont annulés par migration et ne sont plus envoyés.

Aucun compte n’est marqué artificiellement comme vérifié : le champ historique emailVerified conserve son sens. Le compte doit rester actif, la session valide, le mandat courant et la ressource autorisée. MFA demeure obligatoire pour les actions administratives et l’ouverture de pièces sensibles. La récupération de mot de passe conserve son mécanisme par lien ; les notifications utiles restent actives. Aucun mot de passe existant n’a été changé.

Les adresses ne sont donc pas attestées. Le club doit contrôler l’identité lors de l’invitation, de l’admission et de l’association d’une fiche ; la possession du lien d’invitation reste requise. Un nom déclaré, une inscription ou une adresse seule ne confère pas d’accès familial ou administratif.

Les rapports des lots précédents décrivent l’ancienne politique de vérification. Ce document et le README courant la remplacent.

## Migration et structure

La migration additive 0010 crée document_rule, club_document, document_version, document_template, document_history, document_share et document_task. Elle ajoute documents.read, documents.manage et documents.sensitive aux délégations et document_update au moteur de notifications. Elle annule les anciens emails auth_verify en attente sans modifier les utilisateurs.

Un document possède organisation, propriétaire facultatif (profil ou organisation), saison, catégorie, sensibilité, état, version courante et éventuelle échéance. Les catégories sont identité administrative, inscription, licence, assurance, aptitude, consentement, formation, contrat et comptabilité. Les fichiers ont des versions numérotées, auteur du dépôt, vérificateur, décisions et références de génération/import. Les octets déposés ne sont pas remplacés ; une nouvelle version s’ajoute. L’historique garde les décisions successives, y compris une correction de validation.

Le contenu des fichiers est chiffré AES-256-GCM en base, avec une clé dérivée de BETTER_AUTH_SECRET et une authentification liée à l’identifiant de version. Conserver la base ET ce secret : sa perte rend les fichiers illisibles, comme les secrets MFA et emails en attente. Les téléchargements restent authentifiés, privés, sans cache, forcés en pièce jointe et confinés. Aucun lien public permanent n’est produit.

Migrations réexécutables via `npm run db:migrate`. Les migrations déjà appliquées ne doivent pas être modifiées. Sauvegarde et restauration testée sont nécessaires avant production ; pas de suppression automatique des documents pour revenir en arrière.

## Matrice d’accès

| Opération | Autorité |
| --- | --- |
| Lire/télécharger ses documents ordinaires | Profil actif lié au compte, mandat actif dans ce club |
| Lire les documents d’un enfant ou adulte accompagné | Mandat représentant et relation vérifiée/déléguée, valide et autorisant la lecture |
| Déposer/remplacer pour une personne représentée | Même contrôle, avec droit d’édition |
| Gérer demandes, règles, modèles, validations et partages | documents.manage, MFA et contexte de l’organisation |
| Lire les pièces ordinaires du club sans les administrer | documents.read avec MFA |
| Accès du personnel aux pièces sensibles | Habilitation documents.sensitive explicitement inscrite dans le mandat, plus droit de lecture/gestion et MFA |
| Accès personnel à une pièce sensible | Droit sur son profil ou relation autorisée et MFA |
| Lire une pièce depuis une fédération | Partage explicite en cours, version courante validée, documents.read, MFA ; habilitation sensible explicite si nécessaire |

La présidence ne suffit pas à ouvrir les pièces sensibles sans habilitation explicite sur le mandat. Elle peut organiser les délégations depuis les invitations du lot 01. Les certificats d’aptitude sont toujours sensibles. Une règle devenue plus restrictive protège aussi les demandes existantes ; la désactiver ou l’assouplir ne déclassifie pas leurs fichiers.

Les droits ne sont pas fusionnés entre mandats. Une relation seulement déclarée ne donne aucun accès. Le lien légal cesse de permettre l’accès à la majorité ; une délégation datée reste une procédure distincte. Révocation, désactivation et changement de contexte sont revérifiés à chaque requête et téléchargement. Les anciens profils inactifs ou transférés ne restent pas accessibles au joueur par simple possession d’une URL.

## Parcours disponibles

Ouvrir `/fr/documents` ou `/nl/documents` après choix du mandat. La bibliothèque propose recherche par nom/propriétaire, filtres par état et catégorie, métadonnées de saison et versions téléchargeables. Elle examine les 300 documents les plus récents du périmètre puis filtre selon les droits ; cette limite est annoncée et il n’y a pas encore de pagination serveur.

Le responsable crée une demande pour un profil ou pour l’organisation, puis le propriétaire ou représentant autorisé dépose un PDF, PNG ou JPEG (2 Mo maximum, type et signature binaire contrôlés). Le dépôt reste « Déposé ». Le responsable passe en vérification, valide avec une échéance facultative, refuse avec motif, demande un complément ou archive. Un fichier est indispensable pour une validation ; un motif est obligatoire pour refus ou complément. Le remplacement remet la pièce en attente de vérification et conserve les anciennes versions. Répéter immédiatement le même dépôt ne crée pas une version en double.

Les pièces sensibles ne doivent pas servir de champ libre de diagnostic. Préférer une attestation d’aptitude à un dossier clinique complet. Le contrôle de format ne remplace ni un antivirus ni une vérification humaine de l’émetteur ou du contenu. Aucun document n’est une preuve officielle automatique de licence ou de droit de jouer.

### Règles et admissions

Le responsable configure les documents obligatoires par saison, rôle sportif et âges, puis lance « Préparer les demandes obligatoires ». La génération est idempotente : une seule demande par profil/règle. La saison d’une règle existante est immuable ; créer une nouvelle règle pour une nouvelle saison. Les règles ne sont pas des règlements fédéraux officiels et aucune liste arbitraire de pièces obligatoires n’est préinstallée.

L’application des règles consomme les intentions documents des admissions de cette saison. Les intentions cotisations restent en attente du lot 08. Les pièces d’une inscription acceptée peuvent être reprises explicitement dans une demande du même profil ; la provenance est enregistrée et l’import reste un dépôt non validé. Aucune pièce médicale n’est automatiquement déduite d’un champ général du formulaire.

### Modèles

Les modèles FR/NL possèdent des versions et uniquement les variables {name}, {organization}, {season}, {date}. La génération produit un fichier texte privé, relié à la version du modèle et encore à vérifier. Il n’y a pas de moteur de code, de génération PDF mise en page ni de signature électronique certifiée.

### Partage fédéral

Un responsable peut partager une version validée avec une fédération identifiée, jusqu’à une date ne dépassant pas celle du document. L’accès exige une session et un mandat autorisé dans cette fédération. La révocation prend effet immédiatement. Un nouveau dépôt ou l’expiration retire l’accès à l’ancienne version ; la fédération ne reçoit aucun accès général aux dossiers privés du club. Les téléchargements sont tracés. Il ne s’agit pas d’une copie incontrôlable ni d’un lien anonyme.

### Échéances et notifications

`npm run docs:worker` contrôle les expirations environ toutes les minutes ; `npm run docs:worker -- --once` effectue un passage et s’arrête. La consultation déclenche aussi le recalcul dans son périmètre. Un document validé expiré devient Expiré, ouvre un suivi documentaire unique et produit une notification sans détail sensible aux destinataires encore autorisés. Une nouvelle validation clôture ce suivi. Les demandes et dépôts ont aussi leur suivi « à fournir » ou « à vérifier ».

Ces suivis sont des enregistrements documentaires persistants, destinés au futur dashboard ; le moteur général de tâches du lot 10 n’est pas déclaré livré. Les nouvelles notifications passent par la file existante, qui recalculera encore l’accès au moment de l’envoi. Les emails restent capturés localement ; aucun fournisseur externe n’a été activé.

## Limites de livraison

Préproduction distante, antivirus, stockage objet, quotas globaux, conservation/purge automatisée et restauration complète ne sont pas validés. Les migrations et contrôles locaux ne constituent pas une certification de sécurité ou d’accessibilité. Les règles sportives par compétition et les autorisations médicales officielles restent à établir avec les personnes compétentes.

L’archive est conservée en lecture autorisée ; la réouverture d’une archive et la suppression définitive ne sont pas proposées. Le téléchargement force une pièce jointe, sans aperçu intégré. Les modèles sont en texte, pas en PDF. La gestion d’une saison, d’une fiche ou d’un mandat doit être préparée avant de tester les documents ; aucun faux dossier n’est créé dans Club pilote.

Le lot 06 — Calendrier n’est pas commencé et attend une validation explicite de ce lot 05.
