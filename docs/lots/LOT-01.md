# Lot 01 — Comptes, organisations et permissions

## Autorisation et audit avant développement

Le 18 octobre 2026, l’utilisateur a validé le lot 00 (« okok validé continue »).
Le périmètre autorisé est donc le lot 01. Aucun lot 02 n’est engagé.
L’audit a confirmé : Next.js 16.4.2/React 19.3.1/TypeScript strict, PostgreSQL via
pg, page de référence FR/NL, aucun compte ni schéma métier existant. Aucune source
synchronisée n’a été modifiée. Les fichiers du dépôt initial n’étaient pas commités.
Les réserves de préproduction du lot 00 restent consignées dans [VERIFICATION-00.md](../recette/VERIFICATION-00.md).
PostgreSQL est désormais exécuté et testé réellement sur cette machine.

## Architecture et modèle livrés

Better Auth 1.7.10 gère le hachage des mots de passe, les sessions persistantes,
les liens de vérification/récupération et TOTP/codes de secours. Aucun mécanisme
cryptographique d’authentification maison. Les secrets TOTP restent chiffrés par
la bibliothèque ; le secret BETTER_AUTH_SECRET doit être conservé et sauvegardé
hors du dépôt. Le client n’est jamais autorité sur l’identité ou les permissions.

- Tables d’identité Better Auth : user, account, session, verification, twoFactor,
  rateLimit. Person relie un compte unique aux préférences FR/NL et notifications.
- Organization distingue club/fédération, avec contact email facultatif.
- OrganizationMembership porte l’activation locale à une organisation.
- RoleAssignment porte rôle, délégations, début, fin et révocation.
- ActiveContext associe une session à un mandat, une organisation et son titulaire,
  avec clé étrangère composite. Les droits de plusieurs mandats ne sont pas fusionnés.
- Invitation : email destinataire, mandat prévu, validité 7 jours, jeton aléatoire
  stocké uniquement sous forme d’empreinte, acceptation unique et révocation.
- AuditLog enregistre changements de contexte, invitations, mandats et activations.

Migrations 0001 à 0004 : schéma d’accès, alignement du type de compteur Better Auth,
début programmé des mandats et email de contact d’organisation. Les migrations déjà
appliquées restent immuables. Le contrôle de compatibilité du schéma d’authentification
est disponible via scripts/check-auth-schema.ts.

## Matrice effective du lot 01

| Profil              | Organisations compatibles | Droits par défaut                              |
| ------------------- | ------------------------- | ---------------------------------------------- |
| Président de club   | Club                      | Contexte, membres, invitations, mandats, audit |
| Président fédéral   | Fédération                | Les mêmes droits dans sa fédération uniquement |
| Travailleur fédéral | Fédération                | Nom de l’organisation ; délégations explicites |
| Coach               | Club                      | Nom de l’organisation ; délégations explicites |
| Arbitre             | Fédération                | Nom de l’organisation ; délégations explicites |
| Joueur              | Club                      | Nom de l’organisation ; délégations explicites |
| Parent/représentant | Club                      | Nom de l’organisation ; délégations explicites |

Les délégations actuelles sont members.read, invitations.create et audit.read.
Les permissions financières/sportives seront ajoutées avec leurs modules, sans
inventer des fonctionnalités accessibles. Un délégataire ne peut accorder des
permissions qu’il ne détient pas ni inviter un président. Les délégations ne
créent pas de huitième profil.

Les actions privilégiées et lectures de membres/audit exigent email vérifié et
MFA activée. La connexion suivante exige le second facteur ; les codes de secours
sont utilisables. Un changement de session exige un contexte revalidé.

Chaque action relit compte, session et mandat en base. Les lectures privées
et mutations se coordonnent par verrou d’organisation. La révocation et la
désactivation prennent effet sans attendre une expiration de cache de session.
Un compte peut être actif dans un club et désactivé dans un autre. Une commande
opérateur permet aussi de désactiver globalement le compte et supprimer ses sessions.

Un président actif sans date de fin doit toujours subsister. Les révocations,
limitations de durée et désactivations qui retireraient le dernier sont annulées
transactionnellement. La création d’un successeur passe par invitation et acceptation.

## Parcours livrés et limites

Connexion, inscription d’identité sans droit d’organisation automatique, vérification
email, récupération, MFA TOTP et codes de secours, choix explicite de mandat,
invitation/acceptation/révocation, révocation/renouvellement de mandat, activation
locale, préférences et journal fonctionnent avec persistance PostgreSQL.
La création initiale d’organisation et la désactivation globale sont des commandes
opérateur locales, pas une administration publique libre-service.

Les emails sont préparés dans une boîte locale privée (.local/mail, non versionnée),
sans envoi externe. L’invitation est un lien à transmettre manuellement ; l’adresse
vérifiée du compte doit correspondre à celle du destinataire. Le connecteur email
transactionnel réel, sa délivrabilité et son exploitation restent au lot 03.
La configuration de production refuse un email si aucun mode local explicite
n’est choisi. Cette version n’est pas déployée ni validée en préproduction.

Person est une identité technique minimale, pas le répertoire personnes du lot 02.
Équipes, saisons, représentants liés à plusieurs enfants, périmètres d’équipe et
affiliations multi-fédérations seront ajoutés dans leurs lots. Aucun fichier privé,
export métier, paiement, résultat, homologation, dashboard ou PWA installable
n’est développé ou annoncé comme terminé.

L’infrastructure peut accueillir plusieurs fédérations, mais ne crée aucun droit
d’administration interclubs. L’hébergement, le contrôle d’identité du président
hors pilote local, la conservation des données et l’accès technique d’urgence
restent à cadrer avant production. Le rôle PostgreSQL local est propriétaire pour
les migrations/tests ; la production nécessitera des rôles séparés.

## Recette

Le rapport VERIFICATION-01.md donne les résultats effectivement exécutés.
Avant tout lot 02, validation explicite de ce lot 01 et de ses limites locales.
