# Lot 00 — Audit, architecture et recette

## Audit avant modification — 18 octobre 2026

Dossier initial : AGENTS.md et sources/ vide. Aucun manifeste, dépôt Git, code,
base, secret ou test existant. Aucune source synchronisée modifiée. PDF retrouvé
via la pièce jointe de la conversation Démarrage du codage plateforme.
Référence : pages 4–7, 21–27, notamment la séparation entre module fonctionnel 00
(comptes) et lot technique 00 (initialisation). La page 27 impose un arrêt avant lot 01.

## Choix et conventions

Next.js App Router, React, TypeScript strict, Node 22, PostgreSQL 18, pilote pg.
Versions JavaScript résolues et figées dans package-lock.json. Utiliser npm ci.
Une application modulaire : src/app pour HTTP, src/components pour UI,
src/lib pour infrastructure ; futurs domaines dans src/domains au besoin.
Noms de code anglais, interface FR/NL, composants sémantiques, cibles de 44px
minimum, focus visible et grille responsive. Objectif WCAG 2.2 AA ; axe ne
remplace pas une recette avec lecteurs d’écran et utilisateurs.
Aucun secret dans le client ; connexion base exclusivement côté serveur.
Le point /api/health retourne 503 sans détails sensibles si la base est indisponible.
Pas de données métier ni de fausse connexion dans la page de référence.

## Environnements

Local : Docker Compose et .env.local non versionné. Les identifiants Compose
sont réservés au développement. Test/CI : PostgreSQL éphémère, aucune donnée réelle.
Préproduction et production : bases, domaines et secrets distincts ; TLS géré
par le fournisseur, rôle applicatif non propriétaire/non superutilisateur,
rôle de migration séparé, sauvegardes chiffrées et procédure de restauration testée.
Aucun hébergeur ni prestataire d’identité sélectionné sans cadrage du lot 01.
Aucun déploiement ou validation de préproduction réalisé dans le lot 00.

## Modèle envisagé et migrations

0000 crée seulement platform_metadata. schema_migrations garde nom, SHA256 et date.
Le migrateur verrouille les exécutions concurrentes et applique tout dans une
transaction ; une migration déjà appliquée et modifiée est refusée.
Les migrations appliquées sont immuables ; correction par nouveau fichier.

Lot 01 proposé : Person, UserAccount, Organization (club/fédération),
OrganizationMembership, RoleAssignment daté et révocable, permissions explicites,
AuditLog et identité externe. Pas de rôle unique sur UserAccount.
Lot 02 : Team, Season, TeamMembership, GuardianRelationship à droits vérifiés.
Affiliation club/fédération plusieurs-à-plusieurs, sans héritage automatique des droits.
Chaque ressource privée portera une organisation ; clés étrangères composites
empêcheront les références entre organisations. Politique serveur : refus par défaut,
identité vérifiée + contexte actif + mandat courant + action + ressource.
Réexaminer RLS comme défense supplémentaire ; aucune isolation métier n’est
implémentée ou revendiquée dans ce lot.

### Matrice cible (non implémentée)

| Profil              | Périmètre futur                         |
| ------------------- | --------------------------------------- |
| Président de club   | Son club et délégations explicites      |
| Président fédéral   | Données fédérales autorisées            |
| Travailleur fédéral | Délégations fédérales limitées          |
| Coach               | Équipes autorisées                      |
| Arbitre             | Désignations ; soumission des résultats |
| Joueur              | Ses données autorisées                  |
| Parent/représentant | Enfants explicitement autorisés         |

Pas de fusion des droits entre contextes. La fédération n’administre pas les
finances, dossiers médicaux ou CRM privés des clubs. Trésorier et secrétaire sont
des délégations, sans ajouter de profils fondamentaux. Le lot 01 devra couvrir
révocation immédiate, MFA privilégiée et protection du dernier administrateur.

Pour chaque évolution : tester sur base vide et copie anonymisée, sauvegarder,
appliquer en préproduction, vérifier contraintes et isolation, puis déployer.
Préférer expand/backfill/contract ; pas de down destructif automatique. En cas
d’incident : restauration contrôlée ou migration corrective, avec validation humaine.
Le lot 00 ne contient aucune donnée à migrer depuis un ancien système.

## Décisions produit conservées

Pilote club avant multi-clubs puis fédération ; PWA avant natif (PWA au lot 11).
V1 virement/QR/import sans collecte de fonds ; arbitre soumet puis fédération
habilitée homologue. Aucun de ces modules n’est fonctionnel à ce stade.

## Critères de recette et état

- Installation reproductible par npm ci et lockfile versionné.
- Lint, TypeScript strict, tests unitaires et build passent.
- Routes FR/NL, redirection racine et rejet d’une langue inconnue.
- E2E : lien d’évitement au clavier, changement de langue, 320px, axe.
- PostgreSQL : migration sur base vide, deuxième passage sans duplication,
  lecture persistante via db:test et santé HTTP 200 ; 503 si base absente.
- Documentation des limites et arrêt explicite avant lot 01.

Les résultats effectivement exécutés sont consignés dans [VERIFICATION-00.md](../recette/VERIFICATION-00.md).
La validation explicite de l’utilisateur reste nécessaire avant lot 01.

## Décisions ouvertes pour lot 01

Validation de la création d’un club et de son président ; fournisseur d’identité
avec invitations/récupération/MFA ; nombre de fédérations au lancement ; accès
d’urgence technique ; hébergement et politique de conservation. Ces sujets ne
bloquent pas le socle et ne sont pas présentés comme résolus.
