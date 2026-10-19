# Calendrier, documents et messagerie — 19 octobre 2026

## Audit et périmètre

Le calendrier possédait déjà événements récurrents, pièces jointes, lieux privés, annulations, historique et flux ICS personnels révocables. Les présences et documents avaient leurs services et contrôles d’accès. Les notifications n’étaient pas une messagerie. Cette livraison conserve ces services et ajoute une messagerie interne distincte.

- Icône calendrier SVG conventionnelle dans la navigation.
- Trois vues : liste de tous les événements accessibles (pagination de 100 lignes parcourues), mois avec aperçu des titres, semaine en sept colonnes et défilement horizontal sur mobile.
- Accès direct à la création et à l’abonnement ICS. Les liens sont personnels et révocables ; leur périmètre reste celui du profil ayant créé le lien.
- Lieu privé du club, lieu du répertoire commun ou texte libre exclusifs. Le texte libre n’alimente jamais le répertoire. Noms et adresses du répertoire commun sont visibles aux organisations connectées, clubs et fédérations. Les contacts privés des lieux existants ne sont pas partagés.
- Pièces jointes et sélection explicite d’une fiche de catégorie entraînement ; téléchargement soumis aux droits documentaires habituels. Raccourci « Fiches d’exercice » dans Documents.
- Fiche événement avec listes coach/joueur, réponse déclarée et présence constatée distinctes. Seules les convocations actives et autorisées sont montrées. Un participant sans convocation n’est jamais annoncé présent. Le classement utilise l’affectation coach à l’équipe ou son profil coach actif ; une personne ayant deux casquettes apparaît dans la liste coach.
- Conversations internes privées, individuelles ou à plusieurs destinataires, avec réponses et actualisation manuelle. Aucun email externe n’est envoyé par la messagerie. Les participants à la conversation sont visibles. Les comptes actifs de l’organisation sont nécessaires ; les membres ordinaires peuvent initier avec un président ou coach, les coachs et personnes autorisées à lire les membres peuvent choisir les autres comptes de leur organisation.

## Migrations et permissions

0016 ajoute `shared_venue` et deux champs de localisation à l’événement, sans toucher aux lieux privés. Publication au répertoire réservée à `calendar.manage` avec la politique MFA existante. Répertoire global commun : aucun rattachement fédéral des clubs n’existe encore dans le modèle. Ce répertoire ne réserve pas les salles et ne vérifie pas les disponibilités entre clubs.

0017 ajoute conversations, participants et messages, avec clés étrangères multi-organisations. Chaque opération recontrôle le compte, le mandat actif, l’organisation et la participation à la conversation. Les écritures vérifient également l’organisation attendue et l’origine HTTP. Les identifiants de requête évitent les doubles envois après une nouvelle tentative. Un compte ou mandat révoqué perd l’accès. Aucun contenu de message n’est copié dans le journal d’audit.

Les migrations sont additives et les anciennes migrations restent inchangées. Avant une mise en production, sauvegarder la base, arrêter les écritures pendant la migration et conserver le code compatible avec ces tables. Retour arrière : restaurer la sauvegarde ou revenir au code précédent en conservant les tables ; ne pas supprimer les données de conversations pour annuler un déploiement.

## Vérification

- `npm run check` : lint, TypeScript et 33 tests unitaires.
- `npm run test:integration` : 158 tests, dont partage de lieux, localisation libre/ICS, liste hors période, confidentialité des présences, destinataires, réponses, révocations et idempotence de messagerie.
- `npm run test:e2e:db -- calendar.spec.ts documents.spec.ts` : parcours avec base temporaire, échanges entre deux comptes, vues du calendrier, flux révoqué, dépôts et validations documentaires ; contrôles axe et largeur mobile sur les écrans concernés.

Résultat final : 33 tests unitaires, 158 tests d’intégration et 17 parcours navigateur réussis (208 au total). Compilation de production effectuée par le parcours navigateur. Captures du calendrier semaine et de la messagerie inspectées. Migrations 0016–0017 appliquées en local, fondation PostgreSQL vérifiée et pages calendrier/messagerie HTTP 200.

## Limites explicites

Pas encore de lien aux matchs officiels organisés, de réservation interclubs des salles, de pièces jointes aux messages, de notifications d’arrivée de messages, de statut lu/non lu ni de conversation inter-organisations. Les messages ne sont pas chiffrés de bout en bout. Les anciennes convocations utilisent les rôles actuellement disponibles pour l’affichage, pas une photographie historique de la casquette. La gestion bancaire reste hors de cette livraison. Aucun changement de mot de passe, de vérification email ou de suspension MFA.

## Lancer

Depuis `platform/` : `npm run db:migrate`, puis `npm run dev -- --hostname 127.0.0.1`. Les services de documents et notifications conservent leurs commandes `npm run docs:worker` et `npm run mail:worker`. Ouvrir `/fr/calendar`, `/fr/documents` ou `/fr/messages`.
