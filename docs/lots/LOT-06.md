# Lot 06 — Calendrier

## Autorisation, audit et plan

Le lot 05 a été accepté par « okok continue ». Audit préalable : règles AGENTS, exigences Calendrier du PDF, migrations 0000–0010, équipes/saisons, rôles, relations familiales, pièces privées, file de notifications et tests existants. Les références synchronisées sous sources/ restent inchangées. La documentation Next.js fournie avec la version installée a été consultée avant les routes.

Stack conservée : Next.js/React/TypeScript, PostgreSQL, moteur email existant. Aucune dépendance supplémentaire. Plan annoncé avant codage : lieux, séries et occurrences, historique, conflits internes et ICS privés révocables ; tests de changement d’heure, exceptions et isolation. La vérification email reste supprimée ; MFA reste requise pour planifier et administrer.

## Migration 0011

calendar_place conserve adresse, coordonnées du lieu, capacité facultative, coût indicatif en centimes, accès PMR, sanitaires, parking, stockage, recharge, contraintes et archivage. Ce coût ne produit aucune écriture financière.

calendar_series contient la fréquence, le nombre d’occurrences et l’auteur. calendar_event matérialise chaque occurrence avec identifiant stable, ordre dans la série, dates locales, fuseau IANA, instants UTC, équipe, lieu, responsable, visibilité, matériel, consignes, état, exception et version. Les participants explicites et les documents sont reliés par des tables séparées avec clés étrangères d’organisation.

calendar_history conserve les anciennes et nouvelles valeurs avec auteur et date. calendar_feed conserve uniquement l’empreinte du jeton, son utilisateur, son mandat, son organisation, un filtre d’équipe facultatif, son expiration et sa révocation. Les capacités calendar.manage/calendar.read et les notifications calendar_update étendent les fondations existantes.

Migration additive, réexécutable, sans modification des anciennes migrations. Sauvegarder et tester une restauration avant production ; pas de rollback supprimant les événements. Les nouveaux événements du pilote sont des données utilisateur : aucun exemple n’est injecté dans Club pilote.

## Autorisations

| Opération | Autorité |
| --- | --- |
| Administrer tous les lieux/événements du contexte | calendar.manage et MFA |
| Planifier pour une équipe | Coach avec MFA et périmètre d’équipe actif ; aucune fusion avec un autre mandat |
| Lire tout le planning privé du contexte | calendar.read et MFA, ou gestion autorisée |
| Lire un événement d’organisation | Membre actif de cette organisation |
| Lire un événement d’équipe | Coach habilité, joueur actuellement affecté, représentant autorisé d’un membre de l’équipe |
| Lire un événement à participants limités | Personne concernée ou représentant autorisé ; le responsable explicitement désigné y accède aussi |
| Lire un événement réservé au personnel | Gestion/lecture générale autorisée ou responsable désigné |
| Ouvrir un document associé | Droits propres du module Documents ; la présence dans le calendrier n’accorde aucun accès |
| Consulter un abonnement ICS privé | Possession du lien ET compte, mandat, appartenance et droits encore valides |

Le coach peut choisir uniquement son équipe, la visibilité équipe et lui-même comme responsable. Il ne peut pas ajouter les joueurs d’une autre équipe. Les personnes ordinaires ne reçoivent pas la liste des coéquipiers : seuls leurs propres profils ou personnes représentées apparaissent dans les participants. L’historique détaillé est réservé aux responsables du périmètre ; il ne divulgue pas à un joueur d’anciennes consignes privées.

Un lien familial déclaré seul n’accorde aucun accès. Les dates de délégation, la révocation et la majorité sont recalculées à la consultation et à chaque lecture du flux. Une capacité déléguée ne donne aucun droit sur un autre club.

## Parcours et décisions

### Événements et lieux

Ouvrir `/fr/calendar` ou `/nl/calendar` après choix du mandat. Les vues liste, mois, semaine et agenda proposent date de référence, équipe et lieu. L’affichage du planning utilise Europe/Brussels ; le détail montre aussi les dates locales et le fuseau d’origine. La recherche porte sur une période maximale de 366 jours et les 1 000 premiers événements avant filtrage des droits ; une pagination complète reste à prévoir.

Types disponibles : entraînement, match amical, réunion, tournoi, stage, événement associatif et type personnalisé nommé. Il s’agit de planning, pas de rencontres officielles homologuées. Chaque événement possède un responsable actif de l’organisation, une visibilité explicite, du matériel, des consignes et éventuellement des pièces associées.

Les membres actuellement affectés à l’équipe constituent les participants prévus, avec ajouts explicites possibles par le responsable habilité. La liste est recalculée selon les affectations courantes : elle ne constitue ni une convocation, ni une réponse de disponibilité, ni un registre de présence. Ces fonctions attendent le lot 07.

La salle est contrôlée sur les instants réels : deux événements non annulés du même lieu et de la même organisation ne peuvent se chevaucher, tandis que deux créneaux contigus sont permis. Les mutations de l’organisation sont sérialisées pour éviter deux réservations concurrentes. Le contrôle ne réserve rien auprès d’un gestionnaire externe et ne détecte pas le même bâtiment enregistré séparément dans deux clubs.

