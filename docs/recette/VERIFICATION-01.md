# Recette du lot 01 — 18 octobre 2026

## Vérifications exécutées

- PostgreSQL embarqué réellement démarré, données de développement persistantes.
- Migrations 0000 à 0004 appliquées ; second passage sans duplication.
- db:test : empreinte technique et nombre de migrations persistées vérifiés.
- Lint et TypeScript strict réussis ; 7 tests unitaires réussis.
- 15 tests d’intégration réussis sur un schéma PostgreSQL isolé : identité,
  deux clubs, coach/arbitre, fédération sans accès au club, absence de fusion
  des droits, invitations destinataire/expiration/usage unique/révocation,
  mandats programmés, interdiction d’élévation par délégation, révocation immédiate,
  dernier président permanent, révocations concurrentes, préférences, MFA et compte désactivé.
- 8 tests navigateur réussis sur serveur de production : formulaires FR/NL,
  clavier, axe, affichage 320px, création et vérification réelles d’un compte,
  configuration TOTP, contextes A/B, invitation et acceptation d’un coach,
  révocation observée à la requête suivante, reconnexion avec second facteur,
  récupération de mot de passe via lien local, refus des écritures anonymes ou d’une autre origine, routes et santé PostgreSQL.
- Compilation de production réussie, également exécutée par les E2E.
- npm audit --omit=dev : aucune vulnérabilité de production signalée.
- Club pilote et président créés dans la base locale à la demande de l’utilisateur ;
  coordonnées confirmées, aucun email externe envoyé, aucun mot de passe choisi
  ou affiché par l’assistant.

## Corrections issues de la recette

Le contrôle initial de création de session a été ajusté pour la transaction
d’inscription. La rotation de session pendant l’enrôlement MFA rétablit le contexte
après nouvelle validation des droits. Les formulaires ont des identités distinctes
pour éviter la réutilisation de champs lors du retour à la connexion. Le scénario
navigateur complet est passé après ces corrections.

## Limites restantes

Aucune préproduction ni certification d’accessibilité humaine. Les emails externes
et notifications ne sont pas raccordés : boîte locale privée et partage manuel des
invitations uniquement. Tests Chromium, pas de matrice Safari/Firefox ni de lecteur
d’écran. CI fournie mais non exécutée sur GitHub. Pas de commit ou de publication.

L’audit complet conserve cinq alertes élevées dans la chaîne ESLint/Next/braces,
déjà identifiées au lot 00 ; elles concernent les dépendances de développement.
Aucune rétrogradation forcée du framework n’a été appliquée.

Les droits d’équipe, liens parent/enfant, saisons, annuaire personnes et affiliations
ne sont pas développés : lots suivants. Aucun module sportif ou financier n’est
présenté comme fonctionnel. Lot 02 en attente de validation explicite du lot 01.

Le contrôle de schéma Better Auth ne propose aucune table ou colonne manquante.
Il émet un avertissement de comparaison de type sur lastRequest (float8 / number) :
le champ stocke les millisecondes sans perte et la limitation de tentatives a été
observée pendant la recette. Ce diagnostic de type de l’outil reste à surveiller.
