# B5 : incidents, blessures et déclaration d'assurance (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B5. Chutes lors des transferts, collisions, malaises : le club les consigne tout de suite, prévient la famille d'un mineur et suit la déclaration à l'assureur dans les délais. Nouvelle page **Incidents** (menu Club pour la présidence et les responsables des personnes, Gestion pour les coachs).

## Décisions
- **Déclaration rapide sur téléphone** : date et heure, contexte (entraînement, match, déplacement, autre) et rendez-vous lié, personnes concernées, type (chute, collision, blessure, malaise, dommage au fauteuil ou au matériel), lieu, circonstances, témoins, fauteuil endommagé, premiers soins, photos (trois au plus).
- **Les faits et la santé séparés** : blessures, premiers soins, suite et photos sont scellés à part et ne se lisent qu'avec `people.sensitive` ou `documents.sensitive` ; chaque ouverture est inscrite au journal des accès sensibles (Confidentialité). Le déclarant peut écrire la partie santé sans pouvoir la relire ensuite. Les photos sont traitées comme des données de santé, par prudence.
- **Consignes de soin** : en choisissant les personnes, le déclarant voit leurs consignes de soin existantes (lecture journalisée).
- **Qui voit quoi** : la présidence et `people.manage` voient tout et suivent l'assurance ; un coach déclare pour les joueurs de ses équipes et voit les faits des incidents de ses joueurs ; la personne concernée et ses parents voient les faits qui la concernent ; personne d'un autre club.
- **Mineur concerné** : ses parents (représentants en cours, avec le droit de consulter) sont prévenus tout de suite, par e-mail, dans l'application et sur le téléphone (B4), sans aucun détail de santé.
- **Assurance** : assureur, numéro de police, adresse de déclaration et délai (8 jours par défaut) dans l'onglet Réglages ; échéance calculée pour chaque incident ; statuts à déclarer, envoyé, accepté, refusé, remboursé, pas de déclaration ; référence du dossier, montants, pièces (PDF ou image) ; **formulaire prérempli en PDF** (la partie santé seulement si celui qui l'imprime y a droit) ; **rappel** aux responsables deux jours avant l'échéance, une seule fois.
- **Dommage au fauteuil** : une intervention « panne » entre dans le carnet du fauteuil (B3), le fauteuil passe en réparation et ses réservations à venir sont libérées.
- **Trousse de secours** : les articles « premiers secours » périmés ou qui périment dans les 30 jours sont listés, et rappelés aux responsables du matériel 14 jours avant.
- **Statistiques anonymes** sur douze mois : par type, contexte et mois, nombre d'incidents avec un mineur ; jamais par personne.
- **Conservation** : la partie santé et les photos sont effacées après 5 ans, l'incident après 10 ans (tâche de fond « documents »).

## Code
- Migration `0074` : réglages d'assurance sur `organization`, tables `incident`, `incident_person`, `incident_file`, deux nouveaux types au journal des accès sensibles.
- `src/domains/incidents/service.ts` (vue, déclaration, santé, assurance, pièces, PDF, rappels, conservation, règles pures `deadlineOf`, `insuranceState`, `incidentStats`) ; routes `/api/incidents`, `/api/incidents/care`, `/api/incidents/file`, `/api/incidents/pdf`.
- Composants `incidents.tsx` et `incidents-copy.ts` ; page `/[locale]/incidents` ; entrée de menu.
- Tâches de fond : `reminders` lance `incidentTick`, `documents` lance `incidentPurge`.

## Limites connues
- Les faits se corrigent par la commande prévue côté serveur, sans écran dédié pour l'instant ; la partie santé se complète depuis la fiche de l'incident.

## Tests
- Unitaires (`tests/b5-incidents.test.ts`) : échéance, état de la déclaration, statistiques sans personne (et sans données), fichiers, santé à part, textes.
- Intégration (`tests/integration/b5-incidents.integration.ts`) : incident sur un mineur déclaré par son coach (parents prévenus, fauteuil relié au carnet, consignes de soin), coach sans droit sensible qui voit le fait mais pas la santé, parent qui voit les faits de son enfant, coach d'une autre équipe qui ne voit rien, délai de déclaration dépassé et rappel unique, pièces et PDF, trousse de secours, réglages, deux clubs, conservation.
- Bout en bout (`tests/e2e/incidents.spec.ts`), 390 px : déclaration, assurance, PDF, statistiques ; axe à chaque étape.
