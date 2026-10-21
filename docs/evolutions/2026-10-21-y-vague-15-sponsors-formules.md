# Vague 15, observation C1 : sponsors, formules du club, conditions et calendrier (21 octobre 2026)

Migration `0033_sponsor_packages_tasks.sql` (ajouts et contraintes élargies seulement). La page Sponsors et philanthropie de la vague 11 est complétée sans rien perdre (champs, statuts, relances, contact lié, tuiles, droits Argent).

## Formules (onglet « Formules »)

- Chaque club définit ses formules : nom, montant, saison, description, places (vide : illimité), mise en avant (« notre conseil »), ordre, archivage. Chaque formule a ses conditions (« Logo sur les maillots », quantité « 3 publications », délai indicatif en jours après la signature), réordonnables avec les flèches haut et bas au clavier.
- Une carte par formule : nom en serif, montant, places restantes en `Badge`, conditions. Boutons « Nouvelle formule », « Modifier », « Dupliquer pour la saison suivante », « Archiver ».
- « Importer un exemple » crée, dans la langue de l'utilisateur, Supporter (700 €), Coéquipier (1 000 €, notre conseil) et Capitaine (2 000 €, deux places), modifiables ensuite.

## Partenaires (onglet « Partenaires »)

- Colonnes : partenaire (ouvre la fiche), personne de contact (lien vers le carnet), formule, montant, paiement (payé le, attendu le, en retard avec une icône d'alerte), conditions (« 4 sur 7 » avec une barre fine et le nombre en retard), prochaine date (la plus proche entre conditions, paiement, relance et étape prévue), statut. Cinquième tuile « Conditions en retard ».
- Fenêtre « Nouveau partenaire » : formule (le montant se remplit, modifiable pour une remise), date de signature, paiement prévu, payé le, relance pour l'année suivante (proposée 60 jours avant la fin de la saison), personne de contact choisie dans le carnet ou créée dans la même fenêtre (droit du carnet requis).
- Choisir une formule crée une tâche par condition, datée signature + délai. Changer de formule retire les conditions non faites de l'ancienne, ajoute celles de la nouvelle et garde les faites ; une nouvelle date de signature déplace les conditions ouvertes. Une formule complète refuse un partenaire de plus (un partenaire terminé libère sa place).
- Paiement reçu : la case « Écrire le paiement dans le grand livre » crée une seule fois la recette (catégorie sponsors) et la relie au partenaire.

## Fiche partenaire (panneau latéral)

Coordonnées et contact, formule et montant, paiement, signature et relance ; conditions et tâches libres (case à cocher, date, responsable choisi parmi les personnes du club qui ont un compte, preuve par lien ou par fichier PDF ou image de 5 Mo au plus, stocké comme les justificatifs du grand livre) ; historique (journal des changements, dont les formules précédentes avec les conditions livrées).

Boutons « Générer la convention » et « Préparer le bilan ».

- **Convention** (`/funding/partners/[id]/agreement`) : identité du club (nom, adresse, numéro d'entreprise, signataire, logo), partenaire et contact, formule et saison, conditions, montant, virement sur l'IBAN du club avec une communication, deux cadres de signature, mention « pas une facture ». Imprimée ou enregistrée en PDF depuis le navigateur. L'IBAN se saisit désormais dans Réglages, Club (contrôle modulo 97). Limite : la signature électronique du module Documents n'est pas branchée ici (elle suppose un signataire avec un compte) ; la convention se signe sur papier ou en PDF.
- **Bilan** (`/partner-report/[token]`, sans compte) : conditions livrées et en cours, avec leurs preuves, jamais de montant. Le lien se retire d'un clic et cesse alors de fonctionner.

## Tâches, calendrier, accueil, rappels

- Une seule table `funding_task` sert les sponsors et, au prompt C2, les subsides.
- Page « Tâches des sponsors et subsides » (`/tasks`) : toutes les tâches pour les personnes qui ont le droit Argent, ses propres tâches pour un responsable sans ce droit, qui peut les cocher (et seulement celles-là) et y joindre une preuve.
- Calendrier : case « Échéances » dans la barre de filtres (proposée avec le droit Argent ou au responsable d'une tâche ouverte). Elle affiche en capsules de journée chaque condition datée, le paiement attendu, la relance et les dates des subsides (icône poignée de main ou bâtiment, le type écrit pour les lecteurs d'écran), avec un lien vers la fiche. Ces échéances sont calculées à chaque fois depuis les dossiers, jamais copiées dans `calendar_event`. Le lien d'abonnement privé (ICS) peut les inclure (case à la création, gardée seulement tant que la personne a le droit Argent).
- Accueil : tâche « Conditions de sponsor à livrer » (dans les 14 jours ou en retard : toutes pour le président, les siennes pour un responsable), et les dates dans « Prochains événements ».
- Notification (email et application, modèle `funding_task` modifiable) au responsable 7 jours avant l'échéance d'une tâche, et au président le jour de la relance d'un partenaire ; une seule fois par tâche ou par relance (worker des présences).
- Levée de fonds : un mouvement « sponsor » d'une cagnotte propose « Suivre comme partenaire » (fiche préremplie avec le joueur apporteur et la cagnotte dans les notes).

## Droits

Lecture des formules, partenaires et tâches : droit Argent en lecture ; modification : droit Argent en gestion. Un responsable de tâche sans droit Argent voit et coche ses tâches seulement, sans aucun montant. Toutes les requêtes filtrent par organisation ; une formule, un partenaire, une tâche ou une personne d'un autre club est refusée.

## Tests

- Unitaires (`tests/wave15-sponsors.test.ts`) : dates des conditions, paiement, relance proposée, exemple identique en trois langues, IBAN, textes fr/nl/en sans tiret long, modèle de rappel déclaré.
- Intégration (`tests/integration/wave15-sponsors.integration.ts`, deux clubs) : exemple importé, formule d'un autre club refusée, places limitées, conditions copiées à l'attribution, conditions faites gardées au changement de formule, dates déplacées avec la signature, responsable qui coche sa tâche seulement, personne sans compte refusée, échéances du président et du responsable, autre club vide, tâche de l'accueil, paiement écrit une fois, bilan public sans montant et retiré, preuve refusée à un autre club, rappel envoyé une seule fois.
- Bout en bout (`tests/e2e/sponsors.spec.ts`) : formule avec trois conditions, partenaire, condition cochée dans la fiche, couche « Échéances » du calendrier, accueil, page des tâches, convention, 390 px, axe à chaque étape.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
