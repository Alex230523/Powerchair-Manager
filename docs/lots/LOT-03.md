# Lot 03 — Notifications

## Autorisation et audit préalable

Le lot 02 a été accepté par « okok fait la suite ». Le PDF de référence place les emails, modèles et moteur d’envoi dans le lot 03, dépendant des lots 01 et 02. Audit avant modification : projet Next.js/TypeScript et PostgreSQL existant, migrations 0000 à 0007, authentification Better Auth, contextes et mandats, audit transactionnel, personnes/équipes et boîte email locale immédiate. Les documents synchronisés sous sources/ restent inchangés.

La stack existante est conservée. Nodemailer fournit le transport SMTP ; PostgreSQL porte la file persistante et les notifications internes. Aucun service tiers n’est provisionné.

## Critères de recette

- Produire les emails de vérification, récupération et invitation depuis les vrais services ; rattacher les changements d’accès, affectations et autorisations familiales aux événements existants.
- Isoler organisations et destinataires, recalculer les droits avant consultation et envoi ; respecter révocation, majorité et préférences.
- Proposer des modèles FR/NL versionnés, un aperçu sans envoi, des préférences par catégorie et canal, lecture/non-lecture et suivi des tentatives.
- Persister les envois, dédupliquer les événements, supporter plusieurs workers, reprise après arrêt et erreurs temporaires ; distinguer capture locale, acceptation SMTP et résultat incertain.
- Vérifier sur PostgreSQL réel et navigateur en FR/NL, avec contrôle d’accessibilité et largeur de 320 px. Aucun envoi externe pendant la recette.

## Structure et migration

`src/domains/notifications/` contient modèles, chiffrement, publication, éligibilité, événements, service, transports et worker. Les routes `/api/notifications` et `/api/notifications/preview` contrôlent session, origine, taille et organisation attendue. `/fr/notifications` et `/nl/notifications` présentent l’espace.

La migration additive 0008 crée notification_template, notification_preference, notification_setting, notification_dispatch, mail_job, mail_attempt et app_notification, avec index et contraintes. Elle ajoute la capacité délégable notifications.manage sans changer les sept rôles. Aucun historique existant n’est réécrit. Sauvegarder la base avant toute migration en production ; le retour arrière privilégié est une restauration testée, pas la suppression automatique des tables. Les modèles sont ajoutés par version ; les envois déjà préparés gardent leur contenu.

Les événements métier et leur mise en file partagent la transaction de mutation. Les callbacks d’authentification utilisent une connexion distincte ; le worker accorde un délai court à la validation de la transaction d’identité. Les messages dont le lien est ensuite expiré ou invalide sont annulés.

## Droits et confidentialité

Une personne consulte uniquement ses notifications dans l’organisation active. L’administration exige notifications.manage, une adresse vérifiée et MFA. Les droits ne sont pas fusionnés entre mandats. La consultation et l’envoi recalculent l’appartenance, les mandats et l’accès familial. Une autorisation légale cesse d’ouvrir l’accès à la majorité. Les changements d’organisation et de compte attendent la fin d’un envoi déjà engagé sous verrou.

Les emails ordinaires respectent le réglage général du compte puis les canaux de la catégorie dans l’organisation. Les messages de sécurité restent actifs ; une pause explicite suspend tous les emails de l’organisation, sans suspendre les notifications internes. L’authentification globale ne dépend pas d’une organisation.

Le contenu email, dont les liens privés, est chiffré AES-256-GCM en base avec une clé dérivée de BETTER_AUTH_SECRET. Conserver ce secret : sa perte rend aussi les messages en attente illisibles. L’administration voit les états et motifs techniques, sans contenu chiffré ni liens d’authentification. Les fichiers locaux sont privés (dossier 700, fichiers 600) et exclus de Git. Ils contiennent des liens sensibles : ne pas les partager.

## Envoi et exploitation

Lancer `npm run mail:worker` dans un terminal supplémentaire, après les migrations. En développement, MAIL_TRANSPORT=local conserve les emails dans `.local/mail/` ; aucun email ne part vers les destinataires. `npm run mail:worker -- --once` traite au maximum 20 tâches disponibles puis s’arrête. Un worker permanent est nécessaire pour traiter les tâches ajoutées plus tard et les reprises différées.

La réservation des tâches utilise SKIP LOCKED et des baux. Le journal distingue les tentatives et l’acceptation. Les erreurs temporaires sont reprises avec attente croissante, au maximum cinq tentatives automatiques. Une interruption SMTP après début d’envoi donne un résultat incertain : l’administrateur doit vérifier le fournisseur avant de confirmer une nouvelle tentative. La déduplication logique ne garantit pas une réception physique exactement une fois. La capture locale utilise un fichier stable par tâche pour supporter une reprise sans doublon.

SMTP est implémenté et testé sur un serveur réel limité à la boucle locale. Pour une exploitation externe ultérieure, configurer MAIL_TRANSPORT=smtp, SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER et SMTP_PASSWORD, puis démarrer volontairement le worker avec `--allow-external`. Le transport externe exige TLS. La configuration seule ne déclenche pas d’envoi externe sans ce démarrage explicite. Ne pas lancer simultanément des workers de modes différents sur une même file. Les emails déjà capturés localement ne sont pas réexpédiés automatiquement lors du changement de mode.

## Limites de livraison

Les 100 notifications les plus récentes et les 50 derniers emails de l’organisation sont affichés ; le compteur et le marquage collectif concernent cette liste. Pas encore de pagination ni d’archivage automatique. Les modèles de vérification et récupération sont fixes ; cinq modèles organisationnels sont personnalisables en deux langues. Les notifications familiales retirées deviennent invisibles et leurs emails non encore transmis sont annulés ; aucun avis contenant des informations sur un ancien accès n’est envoyé après révocation.

Aucun fournisseur externe, domaine expéditeur, SPF/DKIM, délivrabilité réelle ou déploiement n’a été validé. Définir sauvegardes, rotation des clés, durée de conservation et suppression des données avant production. Les communications de groupe, messagerie, notifications push et PWA complètes restent au lot 11. Inscriptions, documents, calendrier et paiements attendent leurs propres lots : aucun événement fictif n’est généré pour les présenter comme terminés.

Le lot 04 attend une validation explicite de ce lot 03.
