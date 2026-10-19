# Recette du lot 07 — 19 octobre 2026

## Résultats exécutés

- Migration additive 0012 appliquée au PostgreSQL local persistant. Deuxième passage sans duplication ; `npm run db:test` réussi. Aucune migration antérieure modifiée.
- `npm run check` : lint, TypeScript strict et 29 tests unitaires réussis.
- `npm run test:integration` : 142 tests réussis sur sept schémas PostgreSQL temporaires, dont 17 scénarios Présences.
- `npm run test:e2e:db` : compilation de production et 14 parcours navigateur réussis, incluant les modules antérieurs et les présences. Total distinct : 185 tests.
- Parcours Présences également rejoué avec `PFM_TEST_MFA_SUSPENDED=true npm run test:e2e:db -- attendance.spec.ts` : réussi. Cette répétition n’est pas comptée comme un test distinct supplémentaire.
- Compte déjà équipé de MFA : connexion avec demande de second facteur en politique stricte, puis connexion sans demande en politique suspendue. Dans ce second mode, administration des convocations et calendrier avec compte non équipé, et affichage des membres sans blocage MFA. Les mots de passe et secrets existants restent conservés.
- Contrôles axe ciblant WCAG 2.2 AA en FR/NL et sur registre rempli ; largeur 320 px sans débordement. Capture `test-results/attendance.png` inspectée visuellement après application des styles du design system. Cela ne constitue pas une certification d’accessibilité.
- Serveur local relancé, `/fr/attendance` répond HTTP 200. Workers email (transport local), documents et présences démarrés avec la politique temporaire. Aucun envoi externe activé.

## Garanties vérifiées

Réponse personnelle conservée après pointage différent ; adulte autonome sans MFA répondant uniquement pour lui-même ; deux représentants répondant successivement avec refus d’une version obsolète. Droits de lecture et d’édition familiaux distincts, révocation et majorité recalculées, relation déclarée insuffisante. Une ancienne autorité légale ne complète pas une délégation en lecture seule.

Isolation entre clubs, coach limité à son équipe, refus après révocation de mandat ou changement de contexte. Seuil supérieur au nombre de convoqués et échéance invalide refusés. Réponse tardive et pointage avant début refusés.

Clôture impossible avec une personne non pointée ; correction après clôture exigeant un motif et conservant auteur, date, ancienne et nouvelle valeur. Retrait d’une convocation conservant son ancienne déclaration et bloquant sa réponse ; reconvocation repartant sur « Sans réponse » avec historique antérieur. Événement annulé exclu des statistiques et des nouveaux pointages/réponses. Déplacement anticipé bloquant les réponses à la nouvelle heure de début.

Relances réservées aux non-répondants, limitation manuelle à une par heure, relance automatique et contrôle de seuil idempotents. Alerte de faible effectif réservée au personnel habilité. Éligibilité d’un email recalculée au moment de l’envoi : annulation après retrait d’accès familial. Les commentaires et listes de personnes ne figurent pas dans les emails.

La suspension MFA ne crée ni mandat ni habilitation sensible : un test spécifique confirme qu’un responsable sans autorisation `documents.sensitive` reste exclu d’une pièce sensible même lorsque MFA est suspendue. Remettre le réglage à false restaure l’exigence de MFA.

## Parcours navigateur

Création d’événement et de convocation, réponse du joueur, simulation d’une coupure réseau et vérification en base de l’absence d’écriture, reprise après reconnexion, pointage du responsable, clôture puis correction motivée. La réponse initiale et son commentaire restent inchangés. Assiduité recalculée à 100 % après correction en retard. Refus d’un pointage par le joueur et d’une écriture depuis une origine étrangère.

Les premiers essais ont révélé des libellés de menus trop longs pour être identifiés exactement ; les noms accessibles de réponse et de présence ont été explicités. Les sélecteurs de recette distinguent maintenant l’état du registre de son historique. Tous les résultats ci-dessus correspondent aux exécutions réussies après correction.

## Périmètre et limites

Données de recette confinées aux schémas/bases aléatoires supprimés après exécution. Aucun faux événement, joueur ou registre créé dans Club pilote. Références sous `sources/` inchangées.

Recette locale Chromium uniquement : préproduction distante, CI distante, délivrabilité externe, usage réel du club et lecteurs d’écran manuels restent non validés. Pas de pointage hors connexion : une erreur réseau doit être corrigée puis l’action rejouée explicitement. Fenêtre de 366 jours et 500 premiers événements, statistiques limitées aux données de cette fenêtre ; limites détaillées dans [LOT-07.md](../lots/LOT-07.md).

Le lot 08 — Cotisations n’est pas commencé et attend la validation explicite de ce lot 07. La politique MFA suspendue est une dérogation temporaire demandée pour le pilote.
