# Recette du lot 02 — 18 octobre 2026

## Résultats exécutés

- Migrations 0005–0007 appliquées sur le PostgreSQL local persistant ; second
  passage sans duplication et db:test réussis. Les données existantes du club
  pilote et les migrations précédentes sont conservées.
- npm run check : lint sans erreur ni avertissement, TypeScript strict et
  10 tests unitaires réussis (dont majorité, dates et sécurité des cellules CSV).
- npm run test:integration : 37 tests réussis dans deux schémas PostgreSQL
  temporaires, dont 22 scénarios du lot 02 et les 15 scénarios du lot 01.
- npm run test:e2e:db : 9 tests navigateur réussis, avec compilation de production.
  Le nouveau parcours crée deux personnes, une saison, une équipe, une affectation
  et une autorisation familiale, modifie et recharge les coordonnées, exporte un
  fichier CSV réel, archive/réactive une fiche en conservant son historique, puis
  vérifie le refus d’un formulaire portant une autre organisation.
- Les écrans FR/NL du répertoire passent axe (règles ciblées WCAG 2.2 AA) et le
  contrôle de débordement à 320px. Le parcours peuplé passe aussi axe. Une capture
  du répertoire peuplé a été inspectée visuellement : aucun défaut de mise en page.
- Les tests du lot 01 restent passants : authentification, MFA, invitations,
  récupération, protection du dernier administrateur, concurrence et isolation.
- Les jeux de données de recette sont confinés aux schémas et bases temporaires,
  supprimés par les scripts. Aucune personne, famille ou équipe fictive n’a été
  créée dans Club pilote.

## Garanties vérifiées sur base réelle

Séparation des clubs et refus d’accès fédéral au répertoire privé ; clés étrangères
composites interdisant une affectation interclubs ; noms/postes limités aux équipes
du coach sans email, téléphone ou naissance des coéquipiers ; absence de déduction
par filtres d’âge non autorisés ; périmètre explicite d’équipe sans fusion.

Deux parents distincts avec consultation/édition différentes, un adulte représentant
plusieurs enfants, aucun accès pour un lien seulement déclaré, fin automatique du
lien légal à la majorité, délégation datée pour l’adulte accompagné et révocation
immédiate. L’adulte autonome peut modifier ses coordonnées sans modifier celles
d’un autre membre.

Détection de doublons, détection des versions de fiches obsolètes, association tardive
à un compte sans perte d’historique, validation des dates saison/affectation,
modification d’équipes, cohérence des changements de saison et archivage réversible.
La clôture d’affectation supprime immédiatement l’accès dérivé du coach.

Transfert avec identité conservée, ancien dossier historique et mandat joueur
source révoqué, consommation unique du code, autorité de l’émetteur revérifiée et
retour au club d’origine sans créer une deuxième fiche de la même identité.

Export limité au club autorisé, permission distincte, refus pour un coach sans
habilitation, refus après changement d’organisation et protection contre les
formules de tableur. Les références d’autorisation ne sont pas exportées.

## Limites

Préproduction, envoi réel d’emails, notifications, Safari/Firefox et lecteurs d’écran
non vérifiés dans ce lot. Les contrôles axe ne constituent pas une certification.
Le stockage des photos/pièces, disponibilités, formations, licences, classifications,
cotisations, calendrier et compétitions restent dans les lots suivants.

La validation de responsabilité ou de consentement est un contrôle humain du club,
consigné par une référence ; la plateforme ne prétend pas vérifier une pièce légale.
Les homonymes non distinguables et les fusions d’identités déjà partagées entre
clubs exigent une revue manuelle et ne sont pas fusionnés automatiquement.

Le compte du pilote attend encore une adresse vérifiée et MFA ; aucun paramètre
n’a été forcé pour contourner cette étape. Le mot de passe existant est conservé.
La réserve de dépendances de développement du lot 01 reste inchangée (aucune
nouvelle dépendance ajoutée dans ce lot). CI fournie, sans exécution sur GitHub.
Aucun commit, publication ou déploiement distant effectué.

Lot 02 livré pour recette locale ; lot 03 en attente de validation explicite.
