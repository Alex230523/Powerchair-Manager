# Recrutement de nouveaux joueurs (02/11/2026)

Point H1 de l'avis. Page « Recrutement » (`/recrutement`), reliée au carnet de contacts (A4), à la to-do, aux personnes (point 8) et au matériel. Migration `0104_recruitment.sql`.

## Prospects et étapes

- Prospect : prénom, nom (pour un mineur, le nom et le contact du parent sont exigés), âge approximatif, provenance (centre de revalidation, école d'enseignement spécialisé, association, salon ou démonstration, réseaux sociaux, bouche-à-oreille, autre), organisation d'origine (contact du CRM), fauteuil personnel, transport, besoins pratiques, consentement à être recontacté. Aucune donnée de santé.
- Étapes : premier contact, essai planifié, essai fait, à relancer, inscrit, pas pour maintenant ; chaque passage est daté. Vue tableau (une colonne par étape, chaque carte change d'étape par sa liste, donc au clavier) ou vue liste.

## Séance d'essai et inscription

- Un entraînement existant ou une nouvelle séance ; un fauteuil du club libre ce jour-là est proposé et réservé dans le module matériel (`chair_booking` accepte un prospect) ; l'invitation part au prospect adulte ou au parent avec l'heure, le lieu, ce qu'il faut apporter et le guide « Questions des parents ».
- « Inscrire » crée le joueur et son parent (représentant légal, point 8) à partir du prospect, sans ressaisie, et garde sa provenance (`club_person.recruitment_source`).

## Automatismes, partenaires, indicateurs, RGPD

- Tâche « Rappeler » 3 jours après l'essai fait, « Relancer » après 30 jours sans nouvelle (une fois par silence).
- Partenaires (organisations de type centre, école, association) : compteur de prospects et d'inscrits, rappel annuel « Présenter le club » dans la to-do.
- Indicateurs par provenance : prospects, passage à l'essai, inscription, joueurs encore là après une saison ; la provenance des nouveaux joueurs apparaît dans le rapport d'impact (H13).
- Prospects jamais inscrits supprimés après 24 mois sans contact (durée réglable) ; seul un comptage anonyme reste (`recruitment_tally`).
- Droit nouveau `recruitment.manage` : la présidence, le rôle « Secrétaire » et un nouveau rôle proposé « Recrutement » ; un coach sans ce droit ne voit rien.

## Vérification

- `npx vitest run tests/recruitment.test.ts`
- `npm run test:integration` (`tests/integration/recruitment.integration.ts`) : prospect mineur avec contact parent, essai avec fauteuil réservé, inscription sans ressaisie, relances uniques, indicateurs par provenance, purge après le délai, coach sans droit, deux clubs. Tests des rôles proposés passés à huit rôles.
- `tests/e2e/recruitment.spec.ts` à 390 px avec axe.
