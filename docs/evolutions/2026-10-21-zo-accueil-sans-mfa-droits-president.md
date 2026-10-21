# Connexion vers l’accueil, double authentification retirée, président avec tous les droits (21 octobre 2026)

Demandes du porteur du projet après le premier essai sur l’aperçu en ligne.

## Connexion
- Après « Se connecter », l’application ouvre directement l’**accueil** (`/fr`, `/nl`, `/en`) au lieu de « Mon espace ». Exceptions : une création de compte, ou une personne arrivée par un lien d’invitation, restent sur la page d’accès pour rejoindre leur club.

## Double authentification retirée
- Connexion par email et mot de passe uniquement. Le module TOTP de Better Auth est retiré (serveur et navigateur), ainsi que tous les écrans : configuration, code à saisir, codes de secours.
- `src/lib/security-policy.ts` reste l’unique point de la règle : `mfaRequired()` répond non, `mfaSatisfied()` répond oui. Aucun contrôle de rôle, d’organisation ou de ressource ne change. La variable `PFM_MFA_SUSPENDED` n’existe plus.
- Les colonnes et tables existantes (`twoFactorEnabled`, `twoFactor`) restent en base, sans usage : migrations uniquement additives.

## Président de club : tous les droits dès le départ
- Migration `0042_president_all_rights.sql` : tout mandat de président de club reçoit, à sa création, les deux habilitations explicites qui manquaient encore (informations de handicap et de santé `people.sensitive`, documents sensibles `documents.sensitive`). Les présidents actuels les reçoivent aussi. Ce sont des habilitations ordinaires : le président peut les retirer d’un mandat dans Membres et accès, et tout le reste des contrôles (lecture limitée au club, journal d’audit) est inchangé.
- Conséquence assumée : un président voit désormais d’emblée les données de santé et les documents sensibles de son club.

## Tests
- Unitaires : `tests/security-policy.test.ts` (plus jamais de second facteur ; documents sensibles toujours derrière leur habilitation).
- Intégration : les tests qui exigeaient la MFA vérifient maintenant que l’action passe sans elle, sans droit de plus ni accès à un autre club ; les tests des habilitations sensibles retirent d’abord l’habilitation du président pour vérifier qu’elle reste nécessaire. Le test du résumé hebdomadaire ne dépend plus de l’heure à laquelle il tourne.
- Bout en bout : inscription, connexion et accès sans aucun écran de double authentification, arrivée sur l’accueil après connexion.