La capacité est comparée aux participants prévus au moment de la création ou modification. Elle n’est pas une jauge de présences réelles et n’est pas automatiquement réévaluée après chaque modification ultérieure d’effectif. Réduire une capacité sous l’effectif d’un événement futur est refusé. Modifier l’adresse d’un lieu utilisé actualise la version des événements futurs concernés, l’historique et leurs notifications.

Un lieu archivé reste lisible dans l’historique mais ne peut plus être choisi pour une nouvelle planification. Les événements existants ne sont pas annulés automatiquement ; choisir explicitement un lieu actif lors d’une modification.

### Séries et heures locales

Récurrences livrées : quotidienne, hebdomadaire et toutes les deux semaines, jusqu’à 52 occurrences matérialisées. Aucune récurrence infinie ou mensuelle n’est annoncée. Une équipe doit rester dans les dates de sa saison ; une série dépassant ces dates est refusée en entier.

Chaque date est convertie depuis le fuseau IANA avec Intl. Une heure inexistante au printemps est refusée. Pour une heure répétée à l’automne, l’utilisateur doit choisir la première ou la deuxième occurrence ; le choix s’applique au début et à la fin saisis. Une série hebdomadaire conserve son heure locale même si son décalage UTC change.

Modifier une occurrence crée une exception. Modifier les occurrences standard suivantes ou toute la série conserve les exceptions et les jours annulés. Les collisions sont vérifiées avant toute écriture, y compris face aux exceptions conservées. La modification d’une série ne réécrit pas des événements déjà passés : corriger ceux-ci individuellement, avec historique.

Une annulation conserve l’événement et son identité ICS. Il n’y a pas de restauration d’une occurrence annulée dans cette version ; créer un nouveau créneau en cas de rétablissement. Une création répétée avec le même identifiant de demande renvoie l’événement initial ; une modification portant une version obsolète est refusée.

### Notifications et documents

Les créations et changements sont mis en file dans la transaction métier. Une action sur une série produit au maximum une notification générique par destinataire, plutôt qu’un email par occurrence. Les préférences sportives et la pause email du club sont respectées. Avant l’envoi, les droits sur l’événement sont recalculés. Le contenu email ne contient ni liste de joueurs ni document privé.

Les liens vers les documents passent par le téléchargement privé du lot 05. Les pièces sensibles invisibles pour un planificateur restent protégées ; une simple correction d’horaire par celui-ci ne supprime pas silencieusement ces associations.

### ICS privé

Créer un lien depuis « Abonnements ICS privés ». Il est affiché une seule fois, lié au mandat actif, limité éventuellement à une équipe, valable un an et révocable. Le serveur recalcule les droits à chaque requête, sans dépendre des cookies du logiciel de calendrier. Désactiver le compte ou révoquer le mandat invalide aussi l’accès. Le jeton aléatoire de 256 bits n’est pas stocké en clair.

Le flux publie la période allant de 30 jours passés à 366 jours futurs, au maximum 1 000 événements, avec identifiants et séquences stables, dates UTC, titre, lieu et statut d’annulation. Les personnes, consignes, matériel et documents privés n’y sont pas copiés. Chaque occurrence est un VEVENT distinct : pas de règle RRULE opaque à interpréter côté client. Échappement, retours CRLF et pliage UTF-8 suivent [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

Il s’agit d’un abonnement/export à sens unique, pas de CalDAV bidirectionnel. Les tests ont réellement téléchargé le flux et vérifié ses mises à jour/révocations localement. L’URL 127.0.0.1 n’est pas joignable par un service cloud comme Google/Outlook : hébergement HTTPS et essais avec ces clients restent nécessaires avant un usage externe. La révocation empêche les futurs téléchargements, sans effacer des copies déjà enregistrées chez un destinataire. Protéger ces URLs et les exclure des journaux d’accès lors du déploiement.

## Limites et suite

Les journées fédérales regroupant des rencontres de plusieurs compétitions, les rencontres officielles et leurs reports attendent les lots 15–16. Le modèle de ce lot ne permet pas de créer ou modifier un résultat officiel ; aucune compétition fictive n’est introduite pour compléter une vue. Le futur module officiel devra être la source du calendrier correspondant.

Pas de synchronisation cloud validée, de préproduction distante, de réservation externe, de réponse de présence, de rappels de convocation ou de mode hors connexion. Les coûts des salles restent indicatifs. Les lieux et consignes doivent contenir les informations collectives nécessaires, sans données médicales.

Aucune nouvelle configuration ou dépendance n’est requise. Conserver PostgreSQL, Next.js et le worker email local déjà démarrés ; le worker Documents reste indépendant. Les comptes n’exigent toujours pas de vérification email et MFA reste maintenue pour l’administration.

Le lot 07 — Présences attend une validation explicite de ce lot 06.
