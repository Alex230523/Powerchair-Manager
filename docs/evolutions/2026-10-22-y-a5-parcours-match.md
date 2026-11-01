# A5 : un match, un parcours avant / jour J / après (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point A5. Un seul fil conducteur pour le jour de match, qui assemble les briques existantes (matchs et compositions, présences, déplacements, matériel, to-do, arbitres) sans les dupliquer.

## Décisions
- **Fiche de match** `/matches/[id]` en trois étapes, ouverte depuis la liste des matchs (le nom de l'adversaire) et depuis le tableau de bord de l'équipe (A6).
- **Avant**
  - **Invitation automatique** à la création d'un match : le rendez-vous du calendrier est créé avec l'invitation de l'équipe (réponse attendue la veille), comme pour les amicaux de la vague 17. Un match plus ancien s'invite d'un bouton.
  - **Composition** seulement parmi les joueurs qui ont répondu « présent ». **Bloquant** : licence non valide pour la saison, fauteuil en panne (le serveur refuse). **À vérifier** : documents à fournir, révision dépassée, pas de fauteuil attribué. Le contrôle de vitesse viendra avec B3.
  - **Publication** de la composition : joueurs et parents ne la voient qu'une fois publiée.
  - **Déplacement** relié (le voyage lié au rendez-vous du match) ou lien pour l'organiser.
  - **Checklist du jour** envoyée dans la to-do (A1) : fauteuils chargés, batteries, ballons, maillots, trousse de secours, transport, chacune avec un responsable et le jour du match comme échéance ; une ligne déjà envoyée ne l'est pas deux fois.
- **Jour J**, sur téléphone, gros boutons : but, but adverse, cartons, entrées et sorties, avec la minute ; le score suit en direct ; un appui se corrige. **Hors connexion**, chaque fait attend sur le téléphone (`src/lib/offline-queue.ts`, même outil que les présences) et part au retour du réseau ; chaque fait porte son propre identifiant, donc envoyé deux fois il n'est écrit qu'une fois. Les présences constatées se prennent dans l'écran d'appel existant.
- **Après** : **validation du résultat** (préremplie par les faits notés) ; les **statistiques** des joueurs suivent les buts et cartons ; **feuille de match PDF** (équipes, numéros, postes, classifications, staff, arbitres, score, faits du match) ; **brouillon d'annonce** préparé dans Communication (jamais envoyé seul) ; arbitres et **rapport de l'arbitre**. Un amical entre clubs garde la confirmation du score par l'autre club.
- **Une seule vue Matchs** : les matchs de tournoi de l'équipe y étaient déjà ; ils mènent maintenant à la fiche de leur tournoi.
- **Droits** : le coach pour son équipe, la présidence pour toutes ; joueurs et parents voient leur invitation, la composition publiée et le résultat. Un coach d'une autre équipe n'a pas accès.

## Code
- Migration `0071` : publication de la composition et validation du résultat sur `match`, table `match_live_event` (identifiant donné par le téléphone, unique).
- `src/domains/competitions/journey.ts` (vue, commandes, contrôles purs `eligibility` et `tally`), `match-sheet.ts` (PDF) ; routes `/api/matches/journey` et `/api/matches/journey/sheet`. La création d'un match crée son rendez-vous et son invitation (`matchEvent`, partagé avec les amicaux).
- Composants : `match-journey.tsx` et `match-journey-copy.ts` ; page `/[locale]/matches/[id]`. `offline-queue.ts` gagne la file du jour de match.

## Tests
- Unitaires (`tests/a5-journey.test.ts`) : joueur bloqué ou à vérifier, score en direct et cartons, identifiant obligatoire, PDF, textes.
- Intégration (`tests/integration/a5-match-journey.integration.ts`) : invitation à la création, joueur sans licence et fauteuil en panne signalés et refusés, seuls les présents alignés, publication, checklist sans doublon, score saisi deux fois (file hors connexion) écrit une fois, annulation d'un appui, validation et statistiques, brouillon d'annonce, PDF, coach d'une autre équipe sans accès, deux clubs.
- Bout en bout (`tests/e2e/match-journey.spec.ts`), 390 px : composition, but saisi hors connexion puis synchronisé, résultat validé, PDF ; axe à chaque étape.
