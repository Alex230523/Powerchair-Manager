# B9 : événements ouverts, inscription publique, liste d'attente, rappels et avis (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B9. Journées découverte, stages, soupers et tournois accueillent des personnes sans compte. Nouvelle page **Événements ouverts** (menu Activités), qui ouvre au public un rendez-vous du calendrier existant. Coût nul : pas de SMS, pas de paiement en ligne.

## Décisions
- **Un rendez-vous du calendrier, ouvert au public** : on choisit un rendez-vous à venir (et, pour une série, toutes ses dates suivantes, chacune avec la même fenêtre par rapport à son début). Chaque ouverture a son **lien d'inscription** propre.
- **Inscription par lien, sans compte** : nom, e-mail, téléphone facultatif, **besoins d'accessibilité** (fauteuil, aidant, transport adapté, régime), les **questions de l'événement** (une par ligne : « ? » pour oui ou non, « * » pour obligatoire), et **deux consentements séparés** : l'usage des données (obligatoire) et le droit à l'image (facultatif). Un champ invisible écarte les robots.
- **Places et fenêtre** : nombre de places (ou sans limite), dates d'ouverture et de fermeture des inscriptions ; hors de la fenêtre, l'inscription est refusée.
- **Liste d'attente** : complet, la personne attend ; une place libérée (désistement, retrait par le club, places ajoutées) est **proposée au suivant** pour un délai réglable (48 heures par défaut) ; sans confirmation à temps, elle passe au suivant. Personne ne passe devant la liste.
- **Lien personnel** de chaque inscrit (gardé haché pour le retrouver, scellé pour les e-mails) : statut, confirmation d'une place proposée, désinscription avant le début, paiement, code d'entrée, avis.
- **Participation payante facultative** : réglée par **virement avec QR et communication structurée** (B1) ; le **rapprochement bancaire la marque payée** tout seul, ou le club la marque à la main.
- **Jour J** : chaque inscrit a un **QR code** ; scanné avec l'appareil photo d'un téléphone du club, il ouvre la page de pointage et le marque présent. Pointage aussi depuis la liste. Les présents sont comptés sur la fiche de l'événement.
- **Rappels** 7 jours et 1 jour avant, puis **questionnaire d'avis** (note sur 5 et questions libres) après l'événement ; résultats agrégés et anonymes. Ces e-mails passent par la file des e-mails et son **plafond quotidien** (B2).
- **Export Excel** des inscrits (besoins, consentements, paiement, présence, réponses), **e-mail groupé**, **annulation** qui prévient tous les inscrits et la liste d'attente.
- **To-do** : une tâche « Organiser : … » dans la catégorie Événements, la veille de chaque date.
- **Droits** : la présidence et `calendar.manage`. Rien n'est visible d'un autre club, et une communication structurée d'un club ne paie rien dans un autre.

## Code
- Migration `0075` : `open_event`, `open_registration`, `open_feedback` ; ressource `open_event` pour la file des e-mails ; cible `event` du rapprochement bancaire.
- `src/domains/open-events/service.ts` (côté club, côté public, liste d'attente `promote`, tâche de fond `openEventTick`, export ; règles pures `windowState`, `freePlaces`, `answersComplete`, `keepAnswers`) et `questions.ts`.
- Routes `/api/open-events`, `/api/open-events/export`, `/api/open-events/public` ; pages `/[locale]/events`, `/[locale]/events/checkin/[code]` et, publique, `/[locale]/evenement/[token]`.
- Rapprochement (B1) : `byReference` reconnaît aussi la communication d'une inscription ; l'annulation d'une affectation rend le montant.
- Tâche de fond `attendance` (toutes les 5 minutes) : offres expirées, rappels, avis.

## Limites connues
- Les rappels et l'avis passent par la file des e-mails et son plafond, mais pas par l'écran des automatisations (B7) : ses règles s'adressent à des comptes, les inscrits n'en ont pas. Ils se coupent par événement.
- Les présences des événements ouverts sont comptées sur leur fiche, pas encore dans la page Statistiques (qui suit les invitations des membres).
- Le QR de pointage ouvre la page en français ; elle reste lisible dans la langue du compte.

## Tests
- Unitaires (`tests/b9-open-events.test.ts`) : fenêtre, places libres, questions et réponses, consentement obligatoire et robots, textes.
- Intégration (`tests/integration/b9-open-events.integration.ts`) : événement complet puis désistement qui promeut la liste d'attente, offre expirée, inscription hors fenêtre refusée, inscription payante marquée payée après rapprochement, participant sans consentement image, pointage par code, rappels, avis et résultats, annulation qui prévient, tâche, deux clubs.
- Bout en bout (`tests/e2e/open-events.spec.ts`), 390 px : ouverture, inscription sans compte par le lien, pointage ; axe à chaque étape.
