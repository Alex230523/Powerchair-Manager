# Recette du lot 08 — 19 octobre 2026

## Contrôles exécutés

- Migrations 0013 (profils et anglais) et 0014 (cotisations) appliquées au PostgreSQL local. Deuxième passage sans réapplication ; `npm run db:test` réussi. Les références synchronisées sous `sources/` sont restées intactes.
- `npm run check` : lint, TypeScript strict et 33 tests unitaires. Les dictionnaires de tous les modules ont les mêmes clés en anglais et en français ; les modèles de notification par défaut sont validés en FR/NL/EN.
- `npm run test:integration` : 152 tests réussis sur huit schémas PostgreSQL isolés, dont 10 nouveaux scénarios cotisations/profils.
- `npm run test:e2e:db` : compilation de production et 16 parcours navigateur réussis lors de la recette finale complète. Total : 201 tests distincts (33 unitaires + 152 intégration + 16 navigateur).
- Serveur local : `/api/health` retourne `200` avec PostgreSQL accessible et `/en/dues` répond `200`. Workers email, documents et présences redémarrés ; transport email toujours local. Aucune donnée de recette ajoutée à Club pilote.

## Garanties vérifiées

Une créance de 250 EUR conserve exactement ce principal avec quatre échéances de 62,50 EUR. Division à reste et passage des fins de mois, dont février bissextile. Deux émissions concurrentes ne produisent qu’une créance ; le doublon retourne un refus. Réduction supérieure au principal, exemption sans motif, dépassement de limite d’échéances, changement d’organisation et version obsolète sont refusés.

Consultation personnelle et familiale filtrée ; révocation familiale prise en compte. Un coach sans délégation n’accède pas aux finances des autres personnes. Barème ou saison archivés bloquent les nouvelles créances. Correction d’échéancier et annulation conservent les anciennes valeurs, l’auteur, la date et le motif. Annulation exclue du montant en retard. L’admission consomme uniquement le suivi cotisations correspondant, sans toucher aux documents et sans nouvelle dette au rejeu.

Un utilisateur ne peut pas enregistrer le rôle d’un autre compte comme profil. Nom et préférence anglaise persistent en base. Le profil par défaut est restauré pour une nouvelle session sans contexte, mais un accès révoqué n’est jamais réactivé. Passer d’un profil président à un profil joueur supprime le droit de gérer les cotisations. La politique stricte MFA et sa suspension temporaire sont toutes deux testées côté métier.

## Parcours et inspection visuelle

Le parcours navigateur crée un compte de test, enregistre un profil nommé, passe en anglais depuis Mon espace, crée le barème et la créance puis vérifie les quatre échéances. Il change ensuite de casquette et vérifie la disparition des formulaires de gestion avec conservation de la consultation personnelle autorisée.

Captures `test-results/dues-desktop.png` et `test-results/dues-mobile.png` inspectées. Navigation latérale, profil en haut à droite, repli du menu mobile, absence de débordement à 375 px. Les pages de base conservent les contrôles à 320 px. Contrôles axe ciblant WCAG 2.2 AA, sans constituer une certification.

Les premiers essais ont révélé un titre de document manquant sur la nouvelle page ; corrigé. Les tests attendent désormais le rechargement complet après un changement de profil et identifient les menus par leur rôle accessible, plutôt que par les anciens libellés de mandats. Les boutons secondaires ajoutés ont une taille adaptée au tactile.

## Limites et validation

Seuls barèmes, créances, échéanciers, réductions/exemptions et annulations sont livrés pour les cotisations. Aucun mouvement bancaire, encaissement, QR, import, rapprochement, remboursement ou relance financière n’est déclaré fonctionnel. Les contenus propres au club ne sont pas traduits automatiquement.

Pas de déploiement externe ou d’exécution CI GitHub. Les bases de recette aléatoires sont supprimées après les tests. Les mots de passe existants n’ont pas été changés. Vérification email toujours désactivée et MFA toujours suspendue sur le pilote à la demande de l’utilisateur.

Le lot 09 attend une validation explicite du lot 08.
