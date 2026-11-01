# B4 : les notifications sur téléphone (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B4. Une salle annulée ou un horaire déplacé la veille doit atteindre la famille tout de suite. La PWA était installable ; elle reçoit maintenant des notifications Web Push, gratuites, en troisième canal à côté de l'e-mail et de l'application.

## Décisions
- **Web Push standard, sans dépendance** : le contenu est chiffré pour l'appareil (RFC 8291, vérifié avec l'exemple officiel) et l'envoi signé avec la clé VAPID de la plateforme (RFC 8292). Clés dans `PFM_VAPID_PUBLIC_KEY`, `PFM_VAPID_PRIVATE_KEY`, `PFM_VAPID_SUBJECT` (`node scripts/vapid-keys.mjs` les génère, voir `docs/PRODUCTION.md`). **Sans clés, rien n'est activé** : la carte le dit.
- **Plusieurs appareils par compte** (`push_subscription`). Seuls les services de notification connus (Google, Mozilla, Apple, Microsoft) sont appelés ; un appareil expiré (réponse 404 ou 410) est oublié.
- **File d'envoi** (`push_job`), traitée par la tâche de fond des e-mails : comme pour les e-mails, **les droits et les préférences sont relus au moment de l'envoi** (une personne qui a quitté le club ne reçoit plus rien).
- **Aucune donnée sensible** dans le titre ou l'aperçu : le nom du club, le type de nouvelle et, pour une invitation, le **prénom** de l'enfant. Le détail se lit dans l'application.
- **Sujets par club** : invitations, urgent, changements de rendez-vous, cotisations, documents, messages du club, autres ; chacun s'éteint séparément (les e-mails et l'application gardent leurs réglages). **Urgent** : un rendez-vous annulé ou modifié qui a lieu dans les 48 heures.
- **Invitation** : une notification **par enfant concerné**, avec son prénom, et les boutons **« Présent » / « Absent »** qui passent par la même commande que la page Présences (droit de répondre pour ce profil, réponses encore ouvertes) ; un parent qui peut seulement consulter reçoit la nouvelle sans les boutons. Après l'échéance, la réponse est refusée et l'application s'ouvre.
- **Regroupement** : les nouvelles d'un même club arrivées à deux minutes d'intervalle partent en une seule (« 3 nouvelles notifications du club ») ; une invitation et un changement urgent partent toujours seuls.
- **Activation guidée** dans Réglages › Notifications, carte « Notifications sur ce téléphone » : bouton d'activation, liste des appareils, essai, sujets par club, et la marche à suivre sur iPhone (iOS 16.4 ou plus récent, application ajoutée à l'écran d'accueil).
- Correction au passage : un e-mail « cotisation émise » (A3) était refusé au moment de l'envoi faute de règle d'accès ; il part maintenant vers la personne concernée ou son représentant tant que la cotisation est ouverte.

## Code
- Migration `0073` : `push_subscription`, `push_preference`, `push_job`.
- `src/domains/notifications/webpush.ts` (chiffrement et signature), `push-queue.ts` (mise en file, sujets, urgence, regroupement), `push.ts` (envoi, appareils, préférences), `push-respond.ts` (réponse depuis la notification) ; routes `/api/push` et `/api/push/respond`.
- Présences et calendrier mettent leurs propres notifications en file (par enfant, urgent) ; les autres types passent par `publish`.
- `public/sw.js` : réception, boutons, ouverture de l'application. Composants `push-settings.tsx` et `push-copy.ts`.

## Limites connues
- Un compte actif dans plusieurs clubs : la réponse depuis la notification n'est acceptée que si le profil actif est celui du club de l'invitation ; sinon l'application s'ouvre pour répondre.
- Les tests de bout en bout ne peuvent pas s'abonner à un vrai service de notification (navigateur sans compte) : ils couvrent la carte et les sujets ; l'envoi est couvert par les tests d'intégration avec un service simulé.

## Tests
- Unitaires (`tests/b4-push.test.ts`) : chiffrement identique à l'exemple de la RFC 8291, jeton VAPID vérifiable, sujets, urgence à 48 heures, regroupement, services connus, textes.
- Intégration (`tests/integration/b4-push.integration.ts`) : une notification par enfant au parent et à personne d'autre (autre équipe, autre club), sujet désactivé respecté, réponse « Présent » depuis la notification puis refus après l'échéance, droits relus à l'envoi, regroupement, annulation dans les 48 heures marquée urgente, appareil expiré oublié, appareils propres à chaque compte.
- Bout en bout (`tests/e2e/push.spec.ts`), 390 px : la carte, la marche à suivre iPhone, un sujet désactivé enregistré ; axe.
