# Recette du lot 06 — 19 octobre 2026

## Résultats exécutés

- Migration additive 0011 appliquée au PostgreSQL local persistant ; deuxième passage sans duplication et `npm run db:test` réussis.
- `npm run check` : lint, TypeScript strict et 24 tests unitaires réussis.
- `npm run test:integration` : 125 tests réussis, dont 20 scénarios calendrier, sur des schémas PostgreSQL temporaires.
- `npm run test:e2e:db` : compilation de production et 13 tests navigateur réussis. Total : 162 tests, sans compter les vérifications de migration.
- Parcours calendrier réel : lieu, série hebdomadaire, exception déplacée, annulation, modification des occurrences suivantes, conflit de salle refusé sans écriture partielle, quatre vues et filtres.
- Téléchargement du flux ICS privé sans session, identifiants stables, annulation conservée et HTTP 404 après révocation confirmée. Le test attend la fin de la révocation avant cette vérification.
- Écrans FR/NL et calendrier rempli contrôlés avec axe ; largeur 320 px sans débordement. Capture `test-results/calendar.png` inspectée visuellement. Ces contrôles ne constituent pas une certification d’accessibilité.
- Serveur local accessible : `/fr/calendar` répond HTTP 200. Worker email redémarré avec transport local ; worker Documents indépendant conservé. Aucun envoi externe activé.

## Garanties vérifiées

Isolation entre clubs, coach limité à son équipe, accès des joueurs et représentants recalculé, révocation familiale et majorité prises en compte. Compte non vérifié autorisé ; MFA administrative conservée. Révocation du mandat, expiration du lien et désactivation du compte rendent le flux inaccessible.

Conflits simultanés de salle refusés, créneaux contigus acceptés, série refusée intégralement en cas de collision ou dépassement de saison. Capacité contrôlée lors des mutations. Heure inexistante refusée, heure répétée explicitement choisie, récurrence conservant l’heure locale malgré le changement saisonnier.

Création idempotente, version obsolète refusée, historique des corrections, exceptions et annulations préservées lors des changements de série. Modification collective du passé refusée ; correction individuelle tracée. Modification d’un lieu répercutée sur les événements futurs concernés.

Documents associés soumis à leurs propres droits ; une correction d’horaire conserve les associations protégées invisibles au planificateur. Notifications en attente annulées si le destinataire perd son accès. Flux ICS sans participants, consignes, matériel ou documents privés ; jetons stockés uniquement sous forme d’empreinte.

## Périmètre et limites

Les jeux de recette sont isolés dans des schémas ou bases temporaires supprimés après exécution. Aucun événement ou lieu fictif n’a été ajouté à Club pilote. Les références sous `sources/` restent inchangées.

Recette locale Chromium uniquement : pas de déploiement distant, de CI distante, de synchronisation Google/Outlook validée, de réservation externe ni de certification par lecteur d’écran. Un service cloud ne peut pas consulter une URL 127.0.0.1. Les limites de récurrence, volumes, capacité et révocation des copies déjà téléchargées sont détaillées dans [LOT-06.md](../lots/LOT-06.md).

Les présences, convocations, rencontres officielles, résultats et compétitions ne sont pas déclarés fonctionnels. Le lot 07 — Présences attend la validation explicite du lot 06.
