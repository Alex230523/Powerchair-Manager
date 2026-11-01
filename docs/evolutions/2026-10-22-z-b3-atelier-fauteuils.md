# B3 : l'atelier des fauteuils (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B3. Le matériel (vague 17) savait déjà où est chaque fauteuil et quand le réviser ; l'atelier garde maintenant la vie de chaque fauteuil et s'assure qu'il y a un fauteuil utilisable pour chaque joueur attendu.

## Décisions
- **Carnet d'interventions** par fauteuil : révision, panne, réparation, batterie, réglage, contrôle de vitesse. Pour chacune : date, diagnostic, pièces, fournisseur (le carnet de contacts, A4), coût, jours d'immobilisation, facture. La facture est une **dépense des finances, reliée une seule fois** (jamais recopiée) ; son montant est repris quand le coût est vide. Une erreur s'annule avec une raison, rien n'est effacé.
- **États** : « En réparation » et deux nouveaux, **« Hors service »** (panne signalée, en attente de contrôle) et **« Prêté »**. Une panne enregistrée met le fauteuil en réparation ; une réparation cochée « de nouveau utilisable » le remet en service et clôt les signalements ouverts.
- **Garantie et financement** : garantie jusqu'au, valeur d'achat, subside, sponsor ou cagnotte qui l'a payé. **Coût du fauteuil** (achat plus entretien, par type) et **jours hors service**, avec un **rapport** en tableur ou en PDF pour un dossier de subside.
- **Batteries et chargeurs** suivis un par un (désignation, numéro de série, mise en service). Une batterie **remplacée** est retirée à la date dite, la nouvelle prend sa place, et le remplacement entre au carnet.
- **Vitesse** : chaque contrôle note la vitesse mesurée et qui l'a contrôlée. La **règle du club** (10 km/h par défaut, à refaire tous les 180 jours, réglable dans l'onglet Atelier) donne l'état : contrôlée, jamais contrôlée, contrôle trop ancien, au dessus de la limite. Le parcours de match (A5) le signale « à vérifier » pour chaque joueur.
- **Fauteuils pour les événements** des 14 prochains jours : pour chaque événement d'équipe, les joueurs attendus (invités, pas « absent ») avec leur fauteuil ou celui réservé, ceux qui n'en ont pas d'utilisable, et les fauteuils du club libres ce jour-là (ni attribués, ni réservés, ni prêtés). **Une réservation par fauteuil et par joueur** pour un événement : le second qui demande le même fauteuil est prévenu, jamais déplacé en silence.
- **Signaler une panne** depuis la fiche du fauteuil, sur téléphone, avec une photo facultative (JPEG, PNG ou WebP, 1 Mo, vérifiée par ses premiers octets) : par le joueur, son parent, son coach ou les responsables. Le fauteuil passe **hors service tout de suite**, ses réservations à venir sont libérées, une tâche est créée et la présidence et les responsables du matériel sont prévenus (application et e-mail).
- **À surveiller** : révision dépassée, garantie qui se termine dans les 30 jours, contrôle de vitesse, prêt entre clubs non rendu, fourniture périmée, panne signalée.
- **Droits** : les responsables du matériel (présidence, `equipment.manage`) pour tout ; un coach voit et réserve pour les événements de ses équipes ; celui qui voit un fauteuil peut signaler sa panne. Rien n'est visible d'un autre club.

## Code
- Migration `0072` : garantie, sponsor et cagnotte sur `equipment_chair`, états `out_of_service` et `lent` ; règle de vitesse sur `organization` ; tables `chair_intervention`, `chair_component`, `chair_booking`, `chair_report`.
- `src/domains/equipment/workshop.ts` (vue, commandes, fonctions pures `speedState`, `usable`, `ownership`, rapport) et `chair-report.ts` (tableur et PDF) ; routes `/api/equipment/workshop` et `/api/equipment/workshop/report`.
- Composants : `workshop.tsx` et `workshop-copy.ts` ; onglet « Atelier » de la page Matériel et de la fiche d'un fauteuil, bouton « Signaler une panne » sur la fiche.
- A5 et A6 comptent « Hors service » comme une panne ; A5 ajoute le contrôle de vitesse.

## Limites connues
- Les prêts entre clubs gardent leur fonctionnement : ils ne passent pas encore le fauteuil à l'état « Prêté » (l'état existe et se choisit à la main).
- La photo d'une panne est gardée dans la base (1 Mo au plus) ; elle n'est pas encore affichée dans la fiche, seule sa présence l'est.

## Tests
- Unitaires (`tests/b3-workshop.test.ts`) : état de la vitesse, fauteuil utilisable, coût sans lignes annulées, commandes refusées, rapport PDF et tableur, textes dans les trois langues.
- Intégration (`tests/integration/b3-workshop.integration.ts`) : panne signalée la veille d'un match par un parent (hors service, tâche, présidence prévenue, joueur sans fauteuil), même fauteuil demandé pour deux joueurs, réservation libérée par une panne, batterie remplacée, fauteuil subsidié avec sa facture de réparation et son rapport, contrôle de vitesse et règle du club, prêt non rendu, coach limité à son équipe, deux clubs.
- Bout en bout (`tests/e2e/workshop.spec.ts`), 390 px : un fauteuil du club réservé pour un joueur, une panne signalée, la réparation, le rapport PDF ; axe à chaque étape.
